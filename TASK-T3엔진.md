# TASK-T3엔진.md — 다수 광고계정 + T3 점수 엔진 + 기간 선택 UI

> 작성: 모찌 | 2026-02-26
> 우선순위: 최긴급
> 아키텍처 참조: `docs/design/` + 모찌리포트 #61 T3 점수 아키텍처

---

## ⚠️ 절대 규칙

1. **기존 코드를 먼저 읽어라.** total-value/route.ts, real-dashboard.tsx, settings-form.tsx 등.
2. **아키텍처 원칙:** 일별 raw 저장, T3 점수는 조회 시점에 동적 계산, 비율은 분자/분모 각각 SUM 후 재계산.
3. **일별 비율 평균 사용 절대 금지.** CTR = Σclicks/Σimpressions×100 (일별 CTR 평균 X).
4. **"이미 구현됨"이라고 판단하지 마라.** 현재 구현과 아래 스펙을 비교하여 다르면 수정.

---

## Part A. 다수 광고계정 완성

### A1. 총가치각도기 계정 선택 드롭다운
- **현재:** real-dashboard.tsx에서 첫 번째 계정만 자동 선택
- **수정:**
  - 상단에 계정 선택 드롭다운 표시 (계정이 2개 이상일 때)
  - 계정명(account_name) + 계정ID 표시
  - 선택 변경 시 대시보드 전체 데이터 리로드
  - 계정 1개면 드롭다운 숨기고 바로 표시
- **API:** `GET /api/protractor/accounts` (이미 구현됨) → 계정 목록 가져오기
- **파일:** `src/app/(main)/protractor/real-dashboard.tsx`

### A2. 설정 페이지 광고계정 추가
- **현재:** 편집 폼은 있으나 "추가" 기능 동작 확인 필요
- **수정:**
  - "+ 광고계정 추가" 버튼 → 새 계정 ID + 믹스패널 정보 입력 폼
  - 저장 시 ad_accounts + service_secrets INSERT
  - 기존 saveAdAccount() 로직 재사용
- **파일:** `src/app/(main)/settings/settings-form.tsx`

### A3. 설정 페이지 광고계정 삭제
- **현재:** DELETE API 있음 (`/api/protractor/accounts`)
- **수정:** 설정 페이지에서 삭제 버튼 + 확인 다이얼로그
- **주의:** profiles.meta_account_id가 삭제 대상이면 다른 계정으로 변경하거나 null

---

## Part B. T3 점수 엔진 — 기간별 동적 계산

### B1. total-value API에 period 파라미터 추가
- **현재:** date_start/date_end 파라미터로 기간 지정 가능 (이미 구현)
- **수정:** `period` 파라미터 추가 (1, 7, 14, 30)
  - period=1 → 어제 하루
  - period=7 → 최근 7일
  - period=14 → 최근 14일
  - period=30 → 최근 30일
  - period 없으면 기본값 = 1 (어제)
  - 내부적으로 date_start/date_end 자동 계산

### B2. T3 총점 계산 (0~100)
- **현재:** 등급만 있음 (A/B/C/D/F), 숫자 점수 없음
- **수정:** 벤치마크 percentile 기반 0~100점 산출

```typescript
// 지표별 점수 계산
function calculateMetricScore(value: number, benchmark: Benchmark, ascending: boolean): number {
  const { p25, p50, p75, p90 } = benchmark;
  if (ascending) { // CTR, ROAS 등 높을수록 좋음
    if (value >= p90) return 100;
    if (value >= p75) return 75 + (value - p75) / (p90 - p75) * 25;
    if (value >= p50) return 50 + (value - p50) / (p75 - p50) * 25;
    if (value >= p25) return 25 + (value - p25) / (p50 - p25) * 25;
    return Math.max(0, (value / p25) * 25);
  } else { // CPC, CPM 등 낮을수록 좋음
    if (value <= p25) return 100;
    if (value <= p50) return 75 + (p50 - value) / (p50 - p25) * 25;
    if (value <= p75) return 50 + (p75 - value) / (p75 - p50) * 25;
    if (value <= p90) return 25 + (p90 - value) / (p90 - p75) * 25;
    return Math.max(0, 25 - (value - p90) / p90 * 25);
  }
}
```

### B3. 진단 3파트 점수
- **A. 기반점수:** 3초 시청률(↑), ThruPlay율(↑), 지속비율(↑)
- **B. 참여율:** 좋아요/댓글/공유/저장/참여합계 per 10K(↑)
- **C. 전환율:** CTR(↑), 결제시작율(↑), 구매전환율(↑), 노출대비구매전환율(↑), 결제→구매율(↑)

```
파트 점수 = 파트 내 지표 점수 평균
T3 총점 = (A + B + C) / 3
```

### B4. 지표별 집계 규칙 (필수 준수)

