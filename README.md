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
| **Gemini** | [aistudio.google.com](https://aistudio.google.com/apikey) | Google Search grounding | **Free tier** — cheapest way to try, no card needed |
| **Claude** | [console.anthropic.com](https://console.anthropic.com/) (key `sk-ant-api…`) | built-in `web_search` | pay-per-use |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) | Responses `web_search` | pay-per-use |

> Web search is billed per search on your own key. Models are a dropdown per
> provider; edit `PROVIDERS[*].models` in `assets/ask.js` to add/remove.

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

### Note on `claude setup-token` / OAuth tokens

`claude setup-token` issues an **OAuth token** (`sk-ant-oat…`) for **Claude Code (the CLI)**,
not an API key. The widget will send it as `Authorization: Bearer` (auto-detected),
but Anthropic **gates these tokens to Claude Code** — using one to power a web app
requires impersonating the Claude Code client, which is outside the subscription's
terms and is intentionally **not** done here. If a Bearer call returns a permission
error, that's the gate: use a **Console API key** (`sk-ant-api…`) or **Gemini's free
tier** instead. Both work cleanly with the widget and the proxy above.

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
