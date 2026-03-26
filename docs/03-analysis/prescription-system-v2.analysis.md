# 처방 시스템 v2 Gap 분석

> 분석일: 2026-03-26
> 설계서: docs/02-design/features/prescription-system-v2.design.md
> 기능: 3축 통합 처방 엔진

---

## Match Rate: 100%

## 일치 항목 (20/20)

### Phase 2: 기반 인프라 (6/6)
| # | 설계 항목 | 구현 파일 | 줄 수 | 일치 |
|:-:|----------|----------|:-----:|:----:|
| 2-1 | prescription_patterns DDL | Cloud SQL | - | ✅ |
| 2-2 | prescription_benchmarks DDL | Cloud SQL | - | ✅ |
| 2-3 | 패턴 추출 스크립트 | scripts/extract-prescription-patterns.mjs | 279 | ✅ |
| 2-4 | 축1 처방 가이드 | src/lib/protractor/prescription-guide.ts | 240 | ✅ |
| 2-5 | Motion 벤치마크 seed | scripts/seed-prescription-benchmarks.mjs | 195 | ✅ |
| 2-6 | TypeScript 타입 | src/types/prescription.ts | 459 | ✅ |

### Phase 3: 처방 엔진 (8/8)
| # | 설계 항목 | 구현 파일 | 줄 수 | 일치 |
|:-:|----------|----------|:-----:|:----:|
| 3-1 | 성과역추적 | src/lib/protractor/performance-backtracker.ts | 189 | ✅ |
| 3-2 | EAR 분석 | src/lib/protractor/ear-analyzer.ts | 94 | ✅ |
| 3-3 | Andromeda 분석 | src/lib/protractor/andromeda-analyzer.ts | 320 | ✅ |
| 3-4 | 벤치마크 조회 | src/lib/protractor/benchmark-lookup.ts | 102 | ✅ |
| 3-5 | Gemini 프롬프트 | src/lib/protractor/prescription-prompt.ts | 387 | ✅ |
| 3-6 | 13단계 엔진 메인 | src/lib/protractor/prescription-engine.ts | 581 | ✅ |
| 3-7 | 처방 API 라우트 | src/app/api/protractor/prescription/route.ts | 53 | ✅ |
| 3-8 | 벤치마크 시드 API | src/app/api/protractor/benchmarks/collect/route.ts | 143(수정) | ✅ |

### Phase 4: UI 컴포넌트 (6/6)
| # | 설계 항목 | 구현 파일 | 줄 수 | 일치 |
|:-:|----------|----------|:-----:|:----:|
| 4-1 | PrescriptionPanel | src/components/protractor/PrescriptionPanel.tsx | 220 | ✅ |
| 4-2 | CustomerJourneyBreakdown | src/components/protractor/CustomerJourneyBreakdown.tsx | 87 | ✅ |
| 4-3 | PrescriptionList | src/components/protractor/PrescriptionList.tsx | 110 | ✅ |
| 4-4 | AndromedaAlert | src/components/protractor/AndromedaAlert.tsx | 86 | ✅ |
| 4-5 | FiveAxisScorecard | src/components/protractor/FiveAxisScorecard.tsx | 77 | ✅ |
| 4-6 | PerformanceBacktrack | src/components/protractor/PerformanceBacktrack.tsx | 143 | ✅ |
| 4-7 | BenchmarkComparison | src/components/protractor/BenchmarkComparison.tsx | 86 | ✅ |
| 4-8 | 처방 탭 통합 | src/app/(main)/protractor/creative/[id]/prescription-tab.tsx | 16 | ✅ |

## 불일치 항목

없음

## 빌드 검증

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | ✅ 에러 0 |
| `npm run build` | ✅ 성공 |
| DB 테이블 생성 | ✅ prescription_patterns, prescription_benchmarks |

## Supabase/Vercel 의존성 0% (병렬 검증)

| 항목 | 결과 |
|------|------|
| src/ supabase.co | 0건 |
| src/ @supabase/ | 0건 |
| src/ vercel | 0건 |
| .env SUPABASE_ | 0건 |
| .env VERCEL_ | 0건 |
| package.json supabase | 0건 |
| DB supabase.co URL | 0건 |
| Firebase Auth | 35명 bcrypt 임포트 완료 |
| DB 이미지 URL | storage.googleapis.com 사용 |

## 수정 필요

1. **[Phase 5]** 처방 품질 수동 검토 50건 — Smith님 + qa-engineer 공동 진행
2. **[Phase 5]** 프롬프트 튜닝 — 처방 결과 품질 확인 후 진행
3. **[Phase 5]** 패턴 추출 크론 등록 (주 1회)

## 요약

- **신규 파일**: 19개 (3,724줄)
- **수정 파일**: 3개 (supabase.co 참조 제거 + 벤치마크 API 확장)
- **DB 테이블**: 2개 (prescription_patterns, prescription_benchmarks)
- **Match Rate**: 100% (20/20 일치)
