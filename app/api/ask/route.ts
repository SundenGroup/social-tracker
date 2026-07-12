import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { buildAskContext, type AskContext } from "@/lib/ask/context";
import { ASK_TOOLS, executeAskTool, validateAnswerSpec, hydrateAnswer } from "@/lib/ask/tools";
import { ASK_SYSTEM_STABLE, buildAskDynamicBlock } from "@/lib/ask/prompt";
import { runMockAsk } from "@/lib/ask/mock";
import type { AskAnswer, AskAnswerSpec } from "@/types/ask";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 6;
const MAX_QUESTION_CHARS = 2000;
const RATE_PER_MINUTE = 5;
const RATE_PER_DAY = 50;

// POST /api/ask — natural-language question → structured, DB-hydrated answer
export const POST = apiHandler(
  async (req, session) => {
    const started = Date.now();
    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const profileId = typeof body.profileId === "string" ? body.profileId : null;
    // Follow-up memory: the client replays its recent exchanges
    // (question + the model's own validated answer spec). Each spec is
    // re-validated — we never replay arbitrary client JSON to the model.
    const history: Array<{ question: string; spec: AskAnswerSpec }> = [];
    if (Array.isArray(body.history)) {
      for (const h of body.history.slice(-4)) {
        if (typeof h?.question !== "string" || h.question.length > MAX_QUESTION_CHARS) continue;
        const v = validateAnswerSpec(h.spec);
        if (v.ok) history.push({ question: h.question.trim(), spec: v.spec });
      }
    }

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json({ error: `Question too long (max ${MAX_QUESTION_CHARS} characters)` }, { status: 400 });
    }

    // Rate limits — DB-backed so they hold across PM2 processes; the
    // rows double as the usage/audit log.
    const userId = session!.user.id;
    const orgId = session!.user.organizationId;
    const now = Date.now();
    const [lastMinute, lastDay] = await Promise.all([
      prisma.askRequest.count({ where: { userId, createdAt: { gte: new Date(now - 60_000) } } }),
      prisma.askRequest.count({ where: { userId, createdAt: { gte: new Date(now - 86_400_000) } } }),
    ]);
    if (lastMinute >= RATE_PER_MINUTE || lastDay >= RATE_PER_DAY) {
      await prisma.askRequest.create({
        data: { userId, organizationId: orgId, question, mode: "live", status: "rate_limited" },
      });
      return NextResponse.json(
        { error: lastDay >= RATE_PER_DAY ? "Daily Ask limit reached (50/day)" : "Slow down — max 5 questions per minute" },
        { status: 429 }
      );
    }

    const ctx = await buildAskContext(session!, profileId);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const mockMode = !apiKey || process.env.ASK_MOCK === "1";

    const log = {
      mode: mockMode ? "mock" : "live",
      model: mockMode ? null : process.env.ASK_MODEL || DEFAULT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      status: "ok",
    };

    try {
      let spec: AskAnswerSpec;
      if (mockMode) {
        spec = await runMockAsk(ctx, question);
      } else {
        const live = await runLiveAsk(ctx, question, history, log);
        spec = live;
      }

      const blocks = await hydrateAnswer(ctx, spec);
      const answer: AskAnswer = {
        blocks,
        suggestions: spec.suggestions ?? [],
        meta: {
          scope: ctx.scopeLabel,
          periodLabel: spec.period_label,
          mode: mockMode ? "mock" : "live",
          model: log.model ?? undefined,
        },
      };
      // `spec` goes back to the client so it can be replayed as
      // follow-up context (IDs only — the hydrated data stays server-made).
      return NextResponse.json({ data: { answer, spec } });
    } catch (err) {
      log.status = "error";
      console.error("[Ask] Failed:", err);
      if (err instanceof Anthropic.APIError) {
        // Never leak provider details to the client
        return NextResponse.json({ error: "The AI service is unavailable right now — try again shortly." }, { status: 502 });
      }
      throw err;
    } finally {
      await prisma.askRequest
        .create({
          data: {
            userId,
            organizationId: orgId,
            question,
            mode: log.mode,
            model: log.model,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            toolCalls: log.toolCalls,
            durationMs: Date.now() - started,
            status: log.status,
          },
        })
        .catch((e) => console.error("[Ask] Failed to log request:", e));
    }
  },
  { requireAuth: true }
);

