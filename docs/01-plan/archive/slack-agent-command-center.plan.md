# Slack 에이전트 통합 커맨드센터 기획서

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | Slack 기반 에이전트 통합 커맨드센터 |
| **요청일** | 2026-03-26 |
| **요청자** | Smith님 |
| **목표** | 모든 리더(CTO, PM, Marketing)를 Slack에서 대화하며 제어 |
| **핵심 가치** | tmux 전환 없이 Slack 하나로 전체 에이전트팀 통합 관리 |

---

## 1. 현재 상태 (AS-IS)

### 운영 구조
```
Smith님 → tmux attach -t sdk-cto   → CTO 리더 (팀원 3명)
        → tmux attach -t sdk-pm    → PM 리더 (팀원 2명)
        → tmux attach -t sdk-marketing → 마케팅 리더 (팀원 2명)
```

### 현재 문제점
1. **터미널 전환 피로**: tmux 세션 간 전환 필요 (Ctrl+B → 번호)
2. **모바일 접근 불가**: tmux는 데스크톱 터미널에서만 가능
3. **상태 파악 어려움**: 각 세션에 들어가야 진행 상황 확인 가능
4. **비동기 소통 불가**: 리더에게 지시하려면 해당 세션에 직접 입력해야 함

---

## 2. 목표 상태 (TO-BE)

### 운영 구조
```
Smith님 → Slack #cto-leader      → CTO 리더 세션
        → Slack #pm-leader       → PM 리더 세션
        → Slack #marketing-leader → 마케팅 리더 세션
        → Slack #agent-dashboard  → 전체 상태 모니터링
```

### 핵심 시나리오
1. Slack `#cto-leader`에 "처방 시스템 v2 Phase 5 시작해라" 입력
2. → CTO 리더가 메시지 수신 → 팀원 생성 → 작업 시작
3. → 진행 상황을 `#cto-leader` 채널에 자동 보고
4. → 완료 시 `#agent-dashboard`에 요약 게시

---

## 3. 기술 제약사항 분석

### Claude Channel (Slack 공식 연동)
| 항목 | 상태 | 비고 |
|------|------|------|
| 멀티 에이전트 | **불가** | 워크스페이스당 1개 Claude 인스턴스 |
| Claude Code 연결 | **불가** | 독립 대화형 Claude (도구 없음) |
| 파일/코드 접근 | **불가** | 프로젝트 컨텍스트 없음 |
| **결론** | **부적합** | 단순 대화용, 에이전트팀 제어 불가 |

### Computer Use
| 항목 | 상태 | 비고 |
|------|------|------|
| CLI 지원 | **불가** | Desktop 앱 전용 |
| Agent Teams 결합 | **불가** | Desktop에서 팀 미지원 |
| 헤드리스 실행 | **불가** | GUI 필수 |
| **결론** | **Phase 2 대기** | SDK/API 지원 시 통합 가능 |

### Claude Code SDK (프로그래밍 방식)
| 항목 | 상태 | 비고 |
|------|------|------|
| 세션 관리 | **가능** | SDK로 세션 생성/메시지 전송 |
| 도구 사용 | **가능** | 파일, Bash, MCP 전부 사용 |
| Agent Teams | **가능** | SDK에서 팀 생성 가능 |
| **결론** | **최적** | Slack Bot + SDK 조합이 정답 |

---

## 4. 추천 아키텍처

### Architecture: Slack Bot + Claude Code SDK Bridge

```
┌─────────────────────────────────────────────────────┐
│                    Slack Workspace                    │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌───────┐│
│  │#cto-leader│ │#pm-leader│ │#mkt-leader │ │#dashboard│
│  └─────┬────┘ └─────┬────┘ └──────┬─────┘ └───┬───┘│
└────────┼────────────┼─────────────┼────────────┼────┘
         │            │             │            │
    ┌────▼────────────▼─────────────▼────────────▼────┐
    │              Slack Bot (Node.js)                  │
    │  ┌─────────────────────────────────────────────┐ │
    │  │  Message Router                              │ │
    │  │  - 채널별 리더 매핑                           │ │
    │  │  - 메시지 큐잉 (리더 busy 시)                 │ │
    │  │  - 응답 포맷팅 (Markdown → Slack Block Kit)   │ │
    │  └─────────────────────────────────────────────┘ │
    └────┬────────────┬─────────────┬─────────────────┘
         │            │             │
    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
    │ CC SDK  │  │ CC SDK  │  │ CC SDK  │
    │ Session │  │ Session │  │ Session │
    │  (CTO)  │  │  (PM)   │  │ (Mkt)  │
    │ +Teams  │  │ +Teams  │  │ +Teams  │
    └─────────┘  └─────────┘  └─────────┘
         │            │             │
    ┌────▼────────────▼─────────────▼────┐
    │         bscamp 프로젝트              │
    │  src/ docs/ .pdca-status.json       │
    └─────────────────────────────────────┘
```

