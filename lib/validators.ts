import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

/**
 * One auto-tag rule. A rule must specify at least one of hashtags /
 * mentions / keywords — an empty rule would tag nothing, so reject it
 * at write time rather than letting users create dud rules.
 */
export const tagRuleSchema = z
  .object({
    tag: z.string().min(1, "Rule tag is required").max(50),
    hashtags: z.array(z.string().max(100)).optional().default([]),
    mentions: z.array(z.string().max(100)).optional().default([]),
    keywords: z.array(z.string().max(200)).optional().default([]),
  })
  .refine(
    (r) => (r.hashtags?.length ?? 0) + (r.mentions?.length ?? 0) + (r.keywords?.length ?? 0) > 0,
    { message: "Rule must specify at least one of hashtags, mentions, or keywords" }
  );

export const socialAccountSchema = z.object({
  platform: z.enum(["youtube", "twitter", "instagram", "tiktok", "vk"]),
  accountId: z.string().min(1, "Account ID is required"),
  accountName: z.string().min(1, "Account name is required"),
  contentFilter: z.enum(["all", "video_only"]).default("all"),
  profileId: z.string().optional(),
  apiKey: z.string().optional(),
  authToken: z.string().optional(),
  refreshToken: z.string().optional(),
  // Per-account auto-tagging configuration. Both optional — accounts
  // without rules just don't auto-tag. defaultTags applies to every
  // post; tagRules conditional on caption matches.
  defaultTags: z.array(z.string().min(1).max(50)).optional().default([]),
  tagRules: z.array(tagRuleSchema).optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1, "Profile name is required").max(100, "Profile name is too long"),
});

export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be before end date",
    path: ["startDate"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SocialAccountInput = z.infer<typeof socialAccountSchema>;
export type TagRuleInput = z.infer<typeof tagRuleSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
