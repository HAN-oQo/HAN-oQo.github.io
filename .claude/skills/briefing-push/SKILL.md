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
- Initial briefing file → "morning AI briefing (engines, 2a/2b papers, GeekNews, industry)"

Check the `<h2>` tags and lede paragraphs in the diff to count papers and identify sections.

### 4. Unstage non-briefing files (if any)

```bash
git reset HEAD <file> [<file> …]
```

Verify after: `git diff --staged --stat` should list only `briefings/` files.

### 5. Commit

Message format: `briefing YYYY-MM-DD: <what changed>`

날짜는 **고친 브리핑의 날짜**이지 오늘 날짜가 아니다 (며칠 지난 브리핑에 2c 를 붙이는
경우가 흔하다). Examples — 실제 로그에서 쓰는 형식:

- `briefing 2026-10-11: morning AI briefing (engines, 2a/2b papers, GeekNews, industry)`
- `briefing 2026-10-09: add section 2c Hugging Face daily papers (23)`
- `briefing 2026-10-06: fix section 4 — drop stale industry items`

```bash
git commit -m "$(cat <<'EOF'
briefing YYYY-MM-DD: <description>

Co-Authored-By: <이 세션의 어트리뷰션 라인>
EOF
)"
```

트레일러는 모델명을 문서에 박지 말고 **그 세션에 주어진 어트리뷰션 라인**을 쓴다
(예: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`).

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

**post-meta-bump 의 정확한 조건** — "바뀌었으면 통과"가 아니라 **post-meta 의 가장 늦은
날짜가 오늘이어야** 통과한다. 그래서 며칠 전에 써 두고 오늘 올리는 변경이면, 그 페이지가
이미 원격에 있는 경우 **갱신일을 오늘로** 올려야 한다 (hero + index 카드 양쪽).
원격에 없던 **신규 파일은 면제**다 (`check_theme.py` 가 base 트리에 없는 파일은 건너뛴다).

**밀린 커밋을 한꺼번에 push 할 때** — pre-push 훅은 마지막 커밋이 아니라
**push 범위 전체(`origin/main..HEAD`)** 를 검사한다. 그래서 몇 주 전에 수정해 둔
"이미 공개된" 페이지가 섞여 있으면 그게 push 를 막는다. 위반 목록을 먼저 뽑고
(아래 한 줄), 해당 페이지들만 갱신일을 오늘로 올린 뒤 push 한다.

```bash
# 어떤 페이지가 걸리는지 먼저 확인 — 신규 파일은 제외하고 수정된 기존 페이지만 나온다
git diff --name-status origin/main..HEAD -- briefings/ study/ logs/ infra/ post-training/ | grep "^M"
```

`--no-verify` 로 우회하지 않는다. 훅이 막는 건 대개 진짜 규약 위반이다.

**briefings/index.html card date mismatch** — The card's `<time>` must equal the hero `<time>`.
Check both if `post-meta` errors appear.

**Nothing to commit** — If `git diff --staged --stat` is empty after staging, the working-tree
file is unmodified vs HEAD. Ask the user if the briefing file was actually saved/regenerated.
