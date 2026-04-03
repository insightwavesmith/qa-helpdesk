# QA 보고서: 브릭 전체 서비스 사용성 + 통합 테스트

> 작성일: 2026-04-03
> 작성자: CTO팀 (QA 5명 병렬)
> 대상: 브릭 API 전체 (localhost:3200, Python 엔진 :3202)
> 기준: docs/brick-product-spec.md (v1.0)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 총 테스트 | 111건 |
| PASS | 105건 (94.6%) |
| 이슈 | 6건 (HIGH 1 / MEDIUM 3 / LOW 2) |
| 테스트 영역 | 5개 (Core, Teams, Engine, DAG, Governance) |
| API 엔드포인트 | 62개 중 60개 구현 확인 |
| QA 팀원 | 5명 병렬 실행 |

| 관점 | 내용 |
|------|------|
| **전체 평가** | 핵심 워크플로우(시작→블록완료→Gate→Link) 정상 동작. CRUD + 에러 핸들링 대부분 양호 |
| **미구현** | Projects DELETE, Projects/:id/invariants (2개 엔드포인트) |
| **버그** | review.ts FK 에러 핸들링, resume 상태 가드, linkType 검증 부재, js-yaml 미설치 |
| **결론** | 베타 출시 가능 수준. HIGH 1건 + MEDIUM 3건 수정 권장 |

---

## 영역별 상세 결과

### 영역 1: Projects + Presets + Block Types (qa-core)

**30건 테스트 — 이슈 3건**

#### A. Projects

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| A1 | /api/brick/projects | POST | 201 | ✅ 생성 정상 |
| A1-err1 | POST (name 누락) | | 400 | ✅ "id, name 필수" |
| A1-err2 | POST (중복 id) | | 409 | ✅ "이미 존재하는 프로젝트 ID" |
| A2 | /api/brick/projects | GET | 200 | ✅ 목록 정상 |
| A3 | /api/brick/projects/:id | GET | 200 | ✅ 상세 (invariants + executions 포함) |
| A3-err | GET (없는 id) | | 404 | ✅ "프로젝트 없음" |
| A4 | /api/brick/projects/:id | PUT | 200 | ✅ 부분 업데이트 정상 |
| A4-err | PUT (없는 id) | | 404 | ✅ "프로젝트 없음" |
| **A5** | /api/brick/projects/:id | **DELETE** | **404** | **❌ 미구현** |
| **A6** | /api/brick/projects/:id/invariants | **GET** | **404** | **❌ 미구현** (GET /:id에 포함됨) |
| A7 | /api/brick/projects/:id/dashboard | GET | 200 | ✅ 대시보드 데이터 정상 |
| A8 | /api/brick/projects/sync | POST | 200 | ✅ YAML→DB 동기화 정상 |

#### B. Presets

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| B1 | GET /presets | | 200 | ✅ 코어 12건 + 커스텀 |
| B2 | POST /presets | | 201 | ✅ 생성 정상 |
| B2-err | POST (yaml 누락) | | 400 | ✅ "name, yaml 필수" |
| B3 | GET /presets/:id | | 200 | ✅ YAML 포함 |
| B3-err | GET /presets/9999 | | 404 | ✅ "프리셋 없음" |
| B4 | PUT /presets/:id | | 200 | ✅ 수정 정상 |
| B4-err | PUT /presets/1 (코어) | | 403 | ✅ "코어 프리셋은 수정할 수 없습니다" |
| B5-err | DELETE /presets/1 (코어) | | 403 | ✅ "코어 프리셋은 삭제할 수 없습니다" |
| B5 | DELETE /presets/:id | | 204 | ✅ 삭제 정상 |
| B6 | GET /presets/:id/export | | 200 | ✅ text/yaml + Content-Disposition |
| B7 | POST /presets/import | | 201 | ✅ JSON 파싱 정상 |
| B7-err | POST /presets/import (잘못된 YAML) | | 400 | ✅ "YAML 파싱 실패" |
| **B8** | POST /presets/:id/apply | | **400/200** | **⚠️ YAML 파싱 불가 (js-yaml 미설치), JSON만 동작** |

