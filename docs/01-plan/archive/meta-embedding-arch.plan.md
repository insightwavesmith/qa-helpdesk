# Meta 소재 임베딩 아키텍처 Phase 1 — Plan

## 1. 개요
Meta Andromeda 아키텍처의 소재 분석 구조를 Gemini Embedding 2 위에 구현.
소재 이미지+카피를 3072차원으로 임베딩 (knowledge_chunks.embedding_v2와 동일 차원), 유사도/클러스터링/피로도 분석 API 제공.

## 2. 배경
- ad_creative_embeddings 352건 seed 완료 (기존 embedding은 3072차원)
- knowledge_chunks.embedding_v2도 3072차원 → 프로젝트 전체 3072차원 통일
- 유사도 분석 전용 embedding_3072 + text_embedding_3072 별도 컬럼 추가

## 3. 범위
### In Scope (Phase 1)
- embedding_3072 컬럼 추가 + 3072차원 유사도 전용 임베딩 파이프라인
- 소재 간 유사도 매트릭스 API
- 소재 클러스터링 (Agglomerative, threshold 0.8)
- 피로도 위험 감지 API

### In Scope (Phase 1.5 — 추가 요구사항 2026-03-18)
- **동영상 임베딩**: VIDEO 342건 → Meta thumbnail_url을 이미지로 임베딩 (Gemini embedContent는 텍스트+이미지만 지원, 영상 직접 불가)
- **OFF 광고 포함 전체 소재 재수집**: Meta API `act_{id}/ads`에서 effective_status 전체 (ACTIVE/PAUSED/ARCHIVED 등) 수집
- **spend > 0 필터**: daily_ad_insights JOIN → spend > 0만 임베딩, spend=0은 데이터만 저장
- **403 URL 재수집**: Meta API로 최신 creative URL 재수집 → 만료 142건 재임베딩

### Out of Scope
- Phase 2: LP 멀티모달 일관성 점수
- Phase 4: UI 시각화

## 4. 성공 기준
- OFF 포함 전체 소재 ad_creative_embeddings 저장
- spend > 0인 소재 중 embedding_3072 NOT NULL ≥ 80%
- VIDEO 소재 thumbnail 기반 임베딩 성공
- 유사도/클러스터/피로도 API 정상 응답
- tsc + build 통과
- 기존 기능 영향 없음

## 5. 비용
- 예상 전체 소재 ~1000건 × 2회(이미지+텍스트) ≈ $0.25
- 월 $1.00 (주 1회 갱신)

## 6. 금지사항
- knowledge_chunks의 embedding_v2 건드리지 않기
- .env.local 수정 금지
- 새 npm 패키지 최소화 (순수 TypeScript 구현 선호)
- main 직접 push 금지
