# 처방 시스템 v2 계획서 — 3축 통합 처방 엔진

> 작성일: 2026-03-25
> 작성자: PM팀 (Leader)
> 상태: Plan 완료
> 기반 문서: `prescription-system-mvp.plan.md` (2축 합산)
> 선행 조건: DeepGaze 시선 배치 완료 / Gemini 1회 통합 파이프라인 완성 (5축+처방 동시 생성) / compute-score-percentiles 실행

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **프로젝트명** | 처방 시스템 v2 — 3축 통합 처방 엔진 |
| **MVP 대비 확장** | 2축 → **3축**(+Motion 글로벌 벤치마크) / 8단계 → **13단계** / Andromeda+GEM+성과역추적 반영 |
| **예상 공수** | 4주 (Phase 1~5) |
| **비용** | 이미지 건당 ~$0.003~0.007, 영상 건당 ~$0.015~0.035 (Gemini 1회 통합), 월 ~$0.7 (on-demand 40명 기준) |
| **핵심 가치** | "점수 진단"에서 "메타 알고리즘 기반 구체적 처방"으로 진화 |
| **최종 목적함수** | `reach_to_purchase_rate`(노출당구매확률) — EAR의 본질. 소재 간 유일한 공정 비교 지표 |
| **Smith님 비전** | "메타 광고 = 확률 게임. 각 단계 이탈률 줄이기" |

### 결과 요약

처방 시스템 v2는 총가치각도기의 **최종 출력물**이다. 5축 분석 → 백분위 비교 → 약점 식별까지가 "진단"이었다면, v2 처방은 **"이 소재의 CTR이 왜 낮은지, 뭘 바꾸면 올라가는지, 그 근거가 뭔지"**를 메타 내부 알고리즘(Andromeda, GEM, EAR) 관점에서 설명하는 시스템이다.

### Value Delivered — 4관점

| 관점 | 내용 |
|------|------|
| **Problem** | 수강생이 5축 점수를 봐도 "어떻게 고쳐야 하는지" 모름. 벤치마크 대비 부족하다는 사실만 확인 가능. |
| **Solution** | 3축(레퍼런스 원론 + 실데이터 패턴 + Motion 글로벌 벤치마크) 근거 기반 Top 3 처방을 자동 생성. Andromeda 유사도로 소재 다양성까지 경고. |
| **Function UX Effect** | 소재 상세 페이지에서 "처방" 탭 클릭 → 15초 내 고객 여정 4단계별 약점 + impact순 처방 3건 + Andromeda 다양성 경고 제공. |
| **Core Value** | Smith님의 "확률게임 이탈률 최소화" 비전을 **실행 가능한 액션**으로 전환. 수강생이 "다음에 뭘 해야 하는지" 바로 알 수 있다. |

---

## 1. 개요 + MVP 대비 확장점

### 1.1 MVP 요약 (현재 Plan 완료 상태)

MVP는 **2축 합산** 처방:
- **축1**: 레퍼런스 원론 (고정 텍스트 — Neurons, Vidmob, Meta 가이드, Motion Bootcamp)
- **축2**: 실데이터 패턴 (prescription_patterns 테이블, source='internal')
- 처방 생성 **8단계** 플로우
- 이미지 소재만, on-demand 호출

### 1.2 v2 확장점 (★ 표시)

| 영역 | MVP (2축) | v2 (3축) | 변경 이유 |
|------|----------|---------|----------|
| **처방 축** | 축1 + 축2 | 축1 + 축2 + **★축3 (Motion 글로벌 벤치마크)** | 내부 데이터(N≈3,000)만으로는 샘플 부족. $1.3B 글로벌 데이터 보강 |
| **처방 단계** | 8단계 | **★13단계** (Gemini 1회 통합) | 5축+처방 동시 생성으로 비용 절반·속도 2배. Andromeda, Motion, GEM/EAR, 성과역추적 분석 추가 |
| **★성과역추적** | 없음 | **★벤치마크 대비 성과 약점 → 집중 처방** | 성과 데이터에서 역추적하여 가장 떨어지는 지표에 처방 집중. 5축 분석과 상호보완 |
| **Andromeda 통합** | 없음 | **★계정 전체 소재 다양성 분석 + 경고** | 개별 소재가 아닌 광고계정 전체 포트폴리오 관점의 유사도 → reach 페널티 사전 경고 |
| **GEM/EAR 분석** | 없음 | **★EAR 영향 인자 분석** | 어떤 축이 Estimated Action Rate에 가장 큰 영향을 주는지 역추적 |
| **DeepGaze+씬 결합** | 시선 데이터 조회만 | **★ffmpeg 씬 경계 감지 + DeepGaze 1초별 시선 → Gemini에게 보조 데이터로 전달 → 처방 결합** | ffmpeg가 물리적 화면 전환 지점 감지 → Gemini가 경계 기반으로 정확한 의미적 씬 분할. Gemini 단독 시 초수 오차 방지 (영상 전용) |
| **벤치마크 비교** | 유사소재 Top3 | **★벤치마크 유사도 + Motion 글로벌 백분위** | 글로벌 수준 대비 위치 파악 |
| **데이터 모델** | prescription_patterns 1개 | **★prescription_benchmarks 통합 테이블 추가** | 축3 저장 구조 |
| **영상 처방** | Out of Scope | **★부분 지원** (DeepGaze-Gemini 결합 완료 소재) | 파이프라인 완성 후 자연 확장 |

---

## 2. 현재 데이터 파이프라인 현황

### 2.1 8단계 파이프라인 (Smith님 확정)

```
① collect-daily       → Meta API 일일 수집 (39계정 258광고)
② process-media       → 미디어 다운로드 + GCS 저장
③ embed-creatives     ─┐
④ creative-saliency   ─┤ (병렬 실행)
   video-scene-analysis ┤ (영상만: ffmpeg 씬 경계 감지 → Gemini에게 경계+영상 전달 → 정확한 씬 분할 → DB 저장)
                        │   ★ Gemini 단독 씬 분할 시 초수를 잘 못 끊는 문제 해결
                        │     (예: 문제→설명→해결 구성에서 경계 없이는 실수 발생)
                        │
⑤ deepgaze-gemini     → DeepGaze 시선 + Gemini **1회 통합** (5축+속성태깅+처방 Top3 동시 생성)
                          영상: ffmpeg 씬 경계 + ④의 씬 분할 결과 + DeepGaze 1초별 시선을 Gemini에 함께 전달
⑥ compute-score-percentiles → 백분위 계산
⑦ LP 일관성 분석       → 소재↔LP 4축 일관성
⑧ 후처리 + 저장        → analysis_json 저장 + Andromeda 경고 + diversity_score
```

파이프라인 체인: `src/lib/pipeline-chain.ts` — fire-and-forget 트리거로 단계 연결
Cloud Run: `bscamp-cron-906295665279.asia-northeast3.run.app`

#### ★ ffmpeg + Gemini 씬 분할 2단계 구조 (영상 전용)

| 단계 | 담당 | 역할 | 왜 필요한가 |
|------|------|------|------------|
| **1단계: 씬 경계 감지** | **ffmpeg** | 물리적 화면 전환 지점 감지 (컷 변화 기반 타임코드) | 정확한 초수 끊기. 기계적 감지라 오차 없음 |
| **2단계: 의미적 씬 분할** | **Gemini** | ffmpeg 경계를 보조 데이터로 받아 각 씬에 type(hook/demo/result/cta/brand) 부여 + 내용 기술 | 의미 판단은 LLM이 잘함. 단, 초수를 혼자 끊으면 실수 |

**왜 2단계인가:**
- Gemini 단독 씬 분할 시 초수를 잘 못 끊음 (예: "문제→설명→해결" 구성에서 경계를 틀림)
- ffmpeg가 물리적 전환 지점(컷, 장면 전환)을 먼저 감지 → 이 타임코드를 Gemini에게 전달
- Gemini는 경계가 확정된 상태에서 각 구간의 의미적 분류에 집중 → 정확도 대폭 향상
- DeepGaze 1초별 시선 데이터도 함께 전달 → 시선+씬+시청률 종합 판단 가능

**코드 위치:**
- ffmpeg 프레임 추출: `services/creative-pipeline/saliency/predict_video_frames.py` (Cloud Run)
- ffmpeg 씬 경계 테스트: `scripts/test-scene-split.mjs` (방법 B)
- Gemini 씬 분할: `src/app/api/cron/video-scene-analysis/route.ts`
- DeepGaze 시선 분석: `src/app/api/cron/deepgaze-gemini/route.ts`

### 2.2 진행률 (2026-03-25 기준 — 정확한 숫자)

| 파이프라인 단계 | 완료 | 전체 | 비율 | 상태 |
|----------------|-----:|-----:|-----:|------|
| creative_media (소재 수집) | 3,022+ | 3,022+ | **100%** | 완료 |
| 미디어 Storage (GCS) | 2,873+ | 3,022 | **95%+** | 완료 |
| 임베딩 (768차원, ad_creative_embeddings) | 2,917 | 3,022 | **97%** | 완료 |
| creative_media.embedding (3072차원) | 3,166 | 3,355 | **94%** | 완료 |
| saliency_url (DeepGaze 히트맵) | 2,926 | 3,022 | **97%** | 완료 |
| **analysis_json (5축 — Gemini)** | **496** | **3,022** | **16%** | **⚠️ 병목** |
| saliency_data (DeepGaze JSON) | 0 | 3,022 | **0%** | 미실행 |
| scores (compute-score-percentiles) | 0 | 3,022 | **0%** | 미실행 |
| 벤치마크 소재 | 24 | — | — | IMAGE 16 + VIDEO 8 |
| 처방 (Prescription) | 0 | — | — | 미구현 |

### 2.3 병목 분석 — Gemini 1회 통합으로 해소

**v2 구조 변경으로 5축 배치가 별도 선행 조건이 아님.** Gemini 1회 호출이 5축 분석 + 처방을 동시에 생성하므로, 별도 5축 배치를 90%+까지 올릴 필요가 없다. 다만 축2(실데이터 패턴)의 패턴 추출은 기존 5축 데이터 496건 + 신규 통합 배치 데이터를 기반으로 한다.

```
DeepGaze 시선 배치 97% → 완료
  └─ Gemini 1회 통합 배치 실행 (5축+처방 동시)
      └─ analysis_json 저장 (5축 + 처방 통합)
          └─ compute-score-percentiles 실행
              └─ prescription_patterns 추출
                  └─ 처방 품질 점진 개선 (축2 데이터 축적)
```

---

## 3. 처방 아키텍처 — 3축 상세 설계

### 3.1 아키텍처 개요

```
축1: 방법 (레퍼런스 원론) ─── 고정 텍스트 ─────────────┐
                                                        │
축2: 숫자 (실데이터 패턴) ─── 주 1회 갱신 (동적) ───────┼──→ Gemini 통합 처방 생성
                                                        │      ├─ Top 3 처방 (impact순)
축3: 글로벌 (Motion 벤치마크) ── 분기 1회 갱신 (동적) ──┤      ├─ 고객 여정 4단계 매핑
                                                        │      ├─ Andromeda 다양성 경고
★성과역추적: 실제 성과 → 벤치마크 대비 약점 ────────────┘      ├─ GEM/EAR 영향 분석
  (ad_insights_classified 실시간)                               └─ ★성과역추적 집중 포인트
```

### 3.2 축1: 레퍼런스 원론 (고정)

프롬프트에 고정 삽입되는 텍스트. 소스:

| 소스 | 핵심 내용 |
|------|----------|
| **Neurons Inc.** | 뇌과학 기반 시선 패턴, 얼굴 노출 시선 +40%, UGC > professional 참여율 |
| **Vidmob** | 영상 구조별 성과 상관관계, 텍스트 비율/위치별 CTR 차이 |
| **Meta 공식 가이드** | Best Practice, 포맷별 권장사항, CTA 유형별 성과 |
| **Motion Bootcamp** | $1.3B 광고비 기반 인사이트, 카테고리별 벤치마크 |

**고객 여정 4단계 원론:**

| 여정 | 설명 | 핵심 원칙 |
|------|------|----------|
| **감각** (보고+듣고) | 첫 0.5~3초, 시선 확보 | 첫 프레임에 제품/핵심 메시지, 대비 높은 색상, 얼굴 노출 |
| **사고** (느끼고+판단) | 감정 반응 → 신뢰 형성 | 사회적 증거, 감정 유발, 권위 부여 |
| **행동-클릭** | 클릭 동기 부여 | 구체적 혜택 CTA, 긴급성 요소, 가격 명시 |
| **행동-구매** | 구매 결정 | LP 메시지 일관성, 브랜드 신뢰, 품질 느낌 |

**Top 5 Hook 유형 (Motion Bootcamp):**

| 순위 | Hook | 설명 | 효과 |
|:----:|------|------|------|
| 1 | Confession | "사실 저도 처음엔..." 고백/인정 | 공감 → 시청 유지 |
| 2 | Bold claim | "3일 만에 매출 2배" 강력 주장 | 호기심 → 3초 시청률↑ |
| 3 | Relatability | "이런 경험 있으시죠?" 공감 | 감정 연결 → 참여율↑ |
| 4 | Contrast | Before/After 대비 | 시각적 충격 → CTR↑ |
| 5 | Curiosity | "이걸 하면 뭐가 달라질까요?" | 호기심 유지 → ThruPlay↑ |

