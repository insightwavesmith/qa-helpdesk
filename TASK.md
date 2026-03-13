# TASK: 콘텐츠 관리 구조 분석 + 오가닉 채널 독립 메뉴 설계 준비

## 목적
bscamp에 "오가닉 채널" 독립 메뉴를 추가하려고 한다.
그 전에 기존 콘텐츠 관리 탭의 전체 구조를 분석해서, 어떤 API/컴포넌트가 연결되어 있는지 파악해야 한다.
또한 학습 파이프라인(curriculum-view, pipeline-sidebar 등)도 포함해서 분석한다.

## 분석 대상

### 1. 콘텐츠 관리 탭 전체 구조
- **진입점**: `src/app/(main)/admin/content/page.tsx`
- **서브탭 4개**: 큐레이션 / 콘텐츠 / 정보공유 / 이메일
- 각 탭별로 사용하는 컴포넌트, 액션, API 엔드포인트를 전부 매핑

### 2. 큐레이션 파이프라인 컴포넌트
- `src/components/curation/` 전체 (9개 파일)
  - curation-card.tsx, curation-tab.tsx, curation-view.tsx
  - curriculum-view.tsx (학습 커리큘럼 뷰)
  - deleted-section.tsx, generate-preview-modal.tsx
  - info-share-tab.tsx (정보공유)
  - pipeline-sidebar.tsx (학습 파이프라인 사이드바)
  - topic-map-view.tsx

### 3. 관련 Server Actions
- `src/actions/curation.ts` — 큐레이션 CRUD
- `src/actions/contents.ts` — 콘텐츠 CRUD
- `src/actions/embed-pipeline.ts` — 임베딩 파이프라인

### 4. 관련 API 엔드포인트
- `/api/admin/content/[id]/newsletter` — 뉴스레터
- `/api/admin/content/summarize` — 요약
- `/api/admin/curation/backfill` — 백필
- `/api/admin/curation/generate` — AI 생성
- `/api/admin/embed` — 임베딩
- `/api/admin/style-learn` — 말투 학습
- `/api/admin/email/*` — 이메일 관련

### 5. 학습 관련 모듈
- `src/lib/style-learner.ts` — 말투 학습
- `src/lib/domain-intelligence.ts` — 도메인 지능
- `src/lib/knowledge.ts` — 지식 베이스

## 산출물

### A. 구조 분석 문서 (`docs/content-hub-analysis.md`)
1. **의존성 맵**: 탭 → 컴포넌트 → 액션 → API → DB 테이블 (트리 구조)
2. **API 엔드포인트 목록**: 경로, HTTP 메서드, 입력/출력, 사용처
3. **DB 테이블 의존성**: 어떤 테이블이 어떤 기능에 연결되는지
4. **학습 파이프라인 흐름**: curriculum-view + pipeline-sidebar + style-learner + domain-intelligence 전체 데이터 흐름

### B. 오가닉 채널 메뉴 영향도 분석 (`docs/organic-impact-analysis.md`)
1. **재사용 가능한 컴포넌트**: 오가닉 채널에서도 쓸 수 있는 기존 컴포넌트 목록
2. **분리 필요 항목**: 정보공유(내부 발행) vs 오가닉(외부 발행) 경계선
3. **공유 API**: 두 메뉴가 공유할 수 있는 API vs 신규 필요 API
4. **사이드바 수정사항**: `src/components/layout/app-sidebar.tsx`에 메뉴 추가 방법

## 규칙
- 코드 수정 없음. **분석만**. 읽기 전용.
- 산출물은 마크다운으로 `docs/` 폴더에 저장
- 모든 파일 경로는 프로젝트 루트 기준 상대경로로 표기
