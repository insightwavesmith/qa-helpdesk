# Brick Spec Wrapper 버그 Design

> **피처**: brick-spec-wrapper (Spec Wrapper 자동 해제)
> **레벨**: L1 (버그 원인 명확)
> **작성**: PM | 2026-04-03
> **선행**: brick-pdca-preset.design.md, brick-backend-api.design.md

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) — `dashboard/server/db/index.ts` |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **프론트 dev 포트** | 3201 |
| **기존 불변식** | INV-EB-1~11 (engine-bridge). 이 Design은 기존 INV를 변경하지 않음 |
| **BlockStatus** | 9가지: pending, queued, running, gate_checking, waiting_approval, completed, failed, rejected, suspended |
| **현재 구현 상태** | PresetLoader._parse_preset() ✅ spec wrapper 감지 구현 완료 |

### 0.1 프리셋 YAML 형식 현황

현재 `.bkit/presets/`의 모든 프리셋은 **flat 형식** (kind+spec 없음). `brick/preset-v2` 스키마 사용.
spec wrapper 형식은 향후 kind: Preset + spec 구조로 전환 시 필요. 하위호환 필수.

---

## 1. 문제 정의

### 1.1 증상

`PresetLoader._parse_preset()`이 YAML 루트에서 `data.get('blocks')` 직접 접근.
실제 프리셋 YAML은 `spec` wrapper 구조:

```yaml
kind: Preset
name: t-pdca-l2
labels:
  level: l2
spec:            # ← 여기 안에 blocks/links/teams
  blocks: [...]
  links: [...]
  teams: {...}
```

`spec` 키를 벗기지 않으면 `blocks=[]`, `links=[]`, `teams={}` → 빈 워크플로우 생성.

### 1.2 버그 위치

**파일**: `brick/brick/engine/executor.py`
**메서드**: `PresetLoader._parse_preset()` (line 46~95)

```python
# 현재 코드 — 버그
def _parse_preset(self, data: dict) -> WorkflowDefinition:
    blocks = []
    for b in data.get("blocks", []):    # ← spec.blocks가 아닌 루트.blocks 접근
        ...
    links = []
    for link in data.get("links", []):  # ← spec.links가 아닌 루트.links 접근
        ...
    teams: dict[str, TeamDefinition] = {}
    for block_id, team_data in data.get("teams", {}).items():  # ← 동일
        ...
```

### 1.3 영향 범위

| 프리셋 | spec wrapper | 현재 동작 |
|--------|-------------|----------|
| t-pdca-l0.yaml | `kind + spec` 있음 | blocks 누락 |
| t-pdca-l1.yaml | `kind + spec` 있음 | blocks 누락 |
| t-pdca-l2.yaml | `kind + spec` 있음 | blocks 누락 |
| t-pdca-l3.yaml | `kind + spec` 있음 | blocks 누락 |
| hotfix.yaml | 확인 필요 | - |
| research.yaml | 확인 필요 | - |

모든 `kind: Preset` YAML이 영향받음.

---

## 2. 수정 방안

### 2.1 핵심 원칙

1. `spec` wrapper가 있으면 벗기고, 없으면 루트에서 직접 읽기 (하위 호환)
2. `kind` 필드 존재 여부로 wrapper 감지
3. 감지 로직은 `_parse_preset` 진입부에 1회만 실행

### 2.2 수정 코드

