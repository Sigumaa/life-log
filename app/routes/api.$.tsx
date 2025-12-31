import type { Route } from "./+types/api.$";
import { app } from "../../server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return app.fetch(request, context.cloudflare.env, context.cloudflare.ctx);
}

export async function action({ request, context }: Route.ActionArgs) {
  return app.fetch(request, context.cloudflare.env, context.cloudflare.ctx);
}
