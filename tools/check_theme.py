#!/usr/bin/env python3
"""
check_theme.py — 사이트 전체 HTML의 포맷/테마 일관성 검사.

assets/theme.css 를 single source of truth 로 삼아, 모든 페이지가
같은 골격(doctype/charset/viewport/lang)과 같은 팔레트를 쓰는지 검증한다.
pre-push 훅(.githooks/pre-push)과 CI(.github/workflows/pages.yml)에서 실행된다.

사용법:
    python3 tools/check_theme.py              # 작업트리의 추적 HTML + *.unencrypted.html 검사
    python3 tools/check_theme.py --git <sha>  # 해당 커밋 트리의 HTML 검사 (훅/CI 용)

페이지 분류와 규칙은 CLAUDE.md 의 "페이지 규약" 절과 1:1 로 대응한다.
"""

import re
import subprocess
import sys

ZERO = "0" * 40

# ---------------------------------------------------------------- helpers


def sh(args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def normalize_color(v):
    v = v.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3})", v)
    if m:
        v = "#" + "".join(c * 2 for c in m.group(1))
    return v


class Tree:
    """파일 내용 공급자 — 작업트리 또는 특정 커밋."""

    def __init__(self, git_sha=None):
        self.sha = git_sha

    def html_paths(self):
        if self.sha:
            out = sh(["git", "ls-tree", "-r", "--name-only", self.sha])
            return sorted(p for p in out.splitlines() if p.endswith(".html"))
        tracked = sh(["git", "ls-files", "*.html"]).splitlines()
        import glob

        unenc = glob.glob("**/*.unencrypted.html", recursive=True)
        return sorted(set(tracked) | set(unenc))

    def read(self, path):
        if self.sha:
            try:
                return sh(["git", "show", f"{self.sha}:{path}"])
            except subprocess.CalledProcessError:
                return None
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                return f.read()
        except OSError:
            return None


# ---------------------------------------------------------------- rules

errors = []


def err(path, rule, msg):
    errors.append(f"{path}: [{rule}] {msg}")


def parse_canonical_tokens(theme_css):
    """theme.css 의 :root 블록에서 --token: value 맵 추출."""
    m = re.search(r":root\s*\{(.*?)\}", theme_css, re.S)
    if not m:
        return {}
    tokens = {}
    for name, value in re.findall(r"--([\w-]+)\s*:\s*([^;}]+)", m.group(1)):
        tokens[name] = normalize_color(value)
    return tokens


def is_staticrypt(content):
    return "staticrypt-html" in content or "staticrypt_initiator" in content


def check_skeleton(path, content):
    if not content.lstrip().lower().startswith("<!doctype html"):
        err(path, "doctype", "<!DOCTYPE html> 로 시작해야 함")
    if not re.search(r"<html[^>]*\blang=", content, re.I):
        err(path, "lang", '<html lang="…"> 필요 (en 또는 ko)')
    if not re.search(r'<meta\s+charset=["\']?utf-8', content, re.I):
        err(path, "charset", '<meta charset="utf-8"> 필요')
    if 'name="viewport"' not in content:
        err(path, "viewport", "viewport meta 필요")


def check_theme_source(path, content, tokens):
    """theme.css 링크(올바른 상대경로) 또는 인라인 정본 팔레트 중 하나는 필수."""
    depth = path.count("/")
    expected = "../" * depth + "assets/theme.css"
    if f'href="{expected}"' in content:
        return
    if re.search(r"assets/theme\.css", content):
        err(path, "theme-path", f'theme.css 상대경로가 틀림 — href="{expected}" 여야 함')
        return
    bg, ink = tokens.get("bg", "#faf9f5"), tokens.get("ink", "#1f1e1b")
    has_bg = re.search(r"--bg\s*:\s*" + re.escape(bg), content, re.I)
    has_ink = re.search(r"--ink\s*:\s*" + re.escape(ink), content, re.I)
    if not (has_bg and has_ink):
        err(
            path,
            "theme",
            f'theme.css 링크(href="{expected}")가 없고, 자체 내장 페이지라면 '
            f"정본 팔레트(--bg:{bg}, --ink:{ink} 등)를 인라인해야 함",
        )


def check_palette_drift(path, content, tokens):
    """정본 토큰 이름을 다른 값으로 재정의하면 테마 드리프트로 본다."""
    for name, value in re.findall(r"--([\w-]+)\s*:\s*([^;}]+)", content):
        if name not in tokens:
            continue  # 페이지 고유 변수(--accent 등)는 자유
        got = normalize_color(value)
        if got.startswith("var("):
            continue
        if got != tokens[name]:
            err(
                path,
                "palette-drift",
                f"--{name} 를 {got} 로 재정의 — 정본 값은 {tokens[name]} (theme.css)",
            )


