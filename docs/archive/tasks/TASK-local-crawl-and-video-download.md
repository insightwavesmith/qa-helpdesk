# TASK: 로컬 LP 재크롤링 + 영상 mp4 수집 (Mac Studio)

Railway 파이프라인 다운. 로컬에서 바로 돌린다.

## 1. 영상 mp4 다운로드 → Supabase Storage

### 배경
- ad_creative_embeddings에 media_type=VIDEO가 261건
- 현재 storage_url = 썸네일(.jpg)만 있음. mp4 원본 없음
- Meta API advideos에서 source URL 받으면 mp4 다운 가능 (위에서 실측 검증 완료)

### 구현
1. DB에서 VIDEO 소재 목록 조회 (ad_id, account_id)
2. 각 account_id별 `GET /act_{account_id}/advideos?fields=id,source,length`로 video source URL 획득
3. source URL에서 mp4 다운로드 → `/tmp/videos/{ad_id}.mp4`
4. Supabase Storage `creatives/video/{ad_id}.mp4`로 업로드
5. DB storage_url 업데이트 (기존 썸네일 URL → mp4 URL)
6. 썸네일도 별도 보관 (thumbnail_url 컬럼 or 기존 thumb/ 유지)

### 주의
- Meta API Rate Limit: 분당 200콜 이내
- source URL은 일시적 — 받자마자 바로 다운로드
- 큰 영상(100MB+) 있을 수 있음 → 타임아웃 넉넉히
- account_id별로 advideos 조회 → video_id 매칭해서 우리 소재와 연결
- 이미 ad_creative_embeddings에 있는 261건만 대상

### 환경변수
- META_ACCESS_TOKEN: .env.local에 있음
- SUPABASE_SERVICE_ROLE_KEY: .env.local에 있음
- Supabase Storage 버킷: creatives (public)

## 2. LP 재크롤링 (모바일+PC 섹션별)

### 배경
- 기존 LP 크롤링 = Railway Playwright → 현재 다운
- ~35개 고유 LP (정규화 후)
- 모바일(375×812) + PC(1280×800) 듀얼 캡처 필요
- 섹션별 큰 스크린샷: Hero/Detail/Review/CTA + 풀페이지 + 옵션창

### 구현
1. DB에서 고유 LP URL 목록 추출 (ad_creative_embeddings.lp_url DISTINCT)
2. UTM 파라미터 제거 → 리다이렉트 추적 → 정규화
3. HTTP HEAD로 유효성 검증 (200만 진행)
4. Playwright 로컬 실행:
   - 모바일 뷰포트(375×812): 풀페이지 + Hero + Detail + Review + CTA
   - PC 뷰포트(1280×800): 풀페이지 + Hero + Detail + Review + CTA
   - 구매버튼 클릭 → 옵션창 캡처
5. Supabase Storage `creatives/lp/{lp_hash}/mobile_full.png`, `pc_full.png`, `mobile_hero.png` 등
6. DB에 크롤링 결과 기록

### 섹션 감지 로직
- Hero: 첫 화면 (viewport 높이)
- Detail: Hero 아래 ~ 리뷰 시작 전
- Review: 리뷰/후기 영역 (selector: `.review`, `#review`, 후기 등)
- CTA: 구매 버튼 영역 (sticky footer 포함)
- 옵션창: 구매버튼 클릭 후 모달/드로어

### 환경
- 로컬 Playwright (npx playwright install chromium)
- Node.js 스크립트
- 프로젝트: /Users/smith/projects/qa-helpdesk

## 실행 방법
```bash
cd /Users/smith/projects/qa-helpdesk
node scripts/download-videos.mjs    # 영상 261건
node scripts/crawl-lps-local.mjs    # LP ~35개
```

## 산출물
- `scripts/download-videos.mjs` — 영상 다운로드+업로드 스크립트
- `scripts/crawl-lps-local.mjs` — LP 크롤링 스크립트
- 두 스크립트 모두 진행률 표시 + 에러 핸들링 + 재시도 로직
- 빌드 통과 필수