**세이프티존 규격 (9:16 기준):**

```
┌──────────────────────┐
│    상단 14% 금지     │ ← 시스템 UI 영역 (프로필, 시계)
│                      │
│                      │
│   안전 영역 (중앙)   │ ← 핵심 메시지 + CTA 배치
│                      │
│                      │
│    하단 35% 금지     │ ← 광고 카피, CTA 버튼(메타 제공)
│                      │
│ 좌우 각 6% 금지      │
└──────────────────────┘
```

**절대 금지 규칙:**
1. CTA 버튼 추가 처방 금지 (메타가 제공하는 것)
2. 세이프티존 밖 배치 처방 금지
3. 타겟팅 변경 처방 금지 (소재 관련만)
4. "더 좋게 하세요" 같은 추상적 처방 금지

### 3.3 축2: 실데이터 패턴 (동적)

`prescription_patterns` 테이블에서 조회. 주 1회 갱신.

```
source='internal' → 우리 5축 × 성과 패턴
  ├─ attribute: 'hook.hook_type' / 'text.cta_text' / 'psychology.emotion' 등 (14개)
  ├─ value: 'problem' / 'curiosity' / 'timer' / 'benefit' 등
  ├─ metric: 'ctr' / 'video_p3s_rate' / 'engagement_per_10k' 등
  ├─ avg_value / median_value / sample_count / lift_vs_average / lift_ci_lower
  └─ confidence: high(N≥100) / medium(N≥30) / low(N<30)
```

**통계적 유의성 기준 (중심극한정리 기반):**

| 조건 | confidence | 의미 | 처방 적용 |
|------|:----------:|------|----------|
| **N<30** | `low` | 표본분포 정규 근사 불가 | **축3(Motion 글로벌)로 보정 필수**. 단독 사용 금지, "참고" 표기 |
| **N≥30** | `medium` | CLT(중심극한정리): 표본분포가 정규분포에 수렴 → 평균의 신뢰구간 계산 가능. Cohen's d=0.5(중간 효과크기) 감지 시 검정력 ~70% | 내부 데이터 사용 가능. lift_vs_average + 95% 신뢰구간 하한값(CI lower bound) 병기 |
| **N≥100** | `high` | Cohen's d=0.2(작은 효과크기)도 감지 가능 (검정력 ~80%). 카테고리별 세분화 통계 신뢰 | **내부 데이터 우선 신뢰**. 축3보다 축2 우선 |

> `lift_ci_lower`: lift_vs_average의 95% 신뢰구간 하한값. 이 값이 0 이상이면 통계적으로 유의한 양의 효과.

**카테고리별 분리:**
- beauty, fashion, food, health 등 업종별 패턴 분리
- 카테고리 fallback: 해당 카테고리 N<30이면 전체(ALL) 패턴 사용 + 축3(Motion 글로벌)로 보정 필수
- ALL 패턴도 N<30이면 축1(원론) + 축3(Motion 글로벌)만으로 처방

**처방에서의 축2 활용 예시:**
```
약점: text.cta_text = "자세히 보기" (백분위 22%)
패턴 조회: attribute='text.cta_text', value='혜택명시'
결과: avg_ctr=2.8%, lift_vs_average=+34% (N=45, confidence=high)
→ 처방: "CTA를 '50% 할인 지금 확인하기'로 변경 — 내부 데이터 기반 CTR +34% lift"
```

### 3.4 축3: Motion 글로벌 벤치마크 (★v2 신규)

Motion의 **$1.3B 글로벌 광고비** 데이터 기반 벤치마크. MVP에서는 Out of Scope이었으나, v2에서 정식 편입.

```
source='motion' → prescription_patterns 또는 prescription_benchmarks에 저장
  ├─ 분기 1회 갱신 예정
  ├─ media_type별 (IMAGE / VIDEO) 분리
  ├─ category별 (beauty / fashion / food 등) 분리
  └─ 백분위 분포: p10, p25, p50, p75, p90
```

**축3 활용 시나리오:**
- **글로벌 대비 위치 파악**: "귀하 소재의 CTR은 글로벌 뷰티 카테고리 p25 수준 (하위 25%)"
- **축2 보정 필수 (N<30)**: 내부 데이터 N<30(CLT 미적용)이면 **축3(Motion 글로벌)로 보정 필수** — 표본분포 정규 근사 불가하므로 글로벌 벤치마크가 더 신뢰할 수 있음
- **카테고리 인사이트**: "Motion 글로벌 기준, 뷰티 카테고리 상위 10%의 hook_type은 80%가 'before_after'"

**데이터 수급 경로 (설계 완료):**

`creative-analysis-framework.md` 섹션 7에서 Motion 분류체계 흡수 설계를 완료:

1. **4카테고리 태깅 흡수** (Gemini 프롬프트 확장):
   - `visual_format` (20종): Creator-led(UGC), Product Demo, Testimonial, Before&After, Split Screen, Montage, Infographic, Listicle, How To, Skit, Street Interview, Pattern Interrupt, Unboxing, BTS, Static Product Shot, Lifestyle, Carousel, Motion Graphics, Whitetext, Mashup
   - `hook_tactic` (6종): Confession, Bold Claim, Relatability, Contrast, Curiosity, Other
   - `messaging_angle` (8종): Price, Quality, Social Proof, Emotional, Functional, Problem-Solution, Urgency-Scarcity, Other
   - `intended_audience` (자유 텍스트)
2. **$1.3B 벤치마크 데이터 수동 입력**: Motion Bootcamp 리서치 완료 (`mozzi-reports.vercel.app/reports/research/2026-03-23-bscamp-vs-motion-analysis`) → `prescription_benchmarks` 테이블에 seed 데이터 입력 → 분기 갱신
3. **자동화는 Phase 2**: Motion API 연동으로 자동 갱신 (현재 수동 입력 경로로 충분)

저장소: `prescription_benchmarks` 통합 테이블

**축 간 우선순위 (충돌 시):**

| 상황 | 적용 규칙 | 통계적 근거 |
|------|----------|------------|
| 축1 + 축2 같은 방향, 축2 N≥100 | **강력 추천** (두 근거 모두 인용, 내부 데이터 high confidence) | Cohen's d=0.2도 감지, 검정력 ~80% |
| 축1 + 축2 같은 방향, 축2 N≥30 | **추천** (내부 데이터 medium confidence + 원론 보강) | CLT 적용, 평균 신뢰구간 계산 가능 |
| 축1 + 축2 반대 방향, 축2 N≥100 | **축2 우선** (내부 데이터 우선 신뢰) | 큰 표본 → 높은 검정력 |
| 축1 + 축2 반대 방향, 축2 N≥30 | **축2 우선하되 축1 참고 병기** (lift_ci_lower > 0 확인) | 중간 표본 → 효과크기 중간 이상만 신뢰 |
| 축2 N<30 | **축1 + 축3 조합** (원론 + 글로벌 벤치마크로 보정 필수) | CLT 미적용, 표본분포 정규 근사 불가 |
| 축2 + 축3 같은 방향 | **데이터 기반 강력 추천** | 내부 + 글로벌 교차 검증 |
| 축3만 존재 (축2 없음) | **"글로벌 벤치마크 기준" 명시** | $1.3B 데이터, 외부 벤치마크 |

### 3.6 ★성과역추적 — Performance Backtracking (v2 신규)

> **핵심 아이디어**: 영상을 그냥 보고 "이게 문제다"라고 하면 정확하지 않다. 하지만 우리에겐 **벤치마크와 실제 성과 데이터가 이미 있다.** 문제 정의를 먼저 하고, Gemini에게 "이 문제의 원인을 소재에서 찾아라"고 지시하면 훨씬 정확한 진단이 나온다.

**왜 필요한가:**

대부분의 광고는 이미 성과 데이터를 가지고 있다. 5축 분석이 소재를 보고 문제를 "추측"하는 순방향이라면, 성과역추적은 **성과가 이미 답을 알려주고 있으니 그걸 기반으로 역추적해서 문제점을 콕 집는 것**이다. Gemini가 맹목적으로 소재를 분석하는 게 아니라, "네 CTR이 벤치마크 대비 -65%다, 왜 그런지 찾아라"라고 문제를 먼저 정의해주는 구조.

예시:
```
광고 A의 성과:
  3초시청률: 벤치마크 대비 +12% (양호)
  참여율:    벤치마크 대비 -8% (보통)
  CTR:       벤치마크 대비 -42% (심각) ← 성과역추적 약점 #1
  구매전환율: 벤치마크 대비 -35% (심각) ← 성과역추적 약점 #2

→ CTR에 영향 주는 속성: text.cta_text, visual.cta_position, visual.layout
→ 구매전환율에 영향 주는 속성: text.offer_text, visual.social_proof, text.urgency
→ 처방을 이 6개 속성에 집중 (5축 분석의 14개 속성 중 우선순위 자동 결정)
```

**5축 분석과의 관계:**

| 구분 | 5축 분석 (순방향) | 성과역추적 (역방향) |
|------|------------------|-------------------|
| **시작점** | 소재 자체 (이미지/영상) | 성과 데이터 (CTR, ROAS 등) |
| **Gemini 지시** | "이 소재를 분석해줘" | "이 소재의 CTR이 -65%다. 왜 그런지 소재에서 원인을 찾아라" |
| **정확도** | Gemini가 문제를 추측 → 정확도 낮을 수 있음 | 문제가 확정된 상태 → 원인만 찾으면 됨 → 정확도 높음 |
| **강점** | 성과 데이터 없어도 분석 가능 (신규 소재) | 문제 정의가 명확 → Gemini가 헛발질 안 함 |
| **약점** | 14개 속성을 맹목적으로 동일 분석 | 성과 데이터 없으면 불가 |

**교차 검증 — 처방 우선순위 boost:**

5축 분석에서도 약점이고, 성과역추적에서도 약점인 속성은 **priority boost** 적용:
```
5축 약점:     visual.hook_type (백분위 18%)
성과역추적 약점: 3초시청률 벤치마크 대비 -30% → visual.hook_type에 영향
→ 교차 약점 → Top 3 처방에서 1순위 확정
```

**로직 (STEP 9):**

```
1. ad_insights_classified에서 해당 광고의 13개 지표 조회
2. benchmarks 테이블에서 동일 creative_type × category의 ABOVE_AVERAGE 기준값 조회
3. deviation_rate = (actual - benchmark) / benchmark × 100
4. worst 3 지표 추출 (deviation_rate가 가장 낮은 3개)
5. METRIC_GROUPS(metric-groups.ts)로 지표 → 성과 그룹 매핑
   - foundation 약점: 3초시청률, 완시청률, 리텐션 → 감각·사고 단계 이탈
   - engagement 약점: 참여율, 댓글, 공유 → 사고 단계 이탈
   - conversion 약점: CTR, 구매전환율, ROAS → 행동 단계 이탈
6. ATTRIBUTE_AXIS_MAP으로 성과 그룹 → 소재 속성 역매핑
7. reach_to_purchase_rate 분해: 고객여정 4단계 중 어디서 가장 이탈하는지 특정
```

**출력 JSON:**
```json
{
  "performance_backtrack": {
    "worst_metrics": [
      { "metric": "ctr", "actual": 1.2, "benchmark": 3.48, "deviation": -65.5, "group": "conversion" },
      { "metric": "reach_to_purchase_rate", "actual": 0.01, "benchmark": 0.04, "deviation": -75.0, "group": "conversion" },
      { "metric": "engagement_per_10k", "actual": 15.3, "benchmark": 27.0, "deviation": -43.3, "group": "engagement" }
    ],
    "video_raw": {
      "p3s": 45.2, "p25": 31.0, "p50": 18.5, "p75": 9.2, "p100": 4.1,
      "avg_time_sec": 6.3
    },
    "deepgaze_per_sec": [
      { "sec": 1, "top_fixation": { "x": 0.5, "y": 0.3 }, "cta_visible": false, "intensity": 0.8 },
      { "sec": 2, "top_fixation": { "x": 0.4, "y": 0.5 }, "cta_visible": false, "intensity": 0.6 }
    ],
    "scene_analysis": {
      "ffmpeg_boundaries": [0, 2.3, 7.0, 13.0, 20.8, 30.3],
      "per_second": [{"sec": 0, "content": "여성 클로즈업"}, {"sec": 1, "content": "제품 등장"}],
      "scenes": [{"time": "0-2.3초", "type": "hook", "desc": "여성 클로즈업+제품"}, {"time": "2.3-7.0초", "type": "demo", "desc": "사용 장면"}]
    },
    "meta_rankings": {
      "quality": "ABOVE_AVERAGE",
      "engagement": "BELOW_AVERAGE",
      "conversion": "BELOW_AVERAGE"
    },
    "gemini_diagnosis": "★ Gemini가 판단 — 이탈 지점, 씬 매칭, 속성 역매핑 모두 여기에 출력",
    "affected_attributes": ["text.cta_text", "visual.cta_position", "visual.social_proof", "text.urgency"],
    "focus_stage": "행동(클릭)",
    "focus_reason": "conversion 그룹 지표 2개가 벤치마크 대비 -65%~-75% + Meta conversion_ranking=BELOW → 클릭→구매 단계 집중 개선 필요",
    "journey_breakdown": {
      "감각": { "status": "양호", "metrics": { "video_p3s_rate": "+12%", "thruplay_rate": "+5%" } },
      "사고": { "status": "보통", "metrics": { "engagement_per_10k": "-43%", "comments_per_10k": "-61%" } },
      "행동_클릭": { "status": "심각", "metrics": { "ctr": "-65%", "click_to_checkout_rate": "-48%" } },
      "행동_구매": { "status": "심각", "metrics": { "reach_to_purchase_rate": "-75%", "roas": "-52%" } }
    },
    "cost_signals": {
      "cpm": { "actual": 12500, "benchmark": 8200, "deviation": "+52%", "meaning": "Ad Quality↓ → 노출 비용 상승" },
      "frequency": { "actual": 3.8, "threshold": 3.0, "meaning": "과다노출 → 광고 피로도 가능성" }
    }
  }
}
```

