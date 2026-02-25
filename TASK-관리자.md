# TASK — 관리자 대시보드 + 광고계정 관리

> 의존: TASK-회원관리 완료 후

## T1. DB: owner_ad_summaries 테이블 생성
```sql
CREATE TABLE owner_ad_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  account_name text,
  owner_type text NOT NULL DEFAULT 'client',
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_spend numeric,
  total_revenue numeric,
  avg_roas numeric,
  total_purchases integer,
  collected_at timestamptz DEFAULT now()
);
```

## T2. 수강생 성과 대시보드
- 기수별 필터 (드롭다운)
- 요약 카드: 관리 수강생수 / 총 광고비 / 평균 ROAS / 총 매출
- 수강생별 성과 비교 테이블 (ROAS순/광고비순 정렬)
- 우수/미달 하이라이트

## T3. 관리자 광고계정 관리 섹션
- owner_ad_summaries 기반
- 카드 3개: 총 접근 계정 / 총 광고비 / 평균 ROAS
- 테이블: 계정별 광고비, 매출, ROAS, 구매수, 소유구분(본인/수강생/외부)

## T4. collect-owner-summaries 크론
- 주 1회 실행
- `GET /me/adaccounts` → 전체 계정 → 계정별 insights → owner_ad_summaries INSERT
