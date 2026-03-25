# TASK: 오가닉 채널 Phase 2 구현

## 타입
개발

## 배경
- 설계서: `docs/02-design/features/organic-channel-distribution.design.md` (완료)
- API 조사: `docs/research/organic-phase2-api-research.md` (2026-03-25 완료)
- Phase 1 (organic_posts CRUD + 어드민 UI 3탭) 완료 상태
- **설계서 수정 필요**: 네이버 블로그 글쓰기 API 폐지 확인 → 반자동 대안 채택

## 선행 조건 (Smith님 액션)
- [ ] 네이버 개발자센터 앱에 "카페" API 권한 추가
- [ ] 카페 clubId, menuId 확인 (웹에서 수동)
- [ ] Google Cloud Console YouTube API 앱 검증 신청 (Phase 3 대비, 4~6주)
- [ ] Meta App Instagram 권한 검수 신청 (Phase 3 대비, 2~4주)
- [ ] 환경변수 준비: NAVER_BLOG_CLIENT_ID, NAVER_BLOG_CLIENT_SECRET, CHANNEL_CREDENTIAL_KEY

---

## Wave 1: DB + 타입 (선행, 의존성 없음)

### T1: DB 마이그레이션 — organic_posts 컬럼 추가
**이게 뭔지**: organic_posts 테이블에 Phase 2 컬럼 7개 추가
**왜 필요한지**: AI 변환 상태, 원본 연결, 예약 발행 등 Phase 2 기능의 DB 기반
**구현 내용**:
- `original_content_id`, `is_source`, `ai_transform_status`, `scheduled_at`, `word_count`, `image_urls`, `geo_markup`, `hashtags` 추가
- 인덱스: `idx_op_is_source`, `idx_op_scheduled_at`
- **담당**: backend-dev
- **파일**: `supabase/migrations/YYYYMMDD_organic_posts_phase2.sql`
- **dependsOn**: 없음

### T2: DB 마이그레이션 — channel_distributions 테이블 생성
**이게 뭔지**: 채널별 변환·배포 큐 테이블 신규 생성
**왜 필요한지**: 원본 1개 → 5채널 변환 결과를 큐로 관리하고 배포 상태 추적
**구현 내용**:
- 설계서 1-2절 스키마 그대로 구현
- RLS: admin_only 정책
- 트리거: `update_updated_at_column()` 재사용
- 인덱스 4개 (source_post_id, status, scheduled, channel)
- **담당**: backend-dev
- **파일**: `supabase/migrations/YYYYMMDD_channel_distributions.sql`
- **dependsOn**: 없음

### T3: DB 마이그레이션 — channel_credentials 테이블 생성
**이게 뭔지**: 채널 API 인증 토큰 암호화 저장 테이블
**왜 필요한지**: OAuth 토큰을 AES-256-GCM 암호화하여 DB에 안전하게 저장
**구현 내용**:
- 설계서 1-3절 스키마 구현
- RLS: 서비스 롤만 접근 (사용자 정책 미생성)
- **담당**: backend-dev
- **파일**: `supabase/migrations/YYYYMMDD_channel_credentials.sql`
- **dependsOn**: 없음

### T4: DB 마이그레이션 — newsletter_segments 테이블 + 시드
**이게 뭔지**: 구독자 세그먼트 테이블 + 기본 4개 세그먼트 시드
**왜 필요한지**: 뉴스레터 발송 대상을 규칙 기반으로 세분화
**구현 내용**:
- 설계서 1-5절 스키마 + filter_rules jsonb
- 시드: all, students, prospects, alumni
- RLS: admin_only
- **담당**: backend-dev
- **파일**: `supabase/migrations/YYYYMMDD_newsletter_segments.sql`
- **dependsOn**: 없음

