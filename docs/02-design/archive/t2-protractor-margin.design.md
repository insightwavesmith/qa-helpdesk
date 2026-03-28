# T2. 총가치각도기 좌우 여백 수정 — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### 레이아웃 체인
```
src/app/(main)/layout.tsx
  → student 역할: <main className="p-6">{children}</main>  (max-w 없음)
  → admin 역할: <div className="mx-auto max-w-[1600px]"> 사용

src/app/(main)/protractor/layout.tsx
  → 접근 제어만 처리, 래퍼 없이 {children} 반환

src/app/(main)/protractor/page.tsx
  → RealDashboard 또는 SampleDashboard 분기

real-dashboard.tsx
  → <div className="flex flex-col gap-6"> (max-w 없음)

sample-dashboard.tsx
  → <div className="flex flex-col gap-6"> + 내부에 `-m-6 mb-0` offset
```

### 기준이 되는 student-home.tsx
```tsx
<div className="max-w-6xl mx-auto px-4 py-8">
  {/* 전체 콘텐츠 */}
</div>
```

## 2. 변경 설계

### 적용 위치: protractor/layout.tsx

protractor의 layout.tsx에 wrapper를 추가하여 하위 모든 페이지에 일괄 적용:

**Before**:
```tsx
export default async function ProtractorLayout({ children }: { children: React.ReactNode }) {
  // 접근 제어 로직 ...
  return <>{children}</>;
}
```

**After**:
```tsx
export default async function ProtractorLayout({ children }: { children: React.ReactNode }) {
  // 접근 제어 로직 ...
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {children}
    </div>
  );
}
```

### sample-dashboard.tsx 충돌 처리

sample-dashboard.tsx에 `-m-6 mb-0` offset이 존재하는데, 이는 부모 layout의 `p-6`를 상쇄하기 위한 것. wrapper 추가 후 이 offset이 의도치 않게 동작할 수 있으므로 확인 후 조정 필요:

- 만약 `-m-6`이 부모 padding을 상쇄하는 용도라면, 새 wrapper의 `px-4`와 충돌 → 제거 또는 값 조정 필요

## 3. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/app/(main)/protractor/layout.tsx` | max-w-6xl wrapper 추가 |
| `src/app/(main)/protractor/sample-dashboard.tsx` | `-m-6` offset 제거/조정 (필요 시) |

## 4. 검증 항목
- protractor 페이지: 좌우 여백이 student-home과 동일한지 시각 비교
- sample-dashboard 헤더 영역: offset 제거 후 레이아웃이 정상인지 확인
- 모바일(640px 이하): px-4가 적절히 적용되는지 확인
- 다른 페이지(dashboard, posts 등): 변경 없음 확인
