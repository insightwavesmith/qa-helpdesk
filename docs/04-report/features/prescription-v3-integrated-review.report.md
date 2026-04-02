# 처방 V3 Design 통합 점검 보고서

> 작성일: 2026-04-03
> COO: 모찌 (점검 + PM 대조 + 판정)
> PM: 기획팀 (V3 Design + As-Is 보고서 선행)
> 점검 프레임워크: 6단계 사고 (의도→역할→선행문서→과거결정충돌→영향범위→옵션+판단)
> 점검 축: **제어(시스템) + 자율성**
> 대상: docs/02-design/features/prescription-pipeline-v3.design.md

---

## Executive Summary

| 항목 | 결과 |
|------|------|
| V3 Design 3가지 개선 | **2건 정합, 1건 보완 필요** |
| 씬분석 주입 (§2.1) | ✅ 버그 확인, Design 수정 방향 정확 |
| 영상 File API (§2.2) | ⚠️ 정합하나 비용/타임아웃 리스크 있음 |
| 5축 통합 NO_ANALYSIS (§2.3) | ⚠️ null safety 보완 1건 필요 |
| TDD 35건 커버리지 | **34/35 정합, 1건(PV3-009) 검증 모호** |
| 마이그레이션 3단계 | ✅ 순서 적절, Phase 2 null guard 선행 조건 확인 |
| 크론 체인 충돌 | ✅ 충돌 없음 — **체인 연결 이미 구현됨** |
| 제어 이슈 | 2건 (null crash 경로, TDD 1건 모호) |
| 자율성 이슈 | 1건 (File API 폴백 시 처방 품질 열화 미측정) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | V3 Design이 COO 검토만 통과, 코드 정합성 미검증 상태에서 CTO 전달 위험 |
| **Solution** | 6단계 사고 기반 코드 레벨 검증 4건 + TDD Gap 분석 + 체인 충돌 확인 |
| **Function UX Effect** | CTO가 구현 시 코드 충돌/크래시 0건으로 시작 가능 |
| **Core Value** | Design→구현 전달 품질 게이트 역할 |

---

## 1. 6단계 사고 증거

| 단계 | 내용 |
|------|------|
| ① 의도 | 처방 정확도 향상 — 씬분석 활용, 영상 실시청, 파이프라인 끊김 해소 |
| ② 역할 | PM=V3 Design 35 TDD, CTO-2=구현, COO=이 통합 점검 |
| ③ 선행문서 | V3 Design, As-Is 보고서, 크론 헬스체크, 현행 엔진 코드 2개 |
| ④ 충돌 | null crash 경로 1건, cron-pipeline-v2와 체인 변경 중복 (이미 구현) |
| ⑤ 영향 | 처방 엔진 핵심 2파일 수정, 신규 1파일, 타입 1파일 |
| ⑥ 옵션 | 아래 각 이슈별 |

---

## 2. 점검 1: 씬분석 주입 (§2.1) — 코드 정합성

### 2.1 버그 확인: ✅ Design이 정확히 식별

**현행 코드** (`prescription-engine.ts:94`):
```typescript
sceneAnalysis = (videoData as any)?.video_analysis?.scene_analysis ?? null;
```

**실제 데이터 위치**: `video-scene-analysis` cron이 `analysis_json.scene_analysis`에 저장 (route.ts:754-763 확인).
- `video_analysis`은 별도 컬럼으로 DeepGaze 프레임 데이터 전용 (video-saliency가 저장)
- `scene_analysis`는 `analysis_json` JSONB 내부 키

**판정**: Design §2.1.1의 수정 방향 **정확**. `analysis_json.scene_analysis`에서 읽도록 변경 필요.

### 2.2 타입 검증: ✅ 정합

`src/types/prescription.ts:69-101`에 `AnalysisJsonV3.scene_analysis?` 정의 확인:
- `scenes[]` (time, type, desc, deepgaze, analysis)
- `overall` (total_scenes, hook_effective, cta_reached)
- Design §2.1.5의 `SceneAnalysisData = NonNullable<AnalysisJsonV3['scene_analysis']>` 재활용 전략 적합

### 2.3 step1→step2 파라미터 최적화: ✅ 효율적

Design §2.1.4의 "step1에서 이미 조회한 analysis_json을 step2에 전달" → DB 쿼리 1건 절약. step1에서 `analysis_json` 이미 SELECT하므로 정합.

### 2.4 프롬프트 주입: ✅ 적합

Design §2.1.3의 `buildSection2_Evidence`에 씬분석 서브섹션 추가 — SECTION 2(증거 자료)에 배치. 논리적으로 적합 (씬분석은 사전 분석 증거).

