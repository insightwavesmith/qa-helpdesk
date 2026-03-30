# Dashboard Design (대시보드 디자인 개선) — Design

> **기능명**: Dashboard Design (대시보드 디자인 개선)
> **Plan 문서**: `docs/01-plan/features/dashboard-design.plan.md`
> **레벨**: L2 (표준 PDCA)
> **작성일**: 2026-03-31

---

## 1. 변경 파일 요약

| # | 파일 | 변경 요약 | 우선순위 |
|---|------|----------|---------|
| 1 | `dashboard/src/components/MetricCard.tsx` | 수치 크기 24px→28px | P1 |
| 2 | `dashboard/src/components/Layout.tsx` | 사이드바 active border-left 추가 | P1 |
| 3 | `dashboard/src/pages/ChainsPage.tsx` | PDCA 단계 상태 시각화 | P0 |
| 4 | `dashboard/src/pages/DashboardPage.tsx` | 메트릭 영역 스타일 조정 | P0 |
| 5 | `dashboard/src/pages/CostsPage.tsx` | CSS-only 바 차트 추가 | P2 |
| 6 | `dashboard/src/components/EmptyState.tsx` | 아이콘 색상/크기 조정 | P3 |

---

## 2. MetricCard.tsx — 수치 크기 조정 (P1)

### 현재 코드 (24번 줄)

```tsx
<p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
```

### 변경 후

```tsx
<p className="text-[28px] font-bold leading-none text-gray-900 tabular-nums">{value}</p>
```

### 변경 사항
| 속성 | 현재 | 변경 후 |
|------|------|---------|
| font-size | `text-2xl` (24px) | `text-[28px]` (28px) |
| line-height | 기본 (32px) | `leading-none` (1) |

### 추가 변경 — label 간격 (25번 줄)

```tsx
// 현재
<p className="text-xs font-medium text-gray-500 mt-1">{label}</p>

// 변경 후
<p className="text-xs font-medium text-gray-500 mt-1.5">{label}</p>
```

> `mt-1` → `mt-1.5`: 수치 크기 증가에 맞춰 여백 조정 (목업 스펙)

---

## 3. Layout.tsx — 사이드바 active 인디케이터 (P1)

### 현재 코드 (57~68번 줄)

```tsx
<NavLink
  key={item.to}
  to={item.to}
  end={item.to === '/'}
  className={({ isActive }) =>
    cn(
      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    )
  }
>
```

### 변경 후

```tsx
<NavLink
  key={item.to}
  to={item.to}
  end={item.to === '/'}
  className={({ isActive }) =>
    cn(
      'flex items-center gap-2.5 py-2.5 text-[13px] font-medium transition-colors',
      isActive
        ? 'bg-[#fef2f2] text-primary border-l-[3px] border-primary font-semibold px-[17px]'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-[3px] border-transparent px-[17px]',
    )
  }
>
```

### 변경 사항

| 속성 | 현재 | 변경 후 |
|------|------|---------|
| 공통 shape | `rounded-lg` | 제거 (border-left 표시를 위해 직사각형) |
| 공통 padding | `px-3 py-2` | `py-2.5` + `px-[17px]` (border 3px 보상) |
| active 배경 | `bg-primary/10` | `bg-[#fef2f2]` (목업 스펙) |
| active border | 없음 | `border-l-[3px] border-primary` |
| active font | `font-medium` | `font-semibold` |
| inactive border | 없음 | `border-l-[3px] border-transparent` (레이아웃 시프트 방지) |

> **핵심**: inactive에도 `border-l-[3px] border-transparent`를 넣어야 active/inactive 전환 시 콘텐츠가 밀리지 않는다. `px-[17px]` = 원래 `px-5`(20px) - border 3px = 17px로 목업의 `padding: 10px 20px` 전체 폭과 일치시킨다.

---

## 4. ChainsPage.tsx — PDCA 단계 시각화 (P0)

### 4-1. Chain 타입에 currentPhase 없음 — 대응 방안

현재 `Chain` 인터페이스에는 `currentPhase` 필드가 없다. API 변경 없이 **PDCA 단계 흐름 시각화만 개선**한다.

- 기존 6단계 박스(plan→design→do→check→act→deploy)의 스타일을 개선
- 각 단계 박스에 한국어 라벨 + 영문 코드 표시 유지
- 화살표(`→`) 커넥터 스타일 개선

### 4-2. PHASE_COLORS 상수 변경 (8~15번 줄)

