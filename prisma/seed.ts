import { PrismaClient, Platform, PostType, MetricType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data (order matters for FK constraints)
  await prisma.postMetric.deleteMany();
  await prisma.accountDailyRollup.deleteMany();
  await prisma.syncLog.deleteMany();
  await prisma.dataImport.deleteMany();
  await prisma.post.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = await bcrypt.hash("admin123", 10);
  const viewerPassword = await bcrypt.hash("viewer123", 10);

  // Create org first (ownerId is optional), then users, then link owner
  const org = await prisma.organization.create({
    data: { name: "PUBG Esports" },
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin@clutchgg.com",
      passwordHash: adminPassword,
      name: "Admin User",
      role: UserRole.admin,
      organizationId: org.id,
    },
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { ownerId: admin.id },
  });

  const viewer = await prisma.user.create({
    data: {
      email: "viewer@clutchgg.com",
      passwordHash: viewerPassword,
      name: "Viewer User",
      role: UserRole.viewer,
      organizationId: org.id,
    },
  });

  console.log("Created users: admin@clutchgg.com (admin), viewer@clutchgg.com (viewer)");

  // Create social accounts
  const youtube = await prisma.socialAccount.create({
    data: {
      organizationId: org.id,
      platform: Platform.youtube,
      accountId: "UCYnBM24gMNiVchgBKme3jw",
      accountName: "PUBG Esports",
    },
  });

  const twitter = await prisma.socialAccount.create({
    data: {
      organizationId: org.id,
      platform: Platform.twitter,
      accountId: "pubgesports",
      accountName: "@PUBGEsports",
    },
  });

  const instagram = await prisma.socialAccount.create({
    data: {
      organizationId: org.id,
      platform: Platform.instagram,
      accountId: "pubgesports",
      accountName: "@pubgesports",
    },
  });

  const tiktok = await prisma.socialAccount.create({
    data: {
      organizationId: org.id,
      platform: Platform.tiktok,
      accountId: "pubgesports",
      accountName: "@pubgesports",
    },
  });

  console.log("Created 4 social accounts");

  const accounts = [
    { account: youtube, platform: Platform.youtube },
    { account: twitter, platform: Platform.twitter },
    { account: instagram, platform: Platform.instagram },
    { account: tiktok, platform: Platform.tiktok },
  ];

  const postTypes: Record<Platform, PostType[]> = {
    youtube: [PostType.short, PostType.video],
    twitter: [PostType.text, PostType.video],
    instagram: [PostType.image, PostType.carousel],
    tiktok: [PostType.video, PostType.short],
  };

  const now = new Date();
  let postCount = 0;

  for (const { account, platform } of accounts) {
    const types = postTypes[platform];
    const numPosts = platform === "youtube" || platform === "tiktok" ? 3 : 2;

    for (let i = 0; i < numPosts; i++) {
      const publishedAt = new Date(now);
      publishedAt.setDate(publishedAt.getDate() - (i * 3 + 1));

      const post = await prisma.post.create({
        data: {
          socialAccountId: account.id,
          platform,
          postId: `${platform}-post-${i + 1}`,
          postType: types[i % types.length],
          title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Post #${i + 1}`,
          description: `Sample ${platform} content for testing`,
          contentUrl: `https://${platform}.com/pubgesports/post-${i + 1}`,
          publishedAt,
        },
      });

      // Add metrics
      const metricDate = new Date(now);
      metricDate.setDate(metricDate.getDate() - 1);

      const metricsData = [
        { type: MetricType.views, value: BigInt(Math.floor(Math.random() * 50000) + 1000) },
        { type: MetricType.likes, value: BigInt(Math.floor(Math.random() * 2000) + 50) },
        { type: MetricType.comments, value: BigInt(Math.floor(Math.random() * 200) + 5) },
        { type: MetricType.shares, value: BigInt(Math.floor(Math.random() * 500) + 10) },
      ];

      for (const m of metricsData) {
        await prisma.postMetric.create({
          data: {
            postId: post.id,
            socialAccountId: account.id,
            platform,
            metricDate,
            metricType: m.type,
            metricValue: m.value,
          },
        });
      }

      postCount++;
    }

    // Create daily rollup for yesterday
    const rollupDate = new Date(now);
    rollupDate.setDate(rollupDate.getDate() - 1);

    await prisma.accountDailyRollup.create({
      data: {
        socialAccountId: account.id,
        platform,
        rollupDate,
        totalViews: BigInt(Math.floor(Math.random() * 100000) + 5000),
        totalLikes: BigInt(Math.floor(Math.random() * 5000) + 200),
        totalComments: BigInt(Math.floor(Math.random() * 500) + 20),
        totalShares: BigInt(Math.floor(Math.random() * 1000) + 50),
        totalImpressions: BigInt(Math.floor(Math.random() * 200000) + 10000),
        engagementRate: parseFloat((Math.random() * 5 + 1).toFixed(2)),
        postsPublished: numPosts,
      },
    });
  }

  console.log(`Created ${postCount} posts with metrics and daily rollups`);
  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
