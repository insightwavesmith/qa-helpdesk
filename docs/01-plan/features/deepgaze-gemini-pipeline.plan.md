# DeepGaze → Gemini 결합 분석 파이프라인 계획서

> 작성일: 2026-03-25
> 작성자: PM팀
> 상태: Plan 완료
> 원본 TASK: .claude/tasks/TASK-DEEPGAZE-GEMINI-PIPELINE.md

---

## 1. 개요

### 기능 설명

현재 5축 분석(analyze-five-axis.mjs)에서 Gemini가 소재를 **직접 보고 혼자 판단**하는 구조를
**DeepGaze III 시선 데이터를 먼저 뽑고, 그 결과를 Gemini에 주입**하는 결합 구조로 전환한다.

핵심 원칙:
- **DeepGaze** = "어디를 보는지" 객관적 데이터 제공자
- **Gemini** = "그래서 이게 효과적인가" 판단자
- DeepGaze 결과 + 소재 원본 → Gemini에 동시 전달 → 5축+Audio+Structure 결합 분석

### 해결하려는 문제 (Gemini 단독 부정확성)

Gemini가 소재만 보고 시선을 추정하면 **실제 인간 시선 패턴과 상당히 다른 결과**가 나온다.
Gemini는 "의미론적으로 중요한 요소"에 높은 가중치를 주지만, 실제 인간의 시선은
**시각적 돌출(saliency)** 기반으로 움직인다. 이 차이가 분석 정확도를 떨어뜨린다.

### 배경/맥락 (실측 비교 결과)

에어무드 영상 분석 실측 비교:

| 분석 방식 | 결과 | 정확도 |
|-----------|------|--------|
| **Gemini 단독** | "인물 50%, 텍스트 40%" | 부정확 |
| **DeepGaze → Gemini 결합** | "텍스트 65% 지배, 인물은 0초 훅에서만 70%" | 정확 |

DeepGaze+Gemini 결합은 시간대별 시선 변화까지 포착하여, 단순 비율이 아닌 **맥락적 판단**이 가능하다.

참고 목업: https://mozzi-reports.vercel.app/reports/plan/2026-03-23-video-mockup-v3

---

## 2. 핵심 요구사항

### 기능적 요구사항

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-01 | creative_media 소재에 대해 DeepGaze 시선 분석 실행, saliency_data(좌표/비율 JSON) 저장 | P0 |
| FR-02 | 이미지 소재: 단일 프레임 DeepGaze 분석 → saliency_data 저장 | P0 |
| FR-03 | 영상 소재: 프레임 추출(0초, 3초, 6초...) → 각 프레임 DeepGaze → video_saliency_frames 저장 | P0 |
| FR-04 | analyze-five-axis.mjs 프롬프트에 DeepGaze 결과를 추가 컨텍스트로 주입 | P0 |
| FR-05 | 이미지 소재: DeepGaze 주목 영역 비율 + 최고 주목점 좌표를 Gemini에 전달 | P0 |
| FR-06 | 영상 소재: 시간대별 시선 데이터(프레임별 fixation)를 Gemini에 전달 | P0 |
| FR-07 | LP 분석(analyze-lps-v2.mjs)에도 DeepGaze 히트맵 + LP HTML/스크린샷 → Gemini 결합 분석 적용 | P1 |
| FR-08 | LP에서 "CTA 버튼에 시선이 가는가", "핵심 오퍼에 주목하는가" 판단 | P1 |
| FR-09 | 크론 실행 순서 변경: DeepGaze → Gemini 분석 순서 보장 | P0 |

### 비기능적 요구사항

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | DeepGaze 크론이 Gemini 분석 크론보다 먼저 완료되어야 함 | 최소 2시간 간격 |
| NFR-02 | DeepGaze 분석 실패 시 Gemini 단독 분석으로 fallback | saliency_data NULL → 기존 프롬프트 사용 |
| NFR-03 | 기존 분석 결과(analysis_json) 호환성 유지 | 스키마 추가만, 삭제 없음 |
| NFR-04 | 배치 처리 안정성 | 개별 소재 실패 시 다음 건 진행, 전체 중단 방지 |
| NFR-05 | creative_media 3,022건 + LP 216건 전체 처리 가능 | Rate limit 준수 |

---

## 3. 파이프라인 변경 상세

### 기존 파이프라인 (8단계)

