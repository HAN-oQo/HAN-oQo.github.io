#!/usr/bin/env bash
# launch.sh — one command to stand up the Claude bot in tmux and print what to
# paste into the widget. You just run this; then use the widget.
#
#   bash assets/ask-bot-server/launch.sh            # LOCAL edit mode (only you)
#   TUNNEL=1 bash assets/ask-bot-server/launch.sh   # public read-only (live site)
#
# It: (1) gets a Claude subscription token via `claude setup-token` (browser once),
#     (2) starts server.py in tmux, (3) in local mode also serves the site at :8000,
#     (4) prints Provider/URL/Token for the widget ⚙.
#
# Safety — only YOU can edit/push: edit mode binds to 127.0.0.1, so no other
# browser on the internet can reach it (their "127.0.0.1" is their own machine).
# The URL+token live only in your browser, and `git push` uses YOUR machine's
# git credentials. TUNNEL mode is forced read-only (never exposes edit publicly).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${REPO_DIR:-$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo "$HERE")}"
PORT="${PORT:-8787}"
PREVIEW_PORT="${PREVIEW_PORT:-8000}"
SESS="${TMUX_SESSION:-askbot}"
TUNNEL="${TUNNEL:-0}"
PY="${PYTHON:-python}"

gen_tok() { head -c 18 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n' || date +%s%N; }
ACCESS_TOKEN="${ACCESS_TOKEN:-$(gen_tok)}"

command -v tmux   >/dev/null || { echo "need tmux"; exit 1; }
command -v claude >/dev/null || { echo "need claude CLI: npm i -g @anthropic-ai/claude-code"; exit 1; }

# 1) subscription auth (no API key)
#    - If `claude` is already logged in on this box (you use Claude Code here),
#      set SKIP_TOKEN=1 to just reuse that login — no browser step needed.
#    - Otherwise `claude setup-token` gets a token (browser auth once).
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ "${SKIP_TOKEN:-0}" != "1" ]; then
  echo "==> Claude 구독 토큰 발급 중 (브라우저 인증 1회)…  (이미 claude 로그인돼 있으면 SKIP_TOKEN=1 로 생략)"
  TOK="$(claude setup-token 2>&1 | tee /tmp/askbot-setup.log | grep -oE 'sk-ant-oat[A-Za-z0-9_-]+' | tail -1 || true)"
  [ -n "$TOK" ] || { echo "토큰 캡처 실패 — /tmp/askbot-setup.log 확인 (또는 'claude' 로그인 확인)"; exit 1; }
  export CLAUDE_CODE_OAUTH_TOKEN="$TOK"
  echo "==> 토큰 확보."
fi
# pass the token env to the tmux processes only if we actually have one
TOKEN_ENV=""
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && TOKEN_ENV="CLAUDE_CODE_OAUTH_TOKEN='$CLAUDE_CODE_OAUTH_TOKEN' "

tmux kill-session -t "$SESS" 2>/dev/null || true
tmux new-session -d -s "$SESS" -c "$REPO_DIR"

if [ "$TUNNEL" = "1" ]; then
  command -v cloudflared >/dev/null || { echo "need cloudflared for TUNNEL=1"; exit 1; }
  tmux send-keys -t "$SESS" "${TOKEN_ENV}ALLOW_EDITS=0 ACCESS_TOKEN='$ACCESS_TOKEN' PORT=$PORT ALLOW_ORIGIN='https://han-oqo.github.io' $PY '$REPO_DIR/assets/ask-bot-server/server.py'" C-m
  tmux split-window -t "$SESS" -h -c "$REPO_DIR"
  tmux send-keys -t "$SESS" "cloudflared tunnel --url http://localhost:$PORT 2>&1 | tee /tmp/askbot-tunnel.log" C-m
  echo "==> 공개 https 터널 URL 대기…"
  URL=""
  for _ in $(seq 1 25); do
    sleep 1
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/askbot-tunnel.log 2>/dev/null | head -1 || true)"
    [ -n "$URL" ] && break
  done
  ASK_URL="${URL:-http://127.0.0.1:$PORT}/ask"
  MODE="read-only (public tunnel — Q&A only, no editing)"
  PREVIEW=""
else
  tmux send-keys -t "$SESS" "${TOKEN_ENV}ALLOW_EDITS=1 ACCESS_TOKEN='$ACCESS_TOKEN' PORT=$PORT REPO_DIR='$REPO_DIR' $PY '$REPO_DIR/assets/ask-bot-server/server.py'" C-m
  tmux split-window -t "$SESS" -h -c "$REPO_DIR"
  tmux send-keys -t "$SESS" "$PY -m http.server $PREVIEW_PORT" C-m
  ASK_URL="http://127.0.0.1:$PORT/ask"
  MODE="EDIT MODE — localhost only (only you can edit/push)"
  PREVIEW="http://localhost:$PREVIEW_PORT/"
fi

cat <<EOF

================  위젯 ⚙ 에 입력  ================
 Provider     : My Claude bot (Agent SDK)
 URL          : $ASK_URL
 Access token : $ACCESS_TOKEN
 Mode         : $MODE
EOF
[ -n "$PREVIEW" ] && echo " 사이트 프리뷰 : $PREVIEW  ← 여기서 보면서 '편집 모드' 체크하고 메모 추가/수정"
cat <<EOF
 tmux         : tmux attach -t $SESS   (빠져나오기: Ctrl-b 그다음 d)
=================================================
EOF