**성과 데이터가 없는 경우:**
- 신규 소재(아직 노출 안 됨) → 성과역추적 스킵, 5축 순방향 분석으로 fallback
- 노출 N<100 → 성과역추적 confidence=low 표시, 5축 분석 우선
- 영상이 아닌 이미지 소재 → video_dropoff_curve 생략, 나머지 지표만 역추적

---

## 4. Andromeda + GEM Meta 로직 역추적 (★핵심 신규 섹션)

### 4.1 Andromeda — Meta 광고 추천 시스템

Andromeda는 Meta가 광고를 사용자에게 노출하는 **추천 시스템의 핵심**이다. 수십억 후보 광고에서 최적 매칭을 찾는 3단계 프로세스:

```
┌─────────────────────────────────────────────────────────┐
│                  Andromeda 3단계                         │
│                                                         │
│  ① Retrieval (후보군 선정)                               │
│     1,000만+ 광고 → 10만 후보                            │
│     ├─ Entity ID 기반 클러스터링                         │
│     ├─ 사용자 관심사 × 광고 카테고리 매칭                │
│     └─ 유사도 높은 소재끼리 그룹핑 → 같은 풀에서 경쟁    │
│                                                         │
│  ② Ranking (순위 결정)                                   │
│     10만 후보 → 최종 노출 순위                           │
│     ├─ Light Ranker: 빠른 1차 필터링                     │
│     └─ Heavy Ranker (GEM): LLM급 정밀 랭킹              │
│                                                         │
│  ③ Auction (입찰)                                        │
│     최종 순위 × 입찰가 → 노출 결정                      │
│     총 가치 = Bid × EAR × Ad Quality + User Value       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 GEM (Generative Ads Recommendation Model)

Meta의 **LLM 스케일 광고 추천 파운데이션 모델**. Heavy Ranker 단계에서 사용.

```
GEM 아키텍처 3개 모듈:

┌─ Wukong (피처 추출) ────────────────────────┐
│  비순서 특성 처리                             │
│  ├─ 사용자 인구통계 + 관심사                  │
│  ├─ 광고 형식 + 소재 내용                     │
│  ├─ 광고주 목표 (전환/인지/트래픽)            │
│  └─ Stackable Factorization으로 교차 학습     │
└──────────────────────────────────────────────┘
              │
              ▼
┌─ Pyramid-Parallel (멀티태스크) ─────────────┐
│  순서 특성 처리                               │
│  ├─ 사용자 행동 시퀀스 (수천 개)             │
│  ├─ 기존 10~20개 → 수천 개로 확장            │
│  └─ 시퀀스 길이별 병렬 처리 (Pyramid 구조)    │
└──────────────────────────────────────────────┘
              │
              ▼
┌─ InterFormer (유저-광고 상호작용) ───────────┐
│  정적 프로필 + 행동 시퀀스 교차 분석          │
│  ├─ Interleaving 방식으로 통합               │
│  ├─ 결과: Instagram 전환 +5%                 │
│  └─         Facebook Feed 전환 +3%           │
└──────────────────────────────────────────────┘
```

### 4.3 EAR (Estimated Action Rate) — 처방의 최종 목적함수

GEM의 핵심 출력값. 사용자가 특정 액션(클릭/구매/좋아요 등)을 할 **확률 예측**.

```
총 가치 = Bid × EAR × Ad Quality + User Value

여기서:
  Bid           = 광고주 입찰가 (우리가 관여 불가)
  EAR           = 사용자가 액션할 확률 (소재 품질에 직결 ★)
  Ad Quality    = 소재 품질 점수 (시선, 참여율, 부정 피드백 등)
  User Value    = 사용자 가치 (Meta 내부 산정)
```

#### 🎯 핵심 지표: 노출당구매확률 (`reach_to_purchase_rate`)

> **총가치각도기에서 가장 중요한 지표는 `reach_to_purchase_rate`(노출당구매확률)이다.**

Meta의 EAR이 본질적으로 측정하는 것은 **"이 노출 1회에서 구매가 발생할 확률"**이다. 이것이 바로 `reach_to_purchase_rate`다.

**구매전환율(`click_to_purchase_rate`)이 아닌 이유:**
- 구매전환율 = 클릭한 사람 중 구매한 비율 → CTR이 낮으면 소수 클릭자 중 구매 비율이 높아져 **왜곡**됨
- 예: CTR 0.3%인데 구매전환율 10% → 좋아 보이지만, 노출 대비 구매확률은 0.03%에 불과
- 반대로 CTR 3%에 구매전환율 1% → 노출당구매확률 0.03%로 동일

**노출당구매확률이 공정한 이유:**
- 노출(impression)은 모든 소재에 동일한 출발점 → **상대평가 가능한 유일한 기준**
- 빈도(frequency)나 확률(probability)은 절대값이므로 소재 간 직접 비교 가능
- Meta 경매에서 Bid × EAR 계산 시 EAR이 이 확률 → **높을수록 더 싸게 더 많이 노출**

**처방 시스템에서의 의미:**
- 모든 처방의 최종 목표 = `reach_to_purchase_rate` 향상
- 감각→사고→클릭→구매 4단계는 이 확률의 **분해 요소**
- `reach_to_purchase_rate = 3초시청률 × 참여유도율 × CTR × 구매전환율` (근사)
- 각 단계 처방은 이 곱의 한 항을 올리는 것

```
Meta 경매 우선순위 결정:
  노출당구매확률(EAR) ↑ → 같은 Bid로 더 많은 노출 확보
  노출당구매확률(EAR) ↓ → CPM 상승 + 노출 감소 + ROAS 하락

∴ 처방의 최종 목적함수 = reach_to_purchase_rate 극대화
```

**EAR에 영향을 주는 소재 요소** (우리가 분석 가능한 것):

| 요소 | EAR 영향 경로 | 우리 5축 매핑 | 가중치 |
|------|-------------|-------------|:------:|
| Hook 강도 (첫 3초) | 3초시청률↑ → 노출당구매확률 첫 관문 | hook 축 | 0.8 |
| CTA 명확성 | CTR↑ → 클릭 확률↑ → 구매 기회↑ | text.cta_text | 0.9 |
| 감정 유발 | 참여율↑ → Ad Quality↑ → 노출 우선순위↑ | psychology.emotion | 0.7 |
| 긴급성 | 전환율↑ → 노출당구매확률 직접 상승 | psychology.urgency | 0.7 |
| 시각적 품질 | 부정 피드백↓ → Ad Quality↑ → CPM↓ | quality 축 | 0.6 |
| 소재 다양성 | Andromeda Retrieval 통과 → 노출 기회 확보 | 유사도 분석 | — |

### 4.4 Andromeda 유사도 — 광고계정 전체 단위 분석

> **v2 핵심 변경**: 개별 소재 단위가 아니라 **광고계정 전체 포트폴리오** 관점으로 분석.
> "이 계정은 소재가 다 비슷해서 reach 페널티 받고 있다" → **계정 레벨 처방** 생성.

현재 코드베이스의 `scripts/compute-andromeda-similarity.mjs`가 이미 **계정 단위**로 동작한다 (같은 `account_id` 내 소재 간 pairwise 비교).

**4축 가중 Jaccard 유사도:**

```javascript
// 이미지 (audio 없음): visual 47% + text 35% + structure 18%
return visual * 0.47 + text * 0.35 + structure * 0.18;

// 영상 (audio 있음): visual 40% + text 30% + audio 15% + structure 15%
return visual * 0.4 + text * 0.3 + audio * 0.15 + structure * 0.15;
```

| 핑거프린트 축 | 이미지 가중치 | 영상 가중치 | 소스 |
|--------------|:-----------:|:---------:|------|
| visual_fingerprint | 47% | 40% | 픽셀 구성, 색상 팔레트, 레이아웃 |
| text_fingerprint | 35% | 30% | 메시지 컨셉, CTA 문구, 감정 톤 |
| audio_fingerprint | — | 15% | 나레이션 톤, BGM 장르, 효과음 |
| structure_fingerprint | 18% | 15% | 텍스트 배치, CTA 위치, 프레임 구성 |

**임계값:**

| 유사도 | 의미 | 처방 액션 |
|:------:|------|----------|
| < 0.40 | 충분히 다름 | 없음 |
| 0.40 ~ 0.59 | 부분 유사 | 모니터링 권장 |
| **0.60 ~ 0.79** | **다양성 경고** | "이 소재는 기존 소재와 유사. 시각적 차별화 검토" |
| **0.80 ~ 0.91** | **강력 경고** | "Andromeda가 같은 Entity로 묶을 가능성 높음. 소재 교체 권장" |
| **≥ 0.92** | **소재 다양화 시급** | "reach 페널티 발생 중. 새로운 각도의 소재 즉시 제작" |

**PDA (Persona × Desire × Awareness) 매핑:**

처방에서 소재 다양화를 권장할 때, 단순히 "다르게 만드세요"가 아니라 PDA 프레임으로 구체적 방향 제시:

| 축 | 질문 | 처방 적용 |
|-----|------|----------|
| **P**ersona | 누구에게 말하는가? | "현재 모든 소재가 20대 여성 타겟. 30대 직장인 버전 제작 권장" |
| **D**esire | 어떤 욕구를 자극하는가? | "가격 혜택 앵글만 3개. 편의성/시간절약 앵글 추가" |
| **A**wareness | 인지 수준은? | "모든 소재가 '제품 소개' 수준. 문제 인식 단계 소재 부족" |

### 4.5 Andromeda 시사점 → 계정 레벨 처방 반영

> **3계층 유사도 패널티 감지** (`creative-analysis-framework.md` 섹션 1.5 기반):
> 1단계 도달감소 → 2단계 노출제한 → 3단계 경매차단

| Andromeda 메커니즘 | 우리 시스템 감지 (계정 전체) | 계정 레벨 처방 |
|-------------------|--------------------------|--------------|
| 유사도 > 0.60 → 같은 Entity 그룹 | `compute-andromeda-similarity.mjs`로 계정 내 전체 pairwise 비교 | "계정 전체 소재 다양성 부족 — 클러스터 N개 중 M개가 중복" + PDA 기반 구체적 방향 |
| 유사도 > 0.92 → reach 페널티 (3단계 경매차단) | 유사도 임계값 초과 소재 쌍 자동 감지 | "경매 차단 위험 — 소재 A/B/C가 동일 Entity 취급. 즉시 교체 필요" |
| 다양성 점수 (★v2 신규) | 클러스터 수 / 총 소재 수 (`creative-analysis-framework.md` 축5.5) | "다양성 점수 40/100 — Meta 권장 8~20개 컨셉 대비 3개 클러스터" |
| Learning phase (초기 불안정) | 소재 생성일 기준 (7일 이내) | "소재가 아직 학습 중 (D+3). 조기 판단 주의" |
| Frequency suppression (빈도 피로) | `compute-fatigue-risk.mjs` 활용 | "빈도 피로 감지 — 새 소재 교체 시점" |
| 클러스터 포화 (2단계 노출제한) | 계정 내 동일 클러스터 소재 수 카운팅 | "같은 앵글 소재 N개 → 클러스터당 3개 이하로 축소" |

### 4.6 처방에서의 Andromeda 활용 — 계정 전체 포트폴리오 (v2 신규)

```
[입력 — 계정 전체]
├─ 해당 account_id의 전체 활성 소재 4축 핑거프린트 (visual/text/audio/structure)
├─ 각 소재의 embedding (3072D)
└─ 벤치마크 상위 소재의 핑거프린트

[분석 — 계정 레벨]
├─ 계정 전체 유사도 매트릭스 (pairwise)
│   └─ "이 계정은 소재 15개 중 8개가 유사도 0.60+ 클러스터"
├─ 3계층 패널티 감지
│   ├─ 1단계 (도달감소): 유사도 0.60~0.79 → "같은 Entity 내 내부 경쟁"
│   ├─ 2단계 (노출제한): 유사도 0.80~0.91 → "클러스터 포화"
│   └─ 3단계 (경매차단): 유사도 ≥ 0.92 → "Andromeda retrieval 제외 위험"
├─ 다양성 점수 = 클러스터 수 / 총 소재 수 (Meta 권장: 8~20개 컨셉)
└─ 벤치마크 대비 포트폴리오 분석
    └─ "top 계정들은 평균 12개 컨셉 운영. 이 계정은 3개"

