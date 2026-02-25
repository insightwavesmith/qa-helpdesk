# TASK — 타겟중복율 (신규 서비스)

> 의존: TASK-총가치각도기 완료 후 (adset_overlap_cache 테이블은 여기서 생성)

## T1. DB: adset_overlap_cache 테이블 생성
```sql
CREATE TABLE adset_overlap_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  adset_pair text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  overlap_data jsonb NOT NULL,
  cached_at timestamptz DEFAULT now(),
  UNIQUE(account_id, adset_pair, period_start, period_end)
);
```

## T2. 타겟중복 API
- 신규: `/api/protractor/overlap`
- 입력: account_id, date_start, date_end
- 로직:
  1. 캐시 확인 → HIT면 즉시 반환
  2. MISS:
     a. `GET /act_{id}/campaigns` (활성 OUTCOME_SALES)
     b. 각 캠페인의 활성 adset 목록
     c. 각 adset 개별 reach (Insights API)
     d. 2개씩 조합: `level=account` + `filtering=[adset.id IN [A,B]]` → 합산 unique reach
     e. 전체 합산: `filtering=[adset.id IN [모두]]`
  3. 중복율 = (개별합 - 합산unique) / 개별합
  4. adset_overlap_cache에 저장
- 출력: `{ overall_rate, total_unique, individual_sum, pairs: [{adset_a_name, adset_b_name, campaign_a, campaign_b, overlap_rate}] }`
- 기간 7일 미만 → 비활성 + 안내

## T3. OverlapAnalysis 컴포넌트
- 대시보드 상단 탭: [성과 요약] [타겟중복]
- UI (목업 v3 기준):
  1. 히어로: 전체 중복률 도넛 + 실제도달/개별합/중복낭비
  2. 위험 경고: 60%↑ 조합만 — **캠페인명 + 광고세트명 그대로 표시**
  3. 전체 세트 테이블: 캠페인명, 세트명, Reach, 최고중복, 상태
  4. "새로 분석" 버튼 (캐시 무시 재호출)
  5. 해석 가이드 + 마지막 분석 시각