### T5: TypeScript 타입 정의
**이게 뭔지**: Phase 2 신규 테이블/API에 대한 타입 정의
**왜 필요한지**: 프론트/백엔드 공통 타입으로 타입 안전성 확보
**구현 내용**:
- `TransformChannel`, `DistributionStatus`, `ChannelDistribution`, `ChannelCredential`, `NewsletterSegment`, `ContentAnalytics` 등
- `TransformRequest`, `TransformResult`, `ChannelPostRequest`, `ChannelPostResult` 인터페이스
- **담당**: backend-dev
- **파일**: `src/types/distribution.ts` (신규)
- **dependsOn**: 없음

---

## Wave 2: 백엔드 핵심 로직 (Wave 1 완료 후)

### T6: AI 변환 엔진
**이게 뭔지**: 원본 콘텐츠를 채널별 포맷으로 AI 변환하는 핵심 엔진
**왜 필요한지**: 1원본 → 5채널 자동 변환이 Phase 2의 핵심 가치
**구현 내용**:
- `transformForBlog()` — 네이버 블로그 (2,000자+, 이모지 소제목, SEO)
- `transformForCafe()` — 카페 (800~1,200자, 구어체, 댓글 유도)
- `transformForNewsletter()` — 뉴스레터 (500~800자, 핵심 요약, CTA)
- `transformForYoutube()` — 유튜브 스크립트 (대화체, 8~15분)
- `transformForInstagram()` — 인스타 카드뉴스 텍스트 (5~8 카드)
- `transformForGoogleSEO()` — 구글 SEO (H1→H2→H3, Schema.org)
- Anthropic API (claude-sonnet-4-5) 사용, 채널별 프롬프트
- **담당**: backend-dev
- **파일**: `src/lib/ai-transform.ts` (신규)
- **dependsOn**: T5

### T7: 채널 API 클라이언트 — 공통 인터페이스 + 네이버 카페
**이게 뭔지**: 채널 배포 API 클라이언트 공통 인터페이스 + 카페 구현
**왜 필요한지**: Phase 2에서 유일하게 API 자동 배포 가능한 채널
**구현 내용**:
- `ChannelApiClient` 인터페이스 (publish, delete, getStats)
- 카페 글쓰기: `POST /v1/cafe/{clubid}/menu/{menuid}/articles`
- OAuth 토큰 복호화 + 만료 시 갱신
- HTML 본문 + multipart 이미지 첨부
- ⚠ 글 수정/삭제 API 미제공 → publish만 구현
- ⚠ 통계 API 미제공 → getStats는 빈 객체 반환
- **담당**: backend-dev
- **파일**: `src/lib/channel-api/types.ts`, `src/lib/channel-api/naver-cafe.ts` (신규)
- **dependsOn**: T3, T5

### T8: 채널 API 클라이언트 — 네이버 블로그 (반자동)
**이게 뭔지**: 블로그 API 폐지 대안 — AI 변환 결과를 클립보드에 복사하는 반자동 흐름
**왜 필요한지**: writePost.json API가 404 → 완전 자동화 불가. 반자동이라도 변환 가치 보존
**구현 내용**:
- `naver-blog.ts`의 `publish()` → "클립보드 복사 + 블로그 에디터 URL 오픈" 방식
- DB status를 'review'로 유지 (자동 'published' 전환 없음)
- Smith님이 블로그 에디터에서 붙여넣기 → 수동 발행 → 어드민에서 external_url 입력 → status를 published로 변경
- 미래 대안: 크롬 확장 `CafePublisher.ts` 패턴 확장 (Phase 3+)
- **담당**: backend-dev
- **파일**: `src/lib/channel-api/naver-blog.ts` (신규)
- **dependsOn**: T5