```tsx
// 현재
const PHASE_COLORS: Record<string, string> = {
  plan: 'bg-blue-100 text-blue-700 border-blue-200',
  design: 'bg-purple-100 text-purple-700 border-purple-200',
  do: 'bg-primary/10 text-primary border-primary/20',
  check: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  act: 'bg-amber-100 text-amber-700 border-amber-200',
  deploy: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

// 변경 후 — 더 선명한 색상 + 그림자
const PHASE_COLORS: Record<string, string> = {
  plan: 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm',
  design: 'bg-purple-50 text-purple-700 border-purple-300 shadow-sm',
  do: 'bg-primary/5 text-primary border-primary/30 shadow-sm',
  check: 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm',
  act: 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm',
  deploy: 'bg-cyan-50 text-cyan-700 border-cyan-300 shadow-sm',
};
```

### 4-3. 단계 아이콘 매핑 상수 추가 (16번 줄 아래)

```tsx
const PHASE_ICONS: Record<string, string> = {
  plan: '📋',
  design: '🎨',
  do: '⚡',
  check: '✅',
  act: '🔄',
  deploy: '🚀',
};
```

### 4-4. ChainStepsView 컴포넌트 변경 (108~142번 줄)

```tsx
function ChainStepsView({ chainId }: { chainId: string }) {
  const phases = ['plan', 'design', 'do', 'check', 'act', 'deploy'];

  return (
    <div className="border-t border-gray-100 px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-700">단계 흐름</span>
        <span className="text-xs text-gray-400">{phases.length}단계</span>
      </div>

      {/* PDCA 흐름 시각화 — 개선 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {phases.map((phase, i, arr) => (
          <div key={phase} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg border min-w-[100px]',
                PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-700 border-gray-200',
              )}
            >
              <span className="text-base">{PHASE_ICONS[phase]}</span>
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">{phase.toUpperCase()}</span>
                <span className="text-[10px] leading-tight opacity-70">{PHASE_LABELS[phase] ?? phase}</span>
              </div>
            </div>
            {i < arr.length - 1 && (
              <div className="flex items-center mx-1">
                <div className="w-4 h-px bg-gray-300" />
                <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-gray-300" />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        체인 ID: <span className="font-mono">{chainId}</span>
      </p>
    </div>
  );
}
```

### 변경 사항

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 단계 박스 레이아웃 | 세로 정렬 (flex-col) | 가로 정렬 (아이콘 + 텍스트 나란히) |
| 아이콘 | 없음 | 이모지 아이콘 (`PHASE_ICONS`) |
| 박스 크기 | `min-w-[80px]` | `min-w-[100px]` |
| 박스 패딩 | `px-4 py-3` | `px-4 py-2.5` |
| 색상 채도 | `bg-*-100` | `bg-*-50 + shadow-sm` (더 부드러운 톤) |
| 화살표 커넥터 | `→` 텍스트 (gray-300) | CSS 삼각형 + 라인 (깔끔한 시각적 연결) |
| 단계 수 표시 | 없음 | 헤더에 `{n}단계` 텍스트 |

---

## 5. DashboardPage.tsx — 스타일 조정 (P0)

### 5-1. 페이지 타이틀 (26번 줄)

```tsx
// 현재
<h2 className="text-xl font-bold text-gray-900">대시보드</h2>

// 변경 후 — 목업과 동일한 크기
<h2 className="text-xl font-bold text-gray-900">대시보드</h2>
```

> 타이틀은 현재 상태 유지. 목업과 동일.

### 5-2. 메트릭 카드 그리드 간격 (29번 줄)

```tsx
// 현재
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

// 변경 후 — 목업 간격(16px = gap-4) 동일, 유지
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

> MetricCard 자체의 수치 크기 변경은 MetricCard.tsx에서 처리. DashboardPage에서는 추가 변경 없음.

### 5-3. 에이전트 테이블 헤더 스타일 (70~72번 줄)

```tsx
// 현재
<div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
  <div className="px-5 py-3 border-b border-gray-100">
    <h3 className="font-semibold text-gray-900">에이전트 현황</h3>
  </div>

// 변경 후 — 헤더 패딩 목업 일치 (14px 20px)
<div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
    <h3 className="text-sm font-semibold text-gray-900">에이전트 현황</h3>
    <span className="text-xs text-gray-400">{agents?.length ?? 0}명</span>
  </div>
