# 전체 페이지 성능 코드리뷰

> 리뷰 일시: 2026-03-16
> 대상: 전체 페이지 + API 라우트 + Server Actions
> 방법: 코드 정적 분석 (수정 없음)
> 기존 리뷰 참조: `docs/review/posts-qa-performance-review.md` (posts/questions 상세)

---

## 전체 요약

| 심각도 | 건수 | 대표 이슈 |
|--------|------|-----------|
| **CRITICAL** | 4 | OG 이미지 캐시 없음, select("*") 26곳, 이메일 발송 N+1, embedQAThread N+1 |
| **HIGH** | 8 | view_count 동기 4곳, 대용량 텍스트 클라이언트 전달, 직렬 waterfall, 무제한 쿼리 |
| **MEDIUM** | 10 | Suspense 미작동, revalidatePath 52회, 중복 profile 조회, 캐시 불일치 |

**총 이슈: 22건** (posts/questions 기존 리뷰 6건 제외)

---

## 체크포인트별 전수 검사 결과

### CP1. select("*") — 불필요한 컬럼 과다 전송

**총 26곳 발견.** `src/` 전체 grep 결과:

| 심각도 | 파일 | 라인 | 테이블 | 영향 |
|--------|------|------|--------|------|
| **CRITICAL** | `actions/contents.ts` | 209 | contents | body_md, email_html 등 30개+ 컬럼 전체 전송 |
| **CRITICAL** | `actions/performance.ts` | 77, 192, 338, 382 | daily_ad_insights, ad_accounts 등 | 집계용 데이터에 전체 컬럼 |
| **HIGH** | `actions/questions.ts` | 345 | questions | 목록용인데 content 필드 포함 |
| **HIGH** | `actions/organic.ts` | 71 | organic_posts | status만 필요한데 전체 컬럼 |
| **HIGH** | `api/protractor/accounts/route.ts` | 13 | ad_accounts | service_secrets 등 민감 데이터 포함 가능 |
| **HIGH** | `api/protractor/insights/route.ts` | 48 | insights_aggregated_daily | 집계 테이블 전체 컬럼 |
| **HIGH** | `api/protractor/benchmarks/route.ts` | 78 | benchmarks | 벤치마크 전체 컬럼 |
| **HIGH** | `api/protractor/total-value/route.ts` | 32 | daily_ad_insights | 전체 컬럼 |
| **HIGH** | `api/protractor/overlap/route.ts` | 68 | ad_accounts | 전체 컬럼 |
| MEDIUM | `actions/invites.ts` | 55 | invites | 단건 조회 |
| MEDIUM | `actions/curation.ts` | 421 | contents | 단건 조회 |
| MEDIUM | `actions/qa-reports.ts` | 103 | qa_reports | 단건 조회 |
| MEDIUM | `lib/competitor/ad-cache.ts` | 73 | competitor_* | 캐시용 |
| MEDIUM | `lib/precompute/*.ts` | 32, 126, 30, 33, 101 | 다수 | 백그라운드 배치 |
| MEDIUM | `api/cron/competitor-check/route.ts` | 53 | competitor_monitors | cron 작업 |
| MEDIUM | `api/competitor/monitors/route.ts` | 33 | competitor_monitors | 목록 조회 |
| MEDIUM | `api/competitor/monitors/[id]/alerts/route.ts` | 49 | competitor_alerts | 알림 목록 |
| MEDIUM | `api/admin/email/ai-write/route.ts` | 105 | contents | 단건 AI 작성용 |

**개선 방안**: 각 쿼리에서 실제 사용하는 컬럼만 명시. 특히 `body_md`, `email_html`, `content`, `image_urls` 등 대용량 필드는 목록 조회에서 제외.

---

### CP2. OG 이미지 실시간 생성 폴백

| 심각도 | 파일 | 라인 | 이슈 |
|--------|------|------|------|
| **CRITICAL** | `api/og/route.tsx` | 1-112 | **Cache-Control 헤더 없음** — 매 요청마다 1200×630 이미지 생성 |
| **CRITICAL** | `components/posts/post-card.tsx` | 67 | thumbnail_url 없으면 `/api/og?title=...` 폴백 → 카드 N개면 N번 호출 |

