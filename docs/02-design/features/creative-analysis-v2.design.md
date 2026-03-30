# 소재 분석 v2 — 총가치각도기 AI 처방 통합 설계서

> 작성일: 2026-03-31
> 상태: Design 완료
> Plan: `docs/01-plan/features/creative-analysis-v2.plan.md`
> 선행 설계: `docs/02-design/features/prescription-system-v2.design.md` (처방 엔진)
> 참조: mozzi-reports `2026-03-23-customer-journey-v5` (UX 원본)
> 레벨: L2 (src/ 수정, Plan+Design 필수)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | creative-analysis-v2 (소재분석 AI 처방 통합) |
| **작성일** | 2026-03-31 |
| **예상 변경** | 신규 9파일 + 기존 2파일 수정 (~1,200줄) |

### Value Delivered

| 관점 | AS-IS | TO-BE |
|------|-------|-------|
| **Problem** | 소재 분석 탭에 5축 레이더+ROAS만, 처방 없음 | 3대축+5축+고객여정+시선+처방 풀분석 |
| **Solution** | 개별소재 클릭 → 레이더차트 1개 | 개별소재 클릭 → 모찌리포트 수준 풀 패널 |
| **Function UX Effect** | "그래서 뭘 하라고?" 이탈 | 진단 옆에 즉시 처방+근거+시선 표시 |
| **Core Value** | 성적표 수준 진단 | **실행 가능한 코칭** = 진단+처방+시선근거+고객여정 |

---

## 1. 현황 분석

### 1.1 현재 소재분석 탭 구조

`creative-analysis.tsx` (1,270줄 모놀리식 파일)

```
CreativeAnalysis
├── 계정 선택 (Select)
├── Tabs
│   ├── individual (IndividualTab)
│   │   ├── 벡터 검색 바
│   │   ├── 소재 그리드 (CreativeCard)
│   │   └── 상세 패널 (sticky right)
│   │       ├── 미디어 + ROAS/CTR
│   │       ├── 5축 RadarChart (recharts)
│   │       ├── L1 태그 칩
│   │       ├── 훅 벤치마크 ROAS 차트
│   │       ├── LP 일관성 바
│   │       └── 제안사항 리스트
│   ├── portfolio (PortfolioTab)
│   │   ├── 요약 카드 4개
│   │   ├── 점수 분포 히스토그램
│   │   └── 훅/스타일별 ROAS 차트
│   └── competitor (CompetitorTab)
```

### 1.2 재활용 가능 자산

| 자산 | 파일 | 용도 |
|------|------|------|
| 처방 엔진 | `src/lib/protractor/prescription-engine.ts` (581줄) | Top 3 처방 생성 |
| 처방 프롬프트 | `src/lib/protractor/prescription-prompt.ts` (387줄) | Gemini 프롬프트 |
| 타입 정의 | `src/types/prescription.ts` (459줄) | AnalysisJsonV3, PrescriptionResponse |
| 시선 데이터 | `creative_saliency` 테이블 | 히트맵 URL + top_fixations |
| 벤치마크 | `prescription_benchmarks` 테이블 | 축별 벤치마크 비교 |
| 성과 데이터 | `creative_performance` 테이블 | 3대축 지표 |

### 1.3 데이터 현황

| 데이터 | 건수 | 비고 |
|--------|------|------|
| VIDEO 소재 | 352건 | creative_media |
| IMAGE 소재 | 3,286건 | creative_media |
| DeepGaze 시선 (이미지) | 2,863건 | creative_saliency target_type='creative' |
| DeepGaze 시선 (비디오) | 137건 | creative_saliency target_type='video' |
| 비디오 프레임별 시선 | 2,830건 | creative_saliency target_type='video_frame' |

---

## 2. 컴포넌트 설계

### 2.1 파일 구조

```
src/app/(main)/protractor/creatives/
├── creative-analysis.tsx                # 기존 (탭 라우팅, 최소 수정)
├── components/
│   ├── individual/
│   │   ├── creative-detail-panel.tsx    # 신규: 풀분석 패널 메인 컨테이너
│   │   ├── three-axis-score.tsx         # 신규: 3대축 점수 카드 (기반/참여/전환)
│   │   ├── five-axis-card.tsx           # 신규: 5축 분석 태그 카드
│   │   ├── customer-journey.tsx         # 신규: 고객 여정 타임라인
│   │   ├── gaze-analysis.tsx            # 신규: 시선 분석 (히트맵 오버레이)
│   │   ├── prescription-cards.tsx       # 신규: 처방 Top 3 카드
│   │   └── top-compare.tsx             # 신규: Top 소재 비교
│   └── portfolio/
│       ├── axis-distribution.tsx        # 신규: 축별 분포 차트
│       └── diversity-alert.tsx          # 신규: Andromeda 다양성 경고
```

