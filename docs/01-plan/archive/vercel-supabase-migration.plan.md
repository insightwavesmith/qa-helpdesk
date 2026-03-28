# Vercel + Supabase 탈피 마스터 기획서

> 작성일: 2026-03-24 / 보완: 2026-03-25
> 분석서: docs/03-analysis/supabase-vercel-dependency.analysis.md
> 설계서: docs/02-design/features/vercel-removal.design.md
> GCP 프로젝트: modified-shape-477110-h8 / 리전: asia-northeast3
> 도메인: bscamp.app (Firebase Auth custom domain 설정 완료)

---

## §1. 현재 의존성 맵

### 1-1. Supabase 의존 현황

| # | 카테고리 | 영향 파일 | 호출 수 | 현재 상태 | GCP 대안 |
|:-:|---------|:--------:|:------:|:---------:|---------|
| 1 | **Auth** | 62 → 0 | 91 → 0 | ✅ **완료** | Firebase Auth (6파일 구현) |
| 2 | **Storage** | 17 → 0 | 32 → 0 | ✅ **완료** | GCS 직접 (`gcs-storage.ts`) |
| 3 | **DB 쿼리** | 80+ | 수백 | ✅ **완료** | Cloud SQL Proxy 패턴 (`db/index.ts`) |
| 4 | **RLS** | 36 migration | 246 정책 | ⏳ **대기** | 서버사이드 인증 (SERVICE_ROLE 통일) |
| 5 | **SDK** | 126파일 | — | ✅ **완료** | `@supabase/*` 패키지 완전 제거 |

**검증 결과 (2026-03-25 grep 전수조사):**
- `@supabase` import in src/: **0건**
- `NEXT_PUBLIC_SUPABASE` in src/: **0건**
- `createBrowserClient` in src/: **0건**
- `supabase.auth.*` in src/: **0건**
- `src/lib/supabase/` 디렉토리: **삭제됨**

### 1-2. Vercel 의존 현황