---

## 3. 점검 2: 영상 File API (§2.2) — 실현 가능성

### 3.1 현행 코드 확인

`prescription-prompt.ts:417-437` `buildMediaPart`:
- 이미지: `inline_data` (base64) ← 정상 동작
- 영상: `{ text: '[영상 소재 URL: ${url}]' }` ← **Gemini가 영상 못 봄**

### 3.2 File API 실현 가능성

| 항목 | 판정 | 근거 |
|------|------|------|
| API 가용성 | ✅ | Gemini File API GA, v1beta 엔드포인트 사용 가능 |
| 영상 크기 | ⚠️ | 광고 영상 평균 15-60초, 10-50MB. 2GB 제한 이내 |
| 처리 시간 | ⚠️ | 업로드+PROCESSING→ACTIVE 30-60초. TIMEOUT_MS 120초로 상향 필요 |
| 비용 | ⚠️ | +$60/월 (3000건 기준). Design §2.2.5 분석 정확 |
| 폴백 | ✅ | Design §2.2.3의 URL 텍스트 폴백 설계 적절 |

### 3.3 리스크: 폴백 시 품질 열화 미측정 (자율성 이슈)

File API 실패 → URL 텍스트 폴백 시, 처방 품질이 V2 수준으로 회귀. 이 열화를 **측정하는 메커니즘이 Design에 없음**.

**옵션**:
- A: meta.video_multimodal 플래그로 구분 후 처방 품질 수동 비교 (현재 Design)
- **B (추천)**: meta.video_multimodal=false인 처방에 `quality_degradation_warning` 추가. UI에서 "영상 직접 분석 불가 — 텍스트 기반 분석" 경고 표시.

### 3.4 비용 최적화

Design §2.2.6의 3가지 옵션 중 **`gemini_file_uri` 캐시**(옵션1)가 가장 효과적. 48시간 내 재처방 시 업로드 생략. 구현 난이도 낮음 (컬럼 1개 추가).

---

## 4. 점검 3: 5축 통합 NO_ANALYSIS 제거 (§2.3) — null safety

### 4.1 현행 코드의 crash 경로 발견 (제어 이슈 #1)

**`prescription-engine.ts:463-466`**:
```typescript
const analysisJson = media.analysis_json as AnalysisJsonV3;  // null일 수 있음

// 466행: null.top3_prescriptions → TypeError crash
if (!forceRefresh && analysisJson.top3_prescriptions && ...)
```

`media.analysis_json`이 DB에서 `null`일 때 (빈 객체 `{}`가 아닌 literal `null`):
- `null as AnalysisJsonV3` → TypeScript 타입 가드 무력화
- `null.top3_prescriptions` → **런타임 TypeError**

### 4.2 V3 Design 수정의 정합성

Design §2.3.1:
```typescript
const analysisJson: AnalysisJsonV3 = (media.analysis_json ?? {}) as AnalysisJsonV3;
```

`?? {}` coalesce가 `null` → `{}`로 변환. **이 수정은 정확**하며 crash 경로를 해소.

### 4.3 각 Step null safety 검증

| Step | `{}` 입력 | `null` 입력 (V3 수정 전) | 판정 |
|------|----------|------------------------|------|
| step4 `extractAttributes` | ✅ 빈 배열 반환 | ❌ `null[axis]` crash | V3 `?? {}` 수정으로 해소 |
| step5 `analyzeAccountDiversity` | ✅ diversityScore=100 | ✅ 내부 null guard | 안전 |
| 캐시 체크 (466행) | ✅ 단락평가 스킵 | ❌ `null.top3_prescriptions` crash | V3 `?? {}` 수정으로 해소 |
| step9 `buildPerformanceBacktrack` | N/A | ✅ ternary null guard | 안전 |

### 4.4 보완 필요: literal null TDD 케이스

Design TDD `PV3-014`: "analysis_json=null → 빈 객체 {}로 진행"
- 테스트 설명은 맞지만, **DB에서 null로 반환되는 케이스**(mock에서 `analysis_json: null` 설정)를 명시적으로 포함해야 함
- `PV3-013`은 "처방 생성 성공"만 검증, `PV3-014`가 "빈 객체 변환" 검증 → 둘 다 있으면 커버됨

**판정**: 보완 불필요 — PV3-014가 정확히 이 케이스를 커버. 다만 구현 시 `analysis_json: null`을 mock 데이터에 반드시 포함할 것.

---

## 5. 점검 4: TDD 35건 커버리지

