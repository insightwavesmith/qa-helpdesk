# Curation v2 Phase 0 + Phase 1 Research

## 수정 대상 파일 목록

### Phase 0 (백필 스크립트)
| 파일 | 역할 | 변경 |
|------|------|------|
| `src/actions/curation.ts` | 큐레이션 서버 액션 | 백필 함수 추가 |
| `src/lib/gemini.ts` | AI 텍스트 생성 | 참조만 (generateFlashText) |

### Phase 1 (UI 변경)
| 파일 | 역할 | 변경 |
|------|------|------|
| `src/components/curation/pipeline-sidebar.tsx` (105줄) | 소스 사이드바 | 섹션 분리 (커리큘럼/큐레이션/통계) |
| `src/components/curation/curriculum-view.tsx` | **신규** | 시퀀스 뷰 컴포넌트 |
| `src/components/curation/curation-tab.tsx` (250줄) | 메인 큐레이션 탭 | externalSourceFilter 전달 구조 유지 |
| `src/app/(main)/admin/content/page.tsx` (415줄) | 콘텐츠 관리 페이지 | 듀얼모드 조건부 렌더링 |
| `src/actions/curation.ts` (308줄) | 큐레이션 서버 액션 | getCurriculumContents 추가 |

## 현재 동작 요약

### 큐레이션 페이지 흐름
1. `admin/content/page.tsx` 에서 탭 4개 렌더 (큐레이션/콘텐츠/정보공유/이메일)
2. 큐레이션 탭: `PipelineSidebar` + `CurationTab` 좌우 배치
3. 사이드바에서 소스 클릭 → `sidebarSource` 상태 변경 → CurationTab에 `externalSourceFilter` 전달
4. CurationTab: `getCurationContents(source)` 호출 → 날짜 그룹 → CurationCard 렌더

### 사이드바 현재 구조
- "전체" 버튼 + source_type별 카드 (getPipelineStats로 건수 표시)
- 커리큘럼/큐레이션 구분 없이 flat 리스트

### AI 함수
- `generateFlashText(prompt)`: Gemini 2.0 Flash, 429 자동 재시도
- temperature 0.1, maxTokens 1024 기본값

## 의존성 그래프
```
page.tsx
  ├── PipelineSidebar → getPipelineStats()
  ├── CurationTab → getCurationContents()
  │     └── CurationCard
  ├── InfoShareTab → getInfoShareContents()
  └── GeneratePreviewModal
```

## DB 스키마 (contents 테이블 관련 필드)
- `ai_summary`: text | null
- `importance_score`: integer (기본 0)
- `source_type`: text | null (blueprint, lecture, youtube, crawl, marketing_theory, ...)
- `curation_status`: text ('new', 'selected', 'dismissed', 'published')
- `key_topics`: text[] (배열)
- `created_at`: timestamptz

## 주요 결정 사항
1. Phase 0 백필은 API route로 구현 (브라우저에서 트리거, 진행상황 확인 가능)
2. PipelineSidebar를 직접 수정하여 섹션 분리 (신규 파일 불필요 — 기존 구조 확장)
3. CurriculumView는 신규 파일로 생성
4. page.tsx에서 sidebarSource에 따라 CurriculumView vs CurationTab 조건 분기