### 2.2 데이터 흐름

```
[사용자: 소재 클릭]
       │
       ▼
creative-analysis.tsx (기존)
  → selectedCreative 상태 변경
       │
       ▼
creative-detail-panel.tsx (신규)
  ├── SWR: GET /api/protractor/creative-detail?id={creative_media_id}
  │   └── 서버: creative_media + creative_saliency + creative_performance JOIN
  │
  ├── SWR: GET /api/protractor/prescription?id={creative_media_id}  (lazy)
  │   └── 서버: prescription-engine.ts 호출 (캐시 우선)
  │
  └── 렌더링:
      ├── ThreeAxisScore ← performance 데이터 + benchmarks
      ├── FiveAxisCard ← analysis_json.5축
      ├── CustomerJourney ← analysis_json.structure + video_analysis
      ├── GazeAnalysis ← creative_saliency (attention_map_url, top_fixations)
      ├── PrescriptionCards ← prescription response.top3_prescriptions
      └── TopCompare ← 같은 계정 Top 소재 성과 비교
```

### 2.3 API 엔드포인트

#### GET `/api/protractor/creative-detail`

기존 `/api/admin/creative-intelligence`에서 개별 소재 상세를 분리.

```typescript
// Query params
interface CreativeDetailQuery {
  id: string;  // creative_media.id (UUID)
}

// Response
interface CreativeDetailResponse {
  creative: {
    id: string;
    ad_id: string;
    media_type: "IMAGE" | "VIDEO";
    media_url: string;
    storage_url: string | null;
    thumbnail_url: string | null;
    ad_copy: string | null;
    duration_seconds: number | null;
    analysis_json: AnalysisJsonV3 | null;
  };
  performance: {
    impressions: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    roas: number;
    video_p3s_rate: number | null;   // 3초 시청률
    video_thruplay_rate: number | null;
    purchase_count: number;
    reach_to_purchase_rate: number;  // 최종 목적함수
  } | null;
  saliency: {
    attention_map_url: string;
    top_fixations: Array<{ x: number; y: number; ratio: number }>;
    cta_attention_score: number;
    cognitive_load: number;
  } | null;
  saliency_frames: Array<{
    frame_index: number;
    timestamp_sec: number;
    attention_map_url: string;
    top_fixations: Array<{ x: number; y: number; ratio: number }>;
  }> | null;  // VIDEO만
  benchmarks: {
    category: string;
    metrics: Record<string, { p25: number; p50: number; p75: number }>;
  } | null;
  top_creative: {
    id: string;
    media_url: string;
    ad_copy: string | null;
    roas: number;
    ctr: number;
    reach_to_purchase_rate: number;
  } | null;  // 같은 계정 최고 성과 소재
}
```

#### GET `/api/protractor/prescription`

기존 `prescription-engine.ts` 래핑. 캐시 우선 (analysis_json에 prescription 결과 저장됨).

```typescript
// Query params
interface PrescriptionQuery {
  id: string;         // creative_media.id
  force?: "true";     // 강제 재생성
}

// Response: PrescriptionResponse (src/types/prescription.ts 그대로)
```

---

## 3. UI 컴포넌트 상세 설계

### 3.1 creative-detail-panel.tsx — 풀분석 패널 컨테이너

기존 상세 패널(레이더차트+제안)을 대체. 세로 스크롤 레이아웃.

