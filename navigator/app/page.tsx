"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Answers, Bill, BillLine, ProgramResult, Status } from "@/lib/types";
import { detectFromBill, type Detected } from "@/lib/detect";
import { evaluate } from "@/lib/rules";
import { SAMPLE_BILL, SAMPLE_EXPLANATIONS } from "@/lib/sample";
import { buildLetter, type LetterFields } from "@/lib/letter";
import { LIMITS } from "@/lib/limits";

type Expl = Record<string, { en: string; tl: string }>;
type Lang = "en" | "tl";

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const CAT: Record<BillLine["category"], string> = {
  room: "Room", medicine: "Medicine", lab: "Lab / imaging", professional_fee: "Doctor's fee", supplies: "Supplies", other: "Other", deduction: "Deduction",
};
const BADGE: Record<Status, { t: string; c: string }> = {
  applies: { t: "Applies", c: "bill" },
  likely: { t: "Likely", c: "bill" },
  maybe: { t: "Ask to confirm", c: "check" },
  no: { t: "Not indicated", c: "need" },
};

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    // Try sharp first, then smaller, to stay under the 4.5 MB request limit on phones with big photos.
    for (const [max, q] of [[2200, 0.85], [1800, 0.75], [1400, 0.7]] as const) {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length < 3_400_000) return out;
    }
    throw new Error("too_big");
  } finally { URL.revokeObjectURL(url); }
}