```python
def _parse_preset(self, data: dict) -> WorkflowDefinition:
    # spec wrapper 감지: kind 필드가 있으면 spec 내부를 사용
    if "kind" in data and "spec" in data:
        inner = data["spec"]
    else:
        inner = data

    blocks = []
    for b in inner.get("blocks", []):
        done_data = b.get("done", {})
        blocks.append(
            Block(
                id=b["id"],
                what=b.get("what", ""),
                done=DoneCondition(
                    artifacts=done_data.get("artifacts", []),
                    metrics=done_data.get("metrics", {}),
                    custom=done_data.get("custom", []),
                ),
                type=b.get("type", "Custom"),
                description=b.get("description", ""),
            )
        )
    links = []
    for link in inner.get("links", []):
        links.append(
            LinkDefinition(
                from_block=link["from"],
                to_block=link["to"],
                type=link.get("type", "sequential"),
                condition=link.get("condition", {}),
                max_retries=link.get("max_retries", 3),
                merge_strategy=link.get("merge_strategy", "all"),
                schedule=link.get("schedule", ""),
                branches=link.get("branches", []),
                on_fail=link.get("on_fail"),
            )
        )
    teams: dict[str, TeamDefinition] = {}
    for block_id, team_data in inner.get("teams", {}).items():
        teams[block_id] = TeamDefinition(
            block_id=block_id,
            adapter=team_data.get("adapter", "human"),
            config=team_data.get("config", {}),
        )

    # 메타데이터는 루트에서 읽기 (kind, name, labels 등)
    return WorkflowDefinition(
        name=data.get("name", ""),
        description=data.get("description", ""),
        blocks=blocks,
        links=links,
        teams=teams,
        schema=data.get("$schema", "brick/preset-v2"),
        extends=data.get("extends"),
        overrides=data.get("overrides", {}),
        level=data.get("level") or inner.get("level", 2),
    )
```

### 2.3 변경 요약

| 위치 | 변경 | 이유 |
|------|------|------|
| `_parse_preset` 진입부 | `if "kind" in data and "spec" in data` 분기 추가 | spec wrapper 감지 |
| `data.get("blocks")` → `inner.get("blocks")` | blocks 접근 경로 변경 | 실제 데이터 위치 |
| `data.get("links")` → `inner.get("links")` | links 접근 경로 변경 | 동일 |
| `data.get("teams")` → `inner.get("teams")` | teams 접근 경로 변경 | 동일 |
| `name`, `description` 등 | `data`(루트)에서 유지 | 메타데이터는 루트 |
| `level` | `data.get("level") or inner.get("level", 2)` | labels에도 level 가능 |

### 2.4 `load()` 메서드 영향

```python
def load(self, name: str) -> WorkflowDefinition:
    ...
    data = yaml.safe_load(path.read_text())
    defn = self._parse_preset(data)
    # extends도 루트에서 읽으므로 문제 없음
    if data.get("extends"):
        base = self.load(data["extends"])
        defn = self._merge(base, defn, data.get("overrides", {}))
    return defn
```

`extends`와 `overrides`는 루트에서 읽으므로 변경 불필요.

### 2.5 `_merge()` 메서드 영향

`_merge()`는 `WorkflowDefinition` 객체를 받으므로 YAML 구조와 무관. 변경 없음.

---

## 3. 하위 호환성

| YAML 형식 | kind 필드 | spec 필드 | 동작 |
|-----------|----------|----------|------|
| 신규 (kind+spec) | `Preset` | 있음 | `inner = data["spec"]` |
| 레거시 (flat) | 없음 | 없음 | `inner = data` (기존과 동일) |
| 혼합 (kind만, spec 없음) | 있음 | 없음 | `inner = data` (안전 폴백) |

조건: `"kind" in data **and** "spec" in data` — 둘 다 있어야 unwrap.

---

## 4. 관련 코드: gates/events 파싱

현재 `_parse_preset`은 `gates`와 `events`를 파싱하지 않음 (YAML에는 있지만 무시).
이 Design 범위는 blocks/links/teams 접근 경로 수정만. gates/events 파싱은 별도 TASK.

확인: t-pdca-l2.yaml 구조에서 gates와 events도 `spec` 내부에 있음:

```yaml
spec:
  blocks: [...]
  links: [...]
  teams: {...}
  gates: {...}    # ← spec 내부
  events: {...}   # ← spec 내부
```

향후 gates/events 파싱 추가 시에도 `inner`에서 읽으면 됨.

---

## 5. 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `brick/brick/engine/executor.py` | 수정 | `_parse_preset()` spec wrapper 감지 + inner 변수 |
| `brick/brick/tests/engine/test_spec_wrapper.py` | 신규 | TDD 케이스 |

---

## 6. TDD

