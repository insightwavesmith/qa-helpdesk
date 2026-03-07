# 경쟁사 분석기 환경변수 수정 Gap 분석

## Match Rate: 100%

## 문제 진단

Vercel 배포에서 `META_AD_LIBRARY_TOKEN` 환경변수가 읽히지 않는 문제.

### 근본 원인
1. **runtime 미지정**: 경쟁사 분석 API route들에 `export const runtime = "nodejs"` 미설정
   - Next.js가 Edge Runtime으로 배포 시 `process.env` 접근 제한
   - 프로젝트 내 다른 API route(`og/route.tsx`)가 Edge 사용 중이라 번들러가 혼동 가능
2. **dynamic 미지정**: `export const dynamic = "force-dynamic"` 없이 정적 최적화 시도 시 빌드 타임에 환경변수 평가

## 수정 항목 (T1)

| 파일 | 수정 내용 |
|------|-----------|
| `src/app/api/competitor/search/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"`, 디버그 로그 추가 |
| `src/app/api/competitor/insights/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"` 추가 |
| `src/app/api/competitor/monitors/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"` 추가 |
| `src/app/api/competitor/monitors/[id]/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"` 추가 |
| `src/app/api/competitor/monitors/[id]/alerts/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"` 추가 |
| `src/app/api/cron/competitor-check/route.ts` | `runtime = "nodejs"`, `dynamic = "force-dynamic"` 추가 |
| `src/lib/competitor/meta-ad-library.ts` | 런타임/토큰 디버그 로그 추가 |

## 설계 대비 일치 확인 (T2)

| 설계 항목 | 구현 상태 |
|-----------|-----------|
| 검색 API (`/api/competitor/search`) | 구현 완료 + runtime 수정 |
| 모니터링 API (`/api/competitor/monitors`) | 구현 완료 + runtime 수정 |
| AI 인사이트 API (`/api/competitor/insights`) | 구현 완료 + runtime 수정 |
| Cron (`/api/cron/competitor-check`) | 구현 완료 + runtime 수정 |
| 에러 처리 (TOKEN_MISSING 503) | 설계와 일치 |
| 환경변수 런타임 전용 접근 | process.env 런타임 참조, 빌드 안전 |

## 검증

- [x] `npx tsc --noEmit` - 타입 에러 0개
- [x] `npm run lint` - 신규 에러 0개 (기존 에러 15개는 무관)
- [x] `npm run build` - 빌드 성공
- [x] Vercel Function Logs에서 확인 가능한 디버그 로그 추가

## 수정 불필요 항목

- `next.config.ts`: 서버사이드 환경변수는 `serverRuntimeConfig` 불필요 (Node.js runtime이면 `process.env` 직접 접근 가능)
- `.env.local`: 토큰 정상 존재 확인됨