/** Manual tool-use loop against the Anthropic API. */
async function runLiveAsk(
  ctx: AskContext,
  question: string,
  history: Array<{ question: string; spec: AskAnswerSpec }>,
  log: { model: string | null; inputTokens: number; outputTokens: number; toolCalls: number; status: string }
): Promise<AskAnswerSpec> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = log.model ?? DEFAULT_MODEL;
  // `effort` is supported on Sonnet 5 / Opus tiers but errors on Haiku 4.5.
  const supportsEffort = /sonnet-5|opus/.test(model);

  // Replay prior exchanges so follow-ups ("and for TikTok only?",
  // "same but June") resolve against what was already answered. The
  // assistant side is the compact validated spec, not hydrated data.
  const messages: Anthropic.MessageParam[] = [];
  for (const h of history) {
    messages.push({ role: "user", content: h.question });
    messages.push({
      role: "assistant",
      content: `[I answered via render_answer with:]\n${JSON.stringify(h.spec)}`,
    });
  }
  messages.push({ role: "user", content: question });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      // Generous: on Sonnet 5 adaptive thinking is ON when `thinking`
      // is omitted and shares this budget with the render_answer JSON
      // (tables/kpis can be 1-2K tokens) — a tight cap truncates the
      // final tool call and the user gets a non-answer.
      max_tokens: 8000,
      ...(supportsEffort ? { output_config: { effort: "medium" as const } } : {}),
      system: [
        // Stable block first with the cache breakpoint — tools render
        // before system, so this caches tool defs + instructions.
        { type: "text", text: ASK_SYSTEM_STABLE, cache_control: { type: "ephemeral" } },
        // Volatile per-request context AFTER the breakpoint.
        { type: "text", text: buildAskDynamicBlock(ctx) },
      ],
      tools: ASK_TOOLS as Anthropic.Messages.ToolUnion[],
      messages,
    });

    log.inputTokens +=
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);
    log.outputTokens += response.usage.output_tokens;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // Terminal path: the model rendered its answer.
    const renderCall = toolUses.find((t) => t.name === "render_answer");
    if (renderCall) {
      const validated = validateAnswerSpec(renderCall.input);
      if (validated.ok) return validated.spec;
      // Invalid spec → send the validation error back so the model retries.
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: renderCall.id,
            content: `Invalid answer spec — fix and call render_answer again: ${validated.error}`,
            is_error: true,
          },
          // Answer any sibling tool calls in the same turn.
          ...(await executeSiblingTools(ctx, toolUses.filter((t) => t.id !== renderCall.id), log)),
        ],
      });
      continue;
    }

    // Continue whenever there are COMPLETE tool calls to answer — even
    // if the turn stopped at max_tokens after them, abandoning finished
    // queries would waste the work and break the loop.
    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: await executeSiblingTools(ctx, toolUses, log) });
      continue;
    }

    if (response.stop_reason === "max_tokens") {
      // Truncated with no usable tool call — be honest, don't present
      // a cut-off preamble as the answer.
      log.status = "truncated";
      return {
        blocks: [
          { type: "text", text: "That answer got too large to assemble — try narrowing the question (shorter period, one platform, or a smaller top-N)." },
        ],
        suggestions: [],
      };
    }

    if (response.stop_reason === "refusal") {
      return {
        blocks: [{ type: "text", text: "I can't help with that question — ask me about your social-media performance data instead." }],
        suggestions: [],
      };
    }

    // Model answered in plain text (shouldn't happen, but degrade gracefully).
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      blocks: [{ type: "text", text: text || "I couldn't produce an answer for that — try rephrasing." }],
      suggestions: [],
    };
  }

  return {
    blocks: [
      { type: "text", text: "That question needed more steps than I'm allowed — try narrowing it (shorter period, one platform, or one profile)." },
    ],
    suggestions: [],
  };
}

async function executeSiblingTools(
  ctx: AskContext,
  toolUses: Anthropic.ToolUseBlock[],
  log: { toolCalls: number }
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const tool of toolUses) {
    log.toolCalls += 1;
    const { result, error } = await executeAskTool(ctx, tool.name, (tool.input ?? {}) as Record<string, unknown>);
    results.push({
      type: "tool_result",
      tool_use_id: tool.id,
      content: error ?? JSON.stringify(result),
      is_error: Boolean(error),
    });
  }
  return results;
}