| 지표 | 집계 | 계산식 | 방향 |
|------|------|--------|------|
| 3초시청률(훅비율) | WEIGHTED_AVG | Σvideo_play_actions / Σreach × 100 | ↑ |
| ThruPlay율 | WEIGHTED_AVG | Σthruplay / Σimpressions × 100 | ↑ |
| 지속비율 | WEIGHTED_AVG | Σthruplay / Σvideo_play_actions × 100 | ↑ |
| CTR | WEIGHTED_AVG | Σclicks / Σimpressions × 100 | ↑ |
| 참여합계 | WEIGHTED_AVG | Σ(reactions+comments+shares+saves) / Σimpressions × 10K | ↑ |
| 결제시작율 | WEIGHTED_AVG | Σinitiate_checkout / Σclicks × 100 | ↑ |
| 구매전환율 | WEIGHTED_AVG | Σpurchases / Σclicks × 100 | ↑ |
| 노출대비구매 | WEIGHTED_AVG | Σpurchases / Σimpressions × 100 | ↑ |
| 결제→구매율 | WEIGHTED_AVG | Σpurchases / Σinitiate_checkout × 100 | ↑ |

**핵심:** 일별 비율을 평균내지 않는다. 분자/분모 각각 SUM 후 재계산.

### B5. 벤치마크 기간 매칭
- 비율 지표(CTR/CPC/ROAS 등)는 기간 무관 → 7일 벤치마크 재활용
- benchmarks 테이블에서 가장 최근 벤치마크 조회

### B6. 데이터 부족 시 처리
- 선택 기간보다 데이터가 적으면: 있는 데이터로 계산 + "N일치 데이터 기준" 안내
- 데이터 0일: 점수 미표시, "내일부터 확인 가능합니다" 안내
- dataAvailableDays를 API 응답에 포함

### B7. API 응답 구조 수정

```typescript
// GET /api/protractor/total-value?account_id=xxx&period=7
{
  score: 72,                    // T3 총점 0~100
  period: 7,
  dataAvailableDays: 7,
  grade: { grade: "B", label: "양호" },
  diagnostics: {
    foundation: { score: 75, metrics: [...] },   // 기반점수
    engagement: { score: 63, metrics: [...] },    // 참여율
    conversion: { score: 78, metrics: [...] },    // 전환율
  },
  metrics: [...],               // 6개 핵심 지표 (기존)
  summary: { spend, impressions, reach, clicks, purchases, purchase_value }
}
```

---

## Part C. 기간 선택 UI

### C1. 기간 탭 추가
- **위치:** 게이지 위 (총가치각도기 최상단)
- **탭:** [어제] [7일] [14일] [30일]
- **기본값:** 어제
- **동작:** 탭 클릭 → API 호출 (period 파라미터) → 게이지/지표/진단/TOP5 전체 갱신
- **파일:** `src/app/(main)/protractor/real-dashboard.tsx`

### C2. 게이지에 기간 정보 표시
- 현재: "1일 기준" 텍스트
- 수정: 선택한 기간에 맞게 "7일 기준", "30일 기준" 등 동적 변경
- 데이터 부족 시: "N일치 데이터 기준" 표시

### C3. TOP 5 기간 연동
- 기간 선택에 따라 TOP 5도 해당 기간 합산 기준으로 변경
- 어제 → 어제 purchase_value 기준 TOP 5
- 7일 → 최근 7일 purchase_value 합산 기준 TOP 5

### C4. 일별 데이터 테이블 기간 연동
- 선택 기간에 해당하는 일별 데이터만 표시
- 어제 → 1행, 7일 → 7행, 30일 → 30행

---

## 수정 대상 파일

1. `src/app/api/protractor/total-value/route.ts` — period 파라미터 + T3 점수 엔진
2. `src/app/(main)/protractor/real-dashboard.tsx` — 기간 탭 + 계정 드롭다운 + UI 연동
3. `src/app/(main)/settings/settings-form.tsx` — 광고계정 추가/삭제 완성
4. `src/components/protractor/TotalValueGauge.tsx` — 기간 정보 표시
5. `src/components/protractor/DiagnosticPanel.tsx` — 진단 3파트 점수 연동
6. `src/app/api/protractor/insights/route.ts` — 기간별 TOP 5 쿼리

---

## 완료 기준

- [ ] 다수 광고계정 드롭다운 정상 (2개 이상 시)
- [ ] 설정에서 광고계정 추가/삭제 동작
- [ ] T3 총점 0~100 숫자로 표시
- [ ] 진단 3파트 각각 점수 표시 (기반/참여/전환)
- [ ] 기간 탭(어제/7일/14일/30일) 동작
- [ ] 기간 변경 시 게이지+지표+진단+TOP5 전체 갱신
- [ ] 비율 지표: 분자/분모 SUM 후 재계산 (일별 평균 사용 안 함)
- [ ] 데이터 부족 시 안내 메시지 표시
- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS

---

## 리뷰 결과
- 모찌 검토 완료 (2026-02-26)
- T3 아키텍처 문서(모찌리포트 #61) 기반

---

## 금지 사항

- 일별 비율(CTR/CPC 등)을 평균내는 코드 작성 금지
- 목업에 없는 UI 요소 추가 금지 (기간 탭/계정 드롭다운은 예외)
- 다크모드 스타일 추가 금지
- "이미 구현됨" 판단 후 스킵 금지
