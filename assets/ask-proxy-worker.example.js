/* ask-proxy-worker.example.js
 *
 * A tiny Cloudflare Worker that lets the "Ask about this page" widget use Claude
 * WITHOUT putting your Anthropic key in the browser. The browser sends a
 * Claude-shaped request body (+ an optional shared access token); this worker
 * injects the real ANTHROPIC_API_KEY server-side and forwards to Anthropic.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * A public static page can't safely hold a real API key — anyone could read it
 * and burn your credits. So you "host the credential somewhere" (here, a Worker
 * secret) and the browser only ever holds a revocable ACCESS_TOKEN that talks to
 * YOUR worker, never to Anthropic directly. That is the safe version of
 * "run a session somewhere and fetch a token to use it."
 *
 * ── Deploy (free tier) ───────────────────────────────────────────────────────
 *   npm i -g wrangler
 *   wrangler init ask-proxy            # or paste this as src/index.js
 *   wrangler secret put ANTHROPIC_API_KEY      # paste your sk-ant-... key
 *   wrangler secret put ACCESS_TOKEN           # any random string (optional gate)
 *   # set ALLOW_ORIGIN below to your site, e.g. https://han-oqo.github.io
 *   wrangler deploy
 *
 * ── Use in the widget ────────────────────────────────────────────────────────
 *   Open the widget ⚙ → Provider = "Proxy (your server)"
 *   Proxy URL      = https://ask-proxy.<you>.workers.dev
 *   Access token   = the ACCESS_TOKEN you set (optional)
 *   The widget sends the page text + question; the worker adds the key and
 *   forwards to Anthropic. Web search still works (it's a server-side tool the
 *   request body already enables).
 */

const ALLOW_ORIGIN = "https://han-oqo.github.io"; // or "*" to allow any origin
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function cors() {
  return {
    "access-control-allow-origin": ALLOW_ORIGIN,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-access-token",
    "access-control-max-age": "86400",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors() });

    // Optional shared-secret gate to stop strangers from spending your credits.
    if (env.ACCESS_TOKEN && request.headers.get("x-access-token") !== env.ACCESS_TOKEN)
      return new Response(JSON.stringify({ error: { message: "unauthorized" } }),
        { status: 401, headers: { ...cors(), "content-type": "application/json" } });

    const body = await request.text(); // Claude-shaped body from the widget

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,   // the real key — server-side only
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors(), "content-type": "application/json" },
    });
  },
};
