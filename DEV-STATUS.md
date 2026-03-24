# DEV-STATUS — 2026-03-24 최종

## 현재 상태 요약

| 항목 | 값 |
|------|-----|
| 마지막 업데이트 | 2026-03-24 |
| 전체 Match Rate | 98% (84항목 중 82 완료, 2 BLOCKED) |
| 남은 BLOCKED | 2건 — 비회원 ad_accounts(DB구조) + M4 Max(HW) |
| 오늘 커밋 | 5건 (e1e5656 ~ 62176ba) |
| 인프라 | GCP Cloud Run + Cloud SQL + GCS + Vercel |

---

## 인프라 구조 (2026-03-24 기준)

| 서비스 | 플랫폼 | 엔드포인트 / 상세 |
|--------|--------|------------------|
| **프론트엔드** | Vercel | `bscamp.vercel.app` (Next.js 15 App Router) |
| **크론/API** | GCP Cloud Run | `bscamp-cron-906295665279.asia-northeast3.run.app` (1GB, 3600초) |
| **배치 스크립트** | GCP Cloud Run Jobs | `bscamp-scripts` (crawl-lps, five-axis 등 6개 Job) |
| **DB** | GCP Cloud SQL (PostgreSQL) | `34.50.5.237` (asia-northeast3) |
| **Storage** | GCS | `bscamp-creatives` 버킷 (소재/LP/벤치마크 미디어) |
| **크롤러** | Railway (유지) | Playwright 브라우저 크롤러 |
| **시선 분석** | Railway (유지) | DeepGaze IIE (Python, CPU PyTorch) |
| **크론 스케줄러** | GCP Cloud Scheduler | 21개 (서비스 15 + 잡 6) |
| **모찌 리포트** | Railway (유지) | Express 정적 서버 |

### 인프라 이관 이력
- **3/23**: Railway → GCP Cloud Run 이관 완료 (Phase 1~5)
- **3/23**: Vercel crons 전체 제거 → Cloud Scheduler 전환
- **3/23**: Supabase → Cloud SQL DB 전환 (scripts/lib/cloud-sql.mjs 공유 모듈)
- Railway 2개 서비스(Playwright + DeepGaze)만 유지 — Cloud Run GPU 미지원으로 잔류

---

## 오늘 (3/24) 커밋 정리

| 해시 | 시간 | 내용 |
|------|------|------|
| `e1e5656` | 00:01 | feat: 수집 구조 리팩토링 — is_member/is_benchmark 플래그 + creative_media raw_creative |
| `89bb8e1` | 10:26 | chore: 수집→저장→분석 구조 코드리뷰 보고서 |
| `be81753` | 10:39 | feat: Wave 1 — creative_media 1:N 전환 + CAROUSEL 재분류 + onConflict 수정 (8파일) |
| `7114e03` | 11:19 | feat: Wave 2-3 — CAROUSEL 수집 + 하류 카드별 처리 + 아키텍처 다이어그램 (14파일 +616줄) |
| `62176ba` | 11:38 | feat: collect-benchmarks is_benchmark 자동 태깅 — 형식별 MEDIAN_ALL 참여율+전환순위 기준 |

### 주요 변경 내용
1. **CAROUSEL 1:N 전환**: creative_media가 1광고=1행 → 1광고=N행(카드별) 구조로 전환
2. **하류 파이프라인 대응**: 임베딩/5축/DeepGaze 모두 카드별 독립 처리
3. **수집 코드리뷰**: 13개 변경점 도출 → CRITICAL(CAROUSEL 누락) 포함 전부 해결
4. **is_benchmark 자동 태깅**: 형식별 MEDIAN_ALL 참여율 + 전환순위 평균 이상 기준

---

## Migration 적용 상태

### 오늘 (3/24) 적용된 마이그레이션
| 파일 | 줄수 | 내용 |
|------|-----:|------|
| `20260324_collection_refactor.sql` | 17 | is_member/is_benchmark 플래그 + raw_creative 컬럼 |
| `20260324_raw_jsonb_collection.sql` | 143 | raw JSONB 수집 구조 (Meta API 원본 저장 + 트리거 자동 추출) |
| `20260324_wave1_carousel_schema.sql` | 30 | position/card_total/lp_id + UNIQUE 변경 + CAROUSEL 재분류 |

