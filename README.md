# NGS Scout — self-hosted (Vercel) with live AI narratives

This package hosts NGS Scout on your own Vercel project. Real 2025 data works for
everyone; the AI-written reports and chat run through a small serverless proxy that
holds your Claude key server-side. Access is gated by a passcode, and your spending
is hard-capped by a monthly limit on the Claude Workspace you use.

## What's in here
```
index.html        the app (real data + UI, calls /api/generate for AI)
api/generate.js    serverless proxy: passcode check, rate limit, token cap, calls Claude
README.md          this guide
```

## Step 1 — Anthropic: create a spend-capped key (your cost ceiling)
1. In the Claude Console (console.anthropic.com) go to **Settings → Workspaces** and
   create a new Workspace, e.g. "NGS Scout Demo". (You cannot cap the Default
   Workspace — that's why we make a new one.)
2. Open the workspace → **Spend limits** tab → set a **monthly limit** (e.g. $25) and
   an alert threshold. This is the hard ceiling: if it's reached, the key stops
   working until next month — it can never exceed this.
3. (Optional) **Rate limits** tab → set modest requests/min and tokens/min.
4. Create a **workspace-scoped API key** in that workspace (API keys → Create key,
   scoped to this workspace). Copy it — you'll paste it into Vercel next.

## Step 2 — Deploy to Vercel
Easiest (no command line):
1. Put this folder in a GitHub repo (see the GitHub Pages guide, or drag the files
   into a new repo via github.com → Add file → Upload files).
2. At vercel.com, **Add New → Project → Import** that repo. Framework preset:
   **Other**. Click **Deploy**. (It will fail/return errors until you add the env
   vars in Step 3 — that's expected.)

Or with the Vercel CLI: run `npx vercel` in this folder and follow the prompts, then
`npx vercel --prod` after Step 3.

## Step 3 — Set environment variables (Vercel → Project → Settings → Environment Variables)
| Name | Required | Example / default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | your workspace-scoped key from Step 1 |
| `ACCESS_CODES` | yes | `demo-jane,demo-sam,acme-2026` (comma-separated; one per person is easiest to revoke) |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-5` (set to any current model you prefer) |
| `MAX_OUTPUT_TOKENS` | no | `8000` (per-request output cap) |
| `RATE_PER_MIN` | no | `8` (generate calls per code+IP per minute) |
| `ANTHROPIC_WORKSPACE_ID` | no | only if your key is NOT already workspace-scoped |

After adding them, **redeploy** (Deployments → ⋯ → Redeploy) so they take effect.

## Step 4 — Share
Send your handful of people the Vercel URL (e.g. `https://ngs-scout.vercel.app`) plus
their access code. They enter the code once; the real-data panels and live AI reports
then work. To revoke someone, remove their code from `ACCESS_CODES` and redeploy.

## Cost controls, in order of strength
1. **Workspace monthly spend limit** — the absolute ceiling; nothing can exceed it.
2. **`MAX_OUTPUT_TOKENS`** — bounds the cost of each report.
3. **`RATE_PER_MIN`** + workspace rate limits — throttle bursts.
4. **Passcode** — only people you've given a code can trigger any paid call; it's
   checked server-side in `api/generate.js`, not just in the page.

## Notes
- The API key lives ONLY in the Vercel environment variable and is used only by the
  serverless function — it is never in the page or the browser.
- Optional extra layer: Vercel Pro's built-in **Password Protection** ($20/mo per
  project) puts a shared password on the whole site too. Not required — the passcode
  gate above already protects the paid path on the free Hobby plan.
- To update the app later (e.g. 2026 data), replace `index.html` and redeploy — same URL.
