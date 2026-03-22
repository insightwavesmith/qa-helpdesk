# 광고 소재 분석 프로세스 축 설계 v2

> 기준: Meta Andromeda + GEM + PE-AV 아키텍처 기반
> 작성: 2026-03-20 (v2: Meta 딥다이브 반영)

---

## 1. 분석 대상 분류

| 타입 | 설명 | 현재 건수 | 분석 방식 |
|------|------|----------|----------|
| IMAGE | 정적 이미지 광고 | ~2,835건 | Gemini Vision + DeepGaze |
| VIDEO | 동영상 광고 | ~261건 | Gemini Video + 키프레임 DeepGaze |
| CATALOG | 카탈로그/다이나믹 광고 | 소량 | IMAGE와 동일 |

---

## 1.5 Meta 내부 소재 분석 시스템 (Andromeda + GEM + PE-AV)

### Meta가 소재를 분석하는 방법

Meta는 소재가 업로드되면 **Entity ID(시맨틱 지문)**를 자동 생성한다. 비슷한 Entity ID를 가진 소재끼리 클러스터링하여 같은 광고 취급.

**Entity ID 생성 시 분석하는 요소:**

| 분석 계층 | 세부 요소 | 비고 |
|-----------|----------|------|
| **Visual Similarity** | 픽셀 구성, 색상 팔레트, 조명 패턴, 레이아웃 구조, 배경 요소, 인물 위치/포즈, 제품 위치/크기 | 같은 스타일로 찍은 제품 사진 → 전부 같은 Entity ID |
| **Structural Similarity** | 텍스트 배치 좌표, CTA 버튼 위치, 오버레이 구조, 프레임 구성 | 사진 달라도 레이아웃 동일 → 같은 Entity ID |
| **Thematic Similarity** | 메시지 컨셉, 가치 제안(VP), 감정 톤, 타겟 고충(pain point) | 비주얼 달라도 "같은 말" → 같은 Entity ID |
| **Motion Pattern** (VIDEO) | 동영상 내 움직임, 씬 전환 속도, 카메라 워크 | 모션 패턴이 비슷하면 유사 판정 |
| **Audio Signature** (VIDEO) | 나레이션 톤, BGM 장르, 사운드 디자인 | 향후 더 정교해질 예정 |

### 핵심 규칙: 첫 3초

> **Meta 공식 확인**: 동영상 광고의 첫 3초가 비슷하면, 나머지가 달라도 **같은 광고로 취급**한다.

첫 3초 = 소재의 Entity ID를 결정하는 가장 중요한 구간.

### PE-AV (Perception Encoder AudioVisual) 아키텍처

Meta가 2025년 12월 오픈소스로 공개한 멀티모달 인코더:

```
동영상 입력
├── Video Tower (PE Frame Encoder → Temporal Video Encoder)
│   → 프레임별 시각 특징 → 시간축 통합
├── Audio Tower (DAC VAE → Audio Tokenizer)
│   → 40ms 단위 오디오 토큰화
└── AudioVisual Fusion Encoder
    → 비디오+오디오 통합 벡터
    → 10개 modality pair contrastive learning
```

- 100M 오디오-비디오 쌍으로 학습
- 오디오, 비디오, 텍스트 → **하나의 벡터 공간**에 매핑
- SOTA: SigLIP2(이미지) 초과, InternVideo2(동영상) 초과

### GEM (Generative Ads Model)

Meta의 LLM 스케일 광고 추천 파운데이션 모델:

- **비순서 특성**: 사용자 인구통계 + 관심사 + 광고 형식/소재 내용 + 광고주 목표 → Wukong 아키텍처(stackable factorization)
- **순서 특성**: 사용자 행동 시퀀스 수천 개 → Pyramid-Parallel 구조 (기존 10~20개 → 수천 개로 확장)
- **교차 학습**: InterFormer — 정적 프로필 + 행동 시퀀스를 interleaving하여 교차 분석
- 결과: Instagram 전환 +5%, Facebook Feed 전환 +3%

### 3계층 유사도 패널티

