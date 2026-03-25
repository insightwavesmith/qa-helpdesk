# 처방 시스템 MVP 계획서

> 작성일: 2026-03-25
> 작성자: PM팀
> 상태: Plan 완료
> 선행 조건: 5축 배치 완료 (현재 16% → 90%+ 필요)

---

## 1. 개요

### 기능 설명

광고 소재/LP의 5축 AI 진단 결과를 기반으로 **"뭘 고치면 성과가 올라가는지"** 구체적 개선 방안(처방)을 AI로 생성하는 시스템. 총가치각도기(Protractor)의 진단 → 처방 전환 단계.

### 해결하려는 문제

| 현재 | 목표 |
|------|------|
| 총가치각도기가 "CTR 1.2%, 평균 2.3%, 48% 부족"이라고 숫자만 보여줌 | **왜** 부족한지 + **뭘** 고치면 되는지 구체적 처방 |
| 5축 분석(visual/text/psychology/quality/hook)이 "60점/100점"만 표시 | 약점 축별로 "헤드라인을 호기심형으로 바꾸면 CTR +0.8%p 기대" 같은 액션 제시 |
| 수강생이 점수를 봐도 어떻게 고쳐야 하는지 모름 | impact 순 정렬된 Top 3 처방으로 가장 효과 큰 것부터 실행 가능 |

### Smith님 비전과의 연결

> "메타 광고 = 광고 → 랜딩 → 구매까지 이어지는 **확률 게임**. 각 단계에서 이탈률을 줄이는 게 핵심." (SERVICE-VISION.md)

처방 시스템은 이 확률게임의 각 단계(감각→사고→클릭→구매)에서 **이탈을 줄이는 구체적 방법**을 제시한다. "문제 지적"에서 "해결 방법 제시"로의 진화.

---

## 2. 핵심 요구사항

### 기능적 요구사항

| ID | 요구사항 | 우선순위 | 비고 |
|----|---------|:-------:|------|
| FR-01 | 소재 5축 분석 결과 기반 개선 처방 생성 (Gemini) | **P0** | 축1(레퍼런스 원론) + 축2(실데이터 패턴) 합산 |
| FR-02 | 처방을 impact 순으로 정렬 (가장 효과 큰 것 먼저, Top 3) | **P0** | 벤치마크 상위권 대비 개선 여지 기반 |
| FR-03 | 벤치마크 백분위 기반 약점 축 자동 식별 | **P0** | 5축 중 하위 30% 이하 자동 감지 |
| FR-04 | 처방 UI (소재 상세 페이지에 처방 탭 추가) | **P0** | 기존 `creative-analysis.tsx` 확장 |
| FR-05 | prescription_patterns 테이블 — 속성별 성과 패턴 축적 | **P0** | 축2 데이터 소스 |
| FR-06 | 패턴 추출 크론 (주 1회) | **P1** | 화요일, collect-benchmarks 후 |
| FR-07 | LP 일관성 분석 기반 LP 처방 | **P2** | 영상/LP 처방은 Out of Scope |
| FR-08 | 처방 이력 저장 (before/after 비교용) | **P2** | 추후 확장 |

### 비기능적 요구사항

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | 처방 생성 응답 시간 | < 15초 (Gemini on-demand 호출) |
| NFR-02 | 처방 내용 구체성 | "추상적 조언 X" — 반드시 실행 가능한 액션 포함 |
| NFR-03 | 비용 효율 | 건당 ~$0.013(이미지), ~$0.061(영상) — 비용 테스트 완료(`prescription-cost-test`) |
| NFR-04 | 한국어 UI | 처방 내용 전체 한국어 |

---

## 3. 처방 로직 설계

### 3.1 처방 아키텍처 (2축 합산 — SERVICE-VISION.md 확정)

```
축1: 방법 (레퍼런스 원론)
  └─ prescription-prompt-guide.md (고정 텍스트, Gemini 프롬프트에 삽입)
  └─ 소스: Neurons, Vidmob, Meta 가이드, Motion Bootcamp

축2: 숫자 (실데이터 패턴)
  └─ prescription_patterns 테이블
  └─ source='internal' → 우리 5축 × 성과 패턴 (주 1회 갱신)
  └─ 카테고리별 분리 (beauty, fashion 등)

합산: 축1 + 축2 → Gemini가 통합 처방 생성
  └─ 두 축이 같은 방향 = 강력 추천
  └─ 반대 = internal N≥30이면 내부 우선
```

### 3.2 처방 생성 플로우

