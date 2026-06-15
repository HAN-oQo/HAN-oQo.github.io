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
from aiohttp import web
from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")
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


def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = ALLOW_ORIGIN
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "content-type, x-access-token"
    return resp


async def handle_options(request):
    return cors(web.Response(status=204))


async def handle_ask(request):
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

    if ALLOW_EDITS:
        edit_note = (
            "\n\n=== EDIT MODE ===\n"
            f"You are Claude Code in the git repo at: {REPO_DIR}\n"
            f"The page being viewed: {page_url or '(unknown)'} → its source is that path under the repo "
            "(e.g. '/logs/x.html' → 'logs/x.html').\n"
            "If the user asks to ADD A MEMO or EDIT the page, edit that HTML SOURCE file. For a memo insert a "
            "callout inside the .wrap container:\n"
            "  <div class=\"memo\">memo text<span class=\"memo-date\">YYYY-MM-DD</span></div>\n"
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
    mode = f"EDIT MODE (repo={REPO_DIR}, push={'yes' if PUSH else 'no'})" if ALLOW_EDITS else "read-only"
    print(f"ask-bot-server on {HOST}:{PORT}  ({mode}, origin={ALLOW_ORIGIN}, gated={'yes' if ACCESS_TOKEN else 'no'})")
    web.run_app(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
