# MCP 검토 보고서 — 에이전트팀 구조 실효성 판단

> 작성일: 2026-04-01
> 요청자: Smith님
> 작성자: PM 리더
> 근거: .mcp.json 현황 + 에이전트팀 운영 구조

---

## 현재 MCP 서버 (5개)

| MCP | 용도 | 판정 | 사유 |
|-----|------|------|------|
| **Context7** | 라이브러리 문서 조회 | ✅ 유지 | 팀원이 Next.js/Tailwind 등 최신 문법 확인 시 필수. 훈련 데이터 한계 보완 |
| **GitHub** | PR/이슈/코드 검색 | ✅ 유지 | CTO 리더가 PR 생성/이슈 관리에 직접 사용. 체인 핸드오프 자동화 확장 가능 |
| **PostgreSQL** | Cloud SQL 직접 쿼리 | ⚠️ 유지 (READ-only 권장) | 대시보드 데이터 확인·디버깅에 유용. 단, 현재 READ/WRITE 무차별 — READ-only 사용자로 변경 권장 |
| **Filesystem** | 파일 읽기/쓰기 | ❌ 제거 | Claude Code의 Read/Write/Edit/Glob 도구와 100% 중복. 추가 가치 없음 |
| **Puppeteer** | 브라우저 자동화 | ❌ 제거 | 프로젝트는 Playwright 사용 (playwright.config.ts, e2e/ 5개 스펙). Puppeteer MCP는 미사용 |

### 즉시 조치

```jsonc
// .mcp.json에서 제거 대상
"filesystem": { ... },  // 제거 — Claude 내장 도구와 중복
"puppeteer": { ... }     // 제거 — Playwright 사용 중, 미사용
```

---

## 추가 후보 MCP (4개)

### 1. Slack MCP — ✅ 1순위 추가 권장

| 항목 | 내용 |
|------|------|
| **필요성** | 높음 |
| **에이전트팀 활용** | COO 완료 보고 Slack 전송, 블록 알림, 체인 핸드오프 Slack fallback (OI-008, OI-013) |
| **현재 문제** | notify-completion.sh가 curl로 직접 Slack API 호출 → 토큰 관리 분산, 실패 시 재시도 없음 |
| **도입 효과** | MCP를 통한 Slack 메시지 전송 표준화, 토큰 중앙 관리, 메시지 히스토리 조회 가능 |
| **리스크** | 낮음 — @anthropic/mcp-server-slack 안정 |

### 2. Linear MCP — ⏸️ 보류

| 항목 | 내용 |
|------|------|
| **필요성** | 중간 |
| **현재 상황** | TASK.md + operational-issues.md로 이슈 관리 중. 현재 팀 규모(에이전트 3-4명)에 Linear는 과도 |
| **도입 시기** | 팀 규모 확대 or 외부 협업자 참여 시 재검토 |
| **대안** | GitHub Issues로 충분 (이미 GitHub MCP 있음) |

### 3. Qdrant MCP — ❌ 불필요

| 항목 | 내용 |
|------|------|
| **필요성** | 없음 |
| **사유** | 벡터 DB 필요한 기능 없음. 임베딩은 content-pipeline에서 Python으로 직접 처리 (Mac Studio 로컬). MCP 경유 불필요 |

### 4. Temporal MCP — ❌ 불필요

| 항목 | 내용 |
|------|------|
| **필요성** | 없음 |
| **사유** | 워크플로우 오케스트레이션은 bkit hooks + claude-peers + 크론으로 이미 구현. Temporal은 인프라 오버헤드만 추가 |

---

## QA 도메인 검색 MCP

프로젝트 QA는 Playwright (e2e/) + vitest (단위) 체계.
- **Playwright**: `playwright.config.ts`, baseURL `https://bscamp.app`, 5개 e2e 스펙
- **별도 QA MCP 불필요**: Playwright는 CLI로 실행, 결과는 파일로 출력 → Claude Code가 Read로 확인 가능

---

## 최종 권장

| 조치 | 대상 | 우선순위 |
|------|------|----------|
| **제거** | Filesystem, Puppeteer | 즉시 |
| **추가** | Slack MCP | 1순위 (hook-hardening-v2 F-2와 연계) |
| **유지** | Context7, GitHub, PostgreSQL | — |
| **보류** | Linear | 팀 확장 시 |
| **불필요** | Qdrant, Temporal | — |

### PostgreSQL 보안 강화 권장
현재 `bscamp` 사용자가 전체 권한 보유. READ-only 전용 사용자 생성 권장:
```sql
CREATE ROLE bscamp_readonly WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE bscamp TO bscamp_readonly;
GRANT USAGE ON SCHEMA public TO bscamp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bscamp_readonly;
```
.mcp.json의 postgres 연결 문자열을 readonly 사용자로 변경.
