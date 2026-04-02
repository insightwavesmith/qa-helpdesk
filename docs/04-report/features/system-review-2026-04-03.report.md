# 통합 시스템 점검 보고서

> 작성일: 2026-04-03
> 작성자: PM (기획팀)
> 레벨: 분석 TASK (P=범위, D=프레임워크, Do=보고서, C=커버리지, A=전달)
> 점검 프레임워크: 6단계 사고 (의도파악→역할체크→선행문서→과거결정충돌→영향범위→옵션+판단)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| 점검 대상 | Brick Dashboard (프+백 Gap), 크론 파이프라인 (운용성) |
| 점검 일자 | 2026-04-03 |
| 소요 시간 | 1 세션 |
| 핵심 발견 | Brick 백엔드 0% 구현, 크론 57% 미등록+68% 미로깅 |

### 결과 요약

| # | 점검 항목 | 심각도 | 제어/자율성 | 상태 |
|---|----------|--------|------------|------|
| 1 | Brick 백엔드 API 0% 구현 | **Critical** | 제어 (구현 Gap) | 미착수 |
| 2 | Brick API 경로 불일치 | **High** | 제어 (설계 충돌) | 미해결 |
| 3 | 크론 Cloud Run Jobs 권한 오류 | **Critical** | 제어 (인프라) | 장애 중 |
| 4 | 크론 미등록 엔드포인트 7건 | **High** | 제어 (운영 누락) | 미등록 |
| 5 | 크론 로깅 커버리지 32~43% | **Medium** | 자율성 (관측성) | 부분 동작 |
| 6 | 크론 체인 fire-and-forget 구조 | **Medium** | 자율성 (복원력) | 설계 한계 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| 문제 | Brick은 UI만 있고 서버 없음, 크론은 절반이 죽어있거나 미등록 |
| 해법 | Brick 백엔드 37개 API 구현 우선, 크론 IAM+Scheduler 일괄 정비 |
| 기능 UX 효과 | Brick 캔버스 실제 동작, 크론 장애 조기 감지 |
| 핵심 가치 | "AI한텐 강제, 나한텐 자유" 비전 달성의 전제 조건 확보 |

---

## 점검 분류: 제어 vs 자율성

본 보고서는 Smith님 지시에 따라 각 이슈를 **제어(Control)** 축과 **자율성(Autonomy)** 축으로 분류한다.

| 축 | 정의 | 해당 이슈 |
|----|------|----------|
| **제어** | 시스템이 의도대로 동작하지 않음. 구현 Gap, 권한 오류, 설계 불일치 등 "만들어야 하는데 없는 것" | #1 백엔드 0%, #2 경로 불일치, #3 권한 오류, #4 미등록 |
| **자율성** | 시스템이 스스로 상태를 파악하고 복구할 수 없음. 로깅 부재, 장애 감지 불가, 재시도 없음 등 "알아서 돌아가야 하는데 못 하는 것" | #5 로깅 32%, #6 fire-and-forget |

> 제어 이슈는 구현으로 해결. 자율성 이슈는 설계 개선으로 해결.

---

## 1. Brick Dashboard — 프론트엔드/백엔드 Gap 분석

### 1.1 의도파악

Smith님의 Brick 비전: "AI한텐 강제, 나한텐 자유, 시스템 안에서 AI도 자율."
Brick Dashboard는 이 비전의 GUI 구현체. n8n처럼 직관적 캔버스 + 실시간 모니터링.
**점검 의도**: Design 완료(145 TDD) 후 구현 착수 전, 프론트엔드-백엔드 간 실제 Gap을 정량 측정.

### 1.2 역할체크

| 역할 | 담당 | 상태 |
|------|------|------|
| PM | Design 문서 작성 (145 TDD) | **완료** |
| CTO | 백엔드 API 구현 (37개 엔드포인트) | **미착수** |
| CTO | 프론트엔드 구현 (캔버스+리소스) | **미착수** |

