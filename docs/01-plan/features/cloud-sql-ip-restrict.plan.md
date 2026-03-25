# Cloud SQL IP 제한 실행 계획

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Cloud SQL authorized networks를 허용 IP만으로 제한 |
| 작성일 | 2026-03-25 |
| GCP 프로젝트 | modified-shape-477110-h8 |
| Cloud SQL 인스턴스 IP | 34.50.5.237 |
| 리전 | asia-northeast3 (서울) |
| 현재 상태 | 0.0.0.0/0 (전체 허용) — 보안 위험 |
| 선행 조건 | backfill 90일 완료 후 실행 (TASK-P4-GCP-PHASE6.md 참고) |

| 관점 | 내용 |
|------|------|
| Problem | Cloud SQL이 0.0.0.0/0으로 열려있어 인터넷 어디서든 접근 가능 |
| Solution | authorized networks를 필요한 IP/서비스만 허용하도록 제한 |
| Risk | 잘못 설정하면 프론트엔드(Vercel) + 크론(Cloud Run) 모두 DB 접근 불가 |
| Rollback | gcloud sql instances patch로 0.0.0.0/0 재등록 (즉시 복구 가능) |

---

## 1. 현재 인프라 분석 결과

### 1-1. DB 연결 클라이언트 목록

Cloud SQL(34.50.5.237:5432)에 접속하는 모든 클라이언트를 코드 분석으로 파악함.

| 클라이언트 | 연결 방식 | 연결 문자열 | 비고 |
|-----------|----------|-----------|------|
| **Vercel (프론트엔드)** | Public IP + SSL | `DATABASE_URL` (pg Pool) | `USE_CLOUD_SQL=true`일 때만 Cloud SQL 사용. 현재 Vercel에 DATABASE_URL 미등록 — Supabase PostgREST 경유 중 |
| **Cloud Run: bscamp-cron** | Public IP + SSL | `DATABASE_URL` 환경변수 | `ssl: { rejectUnauthorized: false }` |
| **Cloud Run: bscamp-crawler** | Public IP + SSL | `DATABASE_URL` 환경변수 | 동일 |
| **Cloud Run: creative-pipeline** | **Supabase REST API** | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Python predict.py가 Supabase PostgREST 경유 — Cloud SQL 직접 연결 아님 |
| **Cloud Run Jobs: bscamp-scripts** | Public IP | `DATABASE_URL` (scripts/lib/cloud-sql.mjs) | 배치 스크립트 |
| **Smith님 Mac (로컬)** | Public IP + SSL | `.env.local` DATABASE_URL | 개발/디버깅용 |

### 1-2. 연결 패턴 분석

**핵심 발견: 모든 연결이 Public IP + connectionString 방식**

```
src/lib/db/pool.ts:
  new Pool({
    connectionString: process.env.DATABASE_URL,  // postgresql://...@34.50.5.237:5432/bscamp
    ssl: { rejectUnauthorized: false },
  })
```

- Cloud SQL Auth Proxy 미사용
- Cloud SQL Connector 미사용
- Private IP / VPC 미사용
- 순수 TCP/IP 연결 + SSL

### 1-3. creative-pipeline 특이사항

`services/creative-pipeline/saliency/predict.py`는 Cloud SQL에 직접 연결하지 않음.
Supabase REST API(`SB_URL + SB_KEY`)를 사용하여 DB에 접근함.
따라서 Cloud SQL IP 제한에 영향받지 않음.

---

## 2. Cloud Run → Cloud SQL 연결 방식 비교

### 옵션 A: Cloud SQL Auth Proxy (권장, 향후)

| 항목 | 내용 |
|------|------|
| 방식 | Cloud Run에 `--add-cloudsql-instances` 플래그 설정 → Unix socket 연결 |
| 장점 | IP 허용 불필요, IAM 인증, 자동 SSL, 가장 안전 |
| 단점 | DATABASE_URL을 Unix socket 경로로 변경 필요 (`/cloudsql/INSTANCE_CONNECTION_NAME`) |
| 코드 변경 | `pool.ts`의 connectionString → host 기반으로 변경 |
| 영향 범위 | pool.ts, cloud-sql.mjs, db-helpers.mjs, env.mjs |

```
# Cloud SQL Auth Proxy 사용 시 DATABASE_URL 변경 예시
# 현재: postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp
# 변경: postgresql://postgres:BsCamp2026Gcp@/bscamp?host=/cloudsql/modified-shape-477110-h8:asia-northeast3:INSTANCE_NAME
```