### 테스트 파일: `brick/brick/tests/engine/test_spec_wrapper.py`

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| SW-001 | `test_sw01_parse_with_spec_wrapper` | kind+spec 구조 YAML 파싱 | blocks 6개 정상 로드 |
| SW-002 | `test_sw02_parse_flat_yaml` | spec 없는 flat YAML 파싱 | blocks 정상 로드 (하위 호환) |
| SW-003 | `test_sw03_spec_wrapper_links` | spec.links 7개 파싱 | links 7개, from/to 정확 |
| SW-004 | `test_sw04_spec_wrapper_teams` | spec.teams 파싱 | teams dict 키=block_id |
| SW-005 | `test_sw05_name_from_root` | name은 루트에서 읽기 | name == "t-pdca-l2" |
| SW-006 | `test_sw06_kind_only_no_spec` | kind만 있고 spec 없는 YAML | flat 모드 폴백, 에러 없음 |
| SW-007 | `test_sw07_empty_spec` | spec: {} (빈 spec) | blocks=[], links=[], teams={} |
| SW-008 | `test_sw08_load_real_preset_file` | 실제 t-pdca-l2.yaml 파일 로드 | blocks 6개 + links 7개 |
| SW-009 | `test_sw09_extends_with_spec_wrapper` | extends 프리셋도 spec wrapper | 베이스+차일드 병합 정상 |
| SW-010 | `test_sw10_gates_in_spec_ignored` | spec 내 gates 필드 존재해도 에러 없음 | 파싱 성공, gates 무시 |
| SW-011 | `test_sw11_level_from_labels` | labels.level 존재 시 level 추출 | level 값 정상 |
| SW-012 | `test_sw12_readonly_field_preserved` | YAML readonly: true 필드 | 파싱에 영향 없음 |

### 테스트 구현 코드 (핵심)

```python
import pytest
from pathlib import Path
from brick.engine.executor import PresetLoader
from brick.models.workflow import WorkflowDefinition

PRESETS_DIR = Path(__file__).parent.parent.parent.parent / ".bkit" / "presets"

# SW-001: spec wrapper 구조 파싱
def test_sw01_parse_with_spec_wrapper():
    loader = PresetLoader(PRESETS_DIR)
    data = {
        "kind": "Preset",
        "name": "test-preset",
        "spec": {
            "blocks": [
                {"id": "plan", "what": "기획", "done": {"artifacts": []}},
                {"id": "do", "what": "구현", "done": {"artifacts": []}},
            ],
            "links": [{"from": "plan", "to": "do", "type": "sequential"}],
            "teams": {"plan": {"adapter": "human"}},
        },
    }
    defn = loader._parse_preset(data)
    assert len(defn.blocks) == 2
    assert defn.blocks[0].id == "plan"
    assert defn.blocks[1].id == "do"

# SW-002: flat YAML 하위 호환
def test_sw02_parse_flat_yaml():
    loader = PresetLoader(PRESETS_DIR)
    data = {
        "name": "flat-preset",
        "blocks": [
            {"id": "plan", "what": "기획", "done": {"artifacts": []}},
        ],
        "links": [],
        "teams": {},
    }
    defn = loader._parse_preset(data)
    assert len(defn.blocks) == 1
    assert defn.name == "flat-preset"

# SW-008: 실제 프리셋 파일 로드
def test_sw08_load_real_preset_file():
    loader = PresetLoader(PRESETS_DIR)
    defn = loader.load("t-pdca-l2")
    assert len(defn.blocks) == 6  # plan, design, do, check, review, learn
    assert len(defn.links) == 7
    assert defn.name == "t-pdca-l2"
```

---

## 7. 불변식 (Invariant)

| ID | 규칙 | 검증 시점 |
|----|------|----------|
| INV-SW-1 | `_parse_preset` 반환값의 `blocks`는 YAML의 실제 블록 개수와 일치해야 함 | TDD SW-001, SW-008 |
| INV-SW-2 | `kind` 없는 YAML은 기존 동작과 100% 동일해야 함 (하위 호환) | TDD SW-002 |
| INV-SW-3 | `name`, `extends`, `overrides`는 항상 루트에서 읽어야 함 | TDD SW-005, SW-009 |
