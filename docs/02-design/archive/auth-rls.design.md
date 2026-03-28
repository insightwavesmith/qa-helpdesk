# 인증 및 RLS 정책 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### profiles 테이블
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| id | UUID | 사용자 ID (auth.users 참조) | PRIMARY KEY, FK |
| email | TEXT | 이메일 주소 | NOT NULL |
| name | TEXT | 사용자 이름 | NOT NULL |
| phone | TEXT | 전화번호 | NOT NULL |
| shop_url | TEXT | 쇼핑몰 URL | NULLABLE |
| shop_name | TEXT | 쇼핑몰명 | NULLABLE |
| business_number | TEXT | 사업자등록번호 | NULLABLE |
| business_cert_url | TEXT | 사업자등록증 이미지 URL | NULLABLE |
| cohort | TEXT | 수강 기수 | NULLABLE |
| monthly_ad_budget | TEXT | 월 광고비 규모 | NULLABLE |
| annual_revenue | TEXT | 연매출 | NULLABLE |
| category | TEXT | 주요 판매 카테고리 | NULLABLE |
| reject_reason | TEXT | 거절 사유 | NULLABLE |
| role | user_role | 역할 (아래 참조) | NOT NULL |
| onboarding_status | TEXT | 온보딩 상태 | NULLABLE |
| onboarding_step | INTEGER | 온보딩 진행 단계 | NULLABLE |
| onboarding_completed | BOOLEAN | 온보딩 완료 여부 | NULLABLE |
| invite_code_used | TEXT | 사용한 초대 코드 | NULLABLE |
| meta_account_id | TEXT | Meta 광고계정 ID | NULLABLE |
| mixpanel_project_id | TEXT | Mixpanel 프로젝트 ID | NULLABLE |
| mixpanel_secret_key | TEXT | Mixpanel 시크릿키 | NULLABLE |
| mixpanel_board_id | TEXT | Mixpanel 보드 ID | NULLABLE |
| created_at | TIMESTAMPTZ | 생성 시간 | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | 수정 시간 | DEFAULT NOW() |

### 역할 정의 (user_role enum)
| 역할 | 설명 | 접근 범위 |
|------|------|----------|
| `lead` | 가입 후 미승인 / 거절됨 | /pending 페이지만 |
| `member` | 승인된 일반 사용자 (비수강생) | 대시보드, Q&A 제한 |
| `student` | 수강생 (초대코드 가입) | 전체 서비스 |
| `alumni` | 수료생 | 전체 서비스 |
| `assistant` | 보조 관리자 | 관리자와 동일 |
| `admin` | 관리자 | 전체 + 관리 |

> 주의: `pending`, `approved`, `rejected`는 존재하지 않음. 미승인=lead, 거절=lead+reject_reason.

## 2. API 설계

### Server Actions

| 함수명 | 위치 | 파라미터 | 설명 | 권한 |
|--------|------|----------|------|------|
| updateBusinessCertUrl | auth.ts | userId, url | 사업자등록증 URL 업데이트 | 본인 |
| getMembers | admin.ts | page, pageSize, role | 회원 목록 조회 (페이징) | 관리자 |
| approveMember | admin.ts | userId, newRole?, extra? | 회원 승인 (역할 변경 + 부가 정보) | 관리자 |
| rejectMember | admin.ts | userId, reason? | 회원 거절 (role=lead, reject_reason 기록) | 관리자 |

### approveMember extra 파라미터
```typescript
extra?: {
  cohort?: string;
  meta_account_id?: string;
  mixpanel_project_id?: string;
  mixpanel_secret_key?: string;
  mixpanel_board_id?: string;
  account_name?: string;
}
```

## 3. 컴포넌트 구조

```
src/app/(main)/admin/
├── members/
│   ├── page.tsx                    # 회원 관리 페이지
│   └── members-client.tsx          # 회원 목록 클라이언트 컴포넌트
└── layout.tsx                      # admin/assistant 권한 체크

src/app/(auth)/
├── login/page.tsx
├── signup/page.tsx
└── pending/page.tsx                # lead 역할 대기 페이지
```

## 4. 에러 처리

- RLS 위반 → 42501 insufficient_privilege → 로그인 리다이렉트
- 인증 만료 → 자동 로그아웃
- lead 역할 → /pending 리다이렉트 (middleware에서 처리)
- rejected (lead + reject_reason) → /pending에서 거절 사유 표시

## 5. RLS 정책 상세

### 핵심 헬퍼 함수
```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('member', 'student', 'alumni', 'assistant', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'assistant')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;
```

### 주요 RLS 정책 패턴
- 조회: is_approved_user() 또는 is_admin()
- 생성: is_approved_user() AND auth.uid() = author_id
- 수정/삭제: auth.uid() = author_id OR is_admin()
