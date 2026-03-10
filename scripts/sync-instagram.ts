import { PrismaClient } from "@prisma/client";
import { InstagramCollector } from "../lib/collectors/instagram";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.socialAccount.findFirst({
    where: { platform: "instagram" },
  });

  if (!account) {
    console.error("No Instagram account found in database");
    process.exit(1);
  }

  console.log(`Starting sync for ${account.accountName} (${account.accountId})...`);

  const collector = new InstagramCollector(account);
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