def check_i18n(path, content):
    """en/ko 이중언어 span 을 쓰는 페이지는 i18n 토글 장치가 있어야 한다."""
    if not re.search(r'class="(en|ko)"', content):
        return
    linked = "assets/i18n.js" in content and "assets/i18n.css" in content
    inline = "html[data-lang=" in content and "lang-toggle" in content
    if not (linked or inline):
        err(
            path,
            "i18n",
            "en/ko span 사용 중인데 i18n 장치가 없음 — assets/i18n.css+js 링크 "
            "또는 자체 내장 토글(html[data-lang=…] + .lang-toggle) 필요",
        )


def check_body_font(path, content):
    """body 에 font-family 를 직접 선언하면 시스템 폰트 스택으로 시작해야 한다."""
    for block in re.findall(r"(?:^|[}\s])body\s*\{([^}]*)\}", content):
        if "font-family" in block and "-apple-system" not in block:
            err(path, "font", "body font-family 는 -apple-system 으로 시작하는 스택이어야 함")


def check_staticrypt_lockscreen(path, content, tokens):
    """암호화 페이지의 잠금 화면이 사이트 테마 색을 쓰는지 확인."""
    bg, ink = tokens.get("bg", "#faf9f5"), tokens.get("ink", "#1f1e1b")
    if bg not in content.lower():
        err(path, "lockscreen", f"StatiCrypt 잠금 화면에 테마 배경색 {bg} 이 없음 "
                                f"(--template-color-secondary '{bg}' 로 암호화할 것)")
    if ink not in content.lower():
        err(path, "lockscreen", f"StatiCrypt 잠금 화면에 테마 잉크색 {ink} 이 없음 "
                                f"(--template-color-primary '{ink}' 로 암호화할 것)")
    if 'name="viewport"' not in content:
        err(path, "viewport", "viewport meta 필요")


def check_index_linkage(tree, paths):
    """study/logs/infra 의 콘텐츠 페이지는 해당 섹션 index.html 에 링크돼야 한다."""
    for section in ("study", "logs", "infra"):
        index = f"{section}/index.html"
        idx_content = tree.read(index)
        if idx_content is None:
            continue
        for p in paths:
            if not p.startswith(section + "/"):
                continue
            name = p.split("/", 1)[1]
            if name == "index.html" or name.endswith(".unencrypted.html") or "/" in name:
                continue
            if name not in idx_content:
                err(p, "index-link", f"{index} 에 이 페이지 링크(카드)가 없음")


# ---------------------------------------------------------------- post-meta (created/updated)

POSTMETA_BLOCK = re.compile(r'<p class="post-meta">(.*?)</p>', re.S)
CARD_RE = re.compile(r'<a class="card" href="([^"]+)">(.*?)</a>', re.S)


def postmeta_dates(inner):
    """post-meta 블록 안에서 (created, updated|None) 추출. created 없으면 None."""
    times = re.findall(r'datetime="(\d{4}-\d{2}-\d{2})"', inner)
    if not times:
        return None
    has_updated = "updated-label" in inner
    created = times[0]
    updated = times[-1] if (has_updated and len(times) >= 2) else None
    return (created, updated)


def check_postmeta(tree, paths):
    """created/updated 날짜 규약 강제:
      - 모든 섹션 index 의 콘텐츠 카드는 created <time datetime> 을 가져야 한다
      - updated 가 있으면 형식이 맞고 created ≤ updated 여야 한다
      - 페이지 hero 의 post-meta 날짜가 index 카드의 날짜와 일치해야 한다 (드리프트 차단)
    규약: 카드는 '최초 작성일' 순서를 유지하고, 페이지를 고치면 updated 를 단다.
    """
    for section in ("study", "logs", "infra"):
        index = f"{section}/index.html"
        idx = tree.read(index)
        if idx is None:
            continue
        for href, inner in CARD_RE.findall(idx):
            if not href.endswith(".html") or "/" in href:
                continue  # 외부/하위경로 링크는 콘텐츠 카드가 아님
            m = POSTMETA_BLOCK.search(inner)
            if not m:
                err(index, "post-meta", f"카드 [{href}] 에 <p class=\"post-meta\"> 가 없음")
                continue
            d = postmeta_dates(m.group(1))
            if d is None:
                err(index, "post-meta", f"카드 [{href}] post-meta 에 created <time datetime> 가 없음")
                continue
            created, updated = d
            if updated and updated < created:
                err(index, "post-meta", f"카드 [{href}] updated({updated}) 가 created({created}) 보다 빠름")
            # 페이지 hero 와 일치하는지 (페이지에 post-meta 가 있을 때만)
            page = tree.read(f"{section}/{href}")
            if page is None or is_staticrypt(page):
                continue
            pm = POSTMETA_BLOCK.search(page)
            if not pm:
                continue  # 페이지 hero 에 post-meta 가 없으면 통과 (카드만 있어도 됨)
            pd = postmeta_dates(pm.group(1))
            if pd != d:
                err(f"{section}/{href}", "post-meta",
                    f"페이지 hero 날짜 {pd} 가 index 카드 날짜 {d} 와 불일치 "
                    f"(둘을 같이 갱신하라)")


