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
      case "twitter": {
        const validHandle = !!accountId && /^[A-Za-z0-9_]{1,15}$/.test(accountId.replace(/^@/, ""));
        if (!validHandle) {
          isValid = false;
          message = "X/Twitter requires a valid handle (1-15 alphanumeric/underscore characters)";
        } else if (authToken) {
          const hasAuthToken = authToken.includes("auth_token=");
          isValid = true;
          message = hasAuthToken
            ? "X/Twitter handle and session cookies look valid."
            : "X/Twitter handle is valid. Cookies should include auth_token for reliable scraping.";
        } else {
          isValid = true;
          message = "X/Twitter handle is valid. Add session cookies for reliable scraping (recommended).";
        }
        break;
      }
      case "instagram":
        if (!authToken) {
          isValid = false;
          message = "Instagram requires session cookies. Export cookies from a logged-in browser.";
        } else {
          // Check for required cookie names in the raw string
          const hasSessionId = authToken.includes("sessionid=");
          const hasCsrf = authToken.includes("csrftoken=");
          isValid = hasSessionId && hasCsrf;
          message = isValid
            ? "Instagram session cookies look valid. They will be verified during first sync."
            : "Instagram cookies should include at least sessionid and csrftoken";
        }
        break;
      case "tiktok":
        isValid = !!accountId && accountId.length > 0;
        if (isValid && authToken) {
          const hasTikTokSession = authToken.includes("sessionid");
          message = hasTikTokSession
            ? "TikTok handle and session cookies look valid."
            : "TikTok handle is valid. Cookies should include sessionid for full video listing.";
        } else {
          message = isValid
            ? "TikTok handle is valid. Add session cookies for full video listing (optional)."
            : "TikTok requires a valid username";
        }
        break;
    }

    return NextResponse.json({
      data: { success: isValid, message, platform },
    });
  },
  { requireAuth: true, requireAdmin: true }
);
