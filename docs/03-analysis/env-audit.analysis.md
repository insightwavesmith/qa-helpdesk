# 환경변수 전수 점검 (ENV AUDIT)

## 분석 일시
2026-03-22

## Match Rate: N/A (감사 태스크 — 코드 대비 등록 현황 점검)

---

## 1. 전체 환경변수 매핑 테이블

아래 표는 코드에서 `process.env.*`로 참조하는 모든 변수와 등록 현황입니다.

| 변수명 | 용도 | .env.local | Vercel | 비고 |
|--------|------|:----------:|:------:|------|
| **Supabase** | | | | |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | O | O (Dev/Preview/Prod) | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (클라이언트) | O | O (Dev/Preview/Prod) | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (서버) | O | O (Preview/Prod) | Development 미등록 |
| `SUPABASE_URL` | Supabase URL 대체명 (스크립트 일부) | X | X | `migrate-lp-screenshots-v2.mjs`, `analyze-lps-v2.mjs` 사용. NEXT_PUBLIC_SUPABASE_URL 폴백 있음 |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API 토큰 (구버전 스크립트) | X | X | `embed-768.mjs`, `embed-3072.mjs`, `migrate-to-v2.mjs`만 사용. 레거시 스크립트 |
| **AI / 임베딩** | | | | |
| `GEMINI_API_KEY` | Gemini API (임베딩, 요약, 생성) | O | O (Dev/Preview/Prod) | |
| `EMBEDDING_MODEL` | 임베딩 모델명 (기본: gemini-embedding-2-preview) | O | O (Dev/Preview) | Production 미등록 — Vercel Prod에 추가 필요 |
| `EMBEDDING_DIMENSIONS` | 임베딩 차원수 (기본: 3072) | O | O (Dev/Preview) | Production 미등록 — 동일 |
| `ANTHROPIC_API_KEY` | Claude API (RAG 답변, 분류, 스타일) | O | O (Dev/Preview/Prod) | |
| `AI_PROXY_URL` | Anthropic 프록시 URL | O | O (Dev/Preview/Prod) | |
| `AI_PROXY_KEY` | Anthropic 프록시 인증키 | O | O (Dev/Preview/Prod) | |
| **Meta (Facebook)** | | | | |
| `META_ACCESS_TOKEN` | Meta 광고 API 접근 토큰 | O | O (Prod) | Preview/Development 미등록 |
| `META_APP_ID` | Meta 앱 ID | O | O (Prod) | 코드에서 직접 참조 없음 — 향후 확장용 |
| `META_APP_SECRET` | Meta 앱 시크릿 | O | O (Prod) | 코드에서 직접 참조 없음 — 향후 확장용 |
| `META_AD_LIBRARY_TOKEN` | Meta 광고 라이브러리 API 토큰 | O | O (Prod) | 코드에서 직접 참조 없음 — competitor/meta-ad-library.ts는 SEARCH_API_KEY 사용 |
| **크롤링 서버 (Railway)** | | | | |
| `RAILWAY_CRAWLER_URL` | Railway Playwright 크롤러 URL | O | O (Prod/Preview) | 코드 수정 완료 (9dc3ac3) — railway-crawler.ts + trigger-lp-crawl.mjs |
| `RAILWAY_API_SECRET` | Railway 크롤러 인증 시크릿 | O | O (Prod/Preview) | 코드 수정 완료 (9dc3ac3) — 키 이름 통일됨 |
| `CREATIVE_PIPELINE_URL` | Creative Pipeline 서버 URL | O | O (Prod) | Preview/Dev 미등록 |
| `CREATIVE_PIPELINE_SECRET` | Creative Pipeline 인증 시크릿 | O | O (Prod) | Preview/Dev 미등록 |
| **크론 / 인증** | | | | |
| `CRON_SECRET` | 크론 엔드포인트 Bearer 인증 | O | O (Prod) | Preview/Development 미등록 |
| `ENCRYPTION_KEY` | 데이터 암호화 키 (crypto.ts) | O | O (Dev/Preview/Prod) | |
| **이메일 (SMTP)** | | | | |
| `SMTP_USER` | SMTP 발신 계정 | O | O (Prod) | Preview/Development 미등록 |
| `SMTP_PASS` | SMTP 비밀번호 | O | O (Prod) | Preview/Development 미등록 |
| **검색 / 외부 API** | | | | |
| `SEARCH_API_KEY` | SearchAPI.io (Meta 광고 라이브러리 검색) | O | O (Prod/Preview) | Development 미등록 |
| `BRAVE_API_KEY` | Brave Search API | O | O (Dev/Preview/Prod) | |
| `UNSPLASH_ACCESS_KEY` | Unsplash 이미지 검색 | O | O (Dev/Preview/Prod) | |
| **Google Search Console** | | | | |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GSC 서비스 계정 이메일 | X | X | **미등록 — GSC 기능 비활성화 상태** |
| `GOOGLE_PRIVATE_KEY` | GSC 서비스 계정 Private Key | X | X | **미등록 — GSC 기능 비활성화 상태** |
| **Notion** | | | | |
| `NOTION_TOKEN` | Notion API 통합 토큰 | X | X | **미등록 — sync-notion 크론 비활성화 상태** |
| `NOTION_DB_MEMBER` | Notion 회원 DB ID | X | X | 동일 |
| `NOTION_DB_MOLIP` | Notion Molip DB ID | X | X | 동일 |
| `NOTION_DB_TODO1` | Notion TODO1 DB ID | X | X | 동일 |
| `NOTION_DB_TODO2` | Notion TODO2 DB ID | X | X | 동일 |
| **네이버** | | | | |
| `NAVER_AD_CUSTOMER_ID` | 네이버 검색광고 고객 ID | X | X | **미등록 — keyword-analysis 기능 비활성화** |
| `NAVER_AD_ACCESS_LICENSE` | 네이버 검색광고 액세스 라이선스 | X | X | 동일 |
| `NAVER_AD_SECRET_KEY` | 네이버 검색광고 시크릿 키 | X | X | 동일 |
| `NAVER_SEARCHADVISOR_API_KEY` | 네이버 서치어드바이저 API | X | X | **미등록 — organic 분석 기능 비활성화** |
| **메시지 / 알림** | | | | |
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | O | O (Dev/Preview/Prod) | |
| `SOLAPI_API_KEY` | 솔라피 카카오/SMS API | O | O (Prod) | Preview/Development 미등록 |
| `SOLAPI_API_SECRET` | 솔라피 시크릿 | O | O (Prod) | 동일 |
| **Mixpanel** | | | | |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 프로젝트 토큰 | O | O (Dev/Preview/Prod) | |
| **URL 설정** | | | | |
| `NEXT_PUBLIC_SITE_URL` | 사이트 기본 URL (이메일 추적 등) | O | O (Dev/Preview/Prod) | |
| `NEXT_PUBLIC_BASE_URL` | 사이트 기본 URL (이메일 발신 등) | X | X | 코드에서 VERCEL_URL 폴백 있음. 미등록이나 동작은 함 |
| `VERCEL_URL` | Vercel 자동 주입 URL | — | — | Vercel 플랫폼 자동 제공 (등록 불필요) |
| **YouTube 자막** | | | | |
| `TRANSCRIPT_API_KEY` | TranscriptAPI.com 자막 API | X | X | **미등록 — YouTube 자막 수집 비활성화** |
| **기타 (자동/시스템)** | | | | |
| `NODE_ENV` | Node 환경 (development/production) | — | — | 시스템 자동 제공 |
| `DRY_RUN` | 스크립트 드라이런 플래그 | — | — | CLI 직접 전달 (`DRY_RUN=1 node script.mjs`) |
| `VERCEL_OIDC_TOKEN` | Vercel OIDC 토큰 | O | — | Vercel 플랫폼 자동 주입 — .env.local 등록은 로컬 테스트용 |