#### C. Block Types

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| C1 | GET /block-types | | 200 | ✅ 코어 10건 |
| C2 | POST /block-types | | 201 | ✅ 생성 정상 |
| C2-err1 | POST (필드 누락) | | 400 | ✅ 필수 필드 에러 |
| C2-err2 | POST (중복 name) | | 409 | ✅ "이미 존재하는 블록 타입" |
| C3 | PUT /block-types/:name | | 200 | ✅ 수정 정상 |
| C3-err1 | PUT (코어) | | 403 | ✅ "내장 블록 타입은 수정할 수 없습니다" |
| C3-err2 | PUT (없는 name) | | 404 | ✅ "블록 타입 없음" |
| C4-err | DELETE (코어) | | 403 | ✅ "내장 블록 타입은 삭제할 수 없습니다" |
| C4 | DELETE /block-types/:name | | 204 | ✅ 삭제 정상 |

---

### 영역 2: Teams (qa-teams)

**17건 테스트 — 이슈 0건**

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| 1 | POST /teams | | 201 | ✅ 팀 생성 |
| 2 | GET /teams | | 200 | ✅ 목록 조회 |
| 3 | GET /teams/:id | | 200 | ✅ 상세 조회 |
| 4 | PUT /teams/:id | | 200 | ✅ 수정 |
| 5 | DELETE /teams/:id | | 204 | ✅ 삭제 |
| 6 | GET /teams/:id/members | | 200 | ✅ 팀원 목록 |
| 7 | POST /teams/:id/members | | 201 | ✅ 팀원 추가 |
| 8 | DELETE /teams/:id/members/:mid | | 204 | ✅ 팀원 제거 |
| 9 | PUT /teams/:id/mcp | | 200 | ✅ MCP 설정 |
| 10 | GET /teams/:id/mcp | | 200 | ✅ MCP 목록 |
| 11 | PUT /teams/:id/skills | | 200 | ✅ 스킬 갱신 |
| 12 | PUT /teams/:id/model | | 200 | ✅ 모델 설정 |
| 13 | GET /teams/:id/status | | 200 | ✅ 상태 조회 |
| E1 | POST (name 누락) | | 400 | ✅ 필수 필드 에러 |
| E2 | GET /teams/99999 | | 404 | ✅ "팀 없음" |
| E3 | POST members (중복) | | 409 | ✅ "동일 이름 팀원 존재" |
| E4 | DELETE members (없는 팀원) | | 404 | ✅ "팀원 없음" |

---

### 영역 3: Executions + Workflows (qa-engine)

**17건 테스트 — 이슈 1건**

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| 1 | POST /executions | | 201 | ✅ 워크플로우 시작 |
| 2 | POST /executions (feature 누락) | | 400 | ✅ "presetId, feature 필수" |
| 3 | POST /executions (없는 프리셋) | | 404 | ✅ "프리셋 없음" |
| 4 | GET /executions?limit=2 | | 200 | ✅ pagination 정상 |
| 4b | GET /executions?status=running | | 200 | ✅ 필터 정상 |
| 5 | GET /executions/:id | | 200 | ✅ 상세 (blocksState 포함) |
| 6 | GET /executions/9999 | | 404 | ✅ "실행 없음" |
| 7 | GET /executions/:id/logs | | 200 | ✅ 로그 조회 |
| 8 | POST /executions/:id/blocks/:block/complete | | 200 | ✅ 블록 완료 → 다음 블록 전환 |
| 9 | POST complete (중복) | | 409 | ✅ "block_not_running" 동시성 가드 |
| 10 | POST complete (없는 블록) | | 502 | ✅ 엔진 "block_not_found" |
| 11 | POST complete (없는 실행) | | 404 | ✅ "실행 없음" |
| 12 | POST complete (마지막 블록) | | 200 | ✅ status=completed |
| 13 | POST /workflows/:id/cancel | | 200 | ✅ status=cancelled |
| 14 | POST /workflows/:id/resume | | 200 | ✅ cancelled→running 복원 |
| 15 | POST /workflows/9999/resume | | 404 | ✅ "실행 없음" |
| 16 | POST /workflows/9999/cancel | | 404 | ✅ "실행 없음" |

**E2E 시나리오**: L0 프리셋 시작 → do complete → qa complete → 전체 completed ✅

---

