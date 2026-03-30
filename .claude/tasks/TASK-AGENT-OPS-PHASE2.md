---
team: PM
session: sdk-pm
created: 2026-03-30
status: pending
owner: leader
---

# TASK: Agent Ops Phase 2 — 미착수 항목 + OpenClaw 신기능 적용 기획

> COO(모찌) → PM팀 기획 요청
> 관련: docs/01-plan/features/agent-ops-hardening.plan.md (P0+P1 완료, P2~P3 미착수)
> OpenClaw 릴리즈: 2026.3.29 (https://github.com/openclaw/openclaw/releases)

---

## 배경

Agent Ops Hardening P0(D5+D7+D8-1+D8-4) + P1(D3+D6+D8-5) 완료. TDD 53건 Green.
이제 두 트랙을 동시에 기획한다:
- **트랙 A**: 기존 미착수 P2~P3 항목
- **트랙 B**: OpenClaw 3.29 신기능을 에이전트 자동화에 적용

---

## 트랙 A: 기존 미착수 (P2~P3)

### A1. D1+D8-3: Per-Agent Thinking (P2)

**이게 뭔지**: 에이전트별로 thinking level을 분리. COO/리더=high, 구현 팀원=medium.

**왜 필요한지**: 팀원이 단순 구현에도 thinking=high 쓰면 토큰 낭비 + 응답 시간 증가.

**기획 범위**:
- CC(Claude Code)에서 thinking level을 spawn 시 주입하는 공식 방법 조사
- `--thinking` 플래그 or 프롬프트 레벨 대체 옵션 비교
- pilot 테스트 계획 (어떤 TASK에서 medium으로 돌려보고 품질 비교)
- 리스크: medium thinking에서 코드 품질 저하 가능성 분석

**우선순위**: P2

---

### A2. D2: ACP 전환 리서치 (P3 — 리서치만)

**이게 뭔지**: tmux 기반 에이전트팀 → ACP(Agent Communication Protocol) 전환 가능성 검토.

**왜 필요한지**: tmux 기반의 구조적 한계 (좀비 pane, 승인 블로킹, capture-pane 파싱 불안정). ACP가 이걸 근본적으로 해결할 수 있는지 판단 필요.

**기획 범위 (리서치만 — 구현 X)**:
- ACP SDK 문서 파악
- 현재 hooks/chain 구조가 ACP 메시지 패턴과 얼마나 호환되는지 매핑
- 전환 시 깨지는 것 / 유지되는 것 목록
- CC Agent Teams 정식 출시 로드맵 확인 (실험 플래그 언제 빠지는지)
- 결론: "전환 시점 제안" or "아직 시기상조 근거"

**우선순위**: P3

---

### A3. D4: Webhook agentId 라우팅 (P3)

**이게 뭔지**: 외부 시스템(CI/CD 등)에서 webhook으로 특정 에이전트에 직접 메시지 전달.

**왜 필요한지**: 현재 체인은 peer-resolver로 역할명→peer ID 변환. 외부 시스템은 peer ID를 모름. webhook에 agentId/role 파라미터로 라우팅하면 CI/CD 연동 가능.

**기획 범위**:
- 구체적 사용 시나리오 정의 (어떤 외부 이벤트 → 어떤 에이전트)
- agent-ops-dashboard 서버(localhost:3847)에 라우팅 핸들러 설계
- D3(에러 분류) 완료 기반 — 에러 발생 → webhook → 에이전트 자동 배정 시나리오

**우선순위**: P3 (D3 완료 후)

---

## 트랙 B: OpenClaw 3.29 신기능 적용

### B1. requireApproval hooks — 팀원 권한 제어 혁신 (P0)

**이게 뭔지**: OpenClaw 3.29에 추가된 before_tool_call hook의 `requireApproval` 기능. hook이 실행을 멈추고 사용자에게 Slack 버튼/Discord/Telegram 또는 /approve 커맨드로 승인 요청 가능.

**현재 우리 방식**: validate-delegate.sh가 exit 2로 **무조건 차단**. 팀원이 위험한 파일 수정하면 작업 중단, 복구 불가.

**신기능 적용 시**:
```
팀원이 위험 파일 수정 시도
→ before_tool_call hook에서 requireApproval() 호출
→ Slack #알림채널에 승인/거부 버튼 표시
→ Smith님 or COO가 승인
→ 팀원 작업 재개
```

**기획 범위**:
- requireApproval API 스펙 파악 (PR #55339 참조)
- 승인 대상 범위 정의: 어떤 파일/도구에서 승인을 물어볼 것인지
  - .claude/ 디렉토리 수정 → 승인
  - DB migration 파일 → 승인
  - 환경변수/시크릿 파일 → 승인
  - src/ 일반 코드 → 차단 없음 (기존대로)
- Slack 알림 채널 + 메시지 포맷 설계
- /approve 커맨드 + plugin approval 통합 플로우
- 타임아웃 정책: N분 이내 응답 없으면 자동 거부
- validate-delegate.sh 리팩토링 계획 (exit 2 → requireApproval 전환)
- 기존 OFR-10~12 TDD 호환성 (테스트 수정 or 추가)

**우선순위**: P0 — 팀원 작업 중단 사고의 근본 해결

---

### B2. runHeartbeatOnce — patrol 즉시 트리거 (P1)

**이게 뭔지**: 플러그인에서 하트비트 1회를 즉시 트리거. delivery target 오버라이드 지원.

**현재 우리 방식**: heartbeat 5분 고정 주기. 체인 이벤트 발생해도 최대 5분 대기.

**신기능 적용 시**:
```
체인 이벤트(완료/실패/stuck) 발생
→ 플러그인이 runHeartbeatOnce({target: "last"}) 호출
→ COO가 즉시 patrol → 체인 진행 상황 실시간 감지
```

**기획 범위**:
- runHeartbeatOnce 플러그인 API 스펙 파악 (PR #40299 참조)
- 트리거 시점 정의: 어떤 이벤트에서 즉시 patrol을 돌릴 것인지
  - TASK 완료 → CTO/PM 체인 핸드오프 시
  - 에러 발생 → error-classifier가 critical 분류 시
  - 팀 stuck 감지 → 5분+ 무활동 시
- 기존 heartbeat(5분 주기) + 즉시 트리거 공존 설계
- target 오버라이드 활용 — last(마지막 활성 세션) vs 특정 에이전트

**우선순위**: P1

---

### B3. Memory flush 플러그인화 — compaction 생존율 향상 (P1)

**이게 뭔지**: pre-compaction memory flush가 플러그인 계약으로 이동. 커스텀 flush 대상/정책 제어 가능.

**현재 우리 방식**: config에 하드코딩된 flush prompt. SESSION-STATE.md + memory/날짜.md + SERVICE-VISION.md만 저장. D8-2에서 context-checkpoint.sh 만들었지만 트리거가 수동.

**신기능 적용 시**: 팀별 커스텀 flush 정책으로 에이전트팀 상태까지 자동 저장.

**기획 범위**:
- memory-core 플러그인 계약 스펙 파악
- 팀별 flush 정책 설계:
  - CTO: team-context.json + 현재 Wave + 빌드 상태 + 코드 변경 파일 목록
  - PM: 기획서 진행도 + 분석 결과 + Gap Rate
  - COO: 체인 진행 단계 + 팀 상태 + Smith님 결정사항
- context-checkpoint.sh와 통합 or 대체 판단
- flush 트리거: 80% threshold 자동 vs 주요 마일스톤에서만

**우선순위**: P1

---

### B4. Slack upload-file — 리포트 자동 배포 (P2)

**이게 뭔지**: Slack upload-file 액션으로 파일을 직접 채널에 업로드.

**현재 우리 방식**: 리포트를 텍스트로 Slack에 전송하거나 HTML URL 공유.

**기획 범위**:
- upload-file 액션 스펙 파악
- 적용 대상: coo-smith-report, Gap 분석, Match Rate 리포트
- 파일 포맷: .md vs .json vs .html
- 채널 + 스레드 타겟 설계

**우선순위**: P2

---

## PDCA 프로세스

이 TASK의 산출물: **Plan 문서**
→ COO 확인 → Design → Do → QA

## COO 의견

위 내용은 COO 의견일 뿐이다. 참고하되 최고의 방법을 찾아라.

특히:
- B1(requireApproval)이 우리 에이전트 자동화의 가장 큰 페인포인트를 해결한다. 깊이 파봐라.
- A2(ACP 리서치)는 시기상조일 수 있다. 리서치 결과로 "아직 아니다"가 나와도 정상.
- 트랙 A와 B의 의존성/시너지 확인 — 예: requireApproval + D4 webhook 조합 가능성

## 하지 말 것

- 코드 수정하지 마라 — 기획(Plan 문서)만
- P0+P1 완료된 항목(D5/D7/D8-1/D8-4/D3/D6/D8-5) 다시 건드리지 마라
- 기존 TDD 53건 수정하지 마라
- OpenClaw 소스코드 분석하지 마라 — 릴리즈 노트 + 문서 기반으로만

## 검증 기준

- 트랙 A (3건) + 트랙 B (4건) = 7개 항목 전부 Plan에 포함
- 각 항목: 구현 범위 + 수정 파일 + TDD 계획 + 의존성 + 예상 공수
- 우선순위 순서 + Wave 분배 제안
