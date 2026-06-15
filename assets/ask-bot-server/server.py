"""
ask-bot-server — async HTTP wrapper around the Claude Agent SDK that the
"Ask about this page" widget calls (widget Provider = "My Claude bot").

TWO-STEP on purpose: the public edge in front of the cluster caps upstream
responses at ~4s, but AI answers take seconds. So no single request blocks —

  POST /ask            -> {"id": "..."}                       (work runs in background)
  GET  /result?id=...  -> {"status":"pending"}
                        | {"status":"done","answer":"...","sources":[...]}
                        | {"status":"error","error":"..."}

(The widget's bot provider also accepts a synchronous {"answer": ...} from POST
/ask, so a localhost dev run can stay one-shot if you prefer.)

Auth: uses the local `claude` login (a Claude subscription via `claude
setup-token`) — NO ANTHROPIC_API_KEY. Whatever gateway/model that login points
to (e.g. a local LLM) is what answers here. Gated by ACCESS_TOKEN + CORS.

Multi-origin: ALLOW_ORIGINS is a comma list; the matching request Origin is
echoed back so several sites (e.g. han-oqo.github.io + ce-blog.ce.moreh.dev)
can share ONE deployed bot.

Run:
    pip install -r requirements.txt
    # one-time auth on this box:  claude setup-token   (or: claude  -> log in)
    ALLOW_ORIGINS="https://han-oqo.github.io,https://ce-blog.ce.moreh.dev" \
      ACCESS_TOKEN="pick-a-secret" python server.py
    # expose over HTTPS (avoids mixed-content from an https page):
    #   cloudflared tunnel --url http://localhost:8787
"""
import os
import time
import uuid
import asyncio
import collections
import aiohttp
from aiohttp import web
from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

# Comma-separated allowlist (falls back to single ALLOW_ORIGIN, then "*").
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")
ALLOW_ORIGINS = [o.strip() for o in os.environ.get("ALLOW_ORIGINS", ALLOW_ORIGIN).split(",") if o.strip()]
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
# The Claude-Code gateway this login points at (~/.claude settings ANTHROPIC_BASE_URL).
# Set GATEWAY_URL so /models can proxy its model list to the widget's dropdown — lets
# the blog pick local-LLM models (no Anthropic-subscription burn) instead of cloud.
GATEWAY_URL = os.environ.get("GATEWAY_URL", "").rstrip("/")
_models_cache = {"t": 0.0, "data": None}
PORT = int(os.environ.get("PORT", "8787"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))     # max POST /ask per window per IP
RATE_WINDOW = int(os.environ.get("RATE_WINDOW", "60"))   # window seconds
_hits = collections.defaultdict(list)

BASE_DISALLOWED = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch"]
JOB_TTL = 600  # keep finished jobs this many seconds, then prune
JOBS = {}      # id -> {"status", "answer"?, "sources"?, "error"?, "t"}


def _flag(name):
    return os.environ.get(name, "") not in ("", "0", "false", "False")


# EDIT MODE (opt-in, off by default): lets the chat edit the page's HTML source
# (add memos / fix text) and commit — because the Agent SDK *is* Claude Code.
# Grants file-edit + shell, so it binds to localhost and must run on YOUR box
# with the repo checked out. Public deploys leave this OFF (read-only).
ALLOW_EDITS = _flag("ALLOW_EDITS")
PUSH = _flag("PUSH")
REPO_DIR = os.environ.get("REPO_DIR", os.getcwd())
HOST = os.environ.get("HOST", "127.0.0.1" if ALLOW_EDITS else "0.0.0.0")


def _cors(resp, origin=""):
    # Echo the request's origin when allow-listed so a MULTI-origin list works in
    # browsers (a single fixed value only lets one site through).
    if "*" in ALLOW_ORIGINS:
        allow = "*"
    elif origin and origin in ALLOW_ORIGINS:
        allow = origin
    else:
        allow = ALLOW_ORIGINS[0] if ALLOW_ORIGINS else "*"
    resp.headers["Access-Control-Allow-Origin"] = allow
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "content-type, x-access-token"
    return resp


def _prune():
    now = time.time()
    for k in [k for k, v in JOBS.items() if now - v.get("t", now) > JOB_TTL]:
        JOBS.pop(k, None)


def _authed(request):
    return not ACCESS_TOKEN or request.headers.get("x-access-token") == ACCESS_TOKEN


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