```

### 변경 사항

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 헤더 패딩 | `py-3` | `py-3.5` (14px 근사) |
| 헤더 레이아웃 | 텍스트만 | `flex justify-between` + 에이전트 수 표시 |
| 제목 크기 | 기본 | `text-sm` (목업 14px) |

### 5-4. 알림 패널 헤더 동일 적용 (122~124번 줄)

```tsx
// 현재
<div className="rounded-xl border border-gray-200 bg-white shadow-sm">
  <div className="px-5 py-3 border-b border-gray-100">
    <h3 className="font-semibold text-gray-900">최근 알림</h3>
  </div>

// 변경 후
<div className="rounded-xl border border-gray-200 bg-white shadow-sm">
  <div className="px-5 py-3.5 border-b border-gray-100">
    <h3 className="text-sm font-semibold text-gray-900">최근 알림</h3>
  </div>
```

> 에이전트 테이블과 동일한 헤더 스타일 통일.

---

## 6. CostsPage.tsx — CSS-only 바 차트 (P2)

### 삽입 위치: 메트릭 카드 아래, 탭 위 (243번 줄 아래)

### 추가할 컴포넌트

```tsx
function CostBarChart() {
  const { data: models } = useCostsByModel();

  if (!models || models.length === 0) return null;

  const maxCost = Math.max(...models.map((m) => m.totalCents));

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">모델별 비용 비율</h3>
      <div className="space-y-3">
        {models.map((m) => {
          const pct = maxCost > 0 ? (m.totalCents / maxCost) * 100 : 0;
          return (
            <div key={m.model} className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-500 w-32 shrink-0 truncate">
                {m.model}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-primary rounded-full h-2.5 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 tabular-nums w-16 text-right shrink-0">
                {formatCents(m.totalCents)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### CostsPage JSX에 삽입 (메트릭 카드 그리드 닫힌 직후)

```tsx
// 현재 (243번 줄 근처)
      </div>

      {/* 탭 */}
      <div className="rounded-xl border ...">

// 변경 후
      </div>

      {/* 모델별 비용 바 차트 */}
      <CostBarChart />

      {/* 탭 */}
      <div className="rounded-xl border ...">
```

### 바 차트 스펙

| 항목 | 값 |
|------|-----|
| 바 높이 | `h-2.5` (10px) |
| 바 색상 | `bg-primary` (#F75D5D) |
| 배경 | `bg-gray-100` |
| 모서리 | `rounded-full` |
| 라벨 폰트 | `text-xs font-mono` |
| 값 폰트 | `text-xs font-medium tabular-nums` |
| 라이브러리 | 없음 (CSS-only) |

---

## 7. EmptyState.tsx — 아이콘 가시성 (P3)

### 현재 코드 (13번 줄)

```tsx
<Icon className="h-10 w-10 text-gray-300 mb-4" />
```

### 변경 후

```tsx
<Icon className="h-12 w-12 text-gray-400 mb-4" />
```

### 변경 사항

| 속성 | 현재 | 변경 후 |
|------|------|---------|
| 크기 | `h-10 w-10` (40px) | `h-12 w-12` (48px) |
| 색상 | `text-gray-300` | `text-gray-400` |

---

## 8. 전체 변경 요약 매트릭스

| 파일 | 변경 줄(약) | 신규 코드 줄(약) | 위험도 |
|------|-----------|----------------|--------|
| MetricCard.tsx | 2줄 | 0 | 낮음 |
| Layout.tsx | 4줄 | 0 | 낮음 |
| ChainsPage.tsx | 35줄 | 10줄 | 중간 (컴포넌트 구조 변경) |
| DashboardPage.tsx | 4줄 | 1줄 | 낮음 |
| CostsPage.tsx | 0줄 | 30줄 | 낮음 (새 컴포넌트 추가만) |
| EmptyState.tsx | 1줄 | 0 | 낮음 |

---

## 9. 구현 순서 및 검증

```
1단계: MetricCard.tsx + EmptyState.tsx (단순 CSS 변경, 병렬)
  ↓
2단계: Layout.tsx (사이드바, 독립)
  ↓
3단계: DashboardPage.tsx (헤더 스타일)
  ↓
4단계: ChainsPage.tsx (PDCA 시각화 — 가장 큰 변경)
  ↓
5단계: CostsPage.tsx (바 차트 추가)
  ↓
검증: npx tsc --noEmit --quiet && npm run build
```

---

## 10. 하지 말 것

- API 호출 추가/변경 금지
- Chain 인터페이스에 필드 추가 금지 (API 변경 범위 밖)
- 다크 모드 관련 스타일 추가 금지
- 영어 라벨 사용 금지
- npm 패키지 추가 금지
- MetricCard props 인터페이스 변경 금지
