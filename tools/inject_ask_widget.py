#!/usr/bin/env python3
"""Inject the "Ask about this page" AI widget into every deployed HTML page.

Runs in CI (the Pages *deploy* job) on the checked-out copy BEFORE the artifact
is uploaded — so the widget appears on EVERY page of the live site automatically,
no matter who added the HTML or in which session. Source files are NOT modified
(this only touches the throwaway CI checkout), so it never trips the
created/updated post-meta rules.

Idempotent. Skips pages that already load ask.js or i18n.js (i18n.js loads
ask.js itself), StatiCrypt lock pages, and *.unencrypted.html.

Usage:
    python3 tools/inject_ask_widget.py            # inject (modifies files in place)
    python3 tools/inject_ask_widget.py --dry      # report only, no writes
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".github", "node_modules", "tools"}
DRY = "--dry" in sys.argv


def rel_ask(path):
    """Relative path from `path` to assets/ask.js (handles any directory depth)."""
    depth = os.path.relpath(path, ROOT).count(os.sep)
    return ("../" * depth) + "assets/ask.js"


def skip(content):
    if "assets/ask.js" in content:
        return True            # already has the widget
    if "i18n.js" in content:
        return True            # i18n.js loads ask.js for us
    if "staticrypt" in content.lower():
        return True            # encrypted lock pages — leave untouched
    return False


def main():
    injected = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in sorted(filenames):
            if not fn.endswith(".html") or fn.endswith(".unencrypted.html"):
                continue
            p = os.path.join(dirpath, fn)
            with open(p, encoding="utf-8") as f:
                content = f.read()
            if skip(content):
                continue
            m = list(re.finditer(r"</body>", content, re.IGNORECASE))
            if not m:
                continue
            idx = m[-1].start()
            tag = '<script defer src="%s"></script>\n' % rel_ask(p)
            if not DRY:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(content[:idx] + tag + content[idx:])
            injected += 1
            print(("would inject" if DRY else "injected") + ":", os.path.relpath(p, ROOT))
    print("ask-widget: %d page(s) %s" % (injected, "would be injected" if DRY else "injected"))


if __name__ == "__main__":
    main()