```
1. 소재의 5축 분석 결과 조회 (creative_media.analysis_json)
   ├─ visual, text, psychology, quality, hook 각 축 점수
   └─ 개별 속성값 (hook_type, emotion, urgency 등)

2. 벤치마크 백분위 조회
   └─ score_percentiles에서 해당 소재의 각 축 위치 확인

3. 약점 축 식별
   └─ 백분위 하위 30% 이하인 축 자동 감지
   └─ ATTRIBUTE_AXIS_MAP (metric-groups.ts)으로 약점 속성 → 성과 그룹 매핑

4. 시선 데이터 조회 (DeepGaze)
   └─ creative_saliency: cta_attention_score, cognitive_load, top_fixations
   └─ 영상: video_saliency_frames (1초별 시선 흐름)

5. prescription_patterns에서 해당 속성값 패턴 조회 (축2)
   └─ 같은 attribute + value의 성과 평균/중위값/lift%
   └─ 신뢰도(confidence) 기반 필터

6. Gemini 프롬프트 구성
   ├─ 축1: 처방 가이드 고정 삽입
   ├─ 축2: prescription_patterns 동적 삽입
   ├─ 5축 분석 결과 + 시선 데이터 + 성과 데이터
   └─ 벤치마크 유사소재 Top3 (임베딩 코사인 유사도)

7. Gemini 호출 → 처방 JSON 생성
   └─ top3_prescriptions: [{rank, action, stage, expected, evidence, difficulty}]

8. impact 순 정렬 후 반환
   └─ expected (기대 개선폭) 기준 정렬
```

### 3.3 Gemini 프롬프트 설계 방향

**입력 데이터 (소재 1건당)**:
- 소재 원본 (이미지/영상 — 멀티모달)
- 5축 분석 결과 (analysis_json)
- DeepGaze 시선 데이터 (cta_attention_score, cognitive_load, top_fixations)
- 성과 데이터 (CTR, ROAS, 3초시청률, 참여율 + 벤치마크 대비 차이%)
- 광고 카피 원문
- 축1 처방 가이드 (고정 텍스트)
- 축2 prescription_patterns (해당 속성값 패턴)
- 임베딩 유사 벤치마크 Top3 (5축 결과 + 성과 + 속성 diff)

**출력 (JSON)**:
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
      "attribute": "cta_text",
      "current_percentile": 22,
      "issue": "CTA 문구 모호 — '자세히 보기'가 클릭 동기 부여 실패",
      "benchmark_comparison": "상위 20% 소재는 구체적 혜택 명시형 CTA 사용 (예: '50% 할인 확인')"
    }
  ],
  "top3_prescriptions": [
    {
      "rank": 1,
      "title": "CTA 문구를 혜택 구체화형으로 변경",
      "action": "'자세히 보기' → '50% 할인 지금 확인하기'로 변경",
      "journey_stage": "행동(클릭)",
      "expected_impact": "CTR +0.5~0.8%p (축2 패턴 기반 lift: +34%)",
      "evidence_axis1": "Meta 가이드: 구체적 혜택 CTA가 모호한 CTA 대비 CTR 28% 높음",
      "evidence_axis2": "내부 데이터: CTA 유형='혜택명시'의 avg_ctr 2.8% vs 전체 평균 2.1%",
      "difficulty": "쉬움 (텍스트 수정만)"
    }
  ]
}
```

**톤**: 광고 전문가(Smith님)가 수강생에게 1:1 코칭하는 느낌. 학술적/추상적 X, 실전적/구체적 O.

**절대 금지 규칙**:
- CTA 버튼 추가 처방 금지 (메타가 제공하는 것)
- 세이프티존 밖 배치 처방 금지
- 타겟팅 변경 처방 금지 (소재 관련만)
- "더 좋게 하세요" 같은 추상적 처방 금지

### 3.4 고객 여정 4단계 매핑

처방은 반드시 고객 여정 단계와 매핑되어야 한다:

| 여정 단계 | 성과 그룹 | 관련 5축 | 처방 예시 |
|-----------|----------|---------|----------|
| **감각** (보고+듣고) | 기반 (3초시청률, CTR) | hook, visual, quality | "첫 프레임에 제품 클로즈업 → 3초시청률 개선" |
| **사고** (느끼고+판단) | 참여 (좋아요, 댓글, 공유) | psychology, text | "사회적 증거(리뷰 수) 추가 → 댓글 유도" |
| **행동-클릭** | 전환 (CTR, 결제시작율) | text (CTA), psychology (urgency) | "한정 시간 오퍼 명시 → 결제시작율 개선" |
| **행동-구매** | 전환 (구매전환율, ROAS) | LP 일관성, quality | "소재와 LP 간 메시지 일관성 강화" |

이 매핑은 `metric-groups.ts`의 `ATTRIBUTE_AXIS_MAP`과 일치해야 한다:
- hook 축 → 기반점수(foundation) 영향
- visual 축 → 기반점수 + 전환율 영향
- text 축 → 참여율 + 전환율 영향
- psychology 축 → 참여율 + 전환율 영향
- quality 축 → 기반점수 영향

---

## 4. 데이터 모델

### 4.1 prescription_patterns 테이블 (신규)

```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute TEXT NOT NULL,        -- 'hook_type', 'emotion', 'urgency' 등 (analysis_json 속성)
  value TEXT NOT NULL,            -- 'problem', 'curiosity', 'timer' 등 (속성값)
  metric TEXT NOT NULL,           -- 'video_p3s_rate', 'ctr', 'engagement_per_10k' 등
  avg_value NUMERIC,             -- 이 속성값의 지표 평균
  median_value NUMERIC,          -- 이 속성값의 지표 중위값
  sample_count INTEGER,          -- 샘플 수
  confidence TEXT,               -- 'high'(N>=30) / 'medium'(N>=10) / 'low'(N<10)
  lift_vs_average NUMERIC,       -- 전체 평균 대비 lift% = (속성평균 - 전체평균) / 전체평균 × 100
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  category TEXT,                 -- 업종별 ('beauty', 'fashion', 'food' 등)
  source TEXT DEFAULT 'internal' -- 'internal'(우리 데이터) / 'motion'(글로벌 데이터, 추후)
);