```
┌─────────────────────────────────────────────┐
│ [미디어 프리뷰]  160px height, rounded       │
│ 제목: ad_copy (2줄 truncate)                 │
│ 메타: duration · media_type · ad_id          │
├─────────────────────────────────────────────┤
│ 3대축 점수 (3-column grid)                   │
│ ┌──────┐ ┌──────┐ ┌──────┐                  │
│ │🟢 기반│ │🟡 참여│ │🔴 전환│                  │
│ │  67   │ │  38  │ │  15  │                  │
│ │3초32% │ │CTR5% │ │ROAS  │                  │
│ └──────┘ └──────┘ └──────┘                  │
│ ▼ 세부항목 보기 (접기)                        │
├─────────────────────────────────────────────┤
│ 5축 분석                                     │
│ 🎬 UGC · 셀프촬영                            │
│ [훅: 문제제기] [메시징: 권위+혜택]            │
│ [타겟: 직장인여성] [beauty · skincare]        │
├─────────────────────────────────────────────┤
│ 고객 여정 타임라인 (VIDEO만)                  │
│ 0-2초  ① 훅    👁봤다 👂들었다 🧠느꼈다      │
│ 2-4초  ② 전환  👁봤다 👂들었다 🧠느꼈다      │
│ ...                                          │
├─────────────────────────────────────────────┤
│ 시선 분석                                     │
│ [히트맵 이미지 + 오버레이 캔버스]             │
│ CTA 주목도: 0.72 / 인지부하: 0.35            │
├─────────────────────────────────────────────┤
│ 🏆 개선 우선순위 Top 3                        │
│ 1️⃣ [처방 카드] 난이도: 쉬움                   │
│ 2️⃣ [처방 카드] 난이도: 보통                   │
│ 3️⃣ [처방 카드] 난이도: 어려움                 │
├─────────────────────────────────────────────┤
│ 📈 같은 계정 성과 비교                        │
│ ┌─이 소재──┐ ┌─Top 소재─┐                   │
│ │CTR 0%    │ │CTR 3.7%  │                   │
│ └─────────┘ └─────────┘                    │
│ 차이점: Top 소재는 9초 더 짧고...             │
└─────────────────────────────────────────────┘
```

**구현 포인트:**
- `overflow-y: auto` + `max-height: calc(100vh - 200px)` (기존 sticky 패널 유지)
- 각 섹션은 독립 컴포넌트, props로 데이터 전달
- 처방은 lazy load (별도 SWR, 스크롤 시 fetch)

### 3.2 three-axis-score.tsx — 3대축 점수

```typescript
interface ThreeAxisScoreProps {
  performance: CreativeDetailResponse["performance"];
  benchmarks: CreativeDetailResponse["benchmarks"];
}
```

**3대축 점수 산출 로직:**

| 축 | 점수 산출 | 지표 | 색상 |
|----|----------|------|------|
| 기반 (Awareness) | `(video_p3s_rate / benchmark.p50) × 50` (0~100 cap) | 3초시청률, ThruPlay율, 도달률 | `#10b981` 🟢 |
| 참여 (Engagement) | `(ctr / benchmark.p50) × 50` (0~100 cap) | CTR, CPC, 동영상재생수 | `#f59e0b` 🟡 |
| 전환 (Conversion) | `(reach_to_purchase_rate / benchmark.p50) × 50` (0~100 cap) | ROAS, 구매수, 구매전환값 | `#ef4444` 🔴 |

**벤치마크 비교 표시:**
- 값 / 벤치마크(p50) 형태: `3초시청률: 32.46% / 30.72% 🟢`
- 벤치마크 이상 → 🟢, 75% 이상 → 🟡, 미만 → 🔴

**세부항목** (접기/펼치기):
- `<details>` 네이티브 사용
- 각 축별 세부 지표 나열 (값 / 벤치마크 / 상태 이모지)

### 3.3 five-axis-card.tsx — 5축 분석 태그

```typescript
interface FiveAxisCardProps {
  analysisJson: AnalysisJsonV3;
}
```

**렌더링:**
- `analysis_json.hook.hook_type` → `[훅: {value}]` 태그
- `analysis_json.text.headline_type` → `[메시징: {value}]` 태그
- `analysis_json.psychology.social_proof_type` → 사회적 증거 태그
- `analysis_json.hook.visual_style` → `[스타일: {value}]` 태그
- `analysis_json.quality.production_quality` → 제작 수준 표시

**태그 스타일:**
```css
display: inline-flex;
padding: 3px 10px;
border-radius: 16px;
font-size: 0.75rem;
font-weight: 600;
background: rgba(247, 93, 93, 0.1);  /* Primary 10% */
color: #F75D5D;
```

축별 색상 분리:
| 축 | 배경 | 텍스트 |
|----|------|--------|
| 훅 | `rgba(247,93,93,0.1)` | `#F75D5D` (Primary) |
| 메시징 | `rgba(139,92,246,0.1)` | `#8b5cf6` (Purple) |
| 타겟 | `rgba(59,130,246,0.1)` | `#3b82f6` (Blue) |
| 카테고리 | `rgba(16,185,129,0.1)` | `#10b981` (Green) |
| 스타일 | `rgba(245,158,11,0.1)` | `#f59e0b` (Amber) |

