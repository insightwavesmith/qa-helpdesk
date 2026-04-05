# QA: 브릭 엔진 E2E 사용성 테스트 — 7단계 아키텍처 사고

> 2026-04-04 모찌(COO) 작성. 전체 프로세스 검증.

---

## Step 1: 재해석

"P0(4축) + P1(3축) + 코드리뷰 수정이 끝났다. 근데 *실제로 TASK 넣으면 끝까지 돌아가는가?* 유닛 테스트 618개 통과 ≠ E2E 동작. 실제 워크플로우를 돌려서 검증한다."

---

## Step 2: 기존 탐색

| 테스트 종류 | 현재 | 빠진 것 |
|------------|------|---------|
| 유닛 테스트 | 618 passed ✅ | — |
| 통합 테스트 | API 엔드포인트 테스트 ✅ | — |
| E2E (엔진→어댑터→Gate→알림) | ❌ 없음 | 실제 워크플로우 실행 |
| 사용성 (사람 시나리오) | ❌ 없음 | 직원 로그인→블록 승인 |

---

## Step 3: 축 분해 — QA 3축

### 축 1: 엔진 E2E (TASK 입력 → 완료)
- 프리셋 YAML → 워크플로우 생성 → 블록 실행 → Gate 검증 → Link 이동 → 완료
- 어댑터가 실제로 subprocess 실행하는지

### 축 2: 가시성 E2E (알림 + 디버깅)
- 블록 시작/완료/실패 → Slack 알림 수신
- 실패 시 stderr + exit code 표시
- approval 대기 → Slack 검토 요청

### 축 3: 사람 E2E (로그인 → 승인)
- Google Sign-In → 세션 → API 호출
- approval Gate → 승인/반려 → 블록 진행/재작성

---

## Step 4: Understanding Lock 🔒

| 항목 | 내용 |
|------|------|
| **뭘 검증하는가** | 618 유닛 테스트로 검증 못 하는 "실제 동작" |
| **왜 필요한가** | 유닛 통과 ≠ E2E 동작. FB-11처럼 테스트만 통과하고 코드 없는 경우 있었음 |
| **검증 범위** | 엔진 E2E + 가시성 E2E + 사람 E2E |

---

## Step 5: 테스트 시나리오

### 시나리오 1: 최소 워크플로우 (엔진 E2E)
```
목표: TASK 넣으면 블록이 실행되고 완료되는가

1. 브릭 서버 시작
   → python3 /tmp/brick_server.py 또는 uvicorn brick.dashboard.server:create_app

2. 워크플로우 시작
   → POST /api/v1/engine/start
     body: { "preset_name": "do-codex-qa", "feature": "qa-test-1", "project": "brick-engine" }

3. 검증:
   - [ ] 워크플로우 생성 성공 (200 + workflow_id)
   - [ ] 첫 블록 상태 queued → running
   - [ ] project context 주입됨 (project.yaml 로딩)
   - [ ] 블록 완료 시 상태 completed
   - [ ] artifact Gate 동작 (파일 없으면 fail)
```

### 시나리오 2: 프롬프트 주입 (컨텍스트 E2E)
```
목표: --agent 옵션으로 역할 프롬프트가 주입되는가

1. 프리셋 YAML에 role: cto-lead 설정
2. 블록 실행
3. 검증:
   - [ ] claude_local args에 --agent cto-lead 포함
   - [ ] --bare 미포함
   - [ ] .claude/agents/cto-lead.md 로딩됨
   - [ ] project agent 오버라이드 동작 (brick/projects/bscamp/agents/ 있으면 우선)
```

### 시나리오 3: 실패 + 알림 (가시성 E2E)
```
목표: 블록 실패 시 Slack에 stderr + exit code가 보이는가

1. 의도적 실패 블록 실행 (존재하지 않는 명령 등)
2. 검증:
   - [ ] block.adapter_failed 이벤트 발행
   - [ ] event.data에 stderr, exit_code 포함
   - [ ] Slack 메시지에 stderr 마지막 10줄 + exit code 표시
   - [ ] 토큰 마스킹 동작 (xoxb-*, sk-* 패턴)
   - [ ] BRICK_ENV=test → Slack 미발송
```

