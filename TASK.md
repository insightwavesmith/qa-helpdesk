# TASK: bs-camp-structure.html 콘텐츠 파이프라인 탭 업데이트

> 2026-02-12 | 기획서 v2.1 기반 HTML 구현. 지식 기반 파이프라인(LAYER 0) 추가 + 기존 섹션 업데이트.

## 목표
`bs-camp-structure.html`의 콘텐츠 파이프라인 탭(`tab-content`)에 상위 지식 기반 섹션을 추가하고, 기존 섹션의 Phase 상태/담당 구분/구현 현황을 최신화한다.

**성공 기준:**
1. LAYER 0 지식 기반 섹션이 "전체 흐름" 위에 표시
2. Phase 상태 3곳 업데이트 (B-3→B-4)
3. 담당 구분 2열→3열 (모찌/앱/크론)
4. 구현 현황 테이블에 KB 7개 항목 추가
5. 모바일에서 깨지지 않음 (768px 이하 1열)

## 레퍼런스
- 기획서: `/Users/smith/.openclaw/workspace/projects/active/content-pipeline-update.md` (v2.1)
- 현재 HTML: `/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/Claude/smith-brain/projects/active/_archive-bscamp/bs-camp-structure.html`
- 리뷰: `/Users/smith/.openclaw/workspace/projects/active/content-pipeline-review.md`

## 제약
- **단일 HTML 파일** — 프레임워크 없음, 인라인 CSS + vanilla JS
- 기존 탭 시스템(`showTab()`) 변경 금지
- 기존 CSS 클래스 재사용: `.status-done`, `.status-todo`, `.status-partial`, `.status-phase`
- 새 CSS는 `<style>` 블록에 클래스로 추가 (인라인 grid 지양 — 미디어쿼리 안 먹음)
- `<details>` 접기/펼치기로 모바일 부담 해소
- 라이트 모드 유지

## 태스크

### T1. LAYER 0 지식 기반 섹션 추가 → frontend-dev
- 파일: `bs-camp-structure.html` (L935 `tab-content` 시작 직후, "레퍼런스" 섹션 위에 삽입)
- 의존: 없음
- 완료 기준:
  - [ ] "지식 기반 파이프라인 (LAYER 0a)" 제목 + 설명
  - [ ] 6+1개 소스 카드 (기획서 §3-1 테이블 기반)
    - 각 카드: 아이콘 + 소스명 + 포맷 + 자동화 수준 + 우선순위 뱃지(Tier 1~4 색상)
    - Tier 1=#16a34a(녹색), Tier 2=#2563EB(파랑), Tier 3=#9333EA(보라), Tier 4=#6B7280(회색)
  - [ ] 임베딩 파이프라인 플로우차트 (기획서 §3-2 다이어그램 — 로컬 bge-m3 + Supabase Gemini 2줄기)
  - [ ] 우선순위 검색 다이어그램 (기획서 §3-3 — Tier 1~4 재정렬 시각화)
  - [ ] `<details>` 태그로 감싸기 (모바일에서 접기/펼치기)
  - [ ] CSS 클래스 기반 그리드 (`.kb-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }`)
  - [ ] 모바일 반응형: `@media (max-width: 768px) { .kb-grid { grid-template-columns: 1fr; } }`

### T2. 기존 섹션 Phase 상태 업데이트 → frontend-dev
- 파일: `bs-camp-structure.html` (L955, L981, L1239)
- 의존: 없음 (T1과 병렬 가능)
- 완료 기준:
  - [ ] L955: `Phase B-3 구현 예정` → `Phase B-4 완료 ✅`
  - [ ] L981: "현재(Phase B-2): 직접 작성만 구현됨..." → "URL/AI/파일/직접 4가지 방식. URL·AI 생성 Phase B-4 구현 완료. 파일 업로드 미구현."
  - [ ] L1239: "현재는 직접 작성만 동작" → "URL/AI 생성 구현 완료. 파일 업로드 미구현."