---

## 5. 컴포넌트 설계

### 5-1. Slack Bot (Gateway)

**역할**: Slack ↔ Claude Code SDK 브릿지

```
파일: agent-ops/slack-bridge/
├── src/
│   ├── app.ts              — Slack Bolt 앱 (이벤트 리스너)
│   ├── router.ts           — 채널→리더 라우팅
│   ├── session-manager.ts  — SDK 세션 풀 관리
│   ├── formatter.ts        — CC 응답 → Slack Block Kit 변환
│   ├── queue.ts            — 메시지 큐 (리더 busy 시 대기)
│   └── dashboard.ts        — #dashboard 상태 업데이트
├── config/
│   ├── leaders.json        — 리더별 설정 (역할, 시스템 프롬프트, 채널 매핑)
│   └── slack.json          — Slack App 토큰
└── package.json
```

### 5-2. 채널-리더 매핑

| Slack 채널 | 리더 | SDK Session | 시스템 프롬프트 |
|-----------|------|-------------|----------------|
| `#cto-leader` | CTO | cto-session | CLAUDE.md CTO 규칙 |
| `#pm-leader` | PM | pm-session | CLAUDE.md PM 규칙 |
| `#mkt-leader` | Marketing | mkt-session | 마케팅 분석 규칙 |
| `#agent-dashboard` | (읽기 전용) | - | 전체 상태 집계 |

### 5-3. 메시지 플로우

```
1. Smith님이 #cto-leader에 "처방 시스템 Phase 5 시작해라" 입력
2. Slack Bot이 app_mention 또는 message 이벤트 수신
3. Router가 채널 확인 → cto-session으로 라우팅
4. Session Manager가 SDK 세션 상태 확인:
   - 활성 → 메시지 전달
   - 비활성 → 새 세션 생성 + CLAUDE.md 로드 + 메시지 전달
5. SDK 세션에서 Claude Code 실행 (파일 읽기, 팀 생성, 구현 등)
6. 응답을 Formatter가 Slack Block Kit으로 변환
7. #cto-leader 채널에 응답 게시
8. 작업 완료 시 #agent-dashboard에 요약 게시
```

### 5-4. Dashboard 자동 업데이트

```
#agent-dashboard 채널에 주기적으로 게시:

┌─────────────────────────────────────────┐
│ 🤖 Agent Dashboard (09:15 KST)          │
├─────────────────────────────────────────┤
│ CTO  │ 🟢 활성 │ prescription-v2 Phase 5 │
│ PM   │ 🟡 대기 │ lp-pipeline Design 대기  │
│ Mkt  │ ⚫ 종료 │ -                        │
├─────────────────────────────────────────┤
│ PDCA 진행률: 8/10 features completed     │
│ 오늘 커밋: 3건 (feat: 2, fix: 1)        │
└─────────────────────────────────────────┘
```

---

## 6. 구현 로드맵

### Phase 1: Slack Bot + SDK 기본 연동 (3일)
| # | 작업 | 산출물 |
|---|------|--------|
| 1-1 | Slack App 생성 (Bot Token, Event Subscriptions) | Slack App 설정 |
| 1-2 | Slack Bolt 프레임워크 세팅 | app.ts |
| 1-3 | Claude Code SDK 세션 관리 | session-manager.ts |
| 1-4 | 채널→리더 라우팅 | router.ts |
| 1-5 | 기본 메시지 전달 (텍스트) | 동작 확인 |

### Phase 2: 응답 포맷팅 + Dashboard (2일)
| # | 작업 | 산출물 |
|---|------|--------|
| 2-1 | Markdown → Slack Block Kit 변환 | formatter.ts |
| 2-2 | 코드 블록, 테이블 지원 | Block Kit 템플릿 |
| 2-3 | Dashboard 채널 자동 게시 | dashboard.ts |
| 2-4 | PDCA 상태 연동 (.pdca-status.json 읽기) | 상태 표시 |

### Phase 3: 고급 기능 (2일)
| # | 작업 | 산출물 |
|---|------|--------|
| 3-1 | 메시지 큐 (리더 busy 시 대기열) | queue.ts |
| 3-2 | 파일 첨부 지원 (스크린샷, 리포트) | 파일 업로드 |
| 3-3 | 스레드 기반 대화 (작업별 스레드) | 스레드 관리 |
| 3-4 | `/status` `/kill` `/restart` 슬래시 커맨드 | 관리 명령 |

