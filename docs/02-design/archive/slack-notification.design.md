# 슬랙 알림 시스템 상세 설계서

> **작성일**: 2026-03-25
> **작성자**: PM팀 설계 담당
> **기존 설계 참조**: `docs/02-design/features/agent-dashboard.design.md` 섹션 2.6~2.8
> **구현 참조**: `src/lib/slack-notifier.ts`, `src/lib/chain-detector.ts`, `src/types/agent-dashboard.ts`, `.claude/hooks/agent-slack-notify.sh`

---

## 1. 개요

### 1.1 기능 설명

에이전트 대시보드의 주요 이벤트(작업 시작/완료, 체인 전달, 배포, 에러, 승인 요청, PDCA 단계 전환, 백그라운드 작업 완료)를 Slack Block Kit 메시지로 실시간 전송하는 시스템이다.

### 1.2 배경

- 3개 에이전트팀(PM, CTO, 마케팅)이 비동기로 작업하면서 팀 간 상태 공유가 필요
- CEO(Smith님)는 중요/긴급 이벤트를 DM으로 즉시 파악해야 함
- 에이전트 대시보드(웹)는 상시 열어둘 수 없으므로 Slack이 주요 알림 채널

### 1.3 기존 설계와의 관계

| 항목 | agent-dashboard.design.md (섹션 2.6~2.8) | 본 문서 |
|------|------------------------------------------|---------|
| 이벤트 정의 | 8개 이벤트 타입 + 라우팅 테이블 | 동일 (변경 없음) |
| Block Kit | buildSlackBlocks 함수 스케치 | 8개 이벤트별 **실제 JSON** 전체 |
| 에러 핸들링 | 미정의 | 재시도 전략, Rate Limit 대응 상세화 |
| Rate Limit | 미정의 | 큐잉 + 배치 전송 전략 |
| Hook 동작 | 개략 설명 | stdin 포맷, 환경변수, 분기 로직 상세화 |
| API 엔드포인트 | 요청/응답 스케치 | 인증, 검증, 에러 코드 상세화 |

---

## 2. 이벤트 목록 (8개)

### 2.1 `task.started` — 팀 TASK 작업 시작

