# 에이전트팀 오케스트레이션 기획서

> 작성: 모찌 (COO) | 2026-03-25
> 승인 대기: Smith님 (CEO)

---

## 1. 왜 필요한가

에이전트팀 3개(PM, CTO, 마케팅)가 돌아가는데 팀 간 소통이 안 되고 있다.
설계서는 있고, 파일 구조도 있는데, **"리더들이 자동으로 감지하고 반응하는" 프로세스**가 없다.
결과: 모찌가 수동 중계 → 모찌가 병목 → 놓치면 팀이 멈춤.

---

## 2. 조직 구조도

```
┌─────────────────────────────────────────────────────┐
│                  Smith님 (CEO)                       │
│              방향 결정 · 최종 승인                     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  모찌 (COO)                          │
│         3팀 조율 · 우선순위 · TASK 작성 · 보고        │
│                                                      │
│  역할: 오케스트레이터 (직접 코딩 X, 판단만)            │
│  모니터링: 팀 상태 감시 + 슬랙 알림 수신               │
└───────┬──────────────┬──────────────┬───────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│  PM팀    │   │  CTO팀   │   │ 마케팅팀  │
│  📋      │   │  🔧      │   │  📊      │
│          │   │          │   │          │
│ 리더     │   │ 리더     │   │ 리더     │
│ ├ 기획1  │   │ ├ BE-dev │   │ ├ 분석1  │
│ └ 기획2  │   │ ├ FE-dev │   │ └ 분석2  │
│          │   │ └ QA     │   │          │
└──────────┘   └──────────┘   └──────────┘
  sdk-pm         sdk-cto        sdk-mkt
```

---

## 3. 팀 간 소통 체인 프로세스

### 3.1 전체 흐름

```
PM팀                    CTO팀                   마케팅팀
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Plan 작성]
    │
    ▼
[Design 작성]
    │
    ├─── 마커 생성 ──────────────────────────▶ [검증 준비]
    │    pm-{feature}-done.md
    │
    ├─── 마커 감지 ──▶ [구현 시작]
    │                      │
    │                      ▼
    │                 [코드 작성]
    │                      │
    │                      ▼
    │                 [tsc + build]
    │                      │
    │                      ▼
    │                 [커밋 + push]
    │                      │
    │                 마커 생성 ──────────────▶ [마케팅 검증]
    │                 cto-{feature}-done.md        │
    │                                              ▼
    │                                         [검증 완료]
    │                                              │
    ◀────────────────────────────── 마커 감지 ──────┘
    │                               mkt-{feature}-done.md
    ▼
[리뷰 + 사이클 완료]
```

### 3.2 자동 체인 규칙 (4개)

| # | 트리거 | 발신 | 수신 | 액션 |
|---|--------|------|------|------|
| 1 | PM Plan+Design 완료 | PM | CTO | 구현 시작 |
| 2 | PM Plan+Design 완료 | PM | 마케팅 | 검증 준비 |
| 3 | CTO 구현 완료 | CTO | 마케팅 | 마케팅 검증 시작 |
| 4 | 마케팅 검증 완료 | 마케팅 | PM | 결과 리뷰 |

### 3.3 마커 파일 규약

```
위치: /tmp/cross-team/
파일명: {팀}-{기능}-done.md
내용:
  - 완료 시각
  - 산출물 경로 (설계서, 코드, 분석서)
  - 다음 팀에게 전달할 맥락
  - 주의사항
```

### 3.4 state.json 규약

```
위치: /tmp/cross-team/{팀}/state.json
갱신: 리더가 TASK 상태 변경 시 자동 업데이트

{
  "team": "cto",
  "status": "active",       // active | idle | blocked
  "currentTask": "슬랙 알림 구현",
  "tasks": [
    {"id": "T1", "name": "슬랙 알림", "status": "doing", "owner": "backend-dev"},
    {"id": "T2", "name": "웹터미널", "status": "doing", "owner": "frontend-dev"}
  ],
  "updatedAt": "2026-03-25T11:00:00+09:00"
}
```

### 3.5 comm.jsonl 규약 (팀 간 메시지 로그)

```
위치: /tmp/cross-team/logs/comm.jsonl
형식: append-only, 한 줄에 하나

{"from":"pm","to":"cto","type":"handoff","feature":"slack-notification","message":"설계 완료, 구현 시작해라","at":"2026-03-25T11:00:00+09:00"}
{"from":"cto","to":"pm","type":"question","feature":"slack-notification","message":"Block Kit 포맷 확인 필요","at":"2026-03-25T11:05:00+09:00"}
```

