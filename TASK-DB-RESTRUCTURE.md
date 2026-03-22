# TASK: 데이터 아키텍처 재설계 Phase 1 — DB 구조 변경 + LP 정규화 + 크롤러 수정

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
현재 `ad_creative_embeddings` 테이블 하나에 40컬럼이 몰빵돼 있다.
LP URL이 광고마다 중복 저장되어 1,626개인데 실제 상품 LP는 ~35개.
데스크톱(1280×800)으로만 크롤링해서 모바일 스크린샷 없고, 옵션창 캡처 성공률 4%.

## 설계서 (반드시 읽어라)
- `/Users/smith/.openclaw/workspace/memory/2026-03-20-data-architecture.md` — 전체 설계
- 모찌리포트: `mozzi-reports.vercel.app/reports/plan/2026-03-20-data-architecture-v2`
- AS-IS 분석: `mozzi-reports.vercel.app/reports/architecture/2026-03-20-data-collection-architecture`

## 기대 동작 (고객 관점)
1. 수강생별로 "내 광고 → 내 LP" 관계가 깔끔하게 연결됨
2. LP가 중복 없이 정리됨 (35개 상품 페이지)
3. 모바일 + PC 둘 다 스크린샷이 있음
4. 구매버튼 클릭 후 옵션창 스크린샷도 있음
5. 기존 서비스에 영향 없음 (기존 테이블 유지)

## STEP 1: 신규 테이블 생성 (Supabase SQL)

### 1-1. `landing_pages` 테이블
```sql
CREATE TABLE landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  canonical_url text UNIQUE NOT NULL,
  original_urls text[] DEFAULT '{}',
  domain text,
  product_id text,
  product_name text,
  page_type text DEFAULT 'product', -- product / event / article / homepage / external
  platform text, -- cafe24 / smartstore / custom / oliveyoung
  is_active boolean DEFAULT true,
  ad_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lp_account ON landing_pages(account_id);
CREATE INDEX idx_lp_domain ON landing_pages(domain);
CREATE INDEX idx_lp_page_type ON landing_pages(page_type);
```

### 1-2. `lp_snapshots` 테이블
```sql
CREATE TABLE lp_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id uuid REFERENCES landing_pages(id) ON DELETE CASCADE,
  viewport text NOT NULL, -- 'mobile' (375x812) / 'desktop' (1280x800)
  screenshot_url text,
  cta_screenshot_url text,
  screenshot_hash text,
  cta_screenshot_hash text,
  crawled_at timestamptz DEFAULT now(),
  crawler_version text
);
CREATE INDEX idx_lps_lp_id ON lp_snapshots(lp_id);
CREATE UNIQUE INDEX idx_lps_lp_viewport ON lp_snapshots(lp_id, viewport);
```

## STEP 2: LP URL 정규화 스크립트

`scripts/normalize-lps.mjs` 생성:

1. `ad_creative_embeddings`에서 lp_url이 있는 모든 행 조회
2. 정규화 로직:
   - `?` 이후 파라미터 전부 제거 (UTM, fbclid 등)
   - `/utm_source=` 같은 경로에 붙은 파라미터도 제거
   - `surl/P/XX` → HTTP HEAD 요청으로 리다이렉트 추적 → 최종 URL
   - 같은 도메인 + 같은 상품ID(카페24: `/XX/category/` 에서 XX 추출) → 1개로 병합
   - `fb.com`, `facebook.com`, `instagram.com`, `naver.com` → page_type='external'
   - `/article/` 포함 → page_type='article'
   - `www.도메인` = `도메인` 으로 통합 (예: www.radyvoy.com = radyvoy.com)
   - `m.도메인` = `도메인` 으로 통합 (예: m.sevenpm.co.kr = sevenpm.co.kr)