### 5.1 Phase별 매핑 검증

| Phase | TDD 범위 | Design 섹션 | Gap |
|-------|---------|-----------|-----|
| Phase 1: 씬분석+버그수정 | PV3-001~012 (12건) | §2.1 | **0** |
| Phase 2: 5축통합 | PV3-013~022 (10건) | §2.3 | **0** |
| Phase 3: File API | PV3-023~035 (13건) | §2.2 | **0** |

### 5.2 개별 TDD 정합성 검토

| ID | 판정 | 비고 |
|----|------|------|
| PV3-001~008 | ✅ | 씬분석 읽기/쓰기/출력 전부 커버 |
| **PV3-009** | ⚠️ | "step2가 step1 결과 재사용 (DB 쿼리 절약)" — **검증 방법 모호**. 쿼리 횟수를 어떻게 테스트? spy on DB client? |
| PV3-010~012 | ✅ | 이미지 소재 미포함 + 프롬프트 지시 |
| PV3-013~022 | ✅ | null/빈 분석, 캐시, 성과 없음 커버 |
| PV3-023~035 | ✅ | 업로드, polling, 폴백, 타임아웃 전부 커버 |

### 5.3 PV3-009 검증 방법 제안

```typescript
// 테스트에서 DB client에 spy 걸고 step2 호출 시 creative_media SELECT 횟수 확인
// 또는: step2 파라미터에 analysisJson이 전달되면 DB 조회 안 함 (함수 시그니처 검증)
```

**제어 이슈 #2**: PV3-009의 검증 기준이 "DB 쿼리 1건 절약"인데, 이는 단위 테스트보다 **함수 시그니처 변경** 확인이 적합. `step2_fetchSaliencyData(svc, id, type, analysisJson)` — 4번째 파라미터 존재 여부로 검증.

---

## 6. 마이그레이션 3단계 리스크

### 6.1 순서 검증

| 단계 | 리스크 | 판정 |
|------|--------|------|
| **Phase 1**: 씬주입+버그수정 | 낮음 — 프롬프트 텍스트 추가 | ✅ 안전 |
| **Phase 2**: NO_ANALYSIS 제거 | **중간** — null crash 경로 | ⚠️ `?? {}` 수정이 반드시 Phase 2 첫 커밋에 포함 |
| **Phase 3**: File API | 높음 — 비용+타임아웃 | ⚠️ 폴백 내장으로 운영 리스크 낮지만 비용 모니터링 필요 |

### 6.2 선행 조건

| Phase | 선행 조건 | 검증 방법 |
|-------|----------|----------|
| Phase 1 | 없음 | 바로 시작 가능 |
| Phase 2 | Phase 1 완료 + `?? {}` guard 적용 | PV3-013, PV3-014 통과 |
| Phase 3 | Phase 2 완료 + GEMINI_API_KEY 환경변수 | PV3-023 통과 + 비용 알림 설정 |

### 6.3 롤백 전략 검증

Design §7.1의 롤백 전략:
- Phase 1: 조건분기 제거 → ✅ 적합
- Phase 2: 조건 복원 → ✅ 적합 (NO_ANALYSIS throw 복원)
- Phase 3: 폴백 내장 → ✅ 적합 (File API 실패 시 자동 URL 텍스트)

---

## 7. 크론 체인 충돌 검증

### 7.1 핵심 발견: 체인 연결 이미 구현됨

코드 검증 결과 cron-pipeline-v2 Design의 체인 변경이 **이미 코드에 반영**:

| 체인 | 코드 위치 | 상태 |
|------|----------|------|
| video-saliency → video-scene-analysis | video-saliency/route.ts:325-334 | ✅ 구현됨 |
| video-scene-analysis → run-prescription | video-scene-analysis/route.ts:796-803 | ✅ 구현됨 |
| run-prescription 배치 모드 | run-prescription/route.ts:82-107 | ✅ 구현됨 |
| run-prescription cron_runs 로깅 | run-prescription/route.ts:88,94,111 | ✅ 구현됨 |
| pipeline-chain.ts `chain=true` 자동 전파 | pipeline-chain.ts:32 | ✅ 확인됨 |

### 7.2 V3 Design과의 충돌 분석

V3 Design은 `prescription-engine.ts`와 `prescription-prompt.ts`만 수정. 크론 라우트 파일은 수정 대상에 포함되지 않음.

**충돌 없음**. V3 변경은 처방 엔진 내부 로직이고, 크론 체인은 엔진 호출자(run-prescription route)에서 처리. 계층이 분리되어 있음.

