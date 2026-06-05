# inference-study

추론 게이트웨이 / PD(prefill-decode) 분리 아키텍처 학습 노트. 정적 HTML 문서 모음.

## 문서

- [`index.html`](index.html) — 랜딩 페이지 (아래 문서들로 이동)
- [`heimdall-vs-dynamo.html`](heimdall-vs-dynamo.html) — Heimdall vs NVIDIA Dynamo 비교 (token-in→token-out 흐름, prefill↔decode KV 전송 애니 도식, 단계 상세·용어, 차이 요약, 추론 관점 장단점·속도 비교)
- [`vllm_pd_disagg_flow.html`](vllm_pd_disagg_flow.html) — vLLM v0.22.0 PD Disaggregation (NixlConnector) 코드 흐름

## 로컬에서 보기

브라우저로 `index.html`을 직접 열면 됩니다. (모든 문서가 외부 의존성 없는 단일 HTML)

## GitHub Pages 게시 (추후)

이 repo는 현재 **private**이라 무료 플랜에서는 Pages가 동작하지 않습니다. 게시하려면 둘 중 하나:

1. **유료 플랜(Pro/Team/Enterprise)**으로 private repo 유지 → 아래 설정
2. repo를 **public**으로 전환 → 아래 설정

설정: GitHub repo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
포함된 워크플로(`.github/workflows/pages.yml`)가 `main` push마다 정적 사이트를 배포합니다.

게시 URL: `https://<GitHub사용자명>.github.io/inference-study/`
