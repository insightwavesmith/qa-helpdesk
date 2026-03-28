# 큐레이션 v2 버그수정 Plan

> TASK: `TASK-큐레이션v2-버그수정.md`
> Phase 2 Plan: `docs/01-plan/features/curation-v2-phase2.plan.md`
> Phase 2 Design: `docs/02-design/features/curation-v2-phase2.design.md`

---

## 1. 요구사항

큐레이션 탭의 카드/토픽맵/AI 요약/정보공유 생성에서 발견된 4가지 버그를 수정한다.
DB 데이터 수정 없이 프론트엔드/API 레벨에서 해결한다.

## 2. 현재 상태

### 관련 파일 현황
- `curation-card.tsx` (284줄): Phase 2 T1 카드 v2 구현 완료 상태
- `topic-map-view.tsx` (153줄): Phase 2 T2 토픽맵 뷰 구현 완료 상태
- `curation-view.tsx` (326줄): Phase 2 T2 뷰 래퍼 구현 완료 상태
- `generate/route.ts` (440줄): 프록시/직접 호출 헬퍼 + Opus 생성
- `generate-preview-modal.tsx` (210줄): 생성 모달 (로딩/미리보기/편집)

### 버그 목록
| ID | 요약 | 심각도 | 파일 |
|----|------|--------|------|
| T1 | 카드 태그 + 토픽맵 그룹명에 내부 메타데이터 노출 | 중 | curation-card.tsx, topic-map-view.tsx |
| T2 | AI 요약 불릿에 JSON 배열 문자열 그대로 노출 | 중 | curation-card.tsx |
| T3 | AI 요약 불릿에 마크다운 `**별표**` 그대로 노출 | 저 | curation-card.tsx |
| T4 | 정보공유 생성 60초+ 타임아웃, 진행 상태 미표시 | 고 | generate/route.ts, generate-preview-modal.tsx |

## 3. 범위

### In-scope
- **T1**: `isMetadataKey` 필터를 구조 패턴 기반으로 강화 + 공통 유틸 추출 + 빈 토픽 영역 숨김
- **T2**: `formatSummary`에 JSON 배열 파싱 추가 + JSON 문법 문자 strip 후처리
- **T3**: 인라인 마크다운 렌더러 (볼드/이탤릭만) — React 엘리먼트 기반, 라이브러리 없이
- **T4**: 프록시/직접 호출 타임아웃 조정 + 프론트 경과 시간 표시 + 타임아웃 에러 메시지

### Out-of-scope
- key_topics DB 데이터 정리/재분석
- DB 데이터 직접 수정
- AI 모델 변경 (Opus 유지)
- `max_tokens`, `thinking.budget_tokens` 변경
- `react-markdown` 라이브러리 추가
- `dangerouslySetInnerHTML` 사용

## 4. 성공 기준

1. 카드 태그 뱃지에 `guide_type:`, `section_index:`, `section_title:` 등 내부 메타데이터가 노출되지 않음
2. 토픽맵 그룹명에 내부 메타데이터가 사용되지 않음
3. 유효 토픽이 없는 카드의 태그 영역이 숨겨짐
4. 유효 토픽이 없는 콘텐츠가 토픽맵에서 "미분류"로 분류됨
5. `isMetadataKey` 로직이 한 곳(`topic-utils.ts`)에만 존재
6. JSON 배열 형태 AI 요약이 순수 텍스트 불릿으로 표시됨
7. `[`, `]`, `"`, `{`, `}` 문자가 요약 불릿에 보이지 않음
8. `**텍스트**`가 볼드로, `*텍스트*`가 이탤릭으로 렌더링됨
9. 정보공유 생성 시 경과 시간이 표시됨
10. 최종 타임아웃 시 명확한 에러 메시지 표시
11. `npm run build` 성공

## 5. 구현 순서

```
T1 (메타데이터 필터) → T2 (JSON 배열 파싱) → T3 (마크다운 렌더) → T4 (타임아웃)
```

T1~T3은 curation-card.tsx 중심으로 연쇄 수정. T4는 독립적이나 마지막에 배치 (테스트 편의).

### T1: 메타데이터 필터 강화 + 공통 유틸 추출

**신규 파일:**
- `src/lib/topic-utils.ts` — `filterValidTopics()`, `isMetadataKey()` 공통 유틸

**수정 파일:**
- `src/components/curation/curation-card.tsx` — 로컬 isMetadataKey 제거, import 교체, 필터 후 빈 체크
- `src/components/curation/topic-map-view.tsx` — 로컬 isMetadataKey 제거, import 교체

### T2: JSON 배열 AI 요약 파싱

**수정 파일:**
- `src/components/curation/curation-card.tsx` — `formatSummary`에 배열 파싱 + JSON 문자 strip

### T3: 인라인 마크다운 렌더링

**수정 파일:**
- `src/components/curation/curation-card.tsx` — `renderInlineMarkdown()` 추가, 요약 라인 렌더링 교체

### T4: 타임아웃 + 경과 시간 표시

**수정 파일:**
- `src/app/api/admin/curation/generate/route.ts` — 타임아웃 조정
- `src/components/curation/generate-preview-modal.tsx` — 경과 시간 UI + 클라이언트 타임아웃

## 6. 의존성 그래프

```
T1 (topic-utils.ts 신규 + curation-card/topic-map-view 수정)
  └─ 공통 유틸 추출

T2 (curation-card.tsx formatSummary 수정)
  └─ T1과 같은 파일이지만 다른 함수

T3 (curation-card.tsx 렌더링 수정)
  └─ T2의 formatSummary 출력을 렌더링하는 부분

T4 (route.ts + generate-preview-modal.tsx)
  └─ T1~T3과 파일 겹침 없음 — 독립 작업 가능
```

## 7. 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| 화이트리스트 방식이 유효 토픽도 제거할 수 있음 | 중 | 구조 패턴 기반(key:value, snake_case 등) 제거로 접근 — 순수 한국어/영어 단어는 유지 |
| 인라인 마크다운 파서 엣지케이스 | 저 | 볼드/이탤릭만 처리, 중첩은 미지원 (현실적으로 불필요) |
| Vercel Hobby 플랜 60초 제한 | 중 | Pro 플랜인지 확인 필요. Hobby면 maxDuration 300이 무시됨 — 근본 해결 불가 |
| 프록시 타임아웃 확대 시 폴백 시간 부족 | 중 | 프록시 240초 + 직접 호출 폴백 제거 or 프록시만 시도 전략 검토 |