### 3.4 customer-journey.tsx — 고객 여정 타임라인

VIDEO 소재 전용. IMAGE 소재에서는 숨김.

```typescript
interface CustomerJourneyProps {
  analysisJson: AnalysisJsonV3;
  durationSeconds: number;
}
```

**데이터 소스:** `analysis_json.structure` (scene_count, scenes) + Gemini video_analysis

**레이아웃:**
```
grid-template-columns: 70px 1fr;
```

각 씬 행:
```
┌──────┬──────────────────────────────────────┐
│ 0-2초│ ① 훅                                 │
│      │ 👁 봤다: 제품 클로즈업, 텍스트 오버레이│
│      │ 👂 들었다: 밝은 BGM, 나레이션 시작    │
│      │ 🧠 느꼈다: 호기심, 문제 공감          │
└──────┴──────────────────────────────────────┘
```

**스텝 번호 원형:**
- 배경색: Primary `#F75D5D`
- 크기: 32×32px, border-radius 50%
- 글자: white, font-weight 700

### 3.5 gaze-analysis.tsx — 시선 분석

```typescript
interface GazeAnalysisProps {
  saliency: CreativeDetailResponse["saliency"];
  saliencyFrames: CreativeDetailResponse["saliency_frames"];
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
}
```

**IMAGE 소재:**
```
┌──────────────────────────────┐
│ [원본 이미지]                 │
│   [히트맵 canvas 오버레이]    │  ← attention_map_url 이미지 오버레이
│                              │    opacity: 0.6
└──────────────────────────────┘
CTA 주목도: 0.72  │  인지부하: 0.35
```

- `<figure>` 안에 `<img>` + `<img>` (히트맵) 겹침 (position absolute)
- `attention_map_url`을 직접 이미지로 로드 (GCS 경로)
- `top_fixations` → 붉은 점(●) 오버레이

**VIDEO 소재:**
- 프레임별 히트맵 슬라이더 (saliency_frames 배열)
- 현재 프레임 인덱스를 state로 관리
- 프레임 전환 시 해당 히트맵 이미지 교체

**지표 바:**
```
┌─CTA 주목도─────────────────────┐
│ ████████████████░░░░  0.72     │  ← #F75D5D fill
└────────────────────────────────┘
┌─인지부하───────────────────────┐
│ ████████░░░░░░░░░░░░  0.35     │  ← #10b981 (낮을수록 좋음)
└────────────────────────────────┘
```

### 3.6 prescription-cards.tsx — 처방 Top 3

```typescript
interface PrescriptionCardsProps {
  prescriptions: PrescriptionResponse["top3_prescriptions"];
  isLoading: boolean;
}
```

**카드 레이아웃:**
```
┌─ 1️⃣ CTR 0% 개선 — CTA 명분 강화 ────────────────────┐
│                                                       │
│ 27-30초 씬: CTA 구간에서 "지금 40% 할인"처럼           │
│ 명확한 혜택을 명시하면 클릭 유도 가능                   │
│                                                       │
│ 🖱 행동 난이도: 쉬움                                   │
│ 📊 근거: CTR 벤치마크 2.07% 대비 현재 0%              │
└───────────────────────────────────────────────────────┘
```

- 왼쪽 border 4px: 1번 `#ef4444` (red), 2번 `#f59e0b` (amber), 3번 `#F75D5D` (primary)
- 난이도 아이콘: 쉬움 `👁`, 보통 `🧠`, 어려움 `🖱`
- `performance_driven` 플래그 true면 "📊 성과 기반" 뱃지 표시

### 3.7 top-compare.tsx — Top 소재 비교

```typescript
interface TopCompareProps {
  current: {
    ctr: number;
    roas: number;
    video_p3s_rate: number | null;
    reach_to_purchase_rate: number;
  };
  top: CreativeDetailResponse["top_creative"];
}
```

**2-column 비교 레이아웃:**
```
┌─이 소재──────────┐  ┌─✅ Top 소재──────┐
│ border-left:      │  │ border-left:      │
│ 4px #ef4444       │  │ 4px #10b981       │
│                   │  │                   │
│ CTR: 0%           │  │ CTR: 3.7%         │
│ 3초시청률: 32%    │  │ 3초시청률: 37%    │
│ ROAS: 1.2         │  │ ROAS: 4.8         │
└───────────────────┘  └───────────────────┘

차이점: Top 소재는 9초 더 짧고, CTA가 명확하며...
```

