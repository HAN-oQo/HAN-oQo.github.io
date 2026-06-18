---
name: briefing-push
description: Check what's new in briefings/, run full theme check, stage only briefing changes, commit with a standard message, and push. Use whenever the user asks to push today's morning briefing update.
---

# briefing-push — check, commit, push today's briefing update

Run every time the user says "브리핑 push", "morning brief update push", or similar.

## Steps (execute in order, no skips)

### 1. Identify what changed

```bash
git status --short
```

Note which `briefings/` files appear (staged or unstaged). Also note any non-briefing files
staged — these must be **unstaged before committing**.

Non-briefing staged files to unstage (examples):
- `study/**`, `infra/**`, `logs/**` pages
- `.claude/skills/**`
- `assets/<non-briefing>/`

Only these belong in a briefing commit:
- `briefings/ai-briefing-YYYY-MM-DD.html`
- `briefings/index.html`

### 2. Run theme check

```bash
python3 tools/check_theme.py
```

Must print `✓ 테마/포맷 검사 통과`. If it fails, **stop and report the errors** — do not commit.

### 3. Detect what the update contains

Look at the staged diff to write a precise commit message:

```bash
git diff --staged briefings/
```

Common patterns:
- Added `<!-- ============ 2b. HUGGING FACE DAILY PAPERS ============ -->` → "add section 2b — all N HF Daily Papers"
- Added `<!-- ============ 3. GEEK NEWS ============ -->` → "add section 3 — GeekNews"
- Removed stale items → "fix section N — drop misdated items"
- Initial briefing file → "add AI morning briefing YYYY-MM-DD"

Check the `<h2>` tags and lede paragraphs in the diff to count papers and identify sections.

### 4. Unstage non-briefing files (if any)

```bash
git reset HEAD <file> [<file> …]
```

Verify after: `git diff --staged --stat` should list only `briefings/` files.

### 5. Commit

Message format: `briefings(MM-DD): <what changed>`

Examples:
- `briefings(06-18): add section 2b — all 11 HF Daily Papers`
- `briefings(06-18): fix section 4 — drop stale industry items`
- `briefings: add AI morning briefing 2026-06-18`

```bash
git commit -m "$(cat <<'EOF'
briefings(MM-DD): <description>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### 6. Push

```bash
git push
```

The pre-push hook re-runs `check_theme.py`. If it fails, fix the theme error and amend
or create a new commit — **never use `--no-verify`**.

### 7. Report

After a successful push confirm:

- Date of the briefing updated
- Sections added/changed
- Commit hash (short) and push line from git output

---

## Edge cases

**Lock file exists** (`fatal: '.git/index.lock'`):
```bash
rm -f .git/index.lock
```
Then retry the failing git command.

**`updated` date missing in hero** — If the briefing already existed and was modified today,
the `.post-meta` must include an `updated` `<time>` tag (see CLAUDE.md §"작성일/갱신일 규약").
The theme check's `post-meta-bump` rule will catch this on push; fix it before pushing.

**briefings/index.html card date mismatch** — The card's `<time>` must equal the hero `<time>`.
Check both if `post-meta` errors appear.

**Nothing to commit** — If `git diff --staged --stat` is empty after staging, the working-tree
file is unmodified vs HEAD. Ask the user if the briefing file was actually saved/regenerated.
