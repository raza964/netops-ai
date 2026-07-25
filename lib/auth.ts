import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getUserByEmail } from "./data/users";
import { env } from "./env";
import { verifyPassword } from "./password";
import { loginSchema } from "./validation/auth";
import type { Role } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  // The production app is served behind Cloudflare. Authorization never trusts
  // the Host header or JWT role alone; the DAL re-reads the user on each
  // protected request.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (rawCredentials) => {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getUserByEmail(email);
        if (!user || !user.isActive) return null;

        const passwordValid = await verifyPassword(password, user.passwordHash);
        if (!passwordValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      const role = token.role;
      if (
        typeof token.id !== "string" ||
        (role !== "ADMIN" && role !== "ENGINEER" && role !== "VIEWER")
      ) {
        throw new Error("Session token is missing a valid user identity.");
      }
      session.user.id = token.id;
      session.user.role = role as Role;
      return session;
    },
  },
});
