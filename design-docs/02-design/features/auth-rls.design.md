# 인증 및 RLS 정책 설계서

## 1. 데이터 모델

### profiles 테이블
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| id | UUID | 사용자 ID (auth.users 참조) | PRIMARY KEY, FK |
| email | TEXT | 이메일 주소 | NOT NULL |
| name | TEXT | 사용자 이름 | NOT NULL |
| phone | TEXT | 전화번호 | NOT NULL |
| shop_url | TEXT | 쇼핑몰 URL | NOT NULL |
| shop_name | TEXT | 쇼핑몰명 | NOT NULL |
| business_number | TEXT | 사업자등록번호 | NOT NULL |
| business_cert_url | TEXT | 사업자등록증 이미지 URL | NULLABLE |
| cohort | TEXT | 수강 기수 | NULLABLE |
| monthly_ad_budget | TEXT | 월 광고비 규모 | NULLABLE |
| category | TEXT | 주요 판매 카테고리 | NULLABLE |
| reject_reason | TEXT | 거절 사유 | NULLABLE |
| role | ENUM | 역할 (pending/approved/admin/rejected) | DEFAULT 'pending' |
| created_at | TIMESTAMPTZ | 생성 시간 | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | 수정 시간 | DEFAULT NOW() |

### 역할 정의
- `pending`: 가입 후 승인 대기 상태
- `approved`: 관리자가 승인한 일반 사용자
- `admin`: 관리자 권한 사용자
- `rejected`: 관리자가 거절한 사용자

## 2. API 설계

### Server Actions

| 함수명 | 파라미터 | 설명 | 권한 |
|--------|----------|------|------|
| updateBusinessCertUrl | userId: string, url: string | 사업자등록증 URL 업데이트 | 본인만 |
| getMembers | page, pageSize, role | 회원 목록 조회 (페이징) | 관리자 |
| approveMember | userId: string | 회원 승인 | 관리자 |
| rejectMember | userId: string, reason?: string | 회원 거절 | 관리자 |

### API 응답 형식
```typescript
// 성공 응답
{ error: null, data?: any }

// 에러 응답  
{ error: string, data?: null }
```

## 3. 컴포넌트 구조

### 인증 관련 컴포넌트
```
src/app/(main)/
├── admin/
│   ├── members/
│   │   ├── page.tsx                    # 회원 관리 페이지
│   │   └── members-client.tsx          # 회원 목록 클라이언트 컴포넌트
│   └── layout.tsx                      # 관리자 레이아웃 (권한 체크)
├── settings/
│   └── page.tsx                        # 사용자 설정 페이지
└── layout.tsx                          # 메인 레이아웃 (인증 체크)
```

### 권한 체크 로직
```typescript
// 관리자 레이아웃에서 권한 체크
const { data: user } = await supabase.auth.getUser();
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user?.id)
  .single();

if (profile?.role !== 'admin') {
  redirect('/dashboard');
}
```

## 4. 에러 처리

### RLS 정책 위반
- **상황**: 권한 없는 데이터 접근 시도
- **에러 코드**: 42501 (insufficient_privilege)
- **처리**: 로그인 페이지로 리다이렉트 또는 권한 없음 메시지

### 인증 만료
- **상황**: 세션 만료 또는 유효하지 않은 토큰
- **처리**: 자동 로그아웃 및 로그인 페이지 리다이렉트

### 회원 승인 대기
- **상황**: pending 상태 사용자의 서비스 접근
- **처리**: 승인 대기 안내 페이지 표시

## 5. 구현 순서

### 1단계: 기본 인증 및 프로필 시스템
- [x] Supabase Auth 설정
- [x] profiles 테이블 생성
- [x] 회원가입 시 프로필 자동 생성
- [x] 사업자등록증 업로드 기능

### 2단계: 역할 기반 접근 제어  
- [x] 관리자 회원 승인/거절 기능
- [x] 역할별 페이지 접근 권한 체크
- [x] 관리자 전용 레이아웃 구현

### 3단계: RLS 정책 구현
- [x] 헬퍼 함수 생성 (get_user_role, is_approved_user, is_admin)
- [x] profiles 테이블 RLS 정책 적용
- [x] 모든 테이블에 일관된 RLS 정책 적용

### 4단계: 세부 권한 제어
- [x] 본인 데이터만 수정 가능한 정책
- [x] 관리자 전체 데이터 접근 정책
- [x] 승인된 사용자만 서비스 이용 정책

### 5단계: 에러 처리 및 사용자 경험
- [x] 권한 부족 시 적절한 에러 메시지
- [x] 승인 대기 상태 안내
- [x] 자동 리다이렉트 로직

## 6. RLS 정책 상세

### 핵심 헬퍼 함수
```sql
-- 현재 사용자 역할 조회
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 승인된 사용자 여부 확인  
CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('approved', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 관리자 여부 확인
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### 주요 RLS 정책 패턴

#### 조회 권한
- 본인 프로필: `auth.uid() = id`
- 승인된 사용자: `is_approved_user()`
- 관리자 전체: `is_admin()`

#### 생성 권한  
- 본인 데이터: `auth.uid() = author_id`
- 승인된 사용자: `is_approved_user() AND auth.uid() = author_id`

#### 수정/삭제 권한
- 본인 데이터: `auth.uid() = author_id`  
- 관리자 전체: `is_admin()`