| # | 카테고리 | 영향 파일 | 현재 상태 | 비고 |
|:-:|---------|:--------:|:---------:|------|
| 1 | **maxDuration** | 33 → 1 | ✅ **거의 완료** | `admin/content/[id]/page.tsx` 1건 잔여 |
| 2 | **vercel.json** | 1 | ✅ **완료** | 파일 삭제됨 |
| 3 | **VERCEL_URL** | 3 → 0 | ✅ **완료** | `NEXT_PUBLIC_SITE_URL` 통일 |
| 4 | **bscamp.vercel.app** | 13 → 0 | ✅ **완료** | `bscamp.app`으로 전환 |
| 5 | **revalidatePath** | 58호출 | ✅ **변경 불필요** | Next.js standalone 내장 |
| 6 | **s-maxage CDN** | 3파일 | ✅ **변경 불필요** | 표준 HTTP 헤더, Cloud CDN 호환 |
| 7 | **@vercel/* 패키지** | 0 | ✅ **없음** | 의존도 제로 |
| 8 | **Preview 배포** | — | ⏳ **미구현** | §5에서 상세 |
| 9 | **프론트 호스팅** | — | ⏳ **대기** | Cloud Run 전환 필요 (Dockerfile 준비) |
| 10 | **CI/CD** | — | ⏳ **미구현** | §7에서 상세 |

### 1-3. Firebase Auth 구현 현황 (6파일)

| 파일 | 역할 |
|------|------|
| `src/lib/firebase/client.ts` | 브라우저 SDK 초기화 |
| `src/lib/firebase/admin.ts` | Admin SDK 초기화 (서버) |
| `src/lib/firebase/auth.ts` | `getCurrentUser()` 헬퍼 (51파일에서 사용) |
| `src/lib/firebase/middleware.ts` | 세션 검증 + role 라우팅 |
| `src/app/api/auth/firebase-session/route.ts` | 세션 쿠키 생성 |
| `src/app/api/auth/firebase-logout/route.ts` | 로그아웃 처리 |

---

## §2. GCP 대안 매핑 (10개 항목)

| # | Vercel/Supabase 기능 | GCP 대안 | 상태 | 비고 |
|:-:|---------------------|---------|:----:|------|
| 1 | Supabase Auth | Firebase Auth (이메일+비밀번호) | ✅ 완료 | 50K MAU 무료 |
| 2 | Supabase DB (PostgREST) | Cloud SQL PostgreSQL | ✅ 완료 | `db/index.ts` Proxy |
| 3 | Supabase Storage | GCS (`gs://bscamp-storage`) | ✅ 완료 | `gcs-storage.ts` |
| 4 | Supabase RLS | 서버사이드 인증 (SERVICE_ROLE) | ⏳ Phase C | RLS DISABLE migration |
| 5 | Vercel 프론트 호스팅 | Cloud Run (`bscamp-web`) | ⏳ Phase B | Dockerfile 준비됨 |
| 6 | Vercel Cron | Cloud Scheduler (23개) | ✅ 완료 | Cloud Run 트리거 |
| 7 | Vercel CDN | Cloud CDN / Cloudflare | ⏳ Phase B | s-maxage 호환 |
| 8 | Vercel Preview 배포 | Cloud Build + Cloud Run revision | ⏳ 별도 | §5 참조 |
| 9 | Vercel 환경변수 | Cloud Run env + Secret Manager | ⏳ Phase B | 이관 필요 |
| 10 | Vercel Edge Middleware | Next.js 서버 미들웨어 | ✅ 자동 폴백 | standalone 호환 |

---

## §3. 마이그레이션 단계별 계획

### 완료된 Phase (Skip)

| Phase | 내용 | 파일 수 | 완료일 |
|-------|------|:------:|:------:|
| Phase 0 | DB → Cloud SQL Proxy | 80+ | 2026-03 |
| Phase 1 | Storage → GCS | 22 | 2026-03 |
| Phase 2 | Cron → Cloud Scheduler | 23크론 | 2026-03 |
| Phase 3-A | maxDuration 제거 | 33→1 | 2026-03-24 |
| Phase 3-B | CDN 캐시 (s-maxage) | 3 | 변경 불필요 |
| Phase 3-C | vercel.json 삭제 | 1 | 2026-03-24 |
| Supabase SDK | `@supabase/*` 완전 제거 | 126 | 2026-03-25 |
| Firebase Auth | Auth 6파일 구현 | 6+51 | 2026-03-25 |
| URL 전환 | bscamp.vercel.app → bscamp.app | 13 | 2026-03-25 |
| VERCEL_URL | 참조 제거 | 3 | 2026-03-25 |

### Phase A: 사용자 마이그레이션 (Auth 데이터 이관)

**목표**: Supabase Auth에 있는 ~40명 사용자를 Firebase Auth로 이관

**현재 상태**: 코드는 Firebase Auth로 전환 완료. 사용자 데이터만 이관 필요.

| 단계 | 작업 | 위험 |
|------|------|------|
| A-1 | Supabase Auth 사용자 목록 export (`supabase auth list-users`) | 없음 |
| A-2 | Firebase Admin SDK `createUser()` 배치 생성 | 낮음 |
| A-3 | 비밀번호 해시 호환성 확인 (Supabase bcrypt vs Firebase scrypt) | **중간** |
| A-4 | 비호환 시: 전체 비밀번호 리셋 이메일 발송 (40명이므로 개별 안내 가능) | 낮음 |
| A-5 | `profiles.id` UUID 매핑: Supabase UID → Firebase UID | **높음** |
| A-6 | profiles 테이블 + 관련 FK 업데이트 | **높음** |
| A-7 | 테스트 계정으로 로그인/회원가입 검증 | 없음 |

**공수**: 2-3일
**핵심 리스크**: profiles.id UUID 매핑 (§9 리스크 매트릭스 참조)

### Phase B: Vercel → Cloud Run 프론트 이관

**목표**: Next.js standalone을 Cloud Run에서 서빙. bscamp.app 도메인 연결.

**현재 상태**: Dockerfile 준비 (3-stage standalone, PORT=8080). Firebase 환경변수 이미 포함.

| 단계 | 작업 | 공수 |
|------|------|:----:|
| B-1 | Dockerfile 최종 검증: `docker build -t bscamp-web .` 로컬 빌드 | 0.5일 |
| B-2 | Cloud Run `bscamp-web` 서비스 배포 | 0.5일 |
| B-3 | 환경변수 이관: Vercel env → Cloud Run env (22개 변수) | 0.5일 |
| B-4 | 도메인 매핑: bscamp.app → Cloud Run (DNS A/AAAA 레코드) | 0.5일 |
| B-5 | SSL 인증서 확인 (Cloud Run managed SSL) | — |
| B-6 | 스모크 테스트: 주요 페이지 + 로그인 + 크론 | 0.5일 |
| B-7 | Vercel 프로젝트 비활성화 (DNS 전환 후 1주 병행 운영 후) | — |

**환경변수 이관 목록:**

```
# DB
DATABASE_URL, USE_CLOUD_SQL=true

# Firebase Auth (빌드 시점 NEXT_PUBLIC_*)
NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID

# 런타임
FIREBASE_SERVICE_ACCOUNT_KEY (또는 GCP 메타데이터 자동 인식)
GOOGLE_API_KEY (Gemini)
GCS_BUCKET, GCS_PROJECT_ID

# 외부 서비스
RAILWAY_CRAWLER_URL, RAILWAY_API_SECRET
CREATIVE_PIPELINE_URL, CREATIVE_PIPELINE_SECRET
CRON_SECRET, MIXPANEL_TOKEN, META_APP_SECRET
NEXT_PUBLIC_SITE_URL=https://bscamp.app
NEXT_PUBLIC_MIXPANEL_TOKEN
```

**공수**: 1-2일
**위험**: 낮음 (Dockerfile + standalone 이미 준비, DNS만 전환)

### Phase C: RLS 비활성화 + 잔여 정리

**목표**: Supabase Auth 완전 제거 후 RLS 정책 비활성화. 코드 잔여물 최종 정리.

**전제조건**: Phase A 완료 (ANON_KEY 브라우저 노출 0건 확인됨 → RLS 끄기 안전)

| 단계 | 작업 | 공수 |
|------|------|:----:|
| C-1 | RLS DISABLE 마이그레이션 SQL 작성 (전 테이블) | 0.5일 |
| C-2 | Cloud SQL에서 마이그레이션 실행 | — |
| C-3 | 검증: `SELECT tablename FROM pg_tables WHERE rowsecurity = true` → 0건 | — |
| C-4 | `maxDuration` 잔여 1건 제거 (`admin/content/[id]/page.tsx`) | — |
| C-5 | `.env.local/.prod` Supabase 관련 변수 수동 제거 | — |
| C-6 | `post-body.tsx` supabase.co URL 분기 정리 (데이터 마이그레이션 후) | 별도 |
| C-7 | 변수명 `supabase` → `db` 리팩토링 (57파일) | 별도 TASK |

**공수**: 0.5-1일
**위험**: 낮음 (서버사이드 인증 이미 통일)

---

## §4. 비용 분석

### 4-1. 현재 비용 (Vercel + Supabase)

| 서비스 | 플랜 | 월 비용 | 제한 |
|--------|------|-------:|------|
| Vercel | Hobby (무료) | $0 | 100GB 대역폭, 서버리스 10초 |
| Supabase | Free | $0 | 500MB DB, 1GB Storage, 50K MAU |
| **합계** | | **$0/월** | 무료 티어 한계 내 운영 |

### 4-2. 전환 후 비용 (GCP 통합)

| 서비스 | 항목 | 월 예상 비용 | 산출 근거 |
|--------|------|----------:|----------|
| Cloud Run (bscamp-web) | 프론트 서빙 | $5-15 | min-instances=1, 1vCPU/1GB, ~40명 |
| Cloud Run (bscamp-cron) | 크론/API | $3-8 | 기존 운영 중, 이벤트 기반 |
| Cloud SQL | PostgreSQL | $7-25 | db-f1-micro (무료 티어 가능) 또는 db-g1-small |
| GCS | Storage | $0.5-2 | ~10GB, Standard class |
| Firebase Auth | 인증 | **$0** | 50K MAU 무료 (현재 ~40명) |
| Cloud Scheduler | 23 크론 | $0.3 | 3개 무료 + $0.10/job |
| Cloud CDN | CDN (선택) | $0-5 | 트래픽 적음, 미적용 가능 |
| Secret Manager | 환경변수 | $0.06 | 10개 시크릿 × $0.06 |
| **합계** | | **$16-55/월** | |
| **연간** | | **$192-660/년** | |

### 4-3. 비용 대비 이점

| 항목 | Vercel+Supabase 무료 | GCP 통합 |
|------|---------------------|---------|
| **월 비용** | $0 | $16-55 |
| **서버리스 타임아웃** | 10초 (Hobby) | 3600초 (Cloud Run) |
| **DB 용량** | 500MB | 무제한 (과금) |
| **Storage** | 1GB | 무제한 (과금) |
| **커스텀 도메인** | 가능 | 가능 |
| **인프라 자립성** | 2개 플랫폼 의존 | 단일 GCP 통합 |
| **레이턴시** | 미국 리전 → 한국 | asia-northeast3 (서울) |
| **보안 제어** | 플랫폼 의존 | VPC, IAM 직접 관리 |
| **스케일링** | 자동 (제한적) | 자동 (유연) |

**판단**: 월 $16-55 추가 비용은 타임아웃 해제, 서울 리전 레이턴시 개선, 인프라 자립으로 충분히 정당화됨. 특히 크론 작업(광고 수집, 파이프라인)의 300초 제한 해제가 핵심.

---

## §5. Preview 배포 대안

### 5-1. 현재 (Vercel)

- git push → 자동 Preview URL 생성 (`bscamp-git-{branch}-smith-kims-projects.vercel.app`)
- bypass secret으로 인증 우회 가능
- PR comment에 Preview URL 자동 게시

### 5-2. 대안 A: Cloud Build + Cloud Run revision (권장)

```
GitHub PR → Cloud Build 트리거 → Docker 빌드 → Cloud Run revision 배포 → PR comment
```

| 단계 | 구현 |
|------|------|
| 1. 트리거 | Cloud Build GitHub 연동, PR 이벤트 감지 |
| 2. 빌드 | `cloudbuild.yaml` — Dockerfile 기반 빌드 |
| 3. 배포 | `gcloud run deploy bscamp-preview-{PR번호}` (태그 기반 revision) |
| 4. URL | `https://bscamp-preview-{PR번호}-{hash}.asia-northeast3.run.app` |
| 5. 알림 | Cloud Build → GitHub PR comment에 Preview URL 게시 |
| 6. 정리 | PR merge/close 시 revision 삭제 (Cloud Build 트리거) |

**cloudbuild.yaml 예시:**

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:pr-$_PR_NUMBER', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:pr-$_PR_NUMBER']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'run'
      - 'deploy'
      - 'bscamp-preview'
      - '--image=asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:pr-$_PR_NUMBER'
      - '--tag=pr-$_PR_NUMBER'
      - '--region=asia-northeast3'
      - '--no-traffic'
```

**비용**: Cloud Build 120분/일 무료 → 추가 비용 거의 없음
**공수**: 3-5일

### 5-3. 대안 B: GitHub Actions + Cloud Run

```
GitHub PR → GitHub Actions → Docker 빌드 → Artifact Registry push → Cloud Run deploy
```

- GitHub Actions 무료 2,000분/월 (충분)
- Artifact Registry + Cloud Run deploy
- 기존 GitHub workflow 경험이 있다면 선호

**비교:**

| 항목 | Cloud Build (A) | GitHub Actions (B) |
|------|----------------|-------------------|
| GCP 통합 | 네이티브 | 서비스 계정 키 필요 |
| 무료 티어 | 120분/일 | 2,000분/월 |
| 트리거 | GCP 콘솔 관리 | `.github/workflows/` |
| 복잡도 | 중간 | 낮음 |
| **권장** | ✅ (GCP 통합 우선) | 대안 |

---

## §6. 롤백 전략

### 6-1. Phase A 롤백 (Auth 마이그레이션 실패 시)

| 시나리오 | 롤백 절차 | 소요 시간 |
|---------|----------|:--------:|
| Firebase 사용자 생성 실패 | Supabase Auth 유지, 코드 revert 불필요 (이미 Firebase 전환) | — |
| 비밀번호 해시 비호환 | 40명 전원 비밀번호 리셋 이메일 발송 | 1시간 |
| profiles.id UUID 매핑 오류 | 매핑 테이블 기반 복구, DB 트랜잭션 롤백 | 2-4시간 |
| 로그인 전면 장애 | 비상: Supabase Auth 임시 복원 (환경변수 전환) | 30분 |

**병행 운영 전략:**
1. Firebase Auth 전환 후 **1주간** Supabase Auth 프로젝트 유지 (삭제 안 함)
2. `profiles.id` 매핑 테이블 생성: `auth_uid_mapping(supabase_uid, firebase_uid)`
3. 롤백 시 매핑 테이블 역참조로 원복
4. **40명이므로 개별 Slack/카카오톡 안내 가능** — 대규모 서비스 대비 리스크 극히 낮음

### 6-2. Phase B 롤백 (Cloud Run 프론트 장애 시)

| 시나리오 | 롤백 절차 | 소요 시간 |
|---------|----------|:--------:|
| Cloud Run 서비스 다운 | DNS를 Vercel로 복원 (A/AAAA 레코드 변경) | 5-30분 (TTL) |
| 빌드 실패 | Vercel에서 기존 배포 활성화 | 즉시 |
| SSL 인증서 문제 | Vercel 도메인으로 임시 복원 | 5분 |

**DNS 롤백 절차:**
```
1. Cloud Run 장애 감지
2. DNS A/AAAA → Vercel CNAME으로 변경
3. Vercel 프로젝트 재활성화 (1주 병행 운영 기간 내)
4. 장애 원인 분석 후 Cloud Run 재배포
```

### 6-3. Phase C 롤백 (RLS 비활성화 후 문제 발생 시)

| 시나리오 | 롤백 절차 |
|---------|----------|
| 인증 우회 데이터 노출 | `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY` 즉시 실행 |
| 성능 이슈 (RLS 제거 후) | 해당 없음 — RLS 제거는 성능 개선 방향 |

**전제**: ANON_KEY 브라우저 노출 0건 이미 확인됨. 모든 쿼리가 서버사이드(SERVICE_ROLE). RLS 끄기 안전.

---

## §7. CI/CD 파이프라인

### 7-1. 현재 (Vercel)

```
git push → Vercel git 연동 → 자동 빌드 → 자동 배포 (Preview/Production)
```
- Zero config: `vercel.json` + git 연동만으로 동작
- Build: Vercel 인프라에서 `next build`
- Deploy: Vercel Edge Network에 자동 배포
- Rollback: Vercel 대시보드에서 이전 배포로 즉시 롤백

### 7-2. 전환 후 (Cloud Build + Cloud Run)

```
git push main → Cloud Build 트리거 → Docker 빌드 → Artifact Registry → Cloud Run 배포
```

**파이프라인 설계:**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│ git push    │────→│ Cloud Build  │────→│ Artifact     │────→│ Cloud Run   │
│ (main)      │     │ Docker build │     │ Registry     │     │ bscamp-web  │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │ (PR)               │ (tsc + lint + build)
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│ Preview     │←────│ Cloud Build  │
│ revision    │     │ PR 트리거    │
└─────────────┘     └──────────────┘
```

**cloudbuild-production.yaml:**

```yaml
steps:
  # 1. 타입 체크 + 린트
  - name: 'node:22-alpine'
    entrypoint: 'sh'
    args:
      - '-c'
      - 'npm ci && npx tsc --noEmit --quiet && npx next lint --quiet'

  # 2. Docker 빌드
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:$SHORT_SHA'
      - '-t'
      - 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:latest'
      - '.'

  # 3. Push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '--all-tags', 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web']

  # 4. Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'gcloud'
      - 'run'
      - 'deploy'
      - 'bscamp-web'
      - '--image=asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web:$SHORT_SHA'
      - '--region=asia-northeast3'
      - '--platform=managed'

images:
  - 'asia-northeast3-docker.pkg.dev/$PROJECT_ID/bscamp/web'
```

### 7-3. 전환 체크리스트

- [ ] Artifact Registry 리포지토리 생성 (`bscamp`)
- [ ] Cloud Build GitHub 연동 (Cloud Build App 설치)
- [ ] Cloud Build 트리거 생성 (main push + PR)
- [ ] Cloud Build 서비스 계정에 Cloud Run Admin 역할 부여
- [ ] `cloudbuild-production.yaml` 작성
- [ ] `cloudbuild-preview.yaml` 작성
- [ ] 테스트 배포 실행 + 검증

**공수**: 2-3일
**비용**: Cloud Build 120분/일 무료 (충분)

---

## §8. 마이그레이션 체크리스트 (Phase별 Go/No-Go)

### Phase A: Auth 사용자 마이그레이션

#### Go 기준 (전부 충족해야 Phase A 시작)
- [ ] Firebase Auth 프로젝트 설정 완료 (✅ 완료)
- [ ] Firebase Auth 코드 6파일 구현 완료 (✅ 완료)
- [ ] `getCurrentUser()` 전환 완료 (✅ 51파일 완료)
- [ ] Supabase Auth 사용자 목록 export 완료
- [ ] 비밀번호 해시 호환성 테스트 완료 (bcrypt → scrypt)
- [ ] profiles.id UUID 매핑 전략 확정
- [ ] 테스트 계정 Firebase Auth 로그인 성공

#### 완료 확인 항목
- [ ] Firebase Auth에 ~40명 전원 생성됨
- [ ] 테스트 계정 로그인/회원가입/로그아웃 정상
- [ ] profiles 테이블 id 매핑 완료 (FK 정합성)
- [ ] `tsc --noEmit` 에러 0
- [ ] `npm run build` 성공
- [ ] Supabase Auth 프로젝트 삭제 안 함 (1주 병행)

### Phase B: Cloud Run 프론트 이관

#### Go 기준 (전부 충족해야 Phase B 시작)
- [ ] Phase A 완료 (Auth 정상 동작)
- [ ] Dockerfile 로컬 빌드 성공 (`docker build -t bscamp-web .`)
- [ ] Cloud Run 서비스 생성 + 헬스체크 통과
- [ ] 환경변수 22개 설정 완료
- [ ] bscamp.app DNS 변경 준비 (TTL 사전 단축: 300초)

#### 완료 확인 항목
- [ ] `https://bscamp.app` Cloud Run에서 서빙 확인
- [ ] SSL 인증서 정상 (HTTPS)
- [ ] 로그인/회원가입 정상 (Firebase Auth)
- [ ] 대시보드, Q&A, 게시판, 총가치각도기 주요 페이지 정상
- [ ] 크론 트리거 정상 (Cloud Scheduler → Cloud Run)
- [ ] 콘솔 에러 0건
- [ ] Vercel 프로젝트 비활성화 (1주 병행 후)

### Phase C: RLS 비활성화 + 정리

#### Go 기준
- [ ] Phase B 완료 (Vercel 비활성화)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` 코드/환경에서 0건 확인 (✅ 완료)
- [ ] `createBrowserClient` 사용 0건 확인 (✅ 완료)
- [ ] 모든 DB 쿼리가 서버사이드 (SERVICE_ROLE) 확인

#### 완료 확인 항목
- [ ] `SELECT tablename FROM pg_tables WHERE rowsecurity = true` → 0건
- [ ] `maxDuration` 참조 0건
- [ ] `.env` Supabase 관련 변수 0건
- [ ] `tsc --noEmit` 에러 0
- [ ] `npm run build` 성공
- [ ] 기존 기능 100% 동작

---

## §9. 리스크 매트릭스

| # | 리스크 | 확률 | 영향 | 심각도 | 완화 전략 |
|:-:|--------|:----:|:----:|:------:|----------|
| 1 | **비밀번호 해시 비호환** (bcrypt→scrypt) | 높음 | 중간 | 🟡 중 | 40명 전원 비밀번호 리셋 이메일. 사전 테스트 필수 |
| 2 | **profiles.id UUID 매핑 실패** | 중간 | 높음 | 🔴 상 | 매핑 테이블 사전 설계, 트랜잭션 기반 일괄 업데이트, 롤백 SQL 준비 |
| 3 | **Cloud Run 콜드 스타트** (min-instances=0) | 높음 | 낮음 | 🟢 하 | min-instances=1 설정 ($5-8/월 추가) |
| 4 | **DNS 전환 중 다운타임** | 낮음 | 중간 | 🟢 하 | TTL 사전 단축(300초), 병행 운영 1주 |
| 5 | **Auth 전환 중 서비스 다운** | 낮음 | 높음 | 🟡 중 | 병행 운영, 롤백 스크립트 준비, 40명 개별 안내 |
| 6 | **Vercel 무료 → GCP 유료** 비용 증가 | 확정 | 낮음 | 🟢 하 | 월 $16-55 예상, 사업적으로 수용 가능 |
| 7 | **CI/CD 파이프라인 안정화** | 중간 | 중간 | 🟡 중 | 점진적 전환, 수동 배포 병행 |
| 8 | **revalidatePath 캐시 미스** | 낮음 | 낮음 | 🟢 하 | standalone 메모리 캐시 기본 동작, 필요 시 Redis 추가 |
| 9 | **기존 Auth 콜백 URL 깨짐** | 낮음 | 중간 | 🟢 하 | Firebase Auth 콜백은 bscamp.app 도메인으로 설정 완료 |

### 핵심 리스크 상세

#### 리스크 #2: profiles.id UUID 매핑 (심각도 상)

**문제**: Supabase Auth의 `auth.users.id` (UUID)가 `profiles.id`의 FK. Firebase Auth는 다른 UID 체계.

**영향 범위:**
- `profiles` 테이블 PK
- `questions.author_id`, `answers.author_id` 등 FK 참조
- Storage 경로 (`{account_id}/...`)
- 모든 `getCurrentUser()` 호출 (51파일)

**완화 전략:**
1. Firebase Admin SDK의 `createUser({ uid: supabaseUid })` — 기존 UUID 유지 시도
2. 불가능 시: `auth_uid_mapping` 테이블 + `getCurrentUser()` 내부에서 매핑 조회
3. 최악: profiles.id를 Firebase UID로 일괄 업데이트 (FK CASCADE)

**권장**: 옵션 1 (Firebase에서 UID 지정 가능, `customToken` 방식)

#### 리스크 #1: 비밀번호 해시 비호환 (심각도 중)

**문제**: Supabase는 bcrypt, Firebase는 scrypt 해시 사용.

**완화:**
- Firebase Admin SDK의 `importUsers()` 에 `hash.algorithm: 'BCRYPT'` 지원 확인
- 지원 시: 해시 그대로 이관 (사용자 재인증 불필요)
- 미지원 시: 40명 전원 비밀번호 리셋 (카카오톡/Slack 개별 안내)

---

## §10. Executive Summary

| 항목 | 값 |
|------|-----|
| **Feature** | Vercel + Supabase → GCP 완전 이관 |
| **현재 진행률** | ~80% (코드 전환 완료, 인프라 전환 대기) |
| **남은 Phase** | A (Auth 데이터 이관) → B (Cloud Run 프론트) → C (RLS 정리) |
| **총 남은 공수** | 1-2주 |
| **비용 변화** | $0/월 → $16-55/월 |
| **핵심 리스크** | profiles.id UUID 매핑 (🔴), 비밀번호 해시 호환 (🟡) |
| **롤백 가능** | 각 Phase별 독립 롤백 가능 (§6 참조) |

### 완료된 작업 요약

| 항목 | 파일 수 | 상태 |
|------|:------:|:----:|
| Supabase SDK 제거 | 126 | ✅ |
| Firebase Auth 구현 | 6+51 | ✅ |
| DB → Cloud SQL | 80+ | ✅ |
| Storage → GCS | 22 | ✅ |
| Cron → Cloud Scheduler | 23 | ✅ |
| Vercel 코드 정리 | 49 | ✅ |

### 남은 작업 요약

| Phase | 핵심 작업 | 공수 | 위험 |
|-------|----------|:----:|:----:|
| A | 사용자 데이터 이관 (40명) + UUID 매핑 | 2-3일 | 높음 |
| B | Cloud Run 배포 + DNS 전환 | 1-2일 | 낮음 |
| C | RLS DISABLE + 잔여 정리 | 0.5-1일 | 낮음 |
| 별도 | CI/CD 파이프라인 | 2-3일 | 중간 |
| 별도 | Preview 배포 | 3-5일 | 중간 |

### 실행 순서 (의존성 기반)

```
Phase A (Auth 데이터 이관)
    ↓
Phase B (Cloud Run 프론트) ──→ CI/CD 파이프라인 (병렬 가능)
    ↓                              ↓
Phase C (RLS 정리)          Preview 배포 설정
    ↓
  ✅ 완료 (Vercel + Supabase 완전 탈피)
```