### 전체 마이그레이션 현황
- 총 마이그레이션 파일: 74개 (00001 ~ 20260324)
- DB 테이블: ~60개 (v1 15개 DROP 후 정리 완료)
- 최신 스키마: v3 (정규화 테이블 구조, creative_media 1:N)

---

## DB 현황

| 항목 | 값 | 비고 |
|------|-----|------|
| 전체 테이블 | ~60개 | v1 15개 DROP 완료 (3/23) |
| creative_media | 3,022+ | IMAGE 2,870 / VIDEO 152 / CAROUSEL 신규 |
| daily_ad_insights | — | 39계정 258광고 일일 수집 |
| landing_pages | 216+ | LP URL 정규화 완료 |
| lp_snapshots | 277+ | 스크린샷 + HTML + 미디어 |
| ad_creative_embeddings | 2,917+ | 768차원 임베딩 (97%) |
| creative_saliency | 2,926+ | DeepGaze IIE 시선 히트맵 (97%) |
| Gemini 5축 분석 | 496 | 16% — 배치 실행 대기 |
| 경쟁사 모니터 | 62건 | L1 분석 완료 |
| 벤치마크 소재 | 24건 | IMAGE 16 + VIDEO 8 |
| 벡터 DB | Cloud SQL (pgvector) | 768차원 + HNSW 인덱스 |

---

## PDCA 완료 현황 (37개 기능)

### 완료 (completed / deployed)
| 기능 | Match Rate | 완료일 | 핵심 |
|------|-----------|--------|------|
| protractor-refactoring | — | 3/22 | Architecture v3로 통합 |
| invite-expiry | — | 3/08 | 초대 만료 |
| embedding-v2-migration | — | 3/18 | 768→3072 듀얼 |
| phase2-creative-embedding | — | 3/18 | 소재 임베딩 352건 |
| lp-crawling-qa | — | 3/18 | LP 77건 크롤링 |
| meta-embedding-arch | 92% | 3/22 | Phase 1+2 완료 |
| lp-mobile-crawl | 95% | 3/19 | 모바일 크롤링 33건 |
| creative-analysis-tab | — | 3/22 | 소재 분석 탭 |
| collect-daily-media-url | — | 3/22 | media_url fallback |
| creative-intelligence | 93% | 3/22 | L4 358건 |
| creative-saliency | 93% | 3/22 | DeepGaze 2,784건 |
| railway-l2-batch | 100% | 3/18 | DeepGaze Railway |
| creative-pipeline-railway | 97% | 3/18 | Express 파이프라인 |
| admin-mobile-responsive | 100% | 3/18 | 13페이지 반응형 |
| batch-scripts-step4-7 | — | 3/20 | STEP 1~7 완료 |
| benchmark-color-fix | — | 3/19 | 벤치마크 색상 수정 |
| cron-batch-split | — | 3/20 | collect-daily 4분할 |
| competitor-l1-analysis | — | 3/22 | 3,848건 큐 |
| db-restructure-phase1 | 92% | 3/22 | LP 정규화 |
| collect-daily-v2 | 95% | 3/21 | 정규화 UPSERT |
| p0-db-schema-v3 | — | 3/22 | 스키마 v3 적용 |
| five-axis-analysis | 96% | 3/22 | T2 전체 완료 |
| embed-creatives-dual-write | 97% | 3/22 | 듀얼 라이트 |
| crawl-lps-v2 | 95% | 3/22 | v2 route 재작성 |
| lp-analysis-v2 | 93% | 3/22 | Gemini 8카테고리 |
| video-audio-axis | 96% | 3/22 | 영상 Audio축 |
| video-eye-tracking | 97% | 3/22 | Canvas 히트맵 |
| andromeda-signals | 96% | 3/22 | 4축 Jaccard |
| creative-lp-alignment | 95% | 3/22 | 4축 일관성 |
| lp-data-analysis | 96% | 3/22 | LP 교차분석 |
| competitor-five-axis | 97% | 3/22 | 경쟁사 5축 |
| pipeline-bugfix-b5-b11 | — | 3/23 | 버그 7건 수정 |
| gcp-cloudrun-migration | — | 3/23 | Cloud Run 이관 |
| db-cleanup-v1-tables | — | 3/23 | 73→60 테이블 |
| railway-to-gcp | — | 3/23 | Railway URL 전환 |
| lp-media-download | — | 3/23 | HTML→미디어 다운로드 |
| collection-refactor | — | 3/24 | is_member/is_benchmark |
| collection-review | — | 3/24 | 코드리뷰 13건 |
| wave1-schema | — | 3/24 | CAROUSEL 1:N |
| wave2-3-collection | 95% | 3/24 | CAROUSEL 하류 대응 |
| benchmark-auto-tagging | — | 3/24 | is_benchmark 자동 |

