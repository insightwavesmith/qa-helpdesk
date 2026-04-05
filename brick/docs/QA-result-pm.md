# QA 결과: PM 담당 — P5 프리셋(Building) 전수검증

> 담당: PM
> 기준일: 2026-04-05
> QA 문서: brick/docs/QA-brick-full-3axis.md
> 검증 방법: PresetLoader 실제 로드 + PresetValidator(레지스트리 연동) + Validator(INV-1~8) + 구조 교차검증

---

## 검증 환경

```
검증 코드: PresetLoader(brick/presets/) → PresetValidator(registry-aware) → Validator(INV)
등록된 gate_types: agent, approval, artifact, command, http, metric, prompt, review (8종)
등록된 link_types: branch, compete, cron, hook, loop, parallel, sequential (7종)
등록된 adapter_types: claude_agent_teams, claude_code, claude_local, webhook, human (5종)
```

---

## P5: 프리셋별 검증 결과

### P-01: hotfix

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 1 (Do) | 1 (do) | ✅ PASS |
| 링크 수 | 0 | 0 | ✅ PASS |
| 어댑터 | claude_agent_teams | claude_agent_teams | ✅ PASS |
| 특수 | 최소 프리셋 | 블록 1개, 링크 0개, Gate 없음 | ✅ PASS |
| PresetValidator | 통과 | 0 errors, 0 warnings | ✅ PASS |

### P-02: research

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 2 | 2 (research, report) | ✅ PASS |
| 링크 | 1 seq | 1 (research→report, sequential) | ✅ PASS |
| 어댑터 | claude_agent_teams | 전부 claude_agent_teams | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

### P-03: feature-light

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | QA 문서: ? | 3 (design, do, check) | ✅ PASS |
| 링크 | QA 문서: ? | 2 seq (design→do, do→check) | ✅ PASS |
| 어댑터 | ? | 전부 claude_agent_teams | ✅ PASS |
| Gate | metric | check 블록: metric(build_pass, threshold=1), on_fail=retry, max_retries=1 | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

> QA 문서에 feature-light의 블록/링크 수가 `?`로 표기됨. 실제: blocks=3, links=2. **QA 문서 보완 필요.**

### P-04: feature-standard

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 5 | 5 (plan, design, do, check, act) | ✅ PASS |
| 링크 | 4seq+1loop | 4seq+1loop (5건) | ✅ PASS |
| 어댑터 | claude_agent_teams | 전부 claude_agent_teams | ✅ PASS |
| metric gate | match_rate >= 90 | check 블록: metric=match_rate, threshold=90 | ✅ PASS |
| loop 조건 | match_rate_below: 90 | check→do loop, condition={match_rate_below: 90}, max_retries=3 | ✅ PASS |
| 팀 전환 | PM→CTO | plan/design: sdk-pm(PM_LEADER), do/check/act: sdk-cto(CTO_LEADER) | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

### P-05: feature-full

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 6 | 6 (plan, design, do, check, security, act) | ✅ PASS |
| 링크 | 5seq+1loop | 5seq+1loop (6건) | ✅ PASS |
| 어댑터 | claude_agent_teams | 전부 claude_agent_teams | ✅ PASS |
| metric gate | match_rate >= 95 | check 블록: metric=match_rate, threshold=95 | ✅ PASS |
| 보안 블록 | security 존재 | security(type=Review) 존재 | ✅ PASS |
| ADR artifact | plan에 ADR | plan.done.artifacts에 `docs/adr/{feature}.md` 포함 | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

### P-06: feature-approval

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 7 | 7 (plan, design, coo_review, ceo_approval, do, check, act) | ✅ PASS |
| 링크 | 6seq+2loop | 6seq+2loop (8건) | ✅ PASS |
| 어댑터 | mixed | claude_agent_teams(6) + human(1, ceo_approval) | ✅ PASS |
| agent gate | coo_review에 존재 | coo_review: agent gate (agent_prompt 포함, timeout=300) | ✅ PASS |
| approval gate | ceo_approval에 존재 | ceo_approval: approval gate (approver=smith, timeout=86400) | ✅ PASS |
| context_artifacts | Plan+Design 참조 | 2개 artifact 경로 포함 | ✅ PASS |
| 반려 루프 | ceo_approval→design | ceo_approval→design(loop, condition={approval_status: rejected}, max=3) | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

