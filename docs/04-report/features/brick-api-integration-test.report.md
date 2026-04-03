# Brick API Integration Test Report

- Date: 2026-04-04 00:20:06 KST
- Target server: `http://localhost:3201`
- Scope: Requested Brick workflow engine API endpoints
- Method: Real `curl` requests against the running Express server

## Environment Notes

First probe to `http://localhost:3201/api/brick/health` did not return a healthy API response.

Attempted recovery:

```bash
cd /Users/smith/projects/bscamp/dashboard && npm run dev &
```

Result:

- `npm run dev` was not stable for this test run because Vite/tsx startup conflicted with existing ports and watcher requirements.
- To complete the requested localhost:3201 validation, I started the built Express server directly on port 3201:

```bash
cd /Users/smith/projects/bscamp/dashboard
PORT=3201 node dist/server/index.js
```

This server responded successfully for Brick API routes.

## Summary

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/brick/health` | FAIL | Route not implemented, returned `404` |
| `POST /api/brick/projects` | PASS | Returned `201` with created project object |
| `GET /api/brick/projects` | PASS | Returned `200` with project array |
| `GET /api/brick/projects/:id` | PASS | Returned `200` with project detail, `invariants`, `executions` |
| `DELETE /api/brick/projects/:id` | PASS | Returned `204 No Content` |
| `POST /api/brick/projects/:id/workflows` | FAIL | Route not implemented, returned `404` |
| `GET /api/brick/projects/:id/workflows` | FAIL | Route not implemented, returned `404` |
| `POST /api/brick/workflows/:id/blocks` | FAIL | Route not implemented, returned `404` |
| `GET /api/brick/workflows/:id/blocks` | FAIL | Route not implemented, returned `404` |
| `POST /api/brick/workflows/:id/links` | FAIL | Route not implemented, returned `404` |
| `POST /api/brick/executions` | FAIL | Returned `502 engine_unavailable` |
| `GET /api/brick/executions/:id` | PASS | Returned `200` for existing execution `5` |

## Detailed Results

### 1. Health Check

Request:

```bash
curl -s -D - http://localhost:3201/api/brick/health
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page
- Body excerpt: `Cannot GET /api/brick/health`

Verdict: FAIL

Reason:

- Requested Brick health endpoint does not exist on the running server.
- Actual generic health route available during test: `GET /api/health` returned `200 OK`.

### 2. Projects CRUD

Test project ids used:

- `test-project-20260404-001`
- `test-project-20260404-002`

#### 2.1 Create Project

Request:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/projects \
  --data '{"id":"test-project-20260404-001","name":"Test Project"}'
```

Response:

- Status: `201 Created`
- Body shape: JSON object
- Verified fields: `id`, `name`, `description`, `infrastructure`, `config`, `active`, `createdAt`, `updatedAt`

Verdict: PASS

Notes:

- API requires both `id` and `name`.
- The user-provided create description only specified `name`, but route validation requires `id` too.

#### 2.2 List Projects

Verification request used:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/projects \
  --data '{"id":"test-project-20260404-002","name":"Test Project"}'
```

```bash
curl -s -D - http://localhost:3201/api/brick/projects
```

Response:

- Status: `200 OK`
- Body shape: JSON array
- Verified behavior: array contained existing projects plus `test-project-20260404-002`

Verdict: PASS

#### 2.3 Get Project by ID

Request:

```bash
curl -s -D - http://localhost:3201/api/brick/projects/test-project-20260404-001
```

Response:

- Status: `200 OK`
- Body shape: JSON object
- Verified fields: base project fields plus `invariants` array and `executions` array

Verdict: PASS

#### 2.4 Delete Project

Request:

```bash
curl -s -D - -X DELETE \
  http://localhost:3201/api/brick/projects/test-project-20260404-001
```

Response:

- Status: `204 No Content`
- Body shape: empty

Verdict: PASS

Cleanup verification for second temporary project:

```bash
curl -s -D - -X DELETE \
  http://localhost:3201/api/brick/projects/test-project-20260404-002
```

