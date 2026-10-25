# Akop web app

Next.js app for https://akop.vercel.app. See the [root README](../README.md) for what it does.

```bash
npm install
npm run dev        # http://localhost:3000, needs OPENAI_API_KEY in .env.local
npm test           # rules unit tests
npm run build
```

Environment variables (server only): `OPENAI_API_KEY`. Optional model overrides: `EXTRACT_MODEL`, `ESCALATE_MODEL`, `EXPLAIN_MODEL`, `DECIDE_MODEL`, `VERIFY_MODEL`.

Vercel deploys from this folder (project Root Directory = `navigator`) on every push to `main`.
