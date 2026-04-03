# Brick Dashboard Browser QA Report

- Date: 2026-04-04 00:16 KST
- Project: `/Users/smith/projects/bscamp/dashboard`
- Requested target: Next.js app on `http://localhost:3000` or `http://localhost:3201`
- Actual target found: Vite app on `http://localhost:3201` with backend server on `http://localhost:3200`

## Executive Summary

Brick dashboard routes are reachable on the running Vite dev server at `http://localhost:3201` and return valid HTML with HTTP 200 for `/brick`, `/brick/projects`, and `/brick/canvas`.

The requested Next.js-specific checks do not match the dashboard implementation:
- `dashboard/package.json` uses `vite`, not `next`, for local development and production builds.
- Brick route files live under `src/pages/brick`, not `app/brick`.

React Flow is present in the Brick canvas page and the key node/edge registrations show valid JSX/TSX structure.

There are still notable build issues outside the running Brick page flow:
- `npx next build` fails because the project is not cleanly buildable as a Next app and hits a missing module in `src/proxy.ts`.
- `npm run build` fails due to server-side TypeScript errors unrelated to `src/pages/brick`.

## 1. Dev Server Status

Command run:
- `cd /Users/smith/projects/bscamp/dashboard && npm run dev`

Observed result:
- Vite frontend started successfully.
- Frontend URL: `http://localhost:3201/`
- Backend URL: `http://localhost:3200`

Relevant startup log excerpts:
- `VITE v5.4.21 ready`
- `Local: http://localhost:3201/`
- `server http://localhost:3200 에서 실행 중`
- `WebSocket 준비 완료`

## 2. HTTP Route Verification

### Requested URLs on port 3000

- `GET http://localhost:3000/brick` -> connection failed
- `GET http://localhost:3000/brick/projects` -> connection failed
- `GET http://localhost:3000/brick/canvas` -> connection failed

Conclusion:
- Nothing is serving Brick UI on port `3000` during this QA run.

### Working URLs on port 3201

- `GET http://localhost:3201/brick` -> `200 OK`, `Content-Type: text/html`
- `GET http://localhost:3201/brick/projects` -> `200 OK`, `Content-Type: text/html`
- `GET http://localhost:3201/brick/canvas` -> `200 OK`, `Content-Type: text/html`

HTML verification:
- All three responses begin with a valid HTML document including `<!DOCTYPE html>`.
- Returned page is the Vite app shell and should rely on client-side routing for route rendering.

Representative response excerpt:
```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
```

## 3. JavaScript Bundle / Build Checks

### Requested command: `npx next build 2>&1 | grep -E "(error|Error|warning|Warning)" | head -30`

Observed output:
- Warning: Next.js inferred workspace root due to multiple lockfiles.
- Build error occurred.
- Turbopack failed with a missing module.

Exact blocking error:
- `./src/proxy.ts:2:1`
- `Module not found: Can't resolve '@/lib/firebase/middleware'`

Assessment:
- This is not evidence of a Brick page bundle error specifically.
- It shows the repository cannot currently complete a Next.js build path cleanly.
- Since the dashboard package itself is Vite-based, this requested check is structurally mismatched to the app under test.

### Equivalent actual build check: `npm run build`

Observed warnings/errors:
- Vite emitted a chunk size warning.
- Build failed on server-side TypeScript errors.

Reported errors:
- `server/db/seed.ts(340,13): error TS2345`
- `server/services/knowledge.ts(55,52): error TS2769`
- `server/services/knowledge.ts(71,14): error TS2769`

Assessment:
- These failures are outside `src/pages/brick` and did not block the dev server from serving Brick routes.
- They do block a clean production build for the dashboard package.

## 4. Brick Component Compile Check

### Requested path pattern

Requested command referenced `app/brick`, but that path does not exist in this dashboard package.

Actual Brick implementation paths found:
- `src/pages/brick/BrickCanvasPage.tsx`
- `src/pages/brick/BrickOverviewPage.tsx`
- `src/pages/brick/BlockCatalogPage.tsx`
- `src/pages/brick/PresetListPage.tsx`
- `src/pages/brick/RunHistoryPage.tsx`
- `src/pages/brick/RunDetailPage.tsx`
- `src/components/brick/...`

### TypeScript check

Command run:
- `npx tsc --noEmit`

Observed result:
- Exit code `0`
- No diagnostics containing `brick`

Assessment:
- No direct TypeScript compile errors were surfaced for Brick-related files in the requested grep-based check.
- This supports that `src/pages/brick` and `src/components/brick` are at least not failing the standalone `tsc --noEmit` pass used here.

## 5. React Flow Verification

Command run:
- `grep -r "ReactFlow" src/pages/brick src/components/brick --include="*.tsx" -n`

Matches found:
- `src/pages/brick/BrickCanvasPage.tsx:3`
- `src/pages/brick/BrickCanvasPage.tsx:4`
- `src/pages/brick/BrickCanvasPage.tsx:415`
- `src/pages/brick/BrickCanvasPage.tsx:434`
- `src/pages/brick/BrickCanvasPage.tsx:486`
- `src/pages/brick/BrickCanvasPage.tsx:488`

Validation notes:
- `BrickCanvasPage.tsx` imports `ReactFlow` and `ReactFlowProvider` from `@xyflow/react`.
- `BrickCanvasPage.tsx` imports and wires `brickNodeTypes` and `brickEdgeTypes`.
- The JSX structure is valid at a glance:
  - `<ReactFlow ...>` wraps `MiniMap`, `Controls`, and `Background`
  - `<ReactFlowProvider>` wraps `<BrickCanvasInner />`
- Node and edge registries are present:
  - `src/components/brick/nodes/index.ts`
  - `src/components/brick/edges/index.ts`
- Sample component structure checked:
  - `src/components/brick/nodes/BlockNode.tsx`
  - `src/components/brick/edges/LinkEdge.tsx`

Assessment:
- React Flow canvas implementation exists and appears correctly imported and composed for the Brick canvas page.

## Findings

### Pass
- Brick dev server started successfully on `3201`.
- `/brick`, `/brick/projects`, `/brick/canvas` all returned valid HTML with `200 OK` on `3201`.
- React Flow canvas page exists and imports appear structurally correct.
- Brick-specific TypeScript grep check returned no diagnostics.

### Fail / Risk
- Requested port `3000` was not serving the app.
- Requested Next.js checks do not align with the dashboard package structure.
- `npx next build` fails with missing module `@/lib/firebase/middleware` from `src/proxy.ts`.
- `npm run build` fails due to non-Brick server TypeScript errors.

## Recommended Follow-up

1. Treat `http://localhost:3201` as the active Brick dashboard frontend entry for this package.
2. Update QA scripts/docs to use Vite paths (`src/pages/brick`, `src/components/brick`) instead of Next.js `app/brick` assumptions unless a separate Next app is intended.
3. Fix the missing import in `src/proxy.ts` if Next build is still expected for this repository.
4. Fix the server-side TypeScript errors in `server/db/seed.ts` and `server/services/knowledge.ts` before relying on production build health.
