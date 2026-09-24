import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  buildCommand: "pnpm db:migrate && pnpm build",
  framework: "nextjs",
};
