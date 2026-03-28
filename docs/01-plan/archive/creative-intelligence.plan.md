# Creative Intelligence — 5 Layer 소재+LP 통합 분석 시스템 — Plan

## 1. 개요
수강생 광고 소재와 LP를 5레이어로 분석하고, 실제 성과 데이터(ROAS/CTR) 기반 제안을 자동 생성.
차별점: 소재+LP+실제성과 3자 연결 — 경쟁사(Alison.ai, AdCreative.ai)는 소재만 분석.

## 2. 범위
### In Scope (이번 구현)
- **Layer 1**: Gemini 2.0 Pro 기반 소재 요소 태깅 (format, hook, color, style, CTA 등)
- **Layer 3**: daily_ad_insights 성과 데이터 ↔ 요소 상관관계 벤치마크
- **Layer 4**: 종합 점수(5개 카테고리) + 구체적 개선 제안(벤치마크 수치 포함)

### Out of Scope
- Layer 2 (시선 예측): Python 별도 구현, 추후
- Layer 5 (LP 일관성 확장): 기존 creative_lp_consistency 확장, 추후
- UI: 이번은 API + 스크립트만

## 3. 성공 기준
- creative_element_analysis에 태깅 결과 저장 확인
- creative_element_performance 벤치마크 통계 생성
- creative_intelligence_scores에 점수 + 제안 확인
- 제안의 구체성: 벤치마크 수치 + 구체적 액션 포함
- tsc + build 통과
- 기존 기능 영향 없음

## 4. 구현 순서
1. SQL 마이그레이션 (4테이블 + ALTER)
2. Layer 1: scripts/analyze-creatives.mjs + POST /api/admin/creative-analysis/run
3. Layer 3: scripts/compute-benchmarks.mjs + GET /api/admin/creative-benchmark
4. Layer 4: scripts/score-creatives.mjs + POST /api/admin/creative-intelligence/score + GET /api/admin/creative-intelligence
5. tsc + build 검증

## 5. 금지사항
- 기존 테이블 구조 파괴 금지 (ALTER ADD만)
- .env.local 수정 금지
- main 직접 push 금지
