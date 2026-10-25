# Akop

**Live:** https://akop.vercel.app

Akop turns a photo of a Philippine hospital bill (Statement of Account) into a personal plan: each charge explained in English or Taglish, which aid programs may apply, what the family may still owe, which offices to visit with which documents, and a ready-to-print request letter.

**Who it helps:** the family member handling a hospital bill, often at the billing window, on a phone. Households paid ₱615.16B out of pocket for health in 2024, 42.7% of current health expenditure (PSA, Philippine National Health Accounts). In 2026 the rules changed: ward stays at DOH hospitals can be zero-balance and politicians no longer distribute medical aid, but private rooms, private hospitals and outpatient care are still not covered, and families cannot tell which side of the line they are on.

Built for the Codex × UX+AI Hackathon, 25 October 2026.

## How it works

1. **Read.** GPT-6.1 Sol reads the bill photo into line items through the Responses API with a strict JSON schema; unreadable amounts come back empty, never guessed. A blurry read retries once with GPT-6 Astra.
2. **Check.** The OpenAI Decisions API (GPT-6 Luna) gives a second opinion on each line's category. The hospital type is decided automatically and double-checked: Decisions API plus a GPT-6.1 Sol web search that returns evidence and a source link.
3. **Explain.** GPT-6 Luna writes one plain sentence per line in English and Taglish.
4. **Decide.** Plain TypeScript rules (no AI) work out zero balance billing, PhilHealth, senior/PWD discounts, MAIFIP, DSWD AICS, PCSO and Malasakit, the balance scenarios, the ordered checklist and the letter. Every rule cites its source, date checked and what is still unverified.

AI reads and explains. Code decides.

## Repository

```
navigator/            Next.js app (deployed from here)
  app/page.tsx        three-step flow: bill, details, plan
  app/api/extract     photo -> bill (vision, Decisions API, hospital check)
  app/api/explain     line explanations in English and Taglish
  lib/rules.ts        deterministic eligibility rules with sources
  lib/hospital.ts     two-way hospital type check
  lib/decide.ts       Decisions API line categories
  tests/              rules unit tests (vitest)
docs/
  PRD.docx            product requirements
  QA-REPORT.md        QA results and bugs fixed
  ux/                 design spec, UX research, prototype, logo
  research/           program-rules research prompt
```

## Run locally

```bash
cd navigator
npm install
echo "OPENAI_API_KEY=sk-..." > .env.local
npm run dev
```

Tests: `npm test` in `navigator/`.

## Limitations

- Program rules come from agency notices, news and agency pages. The full text of DOH DO 2026-0443 (zero balance billing) and AO 2026-0031 (MAIFIP) has not been read yet. All results are estimates.
- Not confirmed: income and non-member rules for zero balance billing, outpatient coverage, PCSO payment of doctors' fees, and the PhilHealth refund route.
- AI can misread small or blurry amounts; the user reviews every line.
- No accounts and no server storage. The sample bill is fictional.