| 계층 | 증상 | 원인 |
|------|------|------|
| **1단계**: 도달 감소 + 내부 경쟁 | 같은 Entity ID 소재끼리 같은 오디언스 풀에서 경쟁 |
| **2단계**: 노출 제한 | 클러스터 포화 — 같은 노드에 너무 많은 소재 |
| **3단계**: 경매 진입 차단 | Andromeda가 해당 클러스터를 아예 retrieval에서 제외 |

### 우리가 따라가야 할 것 vs 불가능한 것

| Meta | 우리 대응 가능 여부 | 방법 |
|------|:------------------:|------|
| Visual 분석 | ✅ | Gemini Vision |
| Text/NLP 분석 | ✅ | Gemini + 텍스트 임베딩 |
| Audio 분석 | ✅ | Gemini 2.5 Pro 동영상 입력 |
| Motion Pattern | ✅ | Gemini 2.5 Pro 동영상 입력 |
| 첫 3초 가중치 | ✅ | video_first_3s 별도 점수화 |
| Entity ID (시맨틱 지문) | ✅ | embedding_3072 |
| 3계층 유사도 감지 | ✅ | Visual + Structural + Thematic 별도 측정 |
| 피로도/중복 패널티 경고 | ✅ | 클러스터링 + 유사도 임계값 |
| PE-AV 동영상+오디오 통합 벡터 | ⚠️ | Gemini Embedding 2로 근사 (동영상 직접 임베딩) |
| GEM (수십억 유저 행동 학습) | ❌ | Meta 독점 — 우리 데이터 규모로는 불가 |
| InterFormer (교차 학습) | ❌ | Meta 독점 |

---

## 2. 분석 축 (6축)

### 축 1: Visual (시각 요소) — Gemini Vision

이미지든 동영상이든 **눈에 보이는 것** 전부.

| 요소 | 세부 | IMAGE | VIDEO |
|------|------|:-----:|:-----:|
| **제품 노출** | 위치 (center/side/background/none) | ✅ | ✅ 각 씬별 |
| | 화면 비율 (%) | ✅ | ✅ 평균 |
| | 클로즈업 여부 | ✅ | ✅ |
| **인물** | 얼굴 유무 | ✅ | ✅ |
| | 신체 범위 (upper/full/none) | ✅ | ✅ |
| | 표정 (smile/neutral/surprise) | ✅ | ✅ 첫 등장 |
| | 인물 수 (1/2/다수) | ✅ | ✅ |
| **색상** | 메인 색상 (hex) | ✅ | ✅ 대표 프레임 |
| | 팔레트 (3~5색) | ✅ | ✅ |
| | 톤 (warm/cool/neutral) | ✅ | ✅ |
| | 대비 (high/medium/low) | ✅ | ✅ |
| **레이아웃** | 텍스트 비율 (%) | ✅ | ✅ 평균 |
| | 여백 비율 (%) | ✅ | ✅ |
| | 시각적 복잡도 (simple/moderate/complex) | ✅ | ✅ |
| **스타일** | ugc/professional/minimal/bold/lifestyle/before-after | ✅ | ✅ |
| **브랜드** | 로고 위치 | ✅ | ✅ |
| | 브랜드 색상 일관성 | ✅ | ✅ |

### 축 2: Text (텍스트/카피) — NLP + Gemini

화면 위 텍스트 + 광고 카피(제목, 설명, 본문).

| 요소 | 세부 | IMAGE | VIDEO |
|------|------|:-----:|:-----:|
| **Hook 텍스트** | 유형 (question/shock/benefit/problem/curiosity/none) | ✅ | ✅ 첫 3초 |
| | 실제 문구 | ✅ | ✅ |
| | 감정 톤 (긍정/부정/중립/긴급) | ✅ | ✅ |
| **CTA** | 유형 (button/text/overlay/none) | ✅ | ✅ 마지막 씬 |
| | 문구 ("지금 구매", "무료 체험" 등) | ✅ | ✅ |
| | 위치 (bottom/center/end_frame) | ✅ | ✅ |
| | 색상 (hex) | ✅ | ✅ |
| **오버레이 텍스트** | 메인 헤드라인 | ✅ | ✅ 각 씬별 |
| | 서브 카피 | ✅ | ✅ |
| | 가격/할인 표시 | ✅ | ✅ |
| **광고 카피** | 제목 (headline) | ✅ | ✅ |
| | 본문 (body) | ✅ | ✅ |
| | 키워드 추출 | ✅ | ✅ |
| **Social Proof** | 리뷰/별점 노출 | ✅ | ✅ |
| | Before/After | ✅ | ✅ |
| | 후기/인증 | ✅ | ✅ |
| | 숫자 증거 ("98% 만족") | ✅ | ✅ |

