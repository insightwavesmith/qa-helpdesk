# BS CAMP QA Helpdesk — bkit PDCA 프로젝트 현황

> 최종 업데이트: 2026-02-22 KST
> 프로젝트: https://qa-helpdesk.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk
> 최신 커밋: `401dc72`

---

## 목차

1. [P0 (필수 기능)](#p0-필수-기능)
2. [P1 (핵심 기능)](#p1-핵심-기능)
3. [RAG Layer 0 (P0 기초 파이프라인)](#rag-layer-0-p0-기초-파이프라인)
4. [RAG P1 (Embed Pipeline + Hybrid Search)](#rag-p1-embed-pipeline--hybrid-search)
5. [RAG P2 (Reranking, Query Expansion, Image Embedding, Monitoring)](#rag-p2-reranking-query-expansion-image-embedding-monitoring)
6. [Phase 3 (회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩)](#phase-3-회원가입-리팩토링--초대코드--미들웨어--온보딩)
7. [Phase 3b (회원 관리 전체 정비)](#phase-3b-회원-관리-전체-정비)
8. [QA 지능화 (RAG Layer 3)](#qa-지능화-rag-layer-3)
9. [콘텐츠 큐레이션 대시보드](#콘텐츠-큐레이션-대시보드)
10. [콘텐츠 파이프라인 v2 (T1~T8)](#콘텐츠-파이프라인-v2-t1t8)
11. [순환학습루프 / Gold Standard](#순환학습루프--gold-standard-미착수)
12. [이메일/뉴스레터 자동화](#이메일뉴스레터-자동화-미착수)
13. [진단 엔진 총가치각도기](#진단-엔진-총가치각도기-미착수)
14. [Notion 피드백반 동기화](#notion-피드백반-동기화-미착수)

---

## P0 (필수 기능)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항: 질문상세 에러 수정, 디자인/UX 전면 점검, 광고계정-수강생 연결 + 접근제어, 진단 엔진 TS 포팅, 관리자 API 수강생 CRUD
- TASK.md: 없음 (초기 개발 단계)

### Design
- 설계문서: 없음 (인라인 설계)
- 리뷰 보고서: 없음

### Do

| # | 태스크 | 커밋 | 파일수 | 라인 |
|---|--------|------|--------|------|
| P0-1 | 질문상세 에러 + 벤치마크 merge | - | - | - |
| P0-2 | 디자인/UX 전면 점검 (전 페이지) | `ac5d6eb` | 13 | - |
| P0-3 | 광고계정-수강생 연결 + 접근제어 | `4145617` | 6 | +463 |
| P0-4 | 진단 엔진 TS 포팅 | `965e2c2` | 6 | +616 |
| P0-5 | 관리자 API 수강생 CRUD | `a5756ff` | 4 | +682 |
| QA 수정 | UI/UX QA 전면 수정 | `00776f8` | 11 | 더미 데이터 제거, 실데이터 연결 |

- DB 마이그레이션: `00001_initial_schema.sql` ~ `00005_fix_security_definer.sql`

### Check
- QA: 자체 수행 (전체 페이지 12페이지 스크린샷, Critical 3건·Major 3건 발견 및 즉시 수정)
- QA 보고: 없음 (별도 보고서 미작성)

### Act
- 릴리스 보고서: 없음 (P0 단계 별도 릴리스 없음)
- 배포: Vercel 자동 배포 (2026-01 이전)
- 후속 조치: 색상 교정 (#E85A2A → #F75D5D, 11곳), 더미 데이터 전부 제거, 실데이터 + Empty State

---

## P1 (핵심 기능)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항: 실데이터 연동, 진단 결과 UI, TipTap WYSIWYG 이메일 에디터, 온보딩 → 샘플 대시보드 + 접근 제어
- P1-3 벡터DB 재임베딩은 RAG Layer 0으로 진화 후 완전 대체됨
- TASK.md: 없음 (초기 개발 단계)

### Design
- 설계문서: P1-1~P1-5 개별 설계 문서 작성됨
- 리뷰 보고서: 없음

### Do

| # | 태스크 | 커밋 | 파일수 | 라인 | 상태 |
|---|--------|------|--------|------|------|
| P1-1 | 실데이터 연동 (aggregate.ts 등) | `7029ba6` | 9 | +1,069 | ✅ 완료 |
| P1-2 | 진단 결과 UI (DiagnosticPanel) | `7029ba6` | (포함) | (포함) | ✅ 완료 |
| P1-3 | 벡터DB 재임베딩 | - | - | - | ✅ RAG Layer 0으로 대체 완료 |
| P1-4 | TipTap WYSIWYG 이메일 에디터 | `262c64d` | 5 | +1,377 | ✅ 완료 |
| P1-5 | 온보딩 → 샘플 대시보드 + 접근 제어 | `94acd95` | 5 | +760 | ✅ 완료 |

- DB 마이그레이션: `00006_content_type.sql` ~ `00012_email_tracking.sql`

### Check
- QA: 자체 수행, P1-3은 RAG Layer 0 QA로 대체
- QA 보고: 없음

### Act
- 릴리스 보고서: 없음
- 배포: Vercel 자동 배포 (2026-02-07 기준)
- 후속 조치: 총가치각도기 접근 제어 강화 (role + 광고계정), 샘플 대시보드 추가

---

## RAG Layer 0 (P0 기초 파이프라인)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항: knowledge_chunks 통합 마이그레이션, 5-Tier 가중 검색, 기존 439청크 → 전체 재임베딩 (lecture/blueprint/papers/crawl/file)
- 사용 모델: Gemini text-embedding-004 → gemini-embedding-001 (768차원)
- TASK.md: 없음 (P1-3에서 확장)

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `8fbc017` (2026-02 중순)
- 주요 변경: `feat(rag): P0 RAG Layer 0 — knowledge_chunks 통합 마이그레이션 + 5-Tier 가중 검색`
- DB 마이그레이션: `00013_rag_layer0.sql`, `00014_search_knowledge_rpc.sql`, `00015_hnsw_index.sql`

### Check
- QA: 내부 검증 (검색 결과 확인)
- QA 보고: 없음

### Act
- 릴리스 보고서: 없음 (RAG P1/P2와 연속 개발)
- 배포: Vercel 자동 배포
- 후속 조치: HNSW 인덱스 적용, search_vector RPC 추가

---

## RAG P1 (Embed Pipeline + Hybrid Search)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항: Embed Pipeline UI (관리자 페이지에서 임베딩 실행), Hybrid Search (벡터 + BM25 키워드), source_type별 우선순위 설정
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `ef889c5` + 핫픽스 3건 (`0ae1711`, `55d7b86`, `7905ed2`, `b58d450`)
- 주요 변경: `feat(rag): P1 Embed Pipeline + Hybrid Search (T1~T6)`
- DB 마이그레이션: `00016_search_vector.sql`, `00017_hybrid_search.sql`

### Check
- QA: 내부 검증
- QA 보고: 없음

### Act
- 릴리스 보고서: 없음
- 배포: Vercel 자동 배포
- 후속 조치: maxDuration=300 서버 액션 타임아웃 수정, service key auth 추가 (CLI 배치 지원)

---

## RAG P2 (Reranking, Query Expansion, Image Embedding, Monitoring)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - T1 Reranking: 37개 후보 chunk → Gemini Flash 재평가 → top 5 선별
  - T2 Query Expansion: 수강생 질문 자동 2개 확장 쿼리 변환 (줄임말 풀기, 한/영 변환)
  - T4 Image Vision Pipeline: 이미지 → Gemini Vision → 텍스트 → 임베딩
  - T5a+T5b 답변 이미지 첨부 UI + 자동 임베딩 훅
  - T7a+T7b 모니터링 대시보드 (일별 AI 비용, Consumer별, 응답시간, 임베딩 현황)
  - T8 Sonnet 4.6 모델 전환
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `bbf430c` (T0~T4, T7a, T7b, T8), `4b30407` (T5a, T5b), `51df2d9` (핫픽스), `8aa2fc7` (사이드바), `7bb1232` (Sonnet 전환)
- 수정 파일: 8 신규 파일 포함
- QA 응답 시간: ~21초 → ~8초 (Sonnet 기준)
- DB 마이그레이션: `00018_p2_monitoring.sql`, `00019_answers_images.sql`

### Check
- QA: 11 태스크 완료 자체 검증
- QA 보고: 있음 — https://mozzi-reports.vercel.app/reports/release/2026-02-20-rag-p2-release.html

### Act
- 릴리스 보고서: https://mozzi-reports.vercel.app/reports/release/2026-02-20-rag-p2-release.html
- 배포: 2026-02-20
- 후속 조치: knowledge_chunks 현황 2,112개 (lecture 547, blueprint 320, crawl 704, file 140, marketing_theory 122, webinar 98, youtube 132, papers 35, meeting 12)

---

## Phase 3 (회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - T0: DB 마이그레이션 (초대코드 시스템)
  - T1: 회원가입 리팩토링 (사업자정보, 역할 분기)
  - T2: 초대코드 생성/검증 API
  - T3: 미들웨어 접근제어 (x-user-role, x-onboarding-status 쿠키)
  - T4~T6: 온보딩 다단계 플로우 (브랜드명, Meta 광고계정, 믹스패널)
  - 사용자 역할: lead / member / student / alumni / admin
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `6d4f24a` (T0~T6, 2026-02-20), `6f9b47b` (쿠키 버그 2건 수정)
- 주요 변경: `feat: Phase 3 — 회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩 (T0~T6)`
- DB 마이그레이션: `00021_phase3_signup.sql`

### Check
- QA: 자체 브라우저 QA — 초대코드 생성/가입/온보딩/대시보드/Lead 권한 분리 전부 PASS
- 잔여 이슈: 온보딩 쿠키 5분 캐시 미삭제, 로그아웃 시 역할 쿠키 미삭제 → Phase 3b 핫픽스에서 해결
- QA 보고: 없음

### Act
- 릴리스 보고서: 없음
- 배포: 2026-02-20
- 후속 조치: 쿠키 버그 2건 별도 커밋(`6f9b47b`) 수정, Phase 3b로 이어짐

---

## Phase 3b (회원 관리 전체 정비)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - T1: 가입 폼 사업자정보 로직 반전 (lead=사업자필수, student=간소화)
  - T2: lead→/pending 차단, member도 StudentHeader(상단 탭)로 전환, admin만 사이드바
  - T3: alumni 코드 제거 + PROTRACTOR_ROLES에 member 추가
  - T4: 리드 회원 삭제 (auth.users + profiles)
  - T5: 회원관리 UI 보강 (기수/광고계정/믹스패널/시크릿키 마스킹)
  - T6: 수강생 전환 시 기수+광고계정+믹스패널 전부 필수 (빈 칸이면 전환 불가)
  - T7: DB 마이그레이션 (mixpanel_secret_key + annual_revenue 컬럼)
  - T8: 온보딩 Step1에 브랜드명+연매출 추가, Step2에 믹스패널 필드 추가
  - T9: 온보딩 완료 바로가기 버그 수정 (router.push→window.location.href)
  - T10: 수강후기 탭 신규 (게시판, student만 작성, 이미지 첨부, 승인 불필요)
- TASK.md: 있음 (2026-02-20 작성)

### Design
- 설계문서: 없음
- 리뷰 보고서: 있음 — mozzi-reports/review/2026-02-20-phase3b-member-management.html (commit `45ce43d`)

### Do
- 커밋: `ecad07b` (T1~T10 본 개발, 32파일, +1,725/-168), `bd2c9c6` (핫픽스 T1~T8, 8파일, +1,312/-387)
- DB 마이그레이션: `00022_member_management.sql` (mixpanel_secret_key, annual_revenue, reviews 테이블)
- Supabase Storage: `review-images` 버킷 신규 생성

### Check
- QA: 35/35 PASS (2026-02-21, Sonnet 서브에이전트)
- 핫픽스 발생 이슈: 승인 후 접근 불가, 승인 메일 미발송, /pending 로그아웃 불가, 온보딩 스킵 가능, 사업자등록번호 빈 값 가입, 프로필에서 광고계정/믹스패널 수정 불가, 카테고리 "기타" 텍스트 입력 불가, 리드 가입에 기수 표시 (총 8건)
- QA 보고: 없음 (내부 수행)

### Act
- 릴리스 보고서: 없음
- 배포: 2026-02-21
- 후속 조치: 수강후기 임베딩은 Gold Standard 때 같이 진행 예정 (source_type='review')

---

## QA 지능화 (RAG Layer 3)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - 답변 승인 시 질문/답변 분리 임베딩 자동화
  - 2단계 검색: 유사 QA 먼저 → 없으면 전체 RAG
  - 이미지 첨부 질문 → Vision으로 텍스트 변환 후 검색 활용
  - Extended Thinking (AI 내부 추론 과정 적용)
  - Sonnet 모델명 오류 수정 (claude-sonnet-4 → claude-sonnet-4-6)
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `951d1bd` (주 개발, 6 태스크), `7bb1232` (모델 전환), `8aa2fc7` (사이드바 메뉴), `51df2d9` (stats API 핫픽스)
- 변경 파일: 7개, ~220 추가 LOC
- DB 마이그레이션: `00020_qa_intelligence.sql`

### Check
- QA: 6 태스크 완료 자체 검증
- QA 보고: 있음 — https://mozzi-reports.vercel.app/reports/release/2026-02-20-qa-intelligence-release.html

### Act
- 릴리스 보고서: https://mozzi-reports.vercel.app/reports/release/2026-02-20-qa-intelligence-release.html
- 배포: 2026-02-20
- 후속 조치: 승인된 QA 축적될수록 답변 품질/속도 향상 (피드백 루프 시작)

---

## 콘텐츠 큐레이션 대시보드

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - T0: DB 마이그레이션 (ai_summary, importance_score 1~5, key_topics, curation_status)
  - T1: Content 타입 확장 + curation.ts 서버 액션 신규
  - T2: 큐레이션 탭 UI (CurationCard, 일별 그룹핑, 중요도 별점, 3종 필터)
  - T3: 정보공유 생성 API (Sonnet 4.6 직접 호출, 한국어 교육 콘텐츠 자동 작성)
  - T4: GeneratePreviewModal (미리보기, 수정, 게시 + 자동 임베딩 연결)
  - T5: embed-pipeline 확장 (info_share source_type, priority 2)
  - T6: 정보공유 탭 (curation_status='published'만 표시)
  - T7: 크롤러 + YouTube 수집기에 Gemini Flash 분석 통합
  - T8: 소급 분석 스크립트 (기존 64건 전부 분석)
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: `0a659e7` (T0~T8, 11파일, +1,450), `9dd3534` (middleware→proxy.ts, 2파일), `46f3c5a` (publishInfoShare 버그 수정, 1파일)
- DB 마이그레이션: `00023_content_curation.sql`
- 소급 분석: backfill_curation_analysis.mjs 실행 64건 성공 / 0건 실패

### Check
- QA: 25/25 PASS (2026-02-21)

  | 카테고리 | 결과 |
  |----------|------|
  | 큐레이션 탭 UI | 8/8 PASS |
  | 정보공유 생성 플로우 | 7/7 PASS |
  | 게시 후 상태 | 3/3 PASS (버그 1건 수정 후) |
  | 기각(dismiss) 기능 | 2/2 PASS |
  | 에지 케이스 | 3/3 PASS |
  | 기존 기능 회귀 | 2/2 PASS |

- QA 보고: 있음 — https://mozzi-reports.vercel.app/reports/release/2026-02-21-content-curation-release.html

### Act
- 릴리스 보고서: https://mozzi-reports.vercel.app/reports/release/2026-02-21-content-curation-release.html
- 배포: 2026-02-21
- 후속 조치:
  - 신규 수집분 "분석 실패" 표시 — Gemini 분석 타이밍 이슈 (경미, 미수정)
  - Next.js 16 Edge Runtime 호환성 → middleware.ts→proxy.ts 전환 (infra)
  - 수집~배포 5분 워크플로우 완성

---

## 콘텐츠 파이프라인 v2 (T1~T8)

> 상태: Plan ✅ | Design ✅ | Do ✅ | Check ✅ | Act ✅

### Plan
- 요구사항:
  - T1: YouTube 10분 이하 영상 DB 삭제
  - T2: YouTube 크론 10분 이상 필터 (duration ≤ 600초 스킵)
  - T3: 큐레이션 카테고리 전면 재구성 (하드코딩 제거, 9개 source_type 필터 지원)
  - T4: 블루프린트 EP별 분리 + 임베딩 → ✅ 완료 (12건→73건, chunks 320→3,636)
  - T5: 큐레이션 요약 확장 (토글형 더보기/접기, ai_summary 전체 열람)
  - T6: 정보공유 생성 시 강의/블루프린트 RAG 비교 섹션 자동 포함
  - T7: 콘텐츠 파이프라인 현황 UI (좌측 사이드 패널, 소스별 카드·수량·청크·NEW 뱃지)
  - T8: 콘텐츠 탭 info_share만 표시 (UI 필터)
- TASK.md: 있음 (`/Users/smith/projects/qa-helpdesk/TASK.md`, 2026-02-22)

### Design
- 설계문서: TASK.md에 코드 레벨 파악 결과 포함
- 리뷰 보고서: 있음 — https://mozzi-reports.vercel.app/reports/review/2026-02-22-content-pipeline-v2.html

### Do
- 커밋: `401dc72` (T1~T3, T5~T8), `180ded7` + `46f3c5a` 선행 핫픽스 포함
- 수정 파일: 8개, +622/-324
- T4: 보류 (Smith님 검토 대기)

  | 파일 | 변경 내용 |
  |------|-----------|
  | src/actions/curation.ts | source_type 9종 처리 확장 |
  | src/actions/contents.ts | info_share 필터 액션 |
  | src/app/(main)/admin/content/page.tsx | 콘텐츠 탭 info_share 전용 |
  | src/app/api/admin/curation/generate/route.ts | RAG 비교 섹션 생성 |
  | src/components/curation/curation-card.tsx | 더보기/접기 토글 |
  | src/components/curation/curation-tab.tsx | 소스 필터 9종 |
  | src/components/curation/pipeline-sidebar.tsx | 파이프라인 현황 사이드 패널 (신규) |
  | scripts/youtube_subtitle_collector.mjs | duration 필터 추가 |

### Check
- QA: 11/11 PASS (2026-02-22)

  | 항목 | 결과 |
  |------|------|
  | T3-1 소스 필터 9개 옵션 존재 | ✅ PASS |
  | T3-2 블루프린트 선택 → blueprint만 표시 | ✅ PASS |
  | T5 더보기/접기 토글 | ✅ PASS |
  | T6 정보공유 생성 RAG 비교 | ✅ PASS |
  | T7-1 파이프라인 패널 존재 | ✅ PASS |
  | T7-2 소스별 수량+청크 표시 | ✅ PASS |
  | T7-3 블로그 NEW 뱃지 | ✅ PASS |
  | T7-4 카드 클릭 → 필터 자동 적용 | ✅ PASS |
  | T8 콘텐츠탭 info_share만 표시 | ✅ PASS |
  | 회귀 #1 답변 검토 기능 | ✅ PASS |
  | 회귀 #2 정보공유 draft 노출 방지 | ✅ PASS |

- QA 보고: 있음 — https://mozzi-reports.vercel.app/reports/release/2026-02-22-content-pipeline-v2.html

### Act
- 릴리스 보고서: https://mozzi-reports.vercel.app/reports/release/2026-02-22-content-pipeline-v2.html
- 배포: 2026-02-22
- 후속 조치:
  - T4 (블루프린트 EP별 분리): ✅ 완료 2026-02-22, 73건 분리 + 3,636 chunks 임베딩
  - YouTube 자막 수집 파이프라인: TranscriptAPI.com 기반, 매일 08:00 크론 (14개 영상, 132 chunks)
  - knowledge_chunks 현황: 1,791개 (YouTube 단편 삭제 후)

---

## 순환학습루프 / Gold Standard (미착수)

> 상태: Plan ⏸ | Design ❌ | Do ❌ | Check ❌ | Act ❌

### Plan
- 요구사항:
  - Gold Standard: 수강생이 QA에서 승인한 답변을 gold_answers 테이블에 누적
  - 유사 질문 자동 연결 (semantic similarity, threshold 0.85)
  - 순환학습: 승인 답변이 쌓일수록 RAG Layer 3 품질 자동 향상
  - 수강후기(source_type='review') 임베딩 포함
- TASK.md: 없음
- 착수 조건: 서비스 운영하면서 수강생 질문 100개+ 누적 후

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: 미착수
- 수정 파일: 없음

### Check
- QA: 미착수

### Act
- 릴리스 보고서: 없음
- 배포: 미정
- 후속 조치: 서비스 운영 데이터 확보 후 착수 예정

---

## 이메일/뉴스레터 자동화 (미착수)

> 상태: Plan ⏸ | Design ❌ | Do ❌ | Check ❌ | Act ❌

### Plan
- 요구사항:
  - P2-2: AI 자동 이메일 작성 (Opus가 직접 콘텐츠 작성)
  - 콘텐츠 캘린더: 월(Blueprint), 수(트렌드), 금(웨비나)
  - TipTap 에디터 완료 (P1-4), Unlayer 프로젝트 ID: 284274
  - 뉴스레터 1호 작성 (마케팅 미수행)
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음 (뉴스레터 비주얼 수정 보고서만 있음: https://mozzi-reports.vercel.app/reports/release/2026-02-18-newsletter-visual-fix.html)

### Do
- 커밋: 미착수 (P1-4 TipTap 에디터는 완료)
- 수정 파일: 없음

### Check
- QA: 미착수

### Act
- 릴리스 보고서: 없음
- 배포: 미정
- 후속 조치: 콘텐츠 파이프라인 v2 안정화 후 착수 예정

---

## 진단 엔진 총가치각도기 (미착수)

> 상태: Plan ⏸ | Design ❌ | Do ❌ | Check ❌ | Act ❌

### Plan
- 요구사항:
  - 기존: 총가치각도기 TS 포팅 완료 (P0-4, `965e2c2`)
  - 신규 기획: 진단 엔진 별도 대규모 기능 확장 중
  - P2-4: 믹스패널 데이터 통합 (웹사이트 행동 데이터 + 광고 데이터 크로스 분석)
  - 수강생 대시보드 고도화 (개인화 콘텐츠, 내 광고 성과 트렌드 미니차트, 추천 Q&A)
- TASK.md: 없음 (기획 중)

### Design
- 설계문서: 없음 (Smith님 별도 기획 검토 중)
- 리뷰 보고서: 없음

### Do
- 커밋: 미착수
- 수정 파일: 없음

### Check
- QA: 미착수

### Act
- 릴리스 보고서: 없음
- 배포: 미정
- 후속 조치: Smith님 기획 확정 후 TASK.md 작성

---

## Notion 피드백반 동기화 — ✅ P0 완료 (2026-02-22)

> 상태: Plan ⏸ | Design ❌ | Do ❌ | Check ❌ | Act ❌

### Plan
- 요구사항:
  - Notion 피드백반 페이지 (`2ea4edaa73df802fb5b2f04bf033304e`) ↔ QA Helpdesk DB 동기화
  - 멤버 DB (`e8b2d7e8`): 이름/브랜드/조/account_id (7명)
  - 몰입노트 DB (`663d5497`): 이름/상태/Work Day/발표
  - to-do DB 연동: 수강생별 개선 과제 + 이벤트/리뷰 과제
  - 사용 API: Notion Integration (ntn_***REDACTED***)
- TASK.md: 없음

### Design
- 설계문서: 없음
- 리뷰 보고서: 없음

### Do
- 커밋: 미착수
- 수정 파일: 없음

### Check
- QA: 미착수

### Act
- 릴리스 보고서: 없음
- 배포: 미정
- 후속 조치: 피드백반 운영 안정화 후 착수 예정

---

## 기술 현황 요약

### 커밋 히스토리 (최근 30개)
```
401dc72 feat: 콘텐츠 파이프라인 v2 (T2~T8) — 소스 확장, RAG 비교, 사이드바, 카드 토글
180ded7 fix: 큐레이션 draft 구조 변경 + Gemini 분석 실패 수정
46f3c5a fix: publishInfoShare 원본 curation_status 업데이트 수정
9dd3534 fix: middleware.ts → proxy.ts (Next.js 16 Edge runtime 호환성)
0a659e7 feat: 콘텐츠 큐레이션 대시보드 T0~T8 구현
bd2c9c6 fix: Phase 3b 핫픽스 — 승인접근/메일/로그아웃/온보딩/사업자검증/프로필/카테고리/기수
ecad07b feat: Phase 3b 회원 관리 전체 정비 (T1~T10)
6f9b47b fix: 미들웨어 캐시 쿠키 버그 2건 수정 (온보딩 완료 + 로그아웃)
6d4f24a feat: Phase 3 — 회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩 (T0~T6)
951d1bd feat: QA 지능화 (RAG Layer 3) — 분리 임베딩 + 2단계 검색 + Extended Thinking
7bb1232 feat(rag): QA/chatbot 모델을 Sonnet 4.6으로 변경
8aa2fc7 fix(admin): DashboardSidebar에 "지식 베이스" 메뉴 추가
51df2d9 fix: knowledge stats API — RPC로 group by 처리
4b30407 feat(qa): T5a 답변 이미지 첨부 UI + T5b 자동 임베딩 훅
bbf430c feat(rag): P2 Reranking + Query Expansion + Image Vision + Monitoring (T0~T8)
ef889c5 feat(rag): P1 Embed Pipeline + Hybrid Search (T1~T6)
8fbc017 feat(rag): P0 RAG Layer 0 — knowledge_chunks 통합 마이그레이션 + 5-Tier 가중 검색
94acd95 feat: 총가치각도기 샘플 대시보드 + 접근 제어
```

### DB 현황 (2026-02-22 기준)
- daily_ad_insights: 7,366 rows
- benchmarks: 3,026 rows
- ad_accounts: 30
- profiles: admin 1, student 4+, lead 3+, member 1
- knowledge_chunks: 3,088 (blueprint 1,501 + lecture 547 + crawl 396 + file 140 + notion 128 + marketing_theory 122 + youtube 102 + webinar 98 + papers 35 + meeting 12 + info_share 7)
- contents: notion 135, blueprint 68, crawl 57, file 9, youtube 7, info_share 3, webinar 1
- reviews: 2건 (테스트)

### DB 마이그레이션 전체 (00001~00023)
| 번호 | 파일 | 내용 |
|------|------|------|
| 00001 | initial_schema | 기본 스키마 |
| 00002 | rls_policies | RLS 정책 |
| 00003 | vector_search_function | 벡터 검색 함수 |
| 00004 | content_hub | 콘텐츠 허브 |
| 00005 | fix_security_definer | 보안 수정 |
| 00006 | content_type | 콘텐츠 타입 |
| 00007 | unified_content | 통합 콘텐츠 |
| 00008 | category_cleanup | 카테고리 정리 |
| 00009 | content_sources | 콘텐츠 소스 |
| 00010 | type_unification | 타입 통일 |
| 00011 | drop_category_check | 카테고리 제약 제거 |
| 00012 | email_tracking | 이메일 추적 |
| 00013 | rag_layer0 | RAG 기초 |
| 00014 | search_knowledge_rpc | 검색 RPC |
| 00015 | hnsw_index | HNSW 인덱스 |
| 00016 | search_vector | 벡터 검색 |
| 00017 | hybrid_search | 하이브리드 검색 |
| 00018 | p2_monitoring | P2 모니터링 |
| 00019 | answers_images | 답변 이미지 |
| 00020 | qa_intelligence | QA 지능화 |
| 00021 | phase3_signup | Phase 3 회원가입 |
| 00022 | member_management | 회원 관리 |
| 00023 | content_curation | 콘텐츠 큐레이션 |

### 환경
- Vercel 배포 (자동, QA 환경: https://qa-helpdesk-coral.vercel.app)
- Supabase: symvlrsmkjlztoopbnht (Pro 사용 예정)
- 임베딩 모델: gemini-embedding-001 (768차원)
- 에이전트팀: Claude Code (Agent Teams 모드, tmux, Opus 4.6)
- 크론: Sonnet 4.6 (아침 브리핑, QA, 벤치마크), Gemini (콘텐츠 수집, YouTube 자막), Ollama (로컬)
- TranscriptAPI.com: YouTube 자막 수집 (API key: sk_dz9E62QhUbAPkmxfn_fgA4XTGwGtqHJYAs7fKUfNqv8, 무료 100크레딧)

### 다음 작업 우선순위
1. ~~T4 블루프린트 EP별 분리~~ → 완료 (2026-02-22)
2. 진단 엔진 총가치각도기 기획 확정
3. 순환학습루프 MVP (데이터 누적 후)
4. 이메일/뉴스레터 자동화
5. Notion 피드백반 동기화