def bump_check(base, head):
    """수정된 콘텐츠 페이지는 갱신일(post-meta)도 바뀌어야 한다 — pre-push 강제용.
    base..head 사이에서 내용이 바뀐 study/logs/infra 콘텐츠 페이지의 post-meta 블록이
    그대로면(=updated 날짜를 안 올렸으면) 실패. 신규 추가/삭제 파일은 면제."""
    try:
        changed = sh(["git", "diff", "--name-only", base, head]).splitlines()
    except subprocess.CalledProcessError:
        return
    bt, ht = Tree(base), Tree(head)
    for p in changed:
        if not p.endswith(".html") or p.endswith(".unencrypted.html"):
            continue
        seg = p.split("/")
        if len(seg) != 2 or seg[0] not in ("study", "logs", "infra") or seg[1] == "index.html":
            continue
        b, h = bt.read(p), ht.read(p)
        if b is None or h is None or b == h:
            continue  # 신규/삭제/무변경
        if is_staticrypt(h):
            continue
        mb, mh = POSTMETA_BLOCK.search(b), POSTMETA_BLOCK.search(h)
        if (mb.group(0) if mb else "") == (mh.group(0) if mh else ""):
            err(p, "post-meta-bump",
                "페이지를 수정했는데 post-meta(갱신일)가 그대로다 — "
                "hero 와 index 카드에 updated 날짜를 갱신하라")


# ---------------------------------------------------------------- main


def main():
    git_sha = None
    args = sys.argv[1:]
    if args and args[0] == "--bump-check":
        if len(args) < 3:
            print("usage: check_theme.py --bump-check <base_sha> <head_sha>", file=sys.stderr)
            return 2
        bump_check(args[1], args[2])
        if errors:
            print(f"✗ 갱신일(post-meta) 검사 실패 — {len(errors)}건\n", file=sys.stderr)
            for e in errors:
                print("  " + e, file=sys.stderr)
            print("\n규약: 페이지를 고치면 hero + index 카드의 updated 날짜를 갱신한다 (CLAUDE.md).", file=sys.stderr)
            return 1
        return 0
    if args and args[0] == "--git":
        if len(args) < 2:
            print("usage: check_theme.py [--git <sha>]", file=sys.stderr)
            return 2
        git_sha = args[1]

    tree = Tree(git_sha)
    theme_css = tree.read("assets/theme.css")
    if theme_css is None:
        print("FATAL: assets/theme.css 가 없음 — 테마의 single source of truth", file=sys.stderr)
        return 1
    tokens = parse_canonical_tokens(theme_css)

    paths = tree.html_paths()

    # 암호화 전 소스가 커밋/푸시에 포함되면 안 된다 (작업트리 검사 시에는 허용)
    for p in paths:
        if p.endswith(".unencrypted.html"):
            if git_sha:
                err(p, "unencrypted", "*.unencrypted.html 은 커밋 금지 — 암호화본만 게시")
            elif p in sh(["git", "ls-files", "*.unencrypted.html"]).splitlines():
                err(p, "unencrypted", "*.unencrypted.html 이 git 에 추적되고 있음 — git rm --cached 필요")

    for p in paths:
        content = tree.read(p)
        if content is None:
            continue
        if is_staticrypt(content):
            check_staticrypt_lockscreen(p, content, tokens)
            continue
        check_skeleton(p, content)
        check_theme_source(p, content, tokens)
        check_palette_drift(p, content, tokens)
        check_i18n(p, content)
        check_body_font(p, content)

    check_index_linkage(tree, paths)
    check_postmeta(tree, paths)

    n = len([p for p in paths])
    if errors:
        print(f"✗ 테마/포맷 검사 실패 — {len(errors)}건 (검사 대상 {n}개 파일)\n", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        print("\n규약은 CLAUDE.md 참고. 검사 로직: tools/check_theme.py", file=sys.stderr)
        return 1
    print(f"✓ 테마/포맷 검사 통과 ({n}개 HTML)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
