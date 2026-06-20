import type { PrismaClient } from "../../generated/prisma/client.js";
import { buildHouseholdFacts } from "./facts.js";
import { detectInsights } from "./detectors.js";
import type { GeneratedInsight } from "./types.js";

export type { GeneratedInsight, HouseholdFacts, InsightType, InsightSeverity } from "./types.js";
export { detectInsights } from "./detectors.js";
export { buildHouseholdFacts } from "./facts.js";

/**
 * Generate the deterministic insight feed for a single household:
 * aggregate its data into facts, then run every detector.
 */
export async function generateInsights(
  prisma: PrismaClient,
  householdId: string,
): Promise<GeneratedInsight[]> {
  const facts = await buildHouseholdFacts(prisma, householdId);
  if (!facts) return [];
  return detectInsights(facts);
}