- 백엔드 Design: `docs/02-design/features/brick-dashboard.design.md` (308 TDD, API §5)
- 프론트엔드 Design: `docs/02-design/features/brick-dashboard-frontend.design.md` (145 TDD)
- 두 Design 모두 완료 상태. **CTO 구현 대기 중.**

### 1.3 선행문서확인

| 문서 | 경로 | 확인 결과 |
|------|------|----------|
| 백엔드 Design | `docs/02-design/features/brick-dashboard.design.md` | 존재. §5에 37개 API, §6에 DB 스키마, §8에 WebSocket |
| 프론트엔드 Design | `docs/02-design/features/brick-dashboard-frontend.design.md` | 존재. 145 TDD, Scratch UX, Notify+Adapter |
| 프론트엔드 Plan | `docs/01-plan/features/brick-dashboard-frontend.plan.md` | 존재. 5 Phase, 기술스택 확정 |
| Engine Design | `docs/02-design/features/brick-architecture.design.md` | 존재. ECS 패턴, K8s 리소스 모델 |
| dashboard/server/app.ts | `dashboard/server/app.ts` | 10개 라우트 그룹 등록. **brick 라우트 0개** |

### 1.4 과거결정충돌

**충돌 1: API 경로 불일치**

| 출처 | 경로 패턴 | 예시 |
|------|----------|------|
| 백엔드 Design (§5) | `/api/v1/block-types` | GET /api/v1/block-types |
| 프론트엔드 hooks | `/api/brick/block-types` | GET /api/brick/block-types |

프론트엔드 hooks(useBlockTypes, useTeams 등)는 `/api/brick/*` 경로를 사용.
백엔드 Design은 `/api/v1/*` 경로를 명시.
**둘 중 하나를 통일해야 함.** 현재 양쪽 모두 구현 전이므로 지금이 수정 적기.

**충돌 2: 기존 dashboard 라우트와 공존**

기존 10개 라우트 그룹(tickets, chains, costs 등)은 `/api/` 직접 경로 사용.
Brick은 별도 네임스페이스가 필요. `/api/brick/`이 기존 패턴과 충돌 없음.
**권장: `/api/brick/*`으로 통일** (프론트엔드 hooks 기준, 백엔드 Design을 수정).

### 1.5 영향범위

#### 1.5.1 백엔드 0% 구현 Gap (Critical)

**프론트엔드에서 호출하는 API 엔드포인트 전수 조사 결과:**

| 그룹 | 엔드포인트 수 | 프론트엔드 구현 | 백엔드 구현 | Gap |
|------|-------------|---------------|------------|-----|
| Block Types | 4 | hooks 완성 | **0개** | 100% |
| Teams | 10 | hooks 완성 | **0개** | 100% |
| Presets | 7 | hooks 완성 | **0개** | 100% |
| Executions | 6 | hooks 완성 | **0개** | 100% |
| Gates | 2 | hooks 완성 | **0개** | 100% |
| Learning | 3 | hooks 완성 | **0개** | 100% |
| System | 1 | hooks 완성 | **0개** | 100% |
| Review | 2 | hooks 완성 | **0개** | 100% |
| Notify | 1 | hooks 완성 | **0개** | 100% |
| WebSocket | 1 (ws) | useLiveUpdates 확장 | **0개** | 100% |
| **합계** | **37+** | **100%** | **0%** | **100%** |

> dashboard/server/app.ts에 등록된 라우트: tickets, chains, costs, budgets, dashboard, notifications, pdca, hooks, agents, routines.
> **brick 관련 라우트: 0개.**
> 프론트엔드를 지금 실행하면 모든 Brick 페이지에서 404 오류 발생.

#### 1.5.2 프론트엔드 준비도

| 항목 | 상태 |
|------|------|
| Design TDD | 145건 작성 완료 |
| Scratch UX 철학 | §1에 명시 (필수 적용) |
| Notify 블록 + Channel Adapter | §11에 설계 완료 |
| vitest 기존 테스트 | 235 passed / 1 failed (기존 dashboard) |
| React Flow + dagre + zustand | Plan에 확정, 미설치 |

