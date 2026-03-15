# SmartEditor 본문 주입: 늑대플 vs 우리 코드 정밀 비교 분석

> 분석일: 2026-03-15
> 분석 대상:
> - 늑대플: `service-worker.js`, `content/blog.js`
> - 우리: `extension/src/background/service-worker.ts`, `extension/src/content/EditorInjector.ts`

---

## 1. 현재 증상

- CDP `Input.insertText` 명령 자체는 성공 (에러 없음)
- DOM의 숨겨진 contenteditable(x=-9999)에 텍스트가 삽입됨
- SmartEditor 화면(React 렌더링)에는 미반영 — placeholder "글감과 함께..." 그대로
- Playwright `page.keyboard.type()`은 동일 에디터에서 정상 동작 (35자 테스트 성공)
- 늑대플 Chrome 확장은 같은 `Input.insertText`로 성공 (실제 서비스 중)

**핵심 단서**: 텍스트가 "숨겨진 contenteditable"에 들어간다는 것은 **CDP 클릭이 보이는 에디터 영역에 포커스를 주지 못하고 있다**는 의미.

---

## 2. 이미 수정 완료된 항목 (커밋 09da7b3)

| # | 항목 | 수정 전 (실패) | 수정 후 (현재) | 상태 |
|---|------|---------------|---------------|------|
| 1 | tabId 획득 | `chrome.tabs.query({active:true})` | `sender.tab?.id` (service-worker.ts:13) | ✅ 수정됨 |
| 2 | detach→attach | 캐시 재사용 | 항상 detach 후 fresh attach (service-worker.ts:99-107) | ✅ 수정됨 |
| 3 | sender 전달 | `_sender`로 무시 | `senderTabId` 파라미터로 전달 (service-worker.ts:14) | ✅ 수정됨 |

**그런데도 여전히 실패한다면**, 아래의 미발견 차이점들이 원인.

---

## 3. Service Worker 비교 (신규 발견)

### 3-1. API 호출 스타일: Callback vs async/await

**늑대플** (`service-worker.js`):
```javascript
// 모든 CDP 명령이 callback 체인으로 연결됨
chrome.runtime.onMessage.addListener((r, p, t) => {
  // ...
  chrome.debugger.sendCommand({tabId:a}, "Input.dispatchMouseEvent",
    {type:"mousePressed", x:Math.round(e), y:Math.round(c), button:"left", clickCount:1},
    () => {
      chrome.debugger.sendCommand({tabId:a}, "Input.dispatchMouseEvent",
        {type:"mouseReleased", x:Math.round(e), y:Math.round(c), button:"left", clickCount:1},
        () => { t({success:true}) }  // sendResponse는 마지막 callback 안에서 호출
      );
    }
  );
  return true;  // 비동기 응답 표시
});
```

**우리 코드** (`service-worker.ts:7-23,202-209`):
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, senderTabId)
    .then(sendResponse)      // Promise 완료 후 sendResponse
    .catch(err => sendResponse({ success: false, error }));
  return true;
});

