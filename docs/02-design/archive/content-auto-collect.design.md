# 콘텐츠 자동 수집 크론 API 설계서

> 작성: 2026-03-16

---

## 1. 데이터 모델

### content_sources 테이블 (기존 — 제약조건 수정 필요)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| name | TEXT | 소스명 |
| url | TEXT | RSS/채널 URL (UNIQUE) |
| feed_type | TEXT | 'rss', 'html', 'api', **'youtube'** (추가) |
| is_active | BOOLEAN | 활성 여부 |
| last_crawled_at | TIMESTAMPTZ | 마지막 수집 시각 |
| crawl_frequency | TEXT | 'daily' / 'weekly' |
| config | JSONB | 추가 설정 (channelId, handle 등) |

### contents 테이블 INSERT 스펙
| 필드 | 블로그 크롤링 값 | 유튜브 값 |
|------|-----------------|----------|
| title | 글 제목 | "YouTube: {채널명} - {영상제목}" |
| body_md | 마크다운 본문 | 자막 전문 또는 description |
| type | "info_share" | "info_share" |
| source_type | "crawl" | "youtube" |
| source_ref | 원본 URL | "youtube:{videoId}" |
| status | "draft" | "draft" |
| curation_status | "new" | "new" |

## 2. API 설계

### GET /api/cron/collect-content
- **인증**: Bearer CRON_SECRET
- **스케줄**: `0 20 * * *` (UTC 20:00)
- **maxDuration**: 300초
- **처리 흐름**:
  1. verifyCron → content_sources에서 feed_type IN ('rss','html') & is_active=true 조회
  2. 소스별 RSS 파싱 (cheerio) → 최신 글 5개
  3. source_ref(URL) 중복 체크
  4. 새 글: fetchAndParse(url) → cheerio+turndown → markdown
  5. contents INSERT
  6. after()로 embedContentToChunks() 호출
  7. last_crawled_at 갱신
  8. startCronRun/completeCronRun 로깅

### GET /api/cron/collect-youtube
- **인증**: Bearer CRON_SECRET
- **스케줄**: `0 21 * * *` (UTC 21:00)
- **maxDuration**: 300초
- **처리 흐름**:
  1. verifyCron → content_sources에서 feed_type='youtube' & is_active=true 조회
  2. 채널별 YouTube RSS 피드 파싱 → 최신 영상 3개
  3. source_ref(`youtube:{videoId}`) 중복 체크
  4. 새 영상: TranscriptAPI.com으로 자막 가져오기
  5. 자막 없으면 title + description만 저장
  6. contents INSERT
  7. after()로 embedContentToChunks() 호출
  8. last_crawled_at 갱신

## 3. 컴포넌트 구조

### 신규 파일
| 파일 | 역할 |
|------|------|
| `src/app/api/cron/collect-content/route.ts` | 블로그/뉴스 크롤링 크론 |
| `src/app/api/cron/collect-youtube/route.ts` | 유튜브 자막 수집 크론 |
| `src/lib/content-crawler.ts` | 크롤링 공용 로직 (crawlUrl 확장) |
| `supabase/migrations/20260316_content_sources_seed.sql` | 초기 데이터 |

### 수정 파일
| 파일 | 변경 |
|------|------|
| `vercel.json` | 크론 2개 추가 |

## 4. 에러 처리
- 소스별 격리: 한 소스 실패해도 다른 소스 계속 처리
- RSS 파싱 실패 → HTML fallback (feed_type='html'인 경우)
- TranscriptAPI 실패 → description fallback
- 네트워크 타임아웃: 15초 per request
- 결과 로깅: startCronRun/completeCronRun

## 5. 구현 순서
1. [x] content_sources migration SQL (feed_type 제약조건 수정 + 12개 초기 데이터)
2. [x] src/lib/content-crawler.ts (공용 크롤링 로직)
3. [x] /api/cron/collect-content/route.ts
4. [x] /api/cron/collect-youtube/route.ts
5. [x] vercel.json 업데이트
6. [x] tsc + lint + build 검증
