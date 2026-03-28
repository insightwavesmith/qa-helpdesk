# 총가치각도기 UX 리디자인 — AI 처방 통합 기획서

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | 총가치각도기 UX 리디자인 (처방 시스템 통합) |
| **요청일** | 2026-03-26 |
| **요청자** | Smith님 |
| **선행 완료** | 처방 시스템 v2 개발 완료 (Match Rate 100%, 19파일 3,724줄) |
| **핵심 가치** | "진단 → 처방 → 실행"이 끊김 없이 이어지는 UX |

| 관점 | AS-IS 문제 | TO-BE 해결 |
|------|-----------|-----------|
| **Problem** | 처방이 소재 개별 상세에 숨어있어 발견성 0% | 대시보드에서 바로 처방 확인 가능 |
| **Solution** | 3탭(대시보드/소재/경쟁사) + 처방은 깊은 depth | 4탭 + AI 처방 전용 탭 + 대시보드 하이라이트 |
| **UX Effect** | 진단만 보고 "그래서 뭘 하라고?" 이탈 | 진단 옆에 바로 "이렇게 고쳐라" 동선 |
| **Core Value** | T3 점수만 보여주는 성적표 | **실행 가능한 코칭** = 진단 + 처방 + 근거 |

---

## 1. 현재 상태 분석 (AS-IS)

### 1.1 현재 탭 구조
```
대시보드 │ 소재 분석 │ 경쟁사 분석
```

### 1.2 현재 사용자 동선 (처방까지 5단계)
```
① /protractor (대시보드) — T3 점수 + 요약 카드 확인
② "콘텐츠" 탭 클릭 — 광고별 순위 확인
③ /protractor/creatives (소재 분석) — 소재 목록 스크롤
④ 개별 소재 클릭 → /protractor/creative/[id] 진입
⑤ "처방" 탭 클릭 → PrescriptionPanel 로딩 (2~3초)
```

**문제**:
- 처방까지 5단계, 대부분 ③에서 이탈
- 대시보드에서 "뭐가 문제인지"만 보이고 "어떻게 고칠지"가 없음
- 계정 수준의 Andromeda 다양성 경고 미노출
- 고객 여정(감각→사고→클릭→구매) 관점 뷰 없음

### 1.3 이미 구현된 처방 컴포넌트 (재활용 가능)
| 컴포넌트 | 파일 | 역할 |
|---------|------|------|
| PrescriptionPanel | 220줄 | 처방 컨테이너 (개별 소재) |
| PrescriptionList | 110줄 | Top 3 처방 목록 + 3축 근거 |
| PerformanceBacktrack | 143줄 | 성과역추적 (worst 3 지표) |
| CustomerJourneyBreakdown | 87줄 | 고객여정 4단계 분석 |
| AndromedaAlert | 86줄 | 소재 다양성 경고 |
| FiveAxisScorecard | 77줄 | 5축 점수 카드 |
| BenchmarkComparison | 86줄 | 벤치마크 비교 |

---

## 2. UX 리디자인 (TO-BE)

### 2.1 탭 구조 변경
```
대시보드 │ AI 처방 │ 소재 분석 │ 경쟁사 분석
                ↑ 신규 탭 (2번째 위치 = 핵심 기능 강조)
```

### 2.2 새 사용자 동선 (처방까지 2단계)
```
① /protractor (대시보드) — T3 + "긴급 처방" 하이라이트 카드
② "AI 처방" 탭 클릭 → 계정 수준 처방 대시보드 (1클릭 도달)
```

또는:
```
① /protractor (대시보드) — "긴급 처방" 카드의 "자세히 보기" 클릭
② 해당 소재 처방 상세로 바로 이동
```

### 2.3 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **진단 → 처방 즉시 연결** | 모든 진단 결과 옆에 "처방 보기" 동선 |
| **광고 + 랜딩 = 세트** | 광고각도기(기반+참여+CTR) + 랜딩각도기(클릭후→구매) 통합 뷰 |
| **참여는 진단만** | 참여율은 알고리즘 건강도 모니터링, 처방 대상 아님 |
| **reach_to_purchase_rate 중심** | 최종 목적함수를 모든 화면에서 강조 |
| **처방 3축 근거 투명** | 원론/내부패턴/글로벌벤치마크 근거를 항상 표시 |

---

## 3. 화면별 상세 설계

### 3.1 대시보드 (기존 + 처방 하이라이트)

**변경 사항**: 기존 대시보드 하단에 "긴급 처방" 섹션 추가

