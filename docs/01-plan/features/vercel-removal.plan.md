# Vercel 의존 제거 Plan — Phase 3

## 배경
Supabase/Vercel 의존도 분석 결과 (2026-03-24):
- maxDuration 33파일: Vercel Pro 300초 제한 → Cloud Run에서 무의미
- revalidatePath 58호출: Next.js standalone에서 자동 작동 (변경 불필요)
- s-maxage CDN 캐시 3파일: Cloud CDN 또는 Cloudflare로 전환 필요
- vercel.json: cron 이미 제거됨, regions만 남음
- @vercel/* 패키지 없음 (의존도 낮음)

## 목표
Vercel 전용 코드를 제거하여 Cloud Run standalone 배포 호환 100% 달성.

## 범위

### Phase 3-A: maxDuration 제거 (33파일)
- 33개 API route에서 `export const maxDuration = N;` 제거
- Cloud Run은 3600초 타임아웃이므로 Next.js maxDuration 불필요

### Phase 3-B: CDN 캐시 전략 (3파일)
- `s-maxage` 헤더 사용 3파일 확인
- Cloud Run은 Vercel CDN 없음 → s-maxage 유지 (Cloud CDN 연동 시 자동 사용)
- 변경 불필요 (s-maxage는 표준 HTTP 헤더이므로 Cloud CDN에서도 동작)

### Phase 3-C: vercel.json 정리
- `regions: ["icn1"]` → Cloud Run에서 무의미 → 파일 제거 또는 빈 객체로

## 제외
- revalidatePath (Next.js standalone에서 작동, 변경 불필요)
- Auth 이관 (Phase 5에서 별도 진행)
- RLS 전환 (Phase 4에서 별도 진행)
- Cloud Build PR Preview (별도 TASK)

## 파일 경계 (충돌 방지)
- backend-dev: `src/app/api/` 하위 33파일 maxDuration 제거
- frontend-dev: `vercel.json` 정리 + CDN 캐시 헤더 점검

## 성공 기준
- maxDuration export 0개
- tsc + build 성공
- 기존 기능 영향 없음