// ...
async function debuggerClick(tabId: number, x: number, y: number): Promise<void> {
  await chrome.debugger.sendCommand({tabId}, "Input.dispatchMouseEvent",
    {type: "mousePressed", x, y, button: "left", clickCount: 1});
  await chrome.debugger.sendCommand({tabId}, "Input.dispatchMouseEvent",
    {type: "mouseReleased", x, y, button: "left", clickCount: 1});
}
```

**영향**: 기능적으로 동일. Chrome MV3에서 `chrome.debugger.sendCommand`는 Promise 반환 지원. **문제 아님**.

### 3-2. DEBUGGER_ATTACH 에러 핸들링

**늑대플**:
```javascript
// detach 실패 시 lastError 무시하고 바로 attach
chrome.debugger.detach({tabId:e}, () => {
  chrome.runtime.lastError;  // 에러 소비 (무시)
  c();  // 바로 attach 실행
});
```

**우리 코드** (`service-worker.ts:99-107`):
```typescript
if (attachedTabId !== null) {
  try {
    await chrome.debugger.detach({ tabId: attachedTabId });
  } catch { /* 무시 */ }
  attachedTabId = null;
}
await chrome.debugger.attach({ tabId: senderTabId }, "1.3");
```

**차이**: 늑대플은 `attachedTabId` 캐시와 무관하게 **항상** 현재 `sender.tab.id`에 대해 detach를 시도. 우리는 `attachedTabId !== null`일 때만 이전 tabId로 detach. **만약 같은 탭에서 이전 세션이 남아있고 `attachedTabId`가 null로 리셋된 상태라면, 우리는 detach를 건너뛰게 됨**.

**영향**: ⚠️ 잠재적 문제. 늑대플처럼 항상 `senderTabId`로 detach 시도가 더 안전.

### 3-3. DEBUGGER_INSERT_TEXT 에러 체크

**늑대플**:
```javascript
chrome.debugger.sendCommand({tabId:a}, "Input.insertText", {text:r.text}, () => {
  chrome.runtime.lastError
    ? t({success:false, error:chrome.runtime.lastError.message})
    : t({success:true})
});
```

**우리 코드** (`service-worker.ts:148-150`):
```typescript
await chrome.debugger.sendCommand({tabId: attachedTabId}, "Input.insertText", {
  text: payload.text,
});
```

**차이**: 늑대플은 `chrome.runtime.lastError`를 명시적으로 체크. 우리는 await의 try/catch로 처리. **기능적으로 동일**.

---

## 4. Content Script 비교 (핵심 — 신규 발견)

### 4-1. ⚠️ iframe 오프셋 보정 ($t 함수) — 가장 의심되는 원인

**늑대플** (`blog.js:111`):
```javascript
function $t() {
  try {
    if (window.frameElement) {
      const t = window.frameElement.getBoundingClientRect();
      return { x: t.left, y: t.top };
    }
  } catch {}
  return { x: 0, y: 0 };
}
```

**사용처** — 모든 클릭 좌표에 $t() 오프셋을 더함:
```javascript
// blog.js:597 (kk 함수 — 줄바꿈)
const ee = ka(P, 0);            // 문단의 첫 글자 좌표 (iframe 내부 기준)
await Le({type: "DEBUGGER_CLICK", x: ee.x, y: ee.y});  // ka() 안에서 $t() 적용됨

// blog.js:771 (Rk 함수 — 포스팅)
const q = J.getBoundingClientRect();
const _ = $t();
await chrome.runtime.sendMessage({
  type: "DEBUGGER_CLICK",
  x: q.left + 5 + _.x,         // ← iframe 오프셋 더함
  y: q.top + q.height / 2 + _.y  // ← iframe 오프셋 더함
});
```

**우리 코드** (`EditorInjector.ts:147-223`):
```typescript
function getBodyAreaCoords(): { x: number; y: number } | null {
  const paragraph = textComponent.querySelector("p.se-text-paragraph");
  const rect = paragraph.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),  // ← iframe 오프셋 없음!
    y: Math.round(rect.top + rect.height / 2),   // ← iframe 오프셋 없음!
  };
}
```

**왜 치명적인가**:
- SmartEditor ONE이 **iframe 안에서 동작**하는 경우, `getBoundingClientRect()`는 **iframe viewport 기준** 좌표를 반환
- CDP `Input.dispatchMouseEvent`는 **메인 프레임 viewport 기준** 좌표를 기대
- iframe 오프셋 없이 클릭하면 **엉뚱한 위치를 클릭** → 보이는 에디터에 포커스가 안 잡힘 → 숨겨진 contenteditable에 텍스트 삽입
- 네이버 블로그 에디터는 글쓰기 페이지 자체가 iframe 안에 있을 수 있음 (all_frames manifest 설정에 따라)

**영향**: 🔴 **치명적 — 가장 유력한 실패 원인**

### 4-2. ⚠️ 클릭 좌표 정밀도 (ka 함수 vs 영역 중심)

**늑대플** (`blog.js:111`) — Range API로 특정 글자 오프셋의 정확한 위치 계산:
```javascript
function rk(t, e) {  // 문단 내 charOffset 위치의 TextNode 찾기
  const r = t.querySelectorAll("span.__se-node");
  let n = e;
  for (const o of r) {
    const i = document.createTreeWalker(o, NodeFilter.SHOW_TEXT);
    let s;
    for (; s = i.nextNode(); ) {
      const a = (s.textContent || "").length;
      if (n <= a) return { node: s, offset: n };
      n -= a;
    }
  }
  return null;
}