| 항목 | 값 |
|------|-----|
| **트리거 조건** | 에이전트 세션이 TASK 착수 시 `PUT /api/agent-dashboard/team/{teamId}`로 task.status를 `active`로 변경할 때 |
| **트리거 파일** | `src/app/api/agent-dashboard/team/[teamId]/route.ts` (PUT 핸들러 내부) |
| **수신처** | 해당 팀 채널만 (예: PM팀이면 #agent-pm) |
| **CEO DM** | X |
| **우선순위** | `normal` |

### 2.2 `task.completed` — 팀 TASK 작업 완료

| 항목 | 값 |
|------|-----|
| **트리거 조건** | (1) `PUT /api/agent-dashboard/team/{teamId}`에서 task.status가 `done`으로 변경될 때, 또는 (2) `.claude/hooks/agent-slack-notify.sh`가 TaskCompleted hook으로 실행될 때 |
| **트리거 파일** | `src/app/api/agent-dashboard/team/[teamId]/route.ts`, `.claude/hooks/agent-slack-notify.sh` |
| **수신처** | 해당 팀 채널만 |
| **CEO DM** | X |
| **우선순위** | `normal` |

### 2.3 `chain.handoff` — 팀 간 체인 전달

| 항목 | 값 |
|------|-----|
| **트리거 조건** | 한 팀의 모든 TASK가 `done` 상태가 되었을 때, `chain-detector.ts`의 `detectChainHandoff()`가 매칭되는 `ChainRule`을 반환하면 발생 |
| **트리거 파일** | `src/lib/chain-detector.ts` (규칙 매칭), `.claude/hooks/agent-slack-notify.sh` (모든 TASK 완료 감지 시) |
| **수신처** | 발신 팀 + 수신 팀 양쪽 채널 (예: PM→CTO면 #agent-pm + #agent-cto) |
| **CEO DM** | O |
| **우선순위** | `important` |

**체인 규칙 (chain-detector.ts에 정의됨)**:

| fromTeam | fromEvent | toTeam | toAction |
|----------|-----------|--------|----------|
| pm | plan.completed | cto | 구현 착수 필요 |
| pm | plan.completed | marketing | 검증 준비 필요 |
| cto | implementation.completed | marketing | 마케팅 검증 시작 |
| marketing | review.completed | pm | 결과 리뷰 필요 |

### 2.4 `deploy.completed` — 배포 완료

| 항목 | 값 |
|------|-----|
| **트리거 조건** | Vercel 배포 성공 후 수동 호출, 또는 CI/CD webhook에서 `POST /api/agent-dashboard/slack/notify` 호출 |
| **트리거 파일** | `src/app/api/agent-dashboard/slack/notify/route.ts` (외부 호출) |
| **수신처** | #agent-cto |
| **CEO DM** | O |
| **우선순위** | `important` |

### 2.5 `error.critical` — 빌드 실패, 런타임 에러

| 항목 | 값 |
|------|-----|
| **트리거 조건** | (1) `npm run build` 실패 시 hook에서 호출, (2) 런타임 에러 감지 시 수동/자동 호출 |
| **트리거 파일** | `.claude/hooks/agent-slack-notify.sh` (빌드 실패 감지 시), `src/app/api/agent-dashboard/slack/notify/route.ts` |
| **수신처** | 해당 팀 채널 |
| **CEO DM** | O |
| **우선순위** | `urgent` |

### 2.6 `approval.needed` — PR 리뷰, Plan 승인 필요

| 항목 | 값 |
|------|-----|
| **트리거 조건** | PR 생성 시 또는 Plan 문서 작성 완료 후 Leader가 승인 요청할 때 |
| **트리거 파일** | `src/app/api/agent-dashboard/slack/notify/route.ts` (에이전트가 직접 호출) |
| **수신처** | 해당 팀 채널 |
| **CEO DM** | O |
| **우선순위** | `important` |

### 2.7 `pdca.phase_change` — PDCA 단계 전환

| 항목 | 값 |
|------|-----|
| **트리거 조건** | `.pdca-status.json`의 feature phase가 변경될 때 (예: `designing` → `implementing`) |
| **트리거 파일** | `src/app/api/agent-dashboard/slack/notify/route.ts` (상태 갱신 후 호출) |
| **수신처** | 해당 팀 채널만 |
| **CEO DM** | X |
| **우선순위** | `normal` |

### 2.8 `background.completed` — 백그라운드 장기 작업 완료

| 항목 | 값 |
|------|-----|
| **트리거 조건** | backfill, embedding 등 장기 작업이 완료되어 `PUT /api/agent-dashboard/background/{taskId}`에서 status가 `completed`로 변경될 때 |
| **트리거 파일** | `src/app/api/agent-dashboard/background/[taskId]/route.ts` |
| **수신처** | 해당 팀 채널만 |
| **CEO DM** | X |
| **우선순위** | `normal` |

---

## 3. 채널 매핑 상세

### 3.1 채널 목록

| 채널 | Slack 채널명 | 용도 | 환경변수 |
|------|-------------|------|----------|
| PM팀 채널 | `#agent-pm` | PM팀 이벤트 수신 | `SLACK_CHANNEL_PM` |
| CTO팀 채널 | `#agent-cto` | CTO팀 이벤트 수신 + 배포 알림 | `SLACK_CHANNEL_CTO` |
| 마케팅팀 채널 | `#agent-marketing` | 마케팅팀 이벤트 수신 | `SLACK_CHANNEL_MARKETING` |
| CEO DM | (User ID) | 중요/긴급 이벤트 DM | `SLACK_CEO_USER_ID` |

### 3.2 이벤트별 라우팅 매트릭스

| 이벤트 | #agent-pm | #agent-cto | #agent-marketing | CEO DM |
|--------|:---------:|:----------:|:----------------:|:------:|
| `task.started` | 발신팀만 | 발신팀만 | 발신팀만 | - |
| `task.completed` | 발신팀만 | 발신팀만 | 발신팀만 | - |
| `chain.handoff` | 관련 시 | 관련 시 | 관련 시 | O |
| `deploy.completed` | - | O | - | O |
| `error.critical` | 발신팀만 | 발신팀만 | 발신팀만 | O |
| `approval.needed` | 발신팀만 | 발신팀만 | 발신팀만 | O |
| `pdca.phase_change` | 발신팀만 | 발신팀만 | 발신팀만 | - |
| `background.completed` | 발신팀만 | 발신팀만 | 발신팀만 | - |

> **"발신팀만"**: `team` 필드에 해당하는 팀 채널에만 전송
> **"관련 시"**: `chain.handoff`는 `team`(발신) + `targetTeam`(수신) 양쪽 채널에 전송
> **"O"**: CEO DM 전송 대상 (`CEO_NOTIFY_EVENTS` 배열에 포함된 이벤트)

### 3.3 채널 결정 로직 (`resolveChannels` 함수)

```
resolveChannels(event, team, targetTeam?)
  1. channels = [CHANNELS[team]]           // 발신 팀 채널
  2. if event === "chain.handoff" && targetTeam:
       channels.push(CHANNELS[targetTeam]) // 수신 팀 채널 추가
  3. return channels.filter(Boolean)       // 빈 문자열 제거
```

### 3.4 환경변수 목록

| 환경변수 | 값 형식 | 필수 | 설명 |
|----------|--------|:----:|------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | O | Slack Bot OAuth Token |
| `SLACK_CHANNEL_PM` | `C07XXXXXX` | O | #agent-pm 채널 ID |
| `SLACK_CHANNEL_CTO` | `C07XXXXXX` | O | #agent-cto 채널 ID |
| `SLACK_CHANNEL_MARKETING` | `C07XXXXXX` | O | #agent-marketing 채널 ID |
| `SLACK_CEO_USER_ID` | `U07XXXXXX` | O | Smith님 Slack User ID (DM 전송용) |

> **주의**: 채널 ID는 채널 이름이 아닌 Slack 내부 ID이다. Slack 앱 > 채널 상세 > 하단에서 확인 가능.

### 3.5 Slack 봇 권한 스코프

| OAuth Scope | 용도 |
|-------------|------|
| `chat:write` | 채널에 메시지 전송 |
| `chat:write.public` | 봇이 참여하지 않은 public 채널에 전송 (초기 설정 편의) |
| `im:write` | CEO DM 전송 |
| `users:read` | User ID 조회 (선택) |

> **Bot Token 생성 절차**: Slack API > Your Apps > OAuth & Permissions > Bot Token Scopes 추가 > Install to Workspace

---

## 4. API 엔드포인트 설계

### 4.1 `POST /api/agent-dashboard/slack/notify`

**파일 위치**: `src/app/api/agent-dashboard/slack/notify/route.ts`

#### 요청 스키마

```typescript
interface SlackNotifyRequest {
  event: SlackEventType;         // 필수. 8개 이벤트 중 하나
  team: TeamId;                  // 필수. 'pm' | 'marketing' | 'cto'
  targetTeam?: TeamId;           // 선택. chain.handoff 시 수신 팀
  title: string;                 // 필수. 알림 제목 (Block Kit header)
  message: string;               // 필수. 상세 내용 (Block Kit section, mrkdwn)
  metadata?: {
    feature?: string;            // PDCA feature 이름
    taskId?: string;             // TASK ID (예: "T1")
    matchRate?: number;          // PDCA match rate (0-100)
    errorMessage?: string;       // error.critical 시 에러 상세
    dashboardUrl?: string;       // 대시보드 링크 (버튼 URL)
  };
}
```

#### 요청 예시

```json
{
  "event": "chain.handoff",
  "team": "pm",
  "targetTeam": "cto",
  "title": "체인 전달: PM팀 → CTO팀",
  "message": "PM팀이 [agent-dashboard] 기획을 완료했습니다. CTO팀 구현 착수가 필요합니다.",
  "metadata": {
    "feature": "agent-dashboard",
    "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
  }
}
```

#### 응답 스키마

**성공 (200)**:
```json
{
  "ok": true,
  "notificationId": "uuid-v4",
  "channelsSent": ["C07PM1234", "C07CTO5678"],
  "ceoNotified": true,
  "sentAt": "2026-03-25T14:30:00+09:00"
}
```

**실패 (400 — 요청 검증 실패)**:
```json
{
  "ok": false,
  "error": "INVALID_EVENT_TYPE",
  "message": "event 필드가 유효하지 않습니다: 'task.unknown'"
}
```

**실패 (401 — 인증 실패)**:
```json
{
  "ok": false,
  "error": "UNAUTHORIZED",
  "message": "admin 권한이 필요합니다"
}
```

**실패 (500 — 전송 실패)**:
```json
{
  "ok": false,
  "error": "SLACK_SEND_FAILED",
  "message": "모든 채널 전송에 실패했습니다",
  "failedChannels": ["C07PM1234"]
}
```

#### 내부 동작 (순서)

```
1. 인증 검증: Supabase Auth → admin 역할 확인
2. 요청 검증: event, team, title, message 필수값 확인
3. SlackNotification 객체 생성:
   - id: crypto.randomUUID()
   - priority: PRIORITY_MAP[event]
   - channels: resolveChannels(event, team, targetTeam)
   - ceoNotify: CEO_NOTIFY_EVENTS.includes(event)
   - status: 'pending'
4. sendSlackNotification() 호출
5. /tmp/cross-team/slack/queue.jsonl에 결과 로깅 (append)
6. 응답 반환
```

#### 인증

기존 Supabase Auth 기반. `src/app/api/admin/_shared.ts`의 `requireAdmin()` 함수 사용.

```typescript
// route.ts 내부
import { requireAdmin } from '@/app/api/admin/_shared';

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED', message: adminCheck.error }, { status: 401 });
  }
  // ... 이하 처리
}
```

#### 요청 검증 규칙

| 필드 | 검증 | 에러 코드 |
|------|------|-----------|
| `event` | 8개 SlackEventType 중 하나 | `INVALID_EVENT_TYPE` |
| `team` | `'pm' \| 'marketing' \| 'cto'` | `INVALID_TEAM` |
| `title` | 비어있지 않은 문자열, 최대 200자 | `INVALID_TITLE` |
| `message` | 비어있지 않은 문자열, 최대 3000자 | `INVALID_MESSAGE` |
| `targetTeam` | chain.handoff일 때 필수, team과 동일하면 안 됨 | `MISSING_TARGET_TEAM` |

#### Rate Limit 대응

Slack API는 채널당 1 message/second 제한이 있다. 이 엔드포인트 자체에는 Rate Limit을 두지 않지만, `sendSlackNotification` 내부에서 429 응답을 처리한다 (섹션 7 참조).

---

## 5. Block Kit 메시지 포맷

### 5.1 공통 구조

모든 이벤트의 Block Kit 메시지는 다음 구조를 따른다:

```
[header] — 이모지 + 제목
[section] — 상세 메시지 (mrkdwn)
[context] — (선택) Feature명, Match Rate 등 메타데이터
[actions] — (선택) "대시보드에서 보기" 버튼
```

### 5.2 `task.started`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚀 CTO팀 작업 시작: T1 Supabase 타입 재생성",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "담당: backend-dev\n예상 소요: 30분"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "CTO팀 작업 시작: T1 Supabase 타입 재생성"
}
```

### 5.3 `task.completed`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "✅ CTO팀 작업 완료: T1 Supabase 타입 재생성",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "담당: backend-dev\n완료 시간: 2026-03-25 14:30 KST"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        },
        {
          "type": "mrkdwn",
          "text": "📊 Match Rate: *95%*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "CTO팀 작업 완료: T1 Supabase 타입 재생성"
}
```

### 5.4 `chain.handoff`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔗 체인 전달: PM팀 → CTO팀",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "PM팀이 [agent-dashboard] 기획을 완료했습니다.\nCTO팀 구현 착수가 필요합니다."
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*발신 팀:*\nPM팀 (📋)"
        },
        {
          "type": "mrkdwn",
          "text": "*수신 팀:*\nCTO팀 (⚙️)"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "체인 전달: PM팀 → CTO팀"
}
```

### 5.5 `deploy.completed`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚢 배포 완료: bscamp v2.4.0",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Vercel 배포가 성공적으로 완료되었습니다.\n환경: Production"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "배포 완료: bscamp v2.4.0"
}
```

