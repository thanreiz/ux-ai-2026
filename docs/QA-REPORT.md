# Akop QA report

**Date:** 25 October 2026, about 3:10 PM. **Build:** `main`, live at https://akop.vercel.app.

## Backend

| Check | Result |
|---|---|
| Rules unit tests (`npm test` in `navigator/`) | 26 / 26 pass |
| `/api/explain` valid request | 200, English + Taglish returned |
| `/api/explain` empty list, bad JSON, 250-char item, 61 items | 400 each |
| `/api/extract` bad JSON, text data URL, plain URL, empty body | 400 each |
| `GET /api/extract` | 405 |
| `/api/extract` fictional bill photo | 200, 12 lines, ₱83,650 total, 12 Decisions checks |
| `/api/extract` non-bill photo (birthday note) | 422 `not_a_bill`, no hospital or category calls made (fixed in QA) |
| `/api/extract` heavily blurred bill | escalation to `gpt-6-astra` fired; first read kept because the retry was not better |
| Rate limit | 6th request in a minute returned 429; counters are per server instance, so later requests can land on a fresh instance |
| Secrets | `.env.local` not in git; API key only in Vercel env |

## Frontend (live and local, 360 px, 375 px, 1280 px)

| Check | Result |
|---|---|
| Sample photo through the real AI | 12 lines in about 11 s, progress steps shown |
| Camera input | `capture="environment"`, simulated photo read correctly |
| Edit an amount | total updates, mismatch notice shows |
| Remove / add a line | works |
| English / Taglish toggle | explanations, plan heading, limitations switch |
| Details pre-fill | hospital, room, care pre-filled with tags; hospital shows "Please check" when unverified |
| Change hospital to DOH | ₱0 zero-balance scenario appears |
| Continue button | disabled until all required answers are given |
| Plan | scenarios, flags, checklist, programs, ledger, rights, letter, limitations render |
| Checklist tick | saved to localStorage |
| Letter fields | names appear in the letter; letter quotes the printed bill total |
| Non-bill photo | "This photo doesn't look like a hospital bill" message |
| Horizontal scroll | none at 360, 375 or 1280 px |
| Console errors | none on the live site (only the expected 422 during the non-bill test) |

## Bugs found and fixed during QA

1. Non-bill photos returned 200 with zero lines and still ran the paid hospital web search. Now 422 before any extra calls.
2. Continuing from the review screen overwrote the printed bill total with the lines total, so the "lines don't add up" flag never appeared on the plan and the letter quoted the wrong total. Now the printed total is kept.
3. Step 2's button switched to Tagalog while the rest of the step stayed English. Now consistent.
4. A lone second scenario card filled only half the width on desktop. Now full width.

## Not tested

- A real phone camera (only simulated), iPhone HEIC photos, and rotated photos.
- Printing on paper (print styles exist but were not printed).
- Screen reader pass.
- Rules accuracy against the full DOH orders (DO 2026-0443, AO 2026-0031), which are still unread.
