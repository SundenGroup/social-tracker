import type { BrowserContext } from "playwright";
import { decrypt } from "@/lib/api-keys";

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface StoredCookieData {
  cookies: CookieEntry[];
  userId?: string;
  exportedAt: string;
}

/**
 * Decrypt and parse cookie data stored in SocialAccount.authToken.
 */
export function parseCookieData(encryptedAuthToken: string): StoredCookieData {
  const decrypted = decrypt(encryptedAuthToken);
  const data = JSON.parse(decrypted) as StoredCookieData;

  if (!data.cookies || !Array.isArray(data.cookies)) {
    throw new Error("Invalid cookie data: missing cookies array");
  }

  return data;
}

/**
 * Load cookies into a Playwright BrowserContext, filtering out expired ones.
 */
export async function loadCookiesIntoContext(
  context: BrowserContext,
  cookieData: StoredCookieData
): Promise<number> {
  const now = Date.now() / 1000;
  const validCookies = cookieData.cookies.filter(
    (c) => !c.expires || c.expires > now
  );

  if (validCookies.length === 0) {
    throw new Error("All cookies have expired");
  }

  await context.addCookies(
    validCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
      sameSite: c.sameSite ?? ("Lax" as const),
    }))
  );

  return validCookies.length;
}

/**
 * Check that required session cookies exist for a given platform.
 */
export function validateCookiesForPlatform(
  cookieData: StoredCookieData,
  platform: "instagram" | "tiktok" | "twitter"
): { valid: boolean; missing: string[] } {
  const cookieNames = new Set(cookieData.cookies.map((c) => c.name));

  const required: Record<string, string[]> = {
    instagram: ["sessionid", "csrftoken", "ds_user_id"],
    tiktok: ["sessionid"],
    twitter: ["auth_token"],
  };

  const requiredCookies = required[platform];
  const missing: string[] = [];

  for (const name of requiredCookies) {
    if (platform === "tiktok" && name === "sessionid") {
      // TikTok accepts either sessionid or sessionid_ss
      if (!cookieNames.has("sessionid") && !cookieNames.has("sessionid_ss")) {
        missing.push("sessionid or sessionid_ss");
      }
    } else if (!cookieNames.has(name)) {
      missing.push(name);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Check if critical session cookies have expired.
 */
export function areCookiesExpired(
  cookieData: StoredCookieData,
  platform: "instagram" | "tiktok" | "twitter"
): boolean {
  const now = Date.now() / 1000;
  const sessionCookie = cookieData.cookies.find(
    (c) =>
      c.name === "sessionid" ||
      (platform === "tiktok" && c.name === "sessionid_ss") ||
      (platform === "twitter" && c.name === "auth_token")
  );

  if (!sessionCookie) return true;
  if (!sessionCookie.expires) return false; // No expiry = session cookie, assume valid
  return sessionCookie.expires < now;
}

/**
 * Parse a raw cookie header string ("name=value; name2=value2") into structured cookies.
 * Used when admin pastes cookies from browser DevTools.
 */
export function parseCookieHeaderString(
  headerString: string,
  domain: string
): CookieEntry[] {
  const cookies: CookieEntry[] = [];

  // Split by "; " or ";" to get individual name=value pairs
  const pairs = headerString.split(/;\s*/).filter(Boolean);

  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;

    const name = pair.substring(0, eqIndex).trim();
    const value = pair.substring(eqIndex + 1).trim();

    if (!name) continue;

    cookies.push({
      name,
      value,
      domain,
      path: "/",
      secure: true,
    });
  }

  return cookies;
}

/**
 * Build the StoredCookieData JSON from a raw cookie header string.
 * This is what gets encrypted and stored in authToken.
 */
export function buildCookiePayload(
  headerString: string,
  platform: "instagram" | "tiktok" | "twitter"
): string {
  const domainMap: Record<string, string> = {
    instagram: ".instagram.com",
    tiktok: ".tiktok.com",
    twitter: ".x.com",
  };
  const domain = domainMap[platform];
  const cookies = parseCookieHeaderString(headerString.trim(), domain);

  if (cookies.length === 0) {
    throw new Error("No valid cookies found in the provided string");
  }

  const payload: StoredCookieData = {
    cookies,
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(payload);
}