### 옵션 B: Serverless VPC Access Connector + Private IP

| 항목 | 내용 |
|------|------|
| 방식 | VPC connector 생성 → Cloud Run에 연결 → Cloud SQL private IP 사용 |
| 장점 | 외부 IP 불필요, VPC 내부 통신 |
| 단점 | VPC connector 추가 비용 ($0.2/GB), 설정 복잡 |
| 코드 변경 | DATABASE_URL의 IP만 private IP로 변경 |

### 옵션 C: Public IP + Authorized Networks (현재 방식 보완)

| 항목 | 내용 |
|------|------|
| 방식 | 현재 0.0.0.0/0 → 필요한 IP만 등록 |
| 장점 | 코드 변경 없음, 가장 빠른 적용 |
| 단점 | Cloud Run은 고정 IP가 없어서 이 방식만으로 Cloud Run 보호 불가 |
| 해결 | Cloud Run은 Cloud SQL Auth Proxy 전환 필수 |

---

## 3. 권장 실행 계획

### Phase 1: Cloud Run → Cloud SQL Auth Proxy 전환 (코드 변경)

Cloud Run 서비스는 고정 outbound IP가 없으므로 authorized networks에 등록할 수 없음.
Cloud SQL Auth Proxy를 사용하면 IP 허용 없이 IAM 기반으로 접근 가능.

#### 3-1. Cloud SQL 인스턴스 이름 확인

```bash
# 인스턴스 목록 + connection name 확인
gcloud sql instances list --project=modified-shape-477110-h8

# 상세 확인 (ipConfiguration + connectionName)
gcloud sql instances describe [INSTANCE_NAME] \
  --project=modified-shape-477110-h8 \
  --format="json(connectionName, settings.ipConfiguration)"
```

#### 3-2. Cloud Run 서비스에 Cloud SQL 연결 추가

```bash
# bscamp-cron
gcloud run services update bscamp-cron \
  --region=asia-northeast3 \
  --project=modified-shape-477110-h8 \
  --add-cloudsql-instances=modified-shape-477110-h8:asia-northeast3:[INSTANCE_NAME]

# bscamp-crawler
gcloud run services update bscamp-crawler \
  --region=asia-northeast3 \
  --project=modified-shape-477110-h8 \
  --add-cloudsql-instances=modified-shape-477110-h8:asia-northeast3:[INSTANCE_NAME]

# bscamp-scripts (Cloud Run Jobs)
gcloud run jobs update bscamp-scripts \
  --region=asia-northeast3 \
  --project=modified-shape-477110-h8 \
  --add-cloudsql-instances=modified-shape-477110-h8:asia-northeast3:[INSTANCE_NAME]
```

#### 3-3. DATABASE_URL 환경변수 변경 (Cloud Run만)

Cloud Run 서비스의 DATABASE_URL을 Unix socket 방식으로 변경:

```bash
# Cloud Run용 DATABASE_URL (Unix socket)
DATABASE_URL="postgresql://postgres:BsCamp2026Gcp@/bscamp?host=/cloudsql/modified-shape-477110-h8:asia-northeast3:[INSTANCE_NAME]"
```

```bash
# bscamp-cron 환경변수 업데이트
gcloud run services update bscamp-cron \
  --region=asia-northeast3 \
  --project=modified-shape-477110-h8 \
  --update-env-vars="DATABASE_URL=postgresql://postgres:BsCamp2026Gcp@/bscamp?host=/cloudsql/modified-shape-477110-h8:asia-northeast3:[INSTANCE_NAME]"
```

#### 3-4. 코드 변경 (필요한 경우)

`src/lib/db/pool.ts`의 pg Pool은 Unix socket 경로를 `?host=` 파라미터로 지원함.
추가 코드 변경 없이 환경변수만 변경하면 동작함.

단, `ssl: { rejectUnauthorized: false }` 옵션이 Unix socket에서는 불필요하므로
조건부 처리 권장:

```typescript
// src/lib/db/pool.ts — 수정안 (선택)
const isUnixSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");
pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ...(isUnixSocket ? {} : { ssl: { rejectUnauthorized: false } }),
});
```

`scripts/lib/cloud-sql.mjs`도 동일하게 SSL 조건부 처리 필요:

