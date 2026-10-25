import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/rules";
import { detectFromBill } from "@/lib/detect";
import { isShaky } from "@/lib/extract-utils";
import { SAMPLE_BILL } from "@/lib/sample";
import type { Answers, Bill } from "@/lib/types";

const base: Answers = { hospitalType: "doh", room: "ward", setting: "inpatient", philhealth: "active", category: "none", income: "low", dependents: 3 };
const status = (a: Answers, id: string, bill: Bill = SAMPLE_BILL) => evaluate(bill, a).programs.find((p) => p.id === id)!.status;
const mk = (lines: Bill["lines"], total?: number): Bill => ({ hospitalName: "X", lines, total: total ?? lines.reduce((s, l) => s + (l.category === "deduction" ? 0 : l.amount), 0) });

describe("ZBB", () => {
  it("is likely for a ward bed at a DOH hospital with active PhilHealth", () => expect(status(base, "zbb")).toBe("likely"));
  it("does not apply in a private room", () => expect(status({ ...base, room: "private" }, "zbb")).toBe("no"));
  it("does not apply at a private hospital", () => expect(status({ ...base, hospitalType: "private" }, "zbb")).toBe("no"));
  it("does not apply to outpatients or non-members", () => {
    expect(status({ ...base, setting: "outpatient" }, "zbb")).toBe("no");
    expect(status({ ...base, philhealth: "none" }, "zbb")).toBe("no");
  });
  it("is only 'maybe' at LGU hospitals", () => expect(status({ ...base, hospitalType: "lgu" }, "zbb")).toBe("maybe"));
});

describe("balance", () => {
  it("best case is 0 when ZBB is likely", () => expect(evaluate(SAMPLE_BILL, base).remaining.min).toBe(0));
  it("never goes negative", () => expect(evaluate(SAMPLE_BILL, { ...base, hospitalType: "private", room: "private", otherCredit: 999_999 }).remaining.max).toBe(0));
  it("subtracts other cover before the range", () => {
    const a = { ...base, hospitalType: "private" as const, income: "high" as const };
    const r1 = evaluate(SAMPLE_BILL, a).remaining.max;
    expect(evaluate(SAMPLE_BILL, { ...a, otherCredit: 10_000 }).remaining.max).toBe(r1 - 10_000);
  });
  it("applies the 20% senior discount to medicines only, before aid", () => {
    const a = { ...base, hospitalType: "private" as const, income: "high" as const };
    const meds = SAMPLE_BILL.lines.filter((l) => l.category === "medicine").reduce((s, l) => s + l.amount, 0);
    const plain = evaluate(SAMPLE_BILL, a).remaining.max;
    expect(evaluate(SAMPLE_BILL, { ...a, category: "senior" }).remaining.max).toBeCloseTo(plain - meds * 0.2);
  });
  it("gives no discount to minors", () => expect(status({ ...base, category: "minor" }, "discount")).toBe("no"));
});

describe("bill flags", () => {
  it("flags duplicate lines, missing PhilHealth deduction and fees during ZBB", () => {
    const f = evaluate(SAMPLE_BILL, base).flags.join("|");
    expect(f).toMatch(/duplicate/i);
    expect(f).toMatch(/no deduction appears/i);
    expect(f).toMatch(/Professional fees/);
  });
  it("flags a private room line when the user said ward", () => {
    const b = mk([{ category: "room", description: "Private room 2 nights", qty: 2, amount: 8000 }]);
    expect(evaluate(b, base).flags.join("|")).toMatch(/private or semi-private/);
  });
  it("flags lines that do not add up to the total", () => {
    const b = mk([{ category: "other", description: "A", qty: 1, amount: 1000 }], 5000);
    expect(evaluate(b, base).flags.join("|")).toMatch(/add up/);
  });
});

describe("rules carry their sources", () => {
  it("every program has source, link, date and caveat", () => {
    for (const p of evaluate(SAMPLE_BILL, base).programs) {
      expect(p.source && p.sourceUrl.startsWith("http") && p.lastVerified && p.caveat).toBeTruthy();
    }
  });
  it("is deterministic", () => expect(evaluate(SAMPLE_BILL, base)).toEqual(evaluate(SAMPLE_BILL, base)));
  it("orders the checklist and numbers it from 1", () => expect(evaluate(SAMPLE_BILL, base).checklist.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]));
});

describe("detection from the bill", () => {
  it("reads PhilHealth, senior and room from the lines", () => {
    const b = mk([
      { category: "room", description: "Semi-private room", qty: 1, amount: 3000 },
      { category: "deduction", description: "Less: PhilHealth", qty: 1, amount: 5000 },
      { category: "deduction", description: "Senior citizen discount", qty: 1, amount: 400 },
    ]);
    const d = detectFromBill(b);
    expect(d).toMatchObject({ room: "private", setting: "inpatient", philhealth: "active", category: "senior" });
  });
  it("does not assume PhilHealth for a zero deduction", () => expect(detectFromBill(SAMPLE_BILL).philhealth).toBeUndefined());
  it("recognises a known DOH hospital by name", () => expect(detectFromBill({ ...SAMPLE_BILL, hospitalName: "Philippine Heart Center" }).hospitalType).toBe("doh"));
});

describe("escalation trigger (FR01.03)", () => {
  it("fires on 3+ low-confidence lines", () => {
    const l = { category: "other" as const, description: "x", qty: 1, amount: 100, lowConfidence: true };
    expect(isShaky(mk([l, l, l]))).toBe(true);
  });
  it("fires when lines do not match the total", () => expect(isShaky(mk([{ category: "other", description: "A", qty: 1, amount: 100 }], 500))).toBe(true));
  it("stays quiet on a clean read", () => expect(isShaky(SAMPLE_BILL)).toBe(false));
});
