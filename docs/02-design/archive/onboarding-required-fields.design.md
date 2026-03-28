# 온보딩 프로필 필수값 강제 (T3) 설계서

> 작성일: 2026-03-06

## 1. 데이터 모델

변경 없음. 기존 profiles 테이블의 `shop_name`, `shop_url`, `annual_revenue`, `monthly_ad_budget` 필드 그대로 사용.
DB 레벨 NOT NULL 제약은 추가하지 않음 (기존 데이터 호환성).

## 2. API 설계

변경 없음. 기존 `saveOnboardingProfile` server action 그대로 사용.
클라이언트 사이드 필수값 체크만 추가.

## 3. 컴포넌트 구조

### 수정 파일: `src/app/(auth)/onboarding/page.tsx` — `StepProfile` 컴포넌트

#### 3-1. 새로운 상태 추가

```typescript
// submit 시도 여부 (에러 메시지 표시 제어용)
const [submitted, setSubmitted] = useState(false);
```

#### 3-2. 필수값 검증 함수

```typescript
function getFieldError(field: string, value: string): string {
  if (!value || !value.trim()) return "필수 항목입니다";
  return "";
}
```

#### 3-3. submit 버튼 disabled 조건 변경

```typescript
// 기존 (line 372):
// disabled={saving || !name.trim() || !isCategoryValid}

// 변경:
const isProfileValid =
  !!name.trim() &&
  !!shopName.trim() &&
  !!shopUrl.trim() &&
  !!annualRevenue &&
  !!monthlyAdBudget &&
  isCategoryValid;

// disabled={saving || !isProfileValid}
```

#### 3-4. handleSubmit 수정

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  setSubmitted(true);

  // 필수값 체크
  if (!name.trim() || !shopName.trim() || !shopUrl.trim() || !annualRevenue || !monthlyAdBudget || !isCategoryValid) {
    return; // 빈 필드가 있으면 에러 표시만 하고 리턴
  }

  // 기존 로직 그대로
  const finalCategory = category === "etc" ? customCategory.trim() : category;
  let finalShopUrl = shopUrl.trim();
  if (finalShopUrl && !finalShopUrl.startsWith("http")) {
    finalShopUrl = `https://${finalShopUrl}`;
  }
  onSave({ name, shopName, shopUrl: finalShopUrl, annualRevenue, monthlyAdBudget, category: finalCategory });
};
```

#### 3-5. 각 필드 라벨에 필수 표시 추가

현재 이름만 `required` 속성. 4개 필드 라벨에 `*` 표시 추가:

```tsx
<label className="block text-sm font-medium text-[#111827]">
  브랜드명 <span className="text-red-500">*</span>
</label>
```

대상 필드:
- 브랜드명 (shopName)
- 쇼핑몰 URL (shopUrl)
- 연매출 (annualRevenue)
- 월 광고예산 (monthlyAdBudget)

#### 3-6. 에러 메시지 UI

각 필드 아래에 조건부 에러 메시지 (submit 시도 후에만 표시):

**텍스트 input (shopName, shopUrl):**
```tsx
{submitted && !shopName.trim() && (
  <p className="mt-1 text-xs text-red-500">필수 항목입니다</p>
)}
```

**Select 컴포넌트 (annualRevenue, monthlyAdBudget):**
```tsx
{submitted && !annualRevenue && (
  <p className="mt-1 text-xs text-red-500">필수 항목입니다</p>
)}
```

- 스타일: `text-xs text-red-500 mt-1` (T1과 동일 패턴)
- 에러 있는 input: `border-red-300` 추가 (기존 `border-gray-200` 대신)
- 에러 있는 SelectTrigger: `border-red-300` 추가

## 4. 에러 처리

### 클라이언트 Validation 에러
| 필드 | 조건 | 메시지 |
|---|---|---|
| 브랜드명 | 빈값 | 필수 항목입니다 |
| 쇼핑몰 URL | 빈값 | 필수 항목입니다 |
| 연매출 | 미선택 | 필수 항목입니다 |
| 월 광고예산 | 미선택 | 필수 항목입니다 |
| 이름 | 빈값 | (기존 `required` 유지) |
| 카테고리 | etc + 빈값 | (기존 `isCategoryValid` 유지) |

### 서버 에러
- 기존 `error` state + 상단 에러 박스 그대로 유지

## 5. 구현 순서

- [ ] `submitted` 상태 추가
- [ ] `isProfileValid` 계산 로직 추가 (shopName, shopUrl, annualRevenue, monthlyAdBudget 체크)
- [ ] submit 버튼 disabled 조건 변경: `!isProfileValid`
- [ ] `handleSubmit` 수정: `setSubmitted(true)` + 빈값 시 early return
- [ ] 라벨에 필수 표시(`*`) 추가: 브랜드명, 쇼핑몰 URL, 연매출, 월 광고예산
- [ ] 각 필드 아래 에러 메시지 JSX 추가 (`submitted && !value` 조건)
- [ ] 에러 상태 border 스타일 추가 (`border-red-300`)
- [ ] `npm run build` 확인

### 주의사항
- 기존 `name`, `isCategoryValid` 검증 로직은 그대로 유지 (추가만)
- 온보딩 Step 0, 2, 3 무변경
- 새 UI 컴포넌트 추가 금지 — `<p>` 태그 에러 텍스트만 추가
- `saveOnboardingProfile` server action은 수정하지 않음 (DB 레벨 NOT NULL 미추가)