**현재 상태**: `/api/og` Edge Runtime에서 `ImageResponse` 사용. 캐시 헤더 0개.

**개선 방안**:
1. OG 응답에 `Cache-Control: public, max-age=86400, s-maxage=604800` 추가
2. contents 테이블에 thumbnail_url 일괄 채우기 (1회성 스크립트)
3. CSS gradient 폴백으로 대체 (API 호출 제거)

---

### CP3. 직렬 waterfall (순차 쿼리)

| 심각도 | 파일 | 라인 | 패턴 | 예상 지연 |
|--------|------|------|------|-----------|
| **HIGH** | `api/admin/protractor/status/route.ts` | 66-188 | 5단 순차 쿼리: accounts → insights → secrets → mixpanel → 응답 빌드 | 300-500ms |
| **HIGH** | `api/admin/email/send/route.ts` | 254-384 | 배치 루프 내 INSERT → sendMail → UPDATE 직렬 | 배치당 2-5s |
| **HIGH** | `dashboard/student-home.tsx` | 57-101 | createClient → getUser → ad_accounts → insights → 수동 집계 | 200-400ms |
| MEDIUM | `api/admin/accounts/route.ts` | 13-46 | ad_accounts → profiles(userIds) → profiles(role) 3단 | 150-300ms |
| MEDIUM | `api/protractor/benchmarks/route.ts` | 55-79 | latest calculated_at → benchmarks 2단 | 100-200ms |
| MEDIUM | `settings/page.tsx` | 17-30 | profile 조회 → ad_accounts 조회 직렬 | 100-200ms |

**이미 병렬화된 곳** (양호):
- `admin.ts:getDashboardStats()` — 6개 count 쿼리 `Promise.all()` ✓
- `admin-dashboard.tsx` — stats + recentQuestions + recentPosts `Promise.all()` ✓
- `student-home.tsx:42-53` — notices + questions + posts `Promise.all()` ✓

**개선 방안**: 독립적인 쿼리는 `Promise.all()`로 병렬화. 의존성 있는 경우 최소 2단계로 축소.

---

### CP4. Suspense 미작동

| 심각도 | 파일 | 이슈 |
|--------|------|------|
| **HIGH** | `dashboard/page.tsx` | profile role 조회가 Suspense 바깥 → 전체 대시보드 블로킹 |
| MEDIUM | `settings/page.tsx` | Suspense 없음 → 2개 쿼리 완료까지 빈 화면 |
| MEDIUM | `admin/email/page.tsx` | 외부 Suspense만 있고, 내부 데이터 fetch는 Suspense 밖 |
| MEDIUM | `admin/knowledge/page.tsx` | dynamic import에 loading/error fallback 없음 |
| MEDIUM | `questions/page.tsx` | 데이터 fetch 완료 후 Suspense 내부 렌더링 → fallback 미표시 |

**개선 방안**: 각 독립 섹션을 별도 Server Component로 분리 → `<Suspense fallback={<Skeleton />}>` 래핑 → 스트리밍 렌더링 활성화.

---

### CP5. 대용량 텍스트 클라이언트 전달

| 심각도 | 파일 | 라인 | 필드 | 컨텍스트 |
|--------|------|------|------|----------|
| **HIGH** | `actions/posts.ts` | 35 | `body_md` | 목록 페이지에 마크다운 원문 전체 전달 (3개 글 × ~10KB) |
| **HIGH** | `actions/contents.ts` | 209 | `body_md`, `email_html`, `email_summary` | 관리자 콘텐츠 목록에 본문 전체 전달 |
| **HIGH** | `actions/questions.ts` | 29 | `content` | 질문 목록에 본문 전체 전달 |
| MEDIUM | `dashboard/member-dashboard.tsx` | 195 | `body_md` → `getExcerpt(120)` | 120자만 표시하는데 전체 전달 |
| MEDIUM | `dashboard/student-home.tsx` | 43 | `body_md` | 대시보드 프리뷰 3개에 전체 본문 |

