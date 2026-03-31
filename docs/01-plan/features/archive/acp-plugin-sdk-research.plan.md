# ACP + Plugin SDK 조사 보고서 (Plan)

> 작성일: 2026-03-29
> 프로세스 레벨: L1 (리서치, src/ 수정 없음)
> 작성자: PM

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | OpenClaw ACP + Plugin SDK 실전 적용 가능성 조사 |
| **작성일** | 2026-03-29 |
| **범위** | ACP 프로토콜 분석 + Plugin SDK 구조 분석 + neuron-guardian 코드 리뷰 + 우리 구조 적용 판단 |
| **산출물** | 이 문서 (L1 리서치 결과) |

| 관점 | 내용 |
|------|------|
| **Problem** | tmux Agent Teams가 CC 멈춤/좀비 문제 반복 + L1 자동 보고 안 됨 + bash hook 한계 |
| **Solution** | ACP로 CC 감독 가능성 검토 + Plugin SDK로 hook 대체 가능성 검토 |
| **Core Value** | Agent Ops Platform 안정성+확장성 판단 근거 확보 |

---

## 조사 1: OpenClaw ACP (Agent Client Protocol)

### 1-1. ACP가 뭔지

OpenClaw 게이트웨이가 CC(Claude Code)를 **자식 프로세스**로 spawn하고 관리하는 프로토콜.

```
OpenClaw Gateway → acpx 플러그인 → child_process.spawn("acpx") → CC 세션
                                    ↑
                                    stdio: pipe (stdin/stdout/stderr)
```

**핵심 인터페이스 (`AcpRuntime`):**
- `ensureSession()` — 세션 생성 (이미 있으면 재사용, 죽었으면 새로 생성)
- `runTurn()` — 프롬프트 전송 + 스트리밍 응답 수신
- `cancel()` — 실행 중 취소
- `close()` — 세션 종료
- `doctor()` — 헬스체크