### 5.6 `error.critical`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚨 빌드 실패: CTO팀",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*에러 내용:*\n```\nType error: Property 'embedding' does not exist on type 'KnowledgeChunk'\n```\n담당: backend-dev"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "danger"
        }
      ]
    }
  ],
  "text": "[긴급] 빌드 실패: CTO팀"
}
```

> **주의**: `error.critical`은 버튼 스타일이 `"danger"` (빨간색)이다. 다른 이벤트는 `"primary"` (파란색).

### 5.7 `approval.needed`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔔 승인 필요: PM팀 Plan 문서",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "PM팀이 [slack-notification] Plan 문서를 작성했습니다.\nSmith님 승인이 필요합니다."
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *slack-notification*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "승인 필요: PM팀 Plan 문서"
}
```

### 5.8 `pdca.phase_change`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📊 PDCA 단계 전환: designing → implementing",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Feature *agent-dashboard*의 PDCA 단계가 전환되었습니다.\n이전: designing → 현재: implementing"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-dashboard*"
        },
        {
          "type": "mrkdwn",
          "text": "📊 Match Rate: *0%*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "PDCA 단계 전환: designing → implementing"
}
```

### 5.9 `background.completed`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⏳ 백그라운드 작업 완료: backfill 90일",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📦 backfill 90일 작업이 완료되었습니다.\n처리: 3,096/3,096건"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *protractor-backfill*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 보기",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "백그라운드 작업 완료: backfill 90일"
}
```

