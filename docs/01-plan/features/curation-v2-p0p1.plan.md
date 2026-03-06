# 큐레이션 v2 Phase 0 + Phase 1 Plan

## 요구사항
큐레이션 탭을 듀얼모드(커리큘럼/큐레이션)로 리뉴얼.
Phase 0: 데이터 정비, Phase 1: UI 구조 변경.

## 범위

### In-scope
- P0-1: ai_summary NULL 백필 (generateFlashText 3줄 요약)
- P0-2: importance_score 0 백필 (blueprint/lecture=5, 나머지=AI 1~5)
- P1-1: PipelineSidebar 섹션 분리 (커리큘럼/큐레이션/통계)
- P1-2: CurriculumView 컴포넌트 신규 (시퀀스, 레벨, 진행률)
- P1-3: 듀얼모드 스위칭 (사이드바 선택 -> 조건부 렌더링)
- 반응형: 모바일 사이드바 -> 상단 탭

### Out-of-scope
- Phase 2 (토픽맵, 카드 v2), Phase 3 (Soft Delete)
- DB 마이그레이션 (sequence_order, curriculum_level)
- key_topics 재분석

## 성공 기준
1. ai_summary NULL = 0건
2. importance_score 0 = 0건
3. blueprint/lecture importance_score = 5
4. 사이드바 소스 클릭시 모드 자동 전환
5. CurriculumView 정상 렌더 (시퀀스, 진행률)
6. 기존 CurationTab 정상 동작
7. 반응형 동작
8. npm run build 성공

## 구현 순서
1. Phase 0: 백필 서버 액션 + API
2. Phase 1-1: PipelineSidebar 섹션 분리
3. Phase 1-2: CurriculumView
4. Phase 1-3: content/page.tsx 듀얼모드
5. 빌드 검증