```javascript
// scripts/lib/cloud-sql.mjs — 수정안 (선택)
const isUnixSocket = DATABASE_URL.includes("/cloudsql/");
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  ...(isUnixSocket ? {} : { ssl: { rejectUnauthorized: false } }),
});
```

### Phase 2: Authorized Networks 제한

Cloud Run이 Auth Proxy로 전환된 후, authorized networks에서 0.0.0.0/0을 제거하고
필요한 IP만 등록.

#### 3-5. 현재 설정 스냅샷 저장

```bash
# 실행 전 반드시 현재 설정 백업
gcloud sql instances describe [INSTANCE_NAME] \
  --project=modified-shape-477110-h8 \
  --format=json > /tmp/cloud-sql-config-backup-$(date +%Y%m%d).json
```

#### 3-6. Smith님 Mac 공인 IP 확인

```bash
curl -s https://api.ipify.org
# 결과: xxx.xxx.xxx.xxx
```

#### 3-7. Vercel IP 대역 확인

Vercel Serverless Functions는 AWS 인프라를 사용하며 고정 IP가 없음.
Vercel은 IP 허용 목록 방식을 공식 지원하지 않음.

**현재 상황**: Vercel에 `DATABASE_URL`이 등록되어 있지 않음 (`.env.vercel`에 DATABASE_URL 없음).
Vercel은 Supabase PostgREST를 경유하여 DB에 접근하므로 Cloud SQL 직접 연결 없음.

따라서 Vercel IP를 authorized networks에 등록할 필요 없음.

> 향후 Vercel → Cloud Run 프론트 전환(Phase 3-D) 시, Cloud Run 프론트도 Auth Proxy 사용하면 됨.

#### 3-8. Authorized Networks 변경 실행

```bash
# Smith님 Mac IP만 등록 (Cloud Run은 Auth Proxy 사용하므로 IP 불필요)
gcloud sql instances patch [INSTANCE_NAME] \
  --project=modified-shape-477110-h8 \
  --authorized-networks="[SMITH_MAC_IP]/32"

# 주의: 이 명령은 기존 authorized networks를 완전히 교체함
# 여러 IP 등록 시 쉼표로 구분
# --authorized-networks="IP1/32,IP2/32,CIDR3"
```

### Phase 3: 검증

#### 3-9. Cloud Run → Cloud SQL 연결 테스트

```bash
# bscamp-cron 헬스체크 (DB 접근하는 엔드포인트)
curl -H "Authorization: Bearer [CRON_SECRET]" \
  "https://bscamp-cron-906295665279.asia-northeast3.run.app/api/cron/collect-daily?dry_run=true&limit=1"

# Cloud Run 로그 확인
gcloud run services logs read bscamp-cron \
  --region=asia-northeast3 \
  --project=modified-shape-477110-h8 \
  --limit=20
```

#### 3-10. Smith님 로컬 연결 테스트

```bash
# 로컬에서 직접 DB 접근 확인
psql "postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp" -c "SELECT 1;"
```

#### 3-11. 외부 IP 차단 확인

```bash
# 다른 IP에서 접속 시도 (차단되어야 함)
# VPN 또는 다른 네트워크에서 테스트
psql "postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp" -c "SELECT 1;"
# 예상 결과: connection refused 또는 timeout
```

#### 3-12. Vercel 프론트엔드 정상 동작 확인

```bash
# Vercel은 Supabase 경유이므로 영향 없어야 함
curl -s "https://bscamp.vercel.app" | head -20
```

---

## 4. 롤백 절차

IP 제한 후 서비스 장애 발생 시:

```bash
# 즉시 롤백: 0.0.0.0/0 재등록 (30초 내 적용)
gcloud sql instances patch [INSTANCE_NAME] \
  --project=modified-shape-477110-h8 \
  --authorized-networks="0.0.0.0/0"
```

---

## 5. 실행 순서 체크리스트

### 사전 준비 (Smith님 확인 필요)
- [ ] Cloud SQL 인스턴스 이름 확인: `gcloud sql instances list`
- [ ] Smith님 Mac 현재 공인 IP 확인: `curl -s https://api.ipify.org`
- [ ] 현재 Cloud SQL 설정 스냅샷 저장 (3-5)
- [ ] backfill 90일 완료 여부 확인

