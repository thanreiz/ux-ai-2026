import type { Answers, Bill, ChecklistStep, Plan, ProgramResult, WaterfallStep } from "./types";

// Every rule is plain code. AI never decides eligibility.
// Facts come from Codex research (2026-10-25). Items marked caveat are UNVERIFIED against full official texts.
const V = "2026-10-25";
const AICS_CAP = 75_000; // DSWD FO10: max in extremely justifiable cases, subject to approval/funds
const DISCOUNT_RATE = 0.2; // RA 9994 / RA 10754: 20% on covered medicines and specified services

const peso = (n: number) => `PHP ${Math.round(n).toLocaleString("en-PH")}`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function evaluate(bill: Bill, a: Answers): Plan {
  const gross = sum(bill.lines.filter((l) => l.category !== "deduction").map((l) => l.amount));
  const shownDeductions = sum(bill.lines.filter((l) => l.category === "deduction").map((l) => l.amount));
  const meds = sum(bill.lines.filter((l) => l.category === "medicine").map((l) => l.amount));
  const isPublic = a.hospitalType !== "private";
  const lowIncome = a.income === "low" || (a.income === "middle" && a.dependents >= 3);
  const programs: ProgramResult[] = [];

  // ZBB: DOH hospitals incl. 4 GOCC specialty hospitals (DO 2026-0443, 18 Sep 2026). Ward bed, inpatient, member.
  const zbbCore = a.philhealth === "active" && a.room === "ward" && a.setting === "inpatient";
  const zbb = zbbCore && a.hospitalType === "doh" ? "likely" : zbbCore && a.hospitalType === "lgu" ? "maybe" : "no";
  programs.push({
    id: "zbb", name: "Zero Balance Billing (ZBB)", status: zbb,
    reason: zbb === "likely" ? "Ward bed at a DOH hospital (this includes Heart Center, Lung Center, NKTI and PCMC) with active PhilHealth: the covered hospital bill may be PHP 0."
      : zbb === "maybe" ? "LGU hospitals are not covered across the board. Only selected LGU hospitals are in the expansion. Ask the billing office."
      : "ZBB does not apply to private rooms, private hospitals, outpatient care or non-members.",
    triggers: [`Hospital: ${a.hospitalType.toUpperCase()}`, `Room: ${a.room}`, `Setting: ${a.setting}`, `PhilHealth: ${a.philhealth}`],
    covers: "Hospital bill for basic/ward accommodation.",
    documents: ["Valid ID", "PhilHealth ID or MDR"],
    office: "PhilHealth CARES nurse or hospital billing office",
    caveat: "Full 2026 order text not read. Income rule, non-member enrollment, outpatient and exact exclusions are unverified.",
    source: "DOH DO 2026-0443 notice, 18 Sep 2026", sourceUrl: "https://sites.google.com/view/doh-hfdb/2026-q3-updates/do-2026-0443", lastVerified: V,
  });

  programs.push({
    id: "philhealth", name: "PhilHealth case-rate benefit", status: a.philhealth === "active" ? "applies" : "no",
    reason: a.philhealth === "active"
      ? "Accredited hospitals deduct the case rate from the bill before discharge. It covers hospital charges and attending physician professional fees."
      : "No active membership: ask the hospital social service about enrolling now.",
    triggers: [`PhilHealth: ${a.philhealth}`],
    covers: "Fixed case rate per diagnosis, including professional fees.",
    documents: ["PhilHealth ID or MDR (or PBEF)", "Claim Form 1 (the hospital files the claim)"],
    office: "Hospital billing / PhilHealth desk",
    caveat: "How a patient gets reimbursement if the hospital failed to deduct is unverified. Insist it is applied before discharge.",
    source: "PhilHealth benefits page", sourceUrl: "https://www.philhealth.gov.ph/benefits/", lastVerified: V,
  });

  const discountOn = a.category === "senior" || a.category === "pwd";
  programs.push({
    id: "discount", name: a.category === "pwd" ? "PWD discount" : "Senior citizen discount", status: discountOn ? "applies" : "no",
    reason: discountOn ? "20% discount and VAT exemption on covered medicines and specified services. Applied before aid."
      : a.category === "minor" ? "No blanket hospital discount was found for minors. They may qualify for specific packages."
      : "No category discount selected.",
    triggers: [`Patient: ${a.category}`],
    covers: "20% off eligible items (estimated here on medicines only).",
    documents: ["Senior citizen or PWD ID"],
    office: "Hospital billing / cashier",
    caveat: "Which lines count as covered services depends on the hospital. Estimate only.",
    source: "RA 9994, RA 10754", sourceUrl: "https://lawphil.net/statutes/repacts/ra2010/ra_9994_2010.html", lastVerified: V,
  });

  programs.push({
    id: "maifip", name: "DOH MAIFIP medical assistance", status: isPublic ? (lowIncome ? "likely" : "maybe") : "maybe",
    reason: isPublic ? "Medical aid for indigent and financially incapacitated patients, assessed by a social worker. No politician letter is involved."
      : "Only some privately owned institutions take part. Ask whether your hospital is a participating facility.",
    triggers: [`Hospital: ${a.hospitalType.toUpperCase()}`, `Income: ${a.income}`, `Dependents: ${a.dependents}`],
    covers: "Part of the remaining balance, as assessed and funded.",
    documents: ["Request letter", "Physician order and costing", "Clinical abstract or medical certificate", "Social worker eligibility certificate", "Valid ID"],
    office: "Hospital social service / Malasakit Center",
    caveat: "Based on a regional charter. Exact 2026 documents and any proof-of-income rule are in AO 2026-0031, not yet read.",
    source: "DOH AO 2026-0031 notice, 25 Feb 2026", sourceUrl: "https://sites.google.com/view/doh-hfdb/2026-q1-updates/ao-2026-0031", lastVerified: V,
  });

  programs.push({
    id: "aics", name: "DSWD AICS medical assistance", status: lowIncome ? "likely" : "maybe",
    reason: "Case-assessed aid for families in crisis. Amounts above PHP 5,000 are usually paid to the hospital through a guarantee letter, not cash.",
    triggers: [`Income: ${a.income}`, `Dependents: ${a.dependents}`],
    covers: `Part of the balance after other aid. Up to ${peso(AICS_CAP)} in extremely justified cases.`,
    documents: ["Valid ID", "Proof of low income or certificate of indigency", "Medical certificate or abstract or discharge summary", "Statement of Account or certificate of balance"],
    office: "DSWD field office or the DSWD desk in the hospital",
    caveat: "Award is discretionary: subject to assessment, funds and approval.",
    source: "DSWD MC 30 s.2024; DSWD FO10", sourceUrl: "https://fo10.dswd.gov.ph/services/assistance-in-crisis-situation/to-individuals/", lastVerified: V,
  });

  programs.push({
    id: "pcso", name: "PCSO Medical Access Program", status: "maybe",
    reason: "Covers confinement, chemotherapy medicines and dialysis medicines. Strongest for dialysis and chemo.",
    triggers: [`Setting: ${a.setting}`],
    covers: "Hospital confinement and medicines per its published categories.",
    documents: ["Original Statement of Account", "Medical abstract or discharge summary", "Valid IDs", "PCSO MAP application", "For chemo/dialysis meds: prescription and 3 supplier quotations"],
    office: "PCSO branch or the PCSO desk in a Malasakit Center",
    caveat: "Whether PCSO pays a doctor's professional fee is unverified. Do not assume it.",
    source: "PCSO Citizens Charter, rev. 16 Nov 2023", sourceUrl: "https://www.pcso.gov.ph/pcsofiles/transparency/PCSO%20Citizens%20Charter%202023%20%28rev%202023-11-16%29.pdf", lastVerified: V,
  });

  programs.push({
    id: "malasakit", name: "Malasakit Center", status: isPublic ? "likely" : "no",
    reason: isPublic ? "DOH hospitals must have one. It puts DOH, DSWD, PCSO and PhilHealth desks in one place. Other public hospitals may have one too."
      : "Malasakit Centers are in public hospitals.",
    triggers: [`Hospital: ${a.hospitalType.toUpperCase()}`],
    covers: "One-stop access to the aid desks.",
    documents: [], office: "Malasakit Center inside the hospital",
    caveat: "Current full list of centers not confirmed. Ask the hospital.",
    source: "RA 11463", sourceUrl: "https://lawphil.net/statutes/repacts/ra2019/ra_11463_2019.html", lastVerified: V,
  });

  // Waterfall. Order: mandatory discount and PhilHealth first, then ZBB, then discretionary aid sets the range.
  const waterfall: WaterfallStep[] = [{ label: "Billed", amount: gross }];
  let balance = gross;
  if (shownDeductions > 0) { waterfall.push({ label: "Already deducted on bill", amount: -shownDeductions }); balance -= shownDeductions; }
  if (discountOn && meds > 0) {
    const d = meds * DISCOUNT_RATE;
    waterfall.push({ label: "Senior/PWD 20% on medicines", amount: -d, note: "Estimate" }); balance -= d;
  }
  if (a.otherCredit && a.otherCredit > 0) { waterfall.push({ label: "Other cover you told us about", amount: -a.otherCredit }); balance -= a.otherCredit; }
  balance = Math.max(0, balance);
  const max = balance;
  let min = balance;
  if (zbb === "likely") { min = 0; waterfall.push({ label: "ZBB if confirmed", amount: -balance, note: "Best case. Confirm with the hospital." }); }
  else if (lowIncome && isPublic) min = Math.max(0, balance - AICS_CAP);
  else if (lowIncome) min = Math.max(0, balance - AICS_CAP);
  waterfall.push({ label: "Estimated remaining", amount: 0, note: `${peso(min)} to ${peso(max)}` });

  const flags: string[] = [];
  if (a.room === "ward" && bill.lines.some((l) => l.category === "room" && /private|semi/i.test(l.description)))
    flags.push("You said ward, but the bill has a private or semi-private room line. Ask why.");
  if (a.philhealth === "active" && a.setting === "inpatient" && shownDeductions === 0)
    flags.push("PhilHealth is active but no deduction appears on this bill. Ask billing to apply the case rate before discharge.");
  if (zbb === "likely" && bill.lines.some((l) => l.category === "professional_fee" && l.amount > 0))
    flags.push("Professional fees are charged during a ZBB-eligible stay. Raise it with the PhilHealth CARES nurse.");
  const seen = new Map<string, { n: number; amt: number; d: string }>();
  for (const l of bill.lines) {
    const k = `${l.description.toLowerCase()}|${l.amount}`;
    const e = seen.get(k) ?? { n: 0, amt: l.amount, d: l.description };
    e.n++; seen.set(k, e);
  }
  for (const e of seen.values()) if (e.n > 1 && e.amt > 0) flags.push(`Possible duplicate: "${e.d}" appears ${e.n} times at ${peso(e.amt)}.`);
  const lineSum = gross - 0;
  if (bill.total > 0 && Math.abs(lineSum - bill.total) > Math.max(1, bill.total * 0.01) && Math.abs(lineSum - shownDeductions - bill.total) > Math.max(1, bill.total * 0.01))
    flags.push(`The lines add up to ${peso(lineSum)} but the bill total says ${peso(bill.total)}. Ask billing to explain the difference.`);

  return { programs, waterfall, remaining: { min, max }, flags, checklist: buildChecklist(programs, a), detentionNote: detention(a) };
}

