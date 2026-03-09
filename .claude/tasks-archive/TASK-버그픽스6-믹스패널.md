# TASK-버그픽스6-믹스패널.md — 버그 수정 + 믹스패널 연동

> 작성: 모찌 | 2026-02-26
> 기획서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-26-mixpanel-integration-plan.md
> 우선순위: 높음

---

## ⚠️ 절대 규칙

1. **기존 코드를 먼저 읽어라.** 수정 대상 파일을 반드시 먼저 확인.
2. **"이미 구현됨" 판단 금지.** 현재 동작과 아래 스펙을 비교하여 다르면 수정.
3. **수정 후 반드시:** `npm run build` + `npx tsc --noEmit` PASS 확인 후 커밋.
4. **라이트 모드 전용.** 다크모드 고려 불필요.

---

## Part A — 버그 수정

> **구현 파일**: `content/[id]/page.tsx`, `content/page.tsx`, `generate-preview-modal.tsx`, `info-share-tab.tsx`

### B1. 관리자 사이드바 "수강생 성과" 메뉴 미노출 — ✅ 완료 (22fa976)

- `Sidebar.tsx:45`에 이미 추가됨 (TrendingUp 아이콘, 2번째 위치)
- 추가 변경 불필요

### B2. 콘텐츠 뒤로가기 로딩 버그 (미해결)

---

### B2. 콘텐츠 뒤로가기 로딩 버그 (미해결)

#### 증상
- 콘텐츠탭에서 콘텐츠 상세 보고 뒤로가기 누르면 페이지 전체가 다시 로딩됨
- Safari에서도 동일 재현
- commit `d755e4e`에서 수정 시도했으나 여전히 발생

#### 확인 사항 (기존 수정이 왜 안 되는지 파악)
1. `d755e4e` 커밋 내용 확인: `git show d755e4e`
2. 해당 수정이 실제로 뒤로가기 문제를 해결하는 접근이었는지 확인
3. 문제 파일: 콘텐츠 상세 페이지의 뒤로가기 버튼/링크 구현 방식
4. 관련 파일:
   - `src/app/(main)/admin/content/` — 콘텐츠 관리 페이지
   - `src/app/(main)/curation/` — 큐레이션 페이지
   - `src/app/(main)/info-share/` — 정보공유 페이지

#### 근본 원인 & 수정 방향
- `<Link href="/path">` 하드코딩 → 탭 파라미터 소실 → 기본 탭으로 리셋 + 리마운트
- **수정안 A**: `router.back()` 사용 (브라우저 히스토리 스택 활용)
- **수정안 B**: 뒤로가기 링크에 이전 탭 파라미터 포함 (`?tab=xxx`)
- **수정안 C**: Next.js `<Link>` 대신 `<button onClick={() => router.back()}>` 사용
- **어떤 수정안이든**: 뒤로가기 시 전체 페이지 리로딩이 발생하지 않아야 함

#### 완료 기준
- [ ] 콘텐츠 상세 → 뒤로가기: 이전 탭 유지 + 전체 로딩 없음
- [ ] 큐레이션 상세 → 뒤로가기: 동일
- [ ] 정보공유 상세 → 뒤로가기: 동일
- [ ] Safari, Chrome 모두 동작

---

## Part B — 믹스패널 연동

### T1. daily_mixpanel_insights 테이블 생성

#### DB 마이그레이션
```sql
CREATE TABLE IF NOT EXISTS daily_mixpanel_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  account_id      TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  total_revenue   NUMERIC(15, 2) DEFAULT 0,
  purchase_count  INTEGER DEFAULT 0,
  collected_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (date, account_id, project_id)
);

CREATE INDEX idx_dmi_user_date ON daily_mixpanel_insights (user_id, date DESC);
CREATE INDEX idx_dmi_account_date ON daily_mixpanel_insights (account_id, date DESC);
```

- RLS 정책: 본인 데이터만 조회 (user_id = auth.uid()) + 관리자 전체 조회
- service_role로 INSERT (크론)

#### 완료 기준
- [ ] 테이블 생성 SQL을 `supabase/migrations/` 폴더에 저장
- [ ] 코드에서 타입 정의 (`types/` 또는 인라인)

---

### T2. collect-mixpanel 크론 API

#### 엔드포인트
```
GET /api/cron/collect-mixpanel
Authorization: Bearer {CRON_SECRET}
```

#### 수집 로직
1. `ad_accounts` (active=true) + `profiles` JOIN → mixpanel_project_id 있는 계정 목록
2. 시크릿키 조회 우선순위: `service_secrets` → `profiles.mixpanel_secret_key` fallback
3. 어제 날짜 기준 수집
4. 계정별 Mixpanel Segmentation API 호출:
   - **토탈매출**: `event=purchase, type=sum, on=properties["$amount"]`
   - **구매건수**: `event=purchase, type=general`
   - 이벤트명/속성명 전체 수강생 동일 (Smith님 확인)
5. `daily_mixpanel_insights` UPSERT (date + account_id + project_id 기준)
6. Rate limit 대응: 순차 처리 (60 queries/hour, 현재 수강생 7명이므로 충분)

