# TASK: legacy-cleanup

> 작성일: 2026-04-05
> 작성자: 모찌 (COO)
> 프로젝트: bscamp
> 유형: 핫픽스 (Design 불필요)

---

## 배경

브릭 엔진 첫 Building 시도 시 bkit(이전 도구) 훅이 끼어들어서 실패. 레거시 잔재(.bkit, 과거 훅, 과거 프리셋, 이중 경로)를 전부 정리한다. tmux 에이전트팀도 더 이상 안 쓴다.

---

## 작업 목록 (순서대로)

### 1. bkit 플러그인 삭제
```
rm -rf ~/.claude/plugins/cache/bkit-marketplace/
~/.claude/plugins/cache/conductor/ — 확인 후 불필요 시 삭제
~/.claude/plugins/cache/every-marketplace/ — 확인 후 불필요 시 삭제
```

### 2. .claude/settings.json 정리
hooks 전부 삭제. tmux 훅 포함. 남길 것:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 3. .claude/hooks/ 38개 전부 삭제
```
rm -rf .claude/hooks/
```
브릭 엔진 Gate가 전부 대체.

### 4. 루트/.bkit/ 전체 삭제
```
rm -rf .bkit/
```
10MB. hooks 20개, 과거 프리셋, 과거 runtime, bkit 상태 전부.

### 5. brick/.bkit/ 전체 삭제
```
rm -rf brick/.bkit/
```
24KB. 레거시 런타임.

### 6. 서버 경로 통일
`brick/brick/dashboard/server.py`:
```
create_app(root=".bkit/") → create_app(root="brick/")
```
`brick/brick/dashboard/routes/engine_bridge.py`:
```
init_engine(root=".bkit/") → init_engine(root="brick/")
```
서버가 `brick/brick/presets/` 직접 읽고, `brick/brick/runtime/`에 쓰게.

### 7. 런타임 디렉토리 생성
```
brick/brick/runtime/          — init_engine 첫 실행 시 자동 생성
brick/brick/runtime/workflows/ — 체크포인트
```
.gitignore에 `brick/brick/runtime/` 추가.

### 8. 프리셋 경로 수정 (전체)
모든 프리셋의 artifacts 경로를 프로젝트 구조로 변경:
```yaml
# 변경 전
artifacts: ["docs/01-plan/features/{feature}.plan.md"]

# 변경 후
artifacts: ["brick/projects/{project}/plans/{feature}.plan.md"]
```
Design도 마찬가지:
```yaml
artifacts: ["brick/projects/{project}/designs/{feature}.design.md"]
```

### 9. 프로젝트 디렉토리 구조 생성
```
brick/projects/bscamp/plans/
brick/projects/bscamp/designs/
brick/projects/bscamp/reports/
brick/projects/brick-engine/plans/
brick/projects/brick-engine/designs/
brick/projects/brick-engine/reports/
```

### 10. 과거 프리셋 삭제
brick/.bkit/presets/의 t-pdca-*.yaml은 5번에서 이미 삭제됨. 
brick/brick/presets/에 과거 이름 없는지 확인.

### 11. QA FAIL 3건 수정 (Codex가 코드 작성함)
참조: `brick/docs/QA-result-codex.md`
- command_allowlist.py: 인터프리터 인자(-c, -e, --eval) 차단
- engine_bridge.py: _auto_recover_workflows() 추가
- event_bus.py: publish() try/except 격리

### 12. 서버 재시작 + 검증
- 서버 재시작
- `curl http://localhost:3202/api/v1/engine/health` → ok
- `pytest` 전체 Green
- `vitest` 전체 Green

---

## 범위 제한

- 엔진 로직 수정 없음 (경로 + 보안 수정만)
- 기존 docs/ 문서 이동하지 않음 (새 Building부터 새 경로 사용)
- tmux 세션 kill 안 함 (자연 종료)