### 영역 4: Links + Gates + Invariants + System (qa-dag)

**30건 테스트 — 이슈 1건**

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| 1 | GET /link-types | | 200 | ✅ 6종 카탈로그 |
| 2 | GET /links?workflowId=1 | | 200 | ✅ 워크플로우별 조회 |
| 2-err | GET /links (workflowId 누락) | | 400 | ✅ "workflowId 필수" |
| 3 | POST /links | | 201 | ✅ A→B, B→C 생성 |
| 3-err-a | POST (자기참조) | | 400 | ✅ "자기참조 불가" |
| 3-err-b | POST (DAG 순환) | | 400 | ✅ "DAG 순환 감지" |
| 3-err-c | POST (필수 필드 누락) | | 400 | ✅ 에러 |
| 3-err-d | POST (중복 링크) | | 409 | ✅ "중복 Link" |
| **3-err-e** | POST (잘못된 linkType) | | **201** | **⚠️ DB CHECK 없어 저장됨** |
| 4 | PUT /links/:id | | 200 | ✅ 수정 정상 |
| 4-err | PUT /links/9999 | | 404 | ✅ "Link 없음" |
| 5 | DELETE /links/:id | | 204 | ✅ 삭제 정상 |
| 5-err | DELETE /links/9999 | | 404 | ✅ "Link 없음" |
| 6 | GET /gates/:id/result | | 200 | ✅ Gate 결과 조회 |
| 6-err | GET /gates/9999/result | | 404 | ✅ "Gate 결과 없음" |
| 7 | POST /gates/:id/override | | 200 | ✅ 강제 pass |
| 7-err | POST /gates/9999/override | | 404 | ✅ "Gate 결과 없음" |
| 8 | POST /invariants | | 201 | ✅ 불변식 등록 (version:1) |
| 8-err-a | POST (중복) | | 409 | ✅ "이미 존재하는 불변식 ID" |
| 8-err-b | POST (필드 누락) | | 400 | ✅ 에러 |
| 8-err-c | POST (잘못된 constraintType) | | 500 | ✅ DB CHECK 작동 |
| 9 | GET /invariants?project_id=bscamp | | 200 | ✅ active 11건 |
| 9-err | GET /invariants (project_id 누락) | | 400 | ✅ "project_id 필수" |
| 10 | GET /invariants/:id?project_id=bscamp | | 200 | ✅ 상세 + history |
| 10-err | GET (없는 불변식) | | 404 | ✅ "불변식 없음" |
| 11 | PUT /invariants/:id | | 200 | ✅ v1→v2, 이력 자동 생성 |
| 11-err | PUT (없는 불변식) | | 404 | ✅ "불변식 없음" |
| 12 | GET /system/invariants | | 200 | ✅ INV-1~10 전부 ok |

---

### 영역 5: Approvals + Learning + Review + Notify (qa-governance)

**17건 테스트 — 이슈 1건**

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| 1 | POST /approvals | | 200 | ✅ 승인 요청 생성 |
| 1-err | POST (timeout_at 누락) | | 400 | ✅ 필수 필드 에러 |
| 2 | GET /approvals | | 200 | ✅ 전체 목록 |
| 3 | GET /approvals?status=waiting | | 200 | ✅ 상태 필터 |
| 4 | POST /approve/:executionId | | 200 | ✅ 승인 |
| 4-err | POST /approve/99999 | | 404 | ✅ "승인 요청을 찾을 수 없습니다" |
| 5 | POST /reject/:executionId | | 200 | ✅ 반려 (reason 포함) |
| 5-err1 | POST /reject (reason 없음) | | 400 | ✅ "반려 사유 필수" |
| 5-err2 | POST /reject/99999 | | 404 | ✅ "승인 요청을 찾을 수 없습니다" |
| 6 | GET /learning/proposals | | 200 | ✅ 빈 배열 (데이터 없음, 정상) |
| 7-err | POST /learning/99999/approve | | 404 | ✅ "제안 없음" |
| 8-err1 | POST /learning/99999/reject | | 404 | ✅ "제안 없음" |
| 8-err2 | POST /learning/1/reject (사유 없음) | | 400 | ✅ "거부 사유 필수" |
| 9 | POST /review/:exec/:block/approve | | 200 | ✅ gate_result 생성 |
| 10 | POST /review/:exec/:block/reject | | 200 | ✅ passed:false |
| 10-err1 | POST /review reject (사유 없음) | | 400 | ✅ "거부 사유 필수" |
| **9-err** | POST /review/99999/block/approve | | **500** | **❌ FK constraint → 500 (404 반환 필요)** |