**파일 위치:**
- acpx 플러그인: `/opt/homebrew/lib/node_modules/openclaw/dist/extensions/acpx/index.js` (1794줄)
- ACP 타입: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/src/acp/runtime/types.d.ts`
- 문서: `/opt/homebrew/lib/node_modules/openclaw/docs/cli/acp.md`, `docs/tools/acp-agents.md`

### 1-2. CC 멈추면 자동 감지+취소+재시작 가능한지

**가능하다. 단, 조건부.**

| 기능 | 지원 여부 | 상세 |
|------|----------|------|
| **멈춤 감지** | O | `healthy()` 프로브 + observability snapshot (활성 세션/큐/에러 추적) |
| **취소** | O | `cancel(sessionId)` → `acpx cancel --session <name>` |
| **재시작** | O | `ensureSession()` — 죽은 세션 감지 시 `acpx sessions new` 자동 호출 |
| **자동 워치독** | △ | 내장 워치독 없음. Plugin의 `subagent_ended` hook에서 outcome 확인 + 재spawn 로직 직접 구현 필요 |
| **세션 이력 복구** | O | `resumeSessionId`로 이전 대화 이어가기 가능 |
| **타임아웃** | O | `timeoutSeconds` 설정 가능 |

**관찰 스냅샷 (`AcpManagerObservabilitySnapshot`):**
```typescript
{
  runtimeCache: { activeSessions, idleTtlMs, evictedTotal },
  turns: { active, queueDepth, completed, failed, averageLatencyMs },
  errorsByCode: { ACP_SESSION_INIT_FAILED: 3, ACP_TURN_FAILED: 1 }
}
```

**내 판단**: 워치독은 없지만, `subagent_ended` + `ensureSession` 조합으로 **Plugin에서 직접 구현 가능**. neuron-guardian이 이미 이 패턴 사용 중 (BUSY 파일 + 자동 해제).

### 1-3. tmux Agent Teams → ACP 전환 가능한지

**전환 가능하지만, 아키텍처가 근본적으로 다르다.**

| 항목 | 현재 (tmux Agent Teams) | ACP 전환 시 |
|------|------------------------|-------------|
| **구조** | CC 네이티브 TeamCreate/TeamDelete | OpenClaw Gateway → acpx → CC 세션들 |
| **팀원 관리** | CC 내부 (shared task list, split pane) | Gateway 레벨에서 세션 pool 관리 |
| **통신** | CC 내부 메시지 (팀원 간 직접) | Gateway 중계 또는 claude-peers MCP |
| **모니터링** | tmux pane 직접 확인 | observability snapshot + 로그 |
| **장애 복구** | 수동 (TeamDelete + 재생성) | 자동 (ensureSession + resume) |
| **디버깅** | tmux pane 바로 보임 | streamLogPath JSONL 로그 확인 |
| **설정 전파** | 자동 (같은 cwd 공유) | cwd 명시 필요, OPENCLAW_SHELL=acp 자동 설정 |

**핵심 차이**: Agent Teams는 CC 프로세스 **내부**에서 팀원을 관리. ACP는 CC 프로세스 **외부**에서 CC를 관리.

**내 판단**: **완전 전환은 시기상조.** 이유:
1. Agent Teams의 shared task list + 팀원 간 직접 통신은 ACP에 없음 → 직접 구현 필요
2. tmux split pane 실시간 모니터링 UX를 ACP가 대체 못 함
3. 우리 hooks/CLAUDE.md 체계가 CC 내부에서 동작 → ACP 레이어와 이중 관리 발생
4. **하이브리드가 현실적**: ACP로 CC 세션 감독(워치독) + 내부는 기존 Agent Teams 유지

### 1-4. hooks/CLAUDE.md/settings.local.json이 ACP에서 동작하는지

**동작한다.**

| 설정 | ACP에서 동작 | 이유 |
|------|------------|------|
| `CLAUDE.md` | O | CC가 cwd 기준으로 읽음. ACP spawn 시 `cwd` 파라미터 전달 |
| `.claude/settings.local.json` | O | CC 프로젝트 디렉토리에서 자동 로드 |
| hooks (PreToolUse 등) | O | CC 내부 hook 시스템 — ACP 레이어와 독립 |
| `bypassPermissions` | △ | ACP는 자체 `permissionMode` 있음 (`approve-all/approve-reads/deny-all`). CC의 bypassPermissions와 별개 |

**주의점**: ACP의 `nonInteractivePermissions: "fail"` (기본값)은 인터랙티브 프롬프트 필요 시 세션 종료. 우리는 `bypassPermissions` 쓰므로 CC 레벨에서 처리됨 → 문제 없음.

### 1-5. PM+CTO 2팀에서 ACP 적용 시 장단점

| | 장점 | 단점 |
|---|------|------|
| **안정성** | CC 멈춤 자동 감지+재시작, 좀비 세션 자동 정리 | OpenClaw Gateway 자체가 SPOF |
| **가시성** | 중앙집중 로그, 에러 코드별 통계, 턴 지연시간 추적 | tmux 실시간 모니터링 UX 없음 |
| **확장성** | `maxConcurrentSessions`로 세션 풀 관리, 새 팀 쉽게 추가 | Plugin 개발+유지보수 비용 |
| **자동화** | Plugin hook으로 팀 간 핸드오프 자동화 가능 | 기존 bash hook + ACP Plugin 이중 관리 |
| **복잡도** | — | 아키텍처 레이어 추가 (CC + OpenClaw + acpx) |

**내 판단**: 지금 당장은 **ROI가 안 맞음**. 이유:
- 우리 Agent Teams 좀비 문제는 `force-team-kill.sh` + `auto-team-cleanup.sh`로 이미 해결됨 (agent-team-operations 완료, Match Rate 97%)
- ACP 전환은 OpenClaw Gateway 의존성 추가 → 장애 포인트 증가
- **언제 전환하나**: CC Agent Teams 자체에 구조적 한계가 오면 (세션 10개+ 동시, 교차 리포 작업 등)

### 1-6. 실전 적용 사례 + 레퍼런스

| 사례 | 용도 | 참고 |
|------|------|------|
| **neuron-guardian** (우리) | Qwen3 분류 → 4개 뇌(casual/analyst/strategist/executor) → 체인 오케스트레이션 | `~/.openclaw/extensions/neuron-guardian/index.ts` (39KB) |
| **OpenClaw 내장 acpx** | CC/Codex를 ACP 세션으로 spawn, Discord/Slack/Telegram 스레드 바인딩 | `/opt/homebrew/lib/node_modules/openclaw/dist/extensions/acpx/` |
| **채널 플러그인들** | Slack/Discord/Telegram 메시지 → ACP 세션 자동 생성 → CC 응답 → 채널 전달 | `~/.openclaw/chrome-extension/{slack,discord,telegram}/` |
| **thread binding** | Discord/Telegram 스레드에 ACP 세션 바인딩 → 대화 유지 | `threadBindings.spawnAcpSessions: true` |

**ACP 공식 프로토콜**: https://agentclientprotocol.com/

---

## 조사 2: OpenClaw Plugin SDK

### 2-1. 커스텀 플러그인으로 뭘 할 수 있는지

**Plugin SDK는 25개 hook + 12개 등록 API로 거의 모든 걸 할 수 있다.**

| 카테고리 | 할 수 있는 것 |
|----------|-------------|
| **도구 추가** | `registerTool()` — CC에 커스텀 도구 주입 (memory_search, memory_get 패턴) |
| **메시지 처리** | `message_received` / `message_sending` hook — 수신/발신 필터링+수정+차단 |
| **채널 어댑터** | `registerChannel()` — Slack, Discord, Telegram 등 메시징 플랫폼 연결 |
| **모델 오버라이드** | `before_model_resolve` hook — 요청별 모델/프로바이더 동적 변경 |
| **컨텍스트 주입** | `before_prompt_build` hook — 시스템 프롬프트에 메모리/상태 주입 |
| **서브에이전트 제어** | `subagent_spawning/spawned/ended` hooks — spawn 차단, 결과 수집, 체인 연결 |
| **HTTP 엔드포인트** | `registerHttpRoute()` — 외부 API 노출 |
| **CLI 명령어** | `registerCli()` — 커스텀 CLI 추가 |
| **메모리 시스템** | `registerMemoryPromptSection()` — 자체 메모리 프레임워크 |
| **컨텍스트 압축** | `registerContextEngine()` — 커스텀 compaction 로직 |

**등록 API 전체:**
```
registerTool, registerHook, registerHttpRoute, registerChannel,
registerGatewayMethod, registerCli, registerService, registerProvider,
registerSpeechProvider, registerMediaUnderstandingProvider,
registerImageGenerationProvider, registerWebSearchProvider,
registerCommand, registerContextEngine, registerMemoryPromptSection
```

### 2-2. neuron-guardian 플러그인 분석

**위치**: `~/.openclaw/extensions/neuron-guardian/index.ts` (39KB)
**버전**: v6.0 (코드에는 v5.0 표기지만 실질 v6 수준 기능)

**하는 일**: 사용자 메시지를 Qwen3(14B, Ollama)로 분류 → 적절한 "뇌" 에이전트에 라우팅 → 체인 오케스트레이션 → 결과 저장+임베딩.

| Hook | 역할 |
|------|------|
| `message_sending` | 라우터 텍스트 전면 차단 + 내부 용어(analyst, executor 등) 필터링 |
| `subagent_spawning` | BUSY 상태 확인 (15분 쿨다운) + task 캐시 저장 |
| `subagent_spawned` | BUSY 기록 + Supabase 라우팅 로그 + [CHAIN:XX] 태그 감지 → chain-state.json 생성 |
| `subagent_ended` | BUSY 해제 + 결과 추출(getSessionMessages) + 체인 자동 연결 + 메모리 저장 + BGE-M3 임베딩 |
| `before_prompt_build` | 라우터: Qwen3 분류 → [ROUTE:X] 태그 주입. 뇌: 임베딩 유사도 검색 → 컨텍스트 주입 |
| `message_received` | BUSY 아닌 경우 직접 spawn (라우터 LLM 우회) |

**체인 패턴:**
```
AS  = analyst → strategist (리서치 → 기획)
SE  = strategist → executor (기획 → 구현)
ASE = analyst → strategist → executor (풀 파이프라인)
```

**우리 PDCA 체인과의 유사점:**
- neuron-guardian: A→S→E (분석→전략→실행)
- 우리 PDCA: Plan→Design→Do→Check→Act
- 둘 다 "이전 단계 결과를 다음 단계에 전달"하는 체인 구조

**Supabase 테이블 4개:**
- `neuron_routing_log` — 라우팅 기록
- `neuron_chain_log` — 체인 진행 기록
- `neuron_embeddings` — BGE-M3 벡터 (1024차원)
- `neuron_memory_log` — 메모리 기록

### 2-3. 3.22-beta plugin-sdk/ 리뉴얼 내용

**현재 설치 버전**: `2026.3.24` (3.22-beta 이후 정식)

| 항목 | 변경 |
|------|------|
| **타입 정의 완성** | plugin-sdk/src/ 하위에 acp/, config/, plugin-sdk/ 3개 서브 디렉토리 분리 |
| **ACP Runtime 통합** | AcpRuntime, AcpRuntimeHandle, AcpRuntimeEvent 타입 풀셋 제공 |
| **Control Plane** | AcpManagerObservabilitySnapshot — 중앙 관제 데이터 타입 |
| **25개 Hook 확정** | before_model_resolve ~ gateway_stop까지 전체 라이프사이클 커버 |
| **Subagent API** | `api.runtime.subagent.run()`, `getSessionMessages()` — Plugin에서 직접 서브에이전트 실행+결과 읽기 |
| **스트리밍 이벤트** | text_delta, agent_thought_chunk, tool_call, tool_call_update, status, done, error |
| **세션 모드** | persistent/oneshot + prompt/steer 모드 분리 |

**SDK 위치**: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/`

