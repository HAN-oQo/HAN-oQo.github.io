#!/usr/bin/env python3
"""Local study server for onboarding/ — static files + a tiny progress API.

    python3 tools/study_server.py [--port 8000]
    → http://localhost:8000/onboarding/

GET  /api/state  → {"state": <onboarding/progress/state.json>, "feedback": <onboarding/progress/feedback.json>}
POST /api/state  ← full state JSON (answers/checks/feedback/notes); written atomically.

Progress files live in onboarding/progress/ which is gitignored — they never reach
the public repo. Claude (study-session skill) reads state.json to grade written
answers and writes feedback.json; the page shows feedback on reload.
Binds to 127.0.0.1 only.
"""
import argparse, json, os, sys, tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROG = os.path.join(ROOT, "onboarding", "progress")
STATE = os.path.join(PROG, "state.json")
FEEDBACK = os.path.join(PROG, "feedback.json")
MAX_BODY = 5 * 1024 * 1024


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            return self._json(200, {"state": read_json(STATE, {}), "feedback": read_json(FEEDBACK, {})})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/state":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._json(413, {"error": "bad size"})
        try:
            obj = json.loads(self.rfile.read(n).decode("utf-8"))
            if not isinstance(obj, dict):
                raise ValueError("state must be an object")
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": str(e)})
        write_json_atomic(STATE, obj)
        return self._json(200, {"ok": True})

    def end_headers(self):
        if self.path.endswith(".json") or self.path.endswith(".js") or self.path.endswith(".html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("[study] " + (fmt % args) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", a.port), partial(Handler, directory=ROOT))
    print(f"study server: http://localhost:{a.port}/onboarding/  (progress → {os.path.relpath(PROG, ROOT)}/)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