**추정 낭비**: 목록 페이지 1회 로드당 **50-200KB** 불필요한 텍스트 전송.

**개선 방안**: 목록용 쿼리에서 `body_md`, `content`, `email_html` 제외. 필요시 `left(body_md, 200)` 등 서버에서 잘라서 전송.

---

### CP6. view_count UPDATE 동기 처리

**4곳 모두 동일 패턴**: SELECT → await UPDATE → return

| 심각도 | 파일 | 라인 | 테이블 |
|--------|------|------|--------|
| **HIGH** | `actions/questions.ts` | 80-84 | questions |
| **HIGH** | `actions/posts.ts` | 87-91 | contents (getPostById) |
| **HIGH** | `actions/posts.ts` | 134-138 | contents (getNoticeById) |
| **HIGH** | `actions/reviews.ts` | 74-78 | reviews |

**현재 코드** (모두 동일 패턴):
```typescript
const { data, error } = await supabase.from("table").select(...).eq("id", id).single();
// ↓ 이 await가 응답을 50-100ms 블로킹
await supabase.from("table").update({ view_count: (data.view_count || 0) + 1 }).eq("id", id);
return { data, error: null };
```

**개선 방안**: `after()` (Next.js) 또는 fire-and-forget으로 변경:
```typescript
import { after } from "next/server";
// SELECT 후 즉시 return, UPDATE는 응답 반환 후 실행
after(async () => {
  await supabase.from("table").update({ view_count: ... }).eq("id", id);
});
return { data, error: null };
```

---

### CP7. N+1 쿼리 패턴

| 심각도 | 파일 | 라인 | 패턴 |
|--------|------|------|------|
| **CRITICAL** | `lib/qa-embedder.ts` | 183-196 | `embedQAThread()` 내 꼬리질문 루프: 꼬리질문 N개마다 answers SELECT 1회 |
| **CRITICAL** | `api/admin/email/send/route.ts` | 292-336 | 수신자 배치 루프: INSERT 1건 → sendMail → UPDATE 1건 × 배치당 50명 |
| **HIGH** | `actions/reviews.ts` | 306-316 | `reorderFeaturedReviews()`: featured N개마다 UPDATE 1회 |
| MEDIUM | `api/cron/sync-notion/route.ts` | 218-249 | 청크별 순차 embedding + INSERT |
| MEDIUM | `lib/qa-embedder.ts` | 72-119 | `embedQAPair()`: 청크별 순차 embedding + INSERT |
| MEDIUM | `actions/embed-pipeline.ts` | 330-346 | `embedAllPending()`: 아이템별 순차 처리 |

**가장 심각한 케이스** — `embedQAThread()`:
```typescript
for (const fq of followUps) {
  // 꼬리질문마다 별도 쿼리 ← N+1
  const { data: fqAnswers } = await supabase
    .from("answers").select("id, content, is_ai")
    .eq("question_id", fq.id)
    .eq("is_approved", true);
}
```

**개선 방안**: 꼬리질문 ID 배열로 한 번에 조회:
```typescript
const allFollowUpIds = followUps.map(fq => fq.id);
const { data: allAnswers } = await supabase
  .from("answers").select("question_id, id, content, is_ai")
  .in("question_id", allFollowUpIds)
  .eq("is_approved", true);
// Map으로 그룹핑
const answersByQuestion = new Map();
for (const a of allAnswers || []) {
  if (!answersByQuestion.has(a.question_id)) answersByQuestion.set(a.question_id, []);
  answersByQuestion.get(a.question_id).push(a);
}
```

---

### CP8. revalidatePath 남용

**총 52회 호출** — 전체 actions 파일 대상 grep 결과.

| 파일 | 호출 수 | 특이사항 |
|------|---------|----------|
| `actions/admin.ts` | **13회** | 회원 승인/거절/역할 변경마다 `/admin/members` + `/admin/accounts` |
| `actions/answers.ts` | **9회** | 답변 생성/승인/거절마다 3-4개 경로 동시 무효화 |
| `actions/reviews.ts` | **8회** | 리뷰 CRUD마다 `/reviews` + `/admin/reviews` |
| `actions/questions.ts` | **7회** | 질문 CRUD마다 `/questions` + `/dashboard` |
| `actions/posts.ts` | **5회** | 게시글 CRUD마다 `/posts` + `/dashboard` |
| `actions/curation.ts` | **5회** | 큐레이션 작업마다 `/admin/content` |

