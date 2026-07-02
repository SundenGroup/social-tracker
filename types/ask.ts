/**
 * "Ask" answer block protocol — shared between the API route (which
 * hydrates blocks from the DB) and the client renderer.
 *
 * The model never supplies the numbers users see in posts blocks: it
 * returns post IDs, and the server re-fetches them WITH scope checks
 * and latest metrics. Text/kpi/table blocks carry model-formatted
 * values copied from tool results.
 */

export interface AskTextBlock {
  type: "text";
  text: string;
}

export interface AskNoteBlock {
  type: "note";
  text: string;
}

export interface AskKpiBlock {
  type: "kpi";
  items: Array<{ label: string; value: string; sub?: string }>;
}

export interface AskTableBlock {
  type: "table";
  title?: string;
  columns: string[];
  rows: string[][];
}

/** As emitted by the model (IDs only). */
export interface AskPostsBlockSpec {
  type: "posts";
  title?: string;
  post_ids: string[];
  display?: "table" | "cards";
}

/** As delivered to the client (server-hydrated rows). */
export interface AskHydratedPost {
  id: string;
  platform: string;
  postType: string;
  title: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

export interface AskPostsBlock {
  type: "posts";
  title?: string;
  display: "table" | "cards";
  posts: AskHydratedPost[];
}

export type AskBlockSpec = AskTextBlock | AskNoteBlock | AskKpiBlock | AskTableBlock | AskPostsBlockSpec;
export type AskBlock = AskTextBlock | AskNoteBlock | AskKpiBlock | AskTableBlock | AskPostsBlock;

/** Model output (validated with zod server-side). */
export interface AskAnswerSpec {
  blocks: AskBlockSpec[];
  suggestions?: string[];
  period_label?: string;
}

/** Final hydrated answer returned to the client. */
export interface AskAnswer {
  blocks: AskBlock[];
  suggestions: string[];
  meta: {
    scope: string;
    periodLabel?: string;
    mode: "live" | "mock";
    model?: string;
  };
}