[출력 — 계정 레벨]
├─ andromeda_warning: { level: "high", message: "...", similar_pairs: [...], penalty_layer: 2 }
├─ diversity_score: 40
└─ portfolio_recommendation: { current_clusters: 3, recommended: "8~12", missing_angles: [...] }
```

유사 소재 검색은 `creative_media.embedding` (vector(3072)) 기반 코사인 유사도로 수행.
기존 `compute-andromeda-similarity.mjs`가 이미 계정 단위(같은 `account_id`)로 동작.
프론트엔드에서는 `search_similar_creatives()` RPC 활용 (`src/app/api/creative/search/route.ts`).

---

## 5. DeepGaze → Gemini 결합 파이프라인

### 5.1 현재 구현체

| 구현체 | 파일 | 역할 |
|--------|------|------|
| DeepGaze 배치 | `src/app/api/cron/creative-saliency/route.ts` | Cloud Run DeepGaze 서비스 호출 → saliency_url 저장 |
| DeepGaze-Gemini 결합 | `src/app/api/cron/deepgaze-gemini/route.ts` | saliency_url + 소재 원본 → Gemini 결합 분석 |
| 시선 배치 트리거 | `scripts/trigger-saliency-batch.mjs` | Cloud Run /saliency 엔드포인트 호출 |
| 점수 백분위 | `scripts/compute-score-percentiles.mjs` | 5축 분석 결과 → 카테고리별 백분위 계산 |

### 5.2 DeepGaze IIE 출력 데이터

`creative_saliency` 테이블:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `ad_id` | TEXT | 광고 ID |
| `account_id` | TEXT | 계정 ID |
| `target_type` | TEXT | 'image' / 'video' |
| `cta_attention_score` | NUMERIC | CTA 주목도 (0~1) |
| `cognitive_load` | NUMERIC | 인지 부하 (0~1) |
| `top_fixations` | JSONB | 주요 시선 고정점 배열 `[{x, y, ratio}]` |
| `attention_map_url` | TEXT | 히트맵 이미지 URL (GCS) |
| `analyzed_at` | TIMESTAMPTZ | 분석 시각 |

**영상 추가 데이터:**
- `video_saliency_frames`: 1초별 시선 흐름 (프레임별 fixation, 시선 이동 패턴)
- `video_analysis`: 영상 전체 시선 분석 결과

### 5.3 결합 분석 흐름

```
DeepGaze IIE 시선 데이터
  ├─ 히트맵 (attention_map_url)
  ├─ fixation points (top_fixations)
  ├─ CTA attention score (cta_attention_score)
  └─ cognitive load (cognitive_load)
       │
       ▼
Gemini 3 Pro Preview 결합 분석
  ├─ 입력: 소재 원본 (멀티모달) + DeepGaze 시선 JSON + 히트맵 이미지
  ├─ 분석: "사람이 실제로 어디를 보는지" + "그래서 효과적인지"
  └─ 출력: analysis_json (5축 + deepgaze_context)
```

### 5.4 시선 기반 처방 생성 (v2 신규)

DeepGaze 시선 데이터를 처방에 직접 활용:

| 시선 데이터 | 처방 적용 예시 |
|------------|---------------|
| CTA attention score 23% (평균 45%) | "CTA 주목도가 평균의 절반. CTA 위치를 시선 집중 영역(중앙 상단)으로 이동" |
| Cognitive load 0.85 (high) | "시각적 복잡도가 높아 인지 부하 과다. 요소 정리 필요 (현재 텍스트 3줄 → 1줄로 축소)" |
| Top fixation이 제품이 아닌 배경 | "시선이 배경에 집중. 제품을 시선 집중 영역(x:0.45, y:0.30)으로 이동" |
| 시선 동선이 CTA에 도달하지 않음 | "시선 흐름이 CTA까지 이어지지 않음. 시선 유도 요소(화살표/그라데이션) 추가" |

---

## 6. 5축 분석 (analysis_json) 상세 구조

### 6.1 analysis_json v3 스키마

```json
{
  "visual": {
    "color_scheme": "warm | cool | neutral | vibrant | muted",
    "product_visibility": "high | medium | low | none",
    "color": {
      "contrast": "high | medium | low"
    }
  },
  "text": {
    "headline": "실제 헤드라인 텍스트",
    "headline_type": "benefit | curiosity | question | shock | problem | none",
    "cta_text": "CTA 문구",
    "key_message": "핵심 메시지 (한국어)",
    "readability": "high | medium | low",
    "social_proof": {
      "review_shown": true | false,
      "before_after": true | false,
      "testimonial": true | false,
      "numbers": true | false
    }
  },
  "psychology": {
    "emotion": "fear | joy | surprise | trust | anticipation | sadness | anger | neutral",
    "social_proof_type": "testimonial | numbers | celebrity | expert | none",
    "urgency": "timer | limited | seasonal | fomo | none",
    "authority": "expert | celebrity | brand | data | none"
  },
  "quality": {
    "production_quality": "professional | semi | ugc | low",
    "brand_consistency": "high | medium | low",
    "readability": "high | medium | low"
  },
  "hook": {
    "hook_type": "problem | curiosity | benefit | shock | question | confession | contrast | relatability | none",
    "visual_style": "ugc | professional | minimal | bold | lifestyle | before_after",
    "composition": "center | rule_of_thirds | split | layered | full_bleed"
  },
  "attention": {
    "cta_attention_score": 0.0,
    "primary_focus": "시선 집중 영역 설명",
    "gaze_pattern": "시선 동선 패턴"
  },
  "audio": {
    "has_narration": true | false,
    "narration_tone": "professional | casual | energetic | calm",
    "bgm_genre": "upbeat | calm | dramatic | trendy | none",
    "sound_effects": true | false
  },
  "structure": {
    "scene_count": 0,
    "avg_scene_duration": 0.0,
    "pacing": "fast | medium | slow",
    "transition_pattern": "hook→demo→CTA | problem→solution→CTA | ...",
    "loop_structure": true | false
  },
  "deepgaze_context": {
    "cta_attention_score": 0.12,
    "dominant_region": "center",
    "top_fixation": { "x": 0.45, "y": 0.3, "ratio": 0.18 }
  },
  "andromeda_signals": {
    "visual_fingerprint": "warm-product-center-closeup-...",
    "text_fingerprint": "benefit-discount-cta_buy-...",
    "audio_fingerprint": "upbeat-narration_female-...",
    "structure_fingerprint": "hook_benefit-demo-cta_bottom-...",
    "similar_creatives": [
      { "creative_id": "...", "similarity": 0.87, "overlap_axes": ["visual", "text"] }
    ]
  },
  "scores": {
    "visual_impact": 72,
    "message_clarity": 65,
    "cta_effectiveness": 48,
    "social_proof_score": 20,
    "overall": 51
  }
}
```

### 6.2 scores 계산 로직 (compute-score-percentiles.mjs)

| 점수 | 구성 | 가중치 |
|------|------|--------|
| visual_impact | CTA attention × 0.4 + production_quality × 0.3 + color contrast × 0.3 | — |
| message_clarity | key_message 존재 25 + cta_text 존재 25 + headline_type 20 + readability 30 | — |
| cta_effectiveness | attention.cta_attention_score × 100 | — |
| social_proof_score | social_proof 요소 존재 시 80, 없으면 20 | — |
| overall | 위 4개 평균 (카테고리별 MIN_SAMPLE=50 적용) | — |

---

## 7. ATTRIBUTE_AXIS_MAP — 14 속성 × 성과 그룹 매핑

`src/lib/protractor/metric-groups.ts`에 정의된 single source of truth.

### 7.1 매핑 테이블

| # | 속성 (attribute) | 한글명 | 5축 | 영향 성과 그룹 | 가중치 |
|:-:|-----------------|--------|-----|--------------|:------:|
| 1 | `hook.hook_type` | 훅 유형 | hook | foundation | 0.8 |
| 2 | `hook.visual_style` | 비주얼 스타일 | hook | foundation, engagement | 0.6 |
| 3 | `hook.composition` | 구도 | hook | foundation | 0.5 |
| 4 | `visual.color_scheme` | 색상 구성 | visual | foundation | 0.4 |
| 5 | `visual.product_visibility` | 제품 노출 | visual | foundation, conversion | 0.6 |
| 6 | `text.headline` | 헤드라인 | text | engagement | 0.5 |
| 7 | `text.cta_text` | CTA 문구 | text | conversion | **0.9** |
| 8 | `text.readability` | 가독성 | text | foundation, engagement | 0.5 |
| 9 | `psychology.emotion` | 감정 유발 | psychology | engagement | 0.7 |
| 10 | `psychology.social_proof` | 사회적 증거 | psychology | conversion | 0.6 |
| 11 | `psychology.urgency` | 긴급성 | psychology | conversion | 0.7 |
| 12 | `psychology.authority` | 권위 | psychology | engagement, conversion | 0.4 |
| 13 | `quality.production_quality` | 제작 품질 | quality | foundation | 0.6 |
| 14 | `quality.brand_consistency` | 브랜드 일관성 | quality | foundation, conversion | 0.4 |

### 7.2 성과 그룹 정의 (METRIC_GROUPS)

| 그룹 | 한글명 | 지표 |
|------|--------|------|
| **foundation** | 기반점수 | 3초시청률, ThruPlay율, 지속비율 |
| **engagement** | 참여율 | 좋아요/만노출, 댓글/만노출, 공유/만노출, 저장/만노출, 참여합계/만노출 |
| **conversion** | 전환율 | CTR, 결제시작율, 구매전환율, 결제→구매율, 노출당구매확률, ROAS |

### 7.3 가중치 활용

- **weight ≥ 0.7**: 해당 속성이 성과에 미치는 영향이 크므로 **처방 우선순위 상향**
- **weight < 0.5**: 보조 근거로 활용, 단독 처방은 낮은 우선순위
- Phase 2에서 회귀분석으로 데이터 기반 보정 예정 (현재는 도메인 지식 기반)

---

## 8. 고객 여정 4단계 매핑 (Smith님 비전)

> "메타 광고 = 광고 → 랜딩 → 구매까지 이어지는 확률 게임. 각 단계에서 이탈률을 줄이는 게 핵심."

### 8.1 매핑 테이블

> **최종 목적함수**: `reach_to_purchase_rate`(노출당구매확률) = 아래 4단계의 곱
> 각 단계 처방은 이 곱의 한 항을 올리는 것이다.

| 여정 | 성과 그룹 | 관련 5축 | 핵심 지표 | 노출당구매확률 기여 | 처방 초점 |
|------|----------|---------|----------|:------------------:|----------|
| **감각** (보고+듣고) | foundation | hook, visual, quality | 3초시청률, ThruPlay율 | 첫 관문 (시청 확률) | 첫 인상, 시선 확보, 제품 노출 |
| **사고** (느끼고+판단) | engagement | psychology, text | 좋아요, 댓글, 공유 | Ad Quality↑ → CPM↓ | 감정 유발, 사회적 증거, 신뢰 |
| **행동-클릭** | conversion (상위) | text(CTA), psychology(urgency) | CTR, 결제시작율 | 클릭 확률 (EAR 직접 입력) | CTA 명확성, 긴급성, 혜택 명시 |
| **행동-구매** | conversion (하위) | LP 일관성, quality | **노출당구매확률**, ROAS | **최종 결과** (EAR 본질) | LP 메시지 일관성, 브랜드 신뢰 |

### 8.2 여정별 이탈률 감소 전략

```
감각 (3초시청률)
  이탈 원인: 훅 약함, 시선 분산, 첫 프레임 무의미
  처방 방향: hook_type 변경, 제품 클로즈업, 대비 강화
  EAR 영향: ★★★★★ (3초시청률이 EAR 입력의 최대 가중치)
     │
     ▼ 살아남은 사용자
사고 (참여율)
  이탈 원인: 감정 연결 실패, 신뢰 부족, 공감 부재
  처방 방향: 사회적 증거 추가, 감정 톤 변경, 스토리텔링
  EAR 영향: ★★★★☆ (참여율이 Ad Quality에 직결)
     │
     ▼ 관심을 가진 사용자
행동-클릭 (CTR)
  이탈 원인: CTA 불명확, 혜택 불분명, 클릭 동기 부재
  처방 방향: CTA 구체화, 긴급성 추가, 가격/혜택 명시
  EAR 영향: ★★★★★ (CTR이 EAR의 직접 입력)
     │
     ▼ 클릭한 사용자
행동-구매 (노출당구매확률 = 최종 결과)
  이탈 원인: LP 불일치, 결제 마찰, 신뢰 부족
  처방 방향: LP 메시지 일관성, 브랜드 일관성
  EAR 영향: ★★★★★ (reach_to_purchase_rate = EAR의 본질이자 처방의 최종 목적함수)
  ※ 구매전환율(click_to_purchase_rate)이 아님 — CTR 왜곡 문제
  ※ 노출당구매확률만이 소재 간 공정 비교 가능한 절대지표