---

## 2. 스캔 대상 디렉토리

| 디렉토리 | 스캔 결과 |
|----------|-----------|
| `src/` | 40개 변수 참조 (위 표 기준) |
| `scripts/` | 7개 변수 참조 (SUPABASE_*, GEMINI_API_KEY, EMBEDDING_MODEL, META_ACCESS_TOKEN, NOTION_TOKEN, CRAWLER_*) |
| `services/` | 4개 변수 참조 (GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_SECRET) |
| `supabase/functions/` | 없음 (Edge Functions 미사용) |

---

## 3. 누락 / 불일치 목록

### 3-A. 코드에서 쓰는데 .env.local에 없는 것

| 변수명 | 심각도 | 영향 기능 |
|--------|--------|-----------|
| ~~`CRAWLER_URL`~~ | ~~중간~~ | ~~수정 완료 (9dc3ac3) — `RAILWAY_CRAWLER_URL`로 통일~~ |
| ~~`CRAWLER_SECRET`~~ | ~~높음~~ | ~~수정 완료 (9dc3ac3) — `RAILWAY_API_SECRET`으로 통일~~ |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 낮음 | GSC(구글 서치 콘솔) — 현재 비활성 기능 |
| `GOOGLE_PRIVATE_KEY` | 낮음 | GSC — 현재 비활성 기능 |
| `NOTION_TOKEN` | 낮음 | Notion 동기화 크론 — 미사용 시 크론 자체 비활성 |
| `NOTION_DB_MEMBER` | 낮음 | 동일 |
| `NOTION_DB_MOLIP` | 낮음 | 동일 |
| `NOTION_DB_TODO1` | 낮음 | 동일 |
| `NOTION_DB_TODO2` | 낮음 | 동일 |
| `NAVER_AD_CUSTOMER_ID` | 낮음 | 네이버 키워드 분석 — 미설정 시 graceful fallback |
| `NAVER_AD_ACCESS_LICENSE` | 낮음 | 동일 |
| `NAVER_AD_SECRET_KEY` | 낮음 | 동일 |
| `NAVER_SEARCHADVISOR_API_KEY` | 낮음 | 네이버 서치어드바이저 — 미설정 시 fallback |
| `TRANSCRIPT_API_KEY` | 낮음 | YouTube 자막 수집 — 미설정 시 자막 스킵 |
| `NEXT_PUBLIC_BASE_URL` | 낮음 | 이메일 발신 URL — VERCEL_URL 폴백 동작 |

