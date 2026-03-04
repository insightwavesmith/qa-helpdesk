# T6. 게이지 목업 디자인 일치 — Design

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5
> 목업 참조: docs/mockups/protractor-v5.html

## 1. 데이터 모델

변경 없음 — 기존 `T3Data` 타입 및 props 인터페이스 유지.

```typescript
// 유지
interface TotalValueGaugeProps {
  data: T3Data | null;
  isLoading?: boolean;
  showMetricCards?: boolean;
}
```

## 2. 컴포넌트 구조

### 2-1. SemiCircleGauge 재설계

**목업 SVG 분석** (protractor-v5.html 기준):
- viewBox: `"0 0 200 120"`
- 반지름: r=80 (center: cx=100, cy=100)
- stroke-width: 16
- 배경 호: `M 20 100 A 80 80 0 0 1 180 100` (stroke: #e2e8f0)
- 빨강 구간 (D): `M 20 100 → M 60 35` (0~33%)
- 노랑 구간 (C/B): `M 60 35 → M 140 35` (33~67%)
- 초록 구간 (A): `M 140 35 → M 180 100` (67~100%)
- 포인터: 점수에 따라 호 위 원형 도트, `r=6`, `fill="#1e293b"`

**포인터 좌표 계산**:
```
점수 0   → 각도 180도 → (20, 100) (맨 왼쪽)
점수 50  → 각도 90도  → (100, 20) (맨 위)
점수 100 → 각도 0도   → (180, 100) (맨 오른쪽)

angle = Math.PI - (score / 100) * Math.PI  // 라디안
cx = 100 + 80 * Math.cos(angle)
cy = 100 - 80 * Math.sin(angle)
```

**새 SVG 코드 설계**:
```tsx
function SemiCircleGauge({ score }: { score: number }) {
  const cx = 100, cy = 100, r = 80;
  const angle = Math.PI - (score / 100) * Math.PI;
  const dotX = cx + r * Math.cos(angle);
  const dotY = cy - r * Math.sin(angle);

  return (
    <svg viewBox="0 0 200 120" className="w-[180px] h-[110px]">
      {/* 배경 회색 호 */}
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round"
      />
      {/* 빨강 구간 (D등급: 0~33%) */}
      <path
        d="M 20 100 A 80 80 0 0 1 60 35"
        fill="none" stroke="#ef4444" strokeWidth={16} strokeLinecap="round"
      />
      {/* 노랑 구간 (C/B등급: 33~67%) */}
      <path
        d="M 60 35 A 80 80 0 0 1 140 35"
        fill="none" stroke="#eab308" strokeWidth={16} strokeLinecap="round"
      />
      {/* 초록 구간 (A등급: 67~100%) */}
      <path
        d="M 140 35 A 80 80 0 0 1 180 100"
        fill="none" stroke="#22c55e" strokeWidth={16} strokeLinecap="round"
      />
      {/* 포인터: 호 위 도트 */}
      <circle cx={dotX} cy={dotY} r={6} fill="#1e293b" />
    </svg>
  );
}
```

**제거 항목**:
- `arcPath()` 헬퍼 함수
- `segments` 배열 (파스텔 색상)
- 파란 진행 아크 (score > 0 조건부 렌더링)
- `<line>` 바늘 + pivot `<circle>`
- 0/50/100 `<text>` 마커
- SVG 내부의 점수/등급 `<text>` 요소 (게이지 아래로 이동)

### 2-2. 서브점수 카드 설계 (PartScoreBar → GradeCard)

**목업 기준 카드 구조**:
```
[색상 도트] 기반점수          72    A배지
           노출·도달·빈도 기반
```

**새 컴포넌트 설계**:
```tsx
interface GradeCardProps {
  label: string;
  subLabel: string;  // 예: "노출·도달·빈도 기반"
  score: number;
  dotColor: string;  // "#22c55e" | "#eab308" | "#ef4444"
}

function GradeCard({ label, subLabel, score, dotColor }: GradeCardProps) {
  const grade = score >= 75 ? "A" : score >= 50 ? "B" : "C";
  const gradeStyle = {
    A: "bg-green-100 text-green-700",
    B: "bg-yellow-100 text-yellow-700",
    C: "bg-red-100 text-red-700",
  }[grade];

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subLabel}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-gray-900">{score}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeStyle}`}>{grade}</span>
      </div>
    </div>
  );
}
```

**서브레이블 매핑** (diagnostics.label → subLabel):
| label | dotColor | subLabel |
|-------|---------|---------|
| 기반점수 | #22c55e (점수 기반 동적) | "노출·도달·빈도 기반" |
| 참여율 | #eab308 (점수 기반 동적) | "3초시청·좋아요·공유 등" |
| 전환율 | #ef4444 (점수 기반 동적) | "CTR·구매·ROAS" |

**dotColor 동적 결정**: `score >= 75 → #22c55e`, `score >= 50 → #eab308`, `< 50 → #ef4444`

