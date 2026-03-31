# Dashboard Design (대시보드 디자인 개선) — Plan

> **기능명**: Dashboard Design (대시보드 디자인 개선)
> **목적**: 목업 스펙과 현재 구현 간 디자인 격차 해소, 정보 밀도 및 시각적 완성도 향상
> **범위**: 디자인/스타일만 (UX 변경 ❌, 기능 추가 ❌)
> **레벨**: L2 (src/ 수정, 표준 PDCA)
> **작성일**: 2026-03-31

---

## 1. Executive Summary

에이전트 운영 대시보드의 디자인을 목업(`docs/mockups/dashboard.html`) 스펙에 맞춰 개선한다. 메트릭 카드 수치 크기, 사이드바 active 인디케이터, PDCA 단계 시각화 등 6개 항목을 우선순위별로 수정한다. 기능 변경 없이 **스타일/레이아웃만** 변경한다.

---

## 2. 문제 정의

| # | 현재 문제 | 영향 |
|---|----------|------|
| 1 | DashboardPage 정보 밀도 낮음 — 메트릭 4개 + 테이블 + 알림뿐, 목업에 있는 PDCA/팀 맥락 부재 | Smith님이 한눈에 팀 상태 파악 불가 |
| 2 | ChainsPage PDCA 단계 — 현재/완료/대기 구분 없이 동일 색상 박스만 나열 | 어느 단계에 있는지 즉시 파악 불가 |
| 3 | MetricCard 수치 크기 `text-2xl`(24px) → 목업 스펙 28px | 수치 가독성 부족 |
| 4 | Layout 사이드바 active 상태에 `border-left` 없음 | 현재 페이지 인지 어려움 (목업은 `border-left: 3px solid #F75D5D`) |
| 5 | CostsPage 차트 없이 테이블만 | 비용 추이 시각화 부재 |
| 6 | EmptyState 아이콘 `text-gray-300` — 너무 연함 | 빈 상태가 깨진 화면처럼 보임 |

---

## 3. 범위

### ✅ 포함
- CSS/Tailwind 클래스 변경
- 컴포넌트 내 레이아웃/스타일 수정
- 목업 스펙에 맞춘 색상/크기/간격 조정
- PDCA 단계 시각적 구분 (현재/완료/대기 상태 표시)

### ❌ 제외
- 새로운 기능 추가
- UX 플로우 변경 (라우팅, 인터랙션)
- 다크 모드 토글 추가
- API 호출/데이터 모델 변경
- 새 페이지 추가

---

## 4. 디자인 시스템 기준 (Smith님 확정)

| 항목 | 값 |
|------|-----|
| Primary | `#F75D5D` |
| Primary Hover | `#E54949` |
| 폰트 | Pretendard |
| 배경 | `#FFFFFF` (라이트 모드만) |
| 카드 | `bg-white`, `rounded-xl`, `border-gray-200`, `shadow-sm` |
| 참고 스타일 | Triple Whale |

### 목업에서 확인된 추가 스펙

| 항목 | 목업 값 | 현재 구현 |
|------|---------|----------|
| 메트릭 수치 크기 | 28px, font-weight 700 | `text-2xl` (24px) |
| 사이드바 active | `border-left: 3px solid var(--primary)` + `bg: #fef2f2` | `bg-primary/10 text-primary` (border 없음) |
| 사이드바 nav padding | `padding: 10px 20px` | `px-3 py-2` (다름) |
| 카드 헤더 padding | `14px 20px` | `px-5 py-3` (유사) |

---

## 5. 개선 항목 목록

### P0 — 필수 (이번 스프린트)

#### P0-1: DashboardPage 정보 밀도 개선

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 메트릭 카드 영역 | 4개 카드만 | 목업과 동일한 4개 (수치 크기 28px 적용) |
| 에이전트 테이블 | 있음 (유지) | 스타일만 목업에 맞춤 |
| 알림 패널 | 있음 (유지) | 스타일만 목업에 맞춤 |

#### P0-2: ChainsPage PDCA 단계 시각화

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 단계 박스 | 모든 단계 동일한 색상 박스 | 현재 단계: `ring-2 ring-primary`, 완료: `opacity-100 + 체크`, 대기: `opacity-50` |
| 단계 상태 표시 | 없음 | 각 단계 박스에 상태 아이콘 (✓ 완료, ● 진행중, ○ 대기) |
| 진행률 표시 | 없음 | 체인 카드 헤더에 `n/6 단계` 텍스트 |

### P1 — 중요