- `grid-template-columns: 1fr 1fr; gap: 1rem`
- 차이점 텍스트는 Gemini 처방 결과에서 추출 (prescription response)

---

## 4. 기존 파일 수정 범위

### 4.1 creative-analysis.tsx 수정 (최소)

**변경 1: IndividualTab 상세 패널 교체**

기존 상세 패널 (레이더차트+제안사항) → `CreativeDetailPanel` 임포트 교체.

```typescript
// 기존 (제거)
{selectedCreative && (
  <div className="sticky top-4 space-y-4">
    {/* 레이더차트, LP일관성, 제안사항 등 ~200줄 */}
  </div>
)}

// 신규 (교체)
{selectedCreative && (
  <CreativeDetailPanel
    creativeId={selectedCreative.id}
    accountId={selectedAccountId}
  />
)}
```

**변경 2: PortfolioTab에 축별 분포 + 다양성 경고 추가**

기존 PortfolioTab 하단에 컴포넌트 추가.

```typescript
// 기존 PortfolioTab 마지막에 추가
<AxisDistribution data={intelligenceData} />
<DiversityAlert accountId={selectedAccountId} />
```

### 4.2 신규 API route 파일

`src/app/api/protractor/creative-detail/route.ts` — 1개 신규

---

## 5. 색상 체계

모찌리포트 → 프로젝트 색상 매핑:

| 용도 | 모찌리포트 | 프로젝트 | 비고 |
|------|-----------|---------|------|
| Primary accent | `#6366f1` (indigo) | `#F75D5D` (coral) | 메인 강조색 |
| Primary hover | — | `#E54949` | 호버 상태 |
| 기반 (Awareness) | `#10b981` | `#10b981` | 동일 유지 🟢 |
| 참여 (Engagement) | `#f59e0b` | `#f59e0b` | 동일 유지 🟡 |
| 전환 (Conversion) | `#ef4444` | `#ef4444` | 동일 유지 🔴 |
| Purple (보조) | `#8b5cf6` | `#8b5cf6` | 동일 유지 |
| 배경 | `#0f172a` (dark) | `#ffffff` (white) | **라이트 모드** |
| 카드 배경 | `#1e293b` (dark) | `#f8fafc` (slate-50) | 라이트 모드 전환 |
| 보더 | `#475569` (slate-600) | `#e2e8f0` (slate-200) | 라이트 모드 전환 |
| 텍스트 1 | `#f1f5f9` (white) | `#1e293b` (slate-800) | 라이트 모드 전환 |
| 텍스트 2 | `#cbd5e1` (muted) | `#64748b` (slate-500) | 라이트 모드 전환 |
| 폰트 | 시스템 | Pretendard | 프로젝트 폰트 |

---

## 6. Wave 2: 포트폴리오 강화

### 6.1 axis-distribution.tsx — 축별 분포 차트

**데이터:** 계정 전체 소재의 5축 점수를 집계 → 축별 히스토그램

```typescript
interface AxisDistributionProps {
  data: IntelligenceResponse;  // 기존 데이터 재활용
}
```

5개 축(시각효과/메시지/CTA/사회증거/LP일관성)별로 점수 분포 막대차트.
- Recharts `BarChart` 사용 (기존 의존성)
- 각 축의 평균선 표시

### 6.2 diversity-alert.tsx — Andromeda 다양성 경고

처방 엔진의 `andromeda_warning` 결과 활용.

```typescript
interface DiversityAlertProps {
  accountId: string;
}
```

- SWR로 계정 수준 다양성 점수 조회
- `diversity_score < 0.5` → 빨간 경고 배너
- 유사 소재 쌍 표시 + 다각화 제안

---

## 7. Wave 3: 오디오 + 인터랙티브 (후순위)

### 7.1 오디오 분석
- `analysis_json.audio` → 나레이션 톤, BGM 장르, 감정 흐름
- `<details>` 접기/펼치기 3개 (나레이션/BGM/감정)
- Wave 1에서 UI 골격만 만들고 데이터 바인딩은 Wave 3