### 축 3: Audio (오디오) — VIDEO 전용, Gemini 2.5 Pro

동영상에서만 분석. 이미지는 해당 없음.

| 요소 | 세부 |
|------|------|
| **나레이션** | 유무, 성별, 톤 (전문가/일상/열정), 속도 (fast/medium/slow) |
| **BGM** | 유무, 장르 (upbeat/calm/dramatic/trendy), 볼륨 레벨 |
| **효과음** | 유무, 유형 (ding/whoosh/click/pop) |
| **자막** | 유무, 스타일 (auto-caption/디자인/hard-sub) |
| **음성 내용** | 핵심 대사 추출 (나레이션 STT) |
| **오디오-비주얼 싱크** | 음악 전환 = 씬 전환 일치 여부 |

### 축 4: Structure (영상 구조) — VIDEO 전용, Gemini 2.5 Pro

> ⚠️ **Meta 핵심 규칙**: 첫 3초가 비슷하면 나머지가 달라도 같은 광고 취급

| 요소 | 세부 | Meta 연관 |
|------|------|-----------|
| **첫 3초** ⭐ | hook 유형 + 화면 구성 + 텍스트 + 오디오 | **Entity ID 결정 최중요 구간** |
| **씬 구성** | 각 씬별: 시작~끝 시간, 유형 (hook/problem/demo/result/cta/brand/testimonial) | Structural Similarity |
| **페이싱** | 전체 속도감 (fast/medium/slow), 평균 씬 길이 | Motion Pattern |
| **총 길이** | 초 단위 | |
| **컷 수** | 씬 전환 횟수 | Motion Pattern |
| **전환 패턴** | hook→demo→CTA / problem→solution→CTA 등 | Structural Similarity |
| **마지막 3초** | CTA 유형 + 브랜드 노출 | |
| **루프 구조** | 반복 재생 최적화 여부 | |
| **모션 패턴** 🆕 | 카메라 움직임(고정/패닝/줌), 화면 내 동작 속도 | Meta Motion Pattern 분석 |
| **오디오-비주얼 싱크** 🆕 | 음악 전환 ↔ 씬 전환 일치도 | PE-AV Fusion |

### 축 5: Attention (시선/주목도) — DeepGaze + Gemini

사람이 이 소재를 봤을 때 **어디를 보는지**.

| 요소 | 세부 | IMAGE | VIDEO |
|------|------|:-----:|:-----:|
| **히트맵** | saliency map 이미지 | ✅ DeepGaze | ✅ 키프레임 3장 |
| **Top Fixation** | 상위 5개 주목 좌표 + 주목도(%) | ✅ | ✅ 씬별 |
| **CTA 주목도** | CTA 영역의 saliency 비율 (0~1) | ✅ | ✅ 마지막 씬 |
| **인지 부하** | 엔트로피 기반 (low/medium/high) | ✅ | ✅ 씬별 평균 |
| **시선 동선** | 주목 순서 (1→2→3→...) | ✅ | ✅ 씬별 |
| **제품 주목도** | 제품 영역의 saliency 비율 | ✅ | ✅ |
| **텍스트 주목도** | 텍스트 영역의 saliency 비율 | ✅ | ✅ |

### 축 5.5: Similarity (유사도/중복 감지) — 🆕 Meta Andromeda 기반

> Meta 3계층 유사도를 우리 시스템에 적용