```
┌─────────────────────────────────────────────────┐
│ [계정 선택 ▼]              [어제▪이번주▪지난주▪지난달] │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────┐  ┌─────┐ ┌─────┐ ┌─────┐      │
│  │   T3 게이지    │  │기반  │ │참여  │ │전환  │      │
│  │    67점 B     │  │ 72  │ │ 58  │ │ 71  │      │
│  └──────────────┘  └─────┘ └─────┘ └─────┘      │
│                                                   │
│  [3초시청률] [CTR] [CPC] [구매전환율] [노출당구매] [ROAS]│
│                                                   │
├── 🔥 긴급 처방 (신규 섹션) ─────────────────────────┤
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 🔴 가장 약한 소재: "에어무드 3월 프로모션"         │  │
│  │ 노출당구매확률 0.02% (벤치마크 0.07%, -71%)      │  │
│  │                                               │  │
│  │ Top 처방: "CTA를 혜택 명시형으로 변경"            │  │
│  │ → CTR 15~20% 개선 예상 (난이도: 쉬움)           │  │
│  │                                               │  │
│  │ [처방 상세 보기 →]        [다른 소재 처방 보기 →]  │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ⚠️ 소재 다양성 경고: 3개 소재가 70%+ 유사           │
│  [Andromeda 분석 보기 →]                           │
│                                                   │
├── 타겟 중복 분석 ─────────────────────────────────┤
│  (기존 OverlapAnalysis 유지)                       │
└─────────────────────────────────────────────────┘
```

**로직**:
- 계정의 모든 소재 중 reach_to_purchase_rate가 가장 낮은 소재 1개 자동 선택
- 해당 소재의 Top 1 처방을 하이라이트
- Andromeda 경고가 medium/high면 배너 표시

### 3.2 AI 처방 탭 (신규)

**경로**: `/protractor/prescriptions`

```
┌─────────────────────────────────────────────────┐
│ 대시보드 │ AI 처방 (active) │ 소재 분석 │ 경쟁사     │
├─────────────────────────────────────────────────┤
│                                                   │
│  ── 고객 여정 진단 ──────────────────────────────  │
│                                                   │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │ 😍 감각  │→│ 🤔 사고  │→│ 👆 클릭  │→│ 💰 구매  │  │
│  │         │  │         │  │         │  │         │  │
│  │ 3초시청률 │  │ 헤드라인  │  │ CTR     │  │ 구매전환  │  │
│  │ 42.5%   │  │ 공감도   │  │ 1.8%   │  │ 0.02%  │  │
│  │         │  │         │  │         │  │         │  │
│  │ 🟡 보통  │  │ 🟢 양호  │  │ 🟡 보통  │  │ 🔴 위험  │  │
│  │ -15%    │  │ +3%     │  │ -8%     │  │ -71%   │  │
│  └────────┘  └────────┘  └────────┘  └────────┘  │
│                                                   │
│  최종 성적: 노출당구매확률 0.02% (목표 0.07%)        │
│  병목 구간: 구매 단계 (-71%)                        │
│  → "광고 클릭은 되지만 LP에서 이탈" 패턴             │
│                                                   │
│  ── 소재별 처방 우선순위 ─────────────────────────  │
│                                                   │
│  ┌─ 1순위 ─────────────────────────────────────┐  │
│  │ 🔴 에어무드 3월 프로모션 (VIDEO)                │  │
│  │ 노출당구매: 0.02% ← 계정 최저                  │  │
│  │                                               │  │
│  │ ① CTA 혜택 명시형 변경 (쉬움) ⚡성과기반         │  │
│  │   → CTR +15~20% 예상                         │  │
│  │ ② 훅 0.5초 문제형으로 교체 (보통)               │  │
│  │   → 3초시청률 +25% 예상                       │  │
│  │ ③ 제품 노출 앞당기기 (보통)                     │  │
│  │   → 구매전환 +10% 예상                        │  │
│  │                                               │  │
│  │ [3축 근거 보기 ▼]  [소재 상세 →]               │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 2순위 ─────────────────────────────────────┐  │
│  │ 🟡 글로우빈 리뷰 소재 (IMAGE)                   │  │
│  │ 노출당구매: 0.05%                              │  │
│  │ ① 사회적 증거 숫자 추가 (쉬움)                  │  │
│  │ [3축 근거 보기 ▼]  [소재 상세 →]               │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 3순위 ─────────────────────────────────────┐  │
│  │ (다음 소재...)                                 │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ── Andromeda 소재 다양성 ──────────────────────  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 다양성 점수: 62/100 (⚠️ 보통)                  │  │
│  │                                               │  │
│  │ 유사 소재 3쌍 발견:                            │  │
│  │ • 소재A ↔ 소재B: 78% 유사 (visual, hook 겹침)  │  │
│  │ • 소재A ↔ 소재C: 72% 유사 (text, psychology)   │  │
│  │                                               │  │
│  │ 💡 다양화 제안:                                │  │
│  │ "20-30대 직장여성 + 시간절약 각도 소재 추가"      │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ── 글로벌 벤치마크 비교 ──────────────────────────  │
│                                                   │
│  (내 계정 vs Motion 글로벌 14개 지표 레이더 차트)     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**핵심 로직**:
1. 계정의 모든 소재를 reach_to_purchase_rate 오름차순 정렬
2. 하위 3~5개 소재에 대해 처방 자동 생성 (또는 캐시된 처방 로드)
3. 고객 여정 4단계는 계정 평균으로 계산
4. Andromeda는 계정 수준 분석

### 3.3 대시보드 "콘텐츠" 탭 개선

**변경**: 기존 ContentRanking에 처방 바로가기 추가

```
┌─ Top 5 광고 ─────────────────────────────────────┐
│                                                     │
│ 1. 에어무드 봄 시즌 (VIDEO)                          │
│    ROAS 4.2 │ 구매 23건 │ CTR 2.1%                  │
│    기반 🟢 │ 참여 🟡 │ 전환 🟢                        │
│    [처방 보기 →]  ← 신규 버튼                         │
│                                                     │
│ 2. 글로우빈 리뷰 (IMAGE)                             │
│    ROAS 1.8 │ 구매 5건 │ CTR 1.2%                   │
│    기반 🟡 │ 참여 🔴 │ 전환 🟡                        │
│    [🔥 처방 필요] [처방 보기 →]  ← 약점 강조           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3.4 소재 분석 목록 개선

