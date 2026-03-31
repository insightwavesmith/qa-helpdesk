# PDCA 체인 매트릭스 (PDCA Chain Matrix) Plan

> 작성일: 2026-03-31
> 프로세스 레벨: L1 (기획 문서, src/ 미수정)
> 작성자: PM팀

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 업무 유형(DEV/MKT/OPS/BIZ) × 레벨(L0~L3) 조합별 PDCA 체인 경로와 완료 게이트를 하드코딩 |
| **작성일** | 2026-03-31 |
| **핵심** | LLM 판단 0. 모든 게이트는 기계적 체크(파일 존재, 숫자 비교, 해시 존재, URL 200) |
| **선행** | pdca-chain-automation.plan.md, detect-process-level.sh v1.0 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 현재 detect-process-level.sh는 DEV 유형만 L0~L3 판단. MKT/OPS/BIZ 유형 분류 로직 없음. chain_step이 "cto_to_coo" 하드코딩 |
| **Solution** | 유형×레벨 매트릭스로 체인 경로 + 게이트를 완전 하드코딩. hook이 유형 자동 분류 후 해당 체인 실행 |
| **Core Value** | 어떤 업무든 분류 → 체인 → 게이트 → 완료가 자동. 사람 판단 개입 0 |

---

## 1. 업무 유형 정의

| 유형 | 코드 | 대상 | 예시 |
|------|------|------|------|
| **개발** | `DEV` | src/ 코드 변경, 기능 개발, 버그 수정 | 총가치각도기 리팩터링, LP 분석 기능 |
| **마케팅** | `MKT` | 콘텐츠 작성, 홍보, 오가닉 채널 | 블로그 글, SNS 콘텐츠, 모찌리포트 |
| **운영/인프라** | `OPS` | 크론 설정, Cloud Run 배포, DB 관리, GCS | 크론 스케줄러 등록, Cloud Run 환경변수 |
| **비즈니스/전략** | `BIZ` | 서비스 방향, 가격, 파트너십 — 코드 없음 | 가격 정책 결정, ADR 작성, 제휴 검토 |

---

## 2. 유형별 레벨 정의 + 체인 경로

### 2-1. DEV 체인 (개발)

| 레벨 | 대상 | 체인 경로 | 비고 |
|------|------|----------|------|
| **DEV-L0** | 핫픽스, 프로덕션 장애 | `Do → QA → Deploy` | Plan/Design 스킵 |
| **DEV-L1** | 조사, 리서치, 문서 작업 | `Do → 보고` | 배포 없음 |
| **DEV-L2** | 일반 기능 개발 | `Plan → Design → Do → QA → Deploy` | 표준 플로우 |
| **DEV-L3** | DB/Auth/인프라/마이그레이션 | `Plan → Design → Do → QA → 수동검수 → Deploy` | Smith님 최종 승인 |

```
DEV-L0: Do ──→ QA ──→ Deploy ──→ COO 보고
DEV-L1: Do ──→ COO 보고
DEV-L2: Plan → Design → Do → QA → Deploy → COO 보고
DEV-L3: Plan → Design → Do → QA → Smith님 수동검수 → Deploy → COO 보고
```

### 2-2. OPS 체인 (운영/인프라)

| 레벨 | 대상 | 체인 경로 | 비고 |
|------|------|----------|------|
| **OPS-L0** | 크론/설정 변경 (1줄 수정) | `Do → Deploy` | QA 스킵 |
| **OPS-L1** | 인프라 작업 (환경변수, 스케줄러) | `Do → QA → Deploy` | 배포 후 헬스체크 |
| **OPS-L2** | 구조 변경 (DB 스키마, 서비스 분리) | `Plan → Design → Do → QA → Deploy` | ADR 필수 |

```
OPS-L0: Do ──→ Deploy ──→ COO 보고
OPS-L1: Do ──→ QA ──→ Deploy ──→ COO 보고
OPS-L2: Plan → Design → Do → QA → Deploy → COO 보고
```

### 2-3. MKT 체인 (마케팅)

| 레벨 | 대상 | 체인 경로 | 비고 |
|------|------|----------|------|
| **MKT-L1** | 글 1편 (블로그, SNS 포스트) | `Do → 검수 → 발행` | COO 검수 |
| **MKT-L2** | 시리즈/캠페인 (다회성 콘텐츠) | `Plan → Do → 검수 → 발행` | 기획 후 집행 |

```
MKT-L1: Do ──→ COO 검수 ──→ 발행 ──→ COO 보고
MKT-L2: Plan → Do ──→ COO 검수 ──→ 발행 ──→ COO 보고
```

### 2-4. BIZ 체인 (비즈니스/전략)

| 레벨 | 대상 | 체인 경로 | 비고 |
|------|------|----------|------|
| **BIZ-L1** | 단순 결정 (용어 변경, 우선순위 조정) | `Do → Smith님 확인` | 문서화 후 확인만 |
| **BIZ-L2** | 전략 수립 (가격, 파트너십, 서비스 방향) | `Plan → Do → Smith님 결정` | ADR 작성 필수 |

