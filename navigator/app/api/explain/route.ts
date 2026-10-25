import OpenAI from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MODEL = process.env.EXPLAIN_MODEL || "gpt-6-luna";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { description: { type: "string" }, en: { type: "string" }, tl: { type: "string" } },
        required: ["description", "en", "tl"],
      },
    },
  },
  required: ["items"],
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "no_key" }, { status: 503 });
  let descriptions: string[];
  try {
    ({ descriptions } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!Array.isArray(descriptions) || descriptions.length === 0 || descriptions.length > 60 || descriptions.some((d) => typeof d !== "string" || d.length > 200))
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const openai = new OpenAI();
    const r = await openai.responses.create({
      model: MODEL,
      store: false,
      max_output_tokens: 3000,
      instructions:
        "You explain hospital bill lines to a worried Filipino family member. For each description write one short plain sentence in English (en) and one in natural Taglish/Tagalog (tl). No medical advice, no judgement about price, no jargon. Echo the description exactly.",
      input: JSON.stringify(descriptions),
      text: { format: { type: "json_schema", name: "explanations", strict: true, schema } },
    });
    return NextResponse.json(JSON.parse(r.output_text));
  } catch (e) {
    console.error("explain failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "explain_failed" }, { status: 502 });
  }
}
