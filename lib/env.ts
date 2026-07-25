import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required." }),
  AUTH_SECRET: z
    .string()
    .min(32, { error: "AUTH_SECRET must be at least 32 characters. Generate one with `openssl rand -base64 32`." }),
  // Optional: semantic search (lib/embeddings/) is an additive feature - the
  // rest of the app must still boot without it. Its absence is only surfaced
  // as a clear runtime error at the point an embedding is actually attempted
  // (see lib/embeddings/provider.ts), not at startup.
  VOYAGE_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-20250514"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  NODE_ENV: process.env.NODE_ENV,
});
