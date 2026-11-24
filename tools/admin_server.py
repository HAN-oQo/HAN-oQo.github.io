#!/usr/bin/env python3
"""Local admin for han-oqo.github.io — hide/show posts in the section listings.

    python3 tools/admin_server.py [--port 8000]
    → http://localhost:8000/admin/

Binds 127.0.0.1 only. The admin UI lives inside this script (never deployed).
Hiding a post adds the `hidden` attribute to its card in <section>/index.html
(theme.css: a.card[hidden]{display:none}); the page file itself stays reachable by URL.
"적용" runs tools/check_theme.py, commits only the touched index files and pushes.
"""
import argparse, html, json, os, re, subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTIONS = ["learn", "papers", "models", "engines", "lab"]
CARD = re.compile(r'<a class="card" href="([^"]+)"([^>]*)>(.*?)</a>', re.S)


def plain(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def span(block, lang):
    m = re.search(rf'<span class="{lang}">(.*?)</span>', block, re.S)
    return plain(m.group(1)) if m else ""


def ko_chars(path):
    try:
        s = open(path, encoding="utf-8").read()
    except OSError:
        return 0
    if "staticrypt" in s.lower():
        return -1
    s = re.sub(r"<(style|script|pre|svg)\b.*?</\1>", " ", s, flags=re.S)
    parts = re.findall(r'class="ko"[^>]*>(.*?)</', s, re.S) or [s]
    return len("".join(plain(" ".join(parts)).split()))


def posts():
    out = []
    for sec in SECTIONS:
        idx = os.path.join(ROOT, sec, "index.html")
        s = open(idx, encoding="utf-8").read()
        for href, attrs, inner in CARD.findall(s):
            if not href.endswith(".html") or "/" in href:
                continue
            h = re.search(r"<h[23]>(.*?)</h[23]>", inner, re.S)
            p = re.search(r"<p>(.*?)</p>", inner, re.S)
            t = re.search(r'datetime="(\d{4}-\d{2}-\d{2})"', inner)
            tb = re.search(r'<span class="tag[^"]*">(.*?)(?=<h[23]>|<span class="lock")', inner, re.S)
            tag_txt = (span(tb.group(1), "ko") or plain(tb.group(1))) if tb else ""
            kc = ko_chars(os.path.join(ROOT, sec, href))
            out.append({
                "section": sec, "href": href, "hidden": " hidden" in attrs,
                "title": (span(h.group(1), "ko") or plain(h.group(1))) if h else href,
                "title_en": span(h.group(1), "en") if h else "",
                "blurb": (span(p.group(1), "ko") or plain(p.group(1))) if p else "",
                "tag": tag_txt,
                "date": t.group(1) if t else "", "ko_chars": kc, "locked": kc == -1,
            })
    return out


def set_hidden(sec, href, hidden):
    assert sec in SECTIONS and re.fullmatch(r"[\w.\-]+\.html", href)
    idx = os.path.join(ROOT, sec, "index.html")
    s = open(idx, encoding="utf-8").read()
    pat = re.compile(r'<a class="card" href="' + re.escape(href) + r'"( hidden)?>')
    m = pat.search(s)
    if not m:
        raise ValueError("card not found")
    s = s[: m.start()] + f'<a class="card" href="{href}"{" hidden" if hidden else ""}>' + s[m.end():]
    open(idx, "w", encoding="utf-8").write(s)


def git(*a):
    r = subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def pending():
    _, out = git("diff", "--name-only", "--", *[f"{s}/index.html" for s in SECTIONS])
    return [x for x in out.splitlines() if x]


def apply():
    files = pending()
    if not files:
        return {"ok": True, "log": "변경 없음"}
    r = subprocess.run(["python3", "tools/check_theme.py"], cwd=ROOT, capture_output=True, text=True)
    log = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        return {"ok": False, "log": "검사 실패 — 커밋하지 않음\n" + log}
    _, diff = git("diff", "-U0", "--", *files)
    hid = len(re.findall(r'^\+.*<a class="card" [^>]* hidden>', diff, re.M))
    shown = len(re.findall(r'^-.*<a class="card" [^>]* hidden>', diff, re.M))
    git("add", "--", *files)
    c, o = git("commit", "-m", f"[admin] listings: hide {hid}, show {shown}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
    log += "\n" + o
    if c != 0:
        return {"ok": False, "log": log}
    c, o = git("push", "origin", "main")
    return {"ok": c == 0, "log": log + "\n" + o}


ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site admin</title><link rel="stylesheet" href="/assets/theme.css">
<style>
 body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif}
 .wrap{max-width:1040px;margin:0 auto;padding:32px 20px 80px}
 h1{font-size:24px;margin:0 0 4px} .sub{color:var(--muted);font-size:13px;margin:0 0 18px}
 .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px;position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:2}
 .bar button,.bar input,.bar label{font:inherit;font-size:13px}
 .tab{cursor:pointer;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--muted)}
 .tab.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
 #q{padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);min-width:220px}
 #apply{margin-left:auto;cursor:pointer;padding:7px 16px;border-radius:999px;border:0;background:var(--ink);color:var(--bg);font-weight:600}
 #apply:disabled{opacity:.35;cursor:default}
 table{width:100%;border-collapse:collapse;font-size:13.5px}
 th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);vertical-align:top}
 th{color:var(--muted);font-size:12px;font-weight:600}
 tr.hid td{opacity:.45} tr.dirty td{background:var(--amber-bg)}
 td.t a{color:var(--ink);font-weight:600;text-decoration:none} td.t a:hover{text-decoration:underline}
 td.t .b{color:var(--muted);font-size:12.5px;margin-top:2px}
 .pill{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--gray-bg);color:var(--muted);white-space:nowrap}
 .num{font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}
 pre#log{white-space:pre-wrap;background:var(--code-bg);color:var(--code-ink);padding:12px;border-radius:8px;font-size:12px;display:none}
 input[type=checkbox]{width:16px;height:16px;cursor:pointer}
