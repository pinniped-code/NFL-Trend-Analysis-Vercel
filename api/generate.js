// NGS Scout — Vercel serverless proxy.
// Gates access with a passcode, caps output tokens, pins the model, and calls the
// Claude API with a SERVER-SIDE key. Your hard cost ceiling is the monthly spend
// limit you set on the Anthropic Workspace that the key belongs to.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   - a workspace-scoped key from a spend-limited Workspace
//   ACCESS_CODES        - comma-separated passcodes, e.g. "demo-jane,demo-sam,acme-2026"
// Optional:
//   ANTHROPIC_MODEL      (default "claude-sonnet-4-5")
//   MAX_OUTPUT_TOKENS    (default 8000) - per-request output cap
//   RATE_PER_MIN         (default 8)    - generate calls per code+IP per minute (best effort)
//   ANTHROPIC_WORKSPACE_ID - only needed if the key is NOT already workspace-scoped

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

const HITS = global.__ngsHits || (global.__ngsHits = new Map());
function rateOk(key) {
  const now = Date.now();
  const WIN = 60 * 1000;
  const MAX = parseInt(process.env.RATE_PER_MIN || "8", 10);
  const arr = (HITS.get(key) || []).filter((t) => now - t < WIN);
  if (arr.length >= MAX) { HITS.set(key, arr); return false; }
  arr.push(now); HITS.set(key, arr); return true;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: { message: "Method not allowed" } }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== "object") body = await readJson(req);

  const codes = (process.env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const code = (req.headers["x-ngs-code"] || body.code || "").toString().trim();
  if (codes.length === 0) { res.status(500).json({ error: { message: "Server not configured: no ACCESS_CODES set." } }); return; }
  if (!code || codes.indexOf(code) === -1) { res.status(401).json({ error: { message: "Invalid or missing access code." } }); return; }

  // Auth ping (no cost) — used by the front-end gate to validate a code.
  if (body.auth === true) { res.status(200).json({ ok: true }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: "Server not configured: missing ANTHROPIC_API_KEY." } }); return; }

  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || "anon";
  if (!rateOk(code + ":" + ip)) { res.status(429).json({ error: { message: "Too many requests — wait a moment and try again." } }); return; }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const cap = parseInt(process.env.MAX_OUTPUT_TOKENS || "8000", 10);
  const reqMax = Number(body.max_tokens) || 4000;
  const payload = {
    model: model,
    max_tokens: Math.max(256, Math.min(reqMax, cap)),
    system: typeof body.system === "string" ? body.system : "",
    messages: Array.isArray(body.messages) ? body.messages : [],
  };

  const headers = { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  if (process.env.ANTHROPIC_WORKSPACE_ID) headers["anthropic-workspace-id"] = process.env.ANTHROPIC_WORKSPACE_ID;

  try {
    const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: headers, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({ error: { message: "Unreadable response from Claude." } }));
    // Pass the Claude response (content[] or error) straight back to the app.
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ error: { message: "Upstream error contacting Claude. Please try again." } });
  }
};
