import { createPagesFunctionHandler } from "@react-router/cloudflare";

// @ts-expect-error - Virtual module provided by React Router at build time
import * as serverBuild from "../build/server";

export const onRequest = createPagesFunctionHandler({ build: serverBuild });