### P-07: feature-codex-qa

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 5 | 5 (plan, design, do, coo-review, report) | ✅ PASS |
| 링크 | 3seq+1loop+1branch | 3seq+1loop+1branch (5건) | ✅ PASS |
| 어댑터 | claude_local+human+webhook | claude_local(3)+human(1)+webhook(1) | ✅ PASS |
| codex gate | do 블록 command | `codex review --uncommitted`, timeout=300 | ✅ PASS |
| review gate | coo-review | type=review, reviewer=coo | ✅ PASS |
| AGENT_TEAMS env | do 블록 | CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1" | ✅ PASS |
| branch 조건 | review_approved | coo-review→report(branch, condition={review_approved: True}) | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

### P-08: do-codex-qa

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 3 | 3 (do, coo-review, report) | ✅ PASS |
| 링크 | 2seq+1loop+1branch? | 1seq+1loop+1branch (3건) | ⚠️ WARN |
| 어댑터 | claude_local+human | claude_local(1)+human(2) | ✅ PASS |
| continueSession | do 블록 | continueSession=True | ✅ PASS |
| codex gate | do 블록 | `codex review --uncommitted`, timeout=300 | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

> QA 문서: "2seq+1loop+1branch" (4건)이라 했으나 실제 links=3건: do→coo-review(seq), coo-review→do(loop), coo-review→report(branch) = 1seq+1loop+1branch. **QA 문서 수정 필요: "1seq+1loop+1branch".**

### P-09: security-qa

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 4 | 4 (do, security, browser-qa, report) | ✅ PASS |
| 링크 | 3 seq | 3 seq (do→security→browser-qa→report) | ✅ PASS |
| 어댑터 | claude_local | 전부 claude_local | ✅ PASS |
| placeholder cmd | security/browser-qa | echo placeholder 명령 | ✅ PASS |
| $schema | 없음 | `$schema: brick/preset-v2` 누락 | ⚠️ WARN |
| PresetValidator | 통과 | 0 errors (schema 필드는 validator 미검증) | ✅ PASS |

> security-qa.yaml에 `$schema: brick/preset-v2`가 누락됨. 나머지 9개는 전부 있음. 기능에는 영향 없으나 일관성 위해 추가 권장.

### P-10: design-dev-qa-approve

| 항목 | 기대 | 실제 | 판정 |
|------|------|------|------|
| 로드 | 성공 | 성공 | ✅ PASS |
| 블록 수 | 5 | 5 (design-review, do, coo-review, smith-approve, report) | ✅ PASS |
| 링크 | 4seq+2loop+2branch? | 2seq+2loop+2branch (6건) | ⚠️ WARN |
| 어댑터 | claude_local+human | claude_local(2)+human(3) | ✅ PASS |
| AGENT_TEAMS env | design-review, do | 양쪽 env에 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1" | ✅ PASS |
| 복합 분기 | coo→smith→do/report | coo-review→smith-approve(branch) + smith-approve→do(loop)/report(branch) | ✅ PASS |
| review gate | coo-review, smith-approve | 양쪽 type=review | ✅ PASS |
| PresetValidator | 통과 | 0 errors | ✅ PASS |

> QA 문서: "4seq+2loop+2branch" (8건)이라 했으나 실제 links=6건: 2seq+2loop+2branch. **QA 문서 수정 필요.**

---

## P-COM: 공통 검증 결과

| ID | 항목 | 결과 | 판정 |
|----|------|------|------|
| **P-COM-001** | PresetValidator 통과 (real_errors=0) | 10개 전부 0 errors | ✅ PASS |
| **P-COM-002** | 모든 블록에 팀 할당 | 10개 전부 missing_teams = 0 | ✅ PASS |
| **P-COM-003** | 링크 from/to 유효 | 10개 전부 존재하는 블록 ID만 참조 | ✅ PASS |
| **P-COM-004** | {feature} 치환 | project/feature 주입 시 정상 치환 확인 (6개 프리셋) | ✅ PASS |
| **P-COM-005** | Validator INV-1~8 통과 | 10개 전부 0 errors | ✅ PASS |