### T9: 채널 API 클라이언트 — 뉴스레터
**이게 뭔지**: 기존 이메일 파이프라인을 channel-api 인터페이스로 래핑
**왜 필요한지**: 뉴스레터를 5채널 배포 큐에 통합 관리
**구현 내용**:
- 기존 `email_logs` + `email_sends` 파이프라인 래핑
- `getRecipients(segmentName)` → `email_logs` INSERT → `email_sends` 배치
- metadata: `{ segmentName, subject, ctaText, ctaUrl }`
- **담당**: backend-dev
- **파일**: `src/lib/channel-api/newsletter.ts` (신규)
- **dependsOn**: T4, T5

### T10: Server Actions — distribution.ts
**이게 뭔지**: 배포 관리 Server Actions 6개
**왜 필요한지**: 프론트엔드 UI가 호출하는 핵심 백엔드 진입점
**구현 내용**:
- `transformToChannels()` — AI 변환 트리거
- `approveDistribution()` — 첨삭 후 승인
- `scheduleDistribution()` — 예약 발행
- `publishDistribution()` — 즉시 배포
- `getDistributions()` — 배포 큐 조회
- `updateTransformedContent()` — 변환 결과 수동 수정
- **담당**: backend-dev
- **파일**: `src/actions/distribution.ts` (신규)
- **dependsOn**: T6, T7, T8, T9

### T11: Server Actions — recipients.ts 확장 (세그먼트)
**이게 뭔지**: 기존 recipients.ts에 세그먼트 API 4개 추가
**왜 필요한지**: 뉴스레터 발송 대상을 세그먼트별로 관리
**구현 내용**:
- `getNewsletterSegments()` — 세그먼트 목록
- `calculateSegmentMembers()` — 규칙 기반 수신자 계산
- `createNewsletterSegment()` — 세그먼트 생성
- `sendNewsletterToSegment()` — 세그먼트 대상 발송
- **담당**: backend-dev
- **파일**: `src/actions/recipients.ts` (기존 확장)
- **dependsOn**: T4

### T12: OAuth 콜백 라우트
**이게 뭔지**: 네이버 OAuth 토큰 수신 API 라우트
**왜 필요한지**: 카페 API 인증을 위한 OAuth 콜백 처리
**구현 내용**:
- `/api/auth/naver/callback/route.ts` — 네이버 OAuth code → token 교환
- `channel_credentials` 테이블에 AES-256-GCM 암호화 저장
- 토큰 갱신 유틸: `refreshNaverToken()`
- **담당**: backend-dev
- **파일**: `src/app/api/auth/naver/callback/route.ts` (신규)
- **dependsOn**: T3

---

## Wave 3: 프론트엔드 UI (Wave 2 T10 완료 후)

### T13: AI 배포 탭 (DistributionTab)
**이게 뭔지**: `/admin/organic` 4번째 탭 — 원본 선택 + 배포 관리
**왜 필요한지**: 5채널 배포의 메인 워크플로우 UI
**구현 내용**:
- 원본 선택 드롭다운 (발행완료/검토중 글 목록)
- `DistributionPanel` 임베드
- **담당**: frontend-dev
- **파일**: `src/components/organic/distribution-tab.tsx` (신규)
- **dependsOn**: T10

### T14: 배포 패널 (DistributionPanel)
**이게 뭔지**: 원본 1개에 대한 5채널 배포 전체 흐름 UI
**왜 필요한지**: 변환 → 미리보기 → 발행의 핵심 워크플로우
**구현 내용**:
- 2단 레이아웃 (좌: 원본 미리보기 + 변환 버튼, 우: 채널별 상태 트래커)
- "5채널 변환하기" 버튼 → `transformToChannels()` 호출
- 배포 상태 뱃지 7종 (대기중/검토중/승인됨/발행중/발행완료/실패/반려)
- **담당**: frontend-dev
- **파일**: `src/components/organic/distribution-panel.tsx` (신규)
- **dependsOn**: T10