### 진행 중 (implementing / testing)
| 기능 | 상태 | 비고 |
|------|------|------|
| gcp-migration | testing | Phase 1-5 완료, Phase 6(Production) 대기 |
| e2e-pipeline-neonvelo | implementing | 네온벨로 E2E 파이프라인 검증 |
| cloud-run-jobs-crawl-lps | implementing | LP 216건 재크롤링 |

---

## 배치 처리 현황

| 항목 | 완료 | 전체 | 비율 |
|------|-----:|-----:|-----:|
| 소재 (creative_media) | 3,022 | 3,022+ | 100% |
| 임베딩 768차원 | 2,917 | 3,022 | 97% |
| LP 크롤링 | 1,796+ | 1,796+ | 100% |
| DeepGaze 시선 히트맵 | 2,926 | 3,022 | 97% |
| 미디어 Storage | 2,873+ | 3,022 | 95%+ |
| Gemini 5축 분석 | 496 | 3,022 | 16% |
| 진단 캐시 | 완료 | ~400 | 100% |
| 경쟁사 모니터 | 62 | — | — |
| 벤치마크 소재 | 24 | — | — |
| 처방(Prescription) | 0 | — | 미구현 |

---

## Cloud Scheduler 크론 (21개)

| 카테고리 | 개수 | 내용 |
|----------|-----:|------|
| 수집 | 5 | collect-daily, collect-benchmarks, collect-clicks 등 |
| 분석 | 6 | five-axis, creative-saliency, lp-analysis, fatigue 등 |
| LP | 3 | crawl-lps, lp-saliency, lp-change-detection |
| 사전계산 | 3 | precompute, percentiles, andromeda |
| 기타 | 4 | track-performance, health 등 |

---

## BLOCKED 항목 (2건)

| # | 항목 | 사유 | 해소 방법 |
|---|------|------|----------|
| 1 | 비회원 ad_accounts | ad_accounts.user_id NOT NULL + RLS | DB 스키마 변경 + Meta BM 토큰 |
| 2 | M4 Max 로컬 | HW 전환 | GCP + Railway로 대체 완료 |

---

## 대기 중인 TASK 파일

| 파일 | 내용 | 우선순위 |
|------|------|---------|
| TASK-BATCH.md | 5축 배치 2,526건 + 벤치마크 수집 | **높음** |
| TASK-PRESCRIPTION.md | 처방 시스템 구현 (2축 합산) | 높음 |
| TASK-CRON-CLEANUP.md | 크론 중복 정리 + API 엔드포인트 전수 체크 | 중간 |
| TASK-DB-CLEANUP.md | DB 불필요 테이블/데이터 추가 정리 | 중간 |
| TASK-ENV-AUDIT.md | 환경변수 전수 점검 및 누락 등록 | 중간 |
| TASK-GCP.md | GCP Phase 6 Production 전환 | 높음 |
| TASK-GCP-MIGRATION.md | GCP 이관 세부 체크리스트 | 완료 근접 |

---

## 다음 할 일 (우선순위)

1. **Gemini 5축 배치 실행** — 2,526건 미분석 (현재 16%) → Cloud Run Job으로 전체 처리
2. **GCP Phase 6: Production 전환** — Cloud SQL을 Vercel 프론트에서 직접 연결, Supabase 완전 이관
3. **크론 중복 정리** — Cloud Scheduler 21개 중 중복 의심 쌍 정리 + 타임존 수정
4. **처방 시스템 구현** — 5축 결과 기반 자동 처방 생성 (prescription_patterns 테이블)
5. **CAROUSEL 배치 backfill** — 기존 소재 CAROUSEL 카드별 재수집 (90일분)
6. **환경변수 전수 점검** — 29개 환경변수 Vercel/Cloud Run 누락 확인
