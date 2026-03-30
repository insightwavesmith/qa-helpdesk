---
team: PM
session: sdk-pm
created: 2026-03-30
status: pending
owner: leader
priority: P0-URGENT
type: Design + QA TDD
---

# TASK: 체인 자동화 방탄 TDD — 어떤 상황이든 체인이 깨지지 않게

> COO(모찌) → PM팀 Design + QA TDD 설계
> Smith님 직접 지시: "어떤 상황이든 체인구조가 깨지지 않게. 디테일하게."

---

## 배경

체인 자동화 구축 → 실전 0% 동작 → 근본 수정(e4c41dc) → push 완료.
하지만 **아직 실전 검증 안 됨.** "다시는 안 터지게" TDD를 잡아야 함.

현재 TDD: 374건 Green / 1건 실패 (CH-5 broker 미기동)

---

## 체인이 깨질 수 있는 모든 상황 (COO가 정의)

### A. context 관련
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| A1 | team-context 파일이 아예 없음 | silent exit 0, 체인 안 탐 (정상 — context 없으면 체인 대상 아님) | 낮음 |
| A2 | team-context 파일 내용이 빈 JSON `{}` | exit 0 + 로그 남김 | 중간 |
| A3 | team-context에 team 필드 없음 | exit 0 + 로그 남김 | 중간 |
| A4 | team-context에 taskFiles 빈 배열 | exit 0 + 로그 남김 | 중간 |
| A5 | 3팀 동시 context 존재 (sdk-cto, sdk-cto-2, sdk-pm) | 각각 독립 체인, 서로 간섭 없음 | **높음** |
| A6 | 한 팀 TeamDelete → 다른 팀 context 영향 | 영향 0 (자기 파일만 아카이빙) | **높음** |
| A7 | 아카이브 파일만 존재 (활성 없음) | 아카이브에서 읽어서 체인 발동 | **높음** |
| A8 | 레거시 team-context.json만 존재 (마이그레이션 전) | fallback으로 레거시 읽기 | 중간 |
| A9 | context 파일 JSON 파싱 에러 (깨진 파일) | exit 0 + 에러 로그, 체인 블로킹 안 함 | 중간 |

### B. TeamDelete 타이밍
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| B1 | TeamDelete → 즉시 TaskCompleted | 아카이브에서 context 읽어서 체인 정상 발동 | **최고** |
| B2 | TeamDelete 없이 TaskCompleted (단독 세션) | 활성 context 그대로 읽기 | 낮음 |
| B3 | TeamDelete 2번 연속 (같은 팀) | 첫 번째만 아카이빙, 두 번째는 no-op | 중간 |
| B4 | 3팀 동시 TeamDelete | 각각 자기 context만 아카이빙 | **높음** |

### C. 체인 라우팅
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| C1 | CTO 완료 → PM한테 자동 전달 | pdca-chain-handoff → pm-chain-forward 호출 | **최고** |
| C2 | PM 검수 pass → COO한테 자동 전달 | pm-chain-forward → coo-chain-report 호출 | **최고** |
| C3 | PM 검수 reject → CTO한테 FEEDBACK | pm-chain-forward → CTO에 feedback 전달 | **높음** |
| C4 | COO 보고 → webhook wake 호출 | coo-chain-report → curl webhook | **높음** |
| C5 | broker 안 돌아감 (localhost:7899 연결 불가) | webhook wake fallback으로 전환 | **높음** |
| C6 | webhook wake도 실패 | ACTION_REQUIRED 로그 남기고 exit 0 (블로킹 안 함) | 중간 |
| C7 | peer-resolver가 대상 peer 못 찾음 | 수동 핸드오프 로그 + exit 0 | 중간 |
| C8 | 중복 메시지 (같은 msg_id 2회) | dedup으로 두 번째 무시 | 중간 |

