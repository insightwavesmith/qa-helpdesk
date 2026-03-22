# creative-intelligence Gap 분석

- **기능**: 소재 인텔리전스 (L3 분석 + 벤치마크 + 점수)
- **설계서**: docs/02-design/features/creative-intelligence.design.md
- **분석일**: 2026-03-22
- **Match Rate**: 93%

## 일치 항목

### 1. DB 스키마 (완전 일치)
- `creative_element_analysis` 테이블: 설계서와 마이그레이션 SQL 100% 일치 (컬럼명, 타입, RLS, 인덱스 모두 동일)
- `creative_element_performance` 테이블: 설계서와 마이그레이션 SQL 100% 일치 (UNIQUE 제약, RLS 정책 포함)
- `creative_intelligence_scores` 테이블: 설계서와 마이그레이션 SQL 100% 일치
- `lp_structure_analysis` ALTER 컬럼 10개: 설계서와 마이그레이션 SQL 100% 일치

### 2. 스크립트 (일치)
- `scripts/analyze-creatives.mjs`: 설계서 3.1 명세 준수 — ad_creative_embeddings 조회 → Gemini Vision 분석 → creative_element_analysis UPSERT
- `scripts/compute-benchmarks.mjs`: 설계서 3.2 명세 준수 — creative_element_analysis JOIN daily_ad_insights → 요소별 avg_roas/avg_ctr/avg_conversion_rate/p75_roas 계산 → creative_element_performance UPSERT
- `scripts/score-creatives.mjs`: 설계서 3.3 명세 준수 — 3개 테이블 + daily_ad_insights + creative_lp_consistency 데이터 → Gemini 호출 → creative_intelligence_scores UPSERT

### 3. API 엔드포인트 (구조 일치)
- `POST /api/admin/creative-analysis/run`: 설계서 2.1 일치 — batchSize/accountId 파라미터, Gemini Vision 분석, DB UPSERT
- `GET /api/admin/creative-benchmark`: 설계서 2.2 일치 — element 쿼리 파라미터로 필터링, element_type별 그룹핑 반환
- `POST /api/admin/creative-intelligence/score`: 설계서 2.3 일치 — batchSize/accountId 파라미터, 점수+제안 생성, DB UPSERT
- `GET /api/admin/creative-intelligence`: 설계서 2.4 일치 — account_id 파라미터, 점수/제안 조회

### 4. 에러 처리 (일치)
- Gemini 실패: skip 후 errors 카운트 증가 (설계서 5번 항목 준수)
- 이미지 다운로드 실패: skip 처리
- 미인증/비관리자: requireAdmin()으로 401/403 반환

### 5. 파일 구조 (일치)
- 설계서 4번 신규 파일 목록 7개 모두 존재 확인 완료

### 6. RLS 정책 (일치)
- 3개 테이블 모두 service_role_all (ALL) + authenticated_read (SELECT) 정책 적용

### 7. 프롬프트 구조 (일치)
- Gemini Vision 분석 프롬프트: 이미지/비디오 분리, JSON 스키마 출력 형식 동일
- 스코링 프롬프트: 5축 점수(visual_impact, message_clarity, cta_effectiveness, social_proof, lp_consistency) + suggestions + benchmark_comparison 구조 동일

## 불일치 항목

### 1. Gemini 모델 버전 차이 (중요도: 중)
- **설계서**: `gemini-2.0-pro` (model_version 기본값 포함)
- **구현 (analyze-creatives.mjs)**: `gemini-2.5-pro` 사용 (42행)
- **구현 (score-creatives.mjs)**: `gemini-2.0-flash` 사용 (46행) — Pro가 아닌 Flash 모델
- **구현 (API creative-analysis/run)**: `gemini-2.5-pro` 사용 (8행)
- **구현 (API creative-intelligence/score)**: `gemini-2.5-pro` 사용 (7행)
- **영향**: DB의 model_version 기본값은 'gemini-2.0-pro'이지만, 실제 INSERT 시 스크립트/API가 사용 모델명을 명시적으로 넣으므로 기능상 문제 없음. 다만 score-creatives.mjs만 Flash 모델을 사용해 점수 품질이 다를 수 있음.

