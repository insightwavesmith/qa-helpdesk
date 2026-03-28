# Creative Saliency (Layer 2) — Plan

## 요약
광고 소재 이미지의 시선 예측(Saliency Prediction)을 수행하여, CTA 주목도 점수·상위 시선 좌표·히트맵 이미지를 자동 생성한다.

## 배경
- Creative Intelligence 5 Layer 중 Layer 2
- Layer 1(요소 태깅)이 "무엇이 있는가"를 분석한다면, Layer 2는 "사용자가 어디를 보는가"를 예측
- 소재 효과 개선의 핵심 인사이트: CTA 버튼에 시선이 가는지, 핵심 메시지가 주목받는지

## 범위
- DeepGaze IIE 모델 기반 시선 예측 (Python, CPU 추론)
- ad_creative_embeddings에서 IMAGE 소재만 대상
- 히트맵 이미지 → Supabase Storage (creatives 버킷)
- 분석 결과 → creative_saliency 테이블

## 성공 기준
- [ ] creative_saliency 테이블에 분석 결과 저장
- [ ] Supabase Storage에 히트맵 이미지 업로드
- [ ] CTA 주목도 점수(0~1) 산출
- [ ] top fixation 좌표 3~5개 추출
- [ ] CPU 추론 1건당 10초 이내
- [ ] tsc + build 통과 (Python 스크립트는 별도)

## 비용
- $0 (로컬 CPU 추론, 오픈소스 모델)

## 의존성
- Layer 1 완료 (creative_element_analysis에 cta_position 등 필요)
- ad_creative_embeddings에 media_url 존재
- Supabase Storage creatives 버킷

## 기술 스택
- Python 3.11+
- deepgaze-pytorch (DeepGaze IIE)
- torch (CPU)
- Pillow, numpy, matplotlib
- supabase-py (Storage 업로드)
