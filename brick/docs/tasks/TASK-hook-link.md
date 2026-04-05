# TASK: Hook Link 타입

## 요약
7번째 Link 타입 `hook` 추가 — 외부 이벤트(git commit 등)가 브릭 블록을 발동시킨다.

## 현재 상태
- Link 6종: sequential | parallel | compete | loop | cron | branch
- 외부 이벤트로 블록을 트리거하는 방법 없음

## 요구사항
1. `state_machine.register_link("hook", handler)` 추가
2. API 엔드포인트: `POST /api/v1/engine/hook/{workflow_id}/{link_id}`
   - 외부에서 이 URL 호출하면 해당 Link가 발동 → 다음 블록 시작
3. YAML에서 이렇게 설정:
```yaml
links:
  - from: do
    to: codex-qa
    type: hook
    condition:
      event: "git.commit"
```
4. hook Link는 from 블록 완료 후 *대기 상태*로 있다가, 외부 API 호출이 오면 발동

## 수정 대상 파일
- `brick/engine/state_machine.py` — `_resolve_hook` 핸들러 + register
- `brick/dashboard/routes/engine_bridge.py` — `/hook/{workflow_id}/{link_id}` 엔드포인트
- `brick/models/link.py` — hook 관련 condition 필드 (이미 있음, 타입만 추가)

## 테스트 기준
- hook Link 설정된 워크플로우: from 블록 완료 후 다음 블록 시작 안 됨 (대기)
- API 호출 시 다음 블록 시작됨
- 잘못된 workflow_id/link_id → 404
- 기존 테스트 깨지지 않을 것

## Design 참조
- Link 레지스트리: `brick/engine/state_machine.py` L34~52
- API 라우트: `brick/dashboard/routes/engine_bridge.py`