### 3-B. .env.local에 있는데 코드에서 직접 참조 안 하는 것

| 변수명 | 상태 | 비고 |
|--------|------|------|
| `META_APP_ID` | 미사용 | Vercel Prod에만 등록. 향후 Meta Webhooks 검증용으로 보임 |
| `META_APP_SECRET` | 미사용 | 동일 |
| `META_AD_LIBRARY_TOKEN` | 미사용 | Vercel Prod에만 등록. `competitor/meta-ad-library.ts`는 SEARCH_API_KEY 사용 |
| ~~`RAILWAY_CRAWLER_URL`~~ | ~~미사용~~ | ~~수정 완료 — 코드가 `RAILWAY_CRAWLER_URL` 참조로 변경됨~~ |
| ~~`RAILWAY_API_SECRET`~~ | ~~미사용~~ | ~~수정 완료 — 코드가 `RAILWAY_API_SECRET` 참조로 변경됨~~ |
| `VERCEL_OIDC_TOKEN` | 자동 주입 | Vercel 플랫폼이 자동 주입. 로컬 테스트용 .env.local 등록 |

### 3-C. Vercel 환경별 등록 누락 (기능 이상 가능)

| 변수명 | Production | Preview | Development | 문제 |
|--------|:----------:|:-------:|:-----------:|------|
| `EMBEDDING_MODEL` | X | O | O | Prod 배포 시 기본값 사용 — 현재는 기본값(`gemini-embedding-2-preview`)이므로 동작은 함 |
| `EMBEDDING_DIMENSIONS` | X | O | O | Prod 배포 시 기본값(3072) 사용 — 동작은 함 |
| `CRON_SECRET` | O | X | X | Preview에서 크론 API 테스트 불가 |
| `META_ACCESS_TOKEN` | O | X | X | Preview에서 Meta 수집 테스트 불가 |
| `SMTP_USER` / `SMTP_PASS` | O | X | X | Preview 이메일 발송 불가 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` | O | X | X | Preview 카카오 알림 불가 |
| `SEARCH_API_KEY` | O | O | X | Development에서 광고 라이브러리 검색 불가 |
| `SUPABASE_SERVICE_ROLE_KEY` | O | O | X | Development 서버사이드 DB 직접 접근 불가 |
| `CREATIVE_PIPELINE_URL` / `CREATIVE_PIPELINE_SECRET` | O | X | X | Preview/Dev creative pipeline 연동 불가 |

---

## 4. 조치 필요 사항

### 즉시 조치 (높음) — 완료

1. ~~**`CRAWLER_SECRET` 등록**~~ → 수정 완료 (커밋 9dc3ac3)
2. ~~**`CRAWLER_URL` / `CRAWLER_SECRET` 키 이름 통일**~~ → 방법 A 적용: 코드를 `RAILWAY_CRAWLER_URL` / `RAILWAY_API_SECRET`으로 변경 (railway-crawler.ts, trigger-lp-crawl.mjs)

### 필요 시 등록 (낮음 — 기능 활성화 시)

3. **Google Search Console 기능 활성화 시**:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` — Vercel Prod 등록 필요

