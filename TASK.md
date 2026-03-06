# TASK: 큐레이션 v2 Phase 0+1 코드 리뷰

## 타입
코드리뷰

## 배경
큐레이션 v2 Phase 0 (데이터 백필) + Phase 1 (사이드바 + CurriculumView + 듀얼모드)이 구현되었다.
빌드는 통과했지만, 코드 품질/설계/보안/UX 관점에서 철저한 리뷰가 필요하다.

## 리뷰 대상 파일

### Phase 0 — 데이터 백필
1. `src/actions/curation.ts` — backfillAiSummary(), backfillImportanceScore() 서버 액션
2. `src/app/api/admin/curation/backfill/route.ts` — POST API 엔드포인트

### Phase 1 — UI
3. `src/components/curation/pipeline-sidebar.tsx` — 3섹션 분리 (커리큘럼/큐레이션/통계)
4. `src/components/curation/curriculum-view.tsx` — 신규 컴포넌트 (레벨 파싱, 진행률)
5. `src/app/(main)/admin/content/page.tsx` — 듀얼모드 분기 로직

### 참고 문서
6. `docs/proposals/curation-v2-spec.md` — 원본 스펙 (이 스펙 대로 구현됐는지 확인)
7. `docs/01-plan/features/curation-v2-p0p1.plan.md` — Plan 문서
8. `docs/02-design/features/curation-v2-p0p1.design.md` — Design 문서

## 리뷰 체크리스트

### 1. 스펙 일치도 (Gap 분석)
- [ ] `curation-v2-spec.md`의 Phase 0 요구사항 vs 실제 구현 비교
- [ ] `curation-v2-spec.md`의 Phase 1 요구사항 vs 실제 구현 비교
- [ ] 누락된 기능 목록 작성

### 2. 코드 품질
- [ ] TypeScript 타입 안전성 (any 사용, 미흡한 타입 정의)
- [ ] 에러 처리 (try-catch, 사용자 피드백)
- [ ] 중복 코드
- [ ] 네이밍 일관성

### 3. 보안
- [ ] 백필 API 인증/권한 체크
- [ ] SQL 인젝션 방어
- [ ] Rate limit / 남용 방지

### 4. 성능
- [ ] 불필요한 리렌더링
- [ ] 큰 데이터셋 처리 (페이지네이션, 가상 스크롤)
- [ ] API 호출 최적화

### 5. UX
- [ ] 모바일 반응형 정상 동작
- [ ] 로딩 상태 표시
- [ ] 빈 상태 (데이터 없을 때) 처리

## 출력물
1. `docs/03-analysis/curation-v2-p0p1-review.md` — 리뷰 결과 문서
   - 이슈별 심각도: 🔴 Critical / 🟡 Warning / 🔵 Info
   - 각 이슈에 파일명 + 라인 번호 + 수정 제안
2. 스펙 Gap 있으면 목록 정리
3. **코드 수정은 하지 마** — 리뷰 결과만 문서로

## 관련 파일
- src/actions/curation.ts
- src/app/api/admin/curation/backfill/route.ts
- src/components/curation/pipeline-sidebar.tsx
- src/components/curation/curriculum-view.tsx
- src/app/(main)/admin/content/page.tsx
- docs/proposals/curation-v2-spec.md