#### 인증
```typescript
const auth = Buffer.from(`${secretKey}:`).toString("base64");
const headers = { Authorization: `Basic ${auth}` };
```

#### API URL
```
GET https://mixpanel.com/api/2.0/segmentation?project_id={id}&event=purchase&from_date={date}&to_date={date}&type=sum&on=properties["$amount"]
```

#### 에러 처리
- 시크릿키 없는 계정 → 스킵 (로그 기록)
- API 401 → "시크릿키 만료" 로그
- API 타임아웃 → 10초 제한, 1회 재시도
- 부분 실패 시 성공한 건은 저장, 실패 건수 응답에 포함

#### 파일 위치
- `src/app/api/cron/collect-mixpanel/route.ts`

#### 완료 기준
- [ ] `/api/cron/collect-mixpanel` GET 요청 시 정상 수집
- [ ] CRON_SECRET 인증 필수
- [ ] daily_mixpanel_insights에 데이터 INSERT
- [ ] 시크릿키 없는 계정 스킵 + 로그

---

### T3. 미들웨어 크론 경로 공개

#### 현재
- `middleware.ts`에서 `/api/cron/collect-daily`만 인증 면제

#### 수정
- `/api/cron/collect-mixpanel`도 인증 면제 경로에 추가
- 패턴: `/api/cron/*` 전체 면제 또는 개별 추가

#### 파일
- `src/middleware.ts`

#### 완료 기준
- [ ] collect-mixpanel 크론 인증 없이 접근 가능 (CRON_SECRET은 API 내부에서 체크)

---

### T4. Vercel 크론 설정

#### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/collect-daily",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/collect-mixpanel",
      "schedule": "30 3 * * *"
    }
  ]
}
```

- collect-daily (03:00 UTC) 완료 후 30분 뒤 collect-mixpanel 실행
- 기존 collect-daily 크론 설정이 vercel.json에 없으면 함께 추가

#### 완료 기준
- [ ] vercel.json에 크론 2개 등록
- [ ] `npm run build` 통과

---

## 수정 대상 파일 요약

| 파일 | B1 | B2 | T1 | T2 | T3 | T4 |
|------|----|----|----|----|----|----|
| `components/dashboard/Sidebar.tsx` | ✅ | | | | | |
| `admin/content/` 관련 페이지 | | ✅ | | | | |
| `curation/` 관련 페이지 | | ✅ | | | | |
| `info-share/` 관련 페이지 | | ✅ | | | | |
| `supabase/migrations/` (신규) | | | ✅ | | | |
| `api/cron/collect-mixpanel/route.ts` (신규) | | | | ✅ | | |
| `middleware.ts` | | | | | ✅ | |
| `vercel.json` | | | | | | ✅ |

---

## 금지 사항
- 다크모드 스타일 추가 금지
- 기존 동작하는 기능 변경 금지
- `collect-daily` 코드 수정 금지 (별도 파일로)
- LP 데이터 관련 코드 활성화 금지 (주석 유지)
- 목업에 없는 UI 요소 추가 금지

---

## 리뷰 결과

> 리뷰어: 모찌 | 2026-02-26

### B1. 사이드바 — ✅ 이미 수정 완료 (22fa976)
- `src/components/dashboard/Sidebar.tsx:45`에 "수강생 성과" 이미 존재 (TrendingUp, 2번째 위치)
- 이전 에이전트팀이 `app-sidebar.tsx`(미사용 파일) 수정했으나, 이후 22fa976 커밋에서 올바른 파일(`Sidebar.tsx`) 수정 완료
- 추가 변경 불필요

### B2. 뒤로가기 — ✅ 수정 완료
- 근본 원인: `content/page.tsx`가 `"use client"` + `useEffect` fetch 구조 → 리마운트 시 로딩 스피너
- 수정 내용:
  1. `content/page.tsx`에 모듈 레벨 캐시(`_contentsCache`) 추가 → 뒤로가기 시 즉시 렌더링
  2. `content/page.tsx` → `content/[id]/page.tsx`로 `?from=tab` 파라미터 전달
  3. `content/[id]/page.tsx`에서 `router.back()` + `from` param fallback 구현
  4. `generate-preview-modal.tsx`, `info-share-tab.tsx`에도 `?from=` 파라미터 추가

### T1. daily_mixpanel_insights — ✅ 구현 완료
- `supabase/migrations/20260226_daily_mixpanel_insights.sql` 생성 (테이블 + RLS)

### T2. collect-mixpanel — ✅ 구현 완료
- `src/app/api/cron/collect-mixpanel/route.ts` 생성 (collect-daily 패턴)

### T3. 미들웨어 — ✅ 이미 해결
- `middleware.ts`에 `/api/cron` 전체가 PUBLIC_PATHS에 포함 → collect-mixpanel 자동 면제

### T4. Vercel 크론 — ✅ 구현 완료
- `vercel.json`에 `collect-mixpanel` 크론 추가 (매일 03:30 UTC)

---

## 타입
버그수정 + 개발