### 2-4. Agent Ops Platform에 Plugin 적용하면 뭐가 좋아지는지

**현재 bash hook 한계:**

| 문제 | 현재 (bash) | Plugin (TypeScript) |
|------|-------------|---------------------|
| **타입 안전성** | 없음 (문자열 파싱) | 완전한 TypeScript 타입 |
| **에러 처리** | exit code + stderr | try/catch + 구조화된 에러 |
| **비동기** | 불가 (동기 실행) | async/await 네이티브 |
| **DB 접근** | curl + jq (취약) | fetch + JSON 네이티브 |
| **상태 관리** | 파일 기반 (/.pdca-status.json) | 메모리 + 파일 + Supabase 혼합 |
| **테스트** | bash 테스트 (vitest로 간접) | vitest 직접 + mock 용이 |
| **체인 연결** | stdout 파싱 + MCP send_message | `api.runtime.subagent.run()` 직접 호출 |
| **로깅** | echo/console | `api.logger.info()` 구조화 로깅 |

**Plugin으로 바꾸면 얻는 것:**

1. **PDCA 상태 관리 통합** — pdca-update.sh + pdca-sync-monitor.sh + pdca-chain-handoff.sh를 하나의 Plugin으로 통합. 파일 파싱 대신 타입 안전한 상태 객체.
2. **자동 보고 확실히 동작** — `subagent_ended` hook에서 결과 추출 + 직접 메시지 전송. bash hook 체인에서 중간에 exit 2로 끊기는 문제 원천 제거.
3. **팀 간 핸드오프 자동화** — CTO 완료 → Plugin이 감지 → PM에게 자동 전달. 현재 pdca-chain-handoff.sh의 curl + MCP 복잡 로직 단순화.
4. **관제 대시보드 데이터** — observability snapshot을 agent-ops-dashboard에 직접 공급.

