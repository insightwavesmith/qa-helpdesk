# TASK: 큐레이션 v2 — Phase 0 + Phase 1

## 타입
개발

## 관련 파일 (반드시 먼저 읽을 것)
- `docs/proposals/curation-v2-spec.md` — 전체 기획서 (듀얼모드, 4 Phase, 컴포넌트 트리)
- `src/components/curation/` — 현재 큐레이션 컴포넌트 5개 (849줄)
- `src/app/(main)/admin/curation/page.tsx` — 현재 큐레이션 페이지
- `src/actions/contents.ts` — 콘텐츠 CRUD 서버 액션
- `src/lib/gemini.ts` — AI 요약 생성 (generateFlash)

## 배경
큐레이션 탭을 듀얼모드(커리큘럼/큐레이션)로 리뉴얼한다.
Phase 0은 데이터 정리, Phase 1은 UI 구조 변경.

## Phase 0: 데이터 백필 (먼저 완료)

### P0-1: ai_summary null 백필
- `contents` 테이블에서 `ai_summary IS NULL` 인 레코드 조회 (약 30건)
- 각 레코드의 `body_md`를 읽어서 `generateFlash()`로 3줄 요약 생성
- `ai_summary` 컬럼 UPDATE
- **주의**: rate limit 고려, 1초 간격으로 호출

### P0-2: importance_score 0 백필
- `contents` 테이블에서 `importance_score = 0` 인 레코드 조회 (약 98건)
- source_type별 처리:
  - `blueprint` 또는 `lecture` → importance_score = 5 (고정, AI 스코어링 안 함)
  - 그 외 (blog, youtube, crawl 등) → AI로 1~5 스코어링
    - 프롬프트: "이 콘텐츠의 자사몰 사업자 교육 관점에서의 중요도를 1~5로 평가. 5=필수, 1=참고"
    - body_md 앞 2000자 + title 제공

### P0 완료 기준
- ai_summary NULL = 0건
- importance_score 0 = 0건
- blueprint/lecture의 importance_score = 전부 5

## Phase 1: 사이드바 + 듀얼모드 + CurriculumView

### P1-1: 사이드바 리팩토링
현재 큐레이션 페이지의 필터를 **좌측 사이드바**로 분리.

```
사이드바 구조:
├── 📚 커리큘럼 소스
│   ├── 블루프린트 (badge: N건)
│   └── 자사몰사관학교 (badge: N건)
├── 🔍 외부 소스
│   ├── 블로그 (badge: N건)
│   ├── YouTube (badge: N건)
│   └── 크롤링 (badge: N건)
└── 📊 통계
    ├── 전체: N건
    ├── AI 요약 완료: N건
    └── 미처리: N건
```

- 새 파일: `src/components/curation/CurationSidebar.tsx`
- source_type별 건수는 서버에서 조회 (contents 테이블 GROUP BY source_type)
- 사이드바 클릭 → 메인 영역 모드 전환:
  - 블루프린트/자사몰사관학교 클릭 → CurriculumView 렌더
  - 블로그/YouTube/크롤링 클릭 → 기존 CurationView 렌더 (필터 적용)

### P1-2: CurriculumView 컴포넌트
블루프린트/자사몰사관학교 선택 시 보여줄 시퀀스 뷰.

```
새 파일: src/components/curation/CurriculumView.tsx

레이아웃:
┌─────────────────────────────────┐
│ 블루프린트 커리큘럼              │
│ 진행률: ████████░░ 80% (24/30)  │
├─────────────────────────────────┤
│ 📗 초급 (10건)                  │
│  1. EP01 — 자사몰이란 무엇인가  │  ← ai_summary 3줄
│  2. EP02 — 네이버쇼핑 vs 자사몰 │
│  ...                            │
│ 📘 중급 (12건)                  │
│  11. EP11 — 메타 광고 기초      │
│  ...                            │
│ 📕 고급 (8건)                   │
│  23. EP23 — ROAS 최적화         │
│  ...                            │
└─────────────────────────────────┘
```

- EP 순서는 contents 테이블의 `title` 또는 `order` 필드로 정렬
  - order 필드가 없으면 created_at 순서 사용
- 각 EP 클릭 → 상세 패널 (ai_summary + body_md 미리보기)
- 레벨 구분: title에서 "초급/중급/고급" 또는 "기초/심화/고급" 키워드 파싱
  - 키워드 없으면 전체를 하나의 시퀀스로 표시
- 진행률 = (ai_summary가 있는 건수 / 전체 건수) × 100

### P1-3: 듀얼모드 스위칭
- `src/app/(main)/admin/curation/page.tsx` 수정
- 상태: `activeSource: string` (사이드바에서 선택한 source_type)
- 조건부 렌더링:
  ```
  activeSource === 'blueprint' || activeSource === 'lecture'
    → <CurriculumView sourceType={activeSource} />
  그 외
    → <CurationView sourceType={activeSource} />  (기존 컴포넌트)
  ```

### P1 완료 기준
- 사이드바에서 소스 클릭 시 모드 자동 전환
- 블루프린트 → CurriculumView 정상 렌더 (시퀀스, 진행률)
- 블로그/YouTube → 기존 CurationView 정상 렌더
- 반응형: 모바일에서 사이드바 → 상단 탭으로 전환
- npm run build 성공

## 완료 후 QA
1. `npm run build` 성공
2. Gap 분석: docs/03-analysis/curation-v2-p0p1.analysis.md 작성
3. Match Rate 90%+ 확인
