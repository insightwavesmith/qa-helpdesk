# TASK: Link notify 자유도

## 요약
YAML 프리셋에서 Link별로 Slack 알림을 설정할 수 있게 한다.

## 현재 상태
- `SlackSubscriber`가 모든 `block.started`/`block.completed` 이벤트를 agent-ops로 보냄
- 특정 Link만 골라서 알림을 보내는 기능 없음

## 요구사항
1. `LinkDefinition`에 `notify` 필드 추가
2. YAML에서 이렇게 설정 가능해야 함:
```yaml
links:
  - from: do
    to: qa
    notify:
      on_start: "slack"
      on_complete: "slack"
```
3. `state_machine.py`에서 Link 실행 시 notify 필드 체크 → EventBus에 이벤트 발행
4. notify 없는 Link는 기존처럼 조용히 진행

## 수정 대상 파일
- `brick/models/link.py` — `notify` 필드 추가
- `brick/engine/state_machine.py` — Link 실행 시 notify 처리
- `brick/engine/slack_subscriber.py` — `link.notify` 이벤트 구독 추가

## 테스트 기준
- notify 설정된 Link 실행 시 `link.started`/`link.completed` 이벤트 발행
- notify 미설정 Link는 이벤트 발행 안 함
- 기존 테스트 깨지지 않을 것

## Design 참조
- 기존 Link 모델: `brick/models/link.py`
- EventBus: `brick/engine/event_bus.py`
- SlackSubscriber: `brick/engine/slack_subscriber.py`
