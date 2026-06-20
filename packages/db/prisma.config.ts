import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, "..", "..", ".env") });

// `prisma generate` runs at build time and does not need a live connection.
// Fall back to a dummy URL when DATABASE_URL is unset so generation never
// fails; runtime always provides a real URL via the environment.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