### 7.2 인터랙티브 타임라인
- 영상 재생 → 현재 시간에 맞는 여정 행 하이라이트
- `<video>` onTimeUpdate → setState → CustomerJourney 행 강조
- GazeAnalysis 프레임 자동 전환 동기화

---

## 8. 구현 순서

| 단계 | 작업 | 파일 | 의존성 |
|------|------|------|--------|
| **1** | API route 생성 | `api/protractor/creative-detail/route.ts` | DB 스키마 |
| **2** | 3대축 점수 컴포넌트 | `three-axis-score.tsx` | API |
| **3** | 5축 태그 컴포넌트 | `five-axis-card.tsx` | API |
| **4** | 시선 분석 컴포넌트 | `gaze-analysis.tsx` | API + GCS 히트맵 |
| **5** | 처방 카드 컴포넌트 | `prescription-cards.tsx` | prescription API |
| **6** | 고객 여정 컴포넌트 | `customer-journey.tsx` | analysis_json |
| **7** | Top 소재 비교 컴포넌트 | `top-compare.tsx` | API |
| **8** | 풀 패널 조립 | `creative-detail-panel.tsx` | 2~7 전부 |
| **9** | 기존 파일 교체 | `creative-analysis.tsx` 수정 | 8 |
| **10** | 포트폴리오 강화 | `axis-distribution.tsx`, `diversity-alert.tsx` | 기존 데이터 |

---

## 9. 기술 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 차트 라이브러리 | Recharts (기존) | 이미 설치됨, BarChart/RadarChart 사용 중 |
| 히트맵 렌더링 | `<img>` 오버레이 | DeepGaze 결과가 이미 이미지로 GCS 저장됨 |
| 처방 생성 | 기존 prescription-engine | 581줄 13단계 엔진 재활용 |
| 캐싱 | analysis_json에 처방 결과 저장 | prescription-engine이 이미 이 패턴 사용 |
| 접기/펼치기 | 네이티브 `<details>` | 추가 의존성 없음, 모찌리포트와 동일 |
| 디자인 | 라이트 모드 고정 | CLAUDE.md 규칙 + 디자인 시스템 |

---

## 6. TDD 테스트 설계

### 테스트 파일

| 파일 | 대상 |
|------|------|
| `__tests__/creative-analysis-v2/compute-element-attention.test.ts` | computeElementAttention 함수 |
| `__tests__/creative-analysis-v2/api-creative-detail.test.ts` | creative-detail API 응답 구조 |

### describe/it 구조

```
describe("computeElementAttention")
  it("fixation이 있는 region의 element에 intensity 배분")
  it("fixation이 없으면 area_pct 기반 fallback")
  it("elements가 빈 배열이면 빈 배열 반환")
  it("같은 region에 복수 element → area_pct 비율로 분배")

describe("creative-detail API")
  it("유효한 media_id로 3대축+5축+처방 응답")
  it("존재하지 않는 media_id → 404")
```

### Mock 데이터

```typescript
const mockFixations: TopFixation[] = [
  { sec: 0, x: 0.5, y: 0.5, intensity: 0.8 },
  { sec: 1, x: 0.5, y: 0.8, intensity: 0.6 },
];
const mockElements: ElementInfo[] = [
  { type: "인물", region: "center_center", area_pct: 60 },
  { type: "텍스트", region: "bottom_center", area_pct: 15 },
  { type: "배경", region: "top_center", area_pct: 25 },
];
```

### Assert 패턴

- `expect(result).toHaveLength(elements.length)` — 요소 수 일치
- `expect(result.reduce((s, r) => s + r.attention_pct, 0)).toBeCloseTo(100, -1)` — 합계 ~100%
- `expect(result.find(r => r.type === "인물")!.attention_pct).toBeGreaterThan(0)` — 시선 영역 요소 주목도 > 0

---

## 10. 성공 기준

- [ ] 개별소재 클릭 → 3대축+5축+고객여정+시선+처방 패널 표시
- [ ] 3대축 점수에 벤치마크 비교 포함
- [ ] 시선 히트맵 이미지 오버레이 정상 렌더링
- [ ] 처방 Top 3 카드에 난이도+근거 표시
- [ ] 포트폴리오 탭에 축별 분포 차트 추가
- [ ] 색상 체계: Primary #F75D5D, 3대축 색상 유지, 라이트 모드
- [ ] Pretendard 폰트, 한국어 UI
- [ ] `npx tsc --noEmit` + `npm run build` 통과
- [ ] 기존 소재분석 기능 깨지지 않음