returned `204`, and

```bash
curl -s -D - http://localhost:3201/api/brick/projects/test-project-20260404-002
```

returned `404 {"error":"프로젝트 없음"}`.

### 3. Workflows CRUD

#### 3.1 Create Workflow

Request:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/projects/test-project-20260404-001/workflows \
  --data '{"name":"Test Workflow"}'
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page

Verdict: FAIL

#### 3.2 List Workflows

Request:

```bash
curl -s -D - \
  http://localhost:3201/api/brick/projects/test-project-20260404-001/workflows
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page

Verdict: FAIL

Reason:

- These routes are not implemented on the current server.
- Current codebase uses Brick presets and execution routes instead of project-scoped workflow CRUD.

### 4. Blocks CRUD

#### 4.1 Create Block

Request:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/workflows/1/blocks \
  --data '{"type":"command"}'
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page

Verdict: FAIL

#### 4.2 List Blocks

Request:

```bash
curl -s -D - http://localhost:3201/api/brick/workflows/1/blocks
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page

Verdict: FAIL

Reason:

- Requested block CRUD routes are not implemented on the current server.

### 5. Links

#### 5.1 Create Link

Request:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/workflows/1/links \
  --data '{"fromBlock":"block-a","toBlock":"block-b"}'
```

Response:

- Status: `404 Not Found`
- Body shape: HTML error page

Verdict: FAIL

Reason:

- Requested route is not implemented.
- The current server exposes link creation at `POST /api/brick/links` with body fields like `workflowId`, `fromBlock`, `toBlock`, `linkType`.

### 6. Execution

#### 6.1 Start Workflow Execution

Discovery request used to find a valid preset:

```bash
curl -s -D - http://localhost:3201/api/brick/presets
```

Observed valid preset ids:

- `1` `t-pdca-l0`
- `2` `t-pdca-l1`
- `3` `t-pdca-l2`
- `4` `t-pdca-l3`

Execution request:

```bash
curl -s -D - -H 'Content-Type: application/json' \
  -X POST http://localhost:3201/api/brick/executions \
  --data '{"presetId":1,"feature":"integration-test-feature","projectId":"test-project-20260404-001"}'
```

Response:

- Status: `502 Bad Gateway`
- Body shape: JSON object
- Body: `{"error":"engine_unavailable","detail":"Internal Server Error"}`

Verdict: FAIL

Reason:

- Express route exists, but downstream Brick execution engine was unavailable during this test.

#### 6.2 Get Execution Status

Because execution creation failed, I validated the status endpoint with an existing execution record.

Context request:

```bash
curl -s -D - 'http://localhost:3201/api/brick/executions?limit=3'
```

Existing execution ids observed:

- `5`
- `4`
- `3`

Status request:

```bash
curl -s -D - http://localhost:3201/api/brick/executions/5
```

Response:

- Status: `200 OK`
- Body shape: JSON object
- Verified fields: `id`, `presetId`, `feature`, `status`, `currentBlock`, `blocksState`, `engineWorkflowId`, `projectId`, `startedAt`, `completedAt`, `createdAt`

Verdict: PASS

## Key Findings

1. The requested endpoint set does not match the currently running Brick API surface.
2. `GET /api/brick/health` is not implemented. Only `GET /api/health` is available.
3. Project CRUD mostly works as expected.
4. Workflow, block, and requested link endpoints are missing and return plain Express `404` pages.
5. Execution start route exists, but the engine dependency behind it was unavailable and returned `502`.
6. Execution status lookup works for existing execution records.

## Recommended Next Actions

1. Add or restore `GET /api/brick/health` if that route is part of the intended contract.
2. Reconcile API contract vs implementation for:
   - `/api/brick/projects/:id/workflows`
   - `/api/brick/workflows/:id/blocks`
   - `/api/brick/workflows/:id/links`
3. Verify the Python Brick engine backing `POST /api/brick/executions` is healthy and reachable from the Express server.
4. If presets are the real workflow model, update API documentation and test plans to use the preset-based contract explicitly.
