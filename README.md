# han-oqo.github.io

AI Inference Study — notes on LLM inference internals. Source for [https://han-oqo.github.io/](https://han-oqo.github.io/).

## Structure

- `index.html` — landing page
- `study/` — study notes (inference architecture, etc.)
- `assets/` — shared CSS/JS (language toggle `i18n.js`, AI Q&A widget `ask.js`)

Each page supports an English ↔ Korean toggle (top-right). Default is English; the choice is remembered in `localStorage`.

## "Ask about this page" AI widget

Every page has a floating **✦ Ask AI** button (bottom-right). It answers questions
about **the page you're reading** (the page's text is sent as context) and can use
the provider's **web search** when the page doesn't cover it. Implemented in
`assets/ask.js`, loaded automatically by `i18n.js` — no build step.

It is **bring-your-own-key**: your key is stored **only in your browser**
(`localStorage`) and sent **only** to the provider you pick (or your own proxy).
Nothing is committed to this repo and there is no shared server by default.

### Quick start (BYO key)

1. Click **✦ Ask AI** → the gear **⚙** opens settings.
2. Pick a **Provider** and paste its key, pick a **Model**, **Save**.
3. Type a question, **Enter** to send (**Shift+Enter** = newline). Toggle **web search** as needed.

| Provider | Where to get a key | Web search | Note |
|---|---|---|---|
| **Groq** (default) | [console.groq.com/keys](https://console.groq.com/keys) | — page-grounded only | **Free, no card** — Llama models; works without any billing |
| **Gemini** | [aistudio.google.com](https://aistudio.google.com/apikey) | Google Search grounding | Free tier *where available* (region/project dependent — may show `limit: 0`) |
| **Claude** | [console.anthropic.com](https://console.anthropic.com/) (`sk-ant-api…`) | built-in `web_search` | pay-per-use — the **API is separate from a Claude.ai/Claude Code subscription** |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) | Responses `web_search` | pay-per-use |

> Default provider is **Groq** because it's free and needs no billing. Web search
> (Claude/OpenAI/Gemini) is billed per search on your own key. Models are a dropdown
> per provider; edit `PROVIDERS[*].models` in `assets/ask.js` to add/remove.

### Proxy mode (hide the key / let visitors ask)

If you want a key that is **not** in the browser — so anyone can use the widget, or
to gate access — run a tiny proxy that holds the real key server-side. A ready
Cloudflare Worker is in [`assets/ask-proxy-worker.example.js`](assets/ask-proxy-worker.example.js):

```sh
npm i -g wrangler
wrangler init ask-proxy                  # paste the example as src/index.js
wrangler secret put ANTHROPIC_API_KEY    # your sk-ant-api… key (server-side only)
wrangler secret put ACCESS_TOKEN         # any random string — a gate vs. abuse
# set ALLOW_ORIGIN in the file to https://han-oqo.github.io
wrangler deploy
```

Then in the widget ⚙: **Provider = Proxy (your server)**, **Proxy URL =**
`https://ask-proxy.<you>.workers.dev`, **Access token =** the `ACCESS_TOKEN` you set.
The browser now holds only the revocable access token; the real key stays in the
Worker secret. Web search still works (it's a server-side tool the request enables).

### Use your Claude **subscription** (no API billing) — Agent SDK bot

If you already pay for Claude and don't want API charges, run your own bot with the
**Claude Agent SDK**, authenticated by your local `claude` login (`claude setup-token`).
The SDK runs Claude Code on your subscription — **no `ANTHROPIC_API_KEY`**. It's the
same pattern as a Claude-Code/Agent-SDK Slack bot. A ready server is in
[`assets/ask-bot-server/`](assets/ask-bot-server/) (`/ask` endpoint, WebSearch, CORS,
optional access-token gate). Host it on a (CPU) node, expose it over HTTPS
(`cloudflared tunnel --url http://localhost:8787`), then set widget
**Provider = "My Claude bot (Agent SDK)"**, URL = `https://…/ask`. See its
[README](assets/ask-bot-server/README.md). Keep it personal/team-scoped (gate with a
token) — a subscription isn't meant to power a high-traffic public service.

### Note on `claude setup-token` used **directly** in the browser

The widget can also take an OAuth token (`sk-ant-oat…`) and send it as
`Authorization: Bearer`, but Anthropic **gates these tokens to Claude Code** — calling
the raw API with one requires impersonating the Claude Code client, which is
circumvention and is intentionally **not** done here. The legitimate way to use that
subscription token is the **Agent SDK bot above** (Anthropic's official path), not a
raw-API call from the page. For pay-per-use, a **Console API key** (`sk-ant-api…`) or
**Gemini's free tier** also work cleanly.

## Local preview

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Gated pages

Two pages under `study/` are encrypted client-side with [StatiCrypt](https://github.com/robinmoisson/staticrypt). The unencrypted sources are not committed (`*.unencrypted.html` is in `.gitignore`).

## Format & theme consistency (enforced)

All pages must share the same skeleton and the cream/warm palette defined in
`assets/theme.css`. The full conventions live in [CLAUDE.md](CLAUDE.md); they are
enforced automatically:

```sh
sh tools/install-hooks.sh        # once after cloning — enables the pre-push hook
python3 tools/check_theme.py     # run the consistency check manually
```

A failing check **blocks `git push`** (pre-push hook) and **blocks deployment**
(CI job in `.github/workflows/pages.yml`).