### D. hook 실행 환경
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| D1 | tmux 없는 환경 (CI, 로컬 단독) | team-context-local.json fallback | 중간 |
| D2 | jq 미설치 | exit 0 + 에러 로그 (체인 블로킹 안 함) | 낮음 |
| D3 | hook 실행 시간 5초+ 초과 | 타임아웃 exit 0 (블로킹 안 함) | 중간 |
| D4 | .pdca-status.json 없음 | exit 0 + 로그 | 중간 |
| D5 | runtime 디렉토리 없음 | 자동 생성 or exit 0 | 중간 |

### E. requireApproval 통합
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| E1 | 팀원 .claude/ 수정 → 승인 요청 | requireApproval 호출, Slack 알림 | **높음** |
| E2 | 승인 → 작업 재개 → 완료 → 체인 발동 | 전체 플로우 정상 | **최고** |
| E3 | 거부 → exit 2 → 팀원 중단 → 리더가 이어받기 → 체인 | 체인 정상 (리더 TaskCompleted) | **높음** |
| E4 | 타임아웃 → exit 2 → 동일 | 위와 동일 | **높음** |
| E5 | requireApproval API 실패 → fallback exit 2 | 기존 차단 동작으로 폴백 | 중간 |

### F. 에러 복구
| ID | 상황 | 예상 동작 | 위험도 |
|----|------|----------|--------|
| F1 | hook 중간에 크래시 (exit 1) | 다른 hook 영향 없음, 체인 다음 단계는 안 탐 | 중간 |
| F2 | git conflict 상태에서 hook 실행 | exit 0 (체인 블로킹 안 함) | 낮음 |
| F3 | 아카이브 1시간+ → 자동 정리 | session-resume-check에서 삭제 | 낮음 |
| F4 | 동시에 2개 TaskCompleted 이벤트 | 각각 독립 처리 (경합 없음) | **높음** |

---

## PM팀이 해야 할 것

### 1. Design 문서 작성
- 위 상황 A1~F4 전부 커버하는 Design
- 각 상황별: 어떤 hook이 관여하는지, 기대 동작, TDD assertion
- 수정 파일 목록 (hook 비즈니스 로직 변경 필요하면 명시)

### 2. TDD 케이스 설계
- 위 상황 전부 → vitest 테스트 케이스로 변환
- 위험도 "최고" + "높음" = **필수** (13건)
- 위험도 "중간" = **권장** (14건)
- 위험도 "낮음" = **선택** (5건)
- **최소 20건, 이상적으로 32건**

### 3. 기존 TDD 회귀 검증 계획
- 기존 374건 전부 Green 유지 방법
- 어떤 테스트가 context 경로 변경에 영향받는지 목록화

### 4. 실전 검증 시나리오 (Smith님 Slack 테스트용)
- Smith님이 직접 Slack에서 승인/거부 누르는 시나리오
- 체인 끝에 Smith님 Slack에 보고 오는지 확인하는 시나리오
- 체크리스트 형태로 작성

---

## COO 의견
위 상황 정의는 COO 의견일 뿐이다. 참고하되 빠진 상황 있으면 추가하고, 최고의 방법을 찾아라.
특히 내가 못 본 엣지케이스가 있을 수 있다 — 기존 hook 코드를 직접 읽고 판단해라.

## 하지 말 것
- 코드 수정 금지 — Design + TDD 케이스 설계만
- 기존 hook 로직 변경 제안은 가능하지만, 구현은 CTO팀
- 기존 테스트 파일 수정 제안 금지 — 신규 파일 추가만

## 산출물
- `docs/02-design/features/chain-bulletproof.design.md`
- TDD 케이스 목록 (테스트 코드 아님 — 케이스 정의서)
- Smith님 실전 검증 체크리스트

## 검증 기준
- 상황 A1~F4 전부 Design에 반영
- TDD 케이스 최소 20건
- 기존 374건 회귀 분석 포함
- Smith님 실전 체크리스트 포함
