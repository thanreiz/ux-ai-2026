import OpenAI from "openai";
import type { Answers, Bill } from "./types";
import { matchKnownHospital } from "./detect";

type HType = Answers["hospitalType"];
export type HospitalGuess = NonNullable<Bill["hospitalGuess"]>;

const DECIDE_MODEL = process.env.DECIDE_MODEL || "gpt-6-luna";
const VERIFY_MODEL = process.env.VERIFY_MODEL || "gpt-6.1-sol";

const choices = [
  { value: "doh", description: "National government hospital retained by the Department of Health, or a DOH specialty hospital (Heart Center, Lung Center, NKTI, PCMC)." },
  { value: "lgu", description: "Hospital run by a city, municipality or province (local government unit)." },
  { value: "private", description: "Privately owned hospital, including church, corporate and university-owned hospitals." },
];

// Check 1: Decisions API. Always answers, with a confidence score.
async function decide(ctx: string): Promise<{ type: HType; confidence: number } | null> {
  try {
    const d = await new OpenAI().decisions.create({
      model: DECIDE_MODEL,
      input: ctx,
      questions: [{ type: "choice", name: "hospital_type", instructions: "Based on the hospital name, address and header text from its Statement of Account, who runs this Philippine hospital? Pick the best answer.", choices }],
    });
    const a = d.answers[0];
    return a.type === "choice" ? { type: a.choice as HType, confidence: a.confidence } : null;
  } catch (e) {
    console.error("hospital decision failed", e instanceof Error ? e.message : e);
    return null;
  }
}

const verifySchema = {
  type: "object", additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["doh", "lgu", "private", "unknown"] },
    evidence: { type: "string" },
    sourceUrl: { type: ["string", "null"] },
  },
  required: ["type", "evidence", "sourceUrl"],
};

// Check 2: web search to verify who actually runs the hospital.
async function verify(ctx: string): Promise<{ type: HType; evidence: string; sourceUrl: string | null } | null> {
  try {
    const r = await new OpenAI().responses.create({
      model: VERIFY_MODEL,
      store: false,
      max_output_tokens: 700,
      max_tool_calls: 3,
      tools: [{ type: "web_search" }],
      instructions:
        "Find out who owns and runs this Philippine hospital. 'doh' = national government hospital retained by the Department of Health (including its specialty hospitals). 'lgu' = run by a city, municipality or province. 'private' = privately owned. Use 'unknown' only if searches give no clear answer. evidence is one short sentence naming what you found; sourceUrl is the page that says it.",
      input: ctx,
      text: { format: { type: "json_schema", name: "hospital_owner", strict: true, schema: verifySchema } },
    });
    const j = JSON.parse(r.output_text);
    return j.type === "unknown" ? null : { type: j.type, evidence: j.evidence, sourceUrl: j.sourceUrl };
  } catch (e) {
    console.error("hospital verify failed", e instanceof Error ? e.message : e);
    return null;
  }
}

// Decide automatically, then double-check. Never leaves the question blank if either check answers.
export async function determineHospital(b: Pick<Bill, "hospitalName" | "hospitalAddress" | "ownershipClues">): Promise<HospitalGuess | null> {
  const known = matchKnownHospital(b.hospitalName);
  if (known) return { type: known, status: "confirmed", evidence: "On our list of DOH-run hospitals." };

  const ctx = [`Hospital: ${b.hospitalName}`, b.hospitalAddress && `Address: ${b.hospitalAddress}`, b.ownershipClues && `Header text: ${b.ownershipClues}`].filter(Boolean).join("\n");
  const [d, v] = await Promise.all([decide(ctx), verify(ctx)]);
  if (d && v && d.type === v.type) return { type: d.type, status: "confirmed", evidence: v.evidence, sourceUrl: v.sourceUrl ?? undefined };
  if (v) return { type: v.type, status: "check", evidence: `${v.evidence}${d ? ` (A second check said ${d.type}.)` : ""}`, sourceUrl: v.sourceUrl ?? undefined };
  if (d) return { type: d.type, status: d.confidence >= 0.85 ? "likely" : "check", evidence: "Judged from the hospital name and bill header. Could not verify online." };
  return null;
}
