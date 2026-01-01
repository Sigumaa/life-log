/// <reference types="vite/client" />
/// <reference types="@react-router/cloudflare" />

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN?: string; // Optional: Set for production (e.g., "lifelog.example.com")
  AUDIT_WEBHOOK_URL?: string; // Optional: Discord webhook for audit logging
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
