# lp_analysis 2축 구조 전환 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/lp-analysis-v2.design.md
> TASK: T5

---

## Match Rate: 95%

---

## 일치 항목 (19/20)

| # | 설계 항목 | 구현 | 일치 |
|---|----------|------|:----:|
| 1 | scripts/analyze-lps-v2.mjs 신규 | 469줄 생성 | ✅ |
| 2 | sbGet/sbPatch REST 헬퍼 | analyze-five-axis.mjs 패턴 재사용 | ✅ |
| 3 | lp_snapshots 조회 (viewport=mobile) | REST API 조회 구현 | ✅ |
| 4 | landing_pages JOIN (account_id, canonical_url) | 별도 sbGet 조회로 구현 | ✅ |
| 5 | reference_based IS NULL 필터 | 기존 분석 스킵 로직 | ✅ |
| 6 | Storage → base64 이미지 다운로드 | public URL fetch + base64 변환 | ✅ |
| 7 | Gemini 2.5 Pro 호출 | 모델/URL/타임아웃 일치 | ✅ |
| 8 | 8카테고리 프롬프트 | page_structure~mobile_ux 전체 | ✅ |
| 9 | responseMimeType: application/json | 강제 JSON 응답 | ✅ |
| 10 | Rate limit 4초 간격 | sleep(4000) 구현 | ✅ |
| 11 | 429/5xx 재시도 (exponential backoff) | 최대 3회 재시도 | ✅ |
| 12 | lp_analysis UPSERT (on conflict: lp_id, viewport) | sbPost + merge-duplicates | ✅ |
| 13 | reference_based JSONB 저장 | Gemini 응답 전체 저장 | ✅ |
| 14 | flat 컬럼 동기화 (16개) | hero_type~video_autoplay 추출 | ✅ |
| 15 | model_version: gemini-2.5-pro-lp-v2 | 일치 | ✅ |
| 16 | --limit N (기본 50) | CLI 파싱 구현 | ✅ |
| 17 | --dry-run | Gemini 호출 없이 대상 출력 | ✅ |
| 18 | --lp-id UUID | 특정 LP 단건 분석 | ✅ |
| 19 | 기존 flat 컬럼 삭제 안 함 | 무변경 (deprecated 유지) | ✅ |

## 불일치 항목 (1/20)

| # | 설계 | 구현 | 사유 |
|---|------|------|------|
| 1 | lp_snapshots + landing_pages 단일 JOIN 조회 | 별도 REST 조회 2회 | REST API에서 cross-table JOIN이 제한적. 별도 조회로 동일 결과. 기능적 차이 없음. |

---

## 빌드 검증

- `npx tsc --noEmit` — ✅ 에러 0
- `npm run build` — ✅ 성공
- `node --check scripts/analyze-lps-v2.mjs` — ✅ 구문 정상

---

## 변경 파일

| 파일 | 유형 | 줄 수 |
|------|------|------|
| `scripts/analyze-lps-v2.mjs` | 신규 | 469줄 |

---

> Gap 분석 완료. Match Rate 95%.
