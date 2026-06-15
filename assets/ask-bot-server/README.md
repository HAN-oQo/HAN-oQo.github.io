# ask-bot-server — Claude bot for the "Ask about this page" widget

A long-running bot you host on your own (CPU) node. It uses the **Claude Agent
SDK** authenticated by your **local `claude` login** (`claude setup-token`), so it
runs on your **Claude subscription — no `ANTHROPIC_API_KEY`, no API billing**. The
web widget shoots `/ask` calls at it; it answers (optionally with **WebSearch**)
and returns `{answer, sources}`.

This is the same pattern as a Claude-Code/Agent-SDK Slack bot
(e.g. `hanq-moreh/ce_slack_bot`) — just an HTTP front door instead of Slack.

> **Why this is allowed (and the API-token spoof isn't):** the Agent SDK +
> `claude setup-token` is Anthropic's *official* way to run Claude Code headlessly
> on a subscription. We do **not** hit the raw `/v1/messages` API with the OAuth
> token (which would require impersonating Claude Code to bypass its gate).
> Keep the bot for personal/team use (gate it with `ACCESS_TOKEN`); a subscription
> is not meant to power a high-traffic public service.

## One command (tmux launcher)

```sh
# LOCAL edit mode — only you can edit/push (binds to localhost):
bash assets/ask-bot-server/launch.sh
#   → gets a subscription token (browser once), starts the bot + a site preview at :8000,
#     prints Provider / URL / Access token to paste into the widget ⚙.

# Public read-only (use the live site for Q&A; editing stays off):
TUNNEL=1 bash assets/ask-bot-server/launch.sh
```

Then open the printed **사이트 프리뷰** URL, click **✦ → ⚙**, paste the URL + token,
check **편집 모드**, and chat: *"이 페이지에 ~ 메모 추가해줘"*.

### Who can edit / push? — only you, automatically

- **Edit mode binds to `127.0.0.1`.** Another visitor's browser hitting `127.0.0.1:8787`
  reaches *their own* machine, not yours — they can't touch your bot. The server even
  **refuses to start** in edit mode on a non-localhost host (unless `FORCE_REMOTE_EDIT=1`).
- The bot **URL + access token live only in your browser** (localStorage). Other readers
  default to Groq and never see them.
- `git push` uses **your machine's git credentials**. No one else's session can push.
- `TUNNEL=1` is **forced read-only** — a public tunnel never exposes editing.
- The **편집 모드** checkbox in the widget toggles editing per message; the server only
  honors it when *you* launched with `ALLOW_EDITS=1` (the launcher's local mode).

## Setup (manual)

```sh
# 1) one-time: install + log in the Claude CLI on this box (uses your subscription)
npm i -g @anthropic-ai/claude-code
claude            # log in interactively …  (or, headless:)  claude setup-token

# 2) deps
pip install -r requirements.txt

# 3) run the bot (gate it with a secret; lock CORS to your site)
ALLOW_ORIGIN="https://han-oqo.github.io" ACCESS_TOKEN="pick-a-secret" python server.py
# → ask-bot-server on :8787
```

### Make it reachable from the public page (HTTPS)

`han-oqo.github.io` is HTTPS, so it can't call an internal `http://192.168.x`
address (mixed content + not routable). Put an HTTPS front on the bot — easiest is
a Cloudflare quick tunnel (no account needed):

```sh
cloudflared tunnel --url http://localhost:8787
# → https://<random>.trycloudflare.com   (use this as the widget URL)
```

(For a stable URL, use a named Cloudflare Tunnel or any reverse proxy with TLS.)

## Point the widget at it

Widget **✦ → ⚙**:
- **Provider** = `My Claude bot (Agent SDK)`
- **Proxy URL** = `https://<random>.trycloudflare.com/ask`
- **Access token** = the `ACCESS_TOKEN` you set
- pick a **Model** (e.g. `claude-sonnet-4-6`), toggle **web search** as desired

The browser holds only the access token; your subscription auth stays on the node.

## Edit mode — add/fix memos in the HTML by chatting (opt-in, local only)

Because the bot *is* Claude Code, it can **edit the page's HTML source and commit**.
Turn it on with `ALLOW_EDITS=1`. Then in the chat: *"이 페이지에 '~' 메모 추가해줘"* or
*"이 문단 이렇게 고쳐줘"* → the bot edits the source file (inserting a
`<div class="memo">…</div>` callout, styled in `theme.css`), runs
`python3 tools/check_theme.py`, and `git commit`s. The page updates after you push +
GitHub Pages redeploys (or instantly in local preview).

```sh
# run ON the machine that has the repo checked out; preview the site locally too
cd /path/to/inference-study            # repo root (REPO_DIR defaults to cwd)
ALLOW_EDITS=1 ACCESS_TOKEN="pick-a-secret" \
  python assets/ask-bot-server/server.py
# → binds to 127.0.0.1 by default (edit mode is local-only on purpose)
# preview:  python3 -m http.server 8000   → open http://localhost:8000/<page>
# widget Provider = My Claude bot, URL = http://127.0.0.1:8787/ask
```

> ⚠️ **Edit mode grants the bot file-edit + shell + git on your repo.** It is **off by
> default**, binds to **localhost**, and is **token-gated**. Only run it on your own
> machine. It does **not** `git push` unless you set `PUSH=1`. Don't expose an
> edit-mode bot through a public tunnel.

## Env vars

| var | default | meaning |
|---|---|---|
| `ALLOW_ORIGIN` | `*` | CORS origin — set to your site |
| `ACCESS_TOKEN` | _(none)_ | if set, callers must send `x-access-token` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | default model if the widget doesn't send one |
| `PORT` | `8787` | listen port |
| `ALLOW_EDITS` | _(off)_ | `1` = let the chat edit HTML + commit (file/shell/git access) |
| `REPO_DIR` | cwd | repo root the bot edits in (edit mode) |
| `PUSH` | _(off)_ | `1` = also `git push` after committing (edit mode) |
| `HOST` | `0.0.0.0` (`127.0.0.1` if `ALLOW_EDITS`) | bind address |