### 5.10 이벤트별 스타일 요약

| 이벤트 | 이모지 | 버튼 스타일 | 색상 의미 |
|--------|:------:|:-----------:|-----------|
| `task.started` | :rocket: | `primary` (파란) | 일반 |
| `task.completed` | :white_check_mark: | `primary` (파란) | 일반 |
| `chain.handoff` | :link: | `primary` (파란) | 중요 |
| `deploy.completed` | :ship: | `primary` (파란) | 중요 |
| `error.critical` | :rotating_light: | `danger` (빨간) | 긴급 |
| `approval.needed` | :bell: | `primary` (파란) | 중요 |
| `pdca.phase_change` | :bar_chart: | `primary` (파란) | 일반 |
| `background.completed` | :hourglass_flowing_sand: | `primary` (파란) | 일반 |

---

## 6. 에러 핸들링

### 6.1 SLACK_BOT_TOKEN 미설정

```typescript
if (!process.env.SLACK_BOT_TOKEN) {
  console.warn("[slack-notifier] SLACK_BOT_TOKEN 미설정, 알림 건너뜀");
  return; // 크래시 없이 조용히 종료
}
```

- **동작**: 로그만 남기고 정상 반환. 애플리케이션 크래시 안 함.
- **이유**: 로컬 개발 환경에서는 Slack 토큰이 없을 수 있음. 이때 빌드/런타임 에러가 발생하면 안 됨.
- **현재 구현 상태**: `slack-notifier.ts` 120~123줄에 이미 구현됨.

### 6.2 채널 전송 실패 재시도 전략

```
재시도 전략: Exponential Backoff (최대 3회)

1차 시도: 즉시
2차 시도: 1초 후
3차 시도: 3초 후 (1초 * 3)
4차 시도 없음: 실패 로깅 + 큐에 기록
```

**구현 의사 코드**:

