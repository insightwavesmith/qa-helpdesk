# TASK: 경쟁사 분석기 (총가치각도기 > 경쟁사 분석 탭)

> 목업: https://mozzi-reports.vercel.app/reports/mockup/2026-03-06-competitor-analyzer-v2.html

---

## T1. 경쟁사 광고 검색 — Meta Ad Library API 연동

### 이게 뭔지
수강생이 브랜드명/키워드를 입력하면 Meta Ad Library 공식 API에서 해당 브랜드의 광고를 검색해서 보여주는 기능.
총가치각도기 탭 안에 "경쟁사 분석" 서브탭으로 들어간다.

### 왜 필요한지
수강생이 경쟁사 광고를 분석하려면 지금은 Meta Ad Library 웹사이트에 직접 가서 일일이 찾아봐야 한다. 
우리 서비스 안에서 검색 → 카드뷰로 바로 보여주면, 특히 **운영기간이 긴 광고 = 수익성 높은 광고**라는 핵심 인사이트를 즉시 파악할 수 있다.

### 구현 내용
- **API 엔드포인트**: `/api/competitor/search` — `search_terms`, `ad_reached_countries=['KR']` 파라미터
- **Meta Ad Library API 호출**: `GET https://graph.facebook.com/v19.0/ads_archive`
  - 토큰: `.env.local`의 `META_AD_LIBRARY_TOKEN` (기존 `META_ACCESS_TOKEN`과 별도)
  - 필드: `id, page_id, page_name, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_captions, ad_delivery_start_time, ad_delivery_stop_time, publisher_platforms, ad_snapshot_url`
  - Rate limit: 200 calls/hour
- **응답 가공**: 운영기간(일수) 계산, 30일+ 필터, 운영기간순 정렬
- **UI**: 목업 참고 — 검색바 + 필터칩(한국/30일+/게재중/FB/IG/영상/이미지) + 광고 카드 리스트
- **카드 표시 항목**: 광고 문구, 운영기간 바, 플랫폼 아이콘, CTA, 소재 썸네일(`ad_snapshot_url` iframe), 랜딩페이지 링크, 소재 다운로드
- **파일**:
  - `src/app/api/competitor/search/route.ts` (신규)
  - `src/app/(main)/protractor/competitor/page.tsx` (신규)
  - `src/app/(main)/protractor/competitor/components/` (신규)
  - 총가치각도기 탭 네비게이션에 "경쟁사 분석" 추가

⚠️ **주의**: Meta Ad Library API는 engagement(좋아요/댓글/공유) 데이터를 제공하지 않음. 운영기간이 유일한 수익성 시그널.

---

## T2. 브랜드 모니터링 — 등록 + 신규 광고 알림

### 이게 뭔지
수강생이 관심 있는 경쟁 브랜드를 등록해두면, 해당 브랜드에 새 광고가 올라올 때 알림을 받는 기능.

### 왜 필요한지
경쟁사 광고를 매번 수동으로 검색하는 건 비현실적이다. 등록만 해두면 자동으로 새 광고를 감지해서 알려주니까, 경쟁사 동향을 놓치지 않고 추적할 수 있다.

### 구현 내용
- **DB 테이블**: `competitor_monitors` (신규)
  - `id`, `user_id`, `brand_name`, `page_id`, `last_checked_at`, `last_ad_count`, `created_at`
- **DB 테이블**: `competitor_alerts` (신규)
  - `id`, `monitor_id`, `new_ad_ids` (jsonb), `detected_at`, `is_read`
- **API**: 
  - `POST /api/competitor/monitors` — 브랜드 등록
  - `GET /api/competitor/monitors` — 내 모니터링 목록
  - `DELETE /api/competitor/monitors/:id` — 삭제
- **Cron**: `/api/cron/competitor-check` — 매일 1~2회 실행
  - 등록된 브랜드별 Ad Library API 호출
  - 이전 체크 대비 새 광고 감지 → `competitor_alerts`에 저장
- **UI**: 목업 참고 — 모니터링 패널 (브랜드 카드 + 신규 감지 뱃지 + 추가 버튼)
- **파일**:
  - `src/app/api/competitor/monitors/route.ts` (신규)
  - `src/app/api/cron/competitor-check/route.ts` (신규)
  - 모니터링 패널 컴포넌트 (T1에서 만든 페이지에 통합)

---

## T3. AI 인사이트 — 검색 결과 자동 분석

### 이게 뭔지
검색 결과로 받은 광고 데이터를 AI가 분석해서, 해당 브랜드의 광고 패턴/전략을 자동 요약해주는 기능.

### 왜 필요한지
광고 리스트만 보여주면 수강생이 직접 패턴을 파악해야 한다. AI가 "이 브랜드는 할인형 훅이 70%, 영상 비율 67%, 봄에 프로모션 집중" 같은 인사이트를 자동으로 뽑아주면 실행 가능한 학습이 된다.

### 구현 내용
- **API**: `/api/competitor/insights` — 검색 결과 광고 목록을 받아서 AI 분석
- **AI 분석 항목** (Anthropic API 사용, ai-proxy 경유):
  - 30일+ 장기 광고 개수
  - 영상/이미지 비율
  - 플랫폼 분포 (FB/IG/Messenger)
  - 광고 문구 패턴 (훅 유형: 할인형/후기형/성분형/감성형)
  - 시즌 패턴 (월별 광고 밀도)
  - 핵심 제품/프로모션 파악
- **표시**: 목업 하단 "AI 인사이트" 섹션 — 통계 카드 4개 + 텍스트 인사이트
- **캐싱**: 같은 브랜드 검색 시 24시간 캐시 (DB 저장)
- **파일**:
  - `src/app/api/competitor/insights/route.ts` (신규)
  - 인사이트 섹션 컴포넌트

---

## 구현 순서

T1 (검색) → T2 (모니터링) → T3 (AI 인사이트)

## 선행 조건

- `META_AD_LIBRARY_TOKEN`이 `.env.local`에 설정되어 있어야 함 (Smith님이 Graph API Explorer에서 발급 예정)
- 현재 Quick Tunnel 주소: `https://believe-conf-antique-agenda.trycloudflare.com` (ai-proxy)

## 디자인 시스템

bscamp 기존 디자인 그대로 따른다:
- Primary: `#F75D5D` / BG: `#f8f9fc` / Card: `#fff` / Border: `#e2e8f0`
- Text: `#1a1a1a` / Muted: `#64748b` / Font: Pretendard / Radius: `0.75rem`
- 사이드바 Active: `bg-#fee2e2 text-#F75D5D`
- 총가치각도기 탭 구조: 대시보드 | 벤치마크 | **경쟁사 분석**