프론트엔드는 Design 완료, 구현 미착수. 백엔드가 먼저 또는 동시에 진행돼야 함.

### 1.6 옵션도출 + 판단

#### 옵션 A: 백엔드 먼저 (직렬)

```
백엔드 37개 API 구현 (2주) → 프론트엔드 5 Phase (5주) = 총 7주
```

| 장점 | 단점 |
|------|------|
| 프론트엔드 개발 시 실제 API 테스트 가능 | 총 기간 7주 (직렬 대기) |
| 통합 버그 조기 발견 | 백엔드 2주간 프론트엔드 유휴 |

#### 옵션 B: 백엔드+프론트엔드 병렬 (MSW Mock)

```
백엔드 37개 API (2주) ─┐
프론트엔드 Phase 1~2 (2주) ─┤→ 통합 (1주) → Phase 3~5 (3주) = 총 6주
                              └ MSW mock으로 프론트 개발
```

| 장점 | 단점 |
|------|------|
| 총 기간 6주 (1주 단축) | MSW mock 유지 비용 |
| 프론트엔드 조기 착수 | 통합 시 mock ↔ 실제 불일치 위험 |

#### 옵션 C: 백엔드 스텁 + 프론트엔드 동시 (추천)

```
백엔드 스텁 (3일) → 프론트엔드 Phase 1 시작
백엔드 풀구현 (2주) ─┐
프론트엔드 Phase 1~5 (5주) ─┤→ 점진적 통합 = 총 5주
```

| 장점 | 단점 |
|------|------|
| 총 기간 5주 (최단) | 스텁→풀구현 전환 시 인터페이스 변경 위험 |
| 프론트엔드 즉시 착수 가능 | 백엔드 스텁 작성 공수 (3일) |
| Design 문서가 스텁 스펙 역할 | - |

**추천: 옵션 C** — 백엔드 Design(308 TDD)이 충분히 상세하므로 스텁을 빠르게 만들 수 있다.
프론트엔드 Phase 1(기반 구축)은 API 의존도가 낮아 스텁만으로 진행 가능.

#### API 경로 결정

**추천: `/api/brick/*`으로 통일**

| 근거 |
|------|
| 기존 10개 라우트(`/api/tickets` 등)와 네임스페이스 분리 |
| 프론트엔드 hooks가 이미 `/api/brick/*` 사용 |
| 백엔드 Design의 `/api/v1/`을 `/api/brick/`으로 일괄 치환 (구현 전이라 비용 0) |

---

## 2. 크론 파이프라인 — 운용성 점검

### 2.1 의도파악

bscamp 크론 파이프라인은 광고 소재 수집→분석→처방의 자동화 체인.
Smith님의 핵심 관심: "크론이 실제로 잘 돌고 있나? 장애 나면 알 수 있나?"
**점검 의도**: 현재 크론 체인의 실제 동작 상태, 장애 감지 능력, 운영 가시성을 정량 측정.

### 2.2 역할체크

| 역할 | 담당 | 상태 |
|------|------|------|
| CTO | 크론 엔드포인트 28개 구현 | 구현됨 (일부 미등록) |
| CTO | Cloud Run Jobs 5개 설정 | **권한 오류 (code:7)** |
| CTO | Cloud Scheduler 등록 | 23/28 등록 (7개 누락) |
| PM | 크론 건강 점검 보고서 | 2026-03-30 작성 완료 |

### 2.3 선행문서확인

| 문서 | 경로 | 확인 결과 |
|------|------|----------|
| 크론 건강 점검 | `docs/reports/ops/cron-health-check.md` | 2026-03-30 작성. 28개 엔드포인트 전수 조사 |
| 파이프라인 현황 | `docs/04-report/features/prescription-pipeline-as-is.report.md` | 22개 스크립트, 41% 자동화율 |
| ADR-001 | `docs/adr/ADR-001-account-ownership.md` | account_id 기반 데이터 분리 |
| 파이프라인 순서 메모리 | `project_pipeline_order_change.md` | 임베딩→DeepGaze→5축 순서 확정 |
| DeepGaze 로컬 실행 메모리 | `project_deepgaze_local_process.md` | Cloud Run 아닌 Mac Studio 실행 |