#### P1-1: MetricCard 수치 크기 조정

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 수치 폰트 크기 | `text-2xl` (24px) | `text-[28px]` (28px) — 목업 스펙 |
| line-height | 기본값 | `leading-none` (1) — 목업 스펙 |
| 하단 여백 | `mt-1` | `mt-1.5` (목업 간격) |

#### P1-2: Layout 사이드바 active 인디케이터

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| active 스타일 | `bg-primary/10 text-primary` | `bg-[#fef2f2] text-primary border-l-[3px] border-primary font-semibold` |
| nav 아이템 shape | `rounded-lg` | `rounded-none` (border-left 표시를 위해) |
| hover 스타일 | `hover:bg-gray-100` | 유지 |

### P2 — 개선

#### P2-1: CostsPage 비용 추이 시각화

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 상단 영역 | 메트릭 카드 3개만 | 메트릭 카드 유지 + 간단한 바 차트 (모델별 비용 비율) |
| 차트 구현 | 없음 | CSS-only 수평 바 차트 (라이브러리 추가 ❌) |

### P3 — 사소한 개선

#### P3-1: EmptyState 아이콘 가시성

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 아이콘 색상 | `text-gray-300` | `text-gray-400` |
| 아이콘 크기 | `h-10 w-10` | `h-12 w-12` (약간 확대) |

---

## 6. 변경 파일 목록

| 파일 | 변경 내용 | 우선순위 |
|------|----------|---------|
| `dashboard/src/pages/DashboardPage.tsx` | 메트릭 카드 영역 스타일 조정 | P0 |
| `dashboard/src/pages/ChainsPage.tsx` | PDCA 단계 시각화 (현재/완료/대기 구분) | P0 |
| `dashboard/src/components/MetricCard.tsx` | 수치 크기 24px → 28px, leading-none | P1 |
| `dashboard/src/components/Layout.tsx` | 사이드바 active border-left 추가 | P1 |
| `dashboard/src/pages/CostsPage.tsx` | CSS-only 바 차트 추가 | P2 |
| `dashboard/src/components/EmptyState.tsx` | 아이콘 gray-300 → gray-400, 크기 확대 | P3 |

**신규 파일**: 없음
**삭제 파일**: 없음

---

## 7. 성공 기준

| # | 기준 | 검증 방법 |
|---|------|----------|
| 1 | MetricCard 수치가 28px로 렌더링 | 브라우저 개발자 도구 computed style 확인 |
| 2 | 사이드바 active 항목에 좌측 3px primary 보더 표시 | 육안 확인 |
| 3 | ChainsPage에서 현재/완료/대기 단계가 시각적으로 구분됨 | 육안 확인 |
| 4 | CostsPage에 모델별 비용 비율 바 차트 표시 | 육안 확인 |
| 5 | EmptyState 아이콘이 gray-400으로 표시 | 육안 확인 |
| 6 | `npx tsc --noEmit --quiet` 에러 0개 | CLI 실행 |
| 7 | `npm run build` 성공 | CLI 실행 (`dashboard/` 디렉토리) |
| 8 | 기존 기능 깨지지 않음 | 모든 페이지 정상 렌더링 |

---

## 8. 하지 말 것

| ❌ 금지 사항 | 이유 |
|------------|------|
| UX 플로우 변경 | 범위 밖 — 디자인만 |
| 다크 모드 추가 | Smith님 확정 규칙: 라이트 모드만 |
| 기능 추가 (새 API 호출 등) | 디자인 개선 범위 초과 |
| 새 npm 패키지 추가 (차트 라이브러리 등) | CSS-only로 해결 |
| 영어 라벨 사용 | 한국어 UI 규칙 |
| 기존 컴포넌트 props 인터페이스 변경 | 최소 변경 원칙 |
| 파일 삭제 또는 대규모 리팩터링 | 디자인 개선에 불필요 |

---

## 9. 구현 순서

```
P0-1 (DashboardPage) + P0-2 (ChainsPage)  ← 병렬 가능
        ↓
P1-1 (MetricCard) + P1-2 (Layout sidebar)  ← 병렬 가능
        ↓
P2-1 (CostsPage 바 차트)
        ↓
P3-1 (EmptyState)
        ↓
tsc + build 검증
```

---

## 10. 리스크

| 리스크 | 대응 |
|--------|------|
| MetricCard props 변경 시 다른 페이지 영향 | props 인터페이스 변경 없이 CSS만 수정 |
| 사이드바 rounded-lg → rounded-none 전환 시 hover 스타일 깨짐 | border-left만 active에 추가, rounded는 우측만 유지 가능 (`rounded-r-lg`) |
| ChainsPage 단계 시각화에 chain 상태 데이터 필요 | 기존 `Chain` 타입의 데이터 활용, 없으면 스타일만으로 구분 |
