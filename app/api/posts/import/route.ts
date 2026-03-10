import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { parseExcelBuffer, parseCSVBuffer, type ImportRow } from "@/lib/utils/import";
import { ValidationError } from "@/lib/errors";
import type { Platform, PostType } from "@prisma/client";

const BATCH_SIZE = 500;

// POST /api/posts/import
export const POST = apiHandler(
  async (req, session) => {
    const orgId = session!.user.organizationId;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const platformFilter = formData.get("platform") as string | null;

    if (!file) {
      throw new ValidationError("File is required");
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse file
    let rows: ImportRow[];
    let parseErrors: { row: number; column: string; error: string }[];

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const result = parseExcelBuffer(buffer);
      rows = result.rows;
      parseErrors = result.errors;
    } else if (fileName.endsWith(".csv")) {
      const result = await parseCSVBuffer(buffer);
      rows = result.rows;
      parseErrors = result.errors;
    } else {
      throw new ValidationError("File must be .csv, .xlsx, or .xls");
    }

    // Filter by platform if specified
    if (platformFilter) {
      rows = rows.filter((r) => r.platform === platformFilter);
    }

    // Create DataImport record
    const dataImport = await prisma.dataImport.create({
      data: {
        organizationId: orgId,
        fileName: file.name,
        fileSize: BigInt(buffer.length),
        platform: platformFilter as Platform | null,
        status: "processing",
        rowsAttempted: rows.length,
        createdById: session!.user.id,
      },
    });

    // Get social accounts for mapping
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, platform: true },
    });

    const accountByPlatform = new Map<string, string>();
    for (const a of accounts) {
      if (!accountByPlatform.has(a.platform)) {
        accountByPlatform.set(a.platform, a.id);
      }
    }

    let rowsSuccessful = 0;
    const importErrors = [...parseErrors];

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        const accountId = accountByPlatform.get(row.platform);
        if (!accountId) {
          importErrors.push({
            row: i + rows.indexOf(row) + 2,
            column: "Platform",
            error: `No ${row.platform} account configured. Add one in Account Management first.`,
          });
          continue;
        }

        try {
          // Upsert post
          const post = await prisma.post.upsert({
            where: {
              socialAccountId_postId: {
                socialAccountId: accountId,
                postId: row.postId,
              },
            },
            create: {
              socialAccountId: accountId,
              platform: row.platform as Platform,
              postId: row.postId,
              postType: row.postType as PostType,
              title: row.title,
              contentUrl: `https://${row.platform}.com/${row.postId}`,
              publishedAt: new Date(row.publishedDate),
            },
            update: {
              title: row.title,
              postType: row.postType as PostType,
            },
          });

          // Upsert metrics
          const metricDate = new Date(row.publishedDate);
          const metricsToUpsert = [
            { type: "views", value: row.views },
            { type: "likes", value: row.likes },
            { type: "comments", value: row.comments },
            { type: "shares", value: row.shares },
          ];

          for (const m of metricsToUpsert) {
            await prisma.postMetric.upsert({
              where: {
                postId_metricType_metricDate: {
                  postId: post.id,
                  metricType: m.type as import("@prisma/client").MetricType,
                  metricDate,
                },
              },
              create: {
                postId: post.id,
                socialAccountId: accountId,
                platform: row.platform as Platform,
                metricType: m.type as import("@prisma/client").MetricType,
                metricDate,
                metricValue: BigInt(m.value),
              },
              update: {
                metricValue: BigInt(m.value),
              },
            });
          }

          rowsSuccessful++;
        } catch (err) {
          importErrors.push({
            row: i + rows.indexOf(row) + 2,
            column: "",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    // Update DataImport record
    const finalStatus = rowsSuccessful === rows.length ? "success" : rowsSuccessful > 0 ? "partial" : "failed";
    await prisma.dataImport.update({
      where: { id: dataImport.id },
      data: {
        status: finalStatus,
        rowsSuccessful,
        errorDetails: importErrors.length > 0 ? JSON.stringify(importErrors.slice(0, 100)) : null,
      },
    });

    return NextResponse.json({
      data: {
        importId: dataImport.id,
        rowsAttempted: rows.length,
        rowsSuccessful,
        errors: importErrors.slice(0, 50), // Limit returned errors
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);
