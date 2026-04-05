# TASK: 브릭 대시보드 UX 개선 — 스크래치 + 3축 쉽게

> 2026-04-05 모찌(COO). 기존 대시보드 개선. 디자인 X, 기능 UX만.

---

## 배경

기존 대시보드가 이미 꽤 만들어져 있다:
- React + Vite + @xyflow/react(React Flow) + dagre + dnd-kit
- 캔버스 노드 에디터 (BlockNode, LinkEdge, StartNode, EndNode)
- 프리셋 목록/편집, 실행 히스토리, 팀 관리
- 490줄짜리 BrickCanvasPage + 노드/엣지 커스텀 컴포넌트

근데 *Smith님이 실제로 쓸 수 있는 UX*가 아직 안 된다. "스크래치처럼 쉽게 3축을 조합"이 핵심.

---

## 현재 상태 (코드 확인 완료)

```
있는 것:
  ✅ React Flow 노드 에디터 (BrickCanvasPage 490줄)
  ✅ 블록 노드 5종 (Block, Start, End, Notify, Review)
  ✅ 링크 엣지 (LinkEdge)
  ✅ YAML↔Flow 직렬화 (yamlToFlow, flowToYamlFull)
  ✅ 연결 검증 (validateConnection)
  ✅ 실행 타임라인 (ExecutionTimeline)
  ✅ 실행 다이얼로그 (ExecuteDialog)
  ✅ 팀 관리 (AdapterSelector, ModelSelector, SkillEditor)
  ✅ dnd-kit 드래그앤드롭

없는 것 / 개선 필요:
  ❌ 워크플로우 실행 → 실시간 상태 업데이트 (WebSocket)
  ❌ 승인/반려 버튼 (대시보드에서)
  ❌ 실패 시 stderr 표시
  ❌ 프로젝트 선택 화면
  ❌ "실행" 한 번이면 끝나는 원클릭 UX
  ❌ 3축 조합이 직관적이지 않음 (YAML 지식 필요)
```

---

## 요구사항 — "스크래치처럼 쉽게"

### UX-1: 원클릭 워크플로우 실행
```
현재: API curl로 실행
개선: 
  프리셋 목록 → 클릭 → "feature 이름" 입력 → [▶ 실행] 버튼
  → 자동으로 /brick/runs/{id} 페이지로 이동
  → 실시간 블록 상태 표시
```

### UX-2: 블록 드래그앤드롭 조합 (스크래치)
```
현재: React Flow 있지만 빈 캔버스에서 시작
개선:
  좌측 사이드바에 블록 팔레트:
    📋 Plan  📐 Design  ⚡ Do  🧪 QA  🔍 Review  📊 Report
  → 드래그해서 캔버스에 놓기
  → 블록 사이 연결선 드래그 = Link 생성
  → Link 클릭 → 타입 선택 (순차/분기/루프/병렬/경쟁)
  → 블록 클릭 → 우측 패널에서 팀/Gate 설정
  → [💾 프리셋 저장] 버튼
```

### UX-3: 실행 중 실시간 상태
```
현재: 수동 새로고침
개선:
  /brick/runs/{id} 페이지에서:
  - 블록별 상태 뱃지 (queued→running→completed/failed)
  - 진행률 바
  - 에이전트 로그 실시간 스트리밍
  - 실패 시 stderr 표시 (토큰 마스킹)
  → SSE 또는 WebSocket으로 자동 업데이트
```

### UX-4: 승인/반려 (대시보드에서)
```
현재: API curl로만 가능
개선:
  approval Gate 대기 중인 블록 → "승인" "반려" 버튼
  반려 시 → 사유 입력 텍스트 필드
  → reject_reason이 context에 주입 → 재작성 루프
```

### UX-5: 프로젝트 선택
```
현재: API에 project 파라미터 수동 전달
개선:
  사이드바 상단에 프로젝트 드롭다운:
    📦 bscamp  🧱 brick-engine  🏢 skyoffice
  → 선택하면 해당 프로젝트의 워크플로우/프리셋만 표시
```

### UX-6: 3축 설정 직관화
```
현재: YAML 편집
개선:
  블록 클릭 → 우측 패널:
    [Block] 뭘 할 건지: ________________
    [Team]  누가: [claude_local ▼] 모델: [Opus ▼] 에이전트: [cto-lead ▼]
    [Gate]  검증: [artifact ✅] [approval ☐]  재시도: [3]
    [Link]  연결: 다음 블록으로 [sequential ▼]
```

---

## 기존 코드 참고

| 컴포넌트 | 경로 | 줄수 |
|----------|------|------|
| BrickCanvasPage | `src/pages/brick/BrickCanvasPage.tsx` | 490 |
| BlockNode | `src/components/brick/nodes/BlockNode.tsx` | - |
| LinkEdge | `src/components/brick/edges/LinkEdge.tsx` | - |
| BlockSidebar | `src/components/brick/BlockSidebar.tsx` | - |
| DetailPanel | `src/components/brick/panels/DetailPanel.tsx` | - |
| ExecutionTimeline | `src/components/brick/timeline/ExecutionTimeline.tsx` | - |
| CanvasToolbar | `src/components/brick/toolbar/CanvasToolbar.tsx` | - |
| ExecuteDialog | `src/components/brick/dialogs/ExecuteDialog.tsx` | - |
| AdapterSelector | `src/components/brick/team/AdapterSelector.tsx` | - |
| ModelSelector | `src/components/brick/team/ModelSelector.tsx` | - |
| useLiveUpdates | `src/hooks/useLiveUpdates.ts` | - |
| useExecutionStatus | `src/hooks/brick/useExecutions.ts` | - |
| yamlToFlow | `src/lib/brick/serializer.ts` | - |
| validateConnection | `src/lib/brick/connection-validator.ts` | - |

## 레퍼런스

- n8n: 노드 에디터 UX (React Flow 기반)
- Linear: 상태 표시 깔끔함
- Scratch: 블록 팔레트 → 드래그 → 조합

## 범위 제한

- 디자인 시스템 변경 없음 (기존 스타일 유지)
- 새 라이브러리 추가 최소화 (이미 @xyflow, dnd-kit 있음)
- 백엔드 API 변경 최소화 (기존 엔드포인트 활용)

## PM 산출물 요청

1. Plan — UX 6건 구현 순서 + 의존성
2. Design (통합 1개) — 각 UX 컴포넌트 인터페이스 + 상태 관리 + API 연결

COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
기존 코드 반드시 직접 읽고 써라.
