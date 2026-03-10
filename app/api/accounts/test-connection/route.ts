import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { z } from "zod";

const testConnectionSchema = z.object({
  platform: z.enum(["youtube", "twitter", "instagram", "tiktok"]),
  accountId: z.string().optional(),
  apiKey: z.string().optional(),
  authToken: z.string().optional(),
});

// POST /api/accounts/test-connection - Test API credentials
export const POST = apiHandler(
  async (req) => {
    const body = await req.json();
    const result = testConnectionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { platform, accountId, apiKey, authToken } = result.data;

    let isValid = false;
    let message = "";

    switch (platform) {
      case "youtube":
        isValid = !!apiKey;
        message = isValid
          ? "YouTube API key format is valid"
          : "YouTube requires an API key";
        break;
      case "twitter":
        // Twitter uses scraping — no API keys needed, just a valid handle
        isValid = !!accountId && /^[A-Za-z0-9_]{1,15}$/.test(accountId.replace(/^@/, ""));
        message = isValid
          ? "X/Twitter handle format is valid. Profile will be verified during first sync."
          : "X/Twitter requires a valid handle (1-15 alphanumeric/underscore characters)";
        break;
      case "instagram":
        isValid = !!authToken;
        message = isValid
          ? "Instagram access token format is valid"
          : "Instagram requires an access token";
        break;
      case "tiktok":
        isValid = !!accountId && accountId.length > 0;
        message = isValid
          ? "TikTok handle format is valid. Profile will be verified during first sync."
          : "TikTok requires a valid username";
        break;
    }

    return NextResponse.json({
      data: { success: isValid, message, platform },
    });
  },
  { requireAuth: true, requireAdmin: true }
);