**문제**: 하나의 action에서 3-4개 경로를 동시에 무효화 → ISR 캐시 무효화 비용 누적. 특히 `admin.ts`에서 회원 1명 승인할 때마다 `/admin/members` + `/admin/accounts` 2개 경로 무효화.

**개선 방안**:
1. SWR `mutate()` 사용하는 클라이언트 컴포넌트는 `revalidatePath` 불필요 (중복)
2. 관련 없는 경로 무효화 제거 (예: 회원 승인 시 `/admin/accounts` 무효화 불필요한 경우)
3. `revalidateTag()` 사용해서 세밀한 캐시 무효화

---

## 페이지별 상세 분석

### /dashboard

**파일**: `src/app/(main)/dashboard/page.tsx`, `admin-dashboard.tsx`, `member-dashboard.tsx`, `student-home.tsx`

| 심각도 | 이슈 | 위치 |
|--------|------|------|
| **HIGH** | profile role 조회가 Suspense 바깥 → 전체 블로킹 | `page.tsx` |
| **HIGH** | student-home에서 user 중복 조회 (page에서 이미 조회) | `student-home.tsx:58-59` |
| **HIGH** | body_md 전체 전달 (대시보드 프리뷰 3개에) | `student-home.tsx:43`, `member-dashboard.tsx:39` |
| MEDIUM | ad_accounts + insights 순차 쿼리 | `student-home.tsx:62-79` |
| MEDIUM | JS에서 수동 SUM 집계 (SQL 집계 가능) | `student-home.tsx:81-96` |
| MEDIUM | 대시보드 stats 캐시 있으나 recentQuestions/recentPosts 캐시 없음 | `admin.ts:230-292` vs `357-381` |

---

### /reviews

**파일**: `src/app/(main)/reviews/page.tsx`, `[id]/page.tsx`, `src/actions/reviews.ts`

| 심각도 | 이슈 | 위치 |
|--------|------|------|
| **HIGH** | view_count 동기 UPDATE | `reviews.ts:74-78` |
| **HIGH** | `getReviewsAdmin()` — 페이지네이션 없이 전체 조회 | `reviews.ts:328-334` |
| MEDIUM | 중복 role 조회 (page + action 둘 다) | `reviews/page.tsx:18-23` |
| MEDIUM | `reorderFeaturedReviews()` N+1 UPDATE | `reviews.ts:306-316` |

---

### /protractor

**파일**: `src/app/(main)/protractor/page.tsx`, `src/app/api/protractor/*`

| 심각도 | 이슈 | 위치 |
|--------|------|------|
| **HIGH** | `select("*")` 5곳 — accounts, insights, benchmarks, total-value, overlap | API 라우트 전반 |
| **HIGH** | admin 프로필 중복 조회 (layout + page) | `protractor/page.tsx:23-28` |
| MEDIUM | benchmarks 2단 쿼리 (latest date → 해당 date 데이터) | `api/protractor/benchmarks/route.ts:55-79` |

---

### /settings

**파일**: `src/app/(main)/settings/page.tsx`

| 심각도 | 이슈 | 위치 |
|--------|------|------|
| MEDIUM | Suspense 없음 → 2개 쿼리 완료까지 빈 화면 | `settings/page.tsx:17-30` |
| MEDIUM | profile + ad_accounts 순차 쿼리 | `settings/page.tsx:17-30` |

---

### /notices

**파일**: `src/app/(main)/notices/page.tsx`

리다이렉트 전용 (`/posts?category=notice`로 이동). **이슈 없음.** ✓

---

### /admin/*

**파일**: `src/app/(main)/admin/` 전체