**변경**: 각 소재 카드에 처방 요약 배지 추가

```
┌─ 소재 카드 ─────────────────────────────────────┐
│ [썸네일]  에어무드 3월 프로모션                       │
│           VIDEO │ 2026-03-15                      │
│           5축: visual 75 │ text 68 │ hook 82      │
│                                                   │
│  🔴 처방 3건 │ 최우선: "CTA 혜택형 변경"             │
│  [처방 보기 →]                                    │
└─────────────────────────────────────────────────┘
```

---

## 4. 신규 개발 항목

### 4.1 신규 페이지/컴포넌트

| # | 항목 | 파일 | 담당 | 비고 |
|---|------|------|------|------|
| N1 | AI 처방 탭 페이지 | `src/app/(main)/protractor/prescriptions/page.tsx` | frontend | 신규 |
| N2 | 계정 처방 대시보드 | `src/components/protractor/AccountPrescriptionDashboard.tsx` | frontend | 신규 |
| N3 | 고객 여정 요약 (계정 수준) | `src/components/protractor/AccountJourneySummary.tsx` | frontend | 신규 |
| N4 | 소재 처방 우선순위 목록 | `src/components/protractor/PrescriptionPriorityList.tsx` | frontend | 신규 |
| N5 | 대시보드 긴급 처방 카드 | `src/components/protractor/UrgentPrescriptionCard.tsx` | frontend | 신규 |
| N6 | 글로벌 벤치마크 레이더 차트 | `src/components/protractor/GlobalBenchmarkRadar.tsx` | frontend | 신규 |

### 4.2 신규/확장 API

| # | API | 용도 | 담당 |
|---|-----|------|------|
| A1 | GET /api/protractor/prescriptions/account | 계정 수준 처방 요약 (하위 5개 소재 처방) | backend |
| A2 | GET /api/protractor/journey/account | 계정 평균 고객 여정 분석 | backend |
| A3 | GET /api/protractor/andromeda/account | 계정 수준 Andromeda 다양성 분석 | backend |

### 4.3 기존 수정

| # | 대상 | 변경 내용 | 담당 |
|---|------|---------|------|
| M1 | protractor-tab-nav.tsx | 4탭으로 확장 ("AI 처방" 추가) | frontend |
| M2 | real-dashboard.tsx | 하단에 UrgentPrescriptionCard 추가 | frontend |
| M3 | content-ranking.tsx | 각 광고에 "처방 보기" 버튼 추가 | frontend |
| M4 | creative-analysis.tsx | 소재 카드에 처방 배지 추가 | frontend |

---

## 5. 기존 컴포넌트 재활용 전략