-- 인덱스
CREATE INDEX idx_prescription_patterns_attr ON prescription_patterns(attribute, value);
CREATE INDEX idx_prescription_patterns_metric ON prescription_patterns(metric);
CREATE INDEX idx_prescription_patterns_category ON prescription_patterns(category);
```

**참고**: SERVICE-VISION.md에서는 `prescription_benchmarks` 테이블명을 언급하지만, TASK-PRESCRIPTION.md와 TASK-P3-PRESCRIPTION.md에서는 `prescription_patterns`을 사용한다. 현재 DB에 두 테이블 모두 존재하지 않음(grep 확인 완료). 본 Plan에서는 TASK 파일 기준 `prescription_patterns`을 채택하되, SERVICE-VISION.md의 `source` 컬럼 설계(internal/motion)를 반영한다.

### 4.2 기존 테이블 활용 (수정 없음)

| 테이블 | 역할 | 처방에서의 용도 |
|--------|------|---------------|
| `creative_media` | 소재 메타+분석 | `analysis_json`에서 5축 결과 + 속성값 조회 |
| `creative_saliency` | DeepGaze 시선 | cta_attention_score, cognitive_load, top_fixations |
| `daily_ad_insights` | 일별 성과 | CTR, ROAS, 3초시청률, 참여율 등 |
| `ad_creative_embeddings` | 소재 임베딩 | 유사 벤치마크 소재 검색 (코사인 유사도) |
| `score_percentiles` | 백분위 캐시 | 약점 축 식별 (하위 30%) |

---

## 5. 범위

### In Scope (MVP)

| 항목 | 상세 |
|------|------|
| **처방 대상** | 이미지 소재만 (analysis_json이 있는 creative_media) |
| **처방 생성** | on-demand (소재 상세 페이지에서 버튼 클릭 시 Gemini 호출) |
| **처방 API** | `POST /api/protractor/prescription` — 소재 ID 받아서 처방 생성 |
| **처방 UI** | 소재 상세 페이지(`creative-analysis.tsx`)에 "처방" 탭 추가 |
| **패턴 테이블** | `prescription_patterns` 생성 + 초기 데이터 적재 |
| **패턴 추출** | `scripts/extract-prescription-patterns.mjs` 스크립트 |
| **크론 등록** | 주 1회 화요일 패턴 추출 (Cloud Scheduler) |
| **impact 정렬** | 처방 Top 3를 기대 효과 순으로 정렬 |

### Out of Scope (추후 확장)

| 항목 | 이유 | 예상 시기 |
|------|------|----------|
| **영상 소재 처방** | 영상 프레임별/씬별 처방은 복잡 (ffmpeg 씬분할 + 재생이탈곡선 필요, TASK-ANALYSIS-BATCH 참조) | 5축 배치 + DeepGaze-Gemini 파이프라인 완료 후 |
| **LP 처방** | LP 일관성 기반 처방은 LP 크롤링 완료 + lp_structure_analysis 데이터 필요 | 영상 처방 후 |
| **처방 자동 적용** | 소재 자동 수정은 Meta API Creative 수정 권한 + 리스크 관리 필요 | 장기 로드맵 |
| **A/B 테스트 연동** | 처방 전후 성과 비교는 Meta Experiment API 연동 필요 | 장기 로드맵 |
| **글로벌 벤치마크 (Motion $1.3B)** | source='motion' 데이터 수급 경로 확보 후 | 분기 1회 갱신 예정 |
| **처방 이력 관리** | before/after 비교용 이력 테이블은 MVP에서 제외 | V2에서 추가 |

---

## 6. 구현 순서

### 의존성 그래프

```
[선행] 5축 배치 완료 (16% → 90%+)
  │
  ├─ STEP 1: prescription_patterns 테이블 생성 (Cloud SQL)
  │    └─ 의존: 없음 (5축 배치와 병렬 가능)
  │
  ├─ STEP 2: 패턴 추출 스크립트
  │    └─ 의존: STEP 1 + 5축 배치 완료
  │
  ├─ STEP 3: 처방 생성 API
  │    └─ 의존: STEP 1 + STEP 2 (패턴 데이터 필요)
  │
  ├─ STEP 4: 처방 UI (소재 상세 탭)
  │    └─ 의존: STEP 3 (API 필요)
  │
  └─ STEP 5: 패턴 추출 크론 등록
       └─ 의존: STEP 2 (스크립트 검증 완료)
