# BS CAMP QA Helpdesk — 프로젝트 현황

> 최종 업데이트: 2026-03-11 12:30 KST
> 프로젝트: https://bscamp.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk

---

## 오늘 완료 (2026-03-11)

### Sprint 0311 — T1/T2/T3
- [x] T1: QA 답변 소스 참조 수강생에게 숨기기 → `3ff5a6d`
- [x] T2: 답변 수정 기능 추가 (본인+관리자) → `ba98133`
- [x] T3: 총가치각도기 전체/선택 일괄 수집 → `c35b053`

### 믹스패널 SDK
- [x] SDK 설치 + Phase 1 이벤트 17개 트래킹 → `6defb43`
- [x] Vercel 환경변수 `NEXT_PUBLIC_MIXPANEL_TOKEN` 추가 완료 (Smith님)
- [x] Phase 2 이벤트 20개 추가 → `4644e7d`

### Sprint 0311-2 — T1/T2/T3
- [x] T1: 답변 수정 UI 개선 (이미지 첨부, 큰 textarea) → `4644e7d`
- [x] T2: 수강생 관리 탭에 광고관리자 바로가기 → `4644e7d`
- [x] T3: 믹스패널 Phase 2 이벤트 20개 추가 → `4644e7d`

### 핫픽스
- [x] H1: 초대코드 사용량 카운트 버그 → `e1d6170`
- [x] H2: 수집 UI 간소화 (선택 제거, 전체 수집만) → `e1d6170`
- [x] H3: 답변 수정 재임베딩 + textarea 크기 → `e1d6170`

### DB 작업
- [x] 유령 광고계정 4건 active=false 처리 (33, 123, 언버터, 자사몰사관학교)

### 프로세스 변경
- [x] CLAUDE.md 게이트 해제: 커밋+푸시 자유, 배포전 리뷰는 관리자
- [x] project-status.md 업데이트 절대 규칙 추가

---

## 개발 대기 (다음 TASK)

### 즉시 (Smith님 지시 완료)
1. **광고계정 관리탭 제거/간소화** — 수강생 1명에 계정 추가되는 구조라 별도 관리 불필요

### 기획 확정 후
2. **P1+P4: 알림 시스템** — 슬랙 + 카톡 알림톡 (답변알림/새질문/경쟁사새광고)
3. **P2: 기수별 광고성과 뷰** — 강의 시 기수 단위 성과 디테일

### 기존 잔여
6. 블루프린트 soft delete 11건
7. 수강생 랭킹 TASK (팀 매핑 DB, UI 위치 미확정)
8. 초안 탭 154건 정리
9. content-images RLS INSERT 정책
10. 카탈로그 이미지 cards 필드 파싱
11. 온보딩 스킵 이슈 (광고계정 미입력 시 접근 불가)

---

## 외부 문의
- **에듀플렉스 챗봇**: 임베딩된 데이터로 챗봇 답변 기능 제공 요청. 방안: A) API 제공, B) 위젯, C) 데이터 export. Smith님 방향 결정 대기.

---

## 크론 (vercel.json)
| 크론 | 스케줄 (UTC) | KST | 설명 |
|------|-------------|-----|------|
| collect-daily | 0 18 * * * | 03:00 | Meta 광고 성과 |
| collect-mixpanel | 30 18 * * * | 03:30 | 믹스패널 매출 |
| collect-benchmarks | 0 17 * * 1 | 월 02:00 | 벤치마크 재계산 |
| sync-notion | 0 19 * * * | 04:00 | Notion 동기화 |
| cleanup-deleted | 0 19 * * * | 04:00 | 삭제 데이터 정리 |

## 택소노미
- 문서: `docs/bscamp-mixpanel-taxonomy.md`
- 고객프로퍼티 16개 + 이벤트 37개 + 슈퍼프로퍼티 7개 + KPI 매핑 9개