### T15: 미리보기 모달 (PreviewModal)
**이게 뭔지**: AI 변환 5채널 결과 탭별 미리보기 + 수동 수정 + 승인
**왜 필요한지**: Smith님이 변환 결과를 첨삭하고 채널별 발행 승인
**구현 내용**:
- Dialog (max-w-4xl) + Tabs 5개 (채널별)
- 각 탭: 채널명 + 글자수, Textarea 수정 가능, "이 채널 배포 승인" 체크박스
- 푸터: "선택 채널 배포하기" 버튼
- **담당**: frontend-dev
- **파일**: `src/components/organic/preview-modal.tsx` (신규)
- **dependsOn**: T10

### T16: 배포 캘린더 (DistributionCalendar)
**이게 뭔지**: 주간 배포 스케줄 시각화 (채널 × 요일 그리드)
**왜 필요한지**: 채널별 배포 예약 현황을 한눈에 파악
**구현 내용**:
- 설계서 3-2절 캘린더 레이아웃 그대로
- 주간 네비게이션 (이전/다음 주)
- ● 발행완료 / ◐ 예약됨 / ○ 대기중 / ✕ 실패
- 셀 클릭 → `/admin/organic/[id]` 이동
- **담당**: frontend-dev
- **파일**: `src/components/organic/distribution-calendar.tsx` (신규)
- **dependsOn**: T10

### T17: 에디터 사이드바 패널 2개
**이게 뭔지**: `/admin/organic/[id]` 에디터에 AI 변환 + 배포 상태 패널 추가
**왜 필요한지**: 개별 글 편집 화면에서 바로 변환/배포 가능
**구현 내용**:
- `AITransformPanel` — "5채널 변환하기" 버튼 → PreviewModal
- `DistributionStatusPanel` — 채널별 배포 기록 (채널명 + 상태뱃지 + 발행일)
- **담당**: frontend-dev
- **파일**: `src/components/organic/ai-transform-panel.tsx`, `src/components/organic/distribution-status-panel.tsx` (신규)
- **dependsOn**: T10

### T18: 기존 페이지 수정 — 5탭 확장
**이게 뭔지**: `/admin/organic/page.tsx` 3탭 → 5탭 확장 + 에디터 사이드바 추가
**왜 필요한지**: 신규 컴포넌트를 기존 페이지에 통합
**구현 내용**:
- `page.tsx`: TabsTrigger 2개 추가 (AI 배포, 캘린더)
- `[id]/page.tsx`: 사이드바에 AITransformPanel + DistributionStatusPanel 추가
- **담당**: frontend-dev
- **파일**: `src/app/(main)/admin/organic/page.tsx` (수정), `src/app/(main)/admin/organic/[id]/page.tsx` (수정)
- **dependsOn**: T13, T14, T15, T16, T17

---

## Wave 4: 검증 + 마무리

### T19: 설계서 수정 — 블로그 API 대안 반영
**이게 뭔지**: 네이버 블로그 API 폐지에 따른 설계서 업데이트
**왜 필요한지**: 설계서와 실제 구현의 불일치 방지
**구현 내용**:
- 2-3절 네이버 블로그 섹션: writePost.json → 반자동(클립보드 복사) 방식으로 수정
- 에러 처리 4-1절: `NAVER_AUTH_EXPIRED` → 블로그는 해당 없음으로 수정
- 배포 흐름도 업데이트
- **담당**: leader
- **파일**: `docs/02-design/features/organic-channel-distribution.design.md` (수정)
- **dependsOn**: 없음 (즉시 가능)

### T20: Gap 분석 + QA
**이게 뭔지**: 설계서 vs 구현 비교 + 빌드 검증
**왜 필요한지**: Match Rate 90%+ 확인 → 완료 처리
**구현 내용**:
- gap-detector 에이전트로 설계서 vs 코드 비교
- tsc + lint + build 통과 확인
- 기존 기능 깨짐 없는지 확인
- **담당**: qa-engineer
- **파일**: `docs/03-analysis/organic-channel-distribution-phase2.analysis.md` (신규)
- **dependsOn**: T18

---