function detention(a: Answers) {
  return a.room === "private"
    ? "RA 9439 bars hospitals from detaining patients over unpaid bills, but it does not cover patients in private rooms. Ask for a payment arrangement in writing."
    : "RA 9439 bars hospitals from holding a patient solely because of an unpaid bill. If you cannot pay, you may sign a promissory note secured by a mortgage or co-maker, and the hospital must release the medical certificate and papers.";
}

function buildChecklist(ps: ProgramResult[], a: Answers): ChecklistStep[] {
  const st = (id: ProgramResult["id"]) => ps.find((p) => p.id === id)!;
  const steps: Omit<ChecklistStep, "order">[] = [];
  steps.push({
    office: "Hospital billing", action: "Ask billing to show PhilHealth" + (a.category === "senior" || a.category === "pwd" ? " and your senior/PWD discount" : "") + " already applied. Request an itemized SOA.",
    bring: ["Valid ID", "PhilHealth ID or MDR", ...(a.category === "senior" || a.category === "pwd" ? ["Senior citizen / PWD ID"] : [])],
    covers: "Case rate and mandatory discounts come off first.",
  });
  if (st("zbb").status === "likely") steps.push({
    office: "PhilHealth CARES nurse", action: "If you were billed in a ward bed at a DOH hospital, ask if ZBB applies to your stay.", bring: st("zbb").documents, covers: "Possible PHP 0 balance for covered charges.",
  });
  if (st("malasakit").status === "likely") steps.push({
    office: "Malasakit Center", action: "Start here for the remaining balance. One desk each for DOH, DSWD, PCSO and PhilHealth.", bring: ["Valid ID", "SOA", "Medical certificate"], covers: "One-stop access to the aid desks.",
  });
  steps.push({ office: "Hospital social service", action: "Ask for a social worker assessment. It unlocks MAIFIP and supports the DSWD application.", bring: st("maifip").documents, covers: st("maifip").covers });
  steps.push({ office: "DSWD (AICS)", action: "Apply for the part still unpaid. Amounts over PHP 5,000 are usually a guarantee letter to the hospital.", bring: st("aics").documents, covers: st("aics").covers });
  steps.push({ office: "PCSO", action: "Apply if the bill includes confinement, chemo medicines or dialysis medicines.", bring: st("pcso").documents, covers: st("pcso").covers });
  return steps.map((s, i) => ({ ...s, order: i + 1 }));
}
