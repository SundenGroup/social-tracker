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

export const socialAccountSchema = z.object({
  platform: z.enum(["youtube", "twitter", "instagram", "tiktok"]),
  accountId: z.string().min(1, "Account ID is required"),
  accountName: z.string().min(1, "Account name is required"),
  contentFilter: z.enum(["all", "video_only"]).default("all"),
  apiKey: z.string().optional(),
  authToken: z.string().optional(),
  refreshToken: z.string().optional(),
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
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