## 의존성 그래프

```
Wave 1 (병렬):
  T1 ─────────────────────────────┐
  T2 ─────────────────────────────┤
  T3 ─────────────────────────────┤
  T4 ─────────────────────────────┤
  T5 ─────────────────────────────┘
                                  │
Wave 2 (T1~T5 완료 후, 일부 병렬):
  T6 (ai-transform) ─────────────┐
  T7 (카페 client) ──────────────┤
  T8 (블로그 반자동) ─────────────┤
  T9 (뉴스레터 client) ──────────┤
  T11 (세그먼트 API) ─────────────┤ (T4만 의존, 병렬 가능)
  T12 (OAuth 콜백) ──────────────┤ (T3만 의존, 병렬 가능)
                                  │
  T10 (distribution actions) ────┘ (T6~T9 완료 필요)

Wave 3 (T10 완료 후, 병렬):
  T13 (배포 탭) ──────────────────┐
  T14 (배포 패널) ────────────────┤
  T15 (미리보기 모달) ──────────────┤
  T16 (캘린더) ──────────────────┤
  T17 (사이드바 패널) ──────────────┤
                                  │
  T18 (페이지 통합) ──────────────┘ (T13~T17 완료 필요)

Wave 4:
  T19 (설계서 수정) — 즉시 가능
  T20 (QA) — T18 완료 후
```

---

## 크론 설계

### Phase 2 크론 (신규 1개)

| 크론 | 스케줄 | 용도 | 엔드포인트 |
|------|--------|------|-----------|
| **publish-scheduled** | `*/15 * * * *` (15분마다) | 예약 시간 도달한 배포 건 자동 발행 | `/api/cron/publish-scheduled/route.ts` |

**publish-scheduled 로직:**
```
1. channel_distributions에서 status='approved' AND scheduled_at <= now() 조회
2. 채널별 API 클라이언트로 발행
3. 성공 시 status='published', published_at=now(), external_id/url 업데이트
4. 실패 시 status='failed', error_message 기록, retry_count++
5. retry_count < 3이면 status='approved'로 복원 (다음 사이클에서 재시도)
```

### Phase 3 크론 (미래)

| 크론 | 스케줄 | 용도 |
|------|--------|------|
| collect-organic-analytics | `0 3 * * *` (매일 03:00 UTC) | 채널별 성과 수집 → content_analytics |
| refresh-channel-tokens | `0 0 * * *` (매일 자정) | 만료 임박 토큰 사전 갱신 |

---

## 콘텐츠 → 배포 파이프라인 상세

### 전체 흐름

```
① 원본 작성 (Smith님, 주 1회)
   └─ /admin/organic/[id] 에디터에서 마크다운 원본 작성
   └─ status: 'draft' → 'published', is_source: true

② AI 5채널 변환 (자동)
   └─ "5채널 변환하기" 버튼 클릭 (AITransformPanel 또는 DistributionTab)
   └─ transformToChannels() Server Action 호출
   └─ Anthropic API (claude-sonnet-4-5) 채널별 프롬프트 호출
   └─ channel_distributions에 5건 UPSERT (status: 'pending')

③ 첨삭 + 승인 (Smith님)
   └─ PreviewModal에서 채널별 미리보기
   └─ 텍스트 수정 가능 (updateTransformedContent)
   └─ 채널별 "승인" 체크 → approveDistribution()
   └─ status: 'pending' → 'approved'
   └─ (블로그만 특별: "클립보드 복사" 버튼 → 수동 발행)

④ 배포 (자동/반자동)
   ┌─ 즉시 배포: "배포하기" 버튼 → publishDistribution()
   └─ 예약 배포: scheduleDistribution(scheduledAt) → 크론이 자동 발행

⑤ 채널별 배포 실행
   ├─ 카페: POST /v1/cafe/{clubid}/menu/{menuid}/articles (자동)
   ├─ 뉴스레터: email_logs → email_sends 파이프라인 (자동)
   ├─ 블로그: 클립보드 복사 → Smith님 수동 붙여넣기 (반자동)
   ├─ 유튜브: 스크립트+메타데이터만 DB 저장 (Phase 3에서 자동 업로드)
   └─ 인스타: 카드뉴스 텍스트만 DB 저장 (Phase 3에서 자동 게시)

⑥ 상태 추적
   └─ channel_distributions.status 업데이트
   └─ DistributionStatusPanel에서 실시간 확인
   └─ DistributionCalendar에서 주간 스케줄 시각화
```