### Phase 1: Cloud SQL Auth Proxy 전환 (Cloud Run)
- [ ] Cloud Run 서비스에 `--add-cloudsql-instances` 추가 (3-2)
- [ ] DATABASE_URL을 Unix socket 방식으로 변경 (3-3)
- [ ] Cloud Run → DB 연결 테스트 (3-9)
- [ ] 크론 정상 실행 확인

### Phase 2: Authorized Networks 제한
- [ ] 0.0.0.0/0 제거 + Smith님 IP만 등록 (3-8)
- [ ] Smith님 로컬 DB 접근 확인 (3-10)
- [ ] 외부 IP 차단 확인 (3-11)
- [ ] Vercel 프론트엔드 정상 동작 확인 (3-12)

### Phase 3: 정리
- [ ] Cloud Run 로그에서 DB 연결 에러 없는지 24시간 모니터링
- [ ] Cloud Scheduler 크론 정상 실행 확인 (다음 날 03:00 KST)

---

## 6. 영향 범위 요약

| 서비스 | 현재 연결 | 변경 후 | 코드 변경 |
|--------|----------|---------|----------|
| Cloud Run: bscamp-cron | Public IP (34.50.5.237) | Auth Proxy (Unix socket) | 환경변수만 변경 (코드 수정 선택) |
| Cloud Run: bscamp-crawler | Public IP | Auth Proxy (Unix socket) | 환경변수만 변경 |
| Cloud Run Jobs: bscamp-scripts | Public IP | Auth Proxy (Unix socket) | 환경변수만 변경 |
| Cloud Run: creative-pipeline | Supabase REST API | 변경 없음 | 없음 |
| Vercel (프론트엔드) | Supabase 경유 | 변경 없음 | 없음 |
| Smith님 Mac | Public IP (34.50.5.237) | Public IP 유지 (authorized networks 등록) | 없음 |

### 수정 대상 파일 (선택 — SSL 조건부 처리)
- `src/lib/db/pool.ts` — Unix socket 시 SSL 비활성화
- `scripts/lib/cloud-sql.mjs` — 동일

---

## 7. 위험 요소 + 완화

| 위험 | 확률 | 영향 | 완화 |
|------|:----:|:----:|------|
| Auth Proxy 전환 후 DB 연결 실패 | 중 | 높음 | Phase 1 → 2 순차 실행. Auth Proxy 확인 후 IP 제한 |
| Smith님 IP 변경 (유동 IP) | 중 | 낮음 | IP 변경 시 gcloud로 재등록 (30초) |
| Cloud Run Jobs 누락 | 낮 | 중 | 모든 Cloud Run Jobs 목록 확인 후 일괄 적용 |
| creative-pipeline Python에서 Cloud SQL 직접 연결 추가 시 | 낮 | 중 | 향후 predict.py 변경 시 Auth Proxy 추가 필요 |

---

## 8. 참고: 대안 — 간이 적용 (Auth Proxy 없이)

Cloud SQL Auth Proxy 전환 없이 빠르게 적용하는 방법:

### Cloud Run에 Static Outbound IP 부여

```bash
# 1. VPC connector 생성
gcloud compute networks vpc-access connectors create bscamp-connector \
  --region=asia-northeast3 \
  --network=default \
  --range=10.8.0.0/28

# 2. Cloud NAT 게이트웨이 + 고정 IP 생성
gcloud compute addresses create bscamp-nat-ip --region=asia-northeast3
gcloud compute routers create bscamp-router --network=default --region=asia-northeast3
gcloud compute routers nats create bscamp-nat \
  --router=bscamp-router \
  --region=asia-northeast3 \
  --nat-external-ip-pool=bscamp-nat-ip \
  --nat-all-subnet-ip-ranges

# 3. Cloud Run에 VPC connector 연결 (egress=all-traffic)
gcloud run services update bscamp-cron \
  --region=asia-northeast3 \
  --vpc-connector=bscamp-connector \
  --vpc-egress=all-traffic
```

단점: 추가 비용 발생 (VPC connector $0.2/GB + NAT + 고정 IP)
장점: DATABASE_URL 코드 변경 없음

**권장: Auth Proxy가 비용 0, 보안 최상. Static IP 방식은 비권장.**

---

## 9. 비용 영향

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| Cloud SQL Auth Proxy | 미사용 | 추가 비용 없음 (Cloud Run 내장) |
| VPC Connector | 미사용 | 미사용 (Auth Proxy 사용 시) |
| 고정 IP | 미사용 | 미사용 |
| **총 추가 비용** | - | **$0** |
