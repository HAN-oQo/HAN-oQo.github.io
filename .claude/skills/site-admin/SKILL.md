---
name: site-admin
description: Start the local site admin page (tools/admin_server.py) where the user hides/shows posts in the section listings while reading, then applies (check → commit → push). Use when the user says 관리자 띄워줘 / 관리자 페이지 / 글 숨기기 / site admin.
---

# site-admin

1. `python3 tools/admin_server.py --port 8000` 을 백그라운드로 띄운다(포트가 차 있으면 8001 등). 127.0.0.1 전용.
2. 사용자에게 `http://localhost:<port>/admin/` 을 알려 주고 macOS면 `open` 으로 연다.
3. 동작 요약을 한두 줄로 알려 준다:
   - 체크 = 섹션 목록에서 숨김(`<a class="card" href="…" hidden>`). 글 파일과 URL은 그대로라 링크로는 계속 열린다.
   - **적용** 버튼 = `tools/check_theme.py` 통과 시 바뀐 `<section>/index.html` 만 `[admin]` 커밋 후 push.
4. 사용자가 끝났다고 하면 서버를 종료한다.

규칙
- 숨김은 목록에서만 빼는 것이다. 글을 지우거나 잠그는 것은 이 도구가 하지 않는다(요청 시 별도 작업).
- 시리즈 대표 카드 아래의 `p.series` 링크 줄은 숨긴 편으로 가는 길이므로 지우지 않는다.
- briefings/ 목록은 대상이 아니다. 최근 30일만 보이고 나머지는 페이지 JS가 "지난 브리핑"으로 자동으로 접는다.