```
BIZ-L1: Do(문서화) ──→ Smith님 확인 ──→ COO 기록
BIZ-L2: Plan(전략문서) → Do(ADR 작성) → Smith님 결정 → COO 기록
```

---

## 3. 완료 게이트 매트릭스 (하드코딩, LLM 판단 0)

### 3-1. 게이트 정의

| 게이트 | 완료 조건 | 판정 방법 | 실패 시 |
|--------|----------|----------|--------|
| **Plan** | `plan.md` 파일 존재 | `[ -f docs/01-plan/features/{feature}.plan.md ]` | 체인 차단 |
| **Design** | `design.md` 파일 존재 | `[ -f docs/02-design/features/{feature}.design.md ]` | 체인 차단 |
| **Do** | Match Rate ≥ 임계값 | `grep "Match Rate" docs/03-analysis/{feature}.analysis.md` | 수정 후 재시도 |
| **QA** | git commit 존재 | `git log --oneline -1` → 해시 추출 | 체인 차단 |
| **Deploy** | 배포 URL HTTP 200 | `curl -s -o /dev/null -w "%{http_code}" {URL}` | 롤백 |
| **검수** | COO/Smith님 승인 | 메시지 프로토콜 ACK 수신 | 피드백 → 수정 |
| **수동검수** | Smith님 직접 확인 | Smith님 ACK 메시지 | 반려 → 수정 |
| **보고** | COO에 보고 전달 | webhook wake 성공 (HTTP 200) | 수동 보고 |

### 3-2. 유형×레벨별 게이트 매트릭스

| 유형-레벨 | Plan | Design | Do (MR) | QA (커밋) | Deploy (URL) | 검수 | 수동검수 | 보고 |
|-----------|:----:|:------:|:-------:|:---------:|:------------:|:----:|:--------:|:----:|
| **DEV-L0** | - | - | - | O | O | - | - | O |
| **DEV-L1** | - | - | - | - | - | - | - | O |
| **DEV-L2** | O | O | O (95%) | O | O | - | - | O |
| **DEV-L3** | O | O | O (95%) | O | O | - | O | O |
| **OPS-L0** | - | - | - | - | O | - | - | O |
| **OPS-L1** | - | - | - | O | O | - | - | O |
| **OPS-L2** | O | O | O (95%) | O | O | - | - | O |
| **MKT-L1** | - | - | - | - | - | O | - | O |
| **MKT-L2** | O | - | - | - | - | O | - | O |
| **BIZ-L1** | - | - | - | - | - | - | O | O |
| **BIZ-L2** | O | - | - | - | - | - | O | O |

> `O` = 필수 게이트, `-` = 스킵, `MR` = Match Rate

### 3-3. Match Rate 임계값

| 유형-레벨 | 임계값 | 비고 |
|-----------|:------:|------|
| DEV-L2 | 95% | Smith님 확정 (CLAUDE.md) |
| DEV-L3 | 95% | Smith님 확정 (CLAUDE.md) |
| OPS-L2 | 95% | DEV-L2와 동일 기준 |
| 그 외 | - | Match Rate 게이트 없음 |

---

## 4. 각 단계 입력/출력 스펙

| 단계 | 입력 | 출력 | 출력 위치 |
|------|------|------|----------|
| **Plan** | TASK 설명 (자연어) | `{feature}.plan.md` | `docs/01-plan/features/` |
| **Design** | `{feature}.plan.md` | `{feature}.design.md` | `docs/02-design/features/` |
| **Do** | `{feature}.design.md` | 코드 + git commit | src/ 또는 해당 경로 |
| **QA (Gap 분석)** | 커밋 (코드) + design.md | `{feature}.analysis.md` (Match Rate 숫자) | `docs/03-analysis/` |
| **Deploy** | 커밋 해시 | 배포 URL (HTTP 200) | Cloud Run / GCS |
| **검수** | 산출물 (콘텐츠/문서) | 승인 ACK / 반려 FEEDBACK | 메시지 프로토콜 |
| **수동검수** | QA 통과 산출물 | Smith님 ACK | 메시지 프로토콜 |
| **보고** | 완료 요약 | COO 수신 확인 | webhook wake |

### 단계 간 데이터 흐름

```
TASK 설명
  │
  ▼
Plan ──→ plan.md
  │
  ▼
Design ──→ design.md
  │
  ▼
Do ──→ 코드 + commit (hash)
  │
  ▼
QA ──→ analysis.md (Match Rate: XX%)
  │
  ├─ MR < 95% → Do로 회귀 (수정 루프)
  │
  └─ MR ≥ 95%
       │
       ▼
  Deploy ──→ URL (HTTP 200 확인)
       │
       ▼
  보고 ──→ COO webhook wake
```

---

## 5. 상태 JSON 구조