**내 판단**: **점진적 마이그레이션이 답.**
- 즉시: L1 자동 보고 문제는 bash hook으로 이미 해결 중 (video-pipeline-dedup-fix Design의 task-quality-gate v3 + pdca-chain-handoff v3)
- 중기: PDCA 상태 관리를 Plugin으로 통합 (pdca-guardian 플러그인)
- 장기: bash hook 전체를 Plugin으로 전환

### 2-5. 자동 보고 안 오는 문제를 Plugin으로 해결할 수 있는지

**해결할 수 있다. 그러나 현재 구조에서는 과잉.**

#### Plugin 접근 방식 (가능하지만 현재 불필요)

```
OpenClaw Gateway
  └─ pdca-guardian 플러그인
       ├─ subagent_ended hook → CC 세션 완료 감지
       ├─ 결과 추출 (getSessionMessages)
       ├─ L0/L1/L2/L3 자동 판별
       └─ MOZZI/PM에게 직접 전달 (api.runtime.subagent.run)
```

**이 방식의 전제 조건:**
1. CC가 OpenClaw ACP 세션으로 실행되어야 함 → 현재 tmux 직접 실행과 충돌
2. 모든 팀(PM, CTO)이 Gateway 경유로 전환해야 함
3. neuron-guardian과 공존 설계 필요

