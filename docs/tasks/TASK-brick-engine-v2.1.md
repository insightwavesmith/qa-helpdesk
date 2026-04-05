# TASK: brick-engine-v2.1

> 작성일: 2026-04-05
> 작성자: 모찌 (COO)
> 프로젝트: brick-engine
> 유형: 리팩토링 (확장성 있는 완전한 엔진)

---

## 배경

브릭 엔진 3축(블록×팀×링크) QA 통과(230/240 PASS). 첫 Building 시도 시 bkit 훅 간섭 + 산출물 전달 미연결로 실패. 리뷰 4팀(Codex + PM + OMC 3명) 검토 결과: 3축 구조는 맞고 설계 결함 아닌 구현 누락. 확장성 있는 완전한 엔진으로 정비한다.

---

## 현재 상태

```
있는 것:
  ✅ 3축 자유도 (블록 10종 + 팀 5종 + 링크 7종)
  ✅ Gate 8종 + 등록 확장
  ✅ StateMachine 순수 함수
  ✅ 체크포인트 저장/복구
  ✅ 이벤트 버스 + Slack 알림
  ✅ pytest 784 passed / vitest 676 passed

없는 것 (26건):
  ❌ 블록 간 산출물 전달
  ❌ Building 폴더 구조
  ❌ 통합문서 (BOARD.md)
  ❌ executor 모듈 분리 (871줄 만능)
  ❌ 보안/직렬화/race condition 버그
  → 상세: brick/docs/architecture-brick-engine-v2.1.md
```

---

## 요구사항

아키텍처 설계서 참조: `brick/docs/architecture-brick-engine-v2.1.md`
리뷰 참조: `brick/docs/architecture-review-codex.md`, `architecture-review-pm.md`, `architecture-review-omc.md`

26건 기존→개선 대조표 전부 구현.

---

## 범위 제한

- 3축 구조 변경 없음
- 기존 테스트 784건 유지 (깨뜨리지 않음)
- Codex/OpenChrome 어댑터 구현은 이 TASK에 포함하지 않음

---

## 레퍼런스

- 아키텍처 v2.1: brick/docs/architecture-brick-engine-v2.1.md
- Codex 리뷰: brick/docs/architecture-review-codex.md
- PM 리뷰: brick/docs/architecture-review-pm.md
- OMC 리뷰: brick/docs/architecture-review-omc.md
- 엔진 코드: brick/brick/