### T3. 담당 구분 3열 확장 → frontend-dev
- 파일: `bs-camp-structure.html` (L1192~L1216 담당 구분 섹션)
- 의존: 없음 (T1과 병렬 가능)
- 완료 기준:
  - [ ] 제목: "담당 구분 (모찌 vs 앱)" → "담당 구분 (모찌 / 앱 / 크론)"
  - [ ] 2열 grid → 3열 grid (CSS 클래스 `.role-grid`)
  - [ ] 크론 카드 추가 (배경색 #FFF7ED 계열, 아이콘 ⏰):
    - 구글 시트 동기화 (매일 자정)
    - 녹음 전사 Whisper (매일 09:00)
    - 메타블로그 크롤링 (주 2~3회)
    - Q&A export (미구현, 예정)
  - [ ] 모찌 카드에 추가: 지식 기반 관리 (curriculum/ 인덱싱), QA AI 답변 KB 활용
  - [ ] 앱 카드에 추가: 새 콘텐츠 생성 모달 (유형 선택)
  - [ ] 모바일: 768px 이하 1열

### T4. 구현 현황 테이블 KB 항목 추가 → frontend-dev
- 파일: `bs-camp-structure.html` (L1222 이후 구현 현황 테이블)
- 의존: 없음 (T1과 병렬 가능)
- 완료 기준:
  - [ ] "LAYER 0 · 지식 기반" 구분 헤더 행 추가 (colspan, 배경색 구분)
  - [ ] 7개 항목 추가 (기획서 §8-D 테이블 그대로):
    1. 강의자료 벡터 임베딩 (bge-m3) — 모찌 — 완료 — `.status-done`
    2. 녹음 전사 크론 (Whisper) — 크론 — 완료 — `.status-done`
    3. 메타블로그 크롤링 → Supabase — 크론 — 완료 — `.status-done`
    4. Supabase Q&A → md export — 크론 — 미구현 — `.status-todo`
    5. 카톡 → md 파싱 — 모찌 — 반자동 — `.status-partial`
    6. QA AI 답변 KB 통합 — 모찌+앱 — 부분완료 — `.status-partial`
    7. 통합 검색 레이어 — 모찌 — 미구현 — `.status-todo`

### T5. "전체 흐름" 상단 배너 추가 → frontend-dev
- 파일: `bs-camp-structure.html` (레퍼런스 섹션 아래, 전체 흐름 `<h2>` 위)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 배너: "이 파이프라인은 LAYER 0 지식 기반 위에서 작동합니다 ↑" (기획서 §8-B)
  - [ ] 스타일: 배경 #F0FDF4, 테두리 #22C55E, 글씨 #166534, 폰트 13px

### T6. 코드 리뷰 → code-reviewer
- 파일: T1~T5 전체
- 의존: T1~T5 완료 후
- 완료 기준:
  - [ ] HTML 유효성 (태그 닫힘, 속성 인용)
  - [ ] CSS 클래스 명명 일관성
  - [ ] 모바일 반응형 확인 (768px 이하)
  - [ ] 기획서 v2.1 §8과 구현 대조 (빠진 항목 없는지)
  - [ ] 기존 섹션 깨지지 않았는지

## 의존성 맵
```
T1 (KB 섹션) ──→ T5 (배너) ─┐
T2 (Phase 상태) ─────────────┤
T3 (담당 3열) ───────────────┼──→ T6 (코드 리뷰)
T4 (구현 현황) ──────────────┘
```
T1~T4 병렬 가능. T5는 T1 완료 후. T6은 전체 완료 후.

## 검증 (셀프 체크)
☐ HTML 단독으로 브라우저에서 열림 (`file://`)
☐ 콘텐츠 파이프라인 탭 정상 표시
☐ 다른 탭 (프로젝트 개요, 개발 Phase) 깨지지 않음
☐ LAYER 0 섹션 `<details>` 접기/펼치기 동작
☐ 768px 이하에서 1열 레이아웃
☐ 기획서 §8의 변경 명세 전부 반영