function ka(t, e) {  // charOffset 위치의 화면 좌표
  const r = rk(t, e);
  if (!r) return null;
  const n = document.createRange();
  n.setStart(r.node, r.offset);
  n.setEnd(r.node, r.offset);
  const o = n.getBoundingClientRect();  // Range의 정확한 좌표
  const i = $t();                        // + iframe 오프셋
  return {
    x: o.left + i.x,
    y: o.top + o.height / 2 + i.y
  };
}
```

**우리 코드** (`EditorInjector.ts:147-163`) — 영역 중심 클릭:
```typescript
const rect = paragraph.getBoundingClientRect();
return {
  x: Math.round(rect.left + rect.width / 2),  // 문단의 정중앙
  y: Math.round(rect.top + rect.height / 2),
};
```

**차이**:
- 늑대플: **첫 번째 글자(offset=0)의 정확한 위치**를 Range API로 계산 → SmartEditor가 커서를 정확히 인식
- 우리: **문단 영역의 정중앙** → 빈 문단이면 텍스트가 없어 padding/margin 영역을 클릭할 수 있음

**영향**: ⚠️ 중간 — 정중앙 클릭도 포커스는 잡혀야 하지만, SmartEditor의 이벤트 핸들링이 까다로울 수 있음

### 4-3. ⚠️ scrollIntoView 호출

**늑대플** (`blog.js:597`):
```javascript
P.scrollIntoView({behavior:"instant", block:"center"});
await fe(300);  // 스크롤 완료 대기
const ee = ka(P, 0);
await Le({type: "DEBUGGER_CLICK", x: ee.x, y: ee.y});
```

**우리 코드** (`EditorInjector.ts:234-262`):
```typescript
const coords = getBodyAreaCoords();  // 스크롤 없이 바로 좌표 계산
// ...
await chrome.runtime.sendMessage({
  type: "DEBUGGER_CLICK",
  payload: { x: coords.x, y: coords.y },
});
```

**차이**: 늑대플은 클릭 전에 반드시 `scrollIntoView` → 요소가 화면에 보이는 상태에서 좌표 계산. 우리는 스크롤 없이 바로 좌표 계산 → **요소가 뷰포트 밖에 있으면 getBoundingClientRect()가 음수 좌표 반환** → CDP 클릭이 화면 밖을 클릭하게 됨.

**영향**: ⚠️ 중간 — 에디터가 뷰포트 안에 보이면 무관하지만, 보장되지 않음

### 4-4. ⚠️ Escape 키 선행 입력

**늑대플** (`blog.js:771`):
```javascript
await Le({type: "DEBUGGER_ESCAPE"});   // ← 먼저 Escape로 현재 선택/모달 해제
await fe(200);
Q.scrollIntoView({behavior:"instant", block:"center"});
await fe(300);
// 그 다음 클릭
```

**우리 코드**: Escape 키 전송 없음.

**영향**: ⚠️ 낮음~중간 — SmartEditor에 팝업/툴바가 열려있으면 클릭이 에디터가 아닌 UI 요소에 흡수될 수 있음

### 4-5. 서로게이트 페어(이모지) 처리

**늑대플** (`blog.js:111-112`, Aa 함수):
```javascript
async function Aa(t, e = false) {
  const r = t.split("\n").filter(n => n.trim().length > 0);
  for (let n = 0; n < r.length; n++) {
    // 서로게이트 페어(이모지) 포함 여부 체크
    const i = /[\uD800-\uDFFF]/.test(r[n]) ? [...r[n]] : [r[n]];
    for (const s of i)
      await Le({type: "DEBUGGER_INSERT_TEXT", text: s}),
      i.length > 1 && await fe(5);  // 글자별 5ms 딜레이
    await fe(100);
    // Enter 처리
    n < r.length - 1 && (
      await Le({type: "DEBUGGER_ENTER"}),
      await fe(100),
      e && /[.!?]$/.test(r[n].trimEnd()) && (
        await Le({type: "DEBUGGER_ENTER"}),
        await fe(100)
      )
    );
  }
}
```

**우리 코드** (`EditorInjector.ts:265-285`):
```typescript
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  await chrome.runtime.sendMessage({
    type: "DEBUGGER_INSERT_TEXT",
    payload: { text: line },    // ← 줄 전체를 한번에 전송
  });
  await delay(100);
  // Enter 처리 (유사)
}
```

**차이**:
- 늑대플: 이모지(서로게이트 페어)가 포함된 줄은 **한 글자씩** 분리하여 전송, 5ms 간격
- 우리: 줄 전체를 한번에 전송 (이모지 포함 여부 무관)

**영향**: ⚠️ 낮음 — 이모지가 없는 순수 한글 텍스트에서는 무관. 이모지 포함 시 깨질 수 있음.

### 4-6. sendMessage 타임아웃 래퍼 (Le 함수)

**늑대플** (`blog.js:111`):
```javascript
const Le = async (t, e = 5000) =>
  Promise.race([
    chrome.runtime.sendMessage(t),
    new Promise((r, n) => setTimeout(
      () => n(new Error(`CDP timeout: ${t.type}`)), e
    ))
  ]);
