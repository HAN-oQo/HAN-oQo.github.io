#!/usr/bin/env sh
# gate-encrypt.sh — StatiCrypt 비밀번호 게이트 (타입 D) 한 방 빌드.
#
#   bash tools/gate-encrypt.sh logs/<이름>.unencrypted.html
#
# 비밀번호는 인자로 받지 않고 프롬프트(read -s)로 입력 → 명령행/로그에 안 남는다.
# 사이트 공통 게이트 비번을 입력할 것(기존 게이트 페이지와 같은 값, 소유자 보관).
# 결과: 같은 폴더에 <이름>.html (암호화본). 소스(*.unencrypted.html)는 .gitignore 처리됨.
set -eu

SRC="${1:-}"
case "$SRC" in
  *.unencrypted.html) ;;
  *) echo "usage: bash tools/gate-encrypt.sh <path>.unencrypted.html" >&2; exit 2 ;;
esac
[ -f "$SRC" ] || { echo "no such file: $SRC" >&2; exit 2; }

DIR=$(dirname "$SRC")
BASE=$(basename "$SRC" .unencrypted.html)
OUT="$DIR/$BASE.html"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf 'Gate password (hidden): '
stty -echo 2>/dev/null || true
read -r PW
stty echo 2>/dev/null || true
printf '\n'
[ -n "$PW" ] || { echo "empty password — aborted" >&2; exit 2; }

# Lock-screen colors are FIXED to the site theme (check_theme 'lockscreen' rule).
npx --yes staticrypt "$SRC" -p "$PW" --short -d "$TMP" \
  --template-title 'Protected · password required' \
  --template-instructions 'Enter password to view this page.' \
  --template-color-primary '#1f1e1b' --template-color-secondary '#faf9f5' \
  --remember false
PW=""

mv "$TMP/$(basename "$SRC")" "$OUT"
grep -q "staticrypt" "$OUT" || { echo "encryption produced a non-staticrypt file?!" >&2; exit 1; }
echo "✓ wrote $OUT  (source stays uncommitted: $SRC)"
echo "  next: python3 tools/check_theme.py && git add $OUT && git commit && git push"
