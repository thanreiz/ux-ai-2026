import type { Answers, Bill, Plan, ProgramResult, WaterfallStep } from "./types";

// Every rule is plain code. AI never decides eligibility.
// Facts below come from news and third-party guides, NOT official circulars.
// Replace with verified values from the research pass; keep source + lastVerified on each.
const V = "2026-10-25 (unverified)";
const AICS_MAX = 150_000; // reported upper range

const peso = (n: number) => `PHP ${n.toLocaleString("en-PH")}`;

export function evaluate(bill: Bill, a: Answers): Plan {
  const gross = bill.lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0);
  const shownDeductions = bill.lines.filter((l) => l.category === "deduction").reduce((s, l) => s + l.amount, 0);
  const isPublic = a.hospitalType !== "private";
  const programs: ProgramResult[] = [];

  // ZBB: PhilHealth member, ward/basic bed, DOH-run hospital, inpatient.
  const zbbCore = a.philhealth === "active" && a.room === "ward" && a.setting === "inpatient";
  const zbbStatus = zbbCore && a.hospitalType === "doh" ? "applies" : zbbCore && a.hospitalType === "lgu" ? "maybe" : "no";
  programs.push({
    id: "zbb", name: "Zero Balance Billing (ZBB)", status: zbbStatus,
    reason: zbbStatus === "applies" ? "Ward bed at a DOH-run hospital with active PhilHealth: you should pay PHP 0 for covered hospital charges."
      : zbbStatus === "maybe" ? "LGU hospitals are only covered if your hospital is in the expansion list. Ask the billing office."
      : "ZBB does not cover private rooms, private hospitals, outpatient care, or non-members.",
    triggers: [`Hospital: ${a.hospitalType}`, `Room: ${a.room}`, `Setting: ${a.setting}`, `PhilHealth: ${a.philhealth}`],
    covers: "Full hospital bill for basic/ward accommodation (confirm professional fees).",
    documents: ["Valid ID", "PhilHealth ID or MDR"],
    office: "PhilHealth CARES nurse / billing office",
    source: "Inquirer, DOH statements (third-party)", lastVerified: V,
  });

  programs.push({
    id: "philhealth", name: "PhilHealth case-rate deduction", status: a.philhealth === "active" ? "applies" : "no",
    reason: a.philhealth === "active" ? "Case rate should be deducted at billing before discharge. If it is not, pay and file for reimbursement."
      : "No active membership: ask the hospital about point-of-care enrollment.",
    triggers: [`PhilHealth: ${a.philhealth}`],
    covers: "Fixed amount per diagnosis (case rate).",
    documents: ["PhilHealth ID or MDR", "Claim Form 1 to hospital billing"],
    office: "Hospital billing / PhilHealth desk",
    source: "PhilHealth (third-party summary)", lastVerified: V,
  });

  const lowIncome = a.income === "low" || (a.income === "middle" && a.dependents >= 3);
  programs.push({
    id: "maifip", name: "DOH MAIFIP medical assistance",
    status: isPublic && lowIncome ? "likely" : isPublic ? "maybe" : "maybe",
    reason: isPublic ? "For indigent and financially incapacitated patients in government hospitals. No politician guarantee letter needed in 2026."
      : "Private-hospital coverage is uncertain. Ask the hospital social service.",
    triggers: [`Hospital: ${a.hospitalType}`, `Income: ${a.income}`, `Dependents: ${a.dependents}`],
    covers: "Remaining balance after PhilHealth, subject to assessment.",
    documents: ["Valid ID", "Medical certificate", "Hospital bill / SOA", "Proof of income or certificate of indigency"],
    office: "Hospital social service / Malasakit Center",
    source: "DOH statements via Inquirer, Philstar", lastVerified: V,
  });

  programs.push({
    id: "aics", name: "DSWD AICS medical assistance", status: lowIncome ? "likely" : "maybe",
    reason: "Cash up to about PHP 10,000, guarantee letter above that, reported range PHP 1,000 to 150,000. Applies after PhilHealth and MAIFIP.",
    triggers: [`Income: ${a.income}`, `Dependents: ${a.dependents}`],
    covers: "Remainder of the bill, as assessed.",
    documents: ["Valid ID", "Medical certificate", "Hospital bill / SOA", "Certificate of indigency", "Social case study report"],
    office: "DSWD field office / hospital DSWD desk",
    source: "Third-party legal guide", lastVerified: V,
  });

  programs.push({
    id: "pcso", name: "PCSO medical assistance", status: "maybe",
    reason: "Guarantee letters to partner hospitals. Most doctors accept PCSO letters for professional fees. Strongest for dialysis and chemo.",
    triggers: [`Setting: ${a.setting}`],
    covers: "Hospital charges and, usually, professional fees.",
    documents: ["Application form", "Valid ID", "Medical certificate/abstract", "Hospital bill or quotation", "Certificate of indigency", "Social case study"],
    office: "PCSO branch or hospital PCSO desk",
    source: "News item + third-party guide", lastVerified: V,
  });

  programs.push({
    id: "malasakit", name: "Malasakit Center", status: isPublic ? "maybe" : "no",
    reason: isPublic ? "One-stop shop (DOH, DSWD, PhilHealth, PCSO desks) in select public hospitals. Start here if your hospital has one."
      : "Malasakit Centers are in public hospitals.",
    triggers: [`Hospital: ${a.hospitalType}`],
    covers: "Access to all desks in one place.",
    documents: [], office: "Malasakit Center inside the hospital",
    source: "RA 11463", lastVerified: V,
  });

  // Waterfall: gross -> shown deductions -> ZBB -> remaining; aid sets the range.
  const waterfall: WaterfallStep[] = [{ label: "Billed", amount: gross }];
  let balance = gross;
  if (shownDeductions > 0) { waterfall.push({ label: "Already deducted on bill", amount: -shownDeductions }); balance -= shownDeductions; }
  if (zbbStatus === "applies") { waterfall.push({ label: "ZBB (ward, DOH hospital)", amount: -balance, note: "Should be PHP 0" }); balance = 0; }
  const max = Math.max(0, balance);
  const aidPossible = lowIncome ? Math.min(max, AICS_MAX) : 0;
  const min = Math.max(0, max - aidPossible);

  const flags: string[] = [];
  if (a.room === "ward" && bill.lines.some((l) => l.category === "room" && /private|semi/i.test(l.description)))
    flags.push("You said ward, but the bill shows a private or semi-private room line. Ask why.");
  if (a.philhealth === "active" && shownDeductions === 0 && zbbStatus !== "applies")
    flags.push("PhilHealth is active but no deduction appears on the bill. Ask billing to apply the case rate before discharge.");
  if (zbbStatus === "applies" && bill.lines.some((l) => l.category === "professional_fee" && l.amount > 0))
    flags.push("Professional fees are billed during a ZBB-eligible stay. Raise it with the PhilHealth CARES nurse.");
  const seen = new Map<string, number>();
  for (const l of bill.lines) { const k = `${l.description}|${l.amount}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  for (const [k, n] of seen) if (n > 1 && k.split("|")[1] !== "0") flags.push(`Possible duplicate charge: "${k.split("|")[0]}" appears ${n} times at ${peso(Number(k.split("|")[1]))}.`);

  return { programs, waterfall, remaining: { min, max }, flags };
}