### 시나리오 4: 반려 → 재작성 (피드백 루프 E2E)
```
목표: Gate 반려 시 reject_reason이 다음 블록 프롬프트에 포함되는가

1. approval Gate 블록 실행 → pending
2. reject API 호출: POST /engine/complete-block { approval_action: "reject", reject_reason: "TDD 누락" }
3. 검증:
   - [ ] context["reject_reason"] = "TDD 누락"
   - [ ] context["reject_count"] = 1
   - [ ] loop Link로 이전 블록 재실행
   - [ ] 재실행 블록 프롬프트에 "⚠️ 이전 산출물이 반려됨" 포함
   - [ ] Slack에 반려 사유 표시
```

### 시나리오 5: 프로젝트 컨텍스트 (프로젝트 E2E)
```
목표: project.yaml의 constraints가 에이전트에게 전달되는가

1. project: bscamp 워크플로우 시작
2. 검증:
   - [ ] project.yaml 로딩 성공
   - [ ] context["project"]["constraints"]에 "DB는 SQLite" 포함
   - [ ] 경로 방어: project="../../etc" → 거부
   - [ ] project.yaml 없는 프로젝트 → warning만, 에러 아님
```

### 시나리오 6: Google Sign-In (사람 E2E)
```
목표: 직원이 로그인해서 승인할 수 있는가

1. GET /api/v1/auth/me → 401 (미인증)
2. POST /api/v1/auth/google { credential: "..." } → 세션 생성
3. GET /api/v1/auth/me → 200 + user 정보
4. 검증:
   - [ ] 첫 사용자 → admin + is_approved=1
   - [ ] 세션 쿠키 설정됨
   - [ ] RBAC: viewer가 POST /engine/start → 403
   - [ ] 세션 만료 후 → 401
```

### 시나리오 7: 문서 산출 강제 (artifact Gate E2E)
```
목표: 블록 완료 시 artifact 파일 없으면 실패하는가

1. artifact Gate 설정된 블록 실행
2. 블록 완료 시도 (파일 미생성)
3. 검증:
   - [ ] Gate fail → "산출물 누락: plans/qa-test-1.md"
   - [ ] on_fail: retry → 블록 재실행
   - [ ] 파일 생성 후 재시도 → Gate pass
   - [ ] path traversal "../../../etc/passwd" → "경로 보안 위반"
```

### 시나리오 8: 에이전트 도구 제한 (무장 E2E)
```
목표: PM이 Bash 못 쓰고, QA가 Write 못 하는가

1. .claude/agents/pm-lead.md frontmatter 확인
2. .claude/agents/qa-monitor.md frontmatter 확인
3. 검증:
   - [ ] pm-lead: permissionMode=plan, disallowedTools에 Bash
   - [ ] qa-monitor: disallowedTools에 Write, Edit
   - [ ] cto-lead: disallowedTools에 rm -rf, git push
```

---

## Step 6: 검증 순서

```
시나리오 8 (정적 검증) ← 파일 확인만
    ↓
시나리오 5 (프로젝트 컨텍스트) ← API 호출
시나리오 2 (프롬프트 주입) ← args 확인
    ↓
시나리오 1 (최소 워크플로우) ← 엔진 실행
시나리오 7 (artifact Gate) ← Gate 동작
    ↓
시나리오 3 (실패 + 알림) ← Slack
시나리오 4 (반려 → 재작성) ← 피드백 루프
    ↓
시나리오 6 (Google Sign-In) ← 인증 (별도)
```

---

## Step 7: 핸드오프

이 QA 문서 기반으로 실제 테스트 실행.
시나리오 8 → 2 → 5 순서로 정적 검증부터 시작.