### 5-1. 공통 구조

```json
{
  "task": "{TASK명}",
  "type": "{유형}-{레벨}",
  "gates": { ... },
  "current": "{현재 단계}",
  "updated_at": "{ISO 8601 타임스탬프}"
}
```

저장 위치: `.bkit/runtime/chain-status-{task-slug}.json`

### 5-2. 유형×레벨별 JSON 예시

#### DEV-L0 (핫픽스)

```json
{
  "task": "긴급 CTR 계산 버그 수정",
  "type": "DEV-L0",
  "gates": {
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "commit",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### DEV-L1 (조사/리서치)

```json
{
  "task": "경쟁사 API 필드 조사",
  "type": "DEV-L1",
  "gates": {
    "report": { "webhook_status": null, "done": false }
  },
  "current": "report",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### DEV-L2 (일반 개발)

```json
{
  "task": "총가치각도기 리팩터링",
  "type": "DEV-L2",
  "gates": {
    "plan": { "file": "docs/01-plan/features/protractor-refactoring.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/protractor-refactoring.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "plan",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### DEV-L3 (고위험)

```json
{
  "task": "Firebase Auth 마이그레이션",
  "type": "DEV-L3",
  "gates": {
    "plan": { "file": "docs/01-plan/features/auth-migration.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/auth-migration.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "plan",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### OPS-L0 (크론/설정 변경)

```json
{
  "task": "크론 스케줄 시간 변경",
  "type": "OPS-L0",
  "gates": {
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "deploy",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### OPS-L1 (인프라 작업)

```json
{
  "task": "Cloud Run 환경변수 추가",
  "type": "OPS-L1",
  "gates": {
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "commit",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### OPS-L2 (구조 변경)

```json
{
  "task": "DB 스키마 변경 — 새 테이블 추가",
  "type": "OPS-L2",
  "gates": {
    "plan": { "file": "docs/01-plan/features/db-schema-change.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/db-schema-change.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "plan",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### MKT-L1 (글 1편)

```json
{
  "task": "블로그 — Meta 광고 최적화 가이드",
  "type": "MKT-L1",
  "gates": {
    "review": { "reviewer": "MOZZI", "verdict": null, "done": false },
    "publish": { "url": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "review",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### MKT-L2 (시리즈/캠페인)

```json
{
  "task": "자사몰 성공사례 시리즈 3편",
  "type": "MKT-L2",
  "gates": {
    "plan": { "file": "docs/01-plan/features/success-stories-series.plan.md", "done": false },
    "review": { "reviewer": "MOZZI", "verdict": null, "done": false },
    "publish": { "url": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "plan",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### BIZ-L1 (단순 결정)

```json
{
  "task": "지표 용어 통일 — CTR→클릭률",
  "type": "BIZ-L1",
  "gates": {
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "manual_review",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

#### BIZ-L2 (전략 수립)

```json
{
  "task": "수강료 가격 정책 변경",
  "type": "BIZ-L2",
  "gates": {
    "plan": { "file": "docs/01-plan/features/pricing-policy.plan.md", "done": false },
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
  },
  "current": "plan",
  "updated_at": "2026-03-31T10:00:00+09:00"
}
```

---

## 6. 분류 기준표 — 자동 분류 로직

### 6-1. 유형 분류 (1차: 변경 파일 패턴)

| 패턴 | 유형 | 우선순위 |
|------|------|:--------:|
| `src/` 파일 변경 | `DEV` | 1 |
| `.bkit/hooks/`, `scripts/`, `services/`, `Dockerfile`, `cloudbuild.yaml` | `OPS` | 2 |
| `docs/marketing/`, `public/reports/`, 모찌리포트 경로 | `MKT` | 3 |
| `docs/adr/`, `docs/strategy/`, 코드 변경 없음 | `BIZ` | 4 |

> 복합 매칭 시 우선순위 높은 유형 적용. `src/` + `services/` = `DEV` (우선순위 1).

### 6-2. 레벨 분류 (2차: 커밋 메시지 + 파일 패턴)

#### DEV 레벨 판단

| 조건 | 레벨 |
|------|------|
| 커밋 메시지 `fix:` 또는 `hotfix:` | DEV-L0 |
| `src/` 변경 없음 (docs/, scripts/ 등만) | DEV-L1 |
| `src/` 변경 있음 + 고위험 패턴 없음 | DEV-L2 |
| `src/` 변경 + 고위험 패턴 매치 | DEV-L3 |

고위험 패턴: `auth|migration|\.sql|\.env|middleware\.ts|firebase|supabase|payment`

#### OPS 레벨 판단

| 조건 | 레벨 |
|------|------|
| 설정 파일 1개 변경 (env, yaml, cron 표현식) | OPS-L0 |
| 인프라 파일 변경 (Dockerfile, cloudbuild, 스크립트) | OPS-L1 |
| DB 스키마, 서비스 구조 변경 | OPS-L2 |

OPS-L2 승격 패턴: `\.sql|migration|schema|Dockerfile.*서비스분리`

#### MKT 레벨 판단

| 조건 | 레벨 |
|------|------|
| 산출물 1건 (글 1편, 이미지 1세트) | MKT-L1 |
| 산출물 2건 이상 또는 캠페인 단위 | MKT-L2 |

#### BIZ 레벨 판단

| 조건 | 레벨 |
|------|------|
| 결정 사항 1건, 영향 범위 제한적 | BIZ-L1 |
| 전략적 결정, 가격/방향/파트너십 | BIZ-L2 |

### 6-3. 복합 판단 규칙

| 상황 | 판단 |
|------|------|
| `src/` + `migration` | DEV-L3 (고위험 승격) |
| `src/` + `services/` | DEV (우선순위 1 적용) |
| `scripts/` + `src/` 없음 | OPS |
| `docs/adr/` 만 변경 | BIZ-L1 |
| `docs/marketing/` + `src/` | DEV (src 우선) |
| 분류 불가 | COO 에스컬레이션 → Smith님 판단 |

### 6-4. 커밋 메시지 패턴 → 유형 매핑 보조

| 패턴 | 유형 힌트 |
|------|----------|
| `fix:`, `hotfix:` | DEV-L0 |
| `feat:` | DEV-L2 |
| `docs:` | DEV-L1 또는 BIZ-L1 (파일 경로로 2차 판단) |
| `chore:` | OPS-L0 또는 OPS-L1 |
| `refactor:` | DEV-L2 |
| `style:` | DEV-L1 |
| `content:` | MKT-L1 |
| `campaign:` | MKT-L2 |
| `strategy:` | BIZ-L2 |

---

## 7. 팀 역할 매핑

### 7-1. 체인 단계별 실행 주체

| 단계 | DEV | OPS | MKT | BIZ |
|------|-----|-----|-----|-----|
| **Plan** | PM_LEADER | PM_LEADER | MKT_LEADER | PM_LEADER |
| **Design** | PM_LEADER | PM_LEADER | - | - |
| **Do** | CTO_LEADER | CTO_LEADER | MKT_LEADER | PM_LEADER |
| **QA** | CTO_LEADER | CTO_LEADER | - | - |
| **Deploy** | CTO_LEADER | CTO_LEADER | MKT_LEADER (발행) | - |
| **검수** | - | - | MOZZI (COO) | - |
| **수동검수** | Smith님 | - | - | Smith님 |
| **보고** | MOZZI (COO) | MOZZI (COO) | MOZZI (COO) | MOZZI (COO) |

### 7-2. 유형×레벨별 실행 주체 상세

| 유형-레벨 | 실행 주체 순서 |
|-----------|--------------|
| DEV-L0 | CTO → CTO(QA) → CTO(Deploy) → MOZZI(보고) |
| DEV-L1 | CTO(Do) → MOZZI(보고) |
| DEV-L2 | PM(Plan) → PM(Design) → CTO(Do) → CTO(QA) → CTO(Deploy) → MOZZI(보고) |
| DEV-L3 | PM(Plan) → PM(Design) → CTO(Do) → CTO(QA) → **Smith님(수동검수)** → CTO(Deploy) → MOZZI(보고) |
| OPS-L0 | CTO(Do) → CTO(Deploy) → MOZZI(보고) |
| OPS-L1 | CTO(Do) → CTO(QA) → CTO(Deploy) → MOZZI(보고) |
| OPS-L2 | PM(Plan) → PM(Design) → CTO(Do) → CTO(QA) → CTO(Deploy) → MOZZI(보고) |
| MKT-L1 | MKT(Do) → MOZZI(검수) → MKT(발행) → MOZZI(보고) |
| MKT-L2 | MKT(Plan) → MKT(Do) → MOZZI(검수) → MKT(발행) → MOZZI(보고) |
| BIZ-L1 | PM(Do/문서화) → **Smith님(확인)** → MOZZI(기록) |
| BIZ-L2 | PM(Plan/전략문서) → PM(Do/ADR) → **Smith님(결정)** → MOZZI(기록) |

### 7-3. 핸드오프 메시지 프로토콜

모든 핸드오프는 `bscamp-team/v1` 프로토콜.

| 핸드오프 | 메시지 타입 | from_role | to_role |
|---------|-----------|-----------|---------|
| CTO 완료 → COO | `COMPLETION_REPORT` | CTO_LEADER | MOZZI |
| PM 완료 → COO | `COMPLETION_REPORT` | PM_LEADER | MOZZI |
| MKT 완료 → COO | `COMPLETION_REPORT` | MKT_LEADER | MOZZI |
| COO → Smith님 | 대화형 보고 | MOZZI | Smith |
| Smith님 반려 | `FEEDBACK` | Smith | (해당 팀) |
| COO 검수 반려 | `FEEDBACK` | MOZZI | MKT_LEADER |
| 게이트 실패 피드백 | `FEEDBACK` | (자동) | (해당 팀) |

---

## 8. 예외 처리

### 8-1. 분류 애매한 경우

| 상황 | 처리 |
|------|------|
| 유형 판단 불가 (패턴 미매칭) | COO(MOZZI)에 에스컬레이션 → Smith님 판단 |
| 레벨 판단 불가 | DEV-L2 기본값 적용 (안전 방향) |
| Smith님 직접 지시와 자동 분류 충돌 | Smith님 지시 우선 |

### 8-2. 복합 유형

| 상황 | 판단 규칙 |
|------|----------|
| DEV + OPS (src/ + Dockerfile) | 더 높은 레벨 적용 → DEV 유형으로 통합 |
| DEV + MKT (src/ + docs/marketing/) | DEV 유형 (src/ 우선순위 1) |
| OPS + BIZ | OPS 유형 (코드 변경 우선) |
| MKT + BIZ | BIZ 유형 (전략 우선, 콘텐츠는 결정 후 집행) |

### 8-3. 긴급 오버라이드

| 트리거 | 동작 |
|--------|------|
| Smith님 직접 지시 "긴급" | L0 강제 적용 (유형 무관) |
| 프로덕션 장애 감지 | DEV-L0 자동 적용 |
| Smith님 "이건 L3로" | 해당 유형-L3 강제 적용 (최고 레벨) |

### 8-4. 게이트 실패 시 복구

| 게이트 | 실패 시 동작 | 최대 재시도 |
|--------|-------------|:----------:|
| Plan (파일 미존재) | 체인 차단, 작성 지시 | - |
| Design (파일 미존재) | 체인 차단, 작성 지시 | - |
| Do (MR < 95%) | 수정 루프 → 재검증 | 5회 |
| QA (커밋 없음) | 체인 차단 | - |
| Deploy (URL != 200) | 롤백 → 재배포 | 2회 |
| 검수 (반려) | 피드백 → 수정 → 재제출 | 3회 |

---

## 9. 현재 hook 확장 포인트

### 9-1. 현재 상태 (pdca-chain-handoff.sh v5 기준)

| 항목 | 현재 | 필요 변경 |
|------|------|----------|
| 레벨 판단 | `detect-process-level.sh` — DEV L0~L3만 | DEV/MKT/OPS/BIZ 4유형 분류 추가 |
| chain_step | `cto_to_coo` 하드코딩 | 유형별 분기 (`{type}_to_{next}`) |
| 상태 JSON | 미구현 | `.bkit/runtime/chain-status-{task}.json` 생성/업데이트 |
| MOZZI webhook | `http://127.0.0.1:18789/hooks/wake` 유지 | 변경 없음 |
| FROM_ROLE | CTO/PM 2개만 | MKT_LEADER 추가 |
| 유형 분류 함수 | 없음 | `detect-work-type.sh` 신규 필요 |

### 9-2. 신규 필요 hook/헬퍼

| 파일 | 역할 | 호출 시점 |
|------|------|----------|
| `.bkit/hooks/helpers/detect-work-type.sh` | 변경 파일 패턴으로 DEV/MKT/OPS/BIZ 분류 | chain-handoff 초반 |
| `.bkit/hooks/helpers/gate-checker.sh` | 유형×레벨에 맞는 게이트 목록 반환 + 통과 여부 체크 | 각 단계 전환 시 |
| `.bkit/hooks/helpers/chain-status-writer.sh` | chain-status JSON 생성/업데이트 | 게이트 통과 시 |

### 9-3. detect-process-level.sh 수정 방향

현재: `detect_level_from_commit()`, `detect_level_from_file()` — DEV 전용.

추가 필요:
1. `detect_work_type()` — 유형 판단 (DEV/MKT/OPS/BIZ)
2. 유형별 레벨 판단 로직 분기
3. 반환값: `WORK_TYPE` + `PROCESS_LEVEL` (예: `WORK_TYPE=MKT`, `PROCESS_LEVEL=L1`)

```bash
# 예시 인터페이스
detect_work_type      # → WORK_TYPE="DEV" | "MKT" | "OPS" | "BIZ"
detect_level_for_type # → PROCESS_LEVEL="L0" | "L1" | "L2" | "L3"
CHAIN_KEY="${WORK_TYPE}-${PROCESS_LEVEL}"  # → "DEV-L2", "MKT-L1" 등
```

### 9-4. chain_step 분기 매핑

| CHAIN_KEY | chain_step 시퀀스 |
|-----------|-----------------|
| DEV-L0 | `do → qa → deploy → cto_to_coo` |
| DEV-L1 | `do → cto_to_coo` |
| DEV-L2 | `plan → design → do → qa → deploy → cto_to_coo` |
| DEV-L3 | `plan → design → do → qa → smith_review → deploy → cto_to_coo` |
| OPS-L0 | `do → deploy → cto_to_coo` |
| OPS-L1 | `do → qa → deploy → cto_to_coo` |
| OPS-L2 | `plan → design → do → qa → deploy → cto_to_coo` |
| MKT-L1 | `do → coo_review → publish → mkt_to_coo` |
| MKT-L2 | `plan → do → coo_review → publish → mkt_to_coo` |
| BIZ-L1 | `do → smith_review → pm_to_coo` |
| BIZ-L2 | `plan → do → smith_review → pm_to_coo` |

---

## 10. 전체 매트릭스 요약 (2차원 표)

### 유형 × 레벨 → 체인 경로

|  | L0 | L1 | L2 | L3 |
|--|----|----|----|----|
| **DEV** | Do→QA→Deploy | Do→보고 | Plan→Design→Do→QA→Deploy | Plan→Design→Do→QA→수동검수→Deploy |
| **OPS** | Do→Deploy | Do→QA→Deploy | Plan→Design→Do→QA→Deploy | - |
| **MKT** | - | Do→검수→발행 | Plan→Do→검수→발행 | - |
| **BIZ** | - | Do→Smith확인 | Plan→Do→Smith결정 | - |

> `-` = 해당 유형에 존재하지 않는 레벨

### 유형 × 레벨 → 실행 주체

|  | L0 | L1 | L2 | L3 |
|--|----|----|----|----|
| **DEV** | CTO | CTO | PM→CTO | PM→CTO→Smith |
| **OPS** | CTO | CTO | PM→CTO | - |
| **MKT** | - | MKT→COO | MKT→COO | - |
| **BIZ** | - | PM→Smith | PM→Smith | - |

### 유형 × 레벨 → Match Rate 필요 여부

|  | L0 | L1 | L2 | L3 |
|--|----|----|----|----|
| **DEV** | 불필요 | 불필요 | 95% | 95% |
| **OPS** | 불필요 | 불필요 | 95% | - |
| **MKT** | - | 불필요 | 불필요 | - |
| **BIZ** | - | 불필요 | 불필요 | - |

---

## 하지 말 것

- src/ 코드 수정 (이 문서는 기획서)
- LLM 판단에 의존하는 게이트 설계 (전부 기계적 체크)
- 기존 pdca-chain-handoff.sh v5 직접 수정 (확장 포인트만 명시)
- MKT/BIZ에 Match Rate 게이트 적용 (코드 변경 없으므로 불필요)
- DEV-L3 자동 배포 (Smith님 수동검수 필수)

---

## 11. 크론 감시자 상세 설계

### 11-1. 개요

- 5분 주기 실행 (GCP Cloud Scheduler 또는 로컬 crontab)
- `.bkit/runtime/chain-status-*.json` 전체 스캔
- 각 TASK의 `current` 단계에 맞는 게이트를 기계적으로 체크
- 게이트 통과 → 다음 단계 자동 트리거 + Slack 알림

### 11-2. 게이트 체크 로직

| 게이트 | 체크 명령 | 판정 |
|--------|----------|------|
| **Plan** | `[ -f docs/01-plan/features/{feature}.plan.md ]` | 파일 존재 여부 |
| **Design** | `[ -f docs/02-design/features/{feature}.design.md ]` | 파일 존재 여부 |
| **Do (MR)** | `grep -oP '\d+(?=%)' docs/03-analysis/{feature}.analysis.md \| tail -1` | 숫자 ≥ 95 |
| **Commit** | `chain-status.json`의 `commit.hash != null` | 해시 존재 |
| **Deploy** | `curl -s -o /dev/null -w "%{http_code}" {url}` | HTTP 200 |
| **Review** | `chain-status.json`의 `review.done == true` | MOZZI 승인 |
| **Manual** | `chain-status.json`의 `manual_review.done == true` | Smith님 ACK |

Slack 알림 (단계 전환마다 hook이 직접 curl):

```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"C0AN7ATS4DD\",\"text\":\"[체인] ${TASK} — ${CURRENT} 완료 → ${NEXT} 시작\"}"
```

### 11-3. 다음 단계 트리거 방법

PM → CTO 직통 (claude-peers-mcp broker) — COO(MOZZI) 거치지 않음:

```bash
PEER_LIST=$(curl -s http://localhost:7899/list-peers -d '{"scope":"repo"}')
CTO_ID=$(echo "$PEER_LIST" | jq -r '[.[] | select(.summary | test("CTO_LEADER"))][0].id')
curl -s http://localhost:7899/send-message \
  -d "{\"to_id\":\"$CTO_ID\",\"text\":\"[CHAIN] ${TASK} Design 완료. Do 단계 시작. chain-status: .bkit/runtime/chain-status-${SLUG}.json\"}"
```

상태 JSON 업데이트:

```bash
bash .bkit/hooks/helpers/chain-status-writer.sh \
  --task "$TASK" --gate "$GATE" --done true --next "$NEXT_STAGE"
```

### 11-4. 실패 시 재시도 로직

| 게이트 | 재시도 주기 | 최대 횟수 | 에스컬레이션 |
|--------|-----------|:--------:|------------|
| Plan (파일 미존재) | 5분 | 6회 (30분) | COO 에스컬레이션 + Slack |
| Design (파일 미존재) | 5분 | 6회 (30분) | COO 에스컬레이션 + Slack |
| Do (MR < 95%) | 5분 | 5회 | pdca-iterator 자동 호출 후 재검증 |
| Deploy (URL != 200) | 5분 | 2회 | 롤백 트리거 + Smith님 Slack 알림 |
| Slack curl 실패 | 즉시 재시도 | 3회 | 로컬 로그만 |

재시도 횟수는 `chain-status.json`의 `retry_count` 필드로 추적.

### 11-5. 전체 시퀀스 다이어그램 (DEV-L2 기준)

```
크론(5분) ─→ chain-status 스캔
              │
              ├─ current="plan" → plan.md 파일 존재?
              │     O → current="design" + Slack
              │     X → retry_count++ (6회 초과 → COO 에스컬레이션)
              │
              ├─ current="design" → design.md 파일 존재?
              │     O → broker로 CTO 직통 전달 + current="do" + Slack
              │     X → retry_count++
              │
              ├─ current="do" → Match Rate ≥ 95%?
              │     O → current="commit" + Slack
              │     X → retry_count++ (5회 초과 → pdca-iterator 호출)
              │
              ├─ current="commit" → 커밋 해시 존재?
              │     O → current="deploy" + Slack
              │     X → retry_count++
              │
              └─ current="deploy" → URL HTTP 200?
                    O → current="done" + MOZZI webhook wake + Slack
                    X → retry_count++ (2회 초과 → 롤백 + Smith님 알림)
```

---

## 12. 실제 흐름 시나리오

### 시나리오 1: DEV-L0 핫픽스 (긴급 CTR 계산 버그)

```
T+0:00  Smith님: "프로덕션 CTR 계산 버그야 빨리"
T+0:01  MOZZI: "hotfix:" 패턴 감지 → DEV-L0 분류
        → chain-status-hotfix-ctr.json 생성 (type: DEV-L0, current: "commit")
        → broker로 CTO에게 직통 TASK 전달 (PM 깨우지 않음)
        → Slack C0AN7ATS4DD: "[긴급] DEV-L0 CTR 핫픽스 — CTO 즉시 대응"

T+0:03  CTO: 버그 수정 + 커밋 (hotfix: CTR 계산 오류 수정)

T+0:05  크론: commit 해시 존재 O
        → current="deploy" + Slack: "CTR 핫픽스 커밋 확인. 배포 시작."

T+0:06  CTO: Cloud Run 배포

T+0:10  크론: URL 200 O
        → current="done" + MOZZI webhook wake (L0, ANALYSIS_REPORT)
        → Slack: "✅ CTR 핫픽스 배포 완료"

T+0:11  MOZZI → Smith님: "CTR 버그 수정 완료. 약 10분 소요."

총 소요: ~11분
```

### 시나리오 2: DEV-L2 일반 개발 (처방전 기능)

```
T+0:00  Smith님: "처방전 기능 만들어"
T+0:01  MOZZI: src/ 변경 예상 + 고위험 패턴 없음 → DEV-L2 분류
        → chain-status-prescription.json 생성 (type: DEV-L2, current: "plan")
        → broker로 PM에게 TASK 전달
        → Slack: "[NEW] DEV-L2 처방전 기능 — PM Plan 단계"

T+0:05  PM: prescription.plan.md 작성 완료

T+0:10  크론: plan.md 존재 O
        → current="design" + Slack: "처방전 Plan 완료 → Design 단계"

T+0:15  PM: prescription.design.md 작성 완료

T+0:20  크론: design.md 존재 O
        → broker로 CTO에게 직통 전달 (COO 거치지 않음)
        → current="do" + Slack: "처방전 Design 완료 → CTO 구현 시작"

T+0:22  CTO: 구현 시작

T+2:30  CTO: 구현 완료 + gap 분석 → Match Rate 96%

T+2:35  크론: MR 96% ≥ 95% O
        → current="commit" + Slack: "Match Rate 96% 통과"

T+2:36  CTO: git commit (feat: 처방전 기능 구현)

T+2:40  크론: commit 해시 O
        → current="deploy" + Slack: "커밋 확인 → 배포 시작"

T+2:42  CTO: Cloud Run 배포

T+2:45  크론: URL 200 O
        → current="done" + MOZZI webhook wake (L2, MR 96%)
        → Slack: "✅ 처방전 기능 배포 완료"

T+2:46  MOZZI → Smith님: "처방전 기능 완료. Match Rate 96%."

총 소요: ~2시간 46분
```

### 시나리오 3: DEV-L3 고위험 (Auth 마이그레이션)

```
T+0:00  Smith님: "Firebase Auth를 자체 Auth로 교체해"
T+0:01  MOZZI: "auth" 패턴 감지 → DEV-L3 분류
        → Slack: "[L3] Auth 마이그레이션 — Smith님 수동검수 필수"
        → broker로 PM에게 TASK 전달

T+0:10  PM: plan.md + ADR 작성

T+0:15  크론: plan.md O → current="design"

T+0:35  PM: design.md + 롤백 전략 작성

T+0:40  크론: design.md O
        → broker로 CTO 직통 전달 + current="do"

T+4:00  CTO: 구현 완료 + gap 분석 (Match Rate: 97%)

T+4:05  크론: MR 97% O → current="commit"

T+4:06  CTO: git commit

T+4:10  크론: commit O → current="manual_review"
        → MOZZI webhook: "L3 수동검수 필요"
        → Slack: "⚠️ Auth 마이그레이션 Smith님 수동검수 대기"

T+4:15  MOZZI → Smith님: "Auth 마이그레이션 검수 요청. Match Rate 97%."
T+4:30  Smith님: "확인했어, 배포해" → manual_review.done=true

T+4:35  크론: manual_review O → current="deploy"
T+4:37  CTO: 배포
T+4:40  크론: URL 200 O → current="done"
        → Slack: "✅ Auth 마이그레이션 완료"

총 소요: ~4시간 40분
```

### 시나리오 4: OPS-L1 인프라 (환경변수 추가)

```
T+0:00  Smith님: "GEMINI_API_KEY 환경변수 추가해야 해"
T+0:01  MOZZI: services/ 변경, src/ 없음 → OPS-L1 분류
        → broker로 CTO에게 직통 전달 (Plan/Design 없음)

T+0:03  CTO: gcloud run services update + 커밋 (chore: GEMINI_API_KEY 추가)

T+0:05  크론: commit O → current="deploy"
T+0:06  CTO: 서비스 재배포
T+0:10  크론: URL 200 O → current="done"
        → Slack: "✅ OPS-L1 환경변수 추가 완료"

총 소요: ~10분
```

### 시나리오 5: MKT-L1 마케팅 (블로그 글 1편)

```
T+0:00  Smith님: "Meta 광고 최적화 블로그 글 하나 써"
T+0:01  MOZZI: MKT 패턴 → MKT-L1 분류
        → broker로 CMO(MKT_LEADER)에게 직통 전달
        → chain-status 생성 (type: MKT-L1, current: "do")

T+0:05  CMO: 초안 작성 완료

T+0:05  크론: do 완료 감지 (산출물 파일 생성)
        → MOZZI webhook: "MKT-L1 초안 완료, 검수 요청"
        → current="review" + Slack: "블로그 초안 — MOZZI 검수 중"

T+0:06  MOZZI: 검토 → 수정 피드백
T+0:10  CMO: 수정 → MOZZI 승인 → review.done=true

T+0:11  크론: review O → current="publish"
T+0:12  CMO: 블로그 발행 (URL 생성)
T+0:15  크론: publish URL 존재 O → current="done"
        → Slack: "✅ Meta 광고 최적화 블로그 발행 완료"

총 소요: ~15분
```

### 시나리오 6: BIZ-L2 전략 (수강료 가격 정책)

```
T+0:00  Smith님: "수강료 구조 바꾸려고 해"
T+0:01  MOZZI: 코드 변경 없음 + "가격" 키워드 → BIZ-L2 분류
        → broker로 PM에게 전달
        → Slack: "[BIZ-L2] 수강료 정책 — PM Plan 단계"

T+0:15  PM: pricing-policy.plan.md + ADR 작성

T+0:20  크론: plan.md O → current="do" (BIZ는 Design 없음)

T+0:40  PM: 전략 분석 문서 완성

T+0:45  크론: do 완료 감지 → current="manual_review"
        → MOZZI webhook: "BIZ-L2 Smith님 결정 필요"
        → Slack: "⚠️ 수강료 정책 Smith님 결정 대기"

T+0:46  MOZZI → Smith님: "수강료 정책 초안 완성. 결정해주세요."
T+1:10  Smith님: "이 방향으로 확정" → manual_review.done=true

T+1:11  크론: manual_review O → current="done"
        → MOZZI 기록 + Slack: "✅ 수강료 정책 확정"

총 소요: ~1시간 11분
```

### 크론 감시자 핵심 원칙

1. **COO 개입 최소화**: PM→CTO 전환은 broker 직통. COO는 MKT 검수, L3 승인, BIZ 결정, 에스컬레이션 시만 개입.
2. **Slack은 hook이 직접 curl**: MOZZI 거치지 않고 `C0AN7ATS4DD`에 직접 전송.
3. **LLM 판단 0**: 파일 존재, 숫자 비교, URL HTTP 상태코드만 체크.
4. **상태 JSON 단일 진실**: `.bkit/runtime/chain-status-{slug}.json`. 대시보드는 읽기 전용.
