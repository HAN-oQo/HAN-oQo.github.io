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

### 카드 태그 버튼 색 — 분야별 통일 (강제 컨벤션)

카드의 `.tag` 버튼 색은 **분야(field)별로 사이트 전체에서 동일**해야 한다. `.t-*`
클래스는 **`theme.css` 에만** 정의한다 (single source) — index 페이지에 인라인으로
`.t-*` 를 재정의하지 말 것. 분야 → 색 매핑:

| 색 | 분야 |
|---|---|
| `t-blue` | Paper / Reference (논문·자료 읽기) |
| `t-green` | Code / Deep dive / Analysis / Comparison (코드 분석) |
| `t-coral` | Model report (모델 리포트) |
| `t-amber` | Hands-on / Series·GitOps / Experiment / Runbook / Guide (실습·운영) |
| `t-purple` | Infra / Networking (인프라) |
| `t-gray` | Briefing (모닝 브리핑·일일) |

팔레트는 **시각적으로 구별되는 6색뿐**이다 (blue·green·amber·coral·purple·gray).
이 팔레트에선 `teal`=green, `coral`=red 로 동일하게 렌더되므로 태그 색은 위 6개만
쓴다 (`t-teal`/`t-red` 는 별도 색이 아니다). 새 카드는 그 분야에 맞는 색을 쓰고,
새 분야가 생기면 위 표와 theme.css 의 `.t-*` 주석을 함께 갱신한다.

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

### 섹션 구조

top-level 콘텐츠 섹션은 `study/`(추론 노트·논문 정리·모델 리포트), `post-training/`
(포스트트레이닝 방법론·프레임워크 조사 + 공부 계획), `infra/`(인프라), `logs/`(작업 로그),
`briefings/`(매일의 AI 모닝 브리핑 — 타입 C 자체완결, EN/KO).
각 섹션은 자체 `index.html`(카드 목록)을 갖고 루트 `index.html` 에서 링크된다.
새 섹션을 추가하면 `check_theme.py` 의 섹션 튜플 3곳에도 추가한다.

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

## 논문 정리 (paper note) 규약

사용자가 논문 링크(arXiv 등)를 주고 정리를 요청하면 **반드시 이 규약대로** 만든다.
기준 예시: `study/llm-serving-software-aging.html` (이 파일을 복사해서 시작할 것).

### 준비 — 전문을 끝까지 읽는다

1. 전문 확보: `curl -sL https://arxiv.org/html/<id> -o /tmp/paper.html` 후
   `textutil -convert txt -stdout /tmp/paper.html > /tmp/paper.txt` (macOS) 등으로 텍스트화.
2. **초록과 결론만 보고 쓰지 않는다.** 본문 전체를 단락 단위로 읽고, 모든 소절
   (배경·방법·결과 소절·threats/limitations 포함)이 노트에 반영돼야 한다. 단락 누락 금지.

### 파일과 구조

- 파일: `study/<영문-슬러그>.html`, 페이지 타입 A (EN/KO 이중언어).
- 구성: hero(제목 + lede + badge: arXiv abs 링크·HTML 전문 링크·분야와 게재일·저자)
  → TOC → "한 줄 요약" callout → 본문 4개 섹션 → footer(논문 링크 + 작성일).
- 본문은 **고정 4단 구조** (h2 + 번호 칩, 이 순서 그대로):
  1. **문제 정의** — 기존 연구의 빈자리/한계, 이해에 필요한 배경 지식, 관련 연구와의 차별점
  2. **해결 방법** — 설계 목표, 방법론 전부 (실험/시스템 구성표를 HTML 표로 재구성)
  3. **결과** — 결과 소절 전부 + 핵심 수치 표 재구성 + 타당성 위협(threats)/한계
  4. **시사점** — 논문의 결론, 저자들이 지목한 후속 과제, 그리고 "우리 관점" callout
- "우리 관점"(레포 주제와의 연결, 실무 함의)은 `c-purple` callout 에 **"편집자 주 —
  논문의 주장 아님"** 을 명시해 논문 내용과 분명히 구분한다.

### 문체와 가독성 (필수)

- **필요 이상 어렵게 쓰지 않는다.** 전문용어는 첫 등장에서 한 문장으로 풀어 주고,
  통계·시스템 개념은 비유와 "쉽게 말하면" 식 설명을 곁들인다. 숫자는 감 잡히는
  단위로 환산해 준다 (예: "+157 KB/h ≈ 30일에 110 MB").
- 본문 앞에 **용어 글로서리** (`grid3` + `mini` 카드)를 둔다 — 이 논문을 읽는 데
  필요한 핵심 용어 4~6개를 미리 쉬운 말로 정의.
- **다이어그램을 적극 사용한다** (인라인 SVG, 테마 팔레트 색상): 실험/시스템 구도,
  판정 플로우, 핵심 수치 비교(막대 등), 정성적 패턴 비교 같은 곳. 캡션(`figcap`)에
  출처(논문 Fig./Table 번호) 표기. 기존 노트의 SVG 마크업을 베이스로 복사.