```

---

## 9. 벤치마크 소재 수집 기준

`scripts/collect-benchmark-creatives.mjs` — Meta API에서 성과 상위 소재를 자동 수집.

### 9.1 선정 기준

| 지표 | 임계값 | 태그 |
|------|:------:|------|
| video_p3s_rate | > 25.81% | `hook` |
| ctr | > 3.48% | `click` |
| engagement_per_10k | > 27.0 | `engage` |
| 위 3개 모두 충족 | — | `allstar` |

### 9.2 수집 규격

- `source='benchmark'`, `is_benchmark=true`
- Meta API Creative 정보 + 미디어 다운로드 → GCS 저장
- LP URL → `landing_pages` 테이블 연결
- 형식별 `MEDIAN_ALL` 참여율 + 전환순위 기준 자동 태깅

### 9.3 현재 규모

- 벤치마크 소재: **24건** (IMAGE 16 + VIDEO 8)
- 추후 확대: 주 1회 collect-benchmark-creatives 크론 실행으로 자동 축적

---

## 10. 처방 생성 프로세스 — v2 확장 (Gemini 1회 통합, 13단계)

> **핵심 변경**: 기존 MVP는 5축 배치를 별도로 실행한 후 처방 생성 시 Gemini를 다시 호출하는 2회 호출 구조였다. v2는 **Gemini 1회 호출로 5축 분석 + 속성 태깅 + 씬별 분석 + 처방 Top3을 동시에 생성**하는 통합 구조로 전환한다.
>
> - **비용 절반**: Gemini 2회 → 1회
> - **속도 2배**: 직렬 2회 호출 → 병렬 없이 1회로 완결
> - **5축 배치가 별도로 필요 없음**: 처방 파이프라인 1회 호출이 5축+처방 통합
> - 이미 `TASK-ANALYSIS-BATCH.md`에서 이 구조를 설계·검증 완료

### 10.1 Gemini 1회 통합 출력 구조

```json
{
  "five_axis": { "visual": {}, "text": {}, "psychology": {}, "quality": {}, "attention": {}, "audio": {} },
  "attributes": ["ugc", "curiosity", "timer", ...],
  "retention_curve": {
    "dropoff_points": [
      { "time": "15.5초", "scene": 3, "retention": "36%", "prev_retention": "64%", "drop": "28%p" }
    ],
    "scene_diagnosis": [
      { "scene": 3, "problem": "텍스트 과다 + 비주얼 임팩트 부족", "benchmark_diff": "벤치마크 상위는 제품 시연 장면" }
    ]
  },
  "scenes": [
    { "time": "0-3s", "stage": "hook", "saw": "...", "heard": "...", "felt": "...", "eye_tracking": {}, "prescription": {} }
  ],
  "top3_prescriptions": [
    { "rank": 1, "action": "...", "stage": "감각", "expected": "+15% 3초시청률", "evidence_axis1": "...", "evidence_axis23": "...", "difficulty": "쉬움", "performance_driven": true }
  ],
  "performance_backtrack": {
    "worst_metrics": [
      { "metric": "ctr", "actual": 1.2, "benchmark": 3.48, "deviation": -65.5, "group": "conversion" }
    ],
    "affected_attributes": ["text.cta_text", "visual.cta_position"],
    "focus_stage": "행동(클릭)",
    "journey_breakdown": {
      "감각": { "status": "양호", "deviation": "+12%" },
      "사고": { "status": "보통", "deviation": "-43%" },
      "행동_클릭": { "status": "심각", "deviation": "-65%" },
      "행동_구매": { "status": "심각", "deviation": "-75%" }
    }
  }
}
```

### 10.2 플로우 다이어그램

```
요청: POST /api/protractor/prescription { creative_media_id }

[인증/권한] requireProtractorAccess() + verifyAccountOwnership()

STEP 1: 소재 원본 + 메타데이터 조회
  └─ creative_media: 이미지/영상 원본 (멀티모달 입력)
  └─ ad_copy, media_type, category 확인

STEP 2: 시선 데이터 조회 (DeepGaze — 사전 배치 완료)
  └─ creative_saliency: cta_attention_score, cognitive_load, top_fixations
  └─ 영상: video_saliency_frames (1초별 시선 흐름)
  └─ 영상: video-scene-analysis 크론 결과 (ffmpeg 씬 경계 감지 → Gemini 의미 분할, analysis_json.scene_analysis)
  └─ 없으면 graceful fallback (시선/씬 없이 진행)

STEP 3: 성과 데이터 + 벤치마크 대비 조회
  └─ daily_ad_insights: CTR, ROAS, 3초시청률, 참여율, 완시청률
  └─ 각 지표별 벤치마크 대비 차이(%)
  └─ 영상: 재생 이탈 곡선 (p3s/p25/p50/p75/p100 → 초수 환산 → 씬 매칭)

STEP 4: prescription_patterns 조회 (축2)
  └─ attribute + value 조합 → 성과 패턴
  └─ 카테고리 fallback 적용 (N<30이면 축3 보정)
  └─ confidence 기반 필터 (high > medium > low)

★ STEP 5: 계정 전체 소재 다양성 분석 (v2 신규 — 계정 레벨)
  └─ 같은 account_id 내 전체 활성 소재와 4축 가중 Jaccard 유사도
  └─ 다양성 점수 = 클러스터 수 / 총 소재 수
  └─ 3계층 유사도 패널티 감지 (도달감소→노출제한→경매차단)
  └─ 유사도 ≥ 0.60 → 다양성 경고 생성
  └─ PDA 프레임 기반 차별화 방향 제시

STEP 6: 유사 벤치마크 소재 Top3 검색
  └─ creative_media.embedding (3072D) 코사인 유사도
  └─ search_similar_creatives() RPC
  └─ Top3의 분석 결과 + 성과 데이터 + 속성 diff 추출

★ STEP 7: Motion 글로벌 벤치마크 조회 (축3, v2 신규)
  └─ prescription_benchmarks에서 media_type + category 매칭
  └─ 대상 소재 지표의 글로벌 백분위 산정
  └─ 축2 데이터 보강 (N<30일 때 축3 Motion 데이터로 보정 필수)

★ STEP 8: GEM/EAR 영향 인자 분석 (v2 신규)
  └─ 어떤 약점 축이 EAR에 가장 큰 영향을 주는지 가중치 기반 분석
  └─ foundation 약점 → "3초시청률↓ → EAR 하락 → 도달↓ → 비용↑"
  └─ conversion 약점 → "CTR↓ → EAR 하락 → 경매 불리"

★ STEP 9: 성과역추적 — 벤치마크 대비 약점 포인트 식별 (v2 신규)

  9-1. 역추적 대상 지표 전수 (daily_ad_insights + ad_insights_classified 기준)
  ──────────────────────────────────────────────────────────────────
  ┌─ 감각 단계 (훅 → 시청 유지)
  │  ├─ video_p3s_rate    — 3초시청률 (노출 대비). 훅 실패 감지
  │  ├─ video_p25         — 25% 시점 시청자 수. 씬 2~3 이탈 감지
  │  ├─ video_p50         — 50% 시점 시청자 수. 메시지 약화 감지
  │  ├─ video_p75         — 75% 시점 시청자 수. CTA 도달 전 이탈 감지
  │  ├─ video_avg_time    — 평균 시청 시간(초). 초 단위 이탈 지점 특정
  │  ├─ thruplay_rate     — 완시청률 (노출 대비). 영상 전체 소화력
  │  ├─ retention_rate    — 지속비율 (p100/p3s). 3초 생존자 중 끝까지 본 비율
  │  └─ cost_per_thruplay — 완시청 단가. 높으면 시청 확보 비효율
  │
  ├─ 사고 단계 (참여 반응)
  │  ├─ engagement_per_10k — 참여 합계/만노출. 종합 참여력
  │  ├─ reactions_per_10k  — 좋아요/만노출. 감정 반응
  │  ├─ comments_per_10k   — 댓글/만노출. 깊은 관여
  │  ├─ shares_per_10k     — 공유/만노출. 바이럴 잠재력
  │  └─ saves_per_10k      — 저장/만노출. 재방문 의도
  │
  ├─ 행동-클릭 단계
  │  ├─ ctr               — 클릭률. EAR 직접 입력
  │  └─ click_to_checkout_rate — 클릭→결제시작. LP 전환력
  │
  ├─ 행동-구매 단계
  │  ├─ click_to_purchase_rate   — 클릭→구매. (CTR 왜곡 주의, 보조 지표)
  │  ├─ checkout_to_purchase_rate — 결제→구매. 결제 마찰 감지
  │  ├─ reach_to_purchase_rate    — ★노출당구매확률. 최종 목적함수
  │  └─ roas                      — 광고비 대비 매출. 비용효율 역추적
  │
  ├─ 전체 품질 (Meta 자체 판정 — 역추적 앵커)
  │  ├─ quality_ranking      — Meta Ad Quality 판정 (ABOVE/AVERAGE/BELOW_AVERAGE)
  │  ├─ engagement_ranking   — Meta 참여율 판정
  │  └─ conversion_ranking   — Meta 전환율 판정
  │
  └─ 비용/노출 효율
     ├─ cpm       — 1,000노출 단가. 높으면 Ad Quality↓ 신호
     ├─ frequency — 빈도. 과다노출 → 광고 피로도 → 성과 하락
     └─ cpp       — 1인당 도달 비용
  ──────────────────────────────────────────────────────────────────

  ★ 역할 분담: 코드 = 데이터 수집, Gemini = 판단
  ──────────────────────────────────────────────────────────────────
  코드가 하는 것 (STEP 9):
    - 성과 지표 전수 수집 + 벤치마크 대비 편차율 계산
    - 시청률 raw 곡선 (p3s/p25/p50/p75/p100, video_avg_time)
    - DeepGaze 1초별 시선 데이터
    - 씬 분할 결과 (video-scene-analysis 크론 — ffmpeg 씬 경계 감지 → Gemini 의미 분할, DB 사전 저장)
    - Meta 랭킹 3종 (quality/engagement/conversion)
    - worst 3 지표 추출

  Gemini가 하는 것 (STEP 11):
    - ★ "어디서 이탈했는지" 판단 — 시청률 곡선 + DeepGaze 1초별 시선
      + 씬 분할 결과를 종합해서 이탈 지점과 원인을 직접 판단
    - ★ "왜 이탈했는지" 진단 — 해당 씬의 소재를 멀티모달로 보면서 원인 특정
    - ★ "어떤 속성이 문제인지" 역매핑 — 성과역추적 문제 정의 기반

  코드가 하지 않는 것 (Gemini에 위임):
    ✗ 이탈 지점 사전 계산 (steepest_drop 등)
    ✗ 씬 ↔ 이탈 매칭 판단
    ✗ 소재 속성 역매핑 (ATTRIBUTE_AXIS_MAP은 참조용으로만 제공)
  ──────────────────────────────────────────────────────────────────

  이유: ffmpeg가 물리적 화면 전환 지점(씬 경계)을 감지하고,
  이 경계 데이터를 Gemini에게 전달하면 Gemini가 초수를 정확히 끊어 의미적 씬 분할을 한다.
  (Gemini 단독 시 "문제→설명→해결" 같은 영상 구성에서 초수 오차 발생 — ffmpeg 경계가 보정)
  DeepGaze도 이미 1초마다 시선 분석하고 있고, video-scene-analysis 크론이
  ffmpeg 경계 기반 씬 분할 결과를 DB에 저장해놨다.
  이 사전 배치 데이터(씬 경계 + 시선)를 처방 Gemini에게 raw로 넘기면
  시선 + 시청률 + 씬 결과를 종합 판단할 수 있다.
  코드에서 "p25→p50 구간이 급감"이라고 미리 판단해서 넘기면
  오히려 Gemini의 판단 범위를 제한하게 됨.

  ★ Meta 랭킹 3종 → 문제 범위 사전 축소 (이건 코드에서 해도 됨 — 단순 분류)
  quality_ranking=BELOW → foundation 약점 확정 (탐색 범위 좁힘)
  engagement_ranking=BELOW → engagement 약점 확정
  conversion_ranking=BELOW → conversion 약점 확정
  → Gemini에게 "Meta가 이미 이 영역이 약하다고 판정했다" 추가 앵커

  9-2. 편차율 계산 + worst 3 추출 (코드)
  └─ benchmarks 테이블에서 동일 creative_type × category의 ABOVE_AVERAGE 기준값 조회
  └─ 각 지표별 벤치마크 대비 편차율(%) 계산:
       deviation = (actual - benchmark) / benchmark × 100
  └─ 편차율 기준 worst 3 지표 추출 → "성과역추적 약점 포인트"

  9-3. Gemini에 넘길 raw 데이터 패키징
  └─ worst_metrics[] (편차율 순)
  └─ video_raw: { p3s, p25, p50, p75, p100, avg_time_sec } (영상만)
  └─ deepgaze_per_sec: 1초별 시선 데이터 배열 (영상만)
  └─ scene_analysis: 씬 분할 결과 — ffmpeg 씬 경계 + per_second[] + scenes[] (video-scene-analysis 크론에서 DB 사전 저장, 영상만)
  └─ meta_rankings: { quality, engagement, conversion }
  └─ all_metrics_with_deviation: 전체 지표 + 편차율
  └─ ★ 이탈 판단, 씬 매칭, 속성 역매핑은 포함하지 않음 — Gemini 위임