```
① 수집 (Meta API → Storage)
② Gemini 5축 분석 (Gemini 단독, 소재만 보고 판단)
③ DeepGaze 시선 분석 (별도 실행, 결과가 Gemini에 안 감)
④ 임베딩 (3072D)
⑤ 피로도/유사도
⑥ 벤치마크 백분위
⑦ 소재↔LP 일관성 (4축)
⑧ AI 처방 (impact순)
```

**문제**: ②번에서 Gemini가 혼자 판단 → ③번 DeepGaze 결과와 무관하게 동작

### 변경 파이프라인 (8단계) — Smith님 확정

```
① 수집 (Meta API → Storage)
② DeepGaze III 프레임별 시선 ← 여기로 이동 (기존 3번에서 2번으로)
③ DeepGaze 시선 + 소재 원본 → Gemini 3 Pro (5축+Audio+Structure 결합 분석)
④ 임베딩 (3072D)
⑤ 피로도/유사도
⑥ 벤치마크 백분위
⑦ 소재↔LP 일관성 (4축)
⑧ AI 처방 (impact순)
```

**핵심**: ②에서 DeepGaze가 먼저 시선 데이터를 뽑고 → ③에서 그 데이터를 Gemini에 주입

### 변경 영향 범위

| 영역 | 변경 내용 | 영향도 |
|------|----------|--------|
| DB 스키마 | creative_media에 saliency_data, video_saliency_frames 컬럼 추가 | 낮음 (추가만) |
| creative-saliency 크론 | 기존 이미지 전용 → saliency_data JSON 추가 저장 | 중간 |
| video-saliency 크론 | 프레임별 DeepGaze → video_saliency_frames 저장 | 중간 |
| analyze-five-axis.mjs | 프롬프트에 DeepGaze 데이터 주입 로직 추가 | 높음 (핵심 변경) |
| analyze-lps-v2.mjs | LP DeepGaze 히트맵 + LP 데이터 결합 분석 | 중간 |
| Cloud Scheduler | 크론 시간 재배정 | 낮음 |
| 기존 analysis_json | 스키마 호환 유지, 추가 필드만 | 낮음 |

---

## 4. 범위

### In Scope

1. **DB 스키마 변경**: creative_media에 saliency_data(JSONB), video_saliency_frames(JSONB) 컬럼 추가
2. **소재 DeepGaze 강화**: 기존 creative-saliency 크론 확장 — saliency_data JSON 저장 추가
3. **영상 DeepGaze 강화**: video-saliency 크론 확장 — 프레임별 시선 데이터 저장
4. **Gemini 프롬프트 수정**: analyze-five-axis.mjs에 DeepGaze 데이터 주입 로직 추가
5. **LP Gemini 결합 분석**: analyze-lps-v2.mjs에 LP DeepGaze 히트맵 데이터 주입
6. **크론 스케줄 변경**: DeepGaze → Gemini 순서 보장
7. **전체 배치 실행**: 기존 3,022건 소재 + 216건 LP 재분석

### Out of Scope

1. DeepGaze 모델 자체 변경/업그레이드 (기존 DeepGaze IIE 유지)
2. 프론트엔드 UI 변경 (분석 결과 표시 UI는 별도 TASK)
3. creative-pipeline(Cloud Run) 서버 코드 수정 (기존 /saliency, /lp-saliency 엔드포인트 활용)
4. 임베딩(④), 피로도(⑤), 벤치마크(⑥), 일관성(⑦), 처방(⑧) 단계 변경
5. 신규 AI 모델 도입

---

## 5. 크론 순서 변경

### 현재 크론 스케줄 (관련 크론만)

| KST 시간 | 크론 | 역할 | 비고 |
|----------|------|------|------|
| 18:00 | collect-daily | 소재 수집 | ① |
| — | creative-saliency | 이미지 DeepGaze | 별도 실행 |
| — | video-saliency | 영상 DeepGaze | 별도 실행 |
| — | analyze-five-axis (Cloud Run Job) | Gemini 5축 분석 | ② (DeepGaze 미참조) |
| 22:00 | embed-creatives | 임베딩 | ④ |

### 변경 크론 스케줄 (TASK 파일 시간표 반영)

