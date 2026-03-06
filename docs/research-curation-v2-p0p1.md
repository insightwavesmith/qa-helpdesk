# Research: 큐레이션 v2 Phase 0 + Phase 1

## 1. 수정 대상 파일 목록

### 기존 파일 (수정)
| 파일 | 줄수 | 역할 | 변경 내용 |
|------|------|------|-----------|
| `src/components/curation/pipeline-sidebar.tsx` | 105 | 소스 사이드바 | 섹션 분리 (커리큘럼/큐레이션) + 통계 섹션 |
| `src/app/(main)/admin/content/page.tsx` | 415 | 콘텐츠 관리 페이지 | 듀얼모드 분기 |
| `src/actions/curation.ts` | 308 | 큐레이션 서버 액션 | 커리큘럼 쿼리 + 백필 액션 추가 |

### 신규 파일 (생성)
| 파일 | 역할 |
|------|------|
| `src/components/curation/curriculum-view.tsx` | 커리큘럼 시퀀스 뷰 |
| `src/app/api/admin/curation/backfill/route.ts` | 백필 API |

## 2. 현재 동작 요약

### 큐레이션 탭 플로우
```
content/page.tsx (탭: curation)
  -> PipelineSidebar (좌측, 소스별 카드 목록, getPipelineStats)
  -> CurationTab (우측, getCurationContents -> 날짜 그룹 -> CurationCard)
```

- 사이드바 클릭 -> sidebarSource 상태 -> CurationTab에 externalSourceFilter 전달
- 모든 소스가 동일한 CurationTab(리스트 뷰)으로 렌더링

### DB 컬럼 (contents)
- ai_summary (text|null), importance_score (number|null), source_type, curation_status, key_topics, created_at, title

### Gemini API
- generateFlashText(prompt, options?): gemini-2.0-flash, 429시 2초 재시도, 실패시 빈 문자열

## 3. 의존성 그래프
```
Phase 0: backfill/route.ts -> curation.ts -> gemini.ts + supabase
Phase 1: content/page.tsx -> pipeline-sidebar.tsx(수정) + curriculum-view.tsx(신규) + curation-tab.tsx(유지)
         curriculum-view.tsx -> curation.ts(getCurriculumContents)
```

## 4. 위험 요소
- curation.ts에서 `(supabase as any)` 패턴 사용 중 -> 동일 유지
- generateFlashText 실패시 빈 문자열 -> 백필에서 빈 응답 체크 필요
- DB에 sequence_order 컬럼 없음 -> created_at 정렬 사용
- CHANGELOG-MOZZI.md: contents.ts archived 필터 충돌 없음