```

### STEP별 상세

**STEP 1: prescription_patterns 테이블 생성** (0.5일)
- Cloud SQL(34.50.5.237)에 테이블 + 인덱스 생성
- 5축 배치 완료 전에 미리 준비 가능

**STEP 2: 패턴 추출 스크립트** (1일)
- `scripts/extract-prescription-patterns.mjs` 생성
- `creative_media.analysis_json`에서 5축 각 속성값 추출
- `daily_ad_insights`와 JOIN → 속성별 성과 평균/중위값/샘플수 계산
- 신뢰도: N>=30 높음 / N>=10 보통 / N<10 낮음
- lift% = (속성평균 - 전체평균) / 전체평균 x 100
- `prescription_patterns`에 upsert
- 카테고리별 분리 (creative.category 기준)

**STEP 3: 처방 생성 API** (1.5일)
- `POST /api/protractor/prescription`
- 입력: creative_media_id
- 처리: 5축 조회 → 약점 식별 → 시선 조회 → 패턴 조회 → 유사소재 조회 → Gemini 호출
- 출력: top3_prescriptions + weakness_analysis + customer_journey_summary
- 축1 가이드 고정 삽입 + 축2 패턴 동적 삽입

**STEP 4: 처방 UI** (1.5일)
- `creative-analysis.tsx`에 "처방" 탭 추가
- Top 3 처방 카드 (rank, title, action, expected_impact, difficulty)
- 약점 분석 섹션 (어떤 축이 약한지 시각화)
- 고객 여정 요약 (4단계)
- "처방 생성" 버튼 (on-demand 호출, 로딩 상태 표시)

**STEP 5: 패턴 추출 크론** (0.5일)
- Cloud Scheduler 등록 (화요일 collect-benchmarks 후, 04:00 UTC)
- `extract-prescription-patterns.mjs` 실행
- 실행 1회 검증

---

## 7. 비용 추정

### Gemini 호출 비용 (처방 비용 테스트 완료 — `prescription-cost-test` feature)

| 항목 | 이미지 소재 | 영상 소재 (MVP 제외) |
|------|:----------:|:------------------:|
| 건당 비용 | ~$0.013 | ~$0.061 |
| 모델 | Gemini 3 Pro Preview | Gemini 3 Pro Preview |
| Input 가격 | $1.25/1M tokens | $1.25/1M tokens |
| Output 가격 | $10.00/1M tokens | $10.00/1M tokens |

### MVP 비용 시나리오

| 시나리오 | 건수 | 예상 비용 | 비고 |
|---------|-----:|----------:|------|
| on-demand (수강생 사용) | ~100건/월 | ~$1.3/월 | 수강생 40명 x 2.5건/월 |
| 전체 이미지 배치 (1회) | ~2,870건 | ~$37.3 | IMAGE 전체 |
| 주간 신규 소재 | ~50건/주 | ~$0.65/주 | 일일 수집분 |

**결론**: 비용이 극히 낮아 on-demand 호출로 충분. 배치 처방은 필요 없음.

### 패턴 추출 비용

- Gemini 호출 없음 (SQL 집계만)
- Cloud SQL 쿼리 비용: 무시 가능

---

## 8. 성공 기준

| 기준 | 목표 | 측정 방법 |
|------|------|----------|
| 처방 생성 응답 시간 | < 15초 | API 응답 시간 로깅 |
| 처방 구체성 | "실행 가능한 액션" 포함률 100% | 처방 결과 수동 검토 (초기 50건) |
| 처방 근거 | 축1+축2 근거 모두 포함 | JSON 출력 검증 |
| 약점 식별 정확도 | 백분위 하위 30% 축 자동 감지 | score_percentiles 대비 검증 |
| UI 완성도 | 소재 상세 페이지에서 처방 탭 정상 동작 | 브라우저 QA (데스크탑+모바일) |
| 패턴 데이터 | prescription_patterns 행 100+ | DB 직접 확인 |
| 수강생 체감 | "이 처방이 도움됐다" 비율 70%+ | 추후 피드백 수집 (MVP 이후) |

---

## 9. 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| **5축 배치 미완료** (현재 16%) | 처방 품질 저하 — 패턴 데이터 부족 | **높음** | MVP는 5축 배치 90%+ 달성 후 착수. 그 전에 STEP 1(테이블)만 선 준비 |
| **prescription_patterns 샘플 부족** | 신뢰도 낮은 패턴만 존재 → 처방 근거 빈약 | 중간 | 축1(레퍼런스 원론)만으로도 처방 가능. 축2는 보조 근거로 활용. 신뢰도 'low' 패턴은 UI에서 "참고" 표기 |
| **Gemini 환각(Hallucination)** | 존재하지 않는 패턴/수치 생성 | 중간 | 프롬프트에 "입력 데이터에 없는 수치 인용 금지" 명시. output JSON 스키마 강제. 후처리에서 검증 |
| **처방 내용 추상적** | "더 좋게 하세요" 수준의 처방 | 낮음 | 프롬프트에 구체성 기준 명시 + 절대 금지 규칙. 초기 50건 수동 검토 후 프롬프트 튜닝 |
| **Gemini API 응답 지연/실패** | 사용자 경험 저하 | 낮음 | 15초 timeout + 실패 시 retry 1회 + "잠시 후 다시 시도" 안내 |
| **카테고리 불균형** | 특정 업종(beauty)만 패턴 풍부, 나머지 빈약 | 중간 | 카테고리 fallback — 해당 카테고리 N<10이면 전체(ALL) 패턴 사용 |

---

## 10. 의존성 그래프 (프로젝트 전체 맥락)

```
[완료] 5축 분석 파이프라인 (L1~L4)
  │
  ├── [완료] DeepGaze 시선 예측 (2,926/3,022 = 97%)
  ├── [완료] 소재 임베딩 (2,917/3,022 = 97%)
  ├── [진행] Gemini 5축 배치 (496/3,022 = 16%) ← ⚠️ 병목
  │
  ↓