| KST 시간 | 크론 | 역할 | 파이프라인 단계 |
|----------|------|------|--------------|
| 18:00 | collect-daily | 소재 수집 | ① |
| 19:00 | creative-saliency (강화) | 소재 DeepGaze 시선 + saliency_data 저장 | ② |
| 19:00 | video-saliency (강화) | 영상 프레임별 DeepGaze + video_saliency_frames 저장 | ② |
| 01:00 | analyze-five-axis | DeepGaze+소재 → Gemini 결합 분석 | ③ |
| 22:00 | embed-creatives | 임베딩 | ④ |
| 02:00 | fatigue-risk | 피로도 | ⑤ |
| 03:00 | andromeda-similarity | 유사도 | ⑤ |
| 02:00 | score-percentiles | 벤치마크 백분위 | ⑥ |
| 03:30 | lp-alignment | 소재↔LP 일관성 | ⑦ |
| — | (프론트 on-demand) | AI 처방 | ⑧ |

**핵심 변경 포인트**:
- creative-saliency/video-saliency: 19:00 (수집 완료 1시간 후)
- analyze-five-axis: 01:00 (DeepGaze 완료 보장 후 실행)
- 두 크론 사이 최소 6시간 간격으로 DeepGaze 완료를 충분히 보장

---

## 6. 성공 기준

| 기준 | 측정 방법 | 목표 |
|------|----------|------|
| saliency_data 채움률 | creative_media WHERE saliency_data IS NOT NULL | 이미지 95%+ |
| video_saliency_frames 채움률 | creative_media WHERE video_saliency_frames IS NOT NULL AND media_type='VIDEO' | 영상 90%+ |
| DeepGaze 데이터 주입률 | analyze-five-axis 로그에서 "DeepGaze 데이터 포함" 건수 | 95%+ |
| 분석 정확도 향상 | 에어무드 등 샘플 10건 수동 비교 (Gemini 단독 vs 결합) | 결합 결과가 더 정확 |
| 기존 기능 깨짐 없음 | tsc + build 통과 + 기존 API 정상 응답 | 0 에러 |
| LP 결합 분석 적용률 | analyze-lps-v2 로그에서 "DeepGaze 히트맵 포함" 건수 | 80%+ |

---

## 7. 리스크

| 리스크 | 확률 | 영향 | 완화 방안 |
|--------|------|------|----------|
| DeepGaze 크론이 Gemini 분석 전에 완료 안 됨 | 낮음 | 높음 | 크론 간격 6시간 + DeepGaze 미완료 시 Gemini 단독 fallback |
| DeepGaze 서비스(Railway) 장애 | 중간 | 중간 | fallback: saliency_data NULL이면 기존 프롬프트 사용 (결합 데이터 없이) |
| Gemini 프롬프트 길이 증가로 비용 상승 | 중간 | 낮음 | saliency_data 요약본만 전달 (전체 좌표 X, 비율+주요 포인트만) |
| 영상 프레임 추출 실패 | 낮음 | 낮음 | 실패한 프레임 스킵, 가용 프레임만으로 분석 |
| DB 마이그레이션 시 기존 데이터 영향 | 매우 낮음 | 높음 | ADD COLUMN IF NOT EXISTS + DEFAULT NULL (기존 행 무변경) |
| 전체 배치 재실행 비용 (Gemini API) | 확실 | 중간 | 기존 analysis_json 있는 건은 --force 옵션 없이 스킵 가능 |

---

## 8. Executive Summary

현재 5축 분석 파이프라인은 Gemini가 소재를 혼자 보고 시선을 추정하는 구조로, 실측 비교 결과
부정확한 결과를 생성한다. Smith님 확정 파이프라인에 따라 DeepGaze III 시선 분석을 Gemini **앞으로**
이동하여, DeepGaze가 먼저 "어디를 보는지" 객관적 데이터를 뽑고 그 결과를 Gemini에 주입하는
결합 구조로 전환한다.

주요 변경:
1. creative_media에 saliency_data(JSONB), video_saliency_frames(JSONB) 컬럼 추가
2. creative-saliency/video-saliency 크론 강화 (시선 좌표/비율 JSON 저장)
3. analyze-five-axis.mjs 프롬프트에 DeepGaze 결과 주입
4. analyze-lps-v2.mjs에 LP DeepGaze 히트맵 결합 분석 적용
5. 크론 스케줄 재배정 (DeepGaze 19:00 → Gemini 01:00)

현재 구현 상태와의 갭:
- DeepGaze 시선 히트맵: 2,926/3,022건 완료 (97%) — 히트맵 이미지는 있으나 **좌표/비율 JSON(saliency_data)은 미저장**
- 5축 Gemini 분석: 496/3,022건 완료 (16%) — **DeepGaze 데이터 미주입 상태**
- LP 분석: Gemini 단독 분석 중 — **DeepGaze 결합 미적용**
