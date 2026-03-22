---
name: master_architecture_decisions
description: 마스터 설계서 기반 아키텍처 결정사항 (2026-03-22 Smith님 확정)
type: project
---

마스터 설계서 리뷰 후 Smith님이 확정한 아키텍처 결정 6건.

**Why:** 기획서 6탭 리뷰(docs/04-review/master-architecture-review.md) 기반 실행 방향 확정.

**결정사항:**
1. 경쟁사 소재 = competitor_ad_cache 별도 유지. creatives 테이블에 통합하지 않음. analysis_json 컬럼만 추가.
2. LP = 전부 다운로드 (리사이즈해서 용량 줄이기). HTML/이미지/GIF/영상 전부.
3. LP 섹션 = 표준 9개(hero/price_option/review_summary/detail_description/detail_review/faq_shipping/bottom_cta/brand_story/certification) + 자유 추가.
4. Mixpanel = Autocapture 활성화 확인됨. Query API 읽기만 → 추가 과금 없음.
5. 벤치마크 콘텐츠 = collect-benchmarks에 넣지 말고 별도 크론(collect-benchmark-creatives) 분리.
6. 실행 환경 = 전부 로컬(M4 Max 32GB). Vercel 크론은 가벼운 수집만. 무거운 분석은 로컬 crontab.

**나중에 (Phase 3):** LP 변경 감지(카페24 API) + confidence 기준

**How to apply:** 모든 TASK에서 이 결정사항 준수. 특히 competitor 통합 안 함, LP 전체 다운로드, 로컬 실행 기준.