| 기존 컴포넌트 | 재활용 위치 | 수정 필요 |
|-------------|-----------|---------|
| PrescriptionList | AI 처방 탭 (소재별 펼침) | props 확장 (compact 모드) |
| CustomerJourneyBreakdown | AI 처방 탭 상단 | 계정 평균 데이터 지원 |
| AndromedaAlert | AI 처방 탭 + 대시보드 | 계정 수준 데이터 지원 |
| BenchmarkComparison | AI 처방 탭 하단 | 레이더 차트로 시각화 확장 |
| PerformanceBacktrack | AI 처방 탭 (소재별) | 기존 그대로 |
| FiveAxisScorecard | AI 처방 탭 (소재별) | 기존 그대로 |

---

## 6. 구현 우선순위

### Wave 1: AI 처방 탭 (핵심 가치)
- N1, N2, N4 (처방 탭 + 대시보드 + 우선순위 목록)
- A1 (계정 수준 처방 API)
- M1 (탭 네비 수정)

### Wave 2: 대시보드 연결
- N5 (긴급 처방 카드)
- M2 (대시보드 수정)
- M3 (콘텐츠 랭킹 처방 링크)

### Wave 3: 고객 여정 + 벤치마크
- N3, N6 (여정 요약 + 레이더 차트)
- A2, A3 (여정/Andromeda 계정 API)
- M4 (소재 목록 배지)

---

## 7. 광고각도기 + 랜딩각도기 세트 구조 반영

Smith님 확정 구조 (2026-03-25):

```
[광고 총가치각도기]                    [랜딩 총가치각도기]
                                     (Phase 2 — 이후 기획)
기반(P0): 3초시청률, ThruPlay, CPM     체류시간, 스크롤깊이
참여(P1): 좋아요+댓글+공유+저장         (해당 없음)
전환(P2): CTR ← 광고 끝점              장바구니율, 구매전환율

        ↓ 합산 ↓                         ↓ 합산 ↓

     reach_to_purchase_rate = 광고 + 랜딩 세트 최종 성적표
```

**UI 반영**:
- 고객 여정 4단계에서 "감각~클릭"은 광고 영역, "구매"는 랜딩 영역으로 색상 구분
- 처방에서 "CTR 높은데 구매 안 됨 → LP 문제" 패턴 자동 감지 표시
- 참여율은 🟢🟡🔴 진단만 표시, 처방 없음 명시 ("참여율은 메타 알고리즘 건강도 지표입니다")

---

## 8. 성공 기준

| 지표 | 기준 |
|------|------|
| 처방 도달 depth | 5단계 → **2단계** |
| 처방 페이지 진입률 | 0% (미존재) → **50%+** (탭 2번째) |
| 처방 생성 소재 수 | 수동 1개씩 → **자동 하위 5개** |
| 계정 수준 인사이트 | 없음 → 고객여정 + Andromeda + 글로벌벤치마크 |

---

## 9. 하지 말 것

- 랜딩각도기 UI (Phase 2, 아직 기획 전)
- 처방 엔진 로직 변경 (v2 완성됨, 건드리지 않음)
- 참여율 처방 추가 (Smith님 확정: 진단만)
- 경쟁사 분석 탭 변경 (이번 범위 아님)
- 다크 모드 (금지)

---

## 10. 목업

