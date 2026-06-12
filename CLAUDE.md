# CLAUDE.md — han-oqo.github.io 작업 규약

이 레포는 [https://han-oqo.github.io/](https://han-oqo.github.io/) 의 소스다.
빌드 없음 — main 에 push 하면 GitHub Pages 로 그대로 배포된다.

**이 문서의 목적: 누가, 어떤 세션에서 HTML 을 만들어도 결과물이 기존 페이지와
동일한 포맷과 테마를 갖게 하는 것.** 아래 규약은 자동으로 강제된다:

- `tools/check_theme.py` — 전체 HTML 의 포맷/테마 일관성 검사 (규칙의 단일 구현체)
- `.githooks/pre-push` — push 시 위 검사를 실행, 실패하면 **push 차단**
- `.github/workflows/pages.yml` — CI 에서도 같은 검사, 실패하면 **배포 차단**

## 시작하기 전에 (모든 세션 필수)

1. 훅이 활성화돼 있는지 확인: `git config core.hooksPath` 가 `.githooks` 가 아니면
   `sh tools/install-hooks.sh` 를 실행한다.
2. HTML 을 만들거나 고친 뒤에는 **반드시** `python3 tools/check_theme.py` 를 돌려
   통과시킨 후 커밋한다. push 단계에서 어차피 강제되지만, 미리 돌리는 게 빠르다.

## 테마 — 단일 진실 공급원

`assets/theme.css` 가 사이트 전체 팔레트와 기본 타이포그래피의 **single source of
truth** 다. 크림/웜 톤 라이트 테마이며 다크 테마는 쓰지 않는다.

- 페이지 안에서 색은 **반드시 `var(--토큰)` 으로만** 사용한다. 주요 토큰:
  `--bg --card --ink --muted --faint --line`, 색 계열은
  `--blue|green|amber|red|purple|gray` 의 `-bg/-bd/-ink` 3종 세트,
  코드 블록은 `--code-bg --code-ink`.
- **정본 토큰을 다른 값으로 재정의하는 것은 금지** (palette-drift 로 검사 실패).
  페이지 전용 색이 필요하면 `--accent`, `--kw` 처럼 **새 이름**의 변수를 만든다.
- 새 색 토큰이 사이트 전반에 필요해지면 theme.css 에 추가한다 — 페이지에 하드코딩하지 않는다.

## 페이지 공통 골격 (모든 HTML 필수)

- `<!DOCTYPE html>` 로 시작
- `<html lang="en" data-lang="en">` (이중언어) 또는 `<html lang="ko">` (한국어 전용)
- `<meta charset="utf-8">` + viewport meta
- `body` 에 `font-family` 를 직접 선언할 경우 `-apple-system` 으로 시작하는
  시스템 폰트 스택만 사용 (한글 폴백: `"Apple SD Gothic Neo","Pretendard","Malgun Gothic"`)
- 콘텐츠는 `.wrap` 컨테이너 (max-width 780–1040px, 페이지 성격에 맞게)
- 상단에 breadcrumb: `<p class="crumb"><a href="../">Home</a> · …</p>` (theme.css 가 스타일 제공)

## 페이지 타입 — 새 페이지는 반드시 이 중 하나

### A. 표준 페이지 (study/, infra/ — EN/KO 이중언어)

```html
<!DOCTYPE html>
<html lang="en" data-lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>페이지 제목</title>
<link rel="stylesheet" href="../assets/theme.css">
<link rel="stylesheet" href="../assets/i18n.css">
<style>
  .wrap{max-width:880px;margin:0 auto;padding:48px 22px 96px}
  /* 페이지 전용 스타일 — 색은 var(--…) 토큰만 */
</style>
</head>
<body>
<div class="wrap">
  <p class="crumb"><a href="../">Home</a> · <a href="./">Study</a> · 제목</p>
  <h1><span class="en">Title</span><span class="ko">제목</span></h1>
  …
</div>
<script src="../assets/i18n.js"></script>
</body>
</html>
```

- 사용자에게 보이는 **모든 텍스트**를 `<span class="en">…</span><span class="ko">…</span>`
  쌍으로 작성한다. 언어 토글 버튼은 `i18n.js` 가 자동으로 붙인다.
- `assets/…` 상대경로는 디렉터리 깊이에 맞춘다 (루트: `assets/`, 1단계: `../assets/`).

### B. 한국어 전용 작업 로그 (logs/)

A 와 같되 `<html lang="ko">`, i18n 링크/스크립트와 en/ko span 없이 한국어로만 작성.
`theme.css` 링크는 동일하게 필수. 코드 블록은 `--code-bg/--code-ink` 또는
기존 logs 페이지의 pre 스타일을 따른다.

### C. 자체 내장 페이지 (study/ai-briefing-*.html 류)

외부 asset 링크 없이 단일 파일로 완결되어야 할 때만 사용. 조건:
- theme.css 의 정본 팔레트를 `:root{…}` 에 **정확히 같은 값으로** 인라인
  (최소 `--bg:#faf9f5`, `--ink:#1f1e1b` 포함 — 기존 briefing 페이지에서 복사)
- i18n 을 쓰면 토글도 인라인 (`html[data-lang=…]` CSS + `.lang-toggle` 마크업/JS,
  기존 briefing 페이지에서 복사)

### D. 비공개(게이트) 페이지 — StatiCrypt

내부 성향 콘텐츠는 클라이언트 사이드 암호화해서 게시한다.

1. 소스는 `<이름>.unencrypted.html` 로 작성 (타입 A/B 규약 그대로 따를 것)
2. 암호화 — 잠금 화면이 사이트 테마와 같도록 **템플릿 색상 고정**:
   ```sh
   npx --yes staticrypt <이름>.unencrypted.html -p '<사이트 공통 패스워드>' --short -d <출력 디렉터리> \
     --template-title 'Protected · password required' \
     --template-instructions 'Enter password to view this page.' \
     --template-color-primary '#1f1e1b' --template-color-secondary '#faf9f5' \
     --remember false
   ```
   패스워드는 기존 게이트 페이지와 동일한 것을 사용한다 (레포에 적지 않는다 — 소유자 보관).
   salt 는 `.staticrypt.json` 에 고정돼 있어 결과가 일관된다.
3. `*.unencrypted.html` 은 **절대 커밋 금지** (.gitignore 처리됨, 검사기도 차단)

## 새 페이지 체크리스트

1. 위 타입 중 하나의 골격으로 작성 (기존 같은 섹션 페이지를 베이스로 복사 권장)
2. 해당 섹션 `index.html` 에 카드 추가 — 기존 카드(`a.card` + `.tag` + `.post-meta`
   created/updated 날짜) 형식 그대로 (검사기가 index 링크 누락을 잡는다)
3. `python3 tools/check_theme.py` 통과 확인
4. 로컬 미리보기: `python3 -m http.server 8000`

## 검사 규칙 요약 (tools/check_theme.py)

| 규칙 | 내용 |
|---|---|
| doctype/lang/charset/viewport | 공통 골격 필수 요소 |
| theme / theme-path | theme.css 를 올바른 상대경로로 링크하거나(A/B), 정본 팔레트 인라인(C) |
| palette-drift | 정본 토큰(`--bg` 등)을 다른 값으로 재정의 금지 |
| i18n | en/ko span 을 쓰면 i18n 장치(링크 또는 인라인) 필수 |
| font | body font-family 는 `-apple-system` 시작 스택만 |
| lockscreen | StatiCrypt 잠금 화면은 `#faf9f5`/`#1f1e1b` 템플릿 색 |
| index-link | study/logs/infra 콘텐츠 페이지는 섹션 index 에 링크 필수 |
| unencrypted | `*.unencrypted.html` 커밋/push 금지 |

규칙을 바꾸고 싶다면: theme.css(값) 또는 check_theme.py(로직)를 고치고,
이 문서도 함께 갱신한다. 셋이 어긋나면 안 된다.