```typescript
async function sendWithRetry(
  channelId: string,
  blocks: Block[],
  text: string,
  maxRetries = 3
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await slack.chat.postMessage({ channel: channelId, blocks, text });
      return { ok: true };
    } catch (err: unknown) {
      const slackErr = err as { data?: { error?: string }; status?: number };

      // Rate Limit (429) → Retry-After 헤더 기반 대기
      if (slackErr.status === 429) {
        const retryAfter = (slackErr as { headers?: { 'retry-after'?: string } })
          .headers?.['retry-after'];
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : attempt * 2;
        await sleep(waitSec * 1000);
        continue;
      }

      // channel_not_found, invalid_auth 등 → 재시도 무의미
      if (['channel_not_found', 'invalid_auth', 'not_authed', 'token_revoked']
        .includes(slackErr.data?.error ?? '')) {
        console.error(`[slack-notifier] 채널 ${channelId} 복구 불가: ${slackErr.data?.error}`);
        return { ok: false, error: slackErr.data?.error };
      }

      // 기타 에러 → backoff 후 재시도
      if (attempt < maxRetries) {
        await sleep(Math.pow(3, attempt - 1) * 1000); // 1초, 3초
      }
    }
  }
  console.error(`[slack-notifier] 채널 ${channelId} 전송 실패 (${maxRetries}회 재시도 소진)`);
  return { ok: false, error: 'MAX_RETRIES_EXCEEDED' };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 6.3 Rate Limit (429) 응답 처리

Slack API가 429를 반환하면:

1. `Retry-After` 헤더 값(초) 만큼 대기
2. 헤더가 없으면 `attempt * 2`초 대기
3. 재시도 횟수 내에서 반복
4. Rate Limit이 지속되면 큐에 적재 후 배치 전송 (섹션 7 참조)

### 6.4 CEO DM 실패 시 Fallback

```
CEO DM 전송 실패 시:
1. console.error 로깅 (현재 구현과 동일)
2. /tmp/cross-team/slack/queue.jsonl에 실패 기록
3. 에이전트 대시보드의 CommLog에 "[알림 실패] CEO DM 전송 실패: {title}" 항목 추가
4. 다음 정상 전송 시 미전송 DM 재시도 (큐에서 읽기)
```

> **주의**: DM 실패가 채널 전송에 영향을 주어서는 안 된다. 채널 전송과 DM 전송은 독립적으로 처리.

### 6.5 에러 코드 정리

| 에러 코드 | HTTP | 원인 | 대응 |
|-----------|:----:|------|------|
| `UNAUTHORIZED` | 401 | admin 아닌 사용자 | 로그인 확인 |
| `INVALID_EVENT_TYPE` | 400 | event 필드 잘못됨 | 요청 수정 |
| `INVALID_TEAM` | 400 | team 필드 잘못됨 | 요청 수정 |
| `INVALID_TITLE` | 400 | title 비어있음/초과 | 요청 수정 |
| `INVALID_MESSAGE` | 400 | message 비어있음/초과 | 요청 수정 |
| `MISSING_TARGET_TEAM` | 400 | chain.handoff인데 targetTeam 없음 | targetTeam 추가 |
| `SLACK_TOKEN_MISSING` | 503 | SLACK_BOT_TOKEN 환경변수 없음 | 환경변수 설정 |
| `SLACK_SEND_FAILED` | 500 | 모든 채널 전송 실패 | 토큰/채널ID 확인 |
| `PARTIAL_SEND_FAILURE` | 207 | 일부 채널만 전송 성공 | 실패 채널 확인 |

---

## 7. Rate Limit 전략

### 7.1 Slack API 제한

- **채널당**: 1 message per second
- **Workspace당**: Tier 별로 다르지만 일반적으로 1msg/sec/channel
- **응답**: 429 Too Many Requests + `Retry-After` 헤더

### 7.2 이벤트 큐잉

동시 다발적 이벤트 발생 시 (예: 여러 TASK가 동시 완료) 직접 전송하면 Rate Limit에 걸릴 수 있다.

**큐 파일**: `/tmp/cross-team/slack/queue.jsonl`

**큐 항목 포맷**:
```json
{
  "id": "uuid-v4",
  "event": "task.completed",
  "team": "cto",
  "channels": ["C07CTO5678"],
  "blocks": [...],
  "text": "CTO팀 작업 완료: T1",
  "ceoNotify": false,
  "queuedAt": "2026-03-25T14:30:00+09:00",
  "status": "queued",
  "retryCount": 0
}
```

### 7.3 배치 전송 전략

```
큐잉 규칙:
1. sendSlackNotification()에서 429 응답 수신 시 → 큐에 적재
2. 5초 간격으로 큐 소비 (채널별 1msg/5sec — 여유 있는 간격)
3. 같은 채널 + 5초 이내 이벤트 → 단일 메시지로 병합

병합 규칙:
- 동일 채널에 5초 내 여러 task.completed 발생 시:
  → header: "✅ CTO팀 작업 완료 (3건)"
  → section: 각 TASK를 bullet으로 나열
- 이벤트 타입이 다르면 병합하지 않음 (별도 메시지)
```

**병합 예시**:
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "✅ CTO팀 작업 완료 (3건)",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "• T1: Supabase 타입 재생성\n• T2: API 엔드포인트 구현\n• T3: 빌드 검증"
      }
    }
  ]
}
```

### 7.4 큐 소비 흐름

```
큐 소비자 (process-slack-queue):
1. /tmp/cross-team/slack/queue.jsonl 읽기
2. 채널별로 그룹핑
3. 채널당 5초 간격으로 전송
4. 성공 시 큐에서 제거 (status: "sent")
5. 실패 시 retryCount++ (3회 초과 시 status: "failed")
```

> **구현 방식**: API route에서 직접 구현하거나, cron job (`/api/cron/process-slack-queue`)으로 30초 간격 실행.
> 현재 Phase 1에서는 직접 전송 + 429 시 큐잉이 가장 단순.

---

## 8. Hook 트리거 설계

### 8.1 TaskCompleted Hook 동작

**파일**: `.claude/hooks/agent-slack-notify.sh`

**트리거**: Claude Code의 `TaskCompleted` 이벤트 (팀원이 작업을 완료할 때마다 자동 실행)

### 8.2 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `AGENT_TEAM` | `cto` | 현재 팀 식별자 (`pm` \| `marketing` \| `cto`) |

### 8.3 stdin JSON 포맷

Claude Code가 hook에 전달하는 stdin JSON:

```json
{
  "hook_type": "TaskCompleted",
  "task": {
    "subject": "T1: Supabase 타입 재생성",
    "status": "completed",
    "agent": "backend-dev"
  },
  "session": {
    "id": "session-uuid",
    "model": "claude-opus-4-6"
  }
}
```

### 8.4 동작 흐름

