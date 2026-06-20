import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(here, "..", "..");

// Load root .env so DATABASE_URL is available to server-side code in dev.
// Next.js only auto-loads .env from the app directory, not the monorepo root.
const rootEnvPath = path.join(monorepoRoot, ".env");
if (fs.existsSync(rootEnvPath)) {
  const lines = fs.readFileSync(rootEnvPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@enpal/db"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