3. 플랫폼 감지: cafe24 (surl, product/detail.html), smartstore (smartstore.naver.com), oliveyoung
4. `landing_pages` 테이블에 INSERT
5. 실행 전 dry-run 모드 (`--dry-run` 플래그) — 실제 INSERT 없이 결과만 출력
6. **반드시 dry-run 먼저 실행해서 결과 확인 후 실제 실행**

## STEP 3: Railway 크롤러 수정

`/Users/smith/projects/bscamp-crawler/server.js` 수정:

1. 뷰포트 옵션 추가: `viewport` 파라미터 ('mobile' | 'desktop')
   - mobile: `{ width: 375, height: 812 }` + 모바일 User-Agent
   - desktop: `{ width: 1280, height: 800 }` (기존)
2. 모바일에서 구매버튼 찾기 개선:
   - 모바일은 하단 고정 구매버튼이 있음 → `position: fixed; bottom: 0` 영역의 버튼 우선 탐색
   - 기존 텍스트 패턴 ('구매하기', '바로구매' 등) + `[class*="buy"], [class*="purchase"], .btn_buy, #btn_buy` 셀렉터 추가
   - 클릭 후 옵션창 대기 시간 2초 → 3초로 증가
3. 배치 API에 viewport 파라미터 전달 지원
4. **섹션별 스크린샷 추가** (풀페이지 1장 + 섹션별 4~5장):
   - section_hero: 상단 Hero + 가격 영역 (첫 화면, viewport 높이만큼)
   - section_detail: 상세 이미지 영역 (스크롤 중간)
   - section_review: 리뷰 섹션
   - section_cta: CTA + 옵션창 (구매버튼 클릭 후)
   - 각 섹션을 viewport 크기로 크게 캡처 → 시각 AI 분석 정확도 향상

## STEP 4: LP 사전 검증 스크립트

`scripts/validate-lp-crawl.mjs` 생성:

크롤링 전에 LP URL을 사전 검증하는 스크립트:
1. `landing_pages` 테이블에서 page_type='product'인 LP 조회
2. 각 URL에 HTTP HEAD 요청 → 응답 코드 확인 (200 OK / 301 리다이렉트 / 404 / timeout)
3. 리다이렉트 체인 추적 → 최종 URL 확인
4. 결과 리포트 출력:
   - ✅ 정상 (200)
   - 🔄 리다이렉트 (301/302) → 최종 URL 표시
   - ❌ 실패 (404/500/timeout)
5. 실패한 URL은 landing_pages에서 is_active=false로 업데이트
6. **크론에서 크롤링 전에 이 스크립트 먼저 실행하는 구조**

## STEP 5: LP 재크롤링 스크립트

`scripts/crawl-all-lps.mjs` 생성:

1. `landing_pages` 테이블에서 page_type='product' AND is_active=true 조회
2. 각 LP에 대해 Railway 크롤러 호출:
   - 모바일 뷰포트 (375×812) → 전체 스크린샷 + 옵션창
   - 데스크톱 뷰포트 (1280×800) → 전체 스크린샷 + 옵션창
3. 스크린샷 → Supabase Storage 업로드 → `lp_snapshots` 테이블에 저장
4. 진행률 로그 출력
5. 실패 시 retry (최대 2회)

## 제약 조건
- 기존 `ad_creative_embeddings` 테이블 절대 삭제하지 마라 (기존 서비스 유지)
- 기존 크론/API 코드 변경하지 마라 (Phase 3에서 별도로 함)
- Railway 크롤러 수정 후 반드시 로컬 테스트 → push → Railway 자동 배포
- dry-run 먼저, 실제 실행은 결과 확인 후

## 검증
- [ ] landing_pages 테이블에 ~35개 상품 LP가 정규화돼 있는지
- [ ] external/article이 올바르게 분류됐는지
- [ ] lp_snapshots에 모바일+PC 스크린샷이 저장됐는지
- [ ] 옵션창 캡처 성공률이 50% 이상인지
- [ ] validate-lp-crawl.mjs가 정상 동작하는지
- [ ] 기존 서비스 (bscamp.vercel.app) 정상 동작 확인
