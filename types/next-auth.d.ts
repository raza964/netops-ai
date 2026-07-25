import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

// `next-auth` and `next-auth/jwt` re-export their `Session`/`User`/`JWT`
// types from `@auth/core` rather than declaring them locally, so module
// augmentation has to target the `@auth/core` modules where these
// interfaces actually live - augmenting "next-auth" directly does not
// merge with the re-exported type.
declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

// next-auth v5's public callback types are declared through this module in
// addition to @auth/core. Augment both surfaces so build-time callback types
// and application session types agree.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
