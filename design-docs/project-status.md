# BS CAMP QA Helpdesk — bkit PDCA 프로젝트 현황

> 최종 업데이트: 2026-02-07 11:47 KST
> 프로젝트: https://qa-helpdesk.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk
> 최신 커밋: `94acd95`

---

## Plan (계획) — 완료

- 요구사항 정의 완료
- 기능 우선순위: P0(필수) → P1(핵심) → P2(확장)
- 사용자 역할 정의: lead / member / student / alumni / admin
- 기술 스택: Next.js 14 + Supabase + Tailwind + shadcn/ui
- 디자인 시스템: Primary #F75D5D, Pretendard, 라이트 모드 only

---

## Design (설계) — 완료

- 디자인 시스템 확립 (v0 SDK 활용)
- DB 스키마: profiles, questions, answers, posts, ad_accounts, ad_account_assignments, daily_ad_insights, benchmarks
- API 설계: /api/protractor, /api/diagnose, /api/admin, /api/cron
- 설계 문서: P1-1~P1-5 개별 문서 작성

---

## Do (구현) — 90% 완료

### P0 (필수 기능) — 전부 완료

| # | 태스크 | 커밋 | 파일수 | 라인 |
|---|--------|------|--------|------|
| P0-1 | 질문상세 에러 + 벤치마크 merge | - | - | - |
| P0-2 | 디자인/UX 전면 점검 (전 페이지) | `ac5d6eb` | 13 | - |
| P0-3 | 광고계정-수강생 연결 + 접근제어 | `4145617` | 6 | 463 |
| P0-4 | 진단 엔진 TS 포팅 | `965e2c2` | 6 | 616 |
| P0-5 | 관리자 API 수강생 CRUD | `a5756ff` | 4 | 682 |

### P1 (핵심 기능) — 4/5 완료

| # | 태스크 | 커밋 | 파일수 | 라인 | 상태 |
|---|--------|------|--------|------|------|
| P1-1 | 실데이터 연동 (aggregate.ts 등) | `7029ba6` | 9 | 1,069 | 완료 |
| P1-2 | 진단 결과 UI (DiagnosticPanel) | `7029ba6` | (포함) | (포함) | 완료 |
| P1-3 | 벡터DB 재임베딩 (439→전체) | - | - | - | **미착수** |
| P1-4 | TipTap WYSIWYG 이메일 에디터 | `262c64d` | 5 | 1,377 | 완료 |
| P1-5 | 온보딩 → 샘플 대시보드 + 접근 제어 | `94acd95` | 5 | 760 | 완료 |

### QA/수정

| 태스크 | 커밋 | 파일수 | 내용 |
|--------|------|--------|------|
| UI/UX QA 전면 수정 | `00776f8` | 11 | 더미 데이터 제거, 실데이터 연결, Empty State, 색상 교정 #F75D5D |

---

## Check (검수) — 1차 완료

### 수행한 검수
- 전체 페이지 브라우저 스크린샷 (12페이지)
- Critical 3건 발견 → 즉시 수정 (더미 데이터, 빈값, 데이터 혼재)
- Major 3건 발견 → 즉시 수정 (통계 0값, 설정 프로필, 날짜 필터)
- 색상 교정 (#E85A2A → #F75D5D, 11곳)
- 코드 리뷰 (에이전트팀 자체 수행)

### 미수행 검수
- [ ] 수강생 계정으로 로그인해서 StudentHome 확인
- [ ] member 계정으로 샘플 대시보드 확인
- [ ] 모바일 반응형 테스트
- [ ] 총가치각도기 실데이터 숫자가 원본(dashboard_api.py)과 일치하는지

---

## Act (개선) — 진행 중

### 적용된 개선
- 대시보드 더미 데이터 전부 제거 → 실데이터 + Empty State
- 통계 API 수정 → 실제 카운트 표시
- 설정 프로필 자동 채우기
- 총가치각도기 접근 제어 강화 (role + 광고계정)
- 샘플 대시보드 추가 (비수강생/미연결 수강생용)

### 다음 사이클 개선 예정
- v0 SDK 활용한 디자인 품질 향상
- 에이전트팀(방식 1) 전면 적용

---

## 남은 작업 체크리스트

### P1 (남은 것)
- [ ] **P1-3: 벡터DB 재임베딩**
  - 현재 439청크 → "계정" 등 핵심 키워드 누락
  - references/ 문서 미포함
  - Gemini text-embedding-004 (무료) 사용
  - 전체 스크립트 + references 재임베딩 필요

### P2 (확장 기능)
- [ ] **P2-1: 콘텐츠 파이프라인**
  - TipTap 에디터 완료 (P1-4)
  - content_library 테이블 생성
  - Blueprint 학습 자료 → 뉴스레터 콘텐츠 변환
  - 블로그 크롤링 자동화 (크론, Sonnet)
- [ ] **P2-2: 이메일 AI 자동 작성**
  - 모찌(Opus)가 직접 콘텐츠 작성 (Gemini API 아님)
  - 콘텐츠 캘린더: 월(Blueprint), 수(트렌드), 금(웨비나)
- [ ] **P2-3: 수강생 대시보드 고도화**
  - StudentHome에 개인화 콘텐츠
  - 내 광고 성과 트렌드 미니차트
  - 추천 Q&A, 추천 학습 자료
- [ ] **P2-4: 믹스패널 연동**
  - 총가치각도기에 믹스패널 데이터 통합
  - 웹사이트 행동 데이터 + 광고 데이터 크로스 분석
- [ ] **P2-5: 알림 시스템**
  - 설정 페이지 알림 기능 활성화
  - 질문 답변 알림 (이메일/인앱)
  - 벤치마크 이상치 알림

### 마케팅 (별도 트랙)
- [x] Blueprint 학습 자료 7개 작성
- [x] 블로그 크롤링 2개 (Flighted, Anchour)
- [x] Blueprint 코스 카탈로그 50개 수집
- [ ] Blueprint 나머지 카테고리 크롤링 (3개)
- [ ] Blueprint 개별 코스 상세 크롤링
- [ ] 블로그 크롤링 자동화 (크론)
- [ ] 뉴스레터 1호 작성

---

## 기술 현황

### 커밋 히스토리
```
94acd95 feat: 총가치각도기 샘플 대시보드 + 접근 제어
00776f8 fix: UI/UX QA 전면 수정
00a2e44 fix: UI/UX QA 전면 수정
262c64d feat: P1-4 TipTap WYSIWYG 이메일 에디터
7029ba6 feat: P1-1 실데이터 연동 + P1-2 진단 UI
a5756ff feat: admin CRUD - member detail + account management
965e2c2 feat: 진단 엔진 TS 포팅
4145617 feat: 광고계정-수강생 연결 + 접근제어
ac5d6eb feat: 디자인/UX 전면 점검
```

### DB 현황
- daily_ad_insights: 7,366 rows
- benchmarks: 3,026 rows
- ad_accounts: 30
- profiles: 3 (Smith Kim, 테스트 수강생, 김성현)

### 환경
- Vercel 배포 (자동)
- Supabase: symvlrsmkjlztoopbnht
- 에이전트팀: Claude Code (Agent Teams 모드, 인터랙티브 only)
- 크론 7개: Sonnet 4 모델
