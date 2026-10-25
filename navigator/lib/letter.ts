import type { Answers, Bill, Plan } from "./types";

export interface LetterFields {
  patient: string;
  requester: string;
  relationship: string;
  contact: string;
}

const peso = (n: number) => `PHP ${Math.round(n).toLocaleString("en-PH")}`;

// Deterministic template. No AI, so it is free, instant and predictable.
export function buildLetter(bill: Bill, a: Answers, plan: Plan, f: LetterFields): string {
  const progs = plan.programs
    .filter((p) => (p.status === "likely" || p.status === "maybe") && ["maifip", "aics", "pcso"].includes(p.id))
    .map((p) => p.name);
  const date = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  return `${date}

The Medical Social Worker / Social Service Officer
${bill.hospitalName}

Subject: Request for assessment and medical assistance

Dear Ma'am/Sir,

I am ${f.requester || "[your name]"}, the ${f.relationship || "[relationship]"} of ${f.patient || "[patient name]"}, who is currently ${a.setting === "inpatient" ? "confined" : "receiving outpatient care"} in your hospital${a.room === "ward" ? " in a ward bed" : ""}.

The Statement of Account shows total charges of ${peso(bill.total)}. After PhilHealth and applicable discounts, our estimated remaining balance, if no aid is approved, is ${peso(plan.scenarios.find((x) => x.id === "no_aid")?.amount ?? plan.remaining.max)}. Our household has ${a.dependents} dependent(s) and our family is unable to pay this amount without serious hardship.

I respectfully request:
1. An assessment by your social worker of our eligibility for medical assistance.
2. Endorsement or referral to the programs we may qualify for: ${progs.length ? progs.join("; ") : "MAIFIP, DSWD AICS and PCSO"}.
3. Confirmation that PhilHealth benefits${a.category === "senior" || a.category === "pwd" ? " and our senior citizen/PWD discount have" : " have"} been applied to the bill.
4. A written list of the documents we still need to submit.

Attached are the documents requested. You may reach me at ${f.contact || "[contact number]"}.

Thank you for your help.

Respectfully,

${f.requester || "[your name]"}`;
}
