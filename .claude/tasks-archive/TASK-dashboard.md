# TASK.md — 모찌 + 에이전트팀 운영 대시보드

> 2026-02-11 | 모찌와 에이전트팀의 규칙 준수/상태를 실시간 모니터링하는 웹 대시보드

## 목표
단일 페이지 웹 대시보드에서 모찌 + 에이전트팀의 상태와 규칙 준수를 한눈에 확인.
정적 HTML + vanilla JS (외부 의존성 없음). 데이터는 JSON 파일 기반.

## 레퍼런스
- 기획서: `/Users/smith/.openclaw/workspace/projects/active/mozzi-skill-dashboard.md`
- 디자인 참고: https://bs-camp-structure.vercel.app (카드 UI 레이아웃 참고, 색상은 다크 모드 적용)

## 제약
- **qa-helpdesk 프로젝트와 완전 분리** — iCloud 경로: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/`
- **단일 HTML 파일** (index.html) — 프레임워크 없음
- **데이터 소스**: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/dashboard-data.json` (크론이 주기적 갱신)
- **iCloud 동기화** — `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/`에 생성. Mac Studio 크론이 JSON 갱신 → iCloud가 노트북/아이폰에 자동 동기화. 브라우저에서 `file://`로 확인
- **다크 모드 기본** — 이 프로젝트는 모니터링 용도이므로 글로벌 라이트 모드 규칙의 예외

## PDCA 적용
이 프로젝트도 PDCA 워크플로우를 따른다.

```
docs/
├── 01-plan/features/mozzi-dashboard.plan.md
├── 02-design/features/mozzi-dashboard.design.md
├── 03-analysis/mozzi-dashboard.analysis.md
└── 04-report/features/mozzi-dashboard.report.md
```

**경로**: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/docs/` (mozzi-dashboard 프로젝트 내)

### 실행 순서 (강제)
1. Plan 문서 작성 → `docs/01-plan/features/mozzi-dashboard.plan.md`
2. Design 문서 작성 → `docs/02-design/features/mozzi-dashboard.design.md`
3. 코딩 시작 (T1~T7)
4. Check → Gap 분석 `docs/03-analysis/mozzi-dashboard.analysis.md`
5. Match Rate 90%+ 확인 → Report `docs/04-report/features/mozzi-dashboard.report.md`

---

## 태스크

### T1. 대시보드 레이아웃 + 모찌 상태 카드 → frontend-dev
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/index.html` (신규)
- 의존: Plan + Design 문서 완료 후
- 완료 기준:
  - [ ] 상단 헤더: "모찌 + 에이전트팀 운영 대시보드"
  - [ ] 다크 모드 컬러 스킴 (배경 #0f172a, 카드 #1e293b, 텍스트 #e2e8f0)
  - [ ] 모찌 상태 카드:
    - 모델 (Opus 4.6)
    - 컨텍스트 사용량 (XX% 게이지 바)
    - 세션 가동 시간
    - 마지막 압축 시점
  - [ ] 반응형 (모바일 OK)
  - [ ] Primary 컬러 유지: #F75D5D (강조), #E54949 (hover)

### T2. 규칙 준수 체크 패널 → frontend-dev
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/index.html`
- 의존: T1 완료 후 (T2~T5 병렬 가능)
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
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/index.html`
- 의존: T1 완료 후 (T2~T5 병렬 가능)
- 완료 기준:
  - [ ] 팀 리더 상태: alive/dead + 가동 시간
  - [ ] 팀원별 상태 (4명: frontend-dev, backend-dev, code-reviewer, leader)
  - [ ] 현재 TASK.md 진행률 (완료/전체 태스크 수 + 프로그레스 바)
  - [ ] 최근 커밋 5개 (제목 + 시간)
  - [ ] 빌드 상태 (마지막 성공/실패 + 타임스탬프)
  - [ ] Hooks 위반 감지 (최근 위반 목록 + 횟수 뱃지)

### T4. 오늘 작업 이력 패널 → frontend-dev
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/index.html`
- 의존: T1 완료 후 (T2~T5 병렬 가능)
- 완료 기준:
  - [ ] memory/오늘.md 기반 작업 목록
  - [ ] 시간순 타임라인 형태
  - [ ] 완료/진행중/미완료 구분 (색상 코딩)

### T5. 교훈 패널 → frontend-dev
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/index.html`
- 의존: T1 완료 후 (T2~T5 병렬 가능)
- 완료 기준:
  - [ ] `.learnings/LEARNINGS.md` 최근 10개 항목 표시
  - [ ] `.learnings/ERRORS.md` 최근 에러 5개 표시
  - [ ] 카테고리별 필터 (교훈/에러/기능요청)
  - [ ] 최근 추가된 항목 "NEW" 뱃지

### T6. 데이터 수집 스크립트 → backend-dev
- 파일: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/scripts/dashboard-collect.sh` (신규)
- 의존: 없음 (T1과 병렬 가능)
- 완료 기준:
  - [ ] 쉘 스크립트로 데이터 수집 → JSON 출력
  - [ ] 수집 항목:
    - 모찌 세션 상태 (`openclaw status` 파싱)
    - 에이전트팀 프로세스 상태 (`ps` 명령)
    - 최근 git log (5개)
    - memory/오늘.md 내용
    - `.learnings/LEARNINGS.md` 최근 항목
    - `.learnings/ERRORS.md` 최근 항목
    - 마지막 빌드 결과
    - TASK.md 진행률 (체크박스 완료/전체 파싱)
    - Hooks 위반 로그 (`.claude/hooks-log/` 등)
  - [ ] 출력: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/mozzi/mozzi-dashboard/dashboard-data.json`
  - [ ] 실행: `bash scripts/dashboard-collect.sh`

### T7. 코드 리뷰 → code-reviewer
- 파일: T1~T6 전체
- 의존: T1~T6 완료 후
- 완료 기준:
  - [ ] HTML 유효성
  - [ ] XSS 방지 (JSON 데이터 escape)
  - [ ] 모바일 렌더링 확인
  - [ ] JSON 파싱 에러 핸들링
  - [ ] 다크 모드 가독성 (대비율 4.5:1 이상)

---

## 의존성 맵

```
Plan + Design ──→ T1 (레이아웃)
                   ├──→ T2 (규칙 준수)  ─┐
                   ├──→ T3 (팀 상태)    ─┤
                   ├──→ T4 (작업 이력)  ─┼──→ T7 (코드 리뷰)
                   └──→ T5 (교훈)      ─┘         │
T6 (데이터 수집) ──────────────────────────────────┘
```

T2~T5는 T1 완료 후 **병렬 진행 가능**. T6은 독립적으로 병렬 가능.

---

## 검증 (셀프 체크)
☐ Plan 문서 존재 (`docs/01-plan/features/mozzi-dashboard.plan.md`)
☐ Design 문서 존재 (`docs/02-design/features/mozzi-dashboard.design.md`)
☐ index.html 단독으로 브라우저에서 열림 (`file://` 또는 `npx serve`)
☐ dashboard-data.json 없을 때 에러 안 남 (로딩/빈 상태 표시)
☐ 모바일 뷰포트에서 정상 렌더링
☐ 다크 모드 가독성 (대비율 확인)
☐ dashboard-collect.sh 실행 → JSON 정상 생성
☐ Gap 분석 Match Rate 90% 이상
