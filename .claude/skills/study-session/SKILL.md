---
name: study-session
description: Run a tutoring session for the curriculum/ section — start the local study server, show progress, grade saved written answers, generate the next check quiz from diagnostic results, and quiz one question at a time. Use when the user says 공부 띄워줘 / 공부 시작 / study session / 채점해줘 / M3 확인 퀴즈 만들어줘 / 다음 모듈, or asks to continue the inference-engineering curriculum.
---

# study-session — 커리큘럼 튜터 세션

`curriculum/`은 LLM 추론 엔진 × 실시간 음성 커리큘럼(M1~M10 + 버퍼)이다. 콘텐츠는
`curriculum/data/*.json`, 학습 엔진은 `curriculum/study.js`, 진행 상태는
`curriculum/progress/`(**gitignore — 절대 커밋하지 않는다**).

## 1. 띄우기

1. `python3 tools/study_server.py --port 8000` 을 **백그라운드**로 실행 (포트 사용 중이면 8001…).
2. 사용자에게 `http://localhost:8000/curriculum/` 을 알려준다 (macOS면 `open` 으로 열어도 됨).
3. `curriculum/progress/state.json` 을 읽어 요약: 모듈별 진행, 오답 문항, 채점 대기 서술형 수,
   "다음 할 일"(진행도 100% 미만인 첫 모듈). 길게 쓰지 말 것 — 표 하나.

## 2. 서술형 채점 (state.json → feedback.json)

- `state.answers[qid].v` 가 있고 `feedback.json` 에 qid 가 없거나 답이 바뀐 서술형(type `text`)을 채점한다.
- 문항·rubric·model·refs 는 `curriculum/data/<모듈>.json` 에서 찾는다.
- 채점: 0(오답)/1(부분)/2(정답). **맞은 부분은 인정하고 빠진 부분만 보완**, 오해의 출처를 짚고,
  다시 읽을 자료(arXiv 절 또는 커밋 고정 코드 경로)를 지목. 맞장구·칭찬 금지.
- 결과를 `curriculum/progress/feedback.json` 에 병합 기록:
  `{"<qid>": {"score": 2, "verdict": "한 줄", "comment": "보완 설명", "ts": "YYYY-MM-DD"}}`
  → 페이지 새로고침 시 반영된다.
- 대화에도 문항별로 짧게 보고한다.

## 3. 확인 퀴즈 생성 (data/<모듈>.json 의 "check")

모듈의 `check` 가 비어 있고 사용자가 그 모듈 진단을 마쳤으면:
- 진단에서 틀리거나 부분 정답인 토픽(`topic`)에 문항을 몰아준다. 통과 토픽은 0~1문항.
- 4~6문항, 객관식(`mcq`)·계산(`num`)·서술형(`text`) 혼합. **계산 문항을 우선** — 숫자를 내게 한다.
- 스키마(기존 m1.json 의 check 와 동일):
  - mcq: `{"id","type":"mcq","topic","prompt","options":[...],"answer":<index>,"explain","pitfall"?,"refs":[...]}`
  - num: `{"id","type":"num","topic","prompt","answer":<number>,"tol":0.05,"unit","explain","refs"}`
  - text: `{"id","type":"text","topic","prompt","rubric":[...],"model","refs"}`
  - refs 항목: `{"kind":"paper|code|doc|blog","label","url","note"?}`
  - id 규칙: `m<N>-c<k>` (진단은 `-d<k>`).
- 계산 문항은 **파이썬으로 답을 검산**한 뒤 넣는다.
- 생성 후 JSON 유효성 확인(`python3 -c "import json;json.load(open(...))"`).

## 4. 대화형 퀴즈 (사용자가 채팅으로 풀고 싶을 때)

- 한 번에 **한 문제만** 내고 답을 기다린다. 채점 규칙은 §2와 같다.
- 웹에서 푼 것과 섞이지 않도록, 채팅으로 푼 결과도 `state.json` 의 `answers` 에 기록할지 물어보지 말고
  기록한다(같은 qid 형식, `ok` 는 정오).

## 4-1. 예측 장부 (state.predictions)

`curriculum/predictions.html` 이 `state.json` 의 `predictions` 배열에 기록한다. 항목:
`{id, created, ctx, change, metric, unit, baseline, predicted, tol, conf, model, reason, status: open|closed,
actual, closed, hit, errCat, lesson}`.
- 세션 시작 시: 열린 예측 수와 오래된(14일+) 열린 예측을 알려준다.
- 토이·랩을 시작할 때: 측정 전에 예측을 쓰도록 유도하고, 사용자가 채팅으로 말하면 대신 기록해도 된다.
  근거가 계산이 아니라 감이면 계산식을 요구한다.
- "분기 리뷰" 요청 시: 닫힌 예측으로 확신도 구간별 적중률·Brier·원인 분포를 계산하고, 가장 자주 틀린
  모델 유형 → 다음 분기 공부 주제 2개 + 1차 자료를 제시한다. 과신이면 과신이라고 말한다.

## 5. 출처 규칙 (예외 없음)

- 모든 기술적 주장에 출처: arXiv ID+절, 공식 문서, **커밋 고정 퍼머링크**(파일·라인·심볼).
- 기준 핀: `curriculum/data/modules.json` 의 `pins` (vLLM v0.34.0 @62d4bc3, SGLang @2544c9a,
  TokenSpeed @96dfdee). 새 경로를 인용하려면 `/tmp` 에 shallow clone 해서 **존재와 라인을 확인**한다.
  핀을 올릴 때는 modules.json 의 pins 와 data 파일의 URL SHA 를 함께 바꾼다.
- 못 찾은 내용은 "출처 미확인 — 추정"이라고 쓴다. 블로그·벤더 글은 `kind:"blog"`(2차)로 표시.

## 6. 공개 레포 주의

이 레포는 GitHub Pages 로 **공개**된다. data/*.json 과 페이지에 사용자의 이직 계획·지원 회사·
개인 진행 상황·답안을 쓰지 않는다. 진행/답안/피드백은 오직 `curriculum/progress/` 에만.
커밋 전 `python3 tools/check_theme.py` 통과 확인. 커밋은 사용자가 요청할 때만.

## 7. 진행 규칙

한국어. 일본어 용어는 원문 병기(`jp` 필드 참고). 사용자는 4년차 추론 엔지니어 — 과소평가 금지,
틀린 이해는 바로 지적, 확신 없으면 확신 없다고 말한다. 분량보다 밀도.
