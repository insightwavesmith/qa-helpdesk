# 오가닉 채널 Phase 2 — API 연동 조사 종합

> 조사일: 2026-03-25
> 조사 방법: 4개 병렬 에이전트 (네이버 블로그, 네이버 카페, YouTube, Instagram)

---

## 🚨 설계서 수정 필요: 네이버 블로그 API 폐지

**기존 설계서의 `POST https://openapi.naver.com/blog/writePost.json` 엔드포인트가 현재 404 응답을 반환합니다.**
네이버 개발자 센터 공식 API 목록에 블로그 글쓰기 API가 등재되어 있지 않습니다.

### 대안 3가지

| 대안 | 장점 | 단점 | 권장 |
|------|------|------|------|
| **크롬 확장 DOM 조작** | 기존 `editor-detector.ts` 패턴 확장 가능 | 서버사이드 자동화 불가, 사용자 브라우저 필요 | ⭐ Phase 2 |
| **Puppeteer 서버 자동화** | 완전 자동화 가능 | 네이버 봇 탐지 차단 위험, 캡챠 발생 | Phase 3+ 검토 |
| **카페만 API + 블로그 수동** | 안정적 | 블로그 자동화 포기 | 최소 MVP |

**결론**: Phase 2에서는 **크롬 확장 반자동 방식** 채택. AI 변환 본문을 클립보드에 복사 → 크롬 확장이 블로그 에디터에 삽입하는 흐름.

---

## 채널별 API 조사 요약

### 1. 네이버 블로그

| 항목 | 상태 |
|------|------|
| 글쓰기 API | ❌ **폐지/미제공** (writePost.json 404) |
| 통계 API | ❌ 미제공 (서치어드바이저 사이트 단위만) |
| 글 수정/삭제 API | ❌ 미제공 |
| OAuth | ✅ 네이버 로그인 OAuth 2.0 사용 가능 |
| 기존 코드 | `naver-blog-scraper.ts` (벤치마크 스크래핑) |
| 대안 | 크롬 확장 `CafePublisher.ts` 패턴 확장 |

### 2. 네이버 카페

| 항목 | 상태 |
|------|------|
| 글쓰기 API | ✅ `POST /v1/cafe/{clubid}/menu/{menuid}/articles` |
| 응답 | `articleId`, `articleUrl` 반환 |
| HTML 본문 | ✅ 지원 (`<script>`, `<iframe>` 제한) |
| 이미지 첨부 | ✅ multipart 형식, 복수 가능 |
| 통계 API | ❌ 미제공 |
| 글 수정/삭제 API | ❌ 미제공 |
| 공지사항 등록 | ❌ 불가 (일반 글만) |
| OAuth | ✅ 블로그와 동일 앱 사용 가능 (카페 권한 추가) |
| Rate Limit | 일 25,000회 (Client ID 단위) |
| 주의 | clubId/menuId 사전 수동 확인 필요 (조회 API 없음) |
| 공식 문서 | https://developers.naver.com/docs/login/cafe-api/cafe-api.md |

### 3. YouTube Data API v3

| 항목 | 상태 |
|------|------|
| 업로드 API | ✅ `videos.insert` (Resumable Upload) |
| 메타데이터 | 제목 100자, 설명 5,000자, 태그 500자 |
| 예약 발행 | ✅ `status.publishAt` (private → 자동 public 전환) |
| 썸네일 | ✅ `thumbnails.set` (1280×720, 최대 2MB) |
| 자막 | ✅ `captions.insert` (SRT/VTT 지원) |
| Analytics | ✅ YouTube Analytics API v2 (일별 views, watchTime, likes 등) |
| Quota | 기본 10,000 units/day, 업로드 1,600 units → **하루 4~5세트** |
| OAuth | Google OAuth 2.0 (Access 1시간, Refresh 무기한) |
| 앱 검증 | `youtube.upload` scope → **4~6주 소요** |
| **Phase 2 결론** | **API 호출 불필요 — 스크립트+메타데이터만 DB 저장** |
| 공식 문서 | https://developers.google.com/youtube/v3 |

### 4. Instagram Graph API

| 항목 | 상태 |
|------|------|
| 단일 이미지 | ✅ 2단계 (컨테이너 생성 → 발행) |
| 캐러셀 | ✅ 3단계 (아이템 컨테이너 → 캐러셀 컨테이너 → 발행) |
| Reels | ✅ 2단계 (동일 패턴) |
| 이미지 요구사항 | **공개 HTTPS URL 필수** (signed URL 불가) |
| Insights | ✅ reach, impressions, engagement, saves (30일 제한) |
| OAuth | Meta OAuth (Long-lived Token 60일) |
| Rate Limit | 일 25개 게시 + 시간당 200 API 호출 |
| 기존 Meta App | ✅ 재활용 가능 (권한 검수 2~4주) |
| **Phase 2 결론** | **Phase 3 범위 — 카드뉴스 이미지 생성 도구 선행 필요** |
| 공식 문서 | https://developers.facebook.com/docs/instagram-platform |

### 5. 뉴스레터 (기존 파이프라인)

| 항목 | 상태 |
|------|------|
| 발송 시스템 | ✅ 기존 `email_logs` + `email_sends` 파이프라인 |
| 구독자 | ✅ 1,095명 (leads + profiles) |
| 세그먼트 | ❌ 미구현 (Phase 2 신규) |
| 템플릿 | ✅ `email-renderer.ts`, `email-templates.ts` |
| API 연동 | 불필요 (내부 시스템) |

---

## Phase 정리 (조사 기반 수정)

| Phase | 채널 | API 필요 | 선행 조건 | 기간 |
|-------|------|---------|-----------|------|
| **Phase 2** | 카페 API + 뉴스레터 + 블로그(반자동) + Google SEO | 카페 API만 | 네이버 앱 카페 권한 추가 | 4~5월 |
| **Phase 3** | 유튜브 업로드 + 인스타 캐러셀 | YouTube + Instagram API | Google 앱 검증(4~6주), Meta 권한 검수(2~4주) | 6~7월 |
| **Phase 4** | 커뮤니티 + 성과 고도화 | Search Console API | — | 7~8월 |

### ⚠ Phase 2 중 선행 시작 필요

1. **Google Cloud Console 앱 검증 신청** (Phase 3 YouTube 용) — 4~6주 소요
2. **Meta App Instagram 권한 검수** (Phase 3 Instagram 용) — 2~4주 소요
3. 네이버 카페 `clubId`, `menuId` 확인 (웹에서 수동)

---

## OAuth 통합 관리

| 플랫폼 | 인증 방식 | Token 만료 | 갱신 | 저장 |
|--------|----------|-----------|------|------|
| 네이버 (카페) | OAuth 2.0 | Access 1시간 | Refresh Token | channel_credentials (AES-256-GCM) |
| Google (YouTube) | OAuth 2.0 | Access 1시간 | Refresh Token (무기한) | channel_credentials |
| Meta (Instagram) | OAuth 2.0 | Short-lived 1시간 → Long-lived 60일 | Long-lived 교환 | channel_credentials |

**공통**: `channel_credentials` 테이블에서 암호화 관리. 만료 전 자동 갱신 로직 필요.
