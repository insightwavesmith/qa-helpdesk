# Vercel→Cloud Run Wave 4-5 Research

> 작성일: 2026-03-26
> Plan: docs/01-plan/features/vercel-supabase-migration.plan.md
> Design: docs/02-design/features/vercel-removal.design.md
> 이전 분석: docs/03-analysis/vercel-removal.analysis.md (Wave 1-3, 97%)

## 현재 상태

### 완료 (Wave 1-3)
- src/ 내 `bscamp.vercel.app` → `bscamp.app`: 0건 ✅
- src/ 내 `VERCEL_URL` 참조: 0건 ✅
- `vercel.json` 삭제: ✅
- `.env.local` NEXT_PUBLIC_SITE_URL → bscamp.app: ✅ (backend-dev 완료)
- `.env.vercel`, `.env.vercel.tmp` 삭제: ✅
- `.env.prod` VERCEL_* 제거: ✅
- `collect/route.ts` 중복 OR 정리: ✅
- tsc + build 통과: ✅

### 미완료 (Wave 4-5)

#### Wave 4: RLS 비활성화
- Cloud SQL에 36개 마이그레이션의 246개 RLS 정책 존재
- Cloud SQL은 `auth.uid()` 미지원 → RLS 무의미
- SERVICE_ROLE로 통일 완료 → RLS 끄기 안전
- psql 로컬 미설치. gcloud sql connect 사용 필요.

#### Wave 5: Cloud Run 프론트 전환
- `bscamp-web` Cloud Run 서비스 **이미 존재** (2026-03-25 배포)
- URL: https://bscamp-web-906295665279.asia-northeast3.run.app
- **문제 1**: Firebase 환경변수 누락 (FIREBASE_SERVICE_ACCOUNT_JSON 등)
- **문제 2**: 기존 env 값에 큰따옴표 포함 (`'"value"'` 형태) — 런타임 오류 가능
- **문제 3**: bscamp.app 도메인 매핑 안 됨
- **문제 4**: Dockerfile NEXT_PUBLIC_* 빌드 시 인라인 → 런타임 env와 무관

## 인프라 현황

### Cloud Run 서비스 목록
- bscamp-web (프론트) — 배포됨, env 불완전
- bscamp-cron — 정상 운영 중
- bscamp-crawler — 정상 운영 중
- creative-pipeline — 정상 운영 중

### Dockerfile 분석
- 3-stage 빌드 (deps → builder → runner)
- NEXT_PUBLIC_* 빌드 시 인라인 (line 16-20) — 올바름
- output: standalone, PORT 8080
- node:22-alpine 기반

### Cloud Run bscamp-web env 현황
- DATABASE_URL: ✅ 있음
- META_*, GEMINI_*, SMTP_*: ✅ 있음
- FIREBASE_*: ❌ 없음 (서버 Admin SDK용)
- NEXT_PUBLIC_SITE_URL: ❌ 없음 (런타임에는 불필요하지만 일부 서버 코드에서 참조)

### 도메인
- bscamp.app: Firebase Auth custom domain 설정 완료 (project memory)
- DNS → Cloud Run 매핑: 미완료
- gcloud beta 미설치 → 설치 필요 또는 콘솔에서 수동

### 도구 가용성
- gcloud: ✅ (project: modified-shape-477110-h8)
- docker: ❌ 없음 (Cloud Build로 대체)
- psql: ❌ 없음 (gcloud sql connect로 대체)
- gcloud beta: ❌ 미설치 (도메인 매핑에 필요)

## 의존성 그래프

```
Wave 4 (RLS) ──────────────────────────┐
                                       ├──→ Wave 5-6 (재배포 + 스모크)
Wave 5-1~3 (env 수정 + 도메인 매핑) ──┘
```

- Wave 4 (RLS)과 Wave 5-1~3 (env+도메인)은 독립 — 병렬 가능
- Wave 5-6 (재배포+스모크)은 둘 다 끝나야 진행

## 수정 대상 파일

### 코드 변경: 0건
Wave 4-5는 인프라 작업. src/ 코드 변경 없음.

### 인프라 작업
1. Cloud SQL: RLS DISABLE 실행
2. Cloud Run: env 추가/수정 (gcloud run services update)
3. Cloud Build: 재빌드+재배포 (gcloud builds submit 또는 gcloud run deploy)
4. DNS: bscamp.app → Cloud Run 매핑
5. Firebase Console: Authorized Domain 확인
