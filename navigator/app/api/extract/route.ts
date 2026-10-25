import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { Bill } from "@/lib/types";
import { checkCategories, classifyHospital } from "@/lib/decide";
import { detectFromBill, matchKnownHospital } from "@/lib/detect";

export const maxDuration = 60;

const MODEL = process.env.EXTRACT_MODEL || "gpt-6.1-sol";
const ESCALATE_MODEL = process.env.ESCALATE_MODEL || "gpt-6-astra";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hospitalName: { type: "string" },
    total: { type: ["number", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: ["room", "medicine", "lab", "professional_fee", "supplies", "other", "deduction"] },
          description: { type: "string" },
          qty: { type: "number" },
          amount: { type: ["number", "null"] },
          unreadable: { type: "boolean" },
        },
        required: ["category", "description", "qty", "amount", "unreadable"],
      },
    },
  },
  required: ["hospitalName", "total", "lines"],
};

const PROMPT = `Transcribe this Philippine hospital Statement of Account into the schema.
- One entry per charge line. Amounts are positive PHP numbers.
- Discounts, PhilHealth, HMO or other deductions use category "deduction" with a positive amount.
- If a value is hard to read, set amount to null and unreadable to true. Never guess or invent amounts.
- qty is 1 if not shown. total is the stated total or null.`;

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "no_key" }, { status: 503 });
  let image: string;
  try {
    ({ image } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 8_000_000)
    return NextResponse.json({ error: "bad_image" }, { status: 400 });

  try {
    const openai = new OpenAI();
    const read = async (model: string): Promise<Bill> => {
      const r = await openai.responses.create({
        model,
        store: false, // do not retain the user's bill at OpenAI
        max_output_tokens: 2500,
        input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_image", image_url: image, detail: "original" }] }],
        text: { format: { type: "json_schema", name: "hospital_soa", strict: true, schema } },
      });
      const raw = JSON.parse(r.output_text);
      const lines = (raw.lines as { category: Bill["lines"][number]["category"]; description: string; qty: number; amount: number | null; unreadable: boolean }[]).map((l) => ({
        category: l.category, description: l.description, qty: l.qty || 1, amount: l.amount ?? 0, lowConfidence: l.unreadable || l.amount === null,
      }));
      const calc = lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0);
      return { hospitalName: raw.hospitalName || "Hospital", lines, total: raw.total ?? calc };
    };
    const shaky = (b: Bill) => {
      const calc = b.lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0);
      return b.lines.filter((l) => l.lowConfidence).length >= 3 || (b.total > 0 && Math.abs(calc - b.total) > b.total * 0.01);
    };
    let bill = await read(MODEL);
    let escalated = false;
    // One escalation to the stronger model only when the first read looks unreliable.
    if (shaky(bill)) {
      try { const better = await read(ESCALATE_MODEL); if (!shaky(better) || better.lines.filter((l) => l.lowConfidence).length < bill.lines.filter((l) => l.lowConfidence).length) { bill = better; escalated = true; } } catch { /* keep first read */ }
    }
    // Decisions API second opinion on each line's category (drives the rules engine).
    const [d, guess] = await Promise.all([
      checkCategories(bill.lines).catch(() => null),
      matchKnownHospital(bill.hospitalName) ? Promise.resolve(null) : classifyHospital(bill.hospitalName),
    ]);
    if (d) bill = { ...bill, lines: d.lines };
    if (guess) bill = { ...bill, hospitalGuess: guess };
    bill = { ...bill, detected: detectFromBill(bill) };
    return NextResponse.json({ bill, escalated, decisions: d ? { checked: d.checked, changed: d.changed } : null });
  } catch (e) {
    console.error("extract failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "extract_failed" }, { status: 502 });
  }
}
