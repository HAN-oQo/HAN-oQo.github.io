"""
ask-bot-server — a tiny HTTP wrapper around the Claude Agent SDK that the
"Ask about this page" widget can call (widget Provider = "My Claude bot").

Auth: uses your local `claude` login (run `claude setup-token` or `claude`
once on this machine). The Agent SDK then runs on your Claude subscription —
NO ANTHROPIC_API_KEY needed. This is the same pattern as a Claude-Code /
Agent-SDK Slack bot (e.g. hanq-moreh/ce_slack_bot).

It listens forever, takes /ask calls, answers (optionally with WebSearch),
and returns {answer, sources}.

Scope note: a Claude subscription is for personal/individual use. Keep this
bot for yourself / your team (gate it with ACCESS_TOKEN), not as a high-traffic
public service.

Run:
    pip install -r requirements.txt
    # one-time auth on this box:
    #   npm i -g @anthropic-ai/claude-code && claude   (log in)   — or: claude setup-token
    ALLOW_ORIGIN="https://han-oqo.github.io" ACCESS_TOKEN="pick-a-secret" python server.py
    # expose over HTTPS so the public page can reach it (avoids mixed-content):
    #   cloudflared tunnel --url http://localhost:8787   → https://<random>.trycloudflare.com
"""
import os
import time
import collections
from aiohttp import web
from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")
# Comma-separated allowlist (falls back to ALLOW_ORIGIN). "*" = any origin.
# With a real allowlist you can run WITHOUT a token: the browser sends Origin,
# requests from other sites are refused, and rate-limiting bounds abuse. (Origin
# is forgeable by non-browser clients, so this is "good enough" for a read-only
# bot, not a hard secret — pair with a token or Cloudflare Turnstile if needed.)
ALLOW_ORIGINS = [o.strip() for o in os.environ.get("ALLOW_ORIGINS", ALLOW_ORIGIN).split(",") if o.strip()]
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "30"))     # max requests per window per IP
RATE_WINDOW = int(os.environ.get("RATE_WINDOW", "60"))   # window seconds
_hits = collections.defaultdict(list)
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
PORT = int(os.environ.get("PORT", "8787"))


def _flag(name):
    return os.environ.get(name, "") not in ("", "0", "false", "False")


# EDIT MODE (opt-in, off by default): lets the chat edit the page's HTML source
# (add memos / fix text) and commit — because the Agent SDK *is* Claude Code.
# This grants file-edit + shell to the bot, so it binds to localhost by default
# and should only ever run on YOUR machine with the repo checked out.
ALLOW_EDITS = _flag("ALLOW_EDITS")
PUSH = _flag("PUSH")
REPO_DIR = os.environ.get("REPO_DIR", os.getcwd())
HOST = os.environ.get("HOST", "127.0.0.1" if ALLOW_EDITS else "0.0.0.0")

BASE_DISALLOWED = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch"]


def _cors(resp, origin=""):
    # Echo the *request's* origin when it's in the allowlist — required for a
    # multi-origin allowlist to work in browsers (a single fixed value only lets
    # one site through). "*" stays "*"; unknown origins get the first entry.
    if "*" in ALLOW_ORIGINS:
        allow = "*"
    elif origin and origin in ALLOW_ORIGINS:
        allow = origin
    else:
        allow = ALLOW_ORIGINS[0] if ALLOW_ORIGINS else "*"
    resp.headers["Access-Control-Allow-Origin"] = allow
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "content-type, x-access-token"
    return resp


def _origin_ok(origin):
    return ("*" in ALLOW_ORIGINS) or (origin in ALLOW_ORIGINS) or not origin


def _rate_ok(ip):
    now = time.time()
    q = _hits[ip]
    while q and q[0] < now - RATE_WINDOW:
        q.pop(0)
    if len(q) >= RATE_LIMIT:
        return False
    q.append(now)
    return True


async def handle_options(request):
    return _cors(web.Response(status=204), request.headers.get("Origin", ""))


