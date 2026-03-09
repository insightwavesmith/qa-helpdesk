# TASK — 회원관리 (총가치각도기 연결)

> 의존: TASK-총가치각도기 T4 완료 후

## T1. approveMember() 확장
- 파일: `src/actions/admin.ts:53-80`
- 현재: profiles만 UPDATE (role, cohort)
- 추가: ad_accounts UPSERT + service_secrets UPSERT
- 전환 모달에서 받은 데이터를 한 트랜잭션으로 처리

## T2. 수강생 전환 모달 필드 추가
- 파일: `members-client.tsx`
- 추가 입력 필드:
  - Meta 광고계정 ID (act_XXX)
  - Mixpanel 프로젝트 ID
  - Mixpanel 보드 ID (신규)
  - Mixpanel Service Account Secret

## T3. 회원 상세 편집 모달
- 기존 회원 정보 수정 시 ad_accounts + service_secrets도 함께 편집

## T4. real-dashboard.tsx URL 파라미터
- `?account=act_XXX` 파라미터로 계정 선택
- 수강생 로그인 시 자동으로 본인 계정 로드

## T5. accounts/route.ts DELETE 핸들러
- 광고계정 삭제 API (관리자 전용)

## T6. meta_account_id 중복 정리
- profiles의 레거시 필드 vs ad_accounts 테이블
- ad_accounts를 진실의 원천으로 통일
- profiles.meta_account_id는 레거시 호환 유지 (onboarding.ts, settings-form.tsx 건드리지 않음)

---

## 리뷰 결과

리뷰 보고서: https://mozzi-reports.vercel.app/reports/review/2026-02-25-members-code-review.html

### 수정 파일 6개 (신규 없음)
- admin.ts (T1: +35줄), members-client.tsx (T2: +15줄), member-detail-modal.tsx (T3: +80줄)
- real-dashboard.tsx (T4: +10줄), accounts/route.ts (T5: +45줄), page.tsx (T4: +3줄)

### 주의사항
1. ad_accounts.account_id에 unique constraint 없음 → select-then-insert 패턴
2. useSearchParams() → Suspense 래핑 필수
3. service_secrets 쿼리 → as never 캐스트 (프로젝트 컨벤션)

### 결론: 구조적 문제 없음. 기존 패턴 확장.