```

**우리 코드**: 타임아웃 없이 `chrome.runtime.sendMessage()` 직접 호출.

**영향**: 낮음 — 행(hang) 방지용. 직접적인 실패 원인은 아님.

### 4-7. DEBUGGER_DETACH 호출 (Ta 함수)

**늑대플** (`blog.js:111`):
```javascript
async function Ta() {
  try {
    await Le({type: "DEBUGGER_DETACH"}, 3000);  // 3초 타임아웃
  } catch {}
}
```

**우리 코드** (`EditorInjector.ts:288-289`):
```typescript
await delay(500);
await chrome.runtime.sendMessage({ type: "DEBUGGER_DETACH" });
```

**영향**: 낮음 — 동일한 동작.

---

## 5. Service Worker: detach 시 항상 senderTabId 사용

**늑대플**: DEBUGGER_ATTACH 시 **항상 sender.tab.id로 detach** 시도 (이전 attachedTabId와 무관):
```javascript
if (r.type === "DEBUGGER_ATTACH") {
  const e = p.tab?.id;   // sender.tab.id
  // 항상 이 tabId로 먼저 detach
  chrome.debugger.detach({tabId: e}, () => {
    chrome.runtime.lastError;  // 에러 무시
    // 그 다음 같은 tabId로 attach
    chrome.debugger.attach({tabId: e}, "1.3", () => { ... });
  });
}
```

**우리 코드** (`service-worker.ts:95-109`):
```typescript
async function handleDebuggerAttach(senderTabId) {
  // 캐시된 이전 tabId로 detach (다른 탭일 수 있음!)
  if (attachedTabId !== null) {
    try { await chrome.debugger.detach({ tabId: attachedTabId }); }
    catch { /* ... */ }
    attachedTabId = null;
  }
  // senderTabId로 attach
  await chrome.debugger.attach({ tabId: senderTabId }, "1.3");
}
```

**차이**: 늑대플은 **현재 sender의 tabId로 detach** (같은 탭의 이전 세션 정리). 우리는 **이전에 저장된 다른 tabId로 detach** (다른 탭의 세션을 정리하지만, 같은 탭의 이전 세션은 놓칠 수 있음).

**영향**: ⚠️ 중간 — 같은 탭에서 연속 사용 시 이전 디버거 세션이 남아있을 수 있음

---

## 6. 전체 비교표 (요약)

| # | 항목 | 늑대플 (성공) | 우리 코드 (실패) | 심각도 | 상태 |
|---|------|-------------|-----------------|--------|------|
| 1 | tabId 획득 | `sender.tab.id` | `sender.tab?.id` | 치명적 | ✅ 수정됨 |
| 2 | detach→attach | 항상 | 항상 | 치명적 | ✅ 수정됨 |
| 3 | **iframe 오프셋** | `$t()` — 모든 좌표에 iframe 위치 보정 | **미적용** | 🔴 치명적 | ❌ 미수정 |
| 4 | **클릭 정밀도** | `ka()` — Range API로 글자 단위 좌표 | 문단 중심 좌표 | ⚠️ 중간 | ❌ 미수정 |
| 5 | **scrollIntoView** | 클릭 전 반드시 실행 + 300ms 대기 | 미실행 | ⚠️ 중간 | ❌ 미수정 |
| 6 | **detach 대상** | sender의 tabId로 detach | 캐시된 이전 tabId로 detach | ⚠️ 중간 | ❌ 미수정 |
| 7 | Escape 선행 | 클릭 전 Escape로 UI 초기화 | 미실행 | ⚠️ 낮음 | ❌ 미수정 |
| 8 | 서로게이트 페어 | 이모지 한 글자씩 분리 전송 | 줄 전체 전송 | ⚠️ 낮음 | ❌ 미수정 |
| 9 | sendMessage 타임아웃 | 5초 타임아웃 | 타임아웃 없음 | ℹ️ 참고 | ❌ 미수정 |
| 10 | API 스타일 | callback | async/await | ℹ️ 무관 | — |

---

## 7. 결론: 수정 방향 (코드 수정은 별도 TASK)

### 1순위: iframe 오프셋 ($t 함수 포팅) — 가장 유력한 원인

`EditorInjector.ts`에 `$t()` 동등 함수를 추가하고, `getBodyAreaCoords()`를 포함한 모든 좌표 계산에 iframe 오프셋을 더해야 함.

```typescript
// 추가 필요
function getIframeOffset(): { x: number; y: number } {
  try {
    if (window.frameElement) {
      const rect = (window.frameElement as HTMLElement).getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    }
  } catch { /* cross-origin iframe 등 */ }
  return { x: 0, y: 0 };
}
```

### 2순위: scrollIntoView + 클릭 전 Escape

```typescript
// injectContent 함수에서 클릭 전:
paragraph.scrollIntoView({ behavior: "instant", block: "center" });
await delay(300);
// Escape로 UI 초기화
await chrome.runtime.sendMessage({ type: "DEBUGGER_ESCAPE" });
await delay(200);
```

### 3순위: detach 대상을 senderTabId로 변경

`service-worker.ts`의 `handleDebuggerAttach`에서 `attachedTabId` 대신 `senderTabId`로 detach:

```typescript
// 현재: if (attachedTabId !== null) detach(attachedTabId)
// 변경: 항상 senderTabId로 detach 시도 (에러 무시)
try { await chrome.debugger.detach({ tabId: senderTabId }); } catch {}
await chrome.debugger.attach({ tabId: senderTabId }, "1.3");
```

### 4순위: 서로게이트 페어 처리 (이모지 대응)

`EditorInjector.ts`의 줄별 입력 로직에 이모지 분리 추가.

### 5순위: sendMessage 타임아웃 래퍼

Le 함수와 동등한 타임아웃 래퍼 추가 (hang 방지).

---

## 8. 검증 방법

수정 후 아래 시나리오에서 테스트:

1. **기본 한글 텍스트**: 3줄 이상의 한글 본문 주입 → 화면에 표시되는지
2. **이모지 포함 텍스트**: 🎯📊 등 이모지가 포함된 텍스트 → 깨지지 않는지
3. **연속 주입**: 같은 탭에서 2회 연속 주입 → 두 번째도 성공하는지
4. **iframe 환경**: 네이버 블로그 글쓰기 페이지에서 content script가 iframe 안에서 동작하는지 확인
5. **스크롤 필요한 경우**: 에디터가 화면 아래에 있을 때 → 스크롤 후 정상 동작하는지

### iframe 확인 방법
```javascript
// content script에서 실행
console.log('frameElement:', window.frameElement);
console.log('parent === self:', window.parent === window.self);
console.log('location:', window.location.href);
```
`window.frameElement`가 null이 아니면 iframe 안. `window.parent !== window.self`도 iframe 안.
