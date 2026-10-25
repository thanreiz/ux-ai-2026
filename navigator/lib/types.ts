export type LineCategory = "room" | "medicine" | "lab" | "professional_fee" | "supplies" | "other" | "deduction";

export interface BillLine {
  category: LineCategory;
  description: string;
  qty: number;
  amount: number; // PHP, positive; deductions also positive and flagged by category
  lowConfidence?: boolean;
}

export interface Bill {
  hospitalName: string;
  lines: BillLine[];
  total: number;
  hospitalAddress?: string;
  ownershipClues?: string; // header text such as "Provincial Government of ..." or "Inc."
  hospitalGuess?: { type: Answers["hospitalType"]; status: "confirmed" | "likely" | "check"; evidence: string; sourceUrl?: string };
  detected?: { hospitalType?: Answers["hospitalType"]; room?: Answers["room"]; setting?: Answers["setting"]; philhealth?: Answers["philhealth"]; category?: Answers["category"]; notes: string[] };
}

export interface Answers {
  hospitalType: "doh" | "lgu" | "private";
  room: "ward" | "private";
  setting: "inpatient" | "outpatient";
  philhealth: "active" | "none";
  category: "none" | "senior" | "pwd" | "minor";
  income: "low" | "middle" | "high";
  dependents: number;
  otherCredit?: number; // optional: HMO, PhilHealth amount the family was told, other cover already granted
}

export type Status = "applies" | "likely" | "maybe" | "no";

export interface ProgramResult {
  id: "zbb" | "philhealth" | "maifip" | "aics" | "pcso" | "malasakit" | "discount";
  name: string;
  status: Status;
  reason: string;
  triggers: string[]; // human-readable answers that drove the result
  covers: string;
  documents: string[];
  office: string;
  caveat: string; // what is still unverified
  source: string;
  sourceUrl: string;
  lastVerified: string;
}

export interface WaterfallStep {
  label: string;
  amount: number; // negative = reduces balance
  note?: string;
}

export interface ChecklistStep {
  order: number;
  office: string;
  action: string;
  bring: string[];
  covers: string;
}

export interface Scenario {
  id: "zbb" | "no_aid" | "with_aid";
  amount: number;
  label: { en: string; tl: string };
  when: { en: string; tl: string }; // what decides it / who to ask
}

export interface Plan {
  scenarios: Scenario[];
  programs: ProgramResult[];
  waterfall: WaterfallStep[];
  remaining: { min: number; max: number };
  flags: string[];
  checklist: ChecklistStep[];
  detentionNote: string;
}