```
agent-slack-notify.sh 실행 흐름:

1. stdin에서 EVENT_DATA 읽기 (cat)
2. AGENT_TEAM 환경변수로 팀 식별 (기본값: "cto")
3. 팀 이름 매핑 (pm→PM팀, marketing→마케팅팀, cto→CTO팀)
4. EVENT_DATA에서 task.subject 추출 (python3 json 파싱)
5. task.completed 알림 전송:
   POST /api/agent-dashboard/slack/notify
   {
     event: "task.completed",
     team: AGENT_TEAM,
     title: "{팀이름} 작업 완료: {task.subject}",
     message: "{팀이름} 에이전트가 작업을 완료했습니다."
   }
6. 모든 TASK 완료 여부 확인:
   /tmp/cross-team/{team}/state.json 읽기
   모든 task.status === "done"이면 ALL_DONE=true
7. ALL_DONE이면 체인 전달 알림 전송:
   POST /api/agent-dashboard/slack/notify
   {
     event: "chain.handoff",
     team: AGENT_TEAM,
     title: "체인 전달: {팀이름} 전체 작업 완료",
     message: "{팀이름}의 모든 TASK가 완료되었습니다. 다음 팀으로 전달합니다."
   }
8. exit 0 (항상 성공 반환 — hook 실패가 작업을 막으면 안 됨)
```

### 8.5 체인 전달 판단 로직

hook 스크립트에서의 체인 판단은 **단순화된 버전**이다:

```
Hook 내부 (bash):
  - 모든 TASK done → chain.handoff 전송
  - targetTeam 결정은 API 서버 측에서 처리 (chain-detector.ts)

API 서버 내부 (TypeScript):
  - chain.handoff 이벤트 수신
  - detectChainHandoff(team, event) 호출
  - ChainRule 매칭 시 → 양쪽 팀 채널에 전송
  - 매칭 없으면 → 발신 팀 채널에만 전송
```

### 8.6 인증 (Hook → API)

현재 hook은 `localhost:3000`에 직접 요청한다. Cookie 기반 인증:

```bash
-H "Cookie: __session=$(cat /tmp/bscamp-session-cookie 2>/dev/null || echo '')"
```

- `/tmp/bscamp-session-cookie`에 admin 세션 쿠키를 사전 저장 필요
- 쿠키가 없거나 만료된 경우 → API가 401 반환 → hook은 에러를 무시하고 exit 0

> **개선 제안**: 내부 호출용 API Key (`X-Internal-Key` 헤더)를 별도로 두면 세션 쿠키 의존성을 제거할 수 있다. 환경변수 `INTERNAL_API_KEY`로 관리.

---

## 9. 구현 순서 (CTO팀용 체크리스트)

### 9.1 의존성 설치

```bash
npm install @slack/web-api
```

> **현재 상태**: `package.json`에 이미 추가되어 있는지 확인 필요. `src/lib/slack-notifier.ts`에서 import하고 있으므로 설치 완료 상태일 가능성 높음.

### 9.2 환경변수 설정

`.env.local` (로컬) 및 Vercel 환경변수에 추가:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_PM=C07XXXXXX
SLACK_CHANNEL_CTO=C07XXXXXX
SLACK_CHANNEL_MARKETING=C07XXXXXX
SLACK_CEO_USER_ID=U07XXXXXX
```

### 9.3 타입 확인

`src/types/agent-dashboard.ts`에 이미 정의됨 (변경 불필요):
- [x] `SlackEventType` — 8개 이벤트
- [x] `SlackPriority` — 3단계 우선순위
- [x] `SlackNotification` — 알림 객체
- [x] `SlackChannelConfig` — 채널 설정
- [x] `ChainRule` — 체인 규칙

### 9.4 `slack-notifier.ts` 업데이트 항목

현재 구현에서 추가/수정이 필요한 부분:

| 항목 | 현재 상태 | 필요한 변경 |
|------|-----------|-------------|
| 재시도 로직 | 없음 (단순 try-catch) | `sendWithRetry()` 함수 추가 (섹션 6.2) |
| Rate Limit 처리 | 없음 | 429 응답 시 `Retry-After` 대기 로직 추가 |
| 큐잉 | 없음 | 429 지속 시 `/tmp/cross-team/slack/queue.jsonl` 적재 |
| `chain.handoff` Block Kit | 기본 구조만 | fields 블록 + divider 추가 (섹션 5.4) |
| `error.critical` 전용 처리 | 없음 | `metadata.errorMessage`를 code block으로 렌더링 |
| 메시지 병합 | 없음 | 동일 채널 5초 내 동일 타입 이벤트 병합 (Phase 2) |

### 9.5 API Route 구현 항목

**파일**: `src/app/api/agent-dashboard/slack/notify/route.ts`

```
구현 체크리스트:
[ ] POST 핸들러 생성
[ ] requireAdmin() 인증 추가
[ ] 요청 검증 (event, team, title, message)
[ ] chain.handoff 시 targetTeam 필수 검증
[ ] SlackNotification 객체 생성 (priority, channels, ceoNotify 자동 결정)
[ ] sendSlackNotification() 호출
[ ] /tmp/cross-team/slack/queue.jsonl 로깅
[ ] 성공/실패/부분실패 응답 처리
```

### 9.6 Hook 스크립트 업데이트 항목

**파일**: `.claude/hooks/agent-slack-notify.sh`

현재 구현은 기본 동작이 있지만 아래 개선이 가능:

```
개선 체크리스트:
[ ] 인증 실패 시 재시도 로직 (쿠키 갱신)
[ ] error.critical 이벤트 전송 추가 (빌드 실패 감지 시)
[ ] metadata에 taskId 추가
[ ] 로그 파일 기록 (/tmp/cross-team/slack/hook.log)
```

### 9.7 디렉토리 생성

```bash
mkdir -p /tmp/cross-team/slack
```

> `/tmp/cross-team/` 하위 디렉토리는 에이전트 세션 시작 시 자동 생성되어야 함.

### 9.8 테스트 방법

**1. 수동 테스트 (curl)**:

```bash
# task.completed 알림 테스트
curl -X POST http://localhost:3000/api/agent-dashboard/slack/notify \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -d '{
    "event": "task.completed",
    "team": "cto",
    "title": "CTO팀 작업 완료: T1 테스트",
    "message": "테스트 알림입니다.",
    "metadata": {
      "feature": "test",
      "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
    }
  }'