### 채널별 배포 시차 (권장)

```
D+0 (원본 발행일)
  └─ 블로그: 원본 기반 SEO 최적화 글 (2,000자+)
  └─ Google SEO: Schema.org markup 포함 버전

D+1
  └─ 뉴스레터: 핵심 요약 (500~800자) + CTA 버튼
  └─ 인스타: 카드뉴스 텍스트 (5~8 카드)

D+1~2
  └─ 카페: 구어체 질문형 (800~1,200자)

D+3~4
  └─ 유튜브: 스크립트 (8~15분 분량)
```

### AI 변환 프롬프트 구조 (채널별)

| 채널 | 톤 | 길이 | 형태 | CTA | 핵심 규칙 |
|------|-----|------|------|-----|----------|
| 블로그 | 친근+전문 | 2,000자+ | HTML, 이모지 소제목 | bscamp 링크 | 키워드 자연 삽입 3~5회 |
| 카페 | 구어체 | 800~1,200자 | 텍스트 | 댓글 유도 | "여러분은 어떠세요?" 마무리 |
| 뉴스레터 | 핵심 요약 | 500~800자 | 이메일 HTML | 클릭 버튼 | 첫 문장에 핵심 가치 |
| 유튜브 | 대화체 | 8~15분 | 스크립트+자막 | 설명란 링크 | 오프닝 후크 15초 |
| 인스타 | 핵심 문장 | 5~8 카드 | 이미지+텍스트 | 프로필 링크 | 카드당 1핵심 |

---

## 파일 경계 (팀원별)

### backend-dev
```
supabase/migrations/ (T1~T4)
src/types/distribution.ts (T5)
src/lib/ai-transform.ts (T6)
src/lib/channel-api/ (T7~T9)
src/actions/distribution.ts (T10)
src/actions/recipients.ts (T11, 기존 확장)
src/app/api/auth/naver/ (T12)
src/app/api/cron/publish-scheduled/ (크론)
```

### frontend-dev
```
src/components/organic/distribution-tab.tsx (T13)
src/components/organic/distribution-panel.tsx (T14)
src/components/organic/preview-modal.tsx (T15)
src/components/organic/distribution-calendar.tsx (T16)
src/components/organic/ai-transform-panel.tsx (T17)
src/components/organic/distribution-status-panel.tsx (T17)
src/app/(main)/admin/organic/page.tsx (T18, 수정)
src/app/(main)/admin/organic/[id]/page.tsx (T18, 수정)
```

### qa-engineer
```
docs/03-analysis/organic-channel-distribution-phase2.analysis.md (T20)
```

---

## 완료 후 QA
1. `/pdca analyze organic-channel-distribution-phase2` 실행
2. tsc + lint + build 통과
3. localhost:3000 브라우저 QA
   - /admin/organic 5탭 전환 정상
   - AI 변환 → 미리보기 모달 → 수정 → 승인 흐름
   - 캘린더 주간 네비게이션
   - 에디터 사이드바 패널 2개 표시

## 관련 파일
- 설계서: docs/02-design/features/organic-channel-distribution.design.md
- API 조사: docs/research/organic-phase2-api-research.md
- Phase 1 타입: src/types/organic.ts
- Phase 1 액션: src/actions/organic.ts
- Phase 1 컴포넌트: src/components/organic/
