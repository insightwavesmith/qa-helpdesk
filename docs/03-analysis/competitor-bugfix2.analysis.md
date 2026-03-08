# 경쟁사분석기 버그픽스2 Gap 분석

## Match Rate: 100%

## 일치 항목

### T1. 영상 모달 — VIDEO displayFormat + videoUrl null 처리
- **PASS**: `ad.displayFormat === "VIDEO" && ad.videoUrl && !videoError` 조건으로 video 태그 렌더링
- **PASS**: videoUrl이 null일 때 두 번째 분기 `ad.displayFormat === "VIDEO"` 진입 → `videoPreviewUrl`이 있으면 이미지로 표시 + "Meta에서 보기" 링크 제공
- **PASS**: videoError 발생 시에도 동일 fallback 분기 진입 (첫 조건의 `!videoError`가 false) → videoPreviewUrl 이미지 + "영상을 재생할 수 없습니다" 메시지 + "Meta에서 보기" 링크
- **PASS**: videoPreviewUrl마저 없을 때 Play 아이콘 + "영상을 재생할 수 없습니다" + "Meta에서 보기" 링크 (최종 fallback)

### T1. API route 미변경 (프론트엔드 only)
- **PASS**: diff 확인 결과 ad-media-modal.tsx만 T1 관련 변경. search route와 download route의 변경은 모두 T2 관련 (캐시/로깅/UA)

### T2. 캐시 UPSERT await 처리
- **PASS**: search route에서 기존 `.catch()` fire-and-forget 패턴 → `try { await upsertAdCache(result.ads) } catch` 로 변경. race condition 제거됨

### T2. 에러 로깅 강화 (download route)
- **PASS**: 캐시 조회 결과 로그 추가 (`[download] 캐시 조회:`)
- **PASS**: 캐시 없음/만료 시 상세 로그 추가 (`hasCache`, `expired`, `pageName`)
- **PASS**: 재검색 실패 시 `console.error` 추가
- **PASS**: 미디어 URL 없을 때 상세 로그 추가 (`type`, `hasImage`, `hasVideo`, `displayFormat`)
- **PASS**: fbcdn 응답 실패 시 status/statusText/url 로그 추가

### T2. User-Agent 개선
- **PASS**: 기존 `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"` (불완전) → `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"` (완전한 Chrome UA)

### T2. 새 테이블/환경변수 미추가
- **PASS**: ad-cache.ts는 기존 `competitor_ad_cache` 테이블만 사용. 새 테이블 생성 없음. 환경변수 추가 없음

### T2. ad-cache.ts 에러 처리 개선
- **PASS**: UPSERT 실패 시 `error.details`, `error.hint` 추가 로깅 + `throw` 로 에러 전파 (기존에는 console.error만 하고 무시)
- **PASS**: UPSERT 성공 시 건수 로그 추가

### 빌드/린트 검증
- **PASS**: `tsc --noEmit` 통과 (에러 없음)
- **PASS**: `npm run build` 성공
- **PASS**: `eslint` 변경 파일 4개 대상 에러 없음

## 불일치 항목

없음

## 수정 필요

없음