### 7.3 Scheduler 등록 연계

통합 점검 보고서(4/3)의 액션 #2 "run-prescription Scheduler 등록(06:00 KST)"이 V3 구현의 전제 조건:
- Scheduler 미등록 → 배치 모드 미실행 → V3 개선이 cron 경로에서는 미적용
- **V3 구현과 Scheduler 등록을 동시 진행 권고**

---

## 8. PM vs COO 대조 결과

| 항목 | PM (V3 Design) | COO 코드 점검 | 판정 |
|------|---------------|-------------|------|
| 씬분석 버그 위치 | video_analysis→analysis_json 수정 | 동일 확인 | ✅ 일치 |
| NO_ANALYSIS crash | `?? {}` 수정 | null literal crash 경로 추가 확인 | ✅ 수정 방향 동일, COO가 crash 경로 명시 |
| File API 비용 | +$60/월 | 동일 확인 | ✅ 일치 |
| 체인 변경 필요 | §2.3.5 "끊김 1 해소" | **이미 구현됨** — 설계서 오해 | ⚠️ PM 미인지 |
| TDD PV3-009 | "DB 쿼리 절약 검증" | 검증 방법 모호 | ⚠️ 의견 차이 |
| run-prescription 상태 | "Scheduler 미등록" | **이미 배치 모드+로깅 구현** | ⚠️ PM 데이터 구버전 |

### 판정

1. **Design §2.3.5 파이프라인 변경 전/후 다이어그램**: "TO-BE" 다이어그램의 체인 연결이 이미 코드에 있음. CTO에 "체인은 이미 구현, 엔진만 수정" 명시 필요.
2. **PV3-009**: 함수 시그니처 검증으로 대체 권고.

---

## 9. 확정 액션

### CTO-2 전달 사항

| # | 액션 | 우선순위 | 비고 |
|---|------|---------|------|
| 1 | **Phase 1: 씬분석 주입 + 버그수정** | P0 | §2.1 전체. TDD PV3-001~012 |
| 2 | **Phase 2: NO_ANALYSIS 제거** | P0 | §2.3 전체. `?? {}` guard 필수 선행. TDD PV3-013~022 |
| 3 | **Phase 3: 영상 File API** | P1 | §2.2 전체. TDD PV3-023~035. 비용 모니터링 설정 |

### CTO-2 주의사항

1. **체인 라우트 수정 불필요** — video-saliency, video-scene-analysis, run-prescription의 triggerNext/배치 모드는 이미 구현. `prescription-engine.ts`, `prescription-prompt.ts`, `gemini-file-uploader.ts(신규)`, `types/prescription.ts`만 수정.
2. **Phase 2 첫 커밋에 `?? {}` guard 반드시 포함** — 없으면 `analysis_json: null` 소재에서 런타임 crash.
3. **PV3-009 테스트**: step2 함수 시그니처에 `analysisJson` 파라미터 존재 확인으로 검증.
4. **File API 폴백 시 경고**: `meta.video_multimodal=false`인 처방에 품질 열화 가능성 인지.

---

## 10. 교훈

### 이번 점검에서 발견한 패턴

1. **PM Design이 코드 상태를 정확히 반영하지 못함** — 체인 연결이 이미 구현됐는데 Design은 "TO-BE"로 기술. 코드 레벨 점검 없이 전달하면 CTO가 이미 있는 것을 다시 구현할 리스크.
2. **null vs empty object 구분** — TypeScript `as` 캐스트가 null safety를 보장하지 않음. `?? {}` 패턴을 표준으로 적용해야.
3. **TDD 검증 방법까지 명시 필요** — "DB 쿼리 절약" 같은 검증은 구현 방법이 모호. "함수 시그니처 변경"처럼 구체적 검증 수단 명시 권고.

---

## 11. 문서 참조

| 문서 | 경로 |
|------|------|
| V3 Design (점검 대상) | docs/02-design/features/prescription-pipeline-v3.design.md |
| As-Is 보고서 | docs/04-report/features/prescription-pipeline-as-is.report.md |
| 크론 헬스체크 | docs/reports/ops/cron-health-check.md |
| 처방 엔진 코드 | src/lib/protractor/prescription-engine.ts |
| 처방 프롬프트 코드 | src/lib/protractor/prescription-prompt.ts |
| 파이프라인 체인 코드 | src/lib/pipeline-chain.ts |
| 통합 시스템 점검 보고서 | docs/04-report/features/system-review-integrated-2026-04-03.report.md |
| 본 통합 점검 보고서 | docs/04-report/features/prescription-v3-integrated-review.report.md |