- `docs/mockup/protractor-ux-prescription.html` 참조
- 데스크탑(1920px) + 모바일(375px) 반응형

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `GET /api/protractor/prescriptions/account` | `accountId: "act_123"`, `period: "last_7d"` | `{ prescriptions: PrescriptionSummary[], worst_creative: CreativeSummary, andromeda: AndromedaSummary }` | prescriptions 길이 ≤5, worst_creative.reach_to_purchase_rate가 계정 최저 |
| `GET /api/protractor/journey/account` | `accountId: "act_123"` | `{ stages: { sensation, thinking, action_click, action_purchase }, final_score: number }` | 4개 stage 모두 존재, 각 stage에 value/benchmark/diff/status('🟢'|'🟡'|'🔴') 포함 |
| `GET /api/protractor/andromeda/account` | `accountId: "act_123"` | `{ diversity_score: number, similar_pairs: SimilarPair[], suggestions: DiversificationSuggestion }` | diversity_score 0~100 범위, similar_pairs는 similarity 내림차순 |
| `UrgentPrescriptionCard({ accountId })` | 계정 데이터 로드 | 가장 약한 소재의 Top 1 처방 + reach_to_purchase_rate 표시 | 처방 없으면 "처방 생성 중" 로딩 표시, 소재 0건이면 카드 미표시 |
| `PrescriptionPriorityList({ prescriptions })` | 소재별 처방 배열 | reach_to_purchase_rate 오름차순 정렬된 소재 카드 목록 | 각 카드에 순위·소재명·노출당구매율·Top처방 표시 |
| `AccountJourneySummary({ stages })` | 고객여정 4단계 데이터 | 감각→사고→클릭→구매 4단계 시각화 + 병목 구간 강조 | 병목 = diff가 가장 큰 음수인 stage |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | 소재 0건 계정 | `creative_media` 0건 | 대시보드 긴급 처방 카드 미표시, AI 처방 탭 "분석할 소재가 없습니다" | P0 |
| E2 | 처방 미생성 소재 | 처방 API 미호출 or 실패한 소재 | "처방 생성 중..." 로딩 → 재시도 버튼 표시 | P0 |
| E3 | 성과 데이터 없음 | `daily_ad_insights` 0건 (신규 광고) | 고객여정 "데이터 수집 중" 표시, reach_to_purchase_rate 미산출 | P1 |
| E4 | Andromeda 소재 1건 | 유사도 비교 불가 (최소 2건 필요) | "소재 2개 이상일 때 다양성 분석 가능" 안내 | P1 |
| E5 | 참여율 처방 요청 | 사용자가 참여율 개선 기대 | "참여율은 메타 알고리즘 건강도 지표입니다" 안내, 처방 미제공 (Smith님 확정) | P1 |
| E6 | 모바일 375px 레이아웃 | 좁은 화면에서 4단계 여정 표시 | 2×2 그리드 또는 세로 스택 반응형 처리 | P2 |
| E7 | 대량 소재 계정 (50건+) | 소재 50건 이상 | 하위 5개만 처방 표시 + "더 보기" 페이지네이션 | P2 |
| E8 | 캐시된 처방 vs 최신 데이터 | 처방 24시간 TTL 내 성과 데이터 변동 | 캐시 처방 표시 + "최신 데이터 기준 재생성" 버튼 | P2 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: account_prescription_summary — 계정 수준 처방 요약
{
  "prescriptions": [
    {
      "creative_id": "cm_abc123",
      "creative_name": "에어무드 3월 프로모션",
      "media_type": "VIDEO",
      "reach_to_purchase_rate": 0.0002,
      "benchmark_rate": 0.0007,
      "gap_percent": -71,
      "top_prescription": {
        "title": "CTA를 혜택 명시형으로 변경",
        "difficulty": "쉬움",
        "expected_impact": "CTR +15~20%"
      }
    }
  ],
  "worst_creative": {
    "creative_id": "cm_abc123",
    "creative_name": "에어무드 3월 프로모션",
    "reach_to_purchase_rate": 0.0002
  },
  "andromeda": {
    "diversity_score": 62,
    "warning_level": "medium",
    "similar_count": 3
  }
}
```

```json
// fixture: account_journey_summary — 계정 평균 고객 여정
{
  "stages": {
    "sensation": { "label": "감각", "value": 42.5, "benchmark": 50.0, "diff": -15, "status": "🟡" },
    "thinking": { "label": "사고", "value": 68.0, "benchmark": 66.0, "diff": 3, "status": "🟢" },
    "action_click": { "label": "클릭", "value": 1.8, "benchmark": 1.96, "diff": -8, "status": "🟡" },
    "action_purchase": { "label": "구매", "value": 0.02, "benchmark": 0.07, "diff": -71, "status": "🔴" }
  },
  "final_score": 0.0002,
  "bottleneck": "action_purchase",
  "bottleneck_message": "광고 클릭은 되지만 LP에서 이탈"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| 계정 처방 API | `__tests__/protractor-ux/account-prescriptions-api.test.ts` | vitest |
| 계정 여정 API | `__tests__/protractor-ux/account-journey-api.test.ts` | vitest |
| Andromeda 계정 API | `__tests__/protractor-ux/account-andromeda-api.test.ts` | vitest |
| UrgentPrescriptionCard | `__tests__/protractor-ux/urgent-prescription-card.test.tsx` | vitest + @testing-library/react |
| PrescriptionPriorityList | `__tests__/protractor-ux/prescription-priority-list.test.tsx` | vitest + @testing-library/react |
| AccountJourneySummary | `__tests__/protractor-ux/account-journey-summary.test.tsx` | vitest + @testing-library/react |
| GlobalBenchmarkRadar | `__tests__/protractor-ux/global-benchmark-radar.test.tsx` | vitest + @testing-library/react |
