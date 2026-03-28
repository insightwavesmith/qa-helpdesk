# 정보공유 오류수정 Plan

> 작성일: 2026-03-07
> TASK: TASK-정보공유-오류수정.md
> 리서치: docs/research/info-share-bugfix.research.md

---

## 배경

정보공유 기능 전수조사에서 오류/미구현 4건 발견. 서비스 오픈(3/9) 전 P1 3건(T1, T2, T4) 우선 수정.
전수조사 리포트: `mozzi-reports.vercel.app/reports/plan/2026-03-07-info-share-feature-audit.html`

---

## 태스크 목록

### T1: 스킵 -> 신규 되돌리기 (P1)

**이게 뭔지**: 스킵(dismissed) 처리한 콘텐츠를 다시 신규(new)로 되돌리는 기능 추가
**왜 필요한지**: 현재 실수로 스킵하면 복구 불가. DB 직접 수정해야 함. 운영 중 반드시 발생할 시나리오.
**구현 내용**:
- `updateCurationStatus`, `batchUpdateCurationStatus`의 status 타입에 `"new"` 추가
- 스킵 탭(dismissed) 카드에 "되돌리기" 버튼 추가
- 벌크 바에 "일괄 되돌리기" 추가 (스킵 탭일 때)
**관련 파일**: `src/actions/curation.ts`, `src/components/curation/curation-view.tsx`, `src/components/curation/curation-card.tsx`
**성공 기준**: 스킵 탭에서 되돌리기 클릭 -> 해당 콘텐츠가 신규 탭에 다시 나타남

### T2: 커리큘럼 잠금 해제 (P1)

**이게 뭔지**: 커리큘럼 뷰에서 관리자가 순서 무관하게 아무 강의든 발행할 수 있게 잠금 완화
**왜 필요한지**: 현재 순차 강제(1->2->3)라 중간 강의를 건너뛰고 뒤쪽을 먼저 발행 불가. 운영 유연성 부족.
**구현 내용**:
- CurriculumItem에 "정보공유 생성" 버튼 추가 (모든 publishStatus에서 접근 가능)
- CurriculumView에 `onGenerateInfoShare` prop 추가
- content/page.tsx에서 CurriculumView에 콜백 전달
- 잠금 UI(뱃지, 아이콘)는 유지하되 발행 버튼은 활성
**관련 파일**: `src/components/curation/curriculum-view.tsx`, `src/app/(main)/admin/content/page.tsx`
**성공 기준**: 잠금 상태 강의 클릭 -> 정보공유 생성 가능

### T4: 소스 전환 캐싱 (P1)

**이게 뭔지**: 사이드바에서 소스 전환 시 이전에 로드한 데이터를 캐시해서 재호출 방지
**왜 필요한지**: 현재 소스 왔다갔다 할 때마다 매번 API 호출 + 로딩 스피너. UX 느림.
**구현 내용**:
- useRef로 소스별 캐시 Map 관리: `Map<cacheKey, { contents, counts, timestamp }>`
- 캐시 키 = sourceFilter + statusFilter 조합
- 캐시 히트 시 즉시 렌더, 백그라운드에서 최신 데이터 갱신 (stale-while-revalidate)
- 상태 변경(스킵/생성/삭제/되돌리기) 시 관련 캐시 무효화
**관련 파일**: `src/components/curation/curation-view.tsx`
**성공 기준**: 소스A -> 소스B -> 소스A 전환 시 소스A 데이터 즉시 표시 (로딩 없음)

### T3: "발행됨" 상태 구분 (P2)

**이게 뭔지**: 정보공유 초안 생성 시 원본 소스를 바로 "published"로 변경하는 대신, 실제 게시 여부를 구분
**왜 필요한지**: 현재 초안만 만들어도 원본이 "발행됨"으로 표시됨. info_share가 draft인데 원본은 published -> 관리자 혼란.
**구현 내용**:
- createInfoShareDraft: 원본 curation_status를 "published" 대신 "selected"로 유지 (이미 selected 상태이므로 변경 안 함)
- 발행됨 탭 표시 로직: linked_info_shares의 status를 기준으로 "초안"/"게시됨" 구분
- curation-card.tsx: 생성물 연결 표시에 status 반영 ("초안 생성됨" / "게시 완료")
**관련 파일**: `src/actions/curation.ts`, `src/components/curation/curation-view.tsx`, `src/components/curation/curation-card.tsx`
**성공 기준**: 정보공유 초안 생성 -> "발행됨" 탭에서 초안/게시 구분 표시됨

---

## 의존성 및 우선순위

```
T1 (독립) ─────> T2 (독립) ─────> T4 (독립) ─────> T3 (상태 체계 변경, 마지막)
```

- T1, T2, T4는 독립. T3은 상태 체계 변경이라 다른 태스크와 충돌 가능성 있으므로 마지막에 작업.
- 우선순위: T1 -> T2 -> T4 -> T3

---

## 제외 사항

- 정보공유 생성 AI 타임아웃 (프록시 인프라 문제, 별도 처리)
- 수강생 페이지(/posts) 변경 없음
- DB 마이그레이션 없음 (curation_status는 text 타입으로 새 값 추가 자유)

---

## 완료 기준

- [ ] 스킵 탭에서 되돌리기 -> 신규 탭 확인
- [ ] 커리큘럼 잠금 강의 -> 정보공유 생성 가능
- [ ] 소스 전환 캐싱 동작 확인
- [ ] 정보공유 초안 생성 후 "발행됨" 상태 구분 확인
- [ ] `npx tsc --noEmit --quiet` 통과
- [ ] `npx next lint --quiet` 통과
- [ ] `npm run build` 성공
- [ ] Gap 분석 90%+
