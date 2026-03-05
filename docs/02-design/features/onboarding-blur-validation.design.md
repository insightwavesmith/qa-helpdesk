# 온보딩 blur 에러 표시 설계서

> 작성일: 2026-03-06

## 1. 데이터 모델
변경 없음.

## 2. API 설계
변경 없음.

## 3. 컴포넌트 구조

### 수정 파일: `src/app/(auth)/onboarding/page.tsx` — StepProfile

#### 3-1. touched 상태 추가
```typescript
const [touched, setTouched] = useState<Record<string, boolean>>({});
const markTouched = (field: string) =>
  setTouched((prev) => ({ ...prev, [field]: true }));
```

#### 3-2. 에러 표시 조건 변경
기존: `submitted && !value`
변경: `(submitted || touched.fieldName) && !value`

대상 4개 필드:
- shopName: `onBlur={() => markTouched('shopName')}`
- shopUrl: `onBlur={() => markTouched('shopUrl')}`
- annualRevenue: `onOpenChange={(open) => { if (!open) markTouched('annualRevenue'); }}`
- monthlyAdBudget: `onOpenChange={(open) => { if (!open) markTouched('monthlyAdBudget'); }}`

Select는 onBlur 대신 onOpenChange 사용 (드롭다운 닫힐 때 touched 처리, 열릴 때 에러 flash 방지).

#### 3-3. 에러 조건 변경 위치 (8곳)
각 필드당 2곳씩 (border 조건 + 에러 텍스트):
1. shopName border: `(submitted || touched.shopName) && !shopName.trim()`
2. shopName error text: 동일
3. shopUrl border: `(submitted || touched.shopUrl) && !shopUrl.trim()`
4. shopUrl error text: 동일
5. annualRevenue border: `(submitted || touched.annualRevenue) && !annualRevenue`
6. annualRevenue error text: 동일
7. monthlyAdBudget border: `(submitted || touched.monthlyAdBudget) && !monthlyAdBudget`
8. monthlyAdBudget error text: 동일

## 4. 에러 처리
기존 T3 설계서와 동일. 메시지: "필수 항목입니다"

## 5. 구현 순서
- [ ] `touched` 상태 + `markTouched` 헬퍼 추가
- [ ] shopName, shopUrl input에 `onBlur` 추가
- [ ] annualRevenue, monthlyAdBudget Select에 `onOpenChange` 추가
- [ ] 에러 조건 8곳 `submitted` → `(submitted || touched.xxx)` 변경
- [ ] npm run build 확인
