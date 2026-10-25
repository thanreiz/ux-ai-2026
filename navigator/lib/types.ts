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
}

export interface Answers {
  hospitalType: "doh" | "lgu" | "private";
  room: "ward" | "private";
  setting: "inpatient" | "outpatient";
  philhealth: "active" | "none";
  category: "none" | "senior" | "pwd" | "minor";
  income: "low" | "middle" | "high";
  dependents: number;
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

export interface Plan {
  programs: ProgramResult[];
  waterfall: WaterfallStep[];
  remaining: { min: number; max: number };
  flags: string[];
  checklist: ChecklistStep[];
  detentionNote: string;
}
