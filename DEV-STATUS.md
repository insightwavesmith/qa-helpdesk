# DEV-STATUS — 2026-03-22 기준

## 현재 상태 요약

| 항목 | 값 |
|------|-----|
| 마지막 완료 TASK | P0-1 DB 스키마 v3 적용 (커밋 `6f70f83`) |
| 전체 Match Rate | ~46% (83항목 중 34 완료) |
| 다음 TASK | T2: 5축 스키마 확정 + 프롬프트 재설계 |
| 체크리스트 | `docs/00-overview/full-task-checklist.md` |
| 실행 플랜 | `docs/01-plan/features/architecture-v3-execution-plan.md` |

---

## P0-1 DB 스키마 v3 — ✅ 완료 (2026-03-22)

커밋 `6f70f83` — SQL 마이그레이션 9섹션 Supabase 적용

| 변경 | 상세 |
|------|------|
| source 전환 | `bscamp` → `member` (3,096행) + CHECK 제약 |
| creative_media | +saliency_url, is_active, updated_at |
| landing_pages | +content_hash, last_crawled_at |
| lp_analysis | +reference_based, data_based, eye_tracking (JSONB) |
| creative_lp_map | +message/cta/offer_alignment, overall_score, issues |
| competitor_ad_cache | +analysis_json |
| lp_click_data | 신규 테이블 |
| change_log | 신규 테이블 |
| RPC | get_student_creative_summary 등 source='member' |

---

## 전체 챕터별 진행률 (83항목)

| 챕터 | Match Rate | 완료 | 부분 | 미구현 |
|------|-----------|:----:|:----:|:-----:|
| 1. 전체 아키텍처 | 58% | 7 | 2 | 3 |
| 2. 수집 | 55% | 8 | 4 | 6 |
| 3. 저장 | 79% | 10 | 1 | 3 |
| 4. LP 분석 | 25% | 3 | 2 | 11 |
| 5. 소재 분석 | 40% | 5 | 3 | 7 |
| 6. 순환 학습 | 25% | 2 | 1 | 5 |
| **합계** | **~46%** | **35** | **13** | **35** |

상세: `docs/00-overview/full-task-checklist.md`

---

## 배치 처리 현황

| 항목 | 완료 | 전체 | 비율 |
|------|-----:|-----:|-----:|
| 소재 (ad_creative_embeddings) | — | 3,096 | — |
| 임베딩 3072 | 358 | 3,096 | 12% |
| LP 크롤링 | 1,736 | 1,796 | 97% |
| Saliency 히트맵 | 2,711 | 2,873 | 94% |
| 미디어 Storage | 2,873+ | 3,096 | 93%+ |
| 진단 캐시 | 완료 | ~400 | 100% |
| Creative Intelligence | 358 | 3,096 | 12% |
| 경쟁사 모니터 | 62 | — | — |

---

## Railway 서비스 상태

| 서비스 | 상태 | 비고 |
|--------|:----:|------|
| creative-pipeline | ✅ | L1+L2+L3+L4 파이프라인 |
| saliency (predict.py) | ✅ | DeepGaze IIE, 2,711건 |
| bscamp-crawler | ✅ | Playwright, 공유 브라우저 |
| mozzi-reports | ✅ | Express 정적 서버 |

---

## 다음 실행 순서 (T1 완료 기준)

```
즉시:  T2 5축 스키마 확정 + 프롬프트 재설계
1주:   T2-A 속성값 3단계 → T2-B 피로도 → T2-C 벤치마크 상대값 → T3 듀얼 라이트
2주:   T4 LP 크롤링 v2 → T5 LP 2축 분석
3주:   T6 Audio → T7 Eye Tracking → T9 creative_lp_map
4주+:  T8 Andromeda → T10 교차분석 → T11 경쟁사
```

---

## 파일 정리 (2026-03-22)

- 루트 TASK-*.md 64개 → `docs/archive/tasks/`로 이동
- 루트에 남은 파일: `TASK.md`, `TASK.template.md`
- 이전 아카이브: `.claude/tasks-archive/` (76개, 2026-03-09 이전)