### 2. API 응답 형식 차이 (중요도: 하)
- **설계서 2.1** 응답: `{ processed, analyzed, errors }`
- **구현** 응답: `{ message, total, skipped, analyzed, errors }` — `message`, `total`, `skipped` 추가 (상위 호환, 정보량 증가)
- **설계서 2.2** 응답: `{ element_type, values: [...] }`
- **구현** 응답: `{ element_type, total, benchmarks: { [type]: [...] } }` — `values` 대신 `benchmarks` (키 기반 그룹핑), `total` 추가
- **설계서 2.3** 응답: `{ processed, scored, errors }`
- **구현** 응답: `{ message, total, skipped, scored, errors }` — 추가 필드
- **설계서 2.4** 응답: `{ account_id, total, results: [{ ad_id, overall_score, scores, suggestions }] }`
- **구현** 응답: 위 형식 + `period`, `media_url`, `ad_copy`, `media_type`, `lp_url`, `roas`, `spend`, `revenue` 추가 — 프론트엔드에 필요한 정보를 통합 조회하도록 확장됨

### 3. API 응답 JSON 파싱 방식 차이 (중요도: 하)
- **스크립트 (analyze-creatives.mjs)**: `responseMimeType: "application/json"` 설정으로 구조화된 JSON 출력 → 폴백으로 regex 파싱
- **API route (creative-analysis/run)**: `responseMimeType` 미설정, `maxOutputTokens: 2048` (스크립트는 8192) → regex만으로 JSON 추출
- **영향**: API route에서 긴 응답 시 잘릴 가능성 있으나, 소재 분석 JSON은 보통 2048 토큰 이내로 실질 문제 없음

### 4. 마이그레이션 SQL에 설계서 미기재 항목 (중요도: 하)
- `ad_creative_embeddings` 테이블에 `video_analysis JSONB` 컬럼 추가 (마이그레이션 102행)
- 설계서에는 이 ALTER 구문이 명시되지 않음 (Phase 2 전환 준비 컬럼으로 주석 기재)

### 5. GET /api/admin/creative-intelligence 필수 파라미터 (중요도: 하)
- **설계서**: `account_id` 선택적 쿼리 파라미터 (`?account_id=xxx`)
- **구현**: `account_id` 필수 — 없으면 400 에러 반환 (16~19행)
- **영향**: 전체 계정 조회 불가하나, 실제 사용 시나리오상 계정별 조회가 정상 흐름이므로 합리적 제한

### 6. GET /api/admin/creative-intelligence 추가 기능 (중요도: 하)
- **설계서**: 단순 점수/제안 조회
- **구현**: `period` 파라미터 추가 (기본 30일), daily_ad_insights에서 기간별 ROAS 가중평균 계산, ad_creative_embeddings에서 media_url/ad_copy/lp_url 조인
- **영향**: 설계서 대비 기능 확장 (상위 호환)

## 수정 완료

### 1. score-creatives.mjs 모델 불일치 → 수정됨
- `scripts/score-creatives.mjs`의 MODEL: `gemini-2.0-flash` → `gemini-2.5-pro`로 변경 완료
- 모든 구현체가 `gemini-2.5-pro`로 통일됨

### 2. API route의 responseMimeType 미설정 → 수정됨
- `creative-analysis/run/route.ts`와 `creative-intelligence/score/route.ts`에 `responseMimeType: "application/json"` 추가 완료
- `maxOutputTokens`도 2048 → 8192로 통일

## 검증 결과
- tsc: 통과 (빌드 시점 기준)
- build: 통과
- 배치 실행: L4 358건 완료
