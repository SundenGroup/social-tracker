import { prisma } from "@/lib/db";
import type {
  SocialAccount,
  Platform,
  PostType,
  MetricType,
  SyncType,
  SyncStatus,
} from "@prisma/client";

export interface PostData {
  postId: string;
  platform: Platform;
  postType: PostType;
  title: string | null;
  description: string | null;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
}

export interface MetricData {
  postId: string;
  metricType: MetricType;
  metricDate: Date;
  metricValue: bigint;
}

export interface AccountStats {
  followers: number;
  following?: number;
  totalPosts?: number;
}

export interface SyncResult {
  postsSynced: number;
  metricsSynced: number;
  errors: string[];
}

export abstract class BaseCollector {
  protected account: SocialAccount;
  protected logger: (msg: string) => void;

  constructor(account: SocialAccount) {
    this.account = account;
    this.logger = (msg: string) =>
      console.log(
        `[${account.platform.toUpperCase()}:${account.accountName}] ${msg}`
      );
  }

  abstract fetchPosts(): Promise<PostData[]>;
  abstract fetchMetrics(postIds: string[]): Promise<MetricData[]>;
  abstract getAccountStats(): Promise<AccountStats>;

  /** Sanitize text for PostgreSQL storage (remove null bytes and control characters) */
  protected sanitizeText(text: string | null): string | null {
    if (!text) return text;
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }

  async sync(syncType: SyncType): Promise<SyncResult> {
    const syncLog = await prisma.syncLog.create({
      data: {
        socialAccountId: this.account.id,
        syncType,
        status: "syncing",
        startedAt: new Date(),
      },
    });

    await prisma.socialAccount.update({
      where: { id: this.account.id },
      data: { syncStatus: "syncing" },
    });

    const result: SyncResult = {
      postsSynced: 0,
      metricsSynced: 0,
      errors: [],
    };

    try {
      this.logger(`Starting ${syncType} sync...`);

      // 1. Fetch posts
      const posts = await this.fetchPosts();
      this.logger(`Fetched ${posts.length} posts`);

      // 2. Upsert posts into database
      for (const post of posts) {
        try {
          await prisma.post.upsert({
            where: {
              socialAccountId_postId: {
                socialAccountId: this.account.id,
                postId: post.postId,
              },
            },
            create: {
              socialAccountId: this.account.id,
              platform: post.platform,
              postId: post.postId,
              postType: post.postType,
              title: this.sanitizeText(post.title),
              description: this.sanitizeText(post.description),
              contentUrl: post.contentUrl,
              thumbnailUrl: post.thumbnailUrl,
              publishedAt: post.publishedAt,
            },
            update: {
              title: this.sanitizeText(post.title),
              description: this.sanitizeText(post.description),
              thumbnailUrl: post.thumbnailUrl,
              lastMetricRefreshAt: new Date(),
            },
          });
          result.postsSynced++;
        } catch (err) {
          const msg = `Failed to upsert post ${post.postId}: ${err}`;
          this.logger(msg);
          result.errors.push(msg);
        }
      }

      // 3. Fetch metrics for all posts
      const postIds = posts.map((p) => p.postId);
      if (postIds.length > 0) {
        const metrics = await this.fetchMetrics(postIds);
        this.logger(`Fetched ${metrics.length} metric records`);

        // 4. Upsert metrics
        for (const metric of metrics) {
          try {
            // Find the DB post by external postId
            const dbPost = await prisma.post.findUnique({
              where: {
                socialAccountId_postId: {
                  socialAccountId: this.account.id,
                  postId: metric.postId,
                },
              },
              select: { id: true },
            });

            if (!dbPost) continue;

            await prisma.postMetric.upsert({
              where: {
                postId_metricType_metricDate: {
                  postId: dbPost.id,
                  metricType: metric.metricType,
                  metricDate: metric.metricDate,
                },
              },
              create: {
                postId: dbPost.id,
                socialAccountId: this.account.id,
                platform: this.account.platform,
                metricType: metric.metricType,
                metricDate: metric.metricDate,
                metricValue: metric.metricValue,
              },
              update: {
                metricValue: metric.metricValue,
              },
            });
            result.metricsSynced++;
          } catch (err) {
            const msg = `Failed to upsert metric for post ${metric.postId}: ${err}`;
            this.logger(msg);
            result.errors.push(msg);
          }
        }
      }

      // 5. Update account stats
      try {
        const stats = await this.getAccountStats();
        this.logger(`Followers: ${stats.followers}`);
      } catch (err) {
        this.logger(`Failed to get account stats: ${err}`);
      }

      // 6. Mark sync as complete
      const status: SyncStatus =
        result.errors.length > 0 ? "failed" : "success";

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          postsSynced: result.postsSynced,
          metricsSynced: result.metricsSynced,
          errorMessage:
            result.errors.length > 0 ? result.errors.join("; ") : null,
          completedAt: new Date(),
        },
      });

      await prisma.socialAccount.update({
        where: { id: this.account.id },
        data: {
          syncStatus: status,
          lastSyncedAt: new Date(),
        },
      });

      this.logger(
        `Sync complete: ${result.postsSynced} posts, ${result.metricsSynced} metrics`
      );

      return result;
    } catch (err) {
      this.logger(`Sync failed: ${err}`);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "failed",
          errorMessage: String(err),
          completedAt: new Date(),
        },
      });

      await prisma.socialAccount.update({
        where: { id: this.account.id },
        data: { syncStatus: "failed" },
      });

      throw err;
    }
  }

  /** Simple rate-limit delay */
  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
