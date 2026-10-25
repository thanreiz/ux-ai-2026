import type { Bill } from "./types";

// Clearly fictional demo bill. No real patient or hospital data.
const lines: Bill["lines"] = [
  { category: "other", description: "Emergency room / admission fee", qty: 1, amount: 2500 },
  { category: "room", description: "Ward bed (5 nights)", qty: 5, amount: 9000 },
  { category: "medicine", description: "IV antibiotics (ceftriaxone)", qty: 10, amount: 18400 },
  { category: "medicine", description: "Pharmacy - oral meds and IV fluids", qty: 1, amount: 12350 },
  { category: "lab", description: "CBC and blood chemistry panel", qty: 1, amount: 3200 },
  { category: "lab", description: "Chest X-ray", qty: 1, amount: 1100 },
  { category: "lab", description: "CT scan - abdomen", qty: 1, amount: 9800 },
  { category: "supplies", description: "Syringes, IV sets, gloves", qty: 1, amount: 4250 },
  { category: "supplies", description: "Syringes, IV sets, gloves", qty: 1, amount: 4250 },
  { category: "other", description: "Oxygen therapy", qty: 3, amount: 3800 },
  { category: "professional_fee", description: "Attending physician - professional fee", qty: 1, amount: 15000 },
];

export const SAMPLE_BILL: Bill = {
  hospitalName: "Sample General Hospital (fictional)",
  lines,
  total: lines.reduce((s, l) => s + l.amount, 0),
  // Demo shortcut: pretend the hospital was recognised as a DOH hospital.
  detected: { hospitalType: "doh", room: "ward", setting: "inpatient", notes: ["Sample hospital treated as a DOH hospital", 'room line says "Ward bed (5 nights)"'] },
};

// Cached explanations so the demo never needs a live call.
export const SAMPLE_EXPLANATIONS: Record<string, { en: string; tl: string }> = {
  "Emergency room / admission fee": {
    en: "A one-time fee for being received at the ER and admitted to the hospital.",
    tl: "Isang beses na bayad sa pagtanggap sa ER at pag-admit sa ospital.",
  },
  "Ward bed (5 nights)": {
    en: "Your bed in a shared ward for 5 nights. This is the basic room type.",
    tl: "Ang kama mo sa shared ward sa loob ng 5 gabi. Ito ang basic na kuwarto.",
  },
  "IV antibiotics (ceftriaxone)": {
    en: "Antibiotic medicine given through a drip to fight infection.",
    tl: "Gamot laban sa impeksyon na itinuturok sa pamamagitan ng dextrose o IV.",
  },
  "Pharmacy - oral meds and IV fluids": {
    en: "Other medicines and drip fluids the hospital pharmacy gave during your stay.",
    tl: "Iba pang gamot at IV fluids na ibinigay ng botika ng ospital habang naka-confine.",
  },
  "CBC and blood chemistry panel": {
    en: "Blood tests that check infection, blood count, and how the kidneys and liver are working.",
    tl: "Mga pagsusuri sa dugo para tingnan ang impeksyon, blood count, at kondisyon ng kidney at atay.",
  },
  "Chest X-ray": { en: "An X-ray picture of the lungs and chest.", tl: "Larawang X-ray ng baga at dibdib." },
  "CT scan - abdomen": {
    en: "A detailed scan of the belly area to look for the cause of pain or illness.",
    tl: "Detalyadong scan ng tiyan para hanapin ang sanhi ng sakit.",
  },
  "Syringes, IV sets, gloves": {
    en: "Medical supplies used for your care, such as needles, drip sets and gloves.",
    tl: "Mga gamit medikal tulad ng karayom, IV set at guwantes na ginamit sa iyo.",
  },
  "Oxygen therapy": { en: "Oxygen given to help you breathe, charged per day.", tl: "Oxygen na ibinigay para makahinga ka, singil kada araw." },
  "Attending physician - professional fee": {
    en: "The doctor's own fee for treating you. It is separate from the hospital's charges.",
    tl: "Bayad sa doktor mismo na gumamot sa iyo. Hiwalay ito sa singil ng ospital.",
  },
};
