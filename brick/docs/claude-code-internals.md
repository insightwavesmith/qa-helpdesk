# Claude Code 내부 구조 분석 — 레퍼런스

> 이전 세션에서 분석한 내용 정리. 브릭 개발 시 참고용.

---

## 1. Claude Code 소스 구조

소스맵 경로: `/Users/smith/projects/claude-code-sourcemap/`

### 핵심 내부 도구
| 도구 | 역할 | 브릭과의 관계 |
|------|------|--------------|
| `AgentTool` | 프롬프트 하나 던지면 독립 실행 → 결과 리턴. stateless. 재귀 불가(에이전트가 에이전트 못 부름) | 우리 "블록"의 기초 |
| `ArchitectTool` | "계획만 세우고 코드 안 짜는" 분리 | Plan 블록의 원형 |
| `ThinkTool` | no-op 사고 도구 (내장) | sequentialthinking MCP의 내장 버전 |
| `permissions.ts` | `SAFE_COMMANDS` 화이트리스트 + `canUseTool` 함수 | destructive-detector의 Claude Code 내장 버전 |
| `allowedTools` 배열 | 에이전트별 사용 가능 도구 제한 | 역할 분리의 기반 |

### 우리 하네스 vs Claude Code 구조 비교

```
우리 (.bkit + .claude)              Claude Code (소스)
─────────────────────────────────────────────────────
역할 분리    validate-delegate.sh     AgentTool (재귀 차단)
             pane 0=리더(코드 금지)   Agent는 Agent 못 부름
             pane 1+=팀원(코드 작성)  Agent는 쓰기 도구 없음

위험 차단    destructive-detector.sh  permissions.ts
             패턴 매칭 → exit 2       SAFE_COMMANDS 화이트리스트
                                      canUseTool 함수로 차단

권한 시스템  승인 게이트               allowedTools 배열
             (.bkit/approvals/)       사용자 승인 → 실행
             리더 승인 → 팀원 실행

설계자 역할  PM팀 (별도 에이전트)      ArchitectTool (내장)
             Plan→Design 문서 출력    "계획만, 코드 금지"
             별도 세션에서 독립 실행   같은 세션 안에서 서브태스크

사고 도구    sequentialthinking MCP   ThinkTool (내장 no-op)

메모리       memory/*.md + MEMORY.md  ~/.claude/projects/*/MEMORY.md
```

---

## 2. Claude Code hook 4가지 타입

```
| Type      | 실행 방식          | 브릭에서 쓸 곳                    |
|-----------|--------------------|-----------------------------------|
| command   | bash/python CLI    | engine.py 호출                    |
| http      | HTTP POST webhook  | Slack 알림, 대시보드 웹훅          |
| prompt    | LLM이 자동 판단    | gate review를 LLM이 yes/no 판단   |
| agent     | 서브에이전트 실행   | gap 분석, 코드 분석 수행           |
```

→ `prompt` 타입이 핵심: Gate에서 "이 Design이 TASK 요구사항을 충족하는가?"를 LLM이 판단
→ `agent` 타입: gap-detector 같은 에이전트를 서브에이전트로 실행

---

## 3. CLAUDE.md 베스트 프랙티스 (Anthropic 공식 + 커뮤니티)

### 핵심 규칙
- CLAUDE.md는 *짧을수록 좋다* (< 200줄)
- 모델은 ~150-200개 지시만 안정적으로 따름
- Claude Code 시스템 프롬프트가 이미 ~50개 지시 차지
- 길면 *전체적으로 무시 확률 올라감* (새 지시만 아니라 전부 균등하게)
- Anthropic이 내부에 "관련 없으면 무시해도 됨" 시스템 리마인더 박아놓음

### Progressive Disclosure (점진적 공개)
- CLAUDE.md에 전부 넣지 말고, *별도 파일로 분리 → 필요할 때만 읽게*
- 우리 skills 구조가 정확히 이거

### 포인터 > 복사본
- 코드 스니펫 넣지 마 → *파일:라인 참조*로
- 복사본은 금방 outdated

### 역할(Role) 부여가 효과적
- "You are a CTO who implements code" 한 줄이 긴 지시 10줄보다 나음

### `--system-prompt-file` 활용
- `--bare` 모드에서 `--system-prompt-file agents/cto-lead.md`로 역할별 프롬프트 주입
- CLAUDE.md 안 읽히는 대신 필요한 것만 정확히 주입

