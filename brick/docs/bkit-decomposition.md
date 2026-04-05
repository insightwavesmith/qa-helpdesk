# bkit 분해 정리 — 전체 검토 후 최종 판단

> 2026-04-04 모찌 작성. bkit v1.5.2 전체 (스킬 36 + 에이전트 31 + 템플릿 16 + hooks 46 + lib 70 파일) 확인 완료.

---

## bkit 전체 구성

| 파트 | 개수 | 총 줄수 |
|------|------|---------|
| 스킬 | 36개 | — |
| 에이전트 프롬프트 | 31개 | ~6,000줄 |
| 문서 템플릿 | 16개 | ~3,500줄 |
| lib (JS 모듈) | 70개 | ~19,000줄 |
| hooks (프로젝트 로컬) | 46개 | ~4,500줄 |
| hooks (bkit 기본) | 3개 | — |
| MCP 서버 | 2개 | — |
| output-styles | 4개 | — |

---

## 🟢 가져올 것 — 최종

### A. 문서 템플릿 5개

| 템플릿 | 줄 | 왜 필요한가 |
|--------|-----|------------|
| `plan.template.md` | 273 | Plan 문서 형식. 목표/범위/제약/검증기준. PM이 매번 다른 형식 쓰면 검토 불가 |
| `design.template.md` | 444 | Design 문서 형식. TDD 케이스/불변식/영향범위. 이게 없으면 CTO가 뭘 만들어야 하는지 기준 없음 |
| `analysis.template.md` | 336 | Gap 분석 보고서. Design vs 구현 비교표 + Context Anchor. COO 검토 기준 |
| `do.template.md` | 298 | 구현 가이드. Session Scope(범위 한정) + Context Anchor(WHY 이어받기). CTO가 범위 벗어남 방지 |
| `report.template.md` | 217 | 완료 보고서. 결과/메트릭/교훈. Smith님 보고용 |

### B. 에이전트 프롬프트 12개

*팀 리더 (2개)*
| 에이전트 | 줄 | 적용 위치 |
|----------|-----|-----------|
| `cto-lead` | 202 | Agent Teams CTO 리더 프롬프트 |
| `pm-lead` | 170 | Agent Teams PM 리더 프롬프트 |

*QA/검증 (4개)*
| 에이전트 | 줄 | 적용 위치 |
|----------|-----|-----------|
| `gap-detector` | 352 | 브릭 Gate — Design vs 구현 일치율% 산출 |
| `code-analyzer` | 405 | Codex QA Gate — 코드 품질/보안/성능 체크리스트 |
| `design-validator` | 236 | COO 검토 — Design 문서 완성도 검증 |
| `qa-monitor` | 357 | 실시간 QA — Zero Script QA 방법론 (로그 기반 검증) |

*PM팀 (4개)*
| 에이전트 | 줄 | 적용 위치 |
|----------|-----|-----------|
| `pm-prd` | 229 | PRD 작성 — JTBD + 비치헤드 + GTM + 사용자 스토리 |
| `pm-research` | 213 | 시장 조사 — 페르소나 + 경쟁사 + TAM/SAM/SOM |
| `pm-strategy` | 257 | 전략 — Lean Canvas + SWOT + Porter's 5 |
| `pm-discovery` | 179 | 5단계 Discovery Chain + Opportunity Solution Tree |

*개선/보고 (2개)*
| 에이전트 | 줄 | 적용 위치 |
|----------|-----|-----------|
| `pdca-iterator` | 374 | 자동 개선 루프 — Gap 90% 미만 시 자동 수정 반복 (최대 5회). 브릭 loop Link에 연결 |
| `report-generator` | 272 | 완료 보고서 자동 생성 — Smith님 보고 자동화 |

### C. lib 모듈 — 로직 참고 6개 (코드 복사 아님, 개념 도입)

| 모듈 | 줄 | 우리한테 없는 것 | 적용 방법 |
|------|-----|----------------|-----------|
| `quality/gate-manager.js` | 452 | 7단계 품질 Gate 정의 + 메트릭 기반 pass/retry/fail 판정 | 브릭 Gate 로직 보강 |
| `quality/regression-guard.js` | 329 | 회귀 방지 규칙 DB — 이전에 고친 이슈가 다시 나오면 차단 | 브릭 Gate 규칙 추가 |
| `quality/metrics-collector.js` | 379 | 10가지 품질 메트릭(M1~M10) 정의 + 수집/저장 | 브릭 메트릭 시스템 참고 |
| `pdca/circuit-breaker.js` | 200 | CLOSED→OPEN→HALF_OPEN 패턴. 3번 실패 시 30초 쿨다운 | 브릭 어댑터 재시도에 적용 |
| `control/blast-radius.js` | 299 | 변경 영향 범위 분석 (B-001~B-006 규칙) | 위험도 높은 TASK 자동 감지 |
| `control/loop-breaker.js` | 252 | 무한루프 방지 4가지 규칙 (LB-001~LB-004) | 브릭 loop Link 안전장치 |

### D. hooks 3개 (유지)

| hook | 줄 | 역할 |
|------|-----|------|
| `destructive-detector.sh` | 153 | rm -rf, DROP TABLE, force push 차단 |
| `prevent-tmux-kill.sh` | 41 | tmux 세션 kill 차단 |
| `enforce-agent-teams.sh` | 25 | Agent Teams 환경변수 강제 |

### E. 스킬 3개