def _edit_note(page_url):
    return (
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


async def run_job(job_id, question, system, model, web_on, edit_req, page_url):
    answer, parts, sources = None, [], []
    try:
        if edit_req:
            allowed = ["Read", "Edit", "Write", "Bash", "Glob", "Grep"] + (["WebSearch"] if web_on else [])
            options = ClaudeAgentOptions(
                model=model, system_prompt=system + _edit_note(page_url), cwd=REPO_DIR,
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
        async for msg in query(prompt=question, options=options):
            if isinstance(msg, ResultMessage):
                if msg.subtype == "success":
                    answer = msg.result
                continue
            for block in (getattr(msg, "content", None) or []):
                tx = getattr(block, "text", None)
                if tx:
                    parts.append(tx)
                for attr in ("url", "uri"):
                    u = getattr(block, attr, None)
                    if u:
                        sources.append({"url": u, "title": getattr(block, "title", u)})
        text = answer if answer is not None else "".join(parts)
        JOBS[job_id] = {"status": "done", "answer": text or "(no answer)",
                        "sources": sources, "t": time.time()}
    except Exception as e:
        JOBS[job_id] = {"status": "error", "error": str(e), "t": time.time()}


async def handle_ask(request):
    origin = request.headers.get("Origin", "")
    cors = lambda resp: _cors(resp, origin)
    if not _authed(request):
        return cors(web.json_response({"error": "unauthorized"}, status=401))
    ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (request.remote or "?"))
    if not _rate_ok(ip):
        return cors(web.json_response({"error": "rate limited — slow down"}, status=429))
    try:
        data = await request.json()
    except Exception:
        return cors(web.json_response({"error": "bad json"}, status=400))
    question = (data.get("question") or "").strip()
    if not question:
        return cors(web.json_response({"error": "empty question"}, status=400))
    system = data.get("system") or ""
    model = data.get("model") or DEFAULT_MODEL
    web_on = bool(data.get("web"))
    page_url = (data.get("page_url") or "").strip()
    edit_req = ALLOW_EDITS and bool(data.get("edit"))   # server must permit AND request must ask
    _prune()
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "pending", "t": time.time()}
    asyncio.create_task(run_job(job_id, question, system, model, web_on, edit_req, page_url))
    return cors(web.json_response({"id": job_id}))


async def handle_result(request):
    origin = request.headers.get("Origin", "")
    cors = lambda resp: _cors(resp, origin)
    if not _authed(request):
        return cors(web.json_response({"error": "unauthorized"}, status=401))
    job = JOBS.get(request.query.get("id", ""))
    if not job:
        return cors(web.json_response({"status": "error", "error": "unknown or expired id"}, status=404))
    return cors(web.json_response({k: v for k, v in job.items() if k != "t"}))


async def handle_models(request):
    # Discovery: proxy the gateway's /v1/models so the widget can list the
    # local-LLM models. Returns {"models":[{"id","name"}...]} (cached 60s).
    origin = request.headers.get("Origin", "")
    cors = lambda resp: _cors(resp, origin)
    if not _authed(request):
        return cors(web.json_response({"error": "unauthorized"}, status=401))
    if not GATEWAY_URL:
        return cors(web.json_response({"models": [{"id": DEFAULT_MODEL, "name": DEFAULT_MODEL}]}))
    now = time.time()
    if _models_cache["data"] and now - _models_cache["t"] < 60:
        return cors(web.json_response(_models_cache["data"]))
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(GATEWAY_URL + "/v1/models", timeout=aiohttp.ClientTimeout(total=8)) as r:
                j = await r.json()
        models = [{"id": m.get("id"), "name": m.get("display_name") or m.get("id")}
                  for m in (j.get("data") or []) if m.get("id") and m.get("healthy", True)]
        out = {"models": models or [{"id": DEFAULT_MODEL, "name": DEFAULT_MODEL}]}
        _models_cache.update(t=now, data=out)
        return cors(web.json_response(out))
    except Exception as e:
        return cors(web.json_response({"models": [{"id": DEFAULT_MODEL, "name": DEFAULT_MODEL}], "warn": str(e)}))


def main():
    app = web.Application(client_max_size=2 * 1024 * 1024)
    app.router.add_route("OPTIONS", "/ask", handle_options)
    app.router.add_post("/ask", handle_ask)
    app.router.add_route("OPTIONS", "/result", handle_options)
    app.router.add_get("/result", handle_result)
    app.router.add_route("OPTIONS", "/models", handle_options)
    app.router.add_get("/models", handle_models)
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
    print(f"ask-bot-server (async, two-step) on {HOST}:{PORT}  ({mode} · {gate})")
    web.run_app(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