| 요소 | 세부 | 측정 방법 |
|------|------|----------|
| **Visual Similarity** | 이미지/동영상 비주얼 유사도 | embedding_3072 코사인 유사도 |
| **Structural Similarity** 🆕 | 레이아웃 구조 유사도 (텍스트 위치, CTA 위치, 제품 위치) | L1 태그 좌표 기반 비교 |
| **Thematic Similarity** 🆕 | 메시지 컨셉 유사도 (가치 제안, 감정 톤, 타겟 고충) | 텍스트 임베딩 + L1 태그 비교 |
| **피로도 경고** | 같은 클러스터에 소재 과다 → 경고 | 클러스터 내 소재 수 임계값 |
| **중복 감지** | Entity ID 동일 판정 → "이 소재는 기존 X와 같은 취급됩니다" | 3계층 종합 유사도 > 0.85 |
| **다양성 점수** 🆕 | 계정 내 소재 다양성 (Meta 권장: 8~20개 컨셉) | 클러스터 수 / 총 소재 수 |

---

### 축 6: Performance Context (성과 맥락) — DB 데이터

분석이 아니라 DB에서 가져오는 **성과 지표와의 연결**.

| 요소 | 소스 |
|------|------|
| ROAS | daily_ad_insights |
| CTR | daily_ad_insights |
| CPA | daily_ad_insights |
| 전환율 | daily_ad_insights |
| 게재 기간 (일) | daily_ad_insights min/max date |
| 누적 광고비 | daily_ad_insights SUM(spend) |
| Meta 품질 랭킹 | quality_ranking (ABOVE/AVERAGE/BELOW) |
| Meta 참여 랭킹 | engagement_ranking |
| Meta 전환 랭킹 | conversion_ranking |
| 벤치마크 대비 | benchmarks 테이블 비교 |
| LP 일관성 점수 | creative_lp_consistency |

---

## 3. 분석 파이프라인 흐름

```
[수집]
collect-daily → daily_ad_insights (성과)
embed-creatives → ad_creative_embeddings (메타데이터+이미지)
download-videos → /data/videos/{ad_id}.mp4 (동영상 원본)

[분석 Layer 1: 요소 태깅]
┌─ IMAGE ─────────────────────────────────────────┐
│ Gemini Vision → 축1(Visual) + 축2(Text)         │
│ 입력: 이미지 1장                                  │
│ 출력: creative_element_analysis                   │
└─────────────────────────────────────────────────┘
┌─ VIDEO ─────────────────────────────────────────┐
│ Gemini 2.5 Pro → 축1~4 전부 (Visual+Text+Audio+Structure) │
│ 입력: 동영상 원본 파일                             │
│ 출력: creative_element_analysis (확장 스키마)       │
└─────────────────────────────────────────────────┘

[분석 Layer 2: 시선 예측]
┌─ IMAGE ─────────────────────────────────────────┐
│ DeepGaze IIE → 축5(Attention)                    │
│ 입력: 이미지 1장                                  │
│ 출력: creative_saliency                           │
└─────────────────────────────────────────────────┘
┌─ VIDEO ─────────────────────────────────────────┐
│ 키프레임 3장 추출 (3초/중간/마지막) → DeepGaze × 3 │
│ 입력: 동영상에서 프레임 추출                        │
│ 출력: creative_saliency (video_frames 배열)        │
└─────────────────────────────────────────────────┘

[분석 Layer 3: 임베딩]
┌─ IMAGE ─────────────────────────────────────────┐
│ Gemini Embedding 2 → 이미지 임베딩 3072           │
│ Gemini Embedding 2 → 텍스트 임베딩 3072           │
└─────────────────────────────────────────────────┘
┌─ VIDEO ─────────────────────────────────────────┐
│ Gemini Embedding 2 → 동영상 직접 임베딩 3072      │
│ Gemini Embedding 2 → 텍스트 임베딩 3072           │
│ (동영상 원본 파일 → API 직접 입력, 무료)            │
└─────────────────────────────────────────────────┘

[분석 Layer 4: 벤치마크 비교]
축6(Performance) + 축1~5 결과 → 벤치마크 상위 소재와 비교
→ 3부문 점수 (기반/참여/전환)

[분석 Layer 5: 종합 점수 + AI 코칭]
L1~L4 전부 종합 → creative_intelligence
→ 총가치 점수 (0~100)
→ AI 개선 제안 (구체적 액션 아이템)
→ "벤치마크 상위 소재는 질문형 hook + CTA 하단 고정인데, 당신 소재는 hook 없음 + CTA 안 보임"
```