---

## 4. 자동화 레이어

### 4.1 리더 CLAUDE.md 규칙 (각 팀 공통)

```markdown
## 팀 간 소통 규칙 (필수)

### 마커 파일 감시
- TASK 시작 전: /tmp/cross-team/ 에서 자신에게 온 마커 확인
- pm-*-done.md → CTO팀/마케팅팀: 새 작업 도착
- cto-*-done.md → 마케팅팀: 검증 시작
- mkt-*-done.md → PM팀: 리뷰 시작

### 완료 시 마커 생성
- TASK 완료 → /tmp/cross-team/{팀}-{기능}-done.md 생성
- state.json 업데이트
- comm.jsonl에 핸드오프 로그 append

### 질문/협의
- 다른 팀에게 질문: comm.jsonl에 type:"question" 기록
- 모찌가 감지해서 전달 (Phase 1)
- 직접 전달 (Phase 2, 자동화 후)
```

### 4.2 Hook 자동화

| Hook | 트리거 | 동작 |
|------|--------|------|
| **chain-watcher.sh** | 60초마다 (cron) | /tmp/cross-team/ 마커 스캔 → 새 마커 발견 시 해당 팀에 tmux send-keys |
| **state-updater.sh** | TaskCompleted | state.json 자동 갱신 |
| **comm-logger.sh** | 마커 생성 시 | comm.jsonl에 핸드오프 로그 append |
| **slack-notifier.sh** | 마커 생성 시 | 슬랙 C0AN7ATS4DD 채널에 알림 |

### 4.3 모찌 모니터링 (COO)

```
모찌가 자동으로 감시하는 것:
1. /tmp/cross-team/ 마커 파일 변화
2. state.json으로 각 팀 현재 상태
3. comm.jsonl로 팀 간 소통 로그
4. 슬랙 알림 채널 (C0AN7ATS4DD)

모찌가 개입하는 시점:
- 팀이 30분 이상 idle → 깨움
- 체인 전달 실패 → 수동 중계
- 충돌/의존성 문제 → 우선순위 조정
- Smith님 지시 → 즉시 전달
```

---

## 5. PDCA와 연동

```
PDCA 단계        팀 간 체인              자동화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plan             PM팀 작성               .pdca-status.json → "planning"
                   │
Design           PM팀 작성               .pdca-status.json → "designing"
                   │
                   ▼ 마커: pm-done
                   
Do               CTO팀 구현              .pdca-status.json → "implementing"
                   │
                   ▼ 마커: cto-done
                   
Check            마케팅팀 검증            .pdca-status.json → "checking"
                 + CTO QA
                   │
                   ▼ 마커: mkt-done
                   
Act              PM팀 리뷰               .pdca-status.json → "completed"
                 → 다음 사이클
```

---

## 6. 구현 Phase

### Phase 1: 지금 즉시 (30분)
- [ ] CLAUDE.md에 팀 간 소통 규칙 추가
- [ ] chain-watcher.sh 작성 (마커 감시 + tmux send-keys)
- [ ] state-updater.sh 작성 (TaskCompleted hook)
- [ ] 각 팀 리더에게 규칙 전달

### Phase 2: 슬랙 알림 구현 후
- [ ] 마커 생성 → 슬랙 자동 알림
- [ ] Smith님 DM으로 체인 전달 알림
- [ ] comm.jsonl 기반 소통 대시보드

### Phase 3: 웹터미널 구현 후
- [ ] 브라우저에서 팀 간 소통 실시간 뷰
- [ ] 체인 진행률 시각화
- [ ] 리더 간 직접 메시지 (웹 UI)

---

## 7. 성공 기준

| 지표 | 현재 | 목표 |
|------|------|------|
| 팀 간 핸드오프 시간 | 10~30분 (모찌 수동) | 1분 이내 (자동) |
| 팀 idle 감지 | 못 함 (놓침) | 30초 이내 |
| 모찌 수동 중계 비율 | 100% | 10% 이하 |
| 체인 전달 성공률 | 불명 | 95% 이상 |

---

_이 문서는 에이전트팀 운영의 핵심 기획서. 변경 시 Smith님 승인 필요._