---

## P0 지원: 프리셋 기반 워크플로우 흐름 설계 검증

### feature-standard E2E 흐름 (P0-B 시나리오 대응)

```
Plan(PM) →[seq]→ Design(PM) →[seq]→ Do(CTO) →[seq]→ Check(CTO)
                                                      ↓
                                              metric gate: match_rate >= 90
                                              ├── PASS → [seq] → Act(CTO) → workflow.completed
                                              └── FAIL → [loop, max=3] → Do(CTO) 재실행
```

**P0-B 관점 검증:**
- P0-B01: Plan→Design sequential 링크 ✅ (plan→design, type=sequential)
- P0-B02: Design→Do 팀 전환 ✅ (sdk-pm/PM_LEADER → sdk-cto/CTO_LEADER)
- P0-B03: Check metric gate ✅ (match_rate >= 90, threshold=90)
- P0-B04: Check 실패 → loop ✅ (check→do, condition={match_rate_below: 90}, max_retries=3)
- P0-B05: 전체 체인 완주 ✅ (5블록 전부 팀 할당, 링크 연결)

### feature-approval E2E 흐름 (P0-C 시나리오 대응)

```
Plan(PM) →[seq]→ Design(PM) →[seq]→ COO Review(COO)
                                      ↓ agent gate
                                      →[seq]→ CEO Approval(human/smith)
                                               ├── approve → [seq] → Do(CTO) → Check → Act
                                               └── reject  → [loop] → Design(PM) 재작성
```

**P0-C 관점 검증:**
- P0-C01: COO Review agent gate ✅ (agent_prompt 포함, timeout=300)
- P0-C02: CEO Approval → WAITING_APPROVAL ✅ (approval gate, type=approval)
- P0-C03: 승인 → Do 시작 ✅ (ceo_approval→do, sequential)
- P0-C04: 반려 → Design 루프백 ✅ (ceo_approval→design, loop, condition={approval_status: rejected})
- P0-C05: context_artifacts로 반려 맥락 전달 ✅ (Plan+Design 문서 경로 포함)

---

## 집계

| 판정 | 건수 | 비율 |
|------|------|------|
| ✅ PASS | 12 | 80% |
| ⚠️ WARN | 3 | 20% |
| ❌ FAIL | 0 | 0% |
| 🔍 SKIP | 0 | 0% |

### WARN 상세

| ID | 내용 | 심각도 | 조치 |
|----|------|--------|------|
| P-08 | do-codex-qa 링크 수: QA 문서 "2seq+1loop+1branch" → 실제 "1seq+1loop+1branch" (3건) | 낮음 | QA 문서 수정 |
| P-09 | security-qa.yaml에 `$schema: brick/preset-v2` 누락 | 낮음 | 1줄 추가 |
| P-10 | design-dev-qa-approve 링크 수: QA 문서 "4seq+2loop+2branch" → 실제 "2seq+2loop+2branch" (6건) | 낮음 | QA 문서 수정 |

### 발견사항

1. **기능 블로커 없음**: 10개 프리셋 전부 로드+검증+INV 통과. Building 진행에 장애 없음.
2. **QA 문서 오기**: P-03(feature-light) 블록/링크 `?` 표기, P-08/P-10 링크 수 불일치. QA 문서 자체 수정 필요.
3. **security-qa $schema 누락**: 기능 영향 없으나 일관성 위해 추가 권장.
4. **codex 어댑터**: 프리셋에서 `codex` 어댑터 직접 사용하는 건 없음. 현재는 command gate에서 `codex review --uncommitted`로만 사용. 향후 CodexAdapter 구현 시 프리셋 추가 필요.
5. **레지스트리 연동**: init_engine()에 등록된 5종 어댑터 기준으로 검증 통과. codex 어댑터는 미등록 상태지만 현재 프리셋에서 사용하지 않으므로 문제 없음.

---

> PM 담당 15건 검증 완료. FAIL 0건. 전체 결과를 COO에 전달합니다.
