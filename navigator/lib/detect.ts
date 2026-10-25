import type { Answers, Bill } from "./types";

// Names we match by plain code before asking any model. Always shown to the user as "from your bill, please confirm".
const DOH_HOSPITALS = [
  "philippine heart center", "lung center of the philippines", "national kidney and transplant institute", "nkti",
  "philippine children's medical center", "pcmc", "vicente sotto memorial", "east avenue medical center", "jose fabella",
  "jose r. reyes memorial", "rizal medical center", "san lazaro hospital", "tondo medical center", "amang rodriguez",
  "quirino memorial", "philippine orthopedic center", "research institute for tropical medicine",
];

export function matchKnownHospital(name: string): Answers["hospitalType"] | null {
  const n = name.toLowerCase();
  return DOH_HOSPITALS.some((h) => n.includes(h)) ? "doh" : null;
}

export type Detected = NonNullable<Bill["detected"]>;

export function detectFromBill(bill: Bill): Detected {
  const d: Detected = { notes: [] };
  const known = matchKnownHospital(bill.hospitalName);
  if (known) { d.hospitalType = known; d.notes.push(`${bill.hospitalName} is on our list of DOH hospitals`); }
  else if (bill.hospitalGuess) { d.hospitalType = bill.hospitalGuess; d.notes.push(`${bill.hospitalName} looks like a ${bill.hospitalGuess === "doh" ? "DOH" : bill.hospitalGuess === "lgu" ? "city/provincial" : "private"} hospital`); }

  const roomLine = bill.lines.find((l) => l.category === "room");
  if (roomLine) {
    d.setting = "inpatient";
    if (/semi|private|suite|executive|deluxe|single|vip/i.test(roomLine.description)) d.room = "private";
    else if (/ward|charity|basic/i.test(roomLine.description)) d.room = "ward";
    if (d.room) d.notes.push(`room line says "${roomLine.description}"`);
  }
  return d;
}
