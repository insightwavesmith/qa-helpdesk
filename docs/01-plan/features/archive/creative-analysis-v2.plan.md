# 소재 분석 v2 — 총가치각도기 AI 처방 통합 Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | creative-analysis-v2 (소재분석 AI 처방 통합) |
| **요청일** | 2026-03-31 |
| **요청자** | Smith님 |
| **레벨** | L2 (src/ 수정, Plan+Design 필수) |
| **기간** | 3일 |

| 관점 | AS-IS 문제 | TO-BE 해결 |
|------|-----------|-----------|
| **Problem** | 소재 분석 탭에 5축 점수만 있고 처방이 없음. 모찌리포트에서만 풀분석 가능 | 소재 분석 탭 안에서 모찌리포트 수준의 분석+처방 제공 |
| **Solution** | 개별소재: 레이더차트+ROAS만 / 포트폴리오: 점수분포만 | 개별소재: 3대축+5축+고객여정+시선+처방 / 포트폴리오: 축별분포+다양성경고 |
| **UX Effect** | 분석 보고 "그래서 뭘 하라고?" 이탈 | 진단 옆에 즉시 처방+근거 표시 |
| **Core Value** | 성적표 수준 진단 | **실행 가능한 코칭** = 진단+처방+시선근거+고객여정 |

---

## 1. 핵심 목표

모찌리포트(`mozzi-reports`)의 총가치각도기 분석 UX를 `/protractor/creatives` 소재분석 탭에 그대로 녹인다.

- **개별소재 탭**: 소재 클릭 시 모찌리포트와 동일한 풀분석 패널
- **포트폴리오 탭**: 계정 전체 소재의 축별 분포 + Andromeda 다양성 경고 + 처방 하이라이트

---

## 2. 재활용 가능 자산

### 2.1 이미 구현된 처방 컴포넌트 (src/)
| 컴포넌트 | 파일 | 줄 수 |
|---------|------|-------|
| prescription-engine.ts | 13단계 처방 엔진 | 581줄 |
| prescription-prompt.ts | Gemini 프롬프트 | 387줄 |
| prescription-tab.tsx | 개별소재 처방 UI | - |
| types/prescription.ts | 타입 정의 (AnalysisJsonV3) | 459줄 |

### 2.2 데이터 (DB)
| 데이터 | 테이블 | 건수 |
|--------|--------|------|
| DeepGaze 시선분석 | creative_saliency | 137건 (VIDEO) |
| Gemini 5축분석 | creative_media.analysis_json | 기존 소재 |
| 성과 데이터 | creative_performance | 전체 |
| 벤치마크 | prescription_benchmarks | 글로벌+내부 |

### 2.3 모찌리포트 UI 스펙 (HTML)
- 3대 축 점수 카드 (기반/참여/전환)
- 5축 분석 (포맷/훅/메시징/타겟/카테고리)
- 고객 여정 타임라인 (씬별 감각→사고→행동)
- 시선 히트맵 프레임별 분석
- 처방 우선순위 카드 (Top 3, 난이도 표시)
- 오디오 분석 (나레이션/BGM/감정흐름)
- Top 소재 비교

---

## 3. 구현 범위

### Wave 1: 개별소재 풀분석 패널 (핵심)
1. **3대 축 점수 섹션** — 기반(Awareness)/참여(Engagement)/전환(Conversion) 각 점수 + 벤치마크 비교
2. **5축 분석 카드** — 포맷, 훅, 메시징, 타겟, 카테고리 (analysis_json에서)
3. **고객 여정 타임라인** — VIDEO 소재: 씬별 감각→사고→행동 (Gemini 생성)
4. **시선 분석 섹션** — DeepGaze 히트맵 + 프레임별 시선 분포 (creative_saliency에서)
5. **처방 우선순위** — Top 3 처방 카드 (prescription-engine 호출)
6. **Top 소재 비교** — 같은 계정 최고 성과 소재와 비교

### Wave 2: 포트폴리오 강화
1. **축별 분포 차트** — 5축별 소재 분포 시각화
2. **Andromeda 다양성 경고** — 소재 유사도 높으면 경고
3. **계정 수준 처방 요약** — 가장 약한 축 + 처방 하이라이트

### Wave 3: 오디오 분석 + 인터랙티브
1. **오디오 분석** — 나레이션/BGM/감정흐름 (Gemini)
2. **인터랙티브 타임라인** — 영상 재생과 시선/여정 동기화

---

## 4. 기술 결정

| 항목 | 결정 |
|------|------|
| AI 엔진 | Gemini 3 Pro (기존 prescription-engine 활용) |
| 시선 데이터 | creative_saliency + DeepGaze 히트맵 URL |
| 성과 데이터 | creative_performance 집계 |
| 캐싱 | 처방 결과 DB 캐시 (analysis_json 확장) |
| 디자인 | Primary #F75D5D, Pretendard, 라이트 모드 |
| 색상 체계 | 기반 🟢 #10b981 / 참여 🟡 #f59e0b / 전환 🔴 #ef4444 → 프로젝트 톤 유지하되 3대축 구분만 이 컬러 사용 |

---

## 5. 파일 구조 (예상)

```
src/app/(main)/protractor/creatives/
├── creative-analysis.tsx          # 기존 (탭 라우팅)
├── components/
│   ├── individual/
│   │   ├── creative-detail-panel.tsx    # 신규: 풀분석 패널 (메인)
│   │   ├── three-axis-score.tsx         # 신규: 3대축 점수
│   │   ├── five-axis-card.tsx           # 신규: 5축 분석
│   │   ├── customer-journey.tsx         # 신규: 고객 여정 타임라인
│   │   ├── gaze-analysis.tsx            # 신규: 시선 분석 (히트맵)
│   │   ├── prescription-cards.tsx       # 신규: 처방 Top 3
│   │   └── top-compare.tsx             # 신규: Top 소재 비교
│   └── portfolio/
│       ├── axis-distribution.tsx        # 신규: 축별 분포
│       └── diversity-alert.tsx          # 신규: Andromeda 경고
```

---

## 6. 의존성

| 선행 | 상태 |
|------|------|
| DeepGaze 시선분석 데이터 | ✅ 137건 완료 |
| prescription-engine.ts | ✅ 구현 완료 |
| Gemini API 키 | ✅ 설정됨 |
| creative_performance 데이터 | ✅ 수집 중 |
| VIDEO 다운로드 → GCS | ⏳ 진행 중 (352건+) |

---

## 7. 성공 기준

- [ ] 개별소재 클릭 시 3대축+5축+고객여정+시선+처방 패널 표시
- [ ] 포트폴리오 탭에 축별 분포 + 다양성 경고 표시
- [ ] 모찌리포트와 동일한 정보량 (UX 구조 일치)
- [ ] 디자인 시스템 준수 (#F75D5D, Pretendard, 라이트 모드)
- [ ] tsc + build 통과