```

```bash
# chain.handoff 알림 테스트
curl -X POST http://localhost:3000/api/agent-dashboard/slack/notify \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -d '{
    "event": "chain.handoff",
    "team": "pm",
    "targetTeam": "cto",
    "title": "체인 전달: PM팀 → CTO팀",
    "message": "PM팀이 기획을 완료했습니다. CTO팀 구현 착수가 필요합니다.",
    "metadata": {
      "feature": "agent-dashboard",
      "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
    }
  }'
```

```bash
# error.critical 알림 테스트
curl -X POST http://localhost:3000/api/agent-dashboard/slack/notify \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -d '{
    "event": "error.critical",
    "team": "cto",
    "title": "빌드 실패: CTO팀",
    "message": "npm run build 실패\n```\nType error: ...\n```",
    "metadata": {
      "errorMessage": "Type error: Property does not exist",
      "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
    }
  }'
```

**2. Hook 테스트**:

```bash
# TaskCompleted 이벤트 시뮬레이션
echo '{"task":{"subject":"T1: 테스트 작업","status":"completed","agent":"backend-dev"}}' | \
  AGENT_TEAM=cto bash .claude/hooks/agent-slack-notify.sh
```

**3. SLACK_BOT_TOKEN 미설정 테스트**:

```bash
# 토큰 없이 호출 → 에러 없이 조용히 건너뛰는지 확인
unset SLACK_BOT_TOKEN
# API 호출 → 503 SLACK_TOKEN_MISSING 응답 확인
```

### 9.9 구현 우선순위

```
Phase 1 (필수):
  1. API route 생성 (POST /api/agent-dashboard/slack/notify)
  2. 요청 검증 + 인증
  3. sendSlackNotification에 재시도 로직 추가
  4. 8개 이벤트 Block Kit 적용

Phase 2 (개선):
  5. Rate Limit 큐잉 (/tmp/cross-team/slack/queue.jsonl)
  6. 메시지 병합 (동일 채널 + 5초 내 동일 타입)
  7. Hook 스크립트 개선 (에러 이벤트 추가)
  8. 내부 API Key 인증 (Hook→API)
