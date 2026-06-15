# ask-bot-server — Claude bot for the "Ask about this page" widget

A long-running bot you host on your own (CPU) node. It uses the **Claude Agent
SDK** authenticated by your **local `claude` login** (`claude setup-token`), so it
runs on your **Claude subscription — no `ANTHROPIC_API_KEY`, no API billing**. The
web widget shoots `/ask` calls at it; it answers (optionally with **WebSearch**).

**Two-step protocol** (a public edge often caps responses at a few seconds, so no
single request blocks): `POST /ask` → `{id}`, then poll `GET /result?id=…` →
`{status: pending|done|error, answer, sources}`. `GET /models` proxies the gateway's
model list for the widget's dropdown. (The widget's bot provider also accepts a
synchronous `{answer}` from `POST /ask`, so a localhost dev run can stay one-shot.)

**Models / local LLM:** the Agent SDK obeys this login's `~/.claude` settings, so if
`ANTHROPIC_BASE_URL` points at a gateway (e.g. a local-LLM gateway with
`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`), the bot can serve **both** Claude
cloud models *and* local models. Pass `model=` per request; set `GATEWAY_URL` so
`/models` can list them.

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

> Already logged into `claude` on this machine? Add **`SKIP_TOKEN=1`** to skip the
> browser step and reuse that login (the Agent SDK uses your existing `~/.claude`
> session). Use **`PYTHON=…`** to point at a venv that has the deps installed, e.g.
> `SKIP_TOKEN=1 PYTHON=~/ask-bot-venv/bin/python bash assets/ask-bot-server/launch.sh`.
> The bot runs in a **detached tmux session** (`askbot`) — independent of any Claude
> Code session, and it keeps running after you close this terminal.

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

## Where it runs & how to read the URL / token yourself

Everything runs **on your machine** as plain processes inside tmux — nothing hidden.
Check it yourself (no need to ask anyone):

```sh
# 1) which bots are up (sessions)
tmux ls                                  # e.g. askbot (local edit) / askbot-pub (public)

# 2) the saved connection info (written by launch.sh on every run)
cat ~/.askbot/askbot.txt                 # local edit bot
cat ~/.askbot/askbot-pub.txt             # public tunnel bot

# 3) ports / processes on this machine
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':8787|:8788|:8000'
pgrep -fl 'server.py|http.server|cloudflared'

# 4) token straight from the running process env
ps eww $(pgrep -f 'ask-bot-server/server.py') | tr ' ' '\n' | grep ACCESS_TOKEN=

# 5) public tunnel URL from cloudflared's log (or its tmux pane)
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/askbot-tunnel.log | tail -1
tmux attach -t askbot-pub                # watch live (detach: Ctrl-b then d)
```

The tokens are **not** stored in this repo — only in `~/.askbot/*.txt` (your home dir)
and in the live process env. The trycloudflare URL is **ephemeral** (new on each
tunnel restart); the saved file always reflects the latest run.

## Production deploy (systemd on a node) — the always-on bot

The live blog uses a bot kept on a node as a **systemd service** (read-only, no edit
mode), reachable over HTTPS at a stable host. This is separate from the local edit
launcher above.

```ini
# /etc/systemd/system/ce-askbot.service  (User=<you>, WorkingDirectory=/srv/askbot)
Environment=ALLOW_ORIGINS=https://han-oqo.github.io,https://ce-blog.ce.moreh.dev
Environment=ANTHROPIC_MODEL=claude-moreh-Qwen3.6-27B   # default model (local LLM)
Environment=GATEWAY_URL=http://<gateway-host>:<port>   # enables /models discovery
Environment=PORT=8787
Environment=RATE_LIMIT=600
EnvironmentFile=/srv/askbot/askbot.env                 # ACCESS_TOKEN=… (chmod 600, NOT in git)
ExecStart=/srv/askbot/venv/bin/python /srv/askbot/server.py
```

Common ops (`sudo` on the node):

```sh
sudo systemctl cat ce-askbot                                  # see env
sudo cat /srv/askbot/askbot.env                               # token
# add an allowed site (comma list) → restart:
sudo sed -i 's|^Environment=ALLOW_ORIGINS=.*|Environment=ALLOW_ORIGINS=…,https://new-site|' /etc/systemd/system/ce-askbot.service
sudo systemctl daemon-reload && sudo systemctl restart ce-askbot
curl -s "$GATEWAY_URL/v1/models" | python3 -m json.tool       # what the gateway serves
sudo journalctl -u ce-askbot -n 50 --no-pager                 # logs
```

| Env var | Meaning |
|---|---|
| `ALLOW_ORIGINS` | Comma list of allowed browser origins (CORS echoes the match). Falls back to `ALLOW_ORIGIN`, then `*`. |
| `ACCESS_TOKEN` | Shared token required on `/ask`,`/result`,`/models` (omit ⇒ token-free, gated by Origin+rate-limit). |
| `ANTHROPIC_MODEL` | Default model when a request omits `model`. |
| `GATEWAY_URL` | Gateway base URL; `/models` proxies `GATEWAY_URL/v1/models`. |
| `RATE_LIMIT`/`RATE_WINDOW` | Max `/ask` per window per IP (default 60/60s). |
| `ALLOW_EDITS`/`PUSH` | Edit mode (localhost-only) + allow `git push`. Off in production. |

> Keep `server.py` here in sync with the deployed copy: `scp server.py node:/srv/askbot/ && sudo systemctl restart ce-askbot`.

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