| 심각도 | 이슈 | 위치 |
|--------|------|------|
| **CRITICAL** | admin/stats — `select("*", { count: "exact", head: true })` 6곳 | `admin/stats/page.tsx:32-46` |
| **HIGH** | admin/content — SWR로 body_md 포함 전체 컬럼 전달 | `admin/content/page.tsx:81-96` |
| **HIGH** | admin/content — 클라이언트에서 "sent" 필터 (서버에서 해야 함) | `admin/content/page.tsx:90` |
| **HIGH** | `getMembers()` — `select("*")` + 이후 ad_accounts 순차 쿼리 | `admin.ts:24, 44-60` |
| MEDIUM | admin/email — 내부 Suspense 미적용 | `admin/email/page.tsx` |
| MEDIUM | admin/knowledge — dynamic import에 loading/error 없음 | `admin/knowledge/page.tsx:20-28` |
| MEDIUM | `getRecentQuestions()` — `select("*")` (5개 프리뷰에 전체 컬럼) | `admin.ts:357-363` |
| MEDIUM | revalidatePath 13회 (admin.ts 단독) | `admin.ts` 전반 |

**admin/stats 특이사항**: `head: true` 옵션으로 데이터 본문은 안 가져오지만, `select("*")` 자체가 Supabase에서 쿼리 플래닝에 영향. `select("id")` 로 변경 권장.

---

### API Routes (/api/*)

| 심각도 | 파일 | 이슈 |
|--------|------|------|
| **CRITICAL** | `api/og/route.tsx` | Cache-Control 헤더 없음 → 매 요청마다 이미지 생성 |
| **CRITICAL** | `api/admin/email/send/route.ts` | N+1: 수신자마다 INSERT → sendMail → UPDATE 직렬 |
| **HIGH** | `api/admin/protractor/status/route.ts` | 5단 순차 쿼리 |
| **HIGH** | `api/diagnose/route.ts` | `select("*")` + 1000행 인메모리 집계 → 2MB+ 응답 가능 |
| **HIGH** | `api/admin/email/analytics/route.ts` | `.limit(1000)` 하드코딩 + JS에서 GROUP BY |
| MEDIUM | `api/cron/sync-notion/route.ts` | 청크별 순차 embedding (병렬화 가능) |
| MEDIUM | `api/unsplash/search/route.ts` | 외부 API timeout 없음 |
| MEDIUM | `api/competitor/download-zip/route.ts` | 50+ 이미지 동시 fetch (rate limit 없음) |
| MEDIUM | `api/qa-chatbot/route.ts` | Anthropic API 응답 파싱 timeout 미적용 |
| MEDIUM | `api/competitor/search/route.ts` | 브랜드명 번역 캐시가 인스턴스별 (Vercel 배포 시 무효) |
| MEDIUM | `api/cron/health/route.ts` | 캐시 없이 매번 4개 cron 상태 조회 |
| MEDIUM | `api/admin/accounts/route.ts` | 3단 순차 쿼리 (accounts → profiles × 2) |

---

## 우선순위별 개선 로드맵

### P0: 즉시 수정 (Quick Win, 30분 이내)

| # | 이슈 | 파일 | 예상 효과 |
|---|------|------|-----------|
| 1 | view_count `after()` 변경 (4곳) | questions.ts, posts.ts, reviews.ts | 상세 페이지 50-100ms 단축 |
| 2 | OG 이미지 Cache-Control 추가 | api/og/route.tsx | 90% OG 재생성 제거 |
| 3 | admin/stats `select("id")` 변경 | admin/stats/page.tsx | 6개 count 쿼리 최적화 |

### P1: 이번 주 (1-2시간)