### `.claude/agents/` 디렉토리
- Claude Code가 인식하는 에이전트 정의 디렉토리
- 각 `.md` 파일이 하나의 에이전트 역할 정의

---

## 4. levnikolaevich 스킬 (ln-1000) — 참고 사례

경로: `/Users/smith/projects/claude-code-skills/`

### 4단계 State Machine
- Task Decomposition → Implementation → Review → Integration
- 우리 브릭 3축의 경량 버전

### 핵심 패턴
- 파이프라인 오케스트레이터: 스킬 130개를 단계별로 조합
- 스킬 = 재사용 가능한 프롬프트 단위
- 각 스킬이 독립적 + 조합 가능

---

## 5. 브릭 적용 시 권장 구조

```
CLAUDE.md (< 200줄)
├── 프로젝트 개요
├── 공통 규칙 (안전장치, 문서 형식 참조)
└── "역할별 프롬프트는 agents/ 참조" 포인터

brick/agents/  (역할별 프롬프트)
├── cto-lead.md
├── pm-lead.md
├── qa-gate.md
├── design-validator.md
├── pdca-iterator.md
└── report-generator.md

docs/templates/  (문서 형식)
├── plan.template.md
├── design.template.md
├── analysis.template.md
├── do.template.md
└── report.template.md
```

브릭 어댑터가 블록 실행 시:
```bash
claude --bare --print - \
  --system-prompt-file agents/cto-lead.md \
  --dangerously-skip-permissions
```
→ 역할에 맞는 프롬프트만 주입. CLAUDE.md 비대화 방지.

---

---

## 6. Paperclip — 어댑터 실행 레퍼런스

경로: `/Users/smith/projects/paperclip/`
GitHub: `https://github.com/paperclipai/paperclip`

### 배낄 코드 매핑
| Paperclip 코드 | 브릭에 적용 | 상태 |
|---|---|---|
| `ServerAdapterModule` 인터페이스 | `TeamAdapter` ABC 확장 기준 | ✅ 적용됨 |
| `claude-local/execute.ts` | `claude_local.py` 어댑터 | ✅ 적용됨 |
| `AdapterExecutionContext` | `start_block` context 구조 | ✅ 적용됨 |
| `skills.ts` (symlink 관리) | `.bkit/skills` 관리 로직 | 📌 미적용 |
| `runChildProcess` 유틸 | tmux 대신 subprocess 직접 실행 | ✅ 적용됨 |
| `buildPaperclipEnv` (config.env) | nesting guard 제거 + env 주입 | ✅ 적용됨 |
| workspace 전략 (`git_worktree`) | 에이전트 작업공간 격리 | 📌 나중 |
| `sessionCodec` | 세션 직렬화/역직렬화 | 📌 나중 |
| PostgreSQL + drizzle | DB 마이그레이션 참고 | 📌 나중 |

### 핵심 인사이트
- Paperclip `execute()` = 브릭 `start_block()` — 1:1 대응
- tmux 없이 `runChildProcess`로 Claude Code CLI 직접 실행 + stdout 수집
- `config.env`로 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 주입
- nesting guard 4개 환경변수 제거 (CLAUDECODE 등) — Paperclip `server-utils.ts L774-783`

---

## 7. Mission Control — 멀티유저/인프라 레퍼런스

경로: `/Users/smith/projects/mission-control/`

### 배낄 코드 매핑
| Mission Control 코드 | 브릭에 적용 | Phase |
|---|---|---|
| `auth.ts` — User (id, role, workspace_id, tenant_id) | 멀티유저 + 권한 | Phase 2 |
| `session-cookie.ts` + `auth.ts` | Express 인증 교체 | Phase 2 |
| `google-auth.ts` | Google Sign-In | Phase 2 |
| `quality_reviews` 테이블 + API | Gate 리뷰 연동 참고 | Phase 1 |
| `websocket.ts` + `use-server-events.ts` | SkyOffice 상태 동기화 | Phase 3 |
| `skill-registry.ts` + `skill-sync.ts` | 프리셋/어댑터 마켓플레이스 | Phase 4 |
| `schedule-parser.ts` | 자연어 스케줄링 | Phase 4 |
| `gateway-runtime.ts` + `adapters/` | 멀티 에이전트 프레임워크 연결 | Phase 4 |
| `schema.sql` (users/sessions/workspaces) | 멀티테넌시 모델 | Phase 2 |
| `docker-compose.yml` | Docker 배포 | Phase 4 |

