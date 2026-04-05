# TASK: 12건 기존 test fail 수정

## 요약
3axis 플러그인 전환 후 상태 전이 타이밍이 바뀌면서 기존 테스트 12건이 깨짐. 테스트 assertion을 현재 엔진 동작에 맞게 수정한다.

## 실패 목록
```
brick/tests/dashboard/test_engine_bridge.py::test_eb01_start_workflow_returns_blocks
brick/tests/dashboard/test_engine_bridge.py::test_eb04_complete_block_gate_pass
brick/tests/dashboard/test_engine_bridge.py::test_eb06_complete_block_gate_fail_branch
brick/tests/dashboard/test_engine_bridge.py::test_eb14_loop_max_iterations
brick/tests/dashboard/test_engine_bridge.py::test_eb15_parallel_next_blocks
brick/tests/dashboard/test_engine_bridge.py::test_eb46_adapter_start_block_called
brick/tests/dashboard/test_engine_bridge.py::test_eb47_adapter_failure_block_stays_queued
brick/tests/dashboard/test_engine_bridge.py::test_eb48_adapter_retry_ep8
brick/tests/dashboard/test_engine_bridge.py::test_eb49_concurrent_two_workflows
brick/tests/engine/test_loop_exit.py::test_le09_invalid_pattern
brick/tests/test_dashboard_phase3a.py::test_bd102_command_gate_exit1_fail
brick/tests/test_dashboard_phase3a.py::test_bd103_command_gate_timeout
```

## 원인
- `queued` → `running` 전이 타이밍: adapter_pool에 어댑터 등록 시 start_block 즉시 호출 → 블록이 queued에서 running으로 바로 전이
- 테스트가 `assert status == "queued"` 검증하는데 실제로는 이미 running
- gate 관련: command gate의 에러 메시지/타임아웃 assertion 불일치

## 수정 방향
- 엔진 코드 수정 아님 — 테스트 assertion만 수정
- 현재 엔진 동작이 정상이므로 테스트를 맞춰야 함
- 수정 후 전체 테스트 `448+ passed / 0 failed` 목표

## 수정 대상 파일
- `brick/tests/dashboard/test_engine_bridge.py`
- `brick/tests/engine/test_loop_exit.py`
- `brick/tests/test_dashboard_phase3a.py`

## 테스트 기준
- 12건 전부 PASS
- 기존 PASS 테스트 깨지지 않을 것
- `python3 -m pytest brick/tests/ -q --tb=no` → 0 failed