---

## 4. DB 스키마 변경

### creative_element_analysis 확장 (VIDEO 전용 필드)

```sql
-- 기존 필드 유지 + 아래 추가
ALTER TABLE creative_element_analysis ADD COLUMN IF NOT EXISTS
  audio_narration BOOLEAN,
  audio_narration_gender TEXT,
  audio_narration_tone TEXT,
  audio_narration_speed TEXT,
  audio_bgm BOOLEAN,
  audio_bgm_genre TEXT,
  audio_effects BOOLEAN,
  audio_subtitle BOOLEAN,
  audio_subtitle_style TEXT,
  audio_key_dialogue TEXT,
  video_scenes JSONB,          -- [{sec: "0-3", type: "hook", desc: "..."}, ...]
  video_pacing TEXT,            -- fast/medium/slow
  video_duration_sec NUMERIC,
  video_cut_count INTEGER,
  video_transition_pattern TEXT, -- hook→demo→CTA 등
  video_first_3s JSONB,        -- {hook_type, visual_desc, text}
  video_last_3s JSONB,         -- {cta_type, brand_shown, text}
  video_loop_friendly BOOLEAN;
```

### creative_saliency 확장 (VIDEO 키프레임)

```sql
ALTER TABLE creative_saliency ADD COLUMN IF NOT EXISTS
  video_frames JSONB;  -- [{frame_sec: 3, heatmap_url, fixations, cta_score}, ...]
```

### ad_creative_embeddings 확장

```sql
ALTER TABLE ad_creative_embeddings ADD COLUMN IF NOT EXISTS
  video_url TEXT,              -- 동영상 원본 URL (Meta source)
  video_local_path TEXT,       -- 로컬 저장 경로
  video_embedding_3072 vector(3072);  -- 동영상 직접 임베딩
```

---

## 5. 비용 추정

| 항목 | 건수 | 모델 | 단가 | 총비용 |
|------|------|------|------|--------|
| IMAGE L1 태깅 | 2,738건 (미완) | Gemini 2.5 Pro | $0.01/건 | ~$27 |
| VIDEO L1+Audio+Structure | 261건 | Gemini 2.5 Pro | $0.03/건 (30초 영상) | ~$8 |
| IMAGE 임베딩 | 2,738건 | Gemini Embedding 2 | 무료 | $0 |
| VIDEO 임베딩 | 261건 | Gemini Embedding 2 | 무료 | $0 |
| VIDEO 키프레임 히트맵 | 261건 × 3장 | DeepGaze (로컬) | 무료 | $0 |
| **합계** | | | | **~$35 (약 4.5만원)** |

일회성 비용. 이후 신규 소재는 크론에서 자동 처리.

---

## 6. 구현 우선순위

| 순서 | 작업 | 의존성 | 비용 |
|------|------|--------|------|
| **P0** | 동영상 원본 다운로드 (261건) | Meta API | 0원 |
| **P0** | 임베딩 크론 강화 (limit 200, 2시간마다) | 코드 수정 | 0원 |
| **P0** | LP 크롤러 복구 + 스크린샷 100% | Railway 재배포 | 0원 |
| **P1** | IMAGE L1 전량 (2,738건) | 크론 or 배치 | ~$27 |
| **P1** | VIDEO L1+Audio+Structure (261건) | 동영상 다운로드 완료 | ~$8 |
| **P1** | DB 스키마 확장 (VIDEO 필드) | 없음 | 0원 |
| **P2** | VIDEO 키프레임 히트맵 | 동영상 다운로드 완료 | 0원 |
| **P2** | VIDEO 동영상 직접 임베딩 | 동영상 다운로드 완료 | 0원 |
| **P3** | L4 종합 점수 전량 재계산 | L1 전량 완료 | 0원 |
| **P3** | AI 코칭 메시지 생성 | L1~L4 전량 완료 | 소량 |
