# TASK: 총가치각도기 접근 제어 + 샘플 대시보드

> 우선순위: High
> 디자인: Primary #F75D5D, hover #E54949, Pretendard, shadcn/ui

## 요구사항

### 1. 총가치각도기 접근 조건 강화
현재 `src/app/(main)/protractor/layout.tsx`에서 role만 체크 중:
```ts
const ALLOWED_ROLES: UserRole[] = ["student", "alumni", "admin"];
```

변경:
- **admin**: 무조건 접근 (관리자)
- **student/alumni**: role 체크 + **광고계정 연결됨** + **믹스패널 데이터 있음** → 실제 대시보드
- **student/alumni 미연결**: role은 맞지만 광고계정/믹스패널 없음 → **샘플 대시보드**
- **member**: 가입자지만 비수강생 → **샘플 대시보드** (전환 유도)
- **lead**: 승인 대기 → 기존대로 /pending 리다이렉트

광고계정 연결 확인:
```sql
-- ad_account_assignments 테이블에서 user_id로 조회
SELECT * FROM ad_account_assignments WHERE user_id = '{user_id}';
```

믹스패널 데이터 확인:
```sql
-- profiles 테이블의 mixpanel_id 또는 별도 설정 확인
-- 또는 protractor_secrets 테이블
```

### 2. 샘플 대시보드 만들기
비수강생/미연결 수강생이 총가치각도기에 들어갔을 때 보는 데모 화면.

**구성:**
- 상단에 CTA 배너: 
  - member: "수강생 전용 기능입니다. 수강 신청하기"
  - student(미연결): "광고계정을 연결하면 내 데이터를 볼 수 있습니다"
- 아래에 샘플 대시보드:
  - SummaryCards: 샘플 숫자 표시 (실제 데이터 아님)
  - PerformanceTrendChart: 샘플 차트 (실제 모양으로)
  - DailyMetricsTable: 샘플 데이터 몇 행
  - ConversionFunnel: 샘플 퍼널
  - DiagnosticPanel: 샘플 진단 결과
- **수치는 블러 처리하지 않음** — 샘플이라고 명시하고 실제 모양으로 보여줌
  - 샘플 데이터는 리얼리스틱하게 (ROAS 350%, CTR 2.1% 등)
- "샘플 데이터" 워터마크나 뱃지로 샘플임을 명확히 표시

**파일 구조:**
- `src/app/(main)/protractor/sample-dashboard.tsx` — 샘플 대시보드 컴포넌트
- `src/app/(main)/protractor/page.tsx` — 조건에 따라 실제/샘플 분기

### 3. 사이드바 메뉴는 그대로
- 총가치각도기 메뉴는 모든 role에서 보임 (숨기지 않음)
- 클릭하면 조건에 따라 실제/샘플 분기

## 참고

### 현재 protractor 관련 파일
- `src/app/(main)/protractor/layout.tsx` — 접근 제어 (수정 필요)
- `src/app/(main)/protractor/page.tsx` — 메인 페이지
- `src/app/(main)/protractor/components/` — 차트, 카드 등 컴포넌트
- `src/lib/protractor/aggregate.ts` — 데이터 집계 로직

### DB 테이블
- `profiles`: id, role, name, mixpanel_id 등
- `ad_account_assignments`: user_id, account_id
- `ad_accounts`: id, account_name, meta_account_id
- `daily_ad_insights`: 광고 데이터
- `benchmarks`: 벤치마크 데이터

### 샘플 데이터 예시
```ts
const SAMPLE_SUMMARY = {
  totalSpend: 5230000,      // 523만원
  totalRevenue: 18305000,   // 1,830만원
  roas: 3.5,
  ctr: 2.1,
  cpc: 850,
  impressions: 892000,
  clicks: 18732,
  purchases: 245,
  purchaseValue: 18305000,
};
```

## 작업 순서
1. protractor/layout.tsx 접근 제어 로직 수정
2. sample-dashboard.tsx 생성 (샘플 데이터 + CTA 배너)
3. protractor/page.tsx에서 조건 분기 (실제 vs 샘플)
4. npm run build 확인
5. git add -A && git commit -m "feat: 총가치각도기 샘플 대시보드 + 접근 제어" && git push
6. openclaw gateway wake --text "Done: 총가치각도기 샘플 대시보드 완료" --mode now

## 체크리스트
- [ ] admin → 실제 대시보드 접근 OK
- [ ] student(연결됨) → 실제 대시보드 OK
- [ ] student(미연결) → 샘플 대시보드 + "광고계정 연결" 안내
- [ ] member → 샘플 대시보드 + "수강생 전용" 안내
- [ ] 샘플 데이터가 리얼리스틱하게 보임
- [ ] "샘플 데이터" 표시 명확
- [ ] npm run build 성공
- [ ] git push 완료