### 2.4 과거결정충돌

**충돌 1: Cloud Run Jobs vs Cloud Scheduler 이중 구조**

| 실행 방식 | 대상 | 문제 |
|----------|------|------|
| Cloud Scheduler → HTTP | 크론 엔드포인트 23개 | 정상 동작 (대부분) |
| Cloud Run Jobs | 5개 (embed, saliency 등) | **전부 code:7 PERMISSION_DENIED** |

Cloud Run Jobs가 모두 권한 오류. 2026-03-30 건강 점검에서 이미 발견됐으나 **미해결 상태**.
embed-creatives는 추가로 code:13 (INTERNAL) 발생.

**충돌 2: fire-and-forget 체인 설계**

크론 체인 구조:
```
collect-daily-creatives
  → triggerNext("process-media")
    → triggerNext(["embed-creatives", "creative-saliency", "video-saliency"])  // 병렬
```

`triggerNext`는 fetch + 2초 AbortSignal로 구현. **응답을 기다리지 않는다.**
- 다음 단계가 실패해도 이전 단계는 모른다
- 체인 중간에 끊겨도 알림 없음
- 재시도 로직 없음

이 설계는 의도적(빠른 응답 반환)이지만, **장애 시 자동 복구 불가**.

### 2.5 영향범위

#### 2.5.1 Cloud Run Jobs 권한 오류 (Critical)

| Job 이름 | 상태 | 마지막 실행 | 결과 |
|----------|------|------------|------|
| embed-creatives | **code:13** | 실행됨 | INTERNAL 오류 |
| creative-saliency | **code:7** | 실행됨 | PERMISSION_DENIED |
| video-saliency | **code:7** | 실행됨 | PERMISSION_DENIED |
| analyze-five-axis | **code:7** | 실행됨 | PERMISSION_DENIED |
| compute-similarity | **code:7** | 실행됨 | PERMISSION_DENIED |

**영향**: 파이프라인 체인에서 3단계(embed, creative-saliency, video-saliency) 병렬 작업이 모두 실패.
소재 임베딩, 시각 돋보임 분석, 영상 돋보임 분석이 돌지 않아 처방 엔진 입력 데이터 부족.

#### 2.5.2 미등록 엔드포인트 7건 (High)

| 엔드포인트 | 용도 | 상태 |
|-----------|------|------|
| discover-accounts | BM 계정 탐색 | Cloud Scheduler 미등록 |
| competitor-check | 경쟁사 모니터링 | Cloud Scheduler 미등록 |
| publish-scheduled | 예약 발행 | Cloud Scheduler 미등록 |
| video-scene-analysis | 영상 씬 분석 | Cloud Scheduler 미등록 |
| cleanup-old-data | 오래된 데이터 정리 | Cloud Scheduler 미등록 |
| sync-ad-metrics | 광고 지표 동기화 | Cloud Scheduler 미등록 |
| generate-weekly-report | 주간 보고서 생성 | Cloud Scheduler 미등록 |

**영향**: 이 7개 크론은 코드는 있지만 트리거가 없어 실행되지 않음.
특히 `discover-accounts`(BM 154개 중 90개 활성), `video-scene-analysis`(처방 V3 전제), `sync-ad-metrics`(광고 성과 데이터)는 핵심 기능.

#### 2.5.3 로깅 커버리지 (Medium)

| 지표 | 현재 | 목표 |
|------|------|------|
| cron_runs 로깅 | 9/28 엔드포인트 (32%) | 28/28 (100%) |
| 건강 점검 대시보드 | 3개 크론만 모니터링 | 전체 모니터링 |
| cron_runs.details 컬럼 | 마이그레이션 누락 | 추가 필요 |
| 실패 알림 | 없음 | Slack/Discord 알림 |

**영향**: 크론 68%의 실행 여부를 알 수 없음. 장애가 나도 수동 점검 전까지 모름.
`cron_runs.details` 컬럼이 마이그레이션에서 누락되어 실패 원인 기록 불가.

