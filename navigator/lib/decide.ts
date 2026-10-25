import OpenAI from "openai";
import type { BillLine, LineCategory } from "./types";

const MODEL = process.env.DECIDE_MODEL || "gpt-6-luna";
const LOW = 0.7; // below this we ask the user to check the line
const SWITCH = 0.8; // above this a disagreement overrides the extraction

const choices: { value: LineCategory; description: string }[] = [
  { value: "room", description: "Room or bed charge, per night or per day." },
  { value: "medicine", description: "Medicines, IV fluids, pharmacy items." },
  { value: "lab", description: "Laboratory tests, X-ray, CT, ultrasound, other imaging." },
  { value: "professional_fee", description: "A doctor's own professional fee (attending, surgeon, anesthesiologist)." },
  { value: "supplies", description: "Medical supplies such as syringes, IV sets, gloves, dressings." },
  { value: "deduction", description: "A discount, PhilHealth, HMO or other amount subtracted from the bill." },
  { value: "other", description: "Anything else: admission fee, oxygen, procedures, miscellaneous." },
];

// Decisions API: a finite-answer question per bill line, with probabilities.
// Sets the category used by the rules engine (e.g. professional fees vs hospital charges)
// and flags lines the model is unsure about. Never throws; the extraction stands on failure.
export async function checkCategories(lines: BillLine[]): Promise<{ lines: BillLine[]; changed: number; checked: number }> {
  const openai = new OpenAI();
  let changed = 0;
  let checked = 0;
  const out = [...lines];
  const queue = lines.map((_, i) => i);
  const worker = async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
      try {
        const d = await openai.decisions.create({
          model: MODEL,
          input: lines[i].description,
          questions: [{ type: "choice", name: "category", instructions: "Which kind of hospital bill line is this?", choices }],
        });
        const a = d.answers[0];
        if (a.type !== "choice") continue;
        checked++;
        const l = { ...out[i] };
        if (a.choice !== l.category && a.confidence >= SWITCH) { l.category = a.choice as LineCategory; changed++; }
        else if (a.choice !== l.category || a.confidence < LOW) l.lowConfidence = true;
        out[i] = l;
      } catch (e) {
        console.error("decision failed", e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { lines: out, changed, checked };
}