STEP 10: Gemini 프롬프트 구성 (★문제 정의 먼저 → 원인 분석 — 1회 통합)

  ★ 성과역추적 = 프롬프트 앵커 (Prompt Anchor)
  ──────────────────────────────────────────────
  LLM에게 "이 소재 분석해줘"(열린 질문)를 던지면 14개 속성을
  고르게 건드리며 진짜 문제가 아닌 것도 문제라고 할 확률이 높다.

  성과역추적은 이 열린 질문을 닫힌 질문으로 바꿔주는 앵커 역할:
  "네 CTR이 벤치마크 대비 -65%다. 왜 그런지 소재에서 원인을 찾아라."

  → Gemini의 탐색 범위가 좁아져 정확도 상승
  → 처방이 실제 성과 개선에 직결 (근거 = 실제 성과 데이터)
  → 수강생 납득 가능 ("왜 이 처방인지" = 실제 내 광고 성과가 근거)

  대부분의 광고는 성과 데이터가 있으므로 성과역추적이 기본 경로.
  성과 없는 신규 소재만 기존 5축 순방향(열린 질문)으로 fallback.
  ──────────────────────────────────────────────

  ┌─ [SECTION 1: 문제 정의 — Gemini가 가장 먼저 읽는 영역]
  │  ├─ ★성과역추적 결과 (STEP 9): "이 광고의 CTR은 벤치마크 대비 -65%다.
  │  │    구매확률은 -75%다. 가장 심각한 문제는 클릭→구매 단계다."
  │  ├─ 여정별 이탈 지도: 감각(+12%) → 사고(-43%) → 클릭(-65%) → 구매(-75%)
  │  └─ 지시: "아래 소재를 분석할 때, 위 문제의 원인을 우선적으로 찾아라"
  │
  ├─ [SECTION 2: 증거 자료 — 소재 + 시선 + 성과]
  │  ├─ 소재 원본 (이미지/영상 멀티모달)
  │  ├─ DeepGaze 시선 데이터 (cta_attention_score, cognitive_load, top_fixations)
  │  ├─ 영상: ffmpeg 씬 경계 + 씬 분할 결과(per_second + scenes, 사전 배치) + 재생 이탈 곡선 (초수 환산)
  │  ├─ 성과 데이터 전체 (13개 지표 + 벤치마크 대비 차이%)
  │  └─ 광고 카피 원문
  │
  ├─ [SECTION 3: 처방 근거 — 3축 데이터]
  │  ├─ 축1: 처방 가이드 고정 삽입 (고객 여정 4단계, 세이프티존, 금지 규칙)
  │  ├─ 축2: prescription_patterns 동적 삽입 (해당 소재 속성 패턴)
  │  ├─ 축3: Motion 글로벌 벤치마크 동적 삽입
  │  └─ GEM/EAR 영향 분석 결과
  │
  └─ [SECTION 4: 참조 — 경쟁 소재 + 다양성]
     ├─ 계정 전체 다양성 분석 결과 (Andromeda)
     └─ 유사 벤치마크 Top3 (분석 결과 + 성과 + diff)

  ★ 핵심: Gemini는 SECTION 1(문제 정의)을 먼저 읽고,
    SECTION 2(소재)에서 그 문제의 원인을 찾고,
    SECTION 3(3축)에서 처방 근거를 가져온다.
    "소재를 보고 문제를 추측"하는 게 아니라
    "문제가 확정된 상태에서 원인을 역추적"하는 구조.

★ STEP 11: Gemini 3 Pro Preview **1회 호출** → 문제→원인→처방 통합 JSON 생성
  └─ 모델: gemini-3-pro-preview
  └─ **프롬프트 지시 순서**: ① 문제 확인 → ② 소재에서 원인 식별 → ③ 5축 점수 → ④ 처방 생성
  └─ **Output 통합**: five_axis + attributes + scenes + retention_curve + top3_prescriptions + ★performance_backtrack
  └─ ★ 처방 Top3는 성과역추적 문제 정의에서 출발 — "CTR이 -65%인 이유는 CTA가 ○○이기 때문"
  └─ 성과 데이터 없는 신규 소재: 문제 정의 섹션 생략 → 기존 5축 분석 순방향으로 fallback
  └─ 영상: 재생 이탈 역추적 (이탈 구간 → 씬 분석 → 벤치마크 비교 → 구간별 처방)
  └─ JSON 스키마 강제 (환각 방지)
  └─ timeout: 15초, retry: 1회

STEP 12: 후처리 — 백분위 계산 + 약점 식별
  └─ five_axis scores → 카테고리별 백분위 산정
  └─ 백분위 하위 30% 이하인 축/속성 감지
  └─ ATTRIBUTE_AXIS_MAP으로 약점 → affectsGroups 매핑
  └─ ★성과역추적 약점과 5축 약점 교차 검증 (둘 다 약점이면 priority boost)
  └─ weight 기반 impact 순 정렬

★ STEP 13: 최종 정렬 + Andromeda 경고 첨부 (v2 확장)
  └─ expected_impact 기준 Top 3 정렬
  └─ ★성과역추적에서 집중 포인트로 지정된 처방에 "performance_driven" 태그 부착
  └─ andromeda_warning 첨부 (유사도 ≥ 0.60인 경우 — 계정 레벨)
  └─ diversity_score 계산 (클러스터 수 / 총 소재 수)
  └─ GEM/EAR 요약 첨부
  └─ creative_media.analysis_json 저장 (5축 + 처방 통합)
```

### 10.3 MVP 대비 변경된 구조

| 영역 | MVP (2회 호출) | v2 (1회 통합) | 효과 |
|------|--------------|-------------|------|
| **Gemini 호출** | 5축 배치(1회) + 처방 생성(1회) = 2회 | **5축+처방 통합 1회** | 비용 절반, 속도 2배 |
| **5축 배치** | 별도 사전 배치 필수 (90%+ 선행조건) | **처방 호출 안에서 동시 생성** | 선행 의존 제거 |
| STEP 5 | — | ★ 계정 전체 소재 다양성 분석 | 개별 소재 → 계정 레벨로 확장 |
| STEP 7 | — | ★ Motion 글로벌 벤치마크 조회 (축3) | |
| STEP 8 | — | ★ GEM/EAR 영향 인자 분석 | |
| STEP 9 | — | ★ **성과역추적** — 벤치마크 대비 약점→집중 처방 | 성과 데이터에서 역추적 |
| STEP 11 | Gemini 호출 (처방만) | ★ **Gemini 1회 호출 (5축+처방 통합+성과역추적)** | 핵심 구조 변경 |
| STEP 13 | impact 정렬만 | ★ + Andromeda 경고 + diversity_score + EAR 요약 + performance_driven 태그 | |

---

## 11. 데이터 모델 (v2 확장)

### 11.1 prescription_patterns 테이블 (MVP 동일)

```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 속성 식별
  attribute TEXT NOT NULL,         -- 'hook.hook_type', 'text.cta_text' 등 (ATTRIBUTE_AXIS_MAP 기준)
  value TEXT NOT NULL,             -- 'problem', 'curiosity', 'timer' 등
  axis TEXT NOT NULL,              -- 'visual'|'text'|'psychology'|'quality'|'hook'

  -- 성과 지표
  metric TEXT NOT NULL,            -- 'ctr', 'video_p3s_rate', 'engagement_per_10k' 등
  avg_value NUMERIC,
  median_value NUMERIC,
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',  -- 'high'(N>=100) / 'medium'(N>=30) / 'low'(N<30)
                                           -- CLT 기반: N≥30 정규 근사, N≥100 작은 효과크기 감지
  lift_vs_average NUMERIC,         -- = (속성평균 - 전체평균) / 전체평균 × 100
  lift_ci_lower NUMERIC,           -- lift_vs_average의 95% 신뢰구간 하한값 (≥0이면 통계적으로 유의)

  -- 메타
  category TEXT,                   -- 'beauty', 'fashion' 등 (NULL = 전체)
  source TEXT NOT NULL DEFAULT 'internal',  -- 'internal' / 'motion' / 'benchmark'
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(attribute, value, metric, category, source)
);

-- 인덱스
CREATE INDEX idx_pp_attr_value ON prescription_patterns(attribute, value);
CREATE INDEX idx_pp_metric ON prescription_patterns(metric);
CREATE INDEX idx_pp_category ON prescription_patterns(category);
CREATE INDEX idx_pp_lookup ON prescription_patterns(attribute, category, confidence);

-- RLS
ALTER TABLE prescription_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescription_patterns_select" ON prescription_patterns
  FOR SELECT TO authenticated USING (true);
```

### 11.2 prescription_benchmarks 통합 테이블 (★v2 신규 — 축3 저장)

```sql
CREATE TABLE prescription_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 식별
  source TEXT NOT NULL,            -- 'motion_global' / 'internal_top10' / 'motion_category'
  media_type TEXT,                 -- 'IMAGE' / 'VIDEO' / NULL(전체)
  category TEXT,                   -- 'beauty', 'fashion' 등 (NULL = 전체)

  -- 지표
  metric TEXT NOT NULL,            -- METRIC_GROUPS 기준 키
  p10 NUMERIC,                     -- 하위 10% 값
  p25 NUMERIC,                     -- 하위 25% 값
  p50 NUMERIC,                     -- 중위값
  p75 NUMERIC,                     -- 상위 25% 값
  p90 NUMERIC,                     -- 상위 10% 값
  sample_count INTEGER,            -- 샘플 수

  -- 메타
  period TEXT,                     -- '2026-Q1', '2025-Q4' 등
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source, media_type, category, metric, period)
);

-- 인덱스
CREATE INDEX idx_pb_lookup ON prescription_benchmarks(source, media_type, category, metric);
CREATE INDEX idx_pb_period ON prescription_benchmarks(period);

-- RLS
ALTER TABLE prescription_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescription_benchmarks_select" ON prescription_benchmarks
  FOR SELECT TO authenticated USING (true);
```

**활용 예시:**
```sql
-- 뷰티 카테고리 이미지 소재의 CTR 글로벌 백분위 조회
SELECT p10, p25, p50, p75, p90
FROM prescription_benchmarks
WHERE source = 'motion_global'
  AND media_type = 'IMAGE'
  AND category = 'beauty'
  AND metric = 'ctr'
  AND period = '2026-Q1';