async def handle_ask(request):
    # 1) Origin allowlist — blocks other sites' browsers (lets you skip a token).
    origin = request.headers.get("Origin", "")
    cors = lambda resp: _cors(resp, origin)   # bind this request's origin for every reply below
    if not _origin_ok(origin):
        return cors(web.json_response({"error": "forbidden origin"}, status=403))
    # 2) Rate limit per client IP (cloudflared sets X-Forwarded-For).
    ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (request.remote or "?"))
    if not _rate_ok(ip):
        return cors(web.json_response({"error": "rate limited — slow down"}, status=429))
    # 3) Optional shared token (only enforced if ACCESS_TOKEN is set).
    if ACCESS_TOKEN and request.headers.get("x-access-token") != ACCESS_TOKEN:
        return cors(web.json_response({"error": "unauthorized"}, status=401))
    try:
        data = await request.json()
    except Exception:
        return cors(web.json_response({"error": "bad json"}, status=400))

    question = (data.get("question") or "").strip()
    system = data.get("system") or ""
    model = data.get("model") or DEFAULT_MODEL
    web_on = bool(data.get("web"))
    page_url = (data.get("page_url") or "").strip()
    if not question:
        return cors(web.json_response({"error": "empty question"}, status=400))

    # Effective edit = server permits it (ALLOW_EDITS, set only on the owner's
    # localhost box) AND this request asked for it (widget checkbox). A stranger
    # can't reach a localhost-bound bot anyway, so this is just per-message control.
    edit_req = ALLOW_EDITS and bool(data.get("edit"))
    if edit_req:
        edit_note = (
            "\n\n=== EDIT MODE ===\n"
            f"You are Claude Code in the git repo at: {REPO_DIR}\n"
            f"The page being viewed: {page_url or '(unknown)'} → its source is that path under the repo "
            "(e.g. '/logs/x.html' → 'logs/x.html').\n"
            "If the user asks to ADD A MEMO or EDIT the page, edit that HTML SOURCE file. A memo must be "
            "COLLAPSED by default — insert this inside the .wrap container:\n"
            "  <details class=\"memo\"><summary>short title</summary>"
            "<div class=\"memo-body\">memo text<span class=\"memo-date\">YYYY-MM-DD</span></div></details>\n"
            "After editing, run `python3 tools/check_theme.py`; keep the change only if it passes, fix it otherwise. "
            "Then `git add -A && git commit -m '…'`. " + ("Then `git push`." if PUSH else "Do NOT push.")
            + " If the user only asks a question, just answer — do not edit."
        )
        allowed = ["Read", "Edit", "Write", "Bash", "Glob", "Grep"] + (["WebSearch"] if web_on else [])
        options = ClaudeAgentOptions(
            model=model, system_prompt=system + edit_note, cwd=REPO_DIR,
            allowed_tools=allowed, permission_mode="acceptEdits", max_turns=24,
        )
    else:
        options = ClaudeAgentOptions(
            model=model,
            system_prompt=system,
            allowed_tools=(["WebSearch"] if web_on else []),
            disallowed_tools=BASE_DISALLOWED + ([] if web_on else ["WebSearch"]),
            permission_mode="acceptEdits",
            max_turns=(6 if web_on else 2),
        )

    answer, parts, sources = None, [], []
    try:
        async for msg in query(prompt=question, options=options):
            if isinstance(msg, ResultMessage):
                if msg.subtype == "success":
                    answer = msg.result
                continue
            content = getattr(msg, "content", None) or []
            for block in content:
                tx = getattr(block, "text", None)
                if tx:
                    parts.append(tx)
                # best-effort: collect web search result URLs if the SDK exposes them
                for attr in ("url", "uri"):
                    u = getattr(block, attr, None)
                    if u:
                        sources.append({"url": u, "title": getattr(block, "title", u)})
    except Exception as e:
        return cors(web.json_response({"error": str(e)}, status=500))

    text = answer if answer is not None else "".join(parts)
    return cors(web.json_response({"answer": text or "(no answer)", "sources": sources}))


def main():
    app = web.Application(client_max_size=2 * 1024 * 1024)
    app.router.add_route("OPTIONS", "/ask", handle_options)
    app.router.add_post("/ask", handle_ask)
    # SAFETY: edit mode must stay on the owner's machine. A localhost-bound bot is
    # unreachable from anyone else's browser, so only YOU can trigger edits/pushes.
    if ALLOW_EDITS and HOST not in ("127.0.0.1", "localhost", "::1") and not _flag("FORCE_REMOTE_EDIT"):
        raise SystemExit(
            f"refusing to start: ALLOW_EDITS=1 with HOST={HOST}. Edit mode must bind to "
            "localhost so nobody else can edit/push. Use HOST=127.0.0.1 (default), or set "
            "FORCE_REMOTE_EDIT=1 only if you really know what you're doing."
        )
    mode = f"EDIT MODE (repo={REPO_DIR}, push={'yes' if PUSH else 'no'})" if ALLOW_EDITS else "read-only"
    gate = ("token" if ACCESS_TOKEN else "no-token") + " · origins=" + ",".join(ALLOW_ORIGINS) + f" · rate={RATE_LIMIT}/{RATE_WINDOW}s"
    print(f"ask-bot-server on {HOST}:{PORT}  ({mode} · {gate})")
    web.run_app(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
