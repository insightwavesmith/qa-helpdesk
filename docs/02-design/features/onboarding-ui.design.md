# Onboarding 4-Step UI Design

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. Data Model
- profiles.onboarding_step: number (0~3)
- profiles.onboarding_status: 'not_started' | 'in_progress' | 'completed'
- profiles.name, cohort, shop_url, shop_name, monthly_ad_budget, annual_revenue, category, meta_account_id

## 2. API (Server Actions) - src/actions/onboarding.ts
| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| getOnboardingProfile | - | { data, error } | Load profile for prefill |
| updateOnboardingStep | step: number | { error } | Update step + status |
| saveOnboardingProfile | { name, shopName, shopUrl, annualRevenue, monthlyAdBudget, category } | { error } | Step 1 save |
| saveAdAccount | { metaAccountId, mixpanelProjectId, mixpanelSecretKey, mixpanelBoardId } | { error } | Step 2 save |
| completeOnboarding | - | { error } | Step 3 mark complete |

> saveOnboardingProfile: shopName, annualRevenue 추가됨 (설계 초기에 없었음)
> saveAdAccount: mixpanel 3개 필드 추가됨 (mixpanelProjectId, mixpanelSecretKey, mixpanelBoardId)

## 3. Component Structure
Single page: `src/app/(auth)/onboarding/page.tsx` ("use client")

### State Management
- `step`: current step (0-3), init from profile.onboarding_step
- `profile`: fetched from getOnboardingProfile()
- `loading`: initial load state
- `saving`: action in-progress state

### Step 0 (Welcome)
- Display: name + cohort greeting
- 3 service intro cards (Q&A, Information, Protractor)
- CTA: "Start" button -> step 1

### Step 1 (Profile)
- Fields: name (editable), shopName, shopUrl, annualRevenue (select), monthlyAdBudget (select), category (select, "etc" → custom text input)
- annualRevenue options: under_1억, 1억_5억, 5억_10억, 10억_50억, over_50억
- Prefill from existing profile data
- CTA: "Save and Continue" -> saveOnboardingProfile() -> step 2

### Step 2 (Ad Account)
- Meta ad account ID input (optional)
- Mixpanel 연동 (optional): projectId, secretKey, boardId
- CTA: "Connect" button + "Skip" link
- -> saveAdAccount() -> step 3

### Step 3 (Complete)
- Completion message
- Auto-call completeOnboarding() on mount
- 2 buttons: "/questions", "/posts"

### Step Indicator
- 4 circles with connecting lines
- Current: #F75D5D, completed: checkmark, future: gray

## 4. Error Handling
- Auth failure: display error message
- Server action failure: toast/inline error

## 5. Implementation Checklist
- [x] Create src/actions/onboarding.ts with 5 server actions
- [x] Create src/app/(auth)/onboarding/page.tsx with 4-step wizard
- [x] Step indicator component (inline)
- [x] Mobile responsive (375px+)
- [x] Brand colors (#F75D5D / #E54949)
- [x] Korean-only UI
- [x] npm run build passes
