/// <reference types="vite/client" />
/// <reference types="@react-router/cloudflare" />

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN?: string; // Optional: Set for production (e.g., "lifelog.example.com")
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