### 2.6 옵션도출 + 판단

#### 이슈 #3: Cloud Run Jobs 권한 오류

**옵션 A: IAM 일괄 수정 (추천)**

```
Cloud Run Jobs 서비스 계정에 roles/run.invoker + roles/cloudsql.client 부여
5개 Job 재실행 → 동작 확인
```

| 장점 | 단점 |
|------|------|
| 근본 원인 해결 | IAM 변경은 L3 (Smith님 확인 필요) |
| 5개 Job 일괄 복구 | - |

**옵션 B: Cloud Run Jobs 폐지 → Cloud Scheduler HTTP로 전환**

```
5개 Job을 크론 엔드포인트로 이전
Cloud Scheduler에 HTTP 트리거 등록
```

| 장점 | 단점 |
|------|------|
| 실행 방식 통일 (HTTP only) | 장시간 작업(embed 등) HTTP 타임아웃 위험 |
| Cloud Run Jobs 관리 불필요 | 기존 코드 리팩터링 필요 |

**추천: 옵션 A** — IAM 수정 1회로 5개 Job 일괄 복구. 옵션 B는 장시간 작업에 부적합.

#### 이슈 #4: 미등록 엔드포인트 7건

**옵션 A: 전부 등록 (추천)**

```
gcloud scheduler jobs create http ... × 7건
우선순위: video-scene-analysis > discover-accounts > sync-ad-metrics > 나머지
```

| 장점 | 단점 |
|------|------|
| 코드가 이미 있으므로 등록만 하면 됨 | 7건 동시 활성화 시 부하 |
| 누락된 기능 즉시 복구 | 일부는 더 이상 불필요할 수 있음 |

**옵션 B: 필요한 것만 선별 등록**

```
video-scene-analysis, discover-accounts, sync-ad-metrics 3건만 등록
나머지 4건은 필요성 재검토 후 결정
```

| 장점 | 단점 |
|------|------|
| 핵심만 빠르게 복구 | 나머지 4건 검토 추가 공수 |
| 불필요한 크론 부하 방지 | - |

**추천: 옵션 B** — 핵심 3건 즉시 등록, 나머지는 사용 여부 확인 후 결정.
특히 `video-scene-analysis`는 처방 V3의 전제 조건이므로 최우선.

#### 이슈 #5: 로깅 커버리지

**옵션 A: cron_runs 로깅 전수 적용 (추천)**

```
모든 크론 핸들러에 logCronRun() 래퍼 적용
cron_runs.details 컬럼 마이그레이션 추가
건강 점검 대시보드에 28개 전체 표시
```

| 장점 | 단점 |
|------|------|
| 100% 가시성 확보 | 28개 핸들러 수정 |
| 장애 즉시 감지 | - |

**옵션 B: 핵심 체인만 로깅 강화**

```
collect→process→embed/saliency 체인 5개만 상세 로깅
나머지는 현행 유지
```

| 장점 | 단점 |
|------|------|
| 수정 범위 최소 | 68%는 여전히 블라인드 |
| 핵심 체인 가시성 확보 | - |

**추천: 옵션 A** — 로깅은 한 번 적용하면 영구. 28개 전수 적용이 장기적으로 올바름.

#### 이슈 #6: fire-and-forget 체인 구조

**옵션 A: 결과 콜백 추가 (추천)**

```
triggerNext 후 결과를 cron_runs에 기록
실패 시 cron_runs.status = 'chain_failed' + Slack 알림
재시도: 3회까지 자동, 이후 수동 개입 알림
```

| 장점 | 단점 |
|------|------|
| 기존 구조 유지하면서 관측성 추가 | triggerNext 응답 대기 → 지연 증가 |
| 체인 끊김 즉시 감지 | - |

**옵션 B: 이벤트 큐 도입 (장기)**

```
Redis/Cloud Tasks 기반 작업 큐
각 단계가 큐에 다음 작업 등록 → 워커가 소비
실패 시 DLQ + 재시도
```

