You are a research assistant. Use web search and cite a source URL plus date for every claim. Mark anything you could not confirm from an official source as UNVERIFIED. Do not guess.

CONTEXT
I am building a hackathon web app for Filipino families: they photograph a hospital Statement of Account (SOA), the app explains it, asks 5 questions, and a rules engine outputs which aid programs apply, an estimated remaining balance, a document checklist, and a request letter. Today is 2026-10-25. The build is due in under 3 hours, so keep answers short, concrete, and in the formats requested.

PART A - PHILIPPINE PROGRAM RULES (highest priority)
Prefer official sources (doh.gov.ph, philhealth.gov.ph, dswd.gov.ph, pcso.gov.ph, officialgazette.gov.ph, lawphil.net). For each program give: what it covers, who is eligible, what it does NOT cover, required documents, where to apply, how it stacks with other aid, source URL, date of source.

1. Zero Balance Billing (ZBB): current scope in 2026. Which hospitals (the 87 DOH-retained hospitals? LGU expansion?). Basic/ward accommodation only? Are NKTI, Lung Center, Heart Center, PCMC excluded? Is it income-independent? What about PhilHealth non-members? Outpatients?
2. PhilHealth: case-rate deduction at billing, Claim Form 1 / current claim forms, rule if not deducted at discharge (reimbursement window), and the PhilHealth CARES nurse role.
3. DOH MAIFIP: 2026 funding, eligibility, whether politician guarantee letters are truly no longer needed, which hospitals (government only or private too), required documents (proof of income?).
4. DSWD AICS medical assistance: amount ranges, cash vs guarantee letter threshold, required documents, who qualifies.
5. PCSO medical assistance: scope (dialysis, chemo, etc.), required documents, partner hospitals, whether PCSO letters cover doctors' professional fees.
6. Malasakit Centers (RA 11463): which hospitals have one, what desks are inside, how to find the list.
7. Anti-detention law: confirm the correct citation (RA 9439?) and exact scope. Is there a newer law or amendment?
8. 2026 national budget ban on politicians' guarantee letters: exact provision and what replaced it.
9. Discounts by patient category: senior citizen, PWD, minors, pregnant, plus how they interact with the above.
10. Order of benefits: what is the correct order to apply PhilHealth, ZBB, MAIFIP, AICS, PCSO to a bill.

Output Part A as a table per program, then a list titled "CONFLICTS AND GAPS" where sources disagree or nothing official was found.

PART B - STATS TO VERIFY (for slides)
Verify with source and exact wording: (a) PHP 615.16B household out-of-pocket health spending in 2024, 42.7% of current health expenditure (PSA Philippine National Health Accounts); (b) about 1.2 million households with catastrophic health spending in 2023; (c) MAIFIP 2026 budget PHP 51.6B vs PHP 41.16B; (d) ZBB 1.3M beneficiaries and PHP 74.65B covered in Jul-Dec 2025. Say which are confirmed, which differ, and give corrected figures.

PART C - OPENAI BUILD CHOICES
Use only OpenAI docs (developers.openai.com, platform.openai.com) and OpenAI DevDay 2026 posts. Answer:
1. Best model for reading a photographed, possibly blurry, hospital bill into structured JSON, and the cheapest model that is still reliable. Give model IDs, input/output price per million tokens, and image-token cost for a typical phone photo.
2. Exact Responses API request shape (Node SDK) for: base64 image input + Structured Outputs with a JSON schema. Give a minimal working code sample.
3. Best model for explaining line items in English and Taglish and drafting a letter, cost-optimized.
4. Any new DevDay 2026 features worth using in this app (agents, tools, eval, caching, batch, moderation) and why or why not.
5. Rate limits and token-cost control tips (max output tokens, caching, reasoning effort) for a $50 credit budget.

PART D - PRODUCT RESEARCH
1. Do any existing apps or tools already help Filipinos decode hospital bills or find medical aid? List them and what they lack.
2. What are the top 5 pain points families report at hospital billing, Malasakit Centers, and aid offices? Quote or link real accounts.
3. A list of 5 realistic line items and typical price ranges found on Philippine hospital SOAs (room, meds, lab, professional fees, supplies) so I can make a believable fictional sample bill. No real patient data.

FORMAT
Start with a 10-line executive summary of the most decision-relevant findings, then Parts A to D. Put every URL in a Sources list at the end. Flag UNVERIFIED items clearly.
