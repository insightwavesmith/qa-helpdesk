# TASK.md — 모찌 + 에이전트팀 운영 대시보드

> 2026-02-11 | 모찌와 에이전트팀의 규칙 준수/상태를 실시간 모니터링하는 웹 대시보드

## 목표
단일 페이지 웹 대시보드에서 모찌 + 에이전트팀의 상태와 규칙 준수를 한눈에 확인.
정적 HTML + vanilla JS (외부 의존성 없음). 데이터는 JSON 파일 기반.

## 레퍼런스
- 기획서: `/Users/smith/.openclaw/workspace/projects/active/mozzi-skill-dashboard.md`
- 디자인 참고: https://bs-camp-structure.vercel.app (같은 스타일 — 깔끔한 카드 UI)

## 제약
- **qa-helpdesk 프로젝트와 완전 분리** — 별도 디렉토리 `/Users/smith/projects/mozzi-dashboard/`
- **단일 HTML 파일** (index.html) — 프레임워크 없음
- **데이터 소스**: `/Users/smith/.openclaw/workspace/dashboard-data.json` (크론이 주기적 갱신)
- **Vercel 배포** — 정적 사이트

## 태스크

### T1. 대시보드 레이아웃 + 모찌 상태 카드 → frontend-dev
- 파일: `/Users/smith/projects/mozzi-dashboard/index.html` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] 상단 헤더: "모찌 + 에이전트팀 운영 대시보드"
  - [ ] 모찌 상태 카드:
    - 모델 (Opus 4.6)
    - 컨텍스트 사용량 (XX% 게이지)
    - 세션 가동 시간
    - 마지막 압축 시점
  - [ ] 반응형 (모바일 OK)
  - [ ] 다크 모드 기본

### T2. 규칙 준수 체크 패널 → frontend-dev
- 파일: `/Users/smith/projects/mozzi-dashboard/index.html`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 6개 절대 규칙별 카드 (초록 ✅ / 빨강 ❌)
    1. 코드 변경을 에이전트팀으로 했나?
    2. 슬랙 스레드 안 썼나?
    3. 추측 답변 안 했나?
    4. 프로젝트 체크리스트 먼저 작성했나?
    5. 실수 즉시 기록했나?
    6. TASK.md로 에이전트팀 전달했나?
  - [ ] 최근 위반 이력 (날짜 + 내용)
  - [ ] 위반 없는 연속 일수 카운터

### T3. 에이전트팀 상태 패널 → frontend-dev
- 파일: `/Users/smith/projects/mozzi-dashboard/index.html`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 팀 리더 상태: alive/dead + 가동 시간
  - [ ] 팀원별 상태 (4명)
  - [ ] 현재 TASK.md 요약
  - [ ] 최근 커밋 5개 (제목 + 시간)
  - [ ] 빌드 상태 (마지막 성공/실패)

### T4. 오늘 작업 이력 패널 → frontend-dev
- 파일: `/Users/smith/projects/mozzi-dashboard/index.html`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] memory/오늘.md 기반 작업 목록
  - [ ] 시간순 타임라인 형태
  - [ ] 완료/진행중/미완료 구분

### T5. 데이터 수집 스크립트 → backend-dev
- 파일: `/Users/smith/.openclaw/workspace/scripts/dashboard-collect.sh` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] 쉘 스크립트로 데이터 수집 → JSON 출력
  - [ ] 수집 항목:
    - 모찌 세션 상태 (openclaw status 파싱)
    - 에이전트팀 프로세스 상태 (ps 명령)
    - 최근 git log (5개)
    - memory/오늘.md 내용
    - .learnings/LEARNINGS.md 최근 항목
    - 마지막 빌드 결과
  - [ ] 출력: `/Users/smith/.openclaw/workspace/dashboard-data.json`
  - [ ] 실행: `bash scripts/dashboard-collect.sh`

### T6. 코드 리뷰 → code-reviewer
- 파일: T1~T5 전체
- 의존: T1~T5 완료 후
- 완료 기준:
  - [ ] HTML 유효성
  - [ ] XSS 방지 (JSON 데이터 escape)
  - [ ] 모바일 렌더링 확인
  - [ ] JSON 파싱 에러 핸들링

## 검증 (셀프 체크)
☐ index.html 단독으로 브라우저에서 열림
☐ dashboard-data.json 없을 때 에러 안 남 (로딩/빈 상태 표시)
☐ 모바일 뷰포트에서 정상 렌더링
☐ 다크 모드 가독성
☐ dashboard-collect.sh 실행 → JSON 정상 생성