function StatusMark({ tone }: { tone: "warning" | "success" }) {
  return tone === "warning" ? (
    <svg className={`status-mark ${tone}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.7v4.1M8 11.2v.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className={`status-mark ${tone}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.2 2.8 2.7 6.2-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const camRef = useRef<HTMLInputElement>(null);
  const t = (en: string, tl: string) => (lang === "en" ? en : tl);

  // Remember checklist ticks and language on this device only.
  useEffect(() => {
    try {
      const d = localStorage.getItem("bg-done"); if (d) setDone(JSON.parse(d));
      const l = localStorage.getItem("bg-lang"); if (l === "en" || l === "tl") setLang(l);
    } catch { /* storage may be blocked */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("bg-done", JSON.stringify(done)); localStorage.setItem("bg-lang", lang); } catch { /* ignore */ } }, [done, lang]);

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

  async function onFile(f?: File, isSample = false) {
    if (!f) return;
    setErr("");
    const steps = ["Reading your bill...", "Checking each charge...", "Checking the hospital...", "Almost done..."];
    let n = 0; setBusy(steps[0]);
    const timer = setInterval(() => { n = Math.min(n + 1, steps.length - 1); setBusy(steps[n]); }, 6000);
    try {
      const image = await shrink(f);
      const r = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      if (r.status === 422) throw new Error("not_a_bill");
      if (r.status === 429) throw new Error("rate_limited");
      if (!r.ok) throw new Error(String(r.status));
      const { bill: b } = (await r.json()) as { bill: Bill };
      if (!b.lines.length) throw new Error("empty");
      setBill(b); setExpl({}); setStep(1);
      explain(b);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (isSample) { useSample(); }
      else if (code === "not_a_bill") setErr("This photo doesn’t look like a hospital bill. Take a photo of the Statement of Account (SOA) with the charges and the total.");
      else if (code === "rate_limited") setErr("Too many photos in a short time. Please wait a minute and try again.");
      else setErr("We could not read that photo. Lay the bill flat in good light with every line in the frame, then try again. Or use the sample photo to see how it works.");
    } finally {
      clearInterval(timer); setBusy("");
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  }

  async function runSamplePhoto() {
    try {
      const blob = await (await fetch("/sample-soa.jpg")).blob();
      await onFile(new File([blob], "sample-soa.jpg", { type: "image/jpeg" }), true);
    } catch { useSample(); }
  }

  const editLine = (i: number, p: Partial<BillLine>) => setBill((b) => b && { ...b, lines: b.lines.map((l, j) => (j === i ? { ...l, ...p, lowConfidence: false } : l)) });
  const total = bill ? bill.lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0) : 0;

  const goStep = (n: number) => { setStep(n); window.scrollTo(0, 0); };
  const Seg = () => (
    <div role="group" aria-label="Language" className="seg no-print">
      {(["en", "tl"] as Lang[]).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}>{l === "en" ? "English" : "Taglish"}</button>)}
    </div>
  );
  const stated = bill?.total ?? 0;
  const mismatch = bill && stated > 0 && Math.abs(stated - total) > Math.max(1, stated * 0.01);
  const lowLines = bill ? bill.lines.filter((l) => l.lowConfidence).length : 0;

  return (
    <div className="min-h-screen">
      <header className="app-header no-print">
        <div className="app-header-in">
          <button onClick={() => goStep(0)} aria-label="Akop home" className="brand-lockup">
            <svg className="brand-mark" viewBox="0 0 88 88" aria-hidden="true"><rect width="88" height="88" rx="26" fill="#075E57"/><path d="M29 19h23l12 12v37a7 7 0 0 1-7 7H29a7 7 0 0 1-7-7V26a7 7 0 0 1 7-7Z" fill="#F7F8F6"/><path d="M52 19v12h12" fill="#CBE7E1"/><path d="M32 37h17M32 46h14" stroke="#7B958D" strokeWidth="3.5" strokeLinecap="round"/><path d="m34 59 6.5 6.5L54 52" fill="none" stroke="#D99B35" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="brand-name">Ak<span>op</span></span>
          </button>
          {step > 0 && (
            <ol className="stepper" aria-label="Progress">
              {["Bill", "Details", "Plan"].map((s, i) => (
                <li key={s} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""}>
                  <span className="dot">{step > i + 1 ? <svg viewBox="0 0 16 16" aria-label="Complete"><path d="m3 8.2 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}</span><span className="lbl">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </header>

      <main className={step === 0 ? "mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-10" : "page"}>
        {step === 0 && (
          <section className="landing-grid">
            <div className="landing-copy">
              <h1 className="landing-title">Understand your hospital <em>bill.</em></h1>
              <p className="landing-intro">Take a photo of the Statement of Account (SOA). We’ll explain the charges, estimate what may remain, and make a step-by-step aid plan.</p>
              <ol className="journey" aria-label="What happens next">
                <li><span aria-hidden="true"/><div><b>Understand the bill</b><small>Review each charge in plain English or Taglish.</small></div></li>
                <li><span aria-hidden="true"/><div><b>Check possible support</b><small>See what may apply, with the reason and source.</small></div></li>
                <li><span aria-hidden="true"/><div><b>Know where to go</b><small>Get an ordered list of offices and documents.</small></div></li>
              </ol>
            </div>
            <div className="capture-panel">
              <p className="panel-label">Start with your bill</p>
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button onClick={() => camRef.current?.click()} disabled={!!busy} className="capture-primary">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
                <span>{busy || "Take a photo of the bill"}</span>
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="capture-secondary">Choose a photo from this device</button>
              <button onClick={runSamplePhoto} disabled={!!busy} className="sample-link">Try the fictional sample bill <span aria-hidden="true">→</span></button>
              {busy && <p className="capture-tip" role="status" aria-live="polite">{busy} This takes about 10 to 20 seconds.</p>}
              {!busy && <p className="capture-tip">Lay the bill flat in good light. Keep every line and the total in frame.</p>}
              {err && <p role="alert" className="capture-error">{err}</p>}
              <div className="privacy-note"><span className="privacy-dot" aria-hidden="true"/>Your photo is used to read the bill and isn’t saved on our server.</div>
            </div>
            <p className="estimate-note"><b>Planning estimate only.</b> Aid and final balances are decided by the hospital or agency. Every result includes its source and what still needs confirmation.</p>
          </section>
        )}

        {step === 1 && bill && (
          <section className="stack">
            <div className="page-head">
              <div>
                <p className="eyebrow">Step 1 of 3 · Check the bill</p>
                <h1 className="h1">Here’s what we <em>read</em></h1>
                <p className="lede">Compare with your paper bill. Tap any amount or name to fix it.</p>
              </div>
              <Seg />
            </div>

            <div className="card summary receipt-top">
              <p className="receipt-title">Statement of account · read by Akop</p>
              <div><p className="k">Hospital</p><p className="v">{bill.hospitalName}</p></div>
              <div className="sum-row">
                <div><p className="k">Lines add to</p><p className="v num">{peso(total)}</p></div>
                {stated > 0 && <div><p className="k">Bill says</p><p className="v num">{peso(stated)}</p></div>}
              </div>
              {mismatch ? <p className="notice"><StatusMark tone="warning" />The lines and the bill total differ by {peso(Math.abs(stated - total))}. Check for a missing or misread line.</p>
                : <p className="ok"><StatusMark tone="success" />Lines match the bill total.</p>}
              {lowLines > 0 && <p className="notice"><StatusMark tone="warning" />{lowLines} line{lowLines > 1 ? "s" : ""} we could not read clearly. They are marked below.</p>}
            </div>

            <ul className="lines receipt-body">
              {bill.lines.map((l, i) => (
                <li key={i} className={`line ${l.lowConfidence ? "warn" : ""} ${l.category === "deduction" ? "deduct" : ""}`}>
                  <div className="line-top">
                    <input aria-label="Charge name" value={l.description} onChange={(e) => editLine(i, { description: e.target.value })} className="line-name" />
                    <label className="amount">
                      <span aria-hidden="true">{l.category === "deduction" ? "−₱" : "₱"}</span>
                      <input aria-label={`Amount for ${l.description}`} inputMode="decimal" value={l.amount} onChange={(e) => editLine(i, { amount: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                    </label>
                  </div>
                  <div className="line-meta">
                    <select aria-label="Category" value={l.category} onChange={(e) => editLine(i, { category: e.target.value as BillLine["category"] })} className="chip-select">
                      {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {l.lowConfidence && <span className="flag-text"><StatusMark tone="warning" />Please check this line</span>}
                    <button className="remove" onClick={() => setBill({ ...bill, lines: bill.lines.filter((_, j) => j !== i) })}>Remove</button>
                  </div>
                  {l.category !== "deduction" && expl[l.description] && <p className="explain"><span className="explain-tag">{t("What this is", "Ano ito")}</span>{expl[l.description][lang]}</p>}
                </li>
              ))}
            </ul>
            <button onClick={() => setBill({ ...bill, lines: [...bill.lines, { category: "other", description: "New charge", qty: 1, amount: 0 }] })} className="btn-ghost">+ Add a missing line</button>

            <div className="sticky-cta">
              <button className="btn-primary" onClick={() => {
                const det = detectFromBill(bill);
                const merged: Detected = { ...bill.detected, ...Object.fromEntries(Object.entries(det).filter(([, v]) => v !== undefined)), notes: det.notes.length ? det.notes : bill.detected?.notes ?? [] };
                // Keep the total printed on the bill; the rules flag any gap between it and the lines.
                setBill({ ...bill, total: stated > 0 ? stated : total, detected: merged });
                setAns({ hospitalType: merged.hospitalType, room: merged.room, setting: merged.setting, philhealth: merged.philhealth, category: merged.category, ...Object.fromEntries(Object.entries(ans).filter(([, v]) => v !== undefined)) });
                goStep(2);
              }}>Looks right · Continue</button>
            </div>
          </section>
        )}

        {step === 2 && bill && (
          <section className="stack">
            <div className="page-head">
              <div>
                <p className="eyebrow">Step 2 of 3 · Details</p>
                <h1 className="h1">We filled in what your bill <em>shows</em></h1>
                <p className="lede">Check these, then answer two questions about your household.</p>
              </div>
            </div>

            <div className="card">
              <h2 className="h2">From your bill</h2>
              <Fact k="hospitalType" label="Hospital" ans={ans} setAns={setAns} bill={bill} note={<HospitalHint bill={bill} />} warn={bill.hospitalGuess?.status === "check"}
                opts={[["doh", "DOH hospital", "Includes Heart Center, Lung Center, NKTI, PCMC"], ["lgu", "City / provincial (LGU)", ""], ["private", "Private hospital", ""]]} />
              <Fact k="room" label="Room" ans={ans} setAns={setAns} bill={bill} note="From the room line on your bill."
                opts={[["ward", "Ward / basic", "Shared, no extra room charge"], ["private", "Semi-private or private", ""]]} />
              <Fact k="setting" label="Care" ans={ans} setAns={setAns} bill={bill} note="Your bill has a room charge."
                opts={[["inpatient", "Admitted (confined)", ""], ["outpatient", "Outpatient", "Dialysis, chemo, check-ups"]]} />
              <Fact k="philhealth" label="PhilHealth" ans={ans} setAns={setAns} bill={bill} note="A PhilHealth deduction is on your bill."
                opts={[["active", "Active member", ""], ["none", "No / not sure", ""]]} />
              <Fact k="category" label="Patient" ans={ans} setAns={setAns} bill={bill} note="From a discount line on your bill."
                opts={[["none", "None of these", ""], ["senior", "Senior citizen (60+)", ""], ["pwd", "Person with disability", ""], ["minor", "Child under 18", ""]]} />
            </div>

            <div className="card">
              <h2 className="h2">About your household</h2>
              <p className="hint">Used only to estimate aid. Stays on this device.</p>
              <Choice label="Monthly household income" value={ans.income} on={(v) => setAns({ ...ans, income: v })}
                opts={[["low", "Below ₱15,000", ""], ["middle", "₱15,000 to ₱40,000", ""], ["high", "Above ₱40,000", ""]]} />
              <fieldset className="q">
                <legend className="q-label">People who depend on this income</legend>
                <div className="stepper-num">
                  <button aria-label="Fewer" onClick={() => setAns({ ...ans, dependents: Math.max(0, (ans.dependents ?? 0) - 1) })}>−</button>
                  <output aria-live="polite">{ans.dependents ?? "–"}</output>
                  <button aria-label="More" onClick={() => setAns({ ...ans, dependents: (ans.dependents ?? 0) + 1 })}>+</button>
                </div>
              </fieldset>
              <label className="q">
                <span className="q-label">Other amount already covered <span className="opt">(optional)</span></span>
                <span className="hint">HMO, or a PhilHealth amount the hospital quoted that is not on the bill yet.</span>
                <span className="money-field"><span>₱</span><input inputMode="numeric" aria-label="Other amount already covered" value={ans.otherCredit ?? ""} onChange={(e) => setAns({ ...ans, otherCredit: Number(e.target.value.replace(/\D/g, "")) || undefined })} /></span>
              </label>
            </div>

            <div className="sticky-cta">
              {!complete && <p className="cta-hint">Answer the questions marked “Needs your answer” to continue.</p>}
              <button className="btn-primary" disabled={!complete} onClick={() => goStep(3)}>Show my plan</button>
            </div>
          </section>
        )}

        {step === 3 && bill && plan && (
          <section className="stack">
            <div className="page-head">
              <div>
                <p className="eyebrow">Step 3 of 3 · {t("Your plan", "Ang plano mo")}</p>
                <h1 className="h1">{lang === "en" ? <>What you may owe, and what to do <em>next</em></> : <>Magkano ang babayaran, at ano ang <em>susunod</em></>}</h1>
              </div>
              <Seg />
            </div>
            <p role="note" className="estimate-banner"><b>{t("Estimate only.", "Estimate lang ito.")}</b> {t("Confirm with the hospital billing office or PhilHealth. Aid is assessed case by case and is not guaranteed.", "Kumpirmahin sa billing office ng ospital o sa PhilHealth. Case by case ang assessment ng tulong at hindi ito garantisado.")}</p>

            <div>
              <p className="k">{t(`From ${peso(total)} billed`, `Mula sa ${peso(total)} na sinisingil`)}</p>
              <ul className="scenarios">
                {plan.scenarios.map((sc, i) => (
                  <li key={sc.id} className={`scenario ${i === 0 ? "lead" : ""}`}>
                    <p className="sc-label">{sc.label[lang]}</p>
                    <p className="sc-amount">{peso(sc.amount)}</p>
                    <p className="sc-when"><b>{t("What decides it: ", "Ano ang magpapasya: ")}</b>{sc.when[lang]}</p>
                  </li>
                ))}
              </ul>
            </div>

            {plan.flags.length > 0 && (
              <div className="card">
                <h2 className="h2">{t("Ask billing about these", "Itanong sa billing ang mga ito")}</h2>
                <ul className="flags">{plan.flags.map((f, i) => <li key={i}><StatusMark tone="warning" />{f}</li>)}</ul>
              </div>
            )}

            <div className="card">
              <h2 className="h2">{t("Your plan, in order", "Ang plano mo, ayon sa pagkakasunod")}</h2>
              <p className="hint">{t("A practical order. Offices may direct you differently. Ticks are saved on this device.", "Mungkahing pagkakasunod. Puwedeng iba ang ituro ng opisina. Naka-save sa device na ito ang mga tsek.")}</p>
              <ol className="checklist">
                {plan.checklist.map((s) => (
                  <li key={s.order} className={done[s.order] ? "is-done" : ""}>
                    <span className="ck-num" aria-hidden="true">{s.order}</span>
                    <div className="ck-body">
                      <p className="ck-office">{s.office}</p>
                      <p>{s.action}</p>
                      {s.bring.length > 0 && <p className="ck-bring"><b>{t("Bring", "Dalhin")}:</b> {s.bring.join(" · ")}</p>}
                      <p className="ck-covers">{t("Covers", "Sakop")}: {s.covers}</p>
                    </div>
                    <label className="ck-box no-print"><input type="checkbox" checked={!!done[s.order]} onChange={(e) => setDone({ ...done, [s.order]: e.target.checked })} /><span className="sr-only">Done</span></label>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card">
              <h2 className="h2">{t("Programs that may help", "Mga programang puwedeng tumulong")}</h2>
              <ul className="programs">{plan.programs.filter((p) => p.status !== "no").map((p) => <Program key={p.id} p={p} />)}</ul>
            </div>

            <div className="card">
              <h2 className="h2">{t("How we got there", "Paano namin ito nakuha")}</h2>
              <ul className="ledger">
                {plan.waterfall.map((w, i) => (
                  <li key={i}>
                    <span>{w.label}{w.note && <small> {w.note}</small>}</span>
                    {w.amount !== 0 && <span className={`num ${w.amount < 0 ? "minus" : ""}`}>{w.amount < 0 ? "−" : ""}{peso(Math.abs(w.amount))}</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card rights">
              <h2 className="h2">{t("If you cannot pay now", "Kung hindi ka pa makabayad")}</h2>
              <p>{plan.detentionNote}</p>
              <p className="script"><b>{t("You can say:", "Puwede mong sabihin:")}</b> {t("“Please show me my PhilHealth deduction and give me an itemized bill. I would like to see the social worker for an assessment before I pay.”", "“Pakipakita po ang PhilHealth deduction ko at bigyan po ako ng itemized na bill. Gusto ko pong makausap ang social worker para ma-assess bago ako magbayad.”")}</p>
            </div>

            <div className="card">
              <h2 className="h2">{t("Request letter", "Sulat ng request")} <span className="opt">(English)</span></h2>
              <div className="letter-fields no-print">
                {([["patient", "Patient name"], ["requester", "Your name"], ["relationship", "Relationship (e.g. daughter)"], ["contact", "Contact number"]] as const).map(([k, ph]) => (
                  <label key={k}><span>{ph}</span><input value={lf[k]} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} /></label>
                ))}
              </div>
              <pre className="letter">{letter}</pre>
            </div>

            <div className="card limits">
              <h2 className="h2">{t("What this cannot tell you", "Ang hindi masasabi ng tool na ito")}</h2>
              <ul>{LIMITS.map((l, i) => <li key={i}>{l[lang]}</li>)}</ul>
            </div>

            <div className="actions no-print">
              <button className="btn-primary" onClick={() => window.print()}>{t("Print plan and letter", "I-print ang plano at sulat")}</button>
              <button className="btn-secondary" onClick={() => goStep(2)}>{t("Change my answers", "Baguhin ang sagot ko")}</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

type FactKey = "hospitalType" | "room" | "setting" | "philhealth" | "category";

function Fact<K extends FactKey>({ k, label, ans, setAns, bill, note, warn, opts }: {
  k: K; label: string; ans: Partial<Answers>; setAns: (a: Partial<Answers>) => void; bill: Bill; note: React.ReactNode; warn?: boolean; opts: [Answers[K], string, string][];
}) {
  const [open, setOpen] = useState(false);
  const value = ans[k] as Answers[K] | undefined;
  const fromBill = value !== undefined && (value as string) === (bill.detected?.[k] as string | undefined);
  const show = open || value === undefined;
  const current = opts.find(([v]) => v === value)?.[1];
  const tag = value === undefined ? { c: "need", t: "Needs your answer" } : fromBill && warn ? { c: "check", t: "Please check" } : fromBill ? { c: "bill", t: "From your bill" } : { c: "you", t: "Your answer" };
  return (
    <div className="fact">
      <div className="fact-row">
        <div className="fact-main">
          <p className="k">{label}</p>
          <p className="v">{current ?? "Not on the bill"}</p>
          {fromBill && <p className={`fact-note ${warn ? "warn" : ""}`}>{note}</p>}
        </div>
        <div className="fact-side">
          <span className={`tag ${tag.c}`}>{tag.c === "bill" && <StatusMark tone="success" />}{tag.c === "check" && <StatusMark tone="warning" />}{tag.t}</span>
          {value !== undefined && <button className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Done" : "Change"}</button>}
        </div>
      </div>
      {show && (
        <div className="choices" role="group" aria-label={label}>
          {opts.map(([v, t, sub]) => (
            <button key={String(v)} type="button" aria-pressed={value === v} className="choice" onClick={() => { setAns({ ...ans, [k]: v }); setOpen(false); }}>
              <span>{t}</span>{sub && <small>{sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Choice<T extends string>({ label, value, on, opts }: { label: string; value?: T; on: (v: T) => void; opts: [T, string, string][] }) {
  return (
    <fieldset className="q">
      <legend className="q-label">{label}</legend>
      <div className="choices">
        {opts.map(([v, t, sub]) => (
          <button key={v} type="button" aria-pressed={value === v} className="choice" onClick={() => on(v)}>
            <span>{t}</span>{sub && <small>{sub}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Program({ p }: { p: ProgramResult }) {
  const b = BADGE[p.status];
  return (
    <li className="program">
      <div className="program-head"><h3>{p.name}</h3><span className={`tag stamp ${b.c}`}>{b.c === "bill" && <StatusMark tone="success" />}{b.c === "check" && <StatusMark tone="warning" />}{b.t}</span></div>
      <p>{p.reason}</p>
      <details>
        <summary className="no-print">Why this result?</summary>
        <div className="why">
          <p><b>Based on:</b> {p.triggers.join(" · ")}</p>
          <p><b>Source:</b> <a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.source}</a>, checked {p.lastVerified}</p>
          <p><b>Not yet verified:</b> {p.caveat}</p>
        </div>
      </details>
    </li>
  );
}

function HospitalHint({ bill }: { bill: Bill }) {
  const g = bill.hospitalGuess;
  if (!g) return <>Read from the hospital name on your bill.</>;
  const lead = g.status === "confirmed" ? "Checked two ways." : g.status === "likely" ? "Our best read." : "Please double-check.";
  return (
    <>
      {lead} {g.evidence} {g.sourceUrl && <a href={g.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
    </>
  );
}
