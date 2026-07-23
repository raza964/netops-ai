"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    // Re-throw everything else, including the Next.js redirect signal
    // that `signIn` throws internally on success.
    throw error;
  }
}