### Phase 4: Computer Use 통합 (SDK 지원 시)
| # | 작업 | 산출물 |
|---|------|--------|
| 4-1 | Computer Use API 연동 | 스크린 캡처/클릭 |
| 4-2 | 브라우저 QA 자동화 | Slack에서 QA 트리거 |
| 4-3 | 스크린샷 → Slack 자동 공유 | QA 결과 시각화 |

---

## 7. 필요 리소스

### Slack App 설정
```
1. https://api.slack.com/apps → Create New App
2. Bot Token Scopes:
   - chat:write (메시지 전송)
   - channels:history (메시지 읽기)
   - channels:read (채널 목록)
   - files:write (파일 업로드)
   - commands (슬래시 커맨드)
   - app_mentions:read (@멘션 감지)
3. Event Subscriptions:
   - message.channels (채널 메시지)
   - app_mention (멘션)
4. 채널 생성: #cto-leader, #pm-leader, #mkt-leader, #agent-dashboard
```

### 인프라
| 항목 | 선택지 | 비용 |
|------|--------|------|
| Slack Bot 호스팅 | Cloud Run (기존 GCP) | ~$5/월 |
| Claude Code SDK | Anthropic Max Plan (기존) | 포함 |
| Slack App | Free tier | $0 |

### 의존성
```json
{
  "@anthropic-ai/claude-code-sdk": "latest",
  "@slack/bolt": "^4.0.0",
  "@slack/web-api": "^7.0.0"
}
```

---

## 8. Computer Use 현재 상태 및 대안

### 현재 (2026-03)
- Desktop 앱 전용 (macOS)
- CLI/SDK에서 사용 불가
- Agent Teams와 결합 불가

### 대안: 스크린샷 + Vision
```
현재 가능한 방식:
1. Playwright로 localhost:3000 스크린샷 캡처
2. 스크린샷을 Gemini Vision / Claude Vision으로 분석
3. 결과를 Slack에 이미지와 함께 게시

→ Computer Use 없이도 "시각적 QA" 가능
→ 이미 프로젝트에 Playwright QA 파이프라인 있음
```

### 향후 (Computer Use SDK 출시 시)
- Phase 4에서 통합
- Slack에서 "브라우저 열고 로그인 페이지 확인해라" → 자동 실행

---

## 9. 슬래시 커맨드 설계

| 커맨드 | 동작 | 예시 |
|--------|------|------|
| `/status` | 전체 에이전트 상태 | `/status` |
| `/kill [leader]` | 리더 세션 종료 | `/kill cto` |
| `/restart [leader]` | 리더 세션 재시작 | `/restart pm` |
| `/pdca [feature]` | PDCA 상태 조회 | `/pdca prescription-v2` |
| `/assign [leader] [task]` | 작업 배정 | `/assign cto "Phase 5 시작"` |
| `/dashboard` | Dashboard 강제 갱신 | `/dashboard` |

---

## 10. 보안 고려사항

1. **Slack Bot Token**: 환경변수로만 관리 (GCP Secret Manager)
2. **SDK 세션 권한**: bypassPermissions는 Bot에서만 사용, 외부 노출 금지
3. **채널 접근 제한**: 리더 채널은 Smith님만 접근 가능 (Slack 채널 설정)
4. **명령 인증**: 슬래시 커맨드는 Smith님 Slack User ID 화이트리스트
5. **코드 노출 방지**: 소스코드 전체가 Slack에 노출되지 않도록 응답 길이 제한 (4000자)

---

## 11. 성공 기준

| # | 기준 | 측정 |
|---|------|------|
| 1 | Slack에서 리더에게 메시지 전달 성공률 | 99%+ |
| 2 | 응답 지연 (메시지 → 첫 응답) | < 10초 |
| 3 | 리더 세션 자동 복구 | 크래시 후 30초 내 재시작 |
| 4 | tmux 직접 접근 빈도 감소 | 90% 이상 Slack으로 대체 |
| 5 | 모바일에서 지시 가능 | Slack 모바일 앱 동작 확인 |

---

## 12. 리스크 및 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| SDK 세션 메모리 누수 | 장시간 운영 시 불안정 | 24시간 주기 세션 재생성 |
| Slack API rate limit | 대량 응답 시 차단 | 응답 청킹 + 1초 간격 |
| 긴 작업 시 타임아웃 | Slack 3초 응답 제한 | 즉시 ACK + 비동기 응답 |
| Computer Use 미지원 | GUI 작업 불가 | Playwright 대안 (Phase 2까지) |
| 동시 메시지 충돌 | 리더 컨텍스트 오염 | 메시지 큐로 직렬화 |