4. **Notion 동기화 크론 활성화 시**:
   - `NOTION_TOKEN`, `NOTION_DB_MEMBER`, `NOTION_DB_MOLIP`, `NOTION_DB_TODO1`, `NOTION_DB_TODO2` — Vercel Prod 등록 필요

5. **네이버 키워드 분석 기능 활성화 시**:
   - `NAVER_AD_CUSTOMER_ID`, `NAVER_AD_ACCESS_LICENSE`, `NAVER_AD_SECRET_KEY`
   - `NAVER_SEARCHADVISOR_API_KEY`

6. **YouTube 자막 수집 활성화 시**:
   - `TRANSCRIPT_API_KEY` (TranscriptAPI.com)

### 정리 권고

7. **미사용 변수 정리**: `META_APP_ID`, `META_APP_SECRET`, `META_AD_LIBRARY_TOKEN`이 코드에서 참조되지 않음. 향후 사용 계획이 없으면 Vercel에서 삭제 검토.

8. **`NEXT_PUBLIC_BASE_URL` 등록**: 이메일 발신 URL 명시적 설정. 현재 폴백(`VERCEL_URL`)으로 동작하나 Production에서 올바른 URL 보장을 위해 등록 권장.

9. **`EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` Vercel Prod 등록**: 현재 기본값과 일치하여 동작하지만 명시적 등록으로 일관성 확보.

---

## 5. 기능별 환경변수 정리

| 기능 | 필요 변수 | 상태 |
|------|-----------|------|
| **Supabase 연결** | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | 정상 |
| **Gemini AI (임베딩/생성)** | GEMINI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS | 정상 (Prod 기본값 동작) |
| **Claude AI (RAG/분류)** | ANTHROPIC_API_KEY, AI_PROXY_URL, AI_PROXY_KEY | 정상 |
| **Meta 광고 수집** | META_ACCESS_TOKEN | Prod 정상 / Preview 불가 |
| **경쟁사 광고 분석** | SEARCH_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY | Prod/Preview 정상 |
| **LP 크롤링 (Railway)** | RAILWAY_CRAWLER_URL, RAILWAY_API_SECRET | 정상 (9dc3ac3 수정) |
| **Creative Pipeline** | CREATIVE_PIPELINE_URL, CREATIVE_PIPELINE_SECRET | Prod 정상 / Preview 불가 |
| **이메일 발송 (SMTP)** | SMTP_USER, SMTP_PASS, NEXT_PUBLIC_SITE_URL | Prod 정상 / Preview 불가 |
| **카카오/SMS 알림** | SOLAPI_API_KEY, SOLAPI_API_SECRET | Prod 정상 / Preview 불가 |
| **Slack 알림** | SLACK_BOT_TOKEN | 전 환경 정상 |
| **Mixpanel 분석** | NEXT_PUBLIC_MIXPANEL_TOKEN | 전 환경 정상 |
| **Unsplash 이미지** | UNSPLASH_ACCESS_KEY | 전 환경 정상 |
| **데이터 암호화** | ENCRYPTION_KEY | 전 환경 정상 |
| **크론 인증** | CRON_SECRET | Prod 정상 / Preview 불가 |
| **Notion 동기화** | NOTION_TOKEN, NOTION_DB_* | **미등록 — 비활성** |
| **Google GSC** | GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY | **미등록 — 비활성** |
| **네이버 키워드 분석** | NAVER_AD_*, NAVER_SEARCHADVISOR_API_KEY | **미등록 — 비활성** |
| **YouTube 자막** | TRANSCRIPT_API_KEY | **미등록 — 자막 스킵** |
| **Brave 검색** | BRAVE_API_KEY | 전 환경 정상 |

---

## 6. 스캔 방법

```bash
# 코드에서 참조하는 변수 전체 추출
grep -rh "process\.env\.[A-Z_]*" src/ scripts/ services/ --only-matching \
  | sed "s/process\.env\.\([A-Z_0-9]*\).*/\1/" | sort -u

# .env.local 키 목록
grep -v '^#' .env.local | grep '=' | cut -d'=' -f1 | sort

# Vercel 등록 목록
vercel env ls
```
