# 코드리뷰: 벤치마크 점수 산출 + 콘텐츠 관리 구조

**분석일**: 2026-03-09

---

## T1: 벤치마크 × 총가치각도기 점수 산출 구조

### 현재 구조

#### 데일리 수집 creative_type 분류
- **파일**: `src/lib/protractor/meta-collector.ts:78~88`
- VIDEO → `"VIDEO"`, SHARE → `"SHARE"`, IMAGE → `"IMAGE"`, 그 외 → `"UNKNOWN"`
- **SHARE를 그대로 저장** (CATALOG으로 변환하지 않음)

#### 벤치마크 수집 creative_type 분류
- **파일**: `src/app/api/cron/collect-benchmarks/route.ts:141~151`
- VIDEO → `"VIDEO"`, SHARE → `"CATALOG"`, IMAGE+product_set_id → `"CATALOG"`, IMAGE → `"IMAGE"`
- **SHARE를 CATALOG으로 변환** (데일리와 다름)

#### 매칭 흐름도
```
1. daily_ad_insights 조회 → creative_type: VIDEO / SHARE / IMAGE / UNKNOWN
2. getDominantCreativeType(rows) → 최빈값 선택 (예: "SHARE")
3. fetchBenchmarks(svc, "SHARE") → benchmarks에 SHARE 없음 → 0행
4. fallback: benchmarks에서 "ALL" 조회 → ALL도 없음 → 0행
5. benchMap 빈 객체 → 모든 지표 점수 0, C등급
```

### 문제점

| 구분 | daily_ad_insights | benchmarks |
|------|-------------------|-----------|
| 카탈로그 광고 | `SHARE` | `CATALOG` |
| 불명확 광고 | `UNKNOWN` | 존재 안 함 |
| fallback | `ALL` 조회 | `ALL` 타입 저장 안 함 |

**SHARE 비중이 높은 계정 → dominantCT="SHARE" → 벤치마크 0건 → 점수 0점**

### Smith님 결정: "creative_type 구분 없이 전체 평균으로 통일"

#### 최소 변경 범위 (3파일)

| 파일 | 위치 | 변경 내용 |
|------|------|----------|
| `collect-benchmarks/route.ts` | L526~556 (STEP 2), L561~579 (STEP 3) | `creativeTypes` 루프 제거, `creative_type: "ALL"` 고정 |
| `total-value/route.ts` | L142, L168 | `dominantCT = "ALL"` 고정, getDominantCreativeType 호출 제거 |
| `total-value/route.ts` | L44~63 | fallback 블록 삭제 (ALL 직접 조회로 통합) |

- `meta-collector.ts` — 변경 불필요 (데일리 수집은 분석용으로 유지)
- `t3-engine.ts` — getDominantCreativeType 함수 삭제 (선택적)

---

## T2: 정보공유 × 큐레이션 × 콘텐츠 관리 구조

### source_type 값 목록

| 값 | 의미 | 생성 경로 |
|---|---|---|
| `blueprint` | 블루프린트 강의 | 외부 크롤러/임포트 |
| `lecture` | 사관학교 강의 | 외부 크롤러/임포트 |
| `youtube` | YouTube 트랜스크립트 | 외부 크롤러 |
| `crawl` | 블로그 크롤링 | 외부 크롤러 |
| `marketing_theory` | 마케팅원론 | 외부 크롤러 |
| `info_share` | 큐레이션 생성물 | `createInfoShareDraft()` |
| `manual` | 직접 작성 | 관리자 |

### 전체 데이터 흐름도

```
외부 크롤러 → contents (source_type: crawl/youtube/blueprint/lecture)
                  ↓
큐레이션 탭 (curation_status: new/selected, source_type != info_share)
                  ↓  [관리자 1~4개 선택]
/api/admin/curation/generate (Claude + RAG + Unsplash)
                  ↓
GeneratePreviewModal → createInfoShareDraft()
                  ↓
contents (source_type: info_share, status: draft)
                  ↓  [관리자 편집 → publishContent()]
콘텐츠 탭 (source_type: info_share 필터)
                  ↓
정보공유 /posts (status: published, category IN [education, case_study, notice])
                  ↓
수강생 화면
```

### 문제점

| 심각도 | 항목 | 위치 |
|--------|------|------|
| **warning** | 콘텐츠 탭 "전체 소스" 선택해도 `sourceType: "info_share"` 기본값 유지 → 실제로 info_share만 표시 | `admin/content/page.tsx:84` |
| **warning** | source_type 타입 정의 없음 (`string \| null`) | `types/content.ts` |
| **warning** | 큐레이션 생성물의 `type` 항상 `"education"` 고정 (category와 불일치) | `curation.ts:278` |
| info | 썸네일 삭제 기능 없음, Storage 고아 파일 누적 | `detail-sidebar.tsx` |
| info | source_type 목록 3곳 중복 관리 | `contents.ts`, `curation.ts`, `page.tsx` |
| info | `as any` 우회 다수 (Supabase 타입 미갱신) | `curation.ts` 6곳+ |

### 콘텐츠 탭 필터 수정 방향

현재 `page.tsx:84`에 `sourceType: "info_share"` 기본값이 남아있어, "전체 소스" 선택 시에도 info_share만 표시됨.
→ `sourceFilter === "all"`일 때 `sourceType` 파라미터를 제거하여 전체 소스 표시.