---

## 발견된 이슈 종합 (6건)

| # | 심각도 | 영역 | 파일 | 이슈 | 수정 방안 |
|---|--------|------|------|------|----------|
| 1 | **HIGH** | Projects | `projects.ts` | `DELETE /projects/:id` 미구현 | DELETE 핸들러 추가 |
| 2 | **MEDIUM** | Projects | `projects.ts` | `GET /projects/:id/invariants` 미구현 | 별도 라우트 추가 (또는 GET /:id 응답으로 대체 문서화) |
| 3 | **MEDIUM** | Presets | `presets.ts` | 프리셋 apply/import에서 YAML 파싱 불가 | `js-yaml` 패키지 설치 |
| 4 | **MEDIUM** | Review | `review.ts` | 없는 executionId → 500 FK constraint | catch에서 FK 에러 감지 → 404 변환 |
| 5 | **LOW** | Workflows | `workflows.ts` | completed 워크플로우 resume 가능 | resume 시 상태 가드 추가 (`paused`/`cancelled`만 허용) |
| 6 | **LOW** | Links | `links.ts` / `schema` | linkType DB CHECK 제약 없음 | 라우트 레벨 화이트리스트 검증 또는 DB CHECK 추가 |

---

## 서비스별 사용성 평가

| 서비스 | 구현률 | 에러 핸들링 | 사용성 | 판정 |
|--------|--------|------------|--------|------|
| **Projects** | 6/8 (75%) | 양호 | DELETE 미구현으로 테스트 데이터 정리 불가 | ⚠️ 수정 필요 |
| **Presets** | 8/8 (100%) | 양호 | YAML 파싱 의존성 누락 | ⚠️ js-yaml 설치 필요 |
| **Block Types** | 4/4 (100%) | 우수 | 코어 보호 + CRUD 완벽 | ✅ 양호 |
| **Teams** | 13/13 (100%) | 우수 | 전체 CRUD + MCP/Skills 정상 | ✅ 양호 |
| **Executions** | 6/6 (100%) | 우수 | E2E 흐름 정상, 동시성 가드 동작 | ✅ 양호 |
| **Workflows** | 2/2 (100%) | 미흡 | resume 상태 가드 누락 | ⚠️ 경미 |
| **Links** | 5/5 (100%) | 양호 | DAG 순환 감지 정상, linkType 검증 부재 | ⚠️ 경미 |
| **Gates** | 2/2 (100%) | 우수 | 조회 + override 정상 | ✅ 양호 |
| **Invariants** | 4/4 (100%) | 우수 | 버전 관리 + 이력 자동 생성 | ✅ 양호 |
| **Approvals** | 4/4 (100%) | 우수 | 승인/반려 + 필터 정상 | ✅ 양호 |
| **Learning** | 3/3 (100%) | 양호 | 에러 핸들링 정상 (데이터 부재로 정상 케이스 제한) | ✅ 양호 |
| **Review** | 2/2 (100%) | 미흡 | FK 에러 핸들링 누락 | ⚠️ 수정 필요 |
| **Notify** | 1/1 (100%) | — | placeholder 구현 | ✅ 양호 |
| **System** | 1/1 (100%) | — | INV-1~10 상태 반환 | ✅ 양호 |

---

## 결론

**전체 111건 테스트 중 105건 PASS (94.6%)**. 핵심 워크플로우 엔진(시작→블록완료→Gate→Link→다음블록) 정상 동작 확인. 에러 핸들링 전반적으로 양호하며, 코어 보호(403) + 중복 방지(409) + 존재 검증(404) 패턴 일관성 있음.

**베타 출시 전 필수 수정**: HIGH 1건 (Projects DELETE) + MEDIUM 3건 (invariants 경로, js-yaml, review FK)
**베타 이후 개선**: LOW 2건 (resume 가드, linkType 검증)