| 장점 | 단점 |
|------|------|
| 근본적 복원력 확보 | 인프라 추가 (Redis/Tasks) |
| 순서 보장 + 재시도 | 현재 규모에 과잉 가능 |

**추천: 옵션 A (단기) + 옵션 B 검토 (중장기)** — 현재 규모(28개 크론, 일 3000건)에서는 콜백+알림으로 충분.
파이프라인 규모가 10배 이상 커지면 큐 도입 재검토.

---

## 3. 종합 우선순위 매트릭스

| 우선순위 | 이슈 | 축 | 공수 | 선행 조건 |
|---------|------|-----|------|----------|
| **P0** | #3 Cloud Run Jobs IAM | 제어 | 0.5일 | Smith님 IAM 승인 |
| **P0** | #1 Brick 백엔드 API 37개 | 제어 | 2주 | API 경로 통일 결정 |
| **P1** | #2 API 경로 통일 (/api/brick/) | 제어 | 0.5일 | 결정만 (구현 전) |
| **P1** | #4 미등록 엔드포인트 3건 | 제어 | 0.5일 | #3 완료 후 |
| **P2** | #5 로깅 전수 적용 | 자율성 | 2일 | 없음 |
| **P2** | #6 체인 콜백 추가 | 자율성 | 3일 | #5 완료 후 |

### 즉시 실행 가능 (이번 주)

1. **Cloud Run Jobs IAM 수정** → 5개 Job 복구 (P0, 0.5일)
2. **API 경로 `/api/brick/*`으로 통일 결정** → 백엔드 Design 수정 (P1, 0.5일)
3. **핵심 크론 3건 Scheduler 등록** (P1, 0.5일)

### 다음 스프린트

4. **Brick 백엔드 37개 API 구현** (P0, 2주)
5. **cron_runs 로깅 전수 적용** (P2, 2일)
6. **체인 콜백 + 실패 알림** (P2, 3일)

---

## 4. 6단계 사고 프레임워크 증거 인덱스

각 항목별로 6단계 사고의 증거가 보고서 어디에 있는지 명시:

| 단계 | Brick Dashboard | 크론 파이프라인 |
|------|----------------|---------------|
| ① 의도파악 | §1.1 — Smith님 Brick 비전 | §2.1 — 크론 실제 동작 여부 |
| ② 역할체크 | §1.2 — PM 완료/CTO 미착수 | §2.2 — CTO 구현/권한 오류 |
| ③ 선행문서 | §1.3 — Design 2건+Plan+Engine | §2.3 — 건강점검+파이프라인+ADR |
| ④ 과거결정충돌 | §1.4 — API 경로 불일치 | §2.4 — Jobs vs Scheduler, fire-and-forget |
| ⑤ 영향범위 | §1.5 — 37개 API 0%, 145 TDD | §2.5 — Jobs 5개, 미등록 7개, 로깅 32% |
| ⑥ 옵션+판단 | §1.6 — 옵션 C 추천 (스텁+병렬) | §2.6 — IAM/선별등록/전수로깅/콜백 |

---

## 5. 부록: 데이터 출처

| 데이터 | 출처 | 수집 방법 |
|--------|------|----------|
| 백엔드 라우트 0건 | `dashboard/server/app.ts` | 코드 직접 확인 |
| 프론트엔드 hooks 37+ | `dashboard/src/hooks/brick/` | Grep 전수 조사 |
| TDD 145건 | `brick-dashboard-frontend.design.md` §14 | 문서 직접 확인 |
| Cloud Run Jobs 5건 code:7 | `docs/reports/ops/cron-health-check.md` | 건강 점검 보고서 |
| 미등록 7건 | `docs/reports/ops/cron-health-check.md` | 건강 점검 보고서 |
| cron_runs 9/28 | `docs/reports/ops/cron-health-check.md` | 건강 점검 보고서 |
| 체인 구조 | `src/app/api/cron/` triggerNext | 코드 직접 확인 |
| 파이프라인 자동화율 41% | `prescription-pipeline-as-is.report.md` | 보고서 확인 |
