import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, "..", "..", ".env") });

export default defineConfig({
  schema: join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
