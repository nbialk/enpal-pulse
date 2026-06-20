import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the shared monorepo-root .env before any module reads process.env.
config({ path: join(__dirname, "..", "..", "..", ".env") });
