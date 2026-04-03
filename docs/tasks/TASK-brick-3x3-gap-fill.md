# TASK: brick-3x3-gap-fill

**담당**: CTO-1 (sdk-cto)
**선행**: brick-engine-100pct 완료 후 즉시
**Design**: docs/02-design/features/brick-3x3-gap-fill.design.md (52KB)
**TDD**: 32건 (G1-01 ~ G1-32)
**불변식**: 12건

---

## 목표

엔진 인프라(engine-100pct) 완료 후, 3×3 완전 자유도를 달성한다.

현재 상태:
- Team 축: claude_agent_teams만 실동작. webhook/human/claude_code = 껍데기
- Link 축: compete = sequential과 동일, cron = pass

이 TASK 완료 후:
- Team 축: 4종 어댑터 전부 프로덕션 수준
- Link 축: 6종 링크 전부 동작

---

## 구현 순서

### Phase A: 프리셋 검증 (독립, 최우선)
- `brick/brick/engine/preset_validator.py` — 신규 (PresetValidator 클래스)
- `brick/brick/engine/executor.py` — start()에서 검증 호출
- `brick/brick/engine/condition_evaluator.py` — 파싱 실패 True→False 변경
- `brick/brick/engine/executor.py` — link 파싱에 schedule/teams/judge 추가

TDD: G1-28 ~ G1-32

### Phase B-1: Adapter 3종 강화 (Phase A 완료 후, B-2와 병렬)
- `brick/brick/adapters/webhook.py` — 콜백+인증+상태파일+재시도
- `brick/brick/adapters/human.py` — 타임아웃+상태파일+대시보드 연동
- `brick/brick/adapters/claude_code.py` — MCP/tmux 실연결 전면 재작성
- `brick/brick/dashboard/routes/engine_bridge.py` — adapter_pool 4종 등록
- `dashboard/server/routes/brick/human-tasks.ts` — 신규 (수동 완료 API)
- `dashboard/server/routes/brick/index.ts` — human-tasks 라우트 등록

TDD: G1-01 ~ G1-17

### Phase B-2: cron 링크 (Phase A 완료 후, B-1과 병렬)
- `brick/brick/engine/cron_scheduler.py` — 신규 (asyncio 기반)
- `brick/brick/engine/state_machine.py` — cron 케이스 → 스케줄러 등록
- `brick/brick/engine/executor.py` — CronScheduler 통합
- 의존성: `croniter` (pip install croniter)

TDD: G1-18 ~ G1-22

### Phase C: compete finalize (Phase B-1 완료 후)
- `brick/brick/engine/state_machine.py` — compete → CompeteStartCommand
- `brick/brick/engine/executor.py` — CompeteStartCommand + _monitor_compete

TDD: G1-23 ~ G1-27

---

## 주의사항

1. condition_evaluator 파싱 실패 True→False 변경 시 **기존 프리셋 7개 호환성 먼저 확인**
2. engine-100pct의 _checkpoint_lock, block.adapter_failed, API Auth 그대로 유지
3. adapter_pool에 claude_code, webhook, human 추가 (claude_agent_teams 기존 유지)
4. human-tasks.ts에 requireBrickAuth 미들웨어 반드시 적용

---

## 완료 기준

- Python TDD 32건 전부 PASS
- 기존 421개 테스트 regression 없음
- `tmux send-keys -t sdk-cto.0 "[CHAIN] brick-3x3-gap-fill 완료" Enter`
