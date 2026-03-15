# SmartEditor 본문 주입 실패 분석: 우리 코드 vs 늑대플 패턴

## 현재 증상
- CDP `Input.insertText` 명령 자체는 성공 (에러 없음)
- 숨겨진 contenteditable(x=-9999)에 텍스트가 삽입됨
- SmartEditor 화면(React 렌더링)에는 미반영 — placeholder "글감과 함께..." 그대로
- Playwright `page.keyboard.type()`은 동일 에디터에서 정상 동작 (35자 테스트 성공)
- 늑대플 Chrome 확장은 같은 `Input.insertText`로 성공 (실제 서비스 중)

## 핵심 차이점 분석

| # | 항목 | 늑대플 (성공) | 우리 코드 (실패) | 문제 원인 |
|---|------|-------------|-----------------|----------|
| 1 | **tabId 획득** | `sender.tab.id` (메시지 발신 탭) | `chrome.tabs.query({active:true, currentWindow:true})` | **치명적**: service worker에 "현재 창" 개념 없음. 잘못된 탭에 debugger attach 가능 |
| 2 | **attach 전 detach** | 항상 먼저 detach 후 fresh attach | `attachedTabId` 캐시 재사용 (detach 안 함) | 이전 세션 잔존 시 stale 연결로 엉뚱한 타겟에 CDP 명령 전송 |
| 3 | **sender 전달** | `onMessage.addListener((msg, sender, ...)` → sender를 핸들러에 전달 | `_sender`로 무시 | tabId를 sender에서 안 가져오니 #1 문제 발생 |

## 상세 분석

### 문제 1: tabId 획득 방식 (치명적)

**우리 코드** (`service-worker.ts:87-97`):
```typescript
async function ensureDebuggerAttached(): Promise<number> {
  if (attachedTabId !== null) return attachedTabId;  // 캐시 재사용
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  // ...
}
```

**늑대플 패턴**:
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab.id;  // 메시지를 보낸 content script의 탭
  chrome.debugger.attach({ tabId }, "1.3", () => { ... });
});
```

**왜 문제인가**:
- `chrome.tabs.query({active: true, currentWindow: true})`는 service worker 컨텍스트에서 "현재 활성 탭"을 쿼리
- Service worker는 창(window) 개념이 없어 `currentWindow`가 불확실
- 사용자가 팝업 클릭 → content script가 메시지 전송 → service worker가 tabs.query 실행하는 동안 포커스가 팝업으로 이동했을 수 있음
- `sender.tab.id`는 content script가 실행 중인 **정확한 탭**을 보장

### 문제 2: 디버거 세션 재사용 (중요)

**우리 코드**: `attachedTabId`가 null이 아니면 재사용 → 이전 세션에서 detach 실패 시 stale 연결
**늑대플 패턴**: 매번 detach → attach (fresh session)

이전 attach가 살아있는 상태에서 새 attach를 시도하면 Chrome이 에러를 던지거나,
이전 세션의 디버거가 엉뚱한 프레임/타겟에 연결된 상태로 명령을 전송할 수 있음.

### 문제 3: SmartEditor ONE의 숨겨진 contenteditable

SmartEditor ONE 구조:
```
.se-documentTitle        ← 제목 영역 (contenteditable)
.se-component.se-text    ← 본문 컨테이너
  └ p.se-text-paragraph  ← 본문 문단 (contenteditable, visible)
[hidden contenteditable] ← x=-9999 위치, IME/컴포지션 처리용
```

CDP `Input.insertText`는 **현재 포커스된 요소**에 텍스트를 삽입함.
잘못된 탭에 attach하면 클릭 이벤트도 잘못된 탭에 전송되어,
본문 영역이 아닌 숨겨진 contenteditable에 포커스가 유지됨.

## 수정 계획

### service-worker.ts
1. `_sender` → `sender` 사용: `sender.tab.id`로 tabId 획득
2. `ensureDebuggerAttached()` 제거 → 각 핸들러에 `senderTabId` 전달
3. DEBUGGER_ATTACH: 기존 연결 detach 후 fresh attach
4. 모든 핸들러: `senderTabId` 파라미터 사용

### EditorInjector.ts
- 변경 불필요 (content script 측 로직은 정상)

### types.ts
- 변경 불필요 (메시지 타입은 정상)
