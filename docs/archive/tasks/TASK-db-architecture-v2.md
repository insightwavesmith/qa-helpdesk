# TASK: 수집→분석 전체 DB 구조 재설계

## ⚠️ 최우선 원칙

### 1. DB 구조를 **매우 잘** 짜야 한다.
지금 ad_creative_embeddings 테이블 하나에 다 때려넣은 구조는 한계.

### 2. 수강생 계정이 최상위다. 소재/LP가 메인이 아니다.
- **수강생 계정(brand/account) → 그 아래에 소재/LP/분석이 종속**
- 경쟁사면 **경쟁사 브랜드에 종속**
- 광고 소재, LP는 콘텐츠일 뿐. 주인(owner)은 계정 단위
- 모든 콘텐츠는 반드시 account/brand FK를 가져야 함

### 3. 콘텐츠 자체를 Storage에 저장
- 이미지 원본 ✅ (이미 있음)
- **영상 mp4 원본** ❌ (없음 → 수집 파이프라인 추가)
- **LP 스크린샷** (모바일+PC 섹션별) → Storage 저장

## 핵심 구조 (Smith님 지시)
```
수강생 계정 (accounts/brands) ← 최상위
├── 광고 소재 (creatives) — account_id FK
│   ├── 미디어 파일 (media) — 원본 이미지/mp4 Storage 저장
│   ├── 임베딩 (embeddings)
│   ├── 5축 분석 (analysis)
│   └── 시선 예측 (eye_tracking)
├── 랜딩페이지 (landing_pages) — account_id FK
│   ├── 스냅샷 (snapshots)
│   ├── LP 분석 (lp_analysis)
│   └── LP 임베딩
└── 성과 데이터 (performance)

경쟁사 브랜드 (competitor_brands)
├── 경쟁사 소재 — competitor_brand_id FK
└── 경쟁사 LP — competitor_brand_id FK
```

## 현재 문제
1. ad_creative_embeddings에 소재+임베딩+LP+성과 전부 한 테이블 → 정규화 안 됨
2. **소재가 계정에 종속되어 있지 않음** — account_id는 있지만 FK/인덱스 제대로 안 됨
3. 영상 mp4 원본 Storage 저장 안 됨 (썸네일만 있음)
4. 5축 분석 결과 저장 구조 없음
5. LP 정규화 테이블 별도 필요
6. 시선 예측 좌표 저장 구조 없음
7. LP 임베딩 재작업 필요

## 기대 동작

### 필요한 테이블 구조 (참고용 — 최적 구조는 팀이 설계)

**소재 관련:**
- `creatives` — 소재 마스터 (ad_id, media_type, account_id, brand_id 등)
- `creative_media` — 미디어 파일 (storage_url, media_hash, file_size, duration)
- `creative_embeddings` — 임베딩 벡터 (3072차원, 모델 버전)
- `creative_analysis` — 5축 AI 분석 결과 (visual, audio, text, structure, eye_tracking)
- `creative_performance` — 성과 데이터 (roas, ctr, cpc 등 — daily_ad_insights와 연결)

**LP 관련:**
- `landing_pages` — LP 마스터 (정규화된 URL, 상태)
- `lp_snapshots` — 크롤링 스냅샷 (모바일/PC, 섹션별 스크린샷)
- `lp_analysis` — LP AI 분석 결과 (8개 카테고리 + 전환 점수)
- `lp_embeddings` — LP 임베딩 벡터

**시선 예측:**
- `eye_tracking_data` — 초별 fixation 좌표 JSON (creative_id 참조)

**매핑:**
- `creative_lp_mapping` — 소재↔LP 연결 + 일관성 점수

### 마이그레이션 원칙
- 기존 ad_creative_embeddings 데이터 **보존** — 새 테이블로 마이그레이션
- 기존 API 엔드포인트 **호환성 유지** (폴백)
- 인덱스 설계 꼼꼼히 (pgvector HNSW, 복합 인덱스)

### 영상 mp4 수집 파이프라인 추가
- collect-daily 크론에서 VIDEO 소재 → Meta API video source URL → mp4 다운로드 → Supabase Storage 저장
- storage_url 업데이트

### LP 임베딩 재작업
- landing_pages 정규화 후
- 모바일+PC 섹션별 스크린샷 기반으로 재임베딩
- Gemini Embedding 2 (3072차원)

## 참고
- 기획서: mozzi-reports.vercel.app/reports/plan/2026-03-20-content-analysis-process-v2.html
- 데이터 아키텍처 v2: mozzi-reports.vercel.app/reports/plan/2026-03-20-data-architecture-v2
- 5축 분석 JSON 스키마: /Users/smith/.openclaw/workspace/memory/2026-03-20-video-analysis.md

## 산출물
- DB 마이그레이션 SQL
- 기존 데이터 이관 스크립트
- 영상 mp4 수집 파이프라인
- LP 재임베딩 스크립트
- 빌드 통과 필수