#### 현재 접근 방식 (bash hook, 이미 설계 완료)

```
CC (tmux 세션)
  └─ TaskCompleted hook 체인
       ├─ task-quality-gate.sh v3 → L0 스킵, L1 산출물만 확인 (비차단)
       ├─ pdca-chain-handoff.sh v3 → L1 ANALYSIS_REPORT → MOZZI
       └─ 기존 L2/L3 → COMPLETION_REPORT → PM
```

**이 방식의 장점:**
- 기존 아키텍처 변경 없음
- video-pipeline-dedup-fix Design에 이미 전체 코드 작성 완료
- TDD 31건 설계 완료
- OpenClaw 의존성 없음

**내 판단**: **지금은 bash hook(v3)으로 충분.** Plugin 전환은 다음 조건에서:
- bash hook이 3개 이상 상호 의존하게 될 때
- 팀이 3개 이상으로 늘어날 때
- OpenClaw Gateway를 상시 기동하게 될 때

---

## 종합 판단

### 지금 당장 할 것 (이번 이터레이션)

| 항목 | 방식 | 이유 |
|------|------|------|
| L1 자동 보고 | bash hook v3 | 이미 설계 완료, 즉시 구현 가능 |
| CC 멈춤 대응 | force-team-kill.sh + auto-team-cleanup.sh | 이미 구현+검증 완료 (97%) |
| 팀 간 핸드오프 | pdca-chain-handoff.sh v3 | 이미 설계 완료 |

### 다음 이터레이션에서 검토할 것

| 항목 | 방식 | 전제 조건 |
|------|------|----------|
| CC 감독 워치독 | ACP ensureSession + Plugin | OpenClaw Gateway 상시 기동 결정 시 |
| PDCA 상태 관리 통합 | pdca-guardian Plugin | bash hook 3개+ 상호 의존 발생 시 |
| 관제 데이터 공급 | ACP observability → dashboard | agent-ops-dashboard 고도화 시 |

### 전환하면 안 되는 것

| 항목 | 이유 |
|------|------|
| tmux Agent Teams → ACP 완전 전환 | shared task list, 팀원 간 직접 통신, split pane UX가 ACP에 없음 |
| hooks.json → Plugin 일괄 전환 | 18개 hook event를 한 번에 바꾸면 regression 리스크 |
| neuron-guardian 재작성 | 잘 동작하고 있음. 건드릴 필요 없음 |

---

## 참조

### 파일 위치

| 경로 | 내용 |
|------|------|
| `/opt/homebrew/lib/node_modules/openclaw/dist/extensions/acpx/` | acpx 플러그인 (1794줄) |
| `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/` | Plugin SDK 타입 정의 |
| `~/.openclaw/extensions/neuron-guardian/index.ts` | neuron-guardian (39KB) |
| `~/.openclaw/chrome-extension/` | 33개 내장 플러그인 |
| `/opt/homebrew/lib/node_modules/openclaw/docs/cli/acp.md` | ACP CLI 문서 |
| `/opt/homebrew/lib/node_modules/openclaw/docs/tools/acp-agents.md` | ACP 에이전트 가이드 |

### 관련 기존 피처

| 피처 | 상태 | 관련성 |
|------|------|--------|
| agent-team-operations | completed (97%) | 좀비 팀원 문제 해결 |
| pdca-chain-automation | completed (97%) | 핸드오프 자동화 |
| video-pipeline-dedup-fix | designing | L1 자동 보고 hook v3 포함 |
| agent-ops-dashboard | completed (95%) | 관제 UI |