---

## 8. 경쟁 오픈소스 비교 — 브릭 차별점

| | Paperclip | Mission Control | CrewAI | AutoGen | Agency Swarm | **브릭** |
|---|---|---|---|---|---|---|
| 핵심 | AI 회사 운영 | 에이전트 오케스트레이션 | 역할 기반 멀티에이전트 | MS 멀티에이전트 | 조직 기반 에이전트 | *3축 워크플로우 엔진* |
| 선언적 정의 | ❌ | ✅ 파이프라인 | ✅ YAML | ❌ 코드 | ❌ 코드 | *✅ YAML 프리셋* |
| 워크플로우 엔진 | ❌ 이슈 단위 | ✅ 파이프라인 | sequential/hierarchical | Workflow 클래스 | ❌ | *✅ 3축 자유 조합* |
| Gate/품질강제 | ❌ | ✅ Aegis | ❌ | ❌ | ❌ | *✅ Gate 7종* |
| Link 다양성 | sequential만 | 파이프라인 스텝 | seq/hierarchical | seq/swarm/round-robin | linear | *✅ 7종* |
| 경쟁(compete) | ❌ | ❌ | ❌ | ❌ | ❌ | *✅* |
| cron 스케줄링 | ✅ heartbeat | ✅ 자연어 | ❌ | ❌ | ❌ | *✅* |
| 멀티유저 | ✅ | ✅ RBAC | ❌ | ✅ Studio | ❌ | *📌 Phase 2* |
| 실시간 대시보드 | ✅ React | ✅ WebSocket+SSE | ❌ CLI | ✅ Studio | ❌ CLI | *📌 Phase 3* |
| 플러그인 SDK | ✅ definePlugin | ✅ Skills Hub | ✅ Tool | ✅ Tool | ✅ Tool | *📌 Phase 4* |

### 브릭만의 차별점 (아무도 안 한 것)
1. *Block × Team × Link 3축 자유 조합* — 선언적 YAML로
2. *compete Link* — 2팀이 경쟁하고 심사하는 구조
3. *Gate 7종* (command/http/prompt/agent/review/metric/approval)
4. *SkyOffice 멀티플레이어 + 3축* — 공간형 UI (Phase 3)

### 비교 결론
- CrewAI가 "팀 + 역할 + Task"로 가장 가깝지만 분기/루프/병렬 없음
- LangGraph가 그래프로 가장 유연하지만 팀 개념 없고 코드로 짜야 함
- 둘을 합쳐도 브릭의 "검토 Gate on/off + 경쟁 가설 + 선언적 YAML" 조합은 없음

---

## 9. Vibe Island — 참고만 (코드 없음)

- macOS 노치(Dynamic Island)에서 AI 에이전트 모니터링하는 네이티브 앱
- Claude Code, Codex, Gemini CLI, Cursor 등 6개 에이전트 한 눈에
- Unix socket 로컬 통신, Claude Code hook 시스템으로 zero-config 연결
- *클로즈드소스* — 유료 라이선스, 코드 비공개
- 브릭과의 차이: Vibe Island은 모니터링 전용, 브릭은 워크플로우 실행 엔진

---

## 10. 3축 비전 요약

```
Block × Team × Link = Brick

Block = 뭘 (what + done)
Team  = 누가 (adapter)
Link  = 어떻게 (sequential/parallel/branch/loop/compete/cron/hook)
```

```yaml
# 경쟁 가설 예시
- block: { type: Design, what: "LP 구조 설계", done: [Design.md] }
  team: [PM-A, PM-B]        # 2팀 배정
  link: { type: compete }    # 경쟁 → 심사

# 병렬 예시  
- block: { type: Do, what: "구현" }
  team: [CTO-frontend, CTO-backend]
  link: { type: parallel }   # 둘 다 끝나면 수렴
```

---

## 참고 소스
- Claude Code 소스맵: `/Users/smith/projects/claude-code-sourcemap/`
- Paperclip: `/Users/smith/projects/paperclip/`
- Mission Control: `/Users/smith/projects/mission-control/`
- levnikolaevich 스킬: `/Users/smith/projects/claude-code-skills/`
- bkit 플러그인: `~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/`
