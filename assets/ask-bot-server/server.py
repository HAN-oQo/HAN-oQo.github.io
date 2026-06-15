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
    if not question:
        return cors(web.json_response({"error": "empty question"}, status=400))

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
    print(f"ask-bot-server on :{PORT}  (origin={ALLOW_ORIGIN}, gated={'yes' if ACCESS_TOKEN else 'no'})")
    web.run_app(app, host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    main()
