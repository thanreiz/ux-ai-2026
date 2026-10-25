"use client";

import { useMemo, useRef, useState } from "react";
import type { Answers, Bill, BillLine, ProgramResult, Status } from "@/lib/types";
import { detectFromBill, type Detected } from "@/lib/detect";
import { evaluate } from "@/lib/rules";
import { SAMPLE_BILL, SAMPLE_EXPLANATIONS } from "@/lib/sample";
import { buildLetter, type LetterFields } from "@/lib/letter";

type Expl = Record<string, { en: string; tl: string }>;
type Lang = "en" | "tl";

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const CAT: Record<BillLine["category"], string> = {
  room: "Room", medicine: "Medicine", lab: "Lab / imaging", professional_fee: "Doctor's fee", supplies: "Supplies", other: "Other", deduction: "Deduction",
};
const BADGE: Record<Status, { t: string; c: string }> = {
  applies: { t: "Applies", c: "bg-emerald-100 text-emerald-900" },
  likely: { t: "Likely", c: "bg-teal-100 text-teal-900" },
  maybe: { t: "Maybe, ask", c: "bg-amber-100 text-amber-900" },
  no: { t: "Does not apply", c: "bg-stone-200 text-stone-700" },
};

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 2200 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [bill, setBill] = useState<Bill | null>(null);
  const [expl, setExpl] = useState<Expl>({});
  const [lang, setLang] = useState<Lang>("en");
  const [ans, setAns] = useState<Partial<Answers>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [lf, setLf] = useState<LetterFields>({ patient: "", requester: "", relationship: "", contact: "" });
  const [done, setDone] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const complete = ans.hospitalType && ans.room && ans.setting && ans.philhealth && ans.category && ans.income && ans.dependents !== undefined;
  const plan = useMemo(() => (bill && complete ? evaluate(bill, ans as Answers) : null), [bill, ans, complete]);
  const letter = useMemo(() => (bill && plan ? buildLetter(bill, ans as Answers, plan, lf) : ""), [bill, plan, ans, lf]);

  async function explain(b: Bill) {
    const descs = [...new Set(b.lines.filter((l) => l.category !== "deduction").map((l) => l.description))];
    try {
      const r = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descriptions: descs }) });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setExpl(Object.fromEntries(j.items.map((i: { description: string; en: string; tl: string }) => [i.description, { en: i.en, tl: i.tl }])));
    } catch { /* explanations are optional; bill still works */ }
  }

  function useSample() {
    setErr(""); setBill(structuredClone(SAMPLE_BILL)); setExpl(SAMPLE_EXPLANATIONS); setStep(1);
  }

  async function onFile(f?: File) {
    if (!f) return;
    setErr(""); setBusy("Reading your bill...");
    try {
      const image = await shrink(f);
      const r = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      if (!r.ok) throw new Error(String(r.status));
      const { bill: b } = (await r.json()) as { bill: Bill };
      if (!b.lines.length) throw new Error("empty");
      setBill(b); setExpl({}); setStep(1); setBusy("");
      explain(b);
    } catch {
      setBusy("");
      setErr("We could not read that photo. Try a clearer, flat, well-lit picture, or use the sample bill to see how it works.");
    }
  }

  const editLine = (i: number, p: Partial<BillLine>) => setBill((b) => b && { ...b, lines: b.lines.map((l, j) => (j === i ? { ...l, ...p, lowConfidence: false } : l)) });
  const total = bill ? bill.lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0) : 0;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="no-print border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button onClick={() => { setStep(0); }} className="text-lg font-bold text-teal-800">Bayad<span className="text-stone-900">Gabay</span></button>
          {step > 0 && <ol className="flex gap-1 text-xs font-medium" aria-label="Progress">
            {["Bill", "About you", "Plan"].map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-teal-700 text-white" : "bg-stone-100 text-stone-600"}`}>{s}</li>)}
          </ol>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {step === 0 && (
          <section className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold leading-tight">Understand your hospital bill. Find the help you can claim.</h1>
              <p className="text-lg text-stone-700">Take a photo of the Statement of Account. We explain each charge, check which aid programs may apply, and give you the offices and papers to bring, in order.</p>
            </div>
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="w-full rounded-xl bg-teal-700 px-5 py-4 text-lg font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                {busy || "Take or upload a photo of the bill"}
              </button>
              <button onClick={useSample} className="w-full rounded-xl border border-stone-300 px-5 py-3 font-medium hover:bg-stone-100">Try a sample bill (fictional)</button>
              {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{err}</p>}
            </div>
            <ul className="grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
              <li className="rounded-xl bg-white p-4 shadow-sm"><b>AI reads and explains.</b> Plain English or Taglish.</li>
              <li className="rounded-xl bg-white p-4 shadow-sm"><b>Plain rules decide.</b> Every result shows its source, not a chatbot guess.</li>
              <li className="rounded-xl bg-white p-4 shadow-sm"><b>Private.</b> Nothing is saved on our server.</li>
            </ul>
            <p className="text-xs text-stone-500">This is an estimate tool, not legal or medical advice. Always confirm with the hospital billing office or PhilHealth. Rules come from news and agency pages and are not yet verified with the agencies.</p>
          </section>
        )}

        {step === 1 && bill && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold">Your bill, explained</h2>
                <p className="text-stone-600">{bill.hospitalName}. Fix anything we misread.</p>
              </div>
              <div role="group" aria-label="Language" className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
                {(["en", "tl"] as Lang[]).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-3 py-2 ${lang === l ? "bg-teal-700 text-white" : "bg-white"}`}>{l === "en" ? "English" : "Taglish"}</button>)}
              </div>
            </div>
            <ul className="space-y-2">
              {bill.lines.map((l, i) => (
                <li key={i} className={`rounded-xl border bg-white p-3 shadow-sm ${l.lowConfidence ? "border-amber-400" : "border-stone-200"}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <input aria-label="Description" value={l.description} onChange={(e) => editLine(i, { description: e.target.value })} className="w-full rounded border border-transparent px-1 font-medium hover:border-stone-300" />
                      <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                        <select aria-label="Category" value={l.category} onChange={(e) => editLine(i, { category: e.target.value as BillLine["category"] })} className="rounded border border-stone-200 bg-white px-1 py-0.5">
                          {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        {l.lowConfidence && <span className="font-semibold text-amber-800">Please check this line</span>}
                      </div>
                    </div>
                    <label className="flex items-center rounded border border-stone-300 px-2 py-1 text-right font-semibold">
                      <span className="mr-1">₱</span>
                      <input aria-label="Amount" inputMode="decimal" value={l.amount} onChange={(e) => editLine(i, { amount: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} className="w-24 text-right" />
                    </label>
                    <button aria-label="Remove line" onClick={() => setBill({ ...bill, lines: bill.lines.filter((_, j) => j !== i) })} className="px-2 text-stone-400 hover:text-red-700">×</button>
                  </div>
                  {l.category !== "deduction" && expl[l.description] && <p className="mt-2 rounded-lg bg-teal-50 p-2 text-sm text-teal-950">{expl[l.description][lang]}</p>}
                </li>
              ))}
            </ul>
            <button onClick={() => setBill({ ...bill, lines: [...bill.lines, { category: "other", description: "New charge", qty: 1, amount: 0 }] })} className="text-sm font-medium text-teal-800 underline">+ Add a line</button>
            <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"><span className="font-medium">Total charges</span><span className="text-xl font-bold">{peso(total)}</span></div>
            <button onClick={() => {
              const det = detectFromBill(bill);
              const merged: Detected = { ...bill.detected, ...Object.fromEntries(Object.entries(det).filter(([, v]) => v !== undefined)), notes: det.notes.length ? det.notes : bill.detected?.notes ?? [] };
              setBill({ ...bill, total, detected: merged });
              setAns({ hospitalType: merged.hospitalType, room: merged.room, setting: merged.setting, ...Object.fromEntries(Object.entries(ans).filter(([, v]) => v !== undefined)) });
              setStep(2);
            }} className="w-full rounded-xl bg-teal-700 px-5 py-4 text-lg font-semibold text-white hover:bg-teal-800">Looks right. Next: about you</button>
          </section>
        )}

        {step === 2 && bill && (
          <section className="space-y-6">
            <div><h2 className="text-2xl font-bold">Five quick questions</h2><p className="text-stone-600">Answers stay on your phone. They decide which programs apply.</p></div>
            <Q label="1. What kind of hospital?" hint={ans.hospitalType && ans.hospitalType === bill.detected?.hospitalType ? `Filled in from your bill (${bill.hospitalName}). Tap another answer if this is wrong.` : undefined} value={ans.hospitalType} on={(v) => setAns({ ...ans, hospitalType: v })} opts={[["doh", "DOH hospital", "Includes Heart Center, Lung Center, NKTI, PCMC"], ["lgu", "City / provincial (LGU)", ""], ["private", "Private hospital", ""]]} />
            <Q label="2. What room is the patient in?" hint={ans.room && ans.room === bill.detected?.room ? "Filled in from the room line on your bill. Tap another answer if this is wrong." : undefined} value={ans.room} on={(v) => setAns({ ...ans, room: v })} opts={[["ward", "Ward / basic", "Shared, no extra room charge"], ["private", "Semi-private or private", ""]]} />
            <Q label="Admitted or outpatient?" hint={ans.setting && ans.setting === bill.detected?.setting ? "Filled in because your bill has a room charge." : undefined} value={ans.setting} on={(v) => setAns({ ...ans, setting: v })} opts={[["inpatient", "Admitted (confined)", ""], ["outpatient", "Outpatient", "Dialysis, chemo, check-ups"]]} />
            <Q label="3. Is the patient an active PhilHealth member?" value={ans.philhealth} on={(v) => setAns({ ...ans, philhealth: v })} opts={[["active", "Yes, active", ""], ["none", "No / not sure", ""]]} />
            <Q label="4. Patient category" value={ans.category} on={(v) => setAns({ ...ans, category: v })} opts={[["none", "None of these", ""], ["senior", "Senior citizen (60+)", ""], ["pwd", "Person with disability", ""], ["minor", "Child under 18", ""]]} />
            <Q label="5. Household monthly income" value={ans.income} on={(v) => setAns({ ...ans, income: v })} opts={[["low", "Below ₱15,000", ""], ["middle", "₱15,000 to ₱40,000", ""], ["high", "Above ₱40,000", ""]]} />
            <fieldset>
              <legend className="mb-2 font-semibold">People who depend on this income</legend>
              <div className="flex items-center gap-3">
                <button aria-label="Fewer" onClick={() => setAns({ ...ans, dependents: Math.max(0, (ans.dependents ?? 0) - 1) })} className="h-12 w-12 rounded-xl border border-stone-300 bg-white text-xl">−</button>
                <span className="w-10 text-center text-xl font-bold">{ans.dependents ?? "–"}</span>
                <button aria-label="More" onClick={() => setAns({ ...ans, dependents: (ans.dependents ?? 0) + 1 })} className="h-12 w-12 rounded-xl border border-stone-300 bg-white text-xl">+</button>
              </div>
            </fieldset>
            <button disabled={!complete} onClick={() => { setStep(3); window.scrollTo(0, 0); }} className="w-full rounded-xl bg-teal-700 px-5 py-4 text-lg font-semibold text-white hover:bg-teal-800 disabled:bg-stone-300">Show my plan</button>
          </section>
        )}

        {step === 3 && bill && plan && (
          <section className="space-y-6">
            <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><b>Estimate only.</b> Confirm every item with the hospital billing office or PhilHealth. Aid is assessed case by case and is not guaranteed.</p>

            <div className="rounded-2xl bg-teal-800 p-5 text-white">
              <p className="text-sm opacity-80">You may still owe</p>
              <p className="text-3xl font-bold">{plan.remaining.min === plan.remaining.max ? peso(plan.remaining.max) : `${peso(plan.remaining.min)} to ${peso(plan.remaining.max)}`}</p>
              <p className="mt-1 text-sm opacity-80">of {peso(total)} billed, depending on which aid is approved.</p>
            </div>

            <div>
              <h2 className="mb-2 text-xl font-bold">How we got there</h2>
              <ul className="space-y-1">
                {plan.waterfall.map((w, i) => (
                  <li key={i} className="flex items-baseline justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span>{w.label}{w.note && <span className="ml-2 text-xs text-stone-500">{w.note}</span>}</span>
                    {w.amount !== 0 && <span className={`font-semibold ${w.amount < 0 ? "text-emerald-700" : ""}`}>{w.amount < 0 ? "−" : ""}{peso(Math.abs(w.amount))}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {plan.flags.length > 0 && (
              <div>
                <h2 className="mb-2 text-xl font-bold">Ask about these on your bill</h2>
                <ul className="space-y-2">{plan.flags.map((f, i) => <li key={i} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{f}</li>)}</ul>
              </div>
            )}

            <div>
              <h2 className="mb-2 text-xl font-bold">Programs that may help</h2>
              <ul className="space-y-3">{plan.programs.filter((p) => p.status !== "no").map((p) => <Program key={p.id} p={p} />)}</ul>
            </div>

            <div>
              <h2 className="mb-2 text-xl font-bold">Your plan, in order</h2>
              <ol className="space-y-3">
                {plan.checklist.map((s) => (
                  <li key={s.order} className="rounded-xl bg-white p-4 shadow-sm">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={!!done[s.order]} onChange={(e) => setDone({ ...done, [s.order]: e.target.checked })} className="mt-1 h-5 w-5 print:hidden" />
                      <span className="print:before:content-['☐_']">
                        <b>{s.order}. {s.office}</b>
                        <span className="block text-sm text-stone-700">{s.action}</span>
                        {s.bring.length > 0 && <span className="mt-1 block text-sm"><b>Bring:</b> {s.bring.join("; ")}</span>}
                        <span className="block text-sm text-stone-500">Covers: {s.covers}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <h2 className="text-lg font-bold">Know your rights</h2>
              <p className="mt-1 text-sm">{plan.detentionNote}</p>
              <p className="mt-2 text-sm"><b>At the cashier, you can say:</b> “Please show me my PhilHealth deduction and give me an itemized bill. I would like to see the social worker for an assessment before I pay.”</p>
            </div>

            <div>
              <h2 className="mb-2 text-xl font-bold">Request letter</h2>
              <div className="no-print mb-2 grid gap-2 sm:grid-cols-2 print:hidden">
                {([["patient", "Patient name"], ["requester", "Your name"], ["relationship", "Relationship (e.g. daughter)"], ["contact", "Contact number"]] as const).map(([k, ph]) => (
                  <input key={k} placeholder={ph} aria-label={ph} value={lf[k]} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} className="rounded-lg border border-stone-300 bg-white px-3 py-2" />
                ))}
              </div>
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 font-sans text-sm leading-relaxed shadow-sm">{letter}</pre>
            </div>

            <div className="no-print flex flex-col gap-2 sm:flex-row print:hidden">
              <button onClick={() => window.print()} className="flex-1 rounded-xl bg-teal-700 px-5 py-4 font-semibold text-white hover:bg-teal-800">Print plan and letter</button>
              <button onClick={() => setStep(2)} className="flex-1 rounded-xl border border-stone-300 px-5 py-4 font-medium hover:bg-stone-100">Change my answers</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Q<T extends string>({ label, hint, value, on, opts }: { label: string; hint?: string; value?: T; on: (v: T) => void; opts: [T, string, string][] }) {
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{label}</legend>
      {hint && <p className="mb-2 text-sm font-medium text-teal-800">✓ {hint}</p>}
      {!hint && <div className="mb-1" />}
      <div className="grid gap-2">
        {opts.map(([v, t, sub]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => on(v)}
            className={`rounded-xl border px-4 py-3 text-left ${value === v ? "border-teal-700 bg-teal-50 ring-2 ring-teal-700" : "border-stone-300 bg-white hover:bg-stone-100"}`}>
            <span className="font-medium">{t}</span>{sub && <span className="block text-sm text-stone-600">{sub}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Program({ p }: { p: ProgramResult }) {
  const b = BADGE[p.status];
  return (
    <li className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{p.name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.c}`}>{b.t}</span></div>
      <p className="mt-1 text-sm text-stone-800">{p.reason}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-teal-800 print:hidden">Why this result?</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-stone-50 p-3 text-stone-700">
          <p><b>Based on your answers:</b> {p.triggers.join(", ")}</p>
          <p><b>Source:</b> <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="underline">{p.source}</a>. Checked {p.lastVerified}.</p>
          <p><b>Not yet verified:</b> {p.caveat}</p>
        </div>
      </details>
    </li>
  );
}