| 스킬 | 분류 | 왜 필요한가 |
|------|------|------------|
| `code-review` | workflow | 코드 리뷰 체크리스트. Codex QA 보완 |
| `zero-script-qa` | workflow | 테스트 스크립트 없이 QA — 로그 기반 검증. 빠른 검증에 유용 |
| `btw` | workflow | "작업 중 개선 제안 수집". TODO/개선점 놓치지 않게 |

---

## 🔴 버릴 것 — 최종

### 에이전트 19개 (불필요)
- `pdca-eval-*` 6개 — 각 PDCA 단계 평가. 브릭 Gate + 위 에이전트로 대체
- `bkit-impact-analyst` — bkit 플러그인 자체 분석용. 우리한테 불필요
- `cc-version-researcher` — Claude Code 버전 변경 분석. 불필요
- `frontend-architect` (99줄) — 프론트엔드 전문. 지금은 불필요 (SkyOffice 단계에서 재검토)
- `security-architect` (100줄) — 보안 전문. 100줄로 너무 얇음. code-analyzer에 보안 체크 포함
- `enterprise-expert` — 마이크로서비스/K8s. 지금 안 씀
- `infra-architect` — AWS/Terraform. 지금 안 씀
- `pipeline-guide` — 9단계 파이프라인 가이드. 브릭 프리셋으로 대체
- `product-manager` (86줄) — pm-lead가 더 나음
- `pm-lead-skill-patch` — pm-lead 패치. pm-lead에 병합
- `skill-needs-extractor` — 스킬 니즈 추출. 불필요
- `starter-guide` — 초보자 가이드. 불필요
- `qa-strategist` — qa-monitor가 더 나음

### hooks 43개 (제거)
- `session-start.js` — 브릭 자동 실행 충돌 원인
- `validate-pdca.sh`, `validate-plan.sh`, `validate-design.sh` — 브릭 Gate로 대체
- `enforce-qa-before-merge.sh` — 브릭 codex QA Gate로 대체
- `pdca-chain-handoff.sh` — 브릭 Link로 대체
- 나머지 전부 — 브릭 엔진이 워크플로우 관리하므로 hook 기반 검증 불필요

### 스킬 33개 (불필요)
- `pdca` — 브릭 프리셋으로 대체
- `bkend-*` 5개 — bkend.ai 전용
- `starter`, `dynamic`, `enterprise` — 레벨별 가이드
- `phase-1~9` — 파이프라인 단계별 가이드
- 기타 — control, rollback, pdca-batch, audit 등 → 브릭 기능으로 대체

### lib 64개 (코드 불필요)
- bkit 내부 런타임용 (상태 저장, UI, 인텐트 감지 등)
- 위 6개만 개념 참고하고 나머지는 버림

### MCP 서버 2개, output-styles 4개 (불필요)

---

## 적용 방법

```
1. 템플릿 5개 → docs/templates/ 복사 + CLAUDE.md에 규칙 추가
2. 에이전트 프롬프트 12개 → brick/prompts/ 디렉토리 생성
3. lib 6개 → 코드 복사 아님. 개념만 브릭 코드에 구현
4. hooks 43개 제거 → 3개만 남김
5. bkit 플러그인 제거 → ~/.claude/plugins/cache/bkit-marketplace/ 삭제
6. .bkit/hooks/ 정리 (3개만 남기고 삭제)
```

---

## 잘못 알고 있었던 것 정정

| 내가 말한 것 | 실제 | 원인 |
|-------------|------|------|
| "블록 사이 연결이 없다" | Link 7종 dict 레지스트리로 전부 연결 | bkit hooks 충돌을 구조 문제로 오진 |
| "파일 handoff가 없다" | complete_block → 다음 블록 자동 전환 동작 | 같은 오진 |
| "E2E 연결 안 했다" | P1 통합에서 Do→QA→다음 체인 동작 확인 | 같은 오진 |
| "이것만 가져오면 된다 (15개)" | 전체 봤더니 26개 + lib 참고 6개 | 빠르게 정리하느라 깊이 안 봄 |

---

## 브릭 현재 개발 상태 (482 passed)

### ✅ 완료
- 3축 엔진 (Link 7종 / Block / Adapter 10종) — dict 레지스트리
- EventBus + Slack subscriber
- Link notify + Hook Link (커밋 `11320399`)
- complete_block 자동호출 (커밋 `aa80ec02`)
- 프리셋 10개 (do-codex-qa, design-dev-qa-approve 포함)
- Phase 2 멀티유저+RBAC (커밋 `12be7482`)
- Phase 3 SkyOffice bridge (커밋 `bcbf16ed`)

### 🔧 해야 할 것

```
━━━ P0 (지금) ━━━
1. bkit hooks 정리 (3개만 남기고 제거)
2. bkit 요소 추출 → CLAUDE.md/prompts/templates 적용
3. 디버깅 프로세스 (블록 실패 시 Slack 자동 진단)

━━━ P1 (다음) ━━━
4. assignee 기반 어댑터 아키텍처
5. COO 어댑터 (EventBus → 모찌)
6. Smith 어댑터 (Slack DM 보고+승인)
7. 반려 사유 전달 (context.reject_reason)
8. Slack 알림 개선 + 테스트 격리
9. circuit-breaker + loop-breaker + regression-guard 도입

━━━ P2 (나중) ━━━
10. 워크플로우 대시보드 (웹 UI)
11. 어댑터 헬스체크
12. 멀티유저 RBAC (오픈소스용)
```