```

---

## 10. Executive Summary

| 항목 | 값 |
|------|-----|
| **이벤트 수** | 8개 |
| **채널 수** | 3개 팀 채널 + CEO DM |
| **의존성** | `@slack/web-api` |
| **환경변수** | 5개 (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_PM`, `SLACK_CHANNEL_CTO`, `SLACK_CHANNEL_MARKETING`, `SLACK_CEO_USER_ID`) |
| **봇 스코프** | `chat:write`, `chat:write.public`, `im:write` |
| **API 엔드포인트** | `POST /api/agent-dashboard/slack/notify` |
| **인증** | Supabase Auth (admin 전용) |
| **Rate Limit 대응** | 429 시 Retry-After 대기 + 큐잉 fallback |
| **재시도** | 최대 3회, exponential backoff (1초, 3초) |
| **큐 파일** | `/tmp/cross-team/slack/queue.jsonl` |
| **Hook** | `.claude/hooks/agent-slack-notify.sh` (TaskCompleted 이벤트) |
| **기존 구현 파일** | `src/lib/slack-notifier.ts`, `src/lib/chain-detector.ts`, `src/types/agent-dashboard.ts` |
| **신규 파일** | `src/app/api/agent-dashboard/slack/notify/route.ts` |
| **업데이트 파일** | `src/lib/slack-notifier.ts` (재시도 + Rate Limit 로직 추가) |
| **Phase 1 소요 예상** | 2~3시간 |
| **Phase 2 소요 예상** | 1~2시간 |

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `resolveChannels('task.started', 'cto', undefined)` | event='task.started', team='cto' | `['C07CTO5678']` | 발신 팀 채널만 반환 |
| `resolveChannels('chain.handoff', 'pm', 'cto')` | event='chain.handoff', team='pm', targetTeam='cto' | `['C07PM1234', 'C07CTO5678']` | 발신+수신 양쪽 채널 |
| `resolveChannels('deploy.completed', 'cto', undefined)` | event='deploy.completed', team='cto' | `['C07CTO5678']` | 배포 알림은 CTO 채널 |
| `buildSlackBlocks('task.started', payload)` | 8개 이벤트 타입 중 task.started | `{ blocks: [{header}, {section}, {context}, {actions}] }` | Block Kit 구조 정합성 |
| `buildSlackBlocks('error.critical', payload)` | error.critical 이벤트 | header 이모지 + 에러 상세 section 포함 | 긴급 이벤트 포맷 |
| `detectChainHandoff(fromTeam, fromEvent)` | pm + plan.completed | `{ toTeam: 'cto', toAction: '구현 착수 필요' }` | 체인 규칙 매칭 |
| `detectChainHandoff(fromTeam, fromEvent)` | 매칭 규칙 없는 조합 | `null` | 미매칭 시 null 반환 |
| `sendSlackNotification(notification)` | 유효한 SlackNotification | `{ ok: true, channelsSent: [...] }` | Slack API 전송 성공 |
| CEO_NOTIFY_EVENTS 체크 | event='chain.handoff' | `true` | CEO DM 대상 이벤트 |
| CEO_NOTIFY_EVENTS 체크 | event='task.started' | `false` | CEO DM 비대상 이벤트 |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | SLACK_BOT_TOKEN 미설정 | 환경변수 없음 | 전송 실패 로그 + 500 반환 | P0 |
| E2 | 잘못된 event 타입 | `event: "task.unknown"` | 400 + `INVALID_EVENT_TYPE` | P0 |
| E3 | chain.handoff에 targetTeam 누락 | `event: "chain.handoff", targetTeam: undefined` | 400 + `MISSING_TARGET_TEAM` | P0 |
| E4 | team과 targetTeam 동일 | `team: "pm", targetTeam: "pm"` | 400 + `MISSING_TARGET_TEAM` (자기 자신에게 handoff 불가) | P1 |
| E5 | Slack API Rate Limit (429) | Slack이 429 반환 | Retry-After 대기 → 재시도 (최대 3회) | P0 |
| E6 | Slack API 네트워크 오류 | fetch 타임아웃 | 3회 재시도 (exponential backoff: 1초, 3초) 후 실패 | P1 |
| E7 | title 200자 초과 | title="A" * 201 | 400 + `INVALID_TITLE` | P1 |
| E8 | message 3000자 초과 | 매우 긴 메시지 | 400 + `INVALID_MESSAGE` | P1 |
| E9 | 인증 실패 (admin 아님) | member 역할 사용자 | 401 + `UNAUTHORIZED` | P0 |
| E10 | 채널 ID 잘못됨 | 존재하지 않는 채널 | 해당 채널만 실패, 다른 채널은 정상 전송 | P1 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: slack_notify_chain_handoff — 체인 전달 요청
{
  "event": "chain.handoff",
  "team": "pm",
  "targetTeam": "cto",
  "title": "체인 전달: PM팀 → CTO팀",
  "message": "PM팀이 [agent-dashboard] 기획을 완료했습니다. CTO팀 구현 착수가 필요합니다.",
  "metadata": {
    "feature": "agent-dashboard",
    "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
  }
}
```

```json
// fixture: slack_notify_error_critical — 빌드 실패 알림
{
  "event": "error.critical",
  "team": "cto",
  "title": "빌드 실패: CTO팀",
  "message": "npm run build 실패: Type error in src/app/api/protractor/route.ts",
  "metadata": {
    "errorMessage": "Type 'string' is not assignable to type 'number'",
    "taskId": "T3"
  }
}
```

```json
// fixture: slack_notify_success_response — 성공 응답
{
  "ok": true,
  "notificationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "channelsSent": ["C07PM1234", "C07CTO5678"],
  "ceoNotified": true,
  "sentAt": "2026-03-25T14:30:00+09:00"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `slack-notifier.ts` (전송 + 재시도) | `__tests__/slack-notification/slack-notifier.test.ts` | vitest |
| `chain-detector.ts` (체인 규칙) | `__tests__/slack-notification/chain-detector.test.ts` | vitest |
| Block Kit 메시지 빌더 | `__tests__/slack-notification/block-kit-builder.test.ts` | vitest |
| `resolveChannels` 함수 | `__tests__/slack-notification/resolve-channels.test.ts` | vitest |
| API Route (`/api/agent-dashboard/slack/notify`) | `__tests__/slack-notification/notify-route.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| 체인 전달 알림 전송 | POST | `/api/agent-dashboard/slack/notify` | `{ event: "chain.handoff", team: "pm", targetTeam: "cto", title: "...", message: "..." }` | `{ ok: true, channelsSent: 2개, ceoNotified: true }` | 200 |
| 작업 시작 알림 | POST | `/api/agent-dashboard/slack/notify` | `{ event: "task.started", team: "cto", title: "...", message: "..." }` | `{ ok: true, channelsSent: 1개, ceoNotified: false }` | 200 |
| 빌드 실패 알림 (긴급) | POST | `/api/agent-dashboard/slack/notify` | `{ event: "error.critical", team: "cto", ... }` | `{ ok: true, ceoNotified: true }` | 200 |
| 잘못된 이벤트 타입 | POST | `/api/agent-dashboard/slack/notify` | `{ event: "invalid", team: "pm", title: "...", message: "..." }` | `{ ok: false, error: "INVALID_EVENT_TYPE" }` | 400 |
| targetTeam 누락 (handoff) | POST | `/api/agent-dashboard/slack/notify` | `{ event: "chain.handoff", team: "pm", title: "...", message: "..." }` | `{ ok: false, error: "MISSING_TARGET_TEAM" }` | 400 |
| 인증 실패 | POST | `/api/agent-dashboard/slack/notify` | (admin 아닌 사용자) | `{ ok: false, error: "UNAUTHORIZED" }` | 401 |