---

## 13. 우선순위 판단

| 비교 항목 | Slack 커맨드센터 | 처방 시스템 v2 | LP 분석 파이프라인 |
|-----------|------------------|---------------|-------------------|
| 비즈니스 임팩트 | 운영 효율 | 매출 직결 | 매출 직결 |
| 긴급도 | 낮음 (편의) | 높음 (Phase 5 대기) | 중간 (Design 대기) |
| 구현 복잡도 | 중간 (7일) | 낮음 (튜닝) | 높음 (신규) |
| **권장 순서** | **3순위** | **1순위** | **2순위** |

> **PM 의견**: 처방 시스템 v2 완료 → LP 분석 Design → Slack 커맨드센터 순서 권장.
> Slack 커맨드센터는 "있으면 좋은 것"이지 "없으면 안 되는 것"이 아님.
> 다만 agent-ops 프로젝트(별도 분리됨)에서 병렬 진행 가능.

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `POST /api/slack/events` | Slack Event (message) | SDK 세션으로 메시지 전달 + 200 OK | Slack Bot → SDK Bridge |
| `POST /api/slack/commands` | `/status` 슬래시 커맨드 | `{ leaders: [{ name, status, current_task }] }` | 전체 리더 상태 |
| `POST /api/slack/commands` | `/assign cto "Phase 5 시작"` | `{ assigned: true, leader: "cto", task: "Phase 5 시작" }` | 작업 배정 |
| `createSDKSession(leader)` | `"cto"` | `{ session_id, status: "active" }` | SDK 세션 생성 |
| `sendToSession(session_id, message)` | 세션 ID + 메시지 | `{ response, tokens_used }` | SDK 메시지 전송 |
| `recoverSession(leader)` | 크래시된 리더 | 30초 내 새 세션 생성 | 자동 복구 |
| `formatSlackResponse(sdk_response)` | SDK 긴 응답 | 4000자 이내 청킹된 Slack 메시지 | 코드 노출 방지 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| Slack 3초 응답 제한 | 긴 작업 지시 | 즉시 ACK (200) + 비동기 응답 (response_url) |
| SDK 세션 메모리 누수 | 24시간+ 운영 | 세션 자동 재생성 |
| Slack API Rate Limit | 대량 응답 | 응답 청킹 + 1초 간격 전송 |
| 비인가 사용자 커맨드 | Smith님 외 User ID | 403: "권한이 없습니다" |
| 동시 메시지 2건 | 같은 리더에게 동시 전송 | 메시지 큐 직렬화 처리 |
| SDK 세션 크래시 | 예기치 않은 종료 | 30초 내 자동 복구 + Slack 알림 |
| 리더 채널 외 메시지 | 일반 채널에서 멘션 | 무시 또는 "리더 채널에서 지시해주세요" 안내 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/slack-command-center/slack-event.json
{
  "type": "event_callback",
  "event": {
    "type": "message",
    "channel": "C_CTO_LEADER",
    "user": "U_SMITH",
    "text": "처방 시스템 v2 Phase 5 시작해라",
    "ts": "1711612800.000001"
  }
}

// fixtures/slack-command-center/slash-command.json
{
  "command": "/status",
  "user_id": "U_SMITH",
  "channel_id": "C_DASHBOARD",
  "response_url": "https://hooks.slack.com/commands/xxx"
}

// fixtures/slack-command-center/leader-status.json
{
  "leaders": [
    { "name": "cto", "status": "active", "current_task": "prescription-v2 Phase 5", "uptime": "2h 35m" },
    { "name": "pm", "status": "idle", "current_task": null, "uptime": "1h 10m" },
    { "name": "marketing", "status": "active", "current_task": "LP 분석 리서치", "uptime": "45m" }
  ]
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/slack-command-center/event-handler.test.ts` | Slack 이벤트 → SDK 전달 | vitest |
| `__tests__/slack-command-center/slash-commands.test.ts` | 슬래시 커맨드 (status, assign) | vitest |
| `__tests__/slack-command-center/sdk-session.test.ts` | SDK 세션 생성/복구/재생성 | vitest |
| `__tests__/slack-command-center/auth-whitelist.test.ts` | User ID 화이트리스트 검증 | vitest |
| `__tests__/slack-command-center/message-queue.test.ts` | 동시 메시지 직렬화 | vitest |
| `__tests__/slack-command-center/fixtures/` | JSON fixture 파일 | - |