- 섹션 제목은 내용이 드러나는 서술형으로 ("3.4 — 반전: 부하를 낮췄더니 누수가
  더 심해진다"처럼), 딱딱한 명사 나열은 피한다.

### 인용 규칙 (필수)

- **핵심 주장·수치마다** 원문 영어 문장을 verbatim 으로 `blockquote.q` 에 담고,
  `<cite>` 에 §섹션(·문단) 표기 + arXiv HTML 앵커 링크를 단다 — 독자가 원문 해당
  위치로 바로 이동할 수 있어야 한다.
  ```html
  <blockquote class="q">
    <p>"원문 문장 그대로…"</p>
    <cite>— §IV-C, ¶2 · <a href="https://arxiv.org/html/<id>v1#S4.SS3">원문 보기 (§IV-C)</a></cite>
  </blockquote>
  ```
  (arXiv HTML 앵커: §I → `#S1`, §II-A → `#S2.SS1`, §IV-C → `#S4.SS3` 식.)
- 인용문은 번역하지 않고 원문 그대로 둔다 (en/ko 공통 노출). 해설 문단만 EN/KO 이중화.
- 논문의 표를 재구성하면 출처를 표기한다: 예) "Table IV (§IV-C) 재구성".
- `blockquote.q` 스타일은 기준 예시 페이지의 `<style>` 블록에 있다 — 그대로 복사.

### 마무리

- `study/index.html` 에 카드 추가 — tag 는 `t-blue` "Paper note / 논문 정리",
  `post-meta` 에 작성일.
- `python3 tools/check_theme.py` 통과 확인 후 커밋.

## 작성일/갱신일 규약 (created / updated) — 강제됨

카드와 페이지는 **최초 작성일 순서를 유지**한다. 페이지를 나중에 고치면 카드를 맨 위로
올리지 말고, **그 자리에 둔 채 "갱신(updated)" 표시를 단다.** 이 형식을 사이트 전체가 공유한다.

- **created 만**:
  ```html
  <p class="post-meta"><time datetime="2026-06-12">2026-06-12</time></p>
  ```
- **created + updated** (페이지를 고친 날):
  ```html
  <p class="post-meta">
    <time datetime="2026-06-12">2026-06-12</time>
    <span class="sep">·</span>
    <span class="updated-label en">updated</span><span class="updated-label ko">갱신</span>
    <time datetime="2026-06-14">2026-06-14</time>
  </p>
  ```
- 날짜는 **두 곳에 같이** 둔다: 페이지 hero 의 `.post-meta` 와 섹션 `index.html` 의 그 카드.
  둘이 다르면 검사 실패(`post-meta`).
- **기존 페이지를 수정하면 반드시 updated 날짜를 새로 단다** — hero 와 카드 양쪽.
  안 하면 push 가 차단된다(`post-meta-bump`: 원격에 있던 콘텐츠 페이지가 바뀌었는데
  `.post-meta` 가 그대로면 실패). created ≤ updated 여야 한다.

## 새 페이지 체크리스트

1. 위 타입 중 하나의 골격으로 작성 (기존 같은 섹션 페이지를 베이스로 복사 권장)
2. 해당 섹션 `index.html` 에 카드 추가 — 기존 카드(`a.card` + `.tag` + `.post-meta`
   created/updated 날짜) 형식 그대로 (검사기가 index 링크 누락을 잡는다)
3. 페이지 hero 와 카드에 **작성일** 을 같은 값으로 넣는다 (위 규약).
4. `python3 tools/check_theme.py` 통과 확인
5. 로컬 미리보기: `python3 -m http.server 8000`

> 기존 페이지를 **고칠 때**: 내용 수정 + hero/카드의 **updated 날짜 갱신** 을 한 커밋에 같이.

## 검사 규칙 요약 (tools/check_theme.py)

| 규칙 | 내용 |
|---|---|
| doctype/lang/charset/viewport | 공통 골격 필수 요소 |
| theme / theme-path | theme.css 를 올바른 상대경로로 링크하거나(A/B), 정본 팔레트 인라인(C) |
| palette-drift | 정본 토큰(`--bg` 등)을 다른 값으로 재정의 금지 |
| i18n | en/ko span 을 쓰면 i18n 장치(링크 또는 인라인) 필수 |
| i18n-dead-toggle | (비-staticrypt) `assets/i18n.js` 를 로드하면 en/ko span 이 있어야 함 — 토글만 뜨고 콘텐츠가 한국어 전용인 '죽은 토글' 금지 |
| font | body font-family 는 `-apple-system` 시작 스택만 |
| lockscreen | StatiCrypt 잠금 화면은 `#faf9f5`/`#1f1e1b` 템플릿 색 |
| index-link | study/logs/infra/briefings 콘텐츠 페이지는 섹션 index 에 링크 필수 |
| post-meta | 카드에 created `<time>` 필수, created ≤ updated, **페이지 hero 날짜 = 카드 날짜** |
| post-meta-bump | (pre-push) 원격에 있던 콘텐츠 페이지를 고쳤으면 `.post-meta`(갱신일)도 바뀌어야 함 |
| unencrypted | `*.unencrypted.html` 커밋/push 금지 |

규칙을 바꾸고 싶다면: theme.css(값) 또는 check_theme.py(로직)를 고치고,
이 문서도 함께 갱신한다. 셋이 어긋나면 안 된다.
