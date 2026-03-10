import { PrismaClient } from "@prisma/client";
import { TikTokCollector } from "../lib/collectors/tiktok";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.socialAccount.findFirst({
    where: { platform: "tiktok" },
  });

  if (!account) {
    console.error("No TikTok account found in database");
    process.exit(1);
  }

  console.log(`Starting sync for ${account.accountName} (${account.accountId})...`);

  const collector = new TikTokCollector(account);
  const result = await collector.sync("manual_trigger");

  console.log("\nSync complete:");
  console.log(`  Posts synced: ${result.postsSynced}`);
  console.log(`  Metrics synced: ${result.metricsSynced}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Sync failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