</style></head><body><div class="wrap">
<h1>Site admin</h1>
<p class="sub">체크하면 목록에서 숨깁니다(글 파일과 URL은 유지). 바꾼 뒤 <b>적용</b>을 누르면 검사 → 커밋 → push 합니다. 로컬 전용(127.0.0.1).</p>
<div class="bar"><span id="tabs"></span><input id="q" placeholder="제목·요약 검색"><label><input type="checkbox" id="onlyhid"> 숨긴 글만</label>
<button id="apply" disabled>적용</button></div>
<pre id="log"></pre>
<table><thead><tr><th>숨김</th><th>글</th><th>태그</th><th>날짜</th><th>KO 분량</th></tr></thead><tbody id="rows"></tbody></table>
</div>
<script>
var all=[], sec='all', orig={};
function key(p){return p.section+'/'+p.href}
function load(){fetch('/api/posts').then(r=>r.json()).then(d=>{all=d.posts;all.forEach(p=>{if(!(key(p) in orig))orig[key(p)]=p.hidden});tabs();render();dirty()})}
function tabs(){var secs=['all','learn','papers','models','engines','lab'];var el=document.getElementById('tabs');el.innerHTML='';
 secs.forEach(s=>{var n=all.filter(p=>s=='all'||p.section==s);var h=n.filter(p=>p.hidden).length;var b=document.createElement('button');
 b.className='tab'+(s==sec?' on':'');b.textContent=s+' '+(n.length-h)+'/'+n.length;b.onclick=()=>{sec=s;tabs();render()};el.appendChild(b)})}
function render(){var q=document.getElementById('q').value.toLowerCase(),oh=document.getElementById('onlyhid').checked;var tb=document.getElementById('rows');tb.innerHTML='';
 all.filter(p=>(sec=='all'||p.section==sec)&&(!oh||p.hidden)&&(!q||(p.title+p.title_en+p.blurb+p.href).toLowerCase().includes(q))).forEach(p=>{
  var tr=document.createElement('tr');if(p.hidden)tr.className='hid';if(orig[key(p)]!==p.hidden)tr.className+=' dirty';
  var kc=p.locked?'🔒 잠금':(p.ko_chars?p.ko_chars.toLocaleString()+'자':'-');
  tr.innerHTML='<td><input type="checkbox"'+(p.hidden?' checked':'')+'></td><td class="t"><a target="_blank" href="/'+p.section+'/'+p.href+'"></a><div class="b"></div></td><td><span class="pill"></span></td><td class="num">'+p.date+'</td><td class="num">'+kc+'</td>';
  tr.querySelector('a').textContent=(sec=='all'?'['+p.section+'] ':'')+p.title;tr.querySelector('.b').textContent=p.blurb;tr.querySelector('.pill').textContent=p.tag;
  tr.querySelector('input').onchange=e=>{fetch('/api/hide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({section:p.section,href:p.href,hidden:e.target.checked})}).then(r=>r.json()).then(d=>{if(!d.ok)alert(d.error);p.hidden=e.target.checked;tabs();render();dirty()})};
  tb.appendChild(tr)})}
function dirty(){var n=all.filter(p=>orig[key(p)]!==p.hidden).length;var b=document.getElementById('apply');b.disabled=!n;b.textContent=n?'적용 ('+n+'개 변경)':'적용'}
document.getElementById('q').oninput=render;document.getElementById('onlyhid').onchange=render;
document.getElementById('apply').onclick=function(){this.disabled=true;this.textContent='적용 중…';var lg=document.getElementById('log');
 fetch('/api/apply',{method:'POST'}).then(r=>r.json()).then(d=>{lg.style.display='block';lg.textContent=(d.ok?'✓ 완료\n':'✗ 실패\n')+d.log;if(d.ok){orig={};}load()})};
load();
</script></body></html>"""


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.rstrip("/") == "/admin":
            b = ADMIN_HTML.encode()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        elif self.path == "/api/posts":
            self._json({"posts": posts(), "pending": pending()})
        else:
            super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        try:
            if self.path == "/api/hide":
                set_hidden(body["section"], body["href"], bool(body["hidden"]))
                self._json({"ok": True})
            elif self.path == "/api/apply":
                self._json(apply())
            else:
                self._json({"ok": False, "error": "unknown"}, 404)
        except Exception as e:  # surface errors to the UI
            self._json({"ok": False, "error": str(e)}, 400)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    print(f"site admin: http://localhost:{a.port}/admin/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