[현재] 처방 시스템 MVP ← 이 Plan 문서
  │
  ├── STEP 1: 테이블 (5축 배치와 병렬 가능)
  ├── STEP 2~5: 5축 배치 90%+ 달성 후
  │
  ↓
[추후] 영상 소재 처방 (씬별 + 재생이탈곡선)
  │    └── 의존: DeepGaze-Gemini 결합 파이프라인 + ffmpeg 씬분할
  ↓
[추후] LP 처방 (소재↔LP 일관성 기반)
  │    └── 의존: LP 크롤링 100% + lp_structure_analysis
  ↓
[장기] A/B 테스트 연동 (처방 전후 비교)
       └── 의존: Meta Experiment API
```

---

## 11. Executive Summary

**처방 시스템 MVP**는 총가치각도기의 "진단 → 처방" 전환 핵심 기능이다.

- **무엇을**: 소재 5축 분석 결과 기반으로 "뭘 고치면 성과가 올라가는지" 구체적 처방 Top 3 생성
- **어떻게**: 축1(레퍼런스 원론 가이드) + 축2(실데이터 패턴 `prescription_patterns`) → Gemini 통합 처방
- **범위**: 이미지 소재만, on-demand 호출, 소재 상세 페이지 탭 추가
- **선행 조건**: 5축 배치 완료 (현재 16% → 90%+ 필요)
- **예상 공수**: 5일 (STEP 1~5)
- **비용**: 건당 ~$0.013 (이미지), 월 ~$1.3 (수강생 사용 기준)
- **리스크**: 5축 배치 미완료가 최대 병목. STEP 1(테이블)은 선 준비 가능

Smith님 비전의 "확률게임 이탈률 최소화"를 실현하는 첫 번째 구체적 기능. 수강생이 점수만 보고 멈추는 게 아니라, **"다음에 뭘 해야 하는지"** 바로 알 수 있게 된다.
