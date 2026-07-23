import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required." }),
  AUTH_SECRET: z
    .string()
    .min(32, { error: "AUTH_SECRET must be at least 32 characters. Generate one with `openssl rand -base64 32`." }),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
});