```

### 11.3 기존 테이블 활용 (수정 없음)

| 테이블 | 처방에서의 용도 |
|--------|---------------|
| `creative_media` | analysis_json(5축), embedding(3072D), saliency_url, video_analysis |
| `creative_saliency` | cta_attention_score, cognitive_load, top_fixations, attention_map_url |
| `daily_ad_insights` | CTR, ROAS, 3초시청률, 참여율 등 성과 지표 |
| `ad_creative_embeddings` | 768차원 임베딩 (HNSW 인덱스) |
| `creatives` | ad_id, account_id, category, lp_url |

---

## 12. 비용 추정

### 12.1 Gemini 3 Pro Preview 단가

| 항목 | 단가 |
|------|------|
| Input tokens | $1.25 / 1M tokens |
| Output tokens | $10.00 / 1M tokens |
| Image | $0.00315 / 장 |
| Video | $0.00315 / 초 |

### 12.2 처방 생성 비용 (건당 — Gemini 1회 통합)

> **실측 데이터 기반**: `test-prescription-cost.mjs` 실행 결과 + `creative-analysis-framework.md` 비용 섹션 참조
> **Gemini 1회 통합이므로 별도 5축 비용 불필요** — 기존 대비 비용 절반

| 소재 유형 | 건당 비용 | 산출 근거 |
|----------|:---------:|----------|
| **이미지** | ~**$0.003~0.007** | 이미지 $0.00315/장 + 입력 ~3,000 tokens ($0.00375) + 출력 ~1,500 tokens ($0.015) → 5축+처방 1회 통합 |
| **영상** | ~**$0.015~0.035** | 영상 $0.00315/초 × 평균 15초 + 입력 ~5,000 tokens + 출력 ~2,000 tokens → 5축+처방 1회 통합 |

참고: `creative-analysis-framework.md` 비용 기준 — IMAGE L1 $0.01/건, VIDEO $0.03/건 (5축 단독일 때). 1회 통합으로 처방 추가 비용 거의 없음 (같은 호출에 출력만 확장).

### 12.3 월간 비용 시나리오

| 시나리오 | 건수 | 예상 비용 | 비고 |
|---------|-----:|----------:|------|
| on-demand (수강생 사용) | ~100건/월 | **~$0.5~0.7/월** | 수강생 40명 × 2.5건/월, 이미지 기준 |
| 전체 이미지 배치 (1회) | ~2,870건 | ~$8.6~20.1 | IMAGE 전체 (1회 통합) |
| 전체 영상 배치 (1회) | ~261건 | ~$3.9~9.1 | VIDEO 전체 (1회 통합) |
| 주간 신규 소재 | ~50건/주 | ~$0.15~0.35/주 | 일일 수집분 |
| **총 월간 예상** | — | **~$1.3~2.0/월** | on-demand + 주간 신규 |

### 12.4 패턴 추출 / 벤치마크 조회 비용

- Gemini 호출 없음 (SQL 집계만)
- Cloud SQL 쿼리 비용: 무시 가능
- Motion 벤치마크: 수동 입력 경로 설계 완료 (분기 1회, 비용 무시 가능)
- $1.3B 벤치마크 데이터 → `prescription_benchmarks`에 수동 입력 → 분기 갱신

---

## 13. 구현 로드맵 (v2 단계별)

### Phase 1: 파이프라인 완성 (선행 — 진행 중)

> 예상 기간: 파이프라인 배치 실행 완료까지
> **Gemini 1회 통합으로 별도 5축 배치 불필요** — deepgaze-gemini 단계에서 5축+처방이 동시에 나옴

| 항목 | 현재 | 목표 | 담당 |
|------|------|------|------|
| DeepGaze 시선 배치 | 97% (2,926건) | **100%** | backend-dev |
| saliency_data (DeepGaze JSON) | 0% | 90%+ | backend-dev |
| Gemini 1회 통합 배치 (5축+처방) | 16% (496건, 구버전) | **90%+** (통합 재배치) | backend-dev |
| compute-score-percentiles | 0% | 100% | backend-dev |

**의존성**: Phase 2 이후의 모든 단계가 이 Phase에 의존.

### Phase 2: 기반 인프라 (1주)

> 5축 배치와 **병렬 진행 가능**

| STEP | 작업 | 파일/위치 | 공수 |
|:----:|------|----------|:----:|
| 2-1 | `prescription_patterns` 테이블 생성 | Cloud SQL 마이그레이션 | 0.5일 |
| 2-2 | `prescription_benchmarks` 테이블 생성 (★v2) | Cloud SQL 마이그레이션 | 0.5일 |
| 2-3 | 패턴 추출 스크립트 | `scripts/extract-prescription-patterns.mjs` | 1.5일 |
| 2-4 | 축1 처방 가이드 문서 정리 | 프롬프트 삽입용 고정 텍스트 | 0.5일 |
| 2-5 | Motion 초기 벤치마크 데이터 입력 | `prescription_benchmarks` seed | 1일 |

### Phase 3: 처방 엔진 (1.5주)

| STEP | 작업 | 파일/위치 | 공수 |
|:----:|------|----------|:----:|
| 3-1 | 처방 생성 API (12단계) | `src/app/api/protractor/prescription/route.ts` | 2일 |
| 3-2 | Andromeda 유사도 통합 (★v2) | `compute-andromeda-similarity.mjs` 결과 활용 | 1일 |
| 3-3 | GEM/EAR 영향 인자 분석 모듈 (★v2) | `src/lib/protractor/ear-analyzer.ts` | 1일 |
| 3-4 | Gemini 프롬프트 v2 설계 | 축1+축2+축3 통합 프롬프트 | 1.5일 |
| 3-5 | TypeScript 타입 정의 확장 | `src/types/prescription.ts` 확장 | 0.5일 |

### Phase 4: UI + 통합 (1주)

| STEP | 작업 | 파일/위치 | 공수 |
|:----:|------|----------|:----:|
| 4-1 | 소재 상세 페이지 처방 탭 | `creative-analysis.tsx` 확장 | 2일 |
| 4-2 | 고객 여정 4단계 시각화 | 처방 결과 내 여정 시각화 컴포넌트 | 1일 |
| 4-3 | Andromeda 다양성 경고 UI (★v2) | 유사도 경고 배너 + PDA 가이드 | 1일 |
| 4-4 | 벤치마크 비교 뷰 (★v2) | 글로벌 백분위 차트 | 1일 |

### Phase 5: 검증 + 튜닝 (0.5주)

| STEP | 작업 | 담당 |
|:----:|------|------|
| 5-1 | 초기 50건 처방 품질 수동 검토 | qa-engineer + Smith님 |
| 5-2 | 프롬프트 튜닝 (구체성, 정확도 개선) | backend-dev |
| 5-3 | 패턴 크론 등록 (주 1회 화요일) | backend-dev |
| 5-4 | E2E 브라우저 QA | qa-engineer |

### 의존성 그래프

```
[Phase 1] 파이프라인 완성 ───────────────────────────────────────┐
  │                                                              │
  │  [Phase 2] 기반 인프라 (병렬 가능)                            │
  │    ├─ 2-1: prescription_patterns 테이블 ──┐                  │
  │    ├─ 2-2: prescription_benchmarks 테이블 ─┤                  │
  │    ├─ 2-3: 패턴 추출 스크립트 ─────────────┤ (2-1 의존)      │
  │    ├─ 2-4: 축1 가이드 정리 ────────────────┤                  │
  │    └─ 2-5: Motion 초기 데이터 ─────────────┘ (2-2 의존)      │
  │         │                                                    │
  │         ▼                                                    │
  ├──→ [Phase 3] 처방 엔진 ─────────────────────────────────────┤
  │      ├─ 3-1: 처방 API (2-1, 2-2, 2-3, 2-4 의존) ─────┐    │
  │      ├─ 3-2: Andromeda 통합 ──────────────────────────┤    │
  │      ├─ 3-3: GEM/EAR 모듈 ───────────────────────────┤    │
  │      ├─ 3-4: ★성과역추적 모듈 (STEP 9) ──────────────┤    │
  │      ├─ 3-5: Gemini 프롬프트 v2 (2-4, 2-5 의존) ──────┤    │
  │      └─ 3-6: 타입 정의 ──────────────────────────────┘    │
  │                │                                            │
  │                ▼                                            │
  └──────→ [Phase 4] UI + 통합 (3-1 의존) ─────────────────────┤
             ├─ 4-1: 처방 탭 ─────────────────────────┐        │
             ├─ 4-2: 여정 시각화 ─────────────────────┤        │
             ├─ 4-3: Andromeda 경고 UI ───────────────┤        │
             └─ 4-4: 벤치마크 비교 뷰 ────────────────┘        │
                      │                                         │
                      ▼                                         │
              [Phase 5] 검증 + 튜닝 ───────────────────────────┘
                ├─ 5-1: 50건 수동 검토
                ├─ 5-2: 프롬프트 튜닝
                ├─ 5-3: 크론 등록
                └─ 5-4: 브라우저 QA
```

---

## 14. 리스크 + 대응

| # | 리스크 | 영향 | 확률 | 대응 |
|:-:|--------|------|:----:|------|
| R1 | **통합 배치 미실행** (Gemini 1회 통합 배치) | 처방 품질 저하 — 패턴 데이터 부족 | **중간** | Gemini 1회 통합으로 5축 별도 배치 불필요. DeepGaze 시선 배치(97% 완료)만 선행하면 통합 배치 즉시 실행 가능. Phase 2(테이블)는 병렬 선 준비. |
| R2 | **prescription_patterns 샘플 부족** (카테고리별 N<30) | confidence='low' 패턴만 존재하는 카테고리 발생 | 중간 | N<30(CLT 미적용) → 축3(Motion 글로벌)로 보정 필수. N≥30부터 medium 신뢰로 내부 데이터 사용 가능. UI에서 confidence 표기 + lift_ci_lower 병기. |
| R3 | **Gemini 환각(Hallucination)** | 존재하지 않는 패턴/수치 생성 | 중간 | JSON 스키마 강제 + "입력 데이터 외 수치 인용 금지" 프롬프트 + 후처리 검증. |
| R4 | **Motion 데이터 자동화 미구현** (수동 입력 완료) | 축3 수동 갱신 필요 | **낮음** | 수동 입력 경로 설계 완료 ($1.3B 벤치마크 리서치 완료 → prescription_benchmarks seed 입력 → 분기 갱신). 자동화(Motion API 연동)는 Phase 2에서 구축. |
| R5 | **Andromeda 유사도 정확도** | 4축 Jaccard가 Meta 내부 Entity ID와 불일치 | 낮음 | 도메인 지식 기반 임계값 (0.40/0.60/0.80) + 사용자 피드백으로 보정. |
| R6 | **Gemini API 응답 지연/실패** | UX 저하 | 낮음 | 15초 timeout + retry 1회 + "잠시 후 다시 시도" 안내. |
| R7 | **카테고리 불균형** | beauty만 풍부, 나머지 빈약 | 중간 | 카테고리 fallback → 전체(ALL) 패턴 + Motion 글로벌 보강. |

---

## 15. 성공 기준

| 기준 | 목표 | 측정 방법 |
|------|------|----------|
| **처방 구체성** | 실행 가능 액션 100% | 초기 50건 수동 검토 — "바로 실행 가능한가?" |
| **처방 근거** | 3축(축1+축2+축3) 근거 포함 | JSON 출력에 evidence_axis1/axis2/axis3 존재 확인 |
| **응답 시간** | < **15초** | API 응답 시간 로깅 (meta.latency_ms) |
| **약점 식별** | 백분위 하위 30% 자동 감지 | score_percentiles 대비 검증 |
| **★성과역추적** | worst 3 지표 자동 식별 + 집중 처방 | performance_backtrack 출력에 worst_metrics, affected_attributes, focus_stage 존재 확인 |
| **성과×5축 교차** | 교차 약점에 priority boost 적용 | top3_prescriptions에 performance_driven=true 태그 존재 확인 |
| **Andromeda 다양성 경고** | 유사도 0.60+ 정상 탐지 | compute-andromeda-similarity 결과 대비 검증 |
| **패턴 데이터** | prescription_patterns 행 100+ | DB 직접 확인 |
| **벤치마크 데이터** | prescription_benchmarks 행 50+ | DB 직접 확인 |
| **UI 완성도** | 처방 탭 정상 동작 (데스크탑+모바일) | 브라우저 QA (1920px + 375px) |
| **수강생 체감** | "이 처방이 도움됐다" 70%+ | 추후 피드백 수집 (Phase 5 이후) |
| **빌드** | tsc + lint + build 에러 0 | npm run build 성공 확인 |

---

## 16. Gemini 프롬프트 v2 설계 방향

### 16.1 입력 데이터 (소재 1건당)

| 입력 | 설명 | 크기 |
|------|------|------|
| 소재 원본 | 이미지 1장 또는 영상 (멀티모달) | ~300 tokens (이미지) |
| 5축 분석 결과 | analysis_json 전체 | ~500 tokens |
| DeepGaze 시선 데이터 | cta_attention_score, cognitive_load, top_fixations | ~200 tokens |
| 성과 데이터 | CTR, ROAS, 3초시청률, 참여율 + 벤치마크 대비 차이% | ~200 tokens |
| 광고 카피 원문 | ad_copy | ~100 tokens |
| 축1 처방 가이드 | 고정 텍스트 (여정 4단계, 세이프티존, 금지 규칙) | ~800 tokens |
| 축2 패턴 데이터 | prescription_patterns (약점 속성 패턴) | ~300 tokens |
| ★축3 글로벌 벤치마크 | prescription_benchmarks (백분위 분포) | ~200 tokens |
| ★Andromeda 유사도 | 계정 내 유사 소재 + 벤치마크 유사도 | ~300 tokens |
| 유사 벤치마크 Top3 | 5축 결과 + 성과 + 속성 diff | ~400 tokens |
| **총 입력** | — | **~3,300 tokens** |

### 16.2 출력 JSON 스키마 (v2 확장)

```json
{
  "ad_category": {
    "format": "포맷",
    "hook_tactic": "훅 유형",
    "messaging": "메시징 앵글",
    "audience": "타겟"
  },
  "customer_journey_summary": {
    "sensation": "감각 단계 분석 (보고+듣고)",
    "thinking": "사고 단계 분석 (느끼고+판단)",
    "action_click": "행동(클릭) 분석",
    "action_purchase": "행동(구매) 분석"
  },
  "weakness_analysis": [
    {
      "axis": "text",
      "attribute": "text.cta_text",
      "attribute_label": "CTA 문구",
      "current_percentile": 22,
      "global_percentile": 18,
      "issue": "CTA 문구 모호 — '자세히 보기'가 클릭 동기 부여 실패",
      "benchmark_comparison": "상위 20% 소재는 구체적 혜택 명시형 CTA 사용",
      "affects_groups": ["conversion"],
      "ear_impact": "CTR↓ → EAR 하락 → 경매에서 불리 → 도달 단가↑"
    }
  ],
  "top3_prescriptions": [
    {
      "rank": 1,
      "title": "CTA 문구를 혜택 구체화형으로 변경",
      "action": "'자세히 보기' → '50% 할인 지금 확인하기'로 변경",
      "journey_stage": "행동(클릭)",
      "expected_impact": "CTR +0.5~0.8%p (축2 lift: +34%)",
      "evidence_axis1": "Meta 가이드: 구체적 혜택 CTA가 모호한 CTA 대비 CTR 28% 높음",
      "evidence_axis2": "내부 데이터: CTA='혜택명시' avg_ctr 2.8% vs 전체 2.1% (N=45, high)",
      "evidence_axis3": "Motion 글로벌: 뷰티 상위 10% CTA 유형 89%가 혜택 명시형",
      "difficulty": "쉬움",
      "difficulty_reason": "텍스트 수정만, 이미지 재제작 불필요"
    }
  ],
  "andromeda_warning": {
    "level": "high",
    "message": "계정 내 소재 A와 87% 유사. 시각적 차별화 필요.",
    "similar_pairs": [
      { "creative_id": "...", "similarity": 0.87, "overlap_axes": ["visual", "text"] }
    ],
    "diversification_suggestion": {
      "persona": "현재 모든 소재가 20대 여성 타겟. 30대 직장인 버전 제작 권장",
      "desire": "가격 혜택 앵글만 3개. 편의성/시간절약 앵글 추가",
      "awareness": "모든 소재가 '제품 소개' 수준. 문제 인식 단계 소재 부족"
    },
    "diversity_score": 40
  },
  "ear_analysis": {
    "primary_bottleneck": "foundation",
    "bottleneck_detail": "3초시청률 하위 25% → EAR 입력값 저하 → Andromeda 랭킹 불리",
    "improvement_priority": "hook 축 개선이 EAR에 가장 큰 양의 영향"
  },
  "meta": {
    "model": "gemini-3-pro-preview",
    "latency_ms": 4230,
    "axis2_used": true,
    "axis3_used": true,
    "patterns_count": 12,
    "benchmarks_count": 5,
    "category_fallback": false,
    "similar_count": 3,
    "andromeda_analyzed": true
  }
}
```

### 16.3 프롬프트 톤 및 금지 규칙

**톤**: 광고 전문가(Smith님)가 수강생에게 1:1 코칭하는 느낌. 학술적/추상적 X, 실전적/구체적 O.

**절대 금지 (프롬프트에 명시):**
1. CTA 버튼 추가 처방 금지 (메타가 제공하는 것)
2. 세이프티존 밖 배치 처방 금지
3. 타겟팅 변경 처방 금지 (소재 관련만)
4. "더 좋게 하세요" 같은 추상적 처방 금지
5. 입력 데이터에 없는 수치 인용 금지
6. 광고비/예산 관련 처방 금지

---

## 17. 처방 시스템 전체 맥락 — 프로젝트 의존성 그래프

```
[완료] 5축 분석 파이프라인 (L1~L4)
  │
  ├── [완료] DeepGaze 시선 예측 (2,926/3,022 = 97%)
  ├── [완료] 소재 임베딩 768D (2,917/3,022 = 97%)
  ├── [완료] 소재 임베딩 3072D (3,166/3,355 = 94%)
  ├── [진행] Gemini 5축 배치 (496/3,022 = 16%) ← ⚠️ 최대 병목
  ├── [미실행] compute-score-percentiles
  │
  ↓