### 2-3. 전체 레이아웃 변경

**현재 구조**:
```
[좌] 게이지 SVG (minWidth: 220px)
     + 점수/등급 텍스트
     + PartScoreBar 3개 (수직)
[우] 지표 카드 3×3 그리드 (showMetricCards=true 시)
```

**변경 후 구조** (showMetricCards=false 기준 — real-dashboard):
```
[좌] gauge-wrap 카드
     게이지 SVG (180x110)
     총 광고비 텍스트 (기존 유지)
[우] grade-cards 섹션
     GradeCard × 3 (기반점수/참여율/전환율)

     게이지 아래:
     score 숫자 (48px 굵게)
     N등급 배지
     "N일 기준 · 전체 광고 합산" (12px 회색)
```

**JSX 구조 설계**:
```tsx
<div className="flex gap-6 items-start">
  {/* 좌: 게이지 카드 */}
  <div className="flex-none w-[220px] text-center bg-white rounded-2xl border border-gray-200 p-6">
    <SemiCircleGauge score={displayScore} />
    <div className="text-5xl font-black mt-[-10px]">{displayScore}</div>
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-1 ${gradeStyle.bg} ${gradeStyle.text}`}>
      {displayGrade.grade}등급
    </span>
    <p className="text-xs text-gray-400 mt-2">{periodLabel}</p>
  </div>

  {/* 우: 서브점수 카드 3개 */}
  {diagnostics && (
    <div className="flex-1 flex flex-col gap-3">
      {Object.values(diagnostics).map((part) => {
        const dotColor = part.score >= 75 ? "#22c55e" : part.score >= 50 ? "#eab308" : "#ef4444";
        return (
          <GradeCard
            key={part.label}
            label={part.label}
            subLabel={PART_SUB_LABELS[part.label] ?? ""}
            score={part.score}
            dotColor={dotColor}
          />
        );
      })}
    </div>
  )}
</div>
```

## 3. 색상 상수 업데이트

```typescript
// 기존 GRADE_STYLES (외부 카드용) - 변경 없음
// 게이지 segment 색상만 변경 (컴포넌트 내부 하드코딩 → 상수 분리)

const GAUGE_SEGMENT_COLORS = {
  danger: "#ef4444",   // D등급 구간 (0~33%)
  warning: "#eab308",  // C/B등급 구간 (33~67%)
  success: "#22c55e",  // A등급 구간 (67~100%)
  bg: "#e2e8f0",       // 배경 회색 호
};

const PART_SUB_LABELS: Record<string, string> = {
  "기반점수": "노출·도달·빈도 기반",
  "참여율": "3초시청·좋아요·공유 등",
  "전환율": "CTR·구매·ROAS",
};
```

## 4. 영향 범위

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `src/components/protractor/TotalValueGauge.tsx` | 수정 | SemiCircleGauge 재작성, PartScoreBar → GradeCard 교체, 레이아웃 변경 |
| `src/app/(main)/protractor/real-dashboard.tsx` | 유지 | props 변경 없음 |
| `src/app/(main)/protractor/sample-dashboard.tsx` | 유지 | props 변경 없음 |

## 5. 에러 처리

- `diagnostics`가 null일 때: 서브점수 카드 섹션 전체 숨김 (기존과 동일 behavior)
- `score=0`일 때: 도트가 맨 왼쪽 (20, 100) 위치 → 정상 렌더
- `score=null` fallback: `displayScore=0` → 도트 맨 왼쪽

## 6. 구현 체크리스트

- [ ] `SemiCircleGauge` 함수 재작성
  - [ ] 배경 회색 호 추가 (#e2e8f0)
  - [ ] 선명한 등급 구간 색상 적용
  - [ ] 포인터: line → circle dot 교체
  - [ ] 파란 진행 아크 제거
  - [ ] 0/50/100 마커 제거
  - [ ] SVG 내부 텍스트 제거
- [ ] `PartScoreBar` → `GradeCard` 교체
  - [ ] 점수 숫자 표시
  - [ ] 등급 배지 표시
  - [ ] dotColor 동적 계산
  - [ ] subLabel 매핑
- [ ] 게이지 카드 레이아웃: 카드형 + score/등급/레이블
- [ ] flex 레이아웃: 좌(게이지) + 우(카드 3개)
- [ ] `PART_SUB_LABELS` 상수 추가
- [ ] 빌드 성공
