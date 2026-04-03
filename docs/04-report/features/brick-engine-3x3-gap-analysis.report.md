# 브릭 엔진 3×3 매트릭스 Gap 분석 보고서

> **작성**: PM | 2026-04-04
> **대상**: COO(모찌) → Smith님
> **맥락**: Design 3건 완료 후 "엔진이 3×3 자유도로 돌아가느냐" 질문에 대한 답

---

## 1. 결론 (한 줄)

**메인 PDCA 루프는 돈다. 하지만 3×3 전체 자유도는 아직 아니다. Adapter 8종 스텁이 최대 병목.**

---

## 2. 완료된 Design 3건 요약

| Design | 내용 | TDD | 불변식 |
|--------|------|-----|--------|
| Sprint1 버그수정 | 15개 버그 수정 (엔진 코어 5 + API 10) | 45건 | 14건 |
| Sprint2 동기화 | EnginePoller + Adapter 모니터링 + WebSocket 실시간 | 14건 | 5건 |
| 엔진 100% | Adapter 재시도 + 핸드오프 자동화 + 프로세스 통합 + 보안 | 30건 | 13건 |
| **합계** | | **89건** | **32건** |

---

## 3. 3×3 매트릭스 커버리지

### Brick축 (Block 상태 전이) — ✅ 9/9 완성

pending → queued → running → gate_checking → completed/failed/rejected/suspended/waiting_approval 전부 전이 경로 존재.

### Team축 (Adapter) — ❌ 1/9만 실동작

| Adapter | 상태 |
|---------|------|
| **claude_agent_teams** | ✅ 실동작 (MCP + tmux) |
| claude_code | ❌ 스텁 |
| codex | ❌ 스텁 |
| human | ❌ 스텁 |
| human_management | ❌ 스텁 |
| management | ❌ 스텁 |
| mcp_bridge | ❌ 스텁 |
| webhook | ❌ 스텁 |

### Link축 — ⚠️ 4/6 완성

| Link Type | 상태 |
|-----------|------|
| sequential | ✅ |
| parallel | ✅ |
| loop | ✅ |
| branch | ✅ |
| **compete** | ⚠️ "1등만 통과" 로직 없음 |
| **cron** | ❌ 미구현 (`pass`) |

---

## 4. Design 3건 구현 후 돌아가는 시나리오

```
✅ Plan(claude_agent_teams) → sequential → Design(claude_agent_teams)
   → sequential → Do(claude_agent_teams) → branch(match_rate < 90)
   → loop → Do 재실행 → Check → Act
   
= PDCA 사이클이 claude_agent_teams 하나로 자동 순환
= Smith님이 "실행" 누르면 끝까지 자동. 실패해도 3회 재시도.
```

## 5. 돌아가지 않는 시나리오

```
❌ Plan(human팀) → Do(claude_code팀) → QA(codex팀)
   = adapter 3종이 스텁 → 블록 시작 no-op

❌ A블록 → compete → B/C블록 (먼저 끝난 쪽만 통과)
   = compete finalize 로직 없음

❌ cron → 매일 00:00 자동 실행
   = 미구현
```

---

## 6. 남은 빈 칸 4건

| # | 빠진 것 | 영향 | 규모 | 우선순위 |
|---|---------|------|------|---------|
| 1 | **Adapter 8종 스텁** | 블록마다 다른 팀/도구 사용 불가 | Design 1건 + 구현 대형 | **P0** — 3×3 핵심 |
| 2 | **cron 링크** | 주기적 실행 블록 불가 | 소~중형 | P1 |
| 3 | **compete finalize** | parallel과 차이 없음 | 소형 | P2 |
| 4 | **프리셋 스키마 검증** | 잘못된 YAML → 런타임 에러 | 중형 | P1 |

### Adapter 확장 우선순위 (추천)

| 순위 | Adapter | 이유 |
|------|---------|------|
| 1 | **webhook** | 범용. 외부 서비스 연동 즉시 가능 |
| 2 | **human** | 수동 승인 UI 연동. COO/Smith님 직접 개입 가능 |
| 3 | **claude_code** | 단독 에이전트 실행. Agent Teams 없이도 작동 |

---

## 7. Smith님 판단 필요 사항

1. **현재 3건 Design 구현부터 밀고 갈 것인가?** (메인 루프 먼저 완성)
2. **Adapter 확장 Design을 추가로 작성할 것인가?** (3×3 완성)
3. **우선순위**: webhook → human → claude_code 순서 괜찮은지?

---

*PM 분석 완료. COO가 Smith님께 보고 후 방향 결정 요청.*