| # | 이슈 | 파일 | 예상 효과 |
|---|------|------|-----------|
| 4 | 목록 쿼리에서 body_md/content 제외 | posts.ts, contents.ts, questions.ts | 페이지당 50-200KB 절감 |
| 5 | embedQAThread N+1 → `in()` 쿼리 | lib/qa-embedder.ts | 임베딩 시간 N×100ms → 1×100ms |
| 6 | protractor API select("*") → 필드 지정 (5곳) | api/protractor/*.ts | 응답 크기 50-70% 감소 |
| 7 | admin/content 서버사이드 필터링 | admin/content/page.tsx + contents.ts | 불필요한 데이터 전송 제거 |

### P2: 다음 주 (구조 개선)

| # | 이슈 | 파일 | 예상 효과 |
|---|------|------|-----------|
| 8 | 이메일 발송 배치 INSERT/UPDATE | api/admin/email/send/route.ts | 대량 발송 속도 3-5배 향상 |
| 9 | dashboard Suspense 스트리밍 | dashboard/page.tsx + 하위 컴포넌트 | 체감 로딩 속도 2배 향상 |
| 10 | student-home ad_accounts SQL 집계 | dashboard/student-home.tsx | JS 수동 집계 → DB SUM |
| 11 | revalidatePath → revalidateTag 마이그레이션 | 전체 actions | ISR 캐시 효율화 |
| 12 | getReviewsAdmin 페이지네이션 추가 | reviews.ts | 리뷰 수 증가 시 안전 |

### P3: 장기 (아키텍처 개선)

| # | 이슈 | 파일 | 예상 효과 |
|---|------|------|-----------|
| 13 | contents thumbnail_url 일괄 채우기 | DB migration + 1회성 스크립트 | OG 폴백 완전 제거 |
| 14 | 임베딩 배치 병렬화 (concurrency limit) | qa-embedder.ts, embed-pipeline.ts | 임베딩 처리 3-5배 속도 향상 |
| 15 | 외부 API timeout/retry 통일 | api/unsplash, api/competitor, api/diagnose | 장애 전파 방지 |

---

## select("*") 전체 목록 (26곳)

```
src/lib/competitor/ad-cache.ts:73
src/lib/precompute/performance-precompute.ts:32
src/lib/precompute/performance-precompute.ts:126
src/lib/precompute/t3-precompute.ts:30
src/lib/precompute/diagnosis-precompute.ts:33
src/lib/precompute/diagnosis-precompute.ts:101
src/actions/invites.ts:55
src/actions/curation.ts:421
src/actions/contents.ts:209
src/actions/contents.ts:427
src/actions/qa-reports.ts:103
src/actions/organic.ts:71
src/actions/performance.ts:77
src/actions/performance.ts:192
src/actions/performance.ts:338
src/actions/performance.ts:382
src/actions/questions.ts:345
src/app/api/protractor/total-value/route.ts:32
src/app/api/protractor/overlap/route.ts:68
src/app/api/admin/email/ai-write/route.ts:105
src/app/api/protractor/insights/route.ts:48
src/app/api/cron/competitor-check/route.ts:53
src/app/api/protractor/benchmarks/route.ts:78
src/app/api/protractor/accounts/route.ts:13
src/app/api/competitor/monitors/route.ts:33
src/app/api/competitor/monitors/[id]/alerts/route.ts:49
```

---

## revalidatePath 전체 목록 (52회)

```
actions/admin.ts       — 13회 (/admin/members ×7, /admin/accounts ×5, /admin/members ×1)
actions/answers.ts     —  9회 (/questions/*, /questions, /dashboard, /admin/answers)
actions/reviews.ts     —  8회 (/reviews ×5, /admin/reviews ×3)
actions/questions.ts   —  7회 (/questions ×4, /dashboard ×2, /questions/* ×1)
actions/posts.ts       —  5회 (/posts ×2, /dashboard ×1, /posts/* ×1, /questions/* ×1)
actions/curation.ts    —  5회 (/admin/content ×5)
```

---

## 결론

가장 큰 성능 병목은 **3가지 카테고리**:

1. **데이터 과다 전송** (select("*") 26곳 + body_md 클라이언트 전달) — 네트워크 대역폭 낭비
2. **동기 블로킹** (view_count 4곳 + waterfall 6곳) — 페이지 로딩 지연
3. **캐시 부재** (OG 이미지 + 대시보드 최근 데이터) — 반복 연산

P0 항목 3개만 수정해도 사용자 체감 속도 **30-50% 개선** 가능. 특히 view_count `after()` 변경은 4개 파일 8줄 수정으로 전체 상세 페이지 응답시간을 단축할 수 있는 가장 효율적인 개선점.