[보류] 처방 시스템 MVP (2축) ← Smith님 결정 (2026-03-25)
  │
  ↓
[현재] 처방 시스템 v2 (3축) ← 이 Plan 문서
  │
  ├── Phase 1: 파이프라인 완성 (Gemini 1회 통합 배치 90%+)
  ├── Phase 2: 기반 인프라 (테이블 + 스크립트)
  ├── Phase 3: 처방 엔진 (API + Andromeda + GEM/EAR)
  ├── Phase 4: UI + 통합
  └── Phase 5: 검증 + 튜닝
       │
       ↓
[추후] 영상 소재 처방 (씬별 + 재생이탈곡선)
  │    └── 의존: DeepGaze-Gemini 결합 + ffmpeg 씬 경계 감지 + video-scene-analysis 씬분할 (사전 배치)
  ↓
[추후] LP 처방 (소재↔LP 일관성 기반)
  │    └── 의존: LP 크롤링 100% + lp_structure_analysis
  ↓
[장기] A/B 테스트 연동 (처방 전후 비교)
       └── 의존: Meta Experiment API
```

---

## 부록 0: 기존 설계 자료 통합 참조 (이미 설계됨)

> 이 섹션은 처방 시스템과 관련하여 **이미 설계·구현된 자료**들의 핵심 내용을 통합 정리한다.
> "빠져있다"가 아니라 "이미 설계 완료"인 항목들이다.

### A. creative-analysis-framework.md (6축 분석 + Meta 딥다이브)

위치: `docs/creative-analysis-framework.md`

| 섹션 | 핵심 내용 | 처방 v2 반영 |
|------|----------|-------------|
| **1.5** Meta 내부 소재 분석 | Andromeda+GEM+PE-AV 아키텍처, Entity ID 생성 로직, **첫 3초 규칙** | 섹션 4 Andromeda 역추적 전체 반영 |
| **1.5** PE-AV 아키텍처 | Video Tower + Audio Tower + AudioVisual Fusion, 100M 쌍 학습 | 축3/4 분석 기반. Gemini Embedding 2로 근사 |
| **1.5** 3계층 유사도 패널티 | 도달감소→노출제한→경매차단 | STEP 5 계정 전체 다양성 분석에 반영 |
| **1.5** 우리가 따라갈 수 있는 것 vs 불가능한 것 | Visual/Text/Audio ✅, GEM/InterFormer ❌ | Gemini로 가능한 영역만 구현 |
| **2** 6축 분석 상세 | Visual/Text/Audio/Structure/Attention/Performance | analysis_json v3 스키마의 근거 |
| **축5.5** Similarity | Visual+Structural+Thematic+피로도+다양성점수 | 계정 레벨 다양성 점수 = 클러스터 수 / 총 소재 수 |
| **7** Motion 분류체계 흡수 | visual_format 20종, hook_tactic 6종, messaging_angle 8종, intended_audience 자유텍스트 | 축3 데이터 수급 경로 (섹션 3.4) |
| **7-4** Launch Analysis | D+1/3/7/14 성과 추적, 위너/루저 자동판정 | Phase 5 이후 확장 |

### B. TASK-ANALYSIS-BATCH.md (Gemini 1회 통합 배치)

위치: `TASK-ANALYSIS-BATCH.md`

**핵심**: Gemini 1회 호출 = 5축 분석 + 속성 태깅 + 씬별 분석 + 처방 Top3 (수정1과 일치)

| 항목 | 내용 | 처방 v2 반영 |
|------|------|-------------|
| **Gemini 입력** | 소재 원본 + 광고 카피 + DeepGaze 1초별 시선 + ffmpeg 씬 경계 + 씬 분할 결과(사전 배치) + 성과+벤치마크 + 재생 이탈 곡선 + 축1 가이드 + 축2+3 벤치마크 + 임베딩 유사 Top3 | STEP 10 프롬프트 구성에 전체 반영 |
| **재생 이탈 역추적** (영상 전용) | 이탈 구간 특정 → 씬 분석 → 벤치마크 비교 → 구간별 처방 | STEP 10 Gemini 호출 시 retention_curve 출력 |
| **씬 분할 결과** | ffmpeg 씬 경계 + per_second[] + scenes[] (video-scene-analysis 크론 사전 배치) | ffmpeg 경계 → Gemini 의미 분할. Gemini 단독 시 초수 오차 방지 (영상 전용) |
| **재생 이탈 곡선** | p3s/p25/p50/p75/p100 → 영상 길이와 곱해서 초수 환산 → 씬 매칭 | 이탈 구간 특정의 핵심 데이터 |
| **출력 JSON** | five_axis + attributes + retention_curve + scenes + top3_prescriptions | 섹션 10.1 통합 출력 구조 |

### C. TASK-PRESCRIPTION.md + TASK-P3-PRESCRIPTION.md (처방 구현 설계)

위치: `TASK-PRESCRIPTION.md`, `TASK-P3-PRESCRIPTION.md`

| 항목 | 내용 | 상태 |
|------|------|------|
| **참고 파일** | prescription-prompt-guide.md, meta-ad-prescription-guide.md, axis2-real-data-architecture.md | 이미 작성됨 |
| **STEP 3**: 5축 프롬프트에 처방 가이드 삽입 | 축1 가이드 고정 삽입 + 축2 패턴 동적 삽입 + 벤치마크 유사 Top3 | 이미 설계됨 → v2에서 1회 통합으로 진화 |
| **씬별 분석** | 각 씬: 봤다/들었다/느꼈다 + 텍스트 세이프티존 체크 + 오디오 씬별 톤 변화 | 이미 설계됨 → scenes[] 출력에 반영 |
| **prescription_patterns DDL** | attribute, value, axis, metric, confidence, lift_vs_average + UNIQUE 제약 | 이미 설계됨 → 섹션 11.1에 반영 |
| **패턴 추출 스크립트** | extract-prescription-patterns.mjs (N≥100 high, N≥30 medium, N<30 low + lift_ci_lower 계산, 카테고리별 분리) | 이미 설계됨 → Phase 2-3에서 구현 |

### D. test-prescription-prompt.mjs (처방 프롬프트 구현체)

이미 처방 프롬프트가 구현되어 있다. 프롬프트 구조:

```
입력:
  ├─ 축1 처방 가이드 (고정)
  ├─ 5축 분석 결과 (analysis_json)
  ├─ 시선 데이터 (cta_attention_score, cognitive_load, top_fixations)
  ├─ 성과 데이터 (CTR, ROAS, 3초시청률, 참여)
  └─ 광고 카피 원문

출력:
  ├─ ad_category (format, hook_tactic, messaging, audience)
  ├─ customer_journey_summary (감각/사고/행동-클릭/행동-구매)
  ├─ scenes[] (각 씬: 봤다/들었다/느꼈다 + 처방)
  ├─ audio_analysis (씬별 나레이션 톤 변화 + BGM 전환)
  └─ top3_priorities[] (rank, action, stage, expected, evidence, difficulty)
```

### E. prescription-system-mvp.design.md (MVP 설계서 — 이미 완료)

위치: `docs/02-design/features/prescription-system-mvp.design.md`

| 항목 | 내용 | v2 반영 |
|------|------|--------|
| **prescription_patterns DDL** | axis 컬럼 포함, UNIQUE(attribute, value, metric, category, source) 제약 | 섹션 11.1에 반영 완료 |
| **RLS 정책** | authenticated SELECT만, service_role INSERT/UPDATE | 동일 적용 |
| **카테고리 fallback** | 해당 카테고리 N<30 → 전체(ALL) fallback → 축1만 | 섹션 3.3 + STEP 4에 반영 |
| **creative_media analysis_json v3 스키마** | visual, text, psychology, quality, hook, attention, audio, structure, deepgaze_context, andromeda_signals, scores | 섹션 6.1에 전체 반영 |
| **TypeScript 타입** | PrescriptionRequest, PrescriptionResponse, Prescription, WeaknessAnalysis 등 | 섹션 13 Phase 3-5에서 확장 구현 |

---

## 부록 A: 기존 코드베이스 참조 맵

| 파일 | 역할 | v2 활용 |
|------|------|--------|
| `src/lib/protractor/metric-groups.ts` | ATTRIBUTE_AXIS_MAP, METRIC_GROUPS 정의 | 약점 식별 + 성과 그룹 매핑 |
| `scripts/compute-andromeda-similarity.mjs` | 4축 가중 Jaccard 유사도 계산 | STEP 5 Andromeda 분석 |
| `scripts/compute-score-percentiles.mjs` | 5축 점수 → 카테고리별 백분위 | STEP 2 백분위 조회 |
| `scripts/collect-benchmark-creatives.mjs` | Meta API → 벤치마크 소재 수집 | STEP 9 유사 벤치마크 Top3 |
| `scripts/compute-fatigue-risk.mjs` | 피로도 리스크 계산 | Andromeda suppression 감지 |
| `src/app/api/cron/deepgaze-gemini/route.ts` | DeepGaze-Gemini 결합 분석 | STEP 4 시선 데이터 |
| `src/app/api/cron/creative-saliency/route.ts` | DeepGaze 시선 히트맵 생성 | creative_saliency 테이블 |
| `src/app/api/creative/search/route.ts` | search_similar_creatives RPC | STEP 9 유사소재 검색 |
| `src/lib/pipeline-chain.ts` | 파이프라인 체인 트리거 | 처방을 파이프라인 8단계로 연결 |
| `docs/creative-analysis-framework.md` | Andromeda + GEM + PE-AV 분석 프레임워크 | 축 설계 + Meta 로직 참조 |
| `docs/02-design/features/prescription-system-mvp.design.md` | MVP 설계서 (타입, API, 에러 코드) | v2 타입 확장 기반 |

---

## 부록 B: MVP → v2 변경 사항 요약

| 항목 | MVP | v2 | 비고 |
|------|-----|-----|------|
| **Gemini 호출** | 5축 배치(1회) + 처방(1회) = **2회** | **1회 통합** (5축+처방 동시) | 비용 절반, 속도 2배 |
| 처방 축 | 2 (원론+내부) | **3** (+Motion) | prescription_benchmarks 추가 |
| 생성 단계 | 8 | **12** (1회 통합) | +Andromeda, +Motion, +GEM/EAR, +후처리 확장 |
| 데이터 모델 | 1 테이블 | **2 테이블** (+lift_ci_lower) | +prescription_benchmarks |
| Andromeda | 없음 | **계정 전체 포트폴리오 분석** | 개별 소재 → 계정 레벨, 3계층 패널티 감지 |
| GEM/EAR | 없음 | **분석** | EAR 영향 인자 역추적 |
| DeepGaze 활용 | 시선 조회만 | **결합 처방** | 시선 기반 구체적 처방 |
| 출력 JSON | 기본 | **통합 확장** | five_axis+attributes+scenes+retention_curve+top3 통합 |
| 영상 처방 | Out of Scope | **재생 이탈 역추적 포함** | ffmpeg 씬 경계 감지 → Gemini 의미 분할(사전 배치) + DeepGaze 1초별 시선 + p3s/p25/p50/p75/p100 시청률 곡선 |
| confidence 기준 | N≥30 high, N≥10 medium | **N≥100 high, N≥30 medium** (CLT 기반) | 통계적 엄밀성 강화 |
| 비용 (이미지) | ~$0.013/건 | **~$0.003~0.007/건** | 1회 통합으로 절반 |
| 비용 (영상) | ~$0.061/건 | **~$0.015~0.035/건** | 1회 통합으로 절반 |
| 예상 공수 | 5일 | **4주** | 파이프라인 완성 포함 |

---

> 이 문서는 Smith님의 "메타 광고 = 확률 게임. 각 단계 이탈률 줄이기" 비전을 기술적으로 구현하기 위한 v2 처방 시스템의 전체 설계를 담고 있다. MVP의 2축 합산에서 3축 통합으로 확장하되, Andromeda/GEM/EAR이라는 메타 내부 메커니즘을 역추적하여 **"왜 이 소재가 메타 알고리즘에서 불리한지"**까지 설명할 수 있는 시스템을 목표로 한다.
