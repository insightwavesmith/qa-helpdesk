# TASK: 브릭 엔진 100% 완성

## 목표
Smith님이 대시보드에서 "실행" 누르면 에이전트한테 실제로 일이 가고, 끝나면 다음 에이전트한테 자동으로 넘어가는 상태.
변수 0%. 맑은 날이든 비 오는 날이든 돌아가야 한다.

## 현재 상태 (3x3 매트릭스 기준)
- 9칸 중 5칸 완성, 4칸 미완성
- 엔진 자체는 돌아감 (워크플로우 생성 + 블록 큐잉 확인됨)
- Adapter 코드는 있지만 실제 tmux 연결 안 됨

## 해야 할 것 5가지

### 1. Adapter 실연결 (가장 중요)
**현재**: `claude_agent_teams.py`에 MCP + tmux 코드 있음. `adapter_pool`에 주입 안 됨.
**목표**: 엔진이 블록 시작하면 → adapter가 tmux 세션에 실제로 메시지 보냄 → 에이전트가 일 시작
**비유**: 카톡 전송 버튼 연결

### 2. Adapter 재시도 (block.failed 대응)
**현재**: Gate 실패 시 retry는 있음 (state_machine.py 124줄). Adapter 실패 시 retry 없음.
**목표**: 에이전트 연결 실패 → 3회 재시도 → 초과 시 COO 알림
**비유**: 직원한테 전화 안 받으면 3번 더 걸고, 안 되면 상사한테 보고

### 3. 핸드오프 자동화 [Team×Link]
**현재**: 프리셋 YAML에 블록별 팀이 고정돼있지만, 블록 전환 시 다음 팀 호출이 자동 아님
**목표**: Plan 블록 완료 → Design 블록의 adapter 확인 → 자동으로 해당 팀 호출
**비유**: PM이 일 끝나면 CTO한테 자동으로 서류 넘어감

### 4. Express↔Python 프로세스 통합
**현재**: 수동으로 Express(3201)와 Python(3202) 따로 띄워야 함
**목표**: `npm start` 하나로 둘 다 뜸
**비유**: 스위치 하나로 사무실 전체 전원 켜기

### 5. 보안
**현재**: API 주소 아는 사람 아무나 조작 가능. Gate command에 Shell Injection 가능.
**목표**: 인증 없으면 API 사용 불가 + command gate에서 쉘 명령 필터링
**비유**: 사무실 출입증 + 위험물 반입 검사

## 기존 Design 참고
- `docs/02-design/features/brick-sprint2-engine-sync.design.md` (503줄)
- PM이 이미 작성한 것: EnginePoller, WebSocket 실시간, Adapter context 보강

## 기존 Design에서 빠진 것 (보완 필요)
1. Adapter retry 로직 (block.failed 시)
2. 핸드오프 자동화 (블록 전환 → 다음 팀 자동 호출)
3. 프로세스 통합 (Express에서 Python child_process 실행)
4. Shell Injection 방어 (command gate에서 allowlist 방식)
5. API Auth 미들웨어

## 검증 기준
- [ ] `POST /engine/start` → 블록 시작 → adapter가 tmux에 실제 메시지 전달
- [ ] 블록 완료 → 다음 블록의 다른 팀 자동 호출
- [ ] adapter 실패 시 3회 재시도 후 알림
- [ ] `npm start` 하나로 Express + Python 동시 기동
- [ ] 인증 없는 API 호출 → 401 응답
- [ ] command gate에 `; rm -rf /` → 차단

## 산출물
- 기존 Design 보완판: `docs/02-design/features/brick-engine-100pct.design.md`

## 제약
- COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
- 기존 코드 최대한 활용. 이미 있는 거 다시 만들지 마.
- **6단계 사고 프로세스 필수** — TASK 재해석 → 영향범위 → 선행조건 → 의존성 → 방법 도출 → 팀원 배정
