# 기획서: 경쟁사 광고 분석기 (총가치각도기)

> 작성: 2026-03-06 | 버전: v1.0
> 위치: 총가치각도기 > 경쟁사 분석 탭

---

## 1. 개요

### 한 줄 요약
Meta 광고 라이브러리에서 경쟁사 광고를 검색하고, **우리 실데이터 기반 벤치마크**로 성과를 추정하는 도구.

### 왜 만드는가
- 수강생들이 경쟁사 광고를 분석하려면 Foreplay($49/월), AdSpy($149/월) 같은 해외 서비스를 써야 함
- 해외 서비스는 **한국 자사몰 특화 벤치마크가 없음** → 추정치가 글로벌 평균 기반이라 부정확
- 우리는 125개 한국 자사몰 광고 계정의 실데이터(카테고리별 CPM/CTR/ER)를 이미 갖고 있음
- 이걸 활용하면 **"이 광고가 뷰티 카테고리에서 어느 수준인지"** 정확하게 추정 가능

### 경쟁 서비스와의 차이

| | Foreplay | AdSpy | Panoramata | **우리** |
|---|---------|-------|-----------|---------|
| 가격 | $49/월 | $149/월 | $89/월 | **수강생 무료** |
| 한국 특화 | ❌ | ❌ | ❌ | ✅ |
| 카테고리별 CPM | ❌ | ❌ | ❌ | ✅ 실데이터 |
| 소재 다운로드 | △ | ✅ | ❌ | ✅ |
| 성과 추정 | ❌ | ❌ | △ | ✅ 벤치마크 기반 |
| 모니터링 알림 | ❌ | ❌ | ✅ | ✅ |

---

## 2. 사용자 시나리오

### 시나리오 A: "경쟁사 뭐 하고 있지?"
> 수강생 김OO, 뷰티 자사몰 운영
1. 경쟁사 분석 탭 → "이니스프리" 검색
2. 최근 30일 광고 47건 확인
3. 장수 광고(30일+) 8건 → "이건 수익 나는 소재구나"
4. 추정 광고비 ₩1,289만 → "이 정도 태우고 있구나"
5. 소재 다운로드 → 레퍼런스로 활용

### 시나리오 B: "내 카테고리 평균 대비 어디쯤?"
> 관리자, 식품 카테고리 수강생 코칭 중
1. 수강생 광고 계정 CPM ₩15,000
2. 경쟁사 분석에서 식품 벤치마크 확인 → 식품 평균 CPM ₩13,108
3. "평균보다 14% 비싸네, 타겟팅 재점검 필요"

### 시나리오 C: "새 광고 나오면 알려줘"
> 수강생 이OO, 경쟁사 3개 모니터링 중
1. 모니터링 페이지에 경쟁사 3개 등록
2. 새 광고 감지 시 알림 → "A사가 영상 광고 3개 시작"
3. 장수 광고(30일+) 자동 하이라이트

---

## 3. 기능 상세

### F1. 광고 검색 + 다운로드

**이게 뭔지**: Meta Ad Library에서 키워드/브랜드로 광고를 검색하고 소재를 다운로드하는 기능

**검색 필터:**
| 필터 | 값 | 필수 |
|------|-----|------|
| 키워드/브랜드명 | 자유 텍스트 | ✅ |
| 카테고리 | 뷰티/건강/식품/패션/디지털/홈/키즈/펫/교육/여행/기타 | ❌ |
| 소재 유형 | 전체/이미지/영상 | ❌ |
| 기간 | 7일/30일/90일/전체 | ❌ (기본: 30일) |
| 플랫폼 | Facebook/Instagram/전체 | ❌ |

**검색 결과 카드에 표시할 정보:**
- 소재 썸네일 (이미지 or 영상 첫 프레임)
- 광고주 페이지명
- 광고 문구 (2줄 말줄임)
- 카테고리 뱃지 (AI 자동 분류)
- 시작일 + 운영 기간
- 수익성 뱃지: 🧪 테스트 중 (7일 미만) / 👀 관찰 중 (7~30일) / 🔥 수익성 확인 (30일+)
- 추정 노출수 / 추정 광고비
- 벤치마크 대비 등급 (ABOVE/AVG/BELOW)

**다운로드:**
- 이미지: 원본 해상도 다운로드
- 영상: mp4 다운로드
- Supabase Storage에 캐싱 (동일 소재 재다운로드 방지)

**정렬 옵션:**
- 추정 광고비 높은 순 (기본)
- 운영 기간 긴 순
- 최신순
- Engagement 높은 순

### F2. 카테고리 자동 분류

**이게 뭔지**: 검색된 광고를 자동으로 산업 카테고리로 분류하는 기능

**왜 필요한지**: 카테고리별 CPM이 다르기 때문에 (뷰티 ₩22,420 vs 식품 ₩13,108) 정확한 성과 추정의 전제 조건

**분류 로직** (기존 `classify-account.ts` 재활용):
1. 광고주 페이지 정보 (Meta API에서 제공)
2. 광고 문구 키워드 매칭
3. 카테고리: beauty/health/food/fashion/digital/home/kids/pet/travel/education/sports/etc

**수동 보정:**
- AI 분류 결과에 "카테고리 변경" 버튼
- 사용자가 보정하면 학습 데이터로 활용 (향후)

### F3. 벤치마크 기반 성과 추정

**이게 뭔지**: 공개된 engagement 데이터 + 우리 CPM 실데이터로 경쟁사 광고비를 추정하는 기능

**추정 공식:**

```
[1단계: 노출수 추정]
영상 광고: 노출수 = 조회수 ÷ 0.4
이미지 광고: 노출수 = (좋아요+댓글+공유) ÷ 카테고리 평균 ER

[2단계: 광고비 추정]
광고비 = 노출수 ÷ 1,000 × 카테고리별 CPM

[3단계: 수익성 판단]
운영 기간 < 7일  → 🧪 테스트 중
운영 기간 7~30일 → 👀 관찰 중
운영 기간 > 30일 → 🔥 수익성 확인 (거의 확실히 ROAS 1 이상)

[4단계: 벤치마크 비교]
카테고리 평균 대비 → ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE
```

**우리 벤치마크 데이터 (현재 보유):**

| 카테고리 | CPM | 계정 수 |
|---------|------|---------|
| health | ₩24,812 | 28 |
| beauty | ₩22,420 | 27 |
| digital | ₩21,967 | 6 |
| fashion | ₩17,072 | 10 |
| pet | ₩16,613 | 3 |
| etc | ₩15,812 | 16 |
| home | ₩15,262 | 9 |
| kids | ₩14,305 | 4 |
| food | ₩13,108 | 12 |

**투명성 원칙:**
- "이 수치는 추정치입니다 (±30~50% 오차)" 항상 표시
- 추정 로직 공개 섹션 (접을 수 있는 패널)
- 오차 범위 표시: "₩1,289만 (₩900만~₩1,800만)"

### F4. 스와이프 파일 (저장/정리)

**이게 뭔지**: 좋은 광고를 폴더별로 저장/정리하는 기능 (Foreplay의 핵심 기능)

**기능:**
- 광고 카드에서 "📁 저장" 클릭 → 폴더 선택
- 폴더 생성/이름변경/삭제
- 태그 분류: 카테고리, 소재유형 (자동)
- 메모 추가 (자유 텍스트)
- 수강생 간 공유 가능 (공개 폴더 설정)

### F5. 경쟁사 모니터링 알림

**이게 뭔지**: 경쟁사 페이지를 등록하면 새 광고 감지 시 알림을 보내는 기능

**기능:**
- 모니터링 페이지 등록 (Meta page ID or URL)
- 체크 주기: 매일 1회 (cron)
- 새 광고 감지 시 → 앱 내 알림 + (선택) 이메일
- 장수 광고(30일+) 자동 하이라이트: "이 광고가 30일 넘겼습니다 🔥"
- 사이드바에 모니터링 페이지 목록 + 활성 상태 표시

---

## 4. 데이터 모델

### 신규 테이블

```sql
-- 검색/저장된 경쟁사 광고
competitor_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_id TEXT UNIQUE NOT NULL,      -- Meta Ad Library ID
  page_id TEXT NOT NULL,                -- 광고주 페이지 ID
  page_name TEXT NOT NULL,              -- 광고주 페이지명
  category TEXT DEFAULT 'etc',          -- AI 분류 카테고리
  category_confidence FLOAT,            -- 분류 신뢰도
  
  -- 소재
  creative_type TEXT NOT NULL,          -- image / video
  creative_url TEXT,                    -- 원본 URL
  storage_path TEXT,                    -- Supabase Storage 경로 (캐싱)
  ad_copy TEXT,                         -- 광고 문구
  cta TEXT,                             -- CTA 버튼 텍스트
  
  -- 기간
  start_date DATE,
  end_date DATE,                        -- NULL = 아직 운영 중
  platforms TEXT[],                      -- ['facebook', 'instagram']
  
  -- Engagement (공개 데이터)
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  video_views INTEGER,                  -- 영상만
  
  -- 추정치
  estimated_impressions BIGINT,
  estimated_spend_krw INTEGER,          -- 원화 추정 광고비
  benchmark_grade TEXT,                 -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 스와이프 파일 폴더
swipe_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 스와이프 파일 저장
swipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES swipe_folders(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES competitor_ads(id),
  memo TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 모니터링 대상 페이지
monitored_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  category TEXT DEFAULT 'etc',
  check_interval_hours INTEGER DEFAULT 24,
  last_checked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

-- 모니터링 알림 히스토리
monitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_page_id UUID REFERENCES monitored_pages(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES competitor_ads(id),
  alert_type TEXT NOT NULL,             -- new_ad / long_running
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 기존 테이블 활용
- `benchmarks` — 카테고리별 CPM/CTR/ER (이미 있음, 180행)
- `account_categories` — 카테고리 분류 로직 재활용

---

## 5. API 설계

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/competitor/search` | POST | Meta Ad Library 검색 + 성과 추정 |
| `/api/competitor/download` | POST | 소재 다운로드 → Storage 저장 |
| `/api/competitor/swipe` | GET/POST/DELETE | 스와이프 폴더/아이템 CRUD |
| `/api/competitor/monitor` | GET/POST/PUT/DELETE | 모니터링 페이지 CRUD |
| `/api/cron/check-monitors` | GET | 모니터링 체크 (cron, 매일 1회) |

### Meta Ad Library API
- 엔드포인트: `https://graph.facebook.com/v19.0/ads_archive`
- 인증: App Access Token (우리 META_ACCESS_TOKEN)
- Rate limit: 200 calls/hour
- 캐싱 전략: 동일 검색어 30분 캐시 (Supabase에 저장)

---

## 6. UI 구조

```
총가치각도기
├── 대시보드 (기존)
├── 벤치마크 (기존)
└── 경쟁사 분석 (신규)
    ├── 사이드바
    │   ├── 🔍 광고 검색 (메인)
    │   ├── 📁 스와이프 파일 (저장한 광고)
    │   ├── 👁️ 모니터링 (등록한 페이지)
    │   └── 모니터링 페이지 목록
    └── 메인 영역
        ├── 검색바 (키워드/필터)
        ├── 요약 통계 (4개 카드)
        ├── 광고 카드 리스트 (카드뷰/리스트뷰)
        ├── 벤치마크 비교 차트
        └── 추정 로직 안내
```

---

## 7. 구현 페이즈

### Phase 0: 검색 + 성과 추정 (핵심)
| 항목 | 내용 |
|------|------|
| 기간 | 1~2주 |
| 선행 작업 | 없음 (benchmarks 이미 있음) |
| 기능 | F1(검색+다운로드) + F2(카테고리분류) + F3(벤치마크추정) |
| 테이블 | competitor_ads |
| 페이지 | `/admin/competitor` |

### Phase 1: 스와이프 파일
| 항목 | 내용 |
|------|------|
| 기간 | 3~5일 |
| 선행 작업 | Phase 0 |
| 기능 | F4(저장/폴더/태그/공유) |
| 테이블 | swipe_folders, swipe_items |

### Phase 2: 모니터링 알림
| 항목 | 내용 |
|------|------|
| 기간 | 3~5일 |
| 선행 작업 | Phase 0 |
| 기능 | F5(페이지 등록/체크/알림) |
| 테이블 | monitored_pages, monitor_alerts |
| Cron | check-monitors (매일 1회) |

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Meta API rate limit (200/hour) | 검색 속도 제한 | 결과 캐싱 30분, 페이지네이션 |
| Engagement 데이터 미제공 | 추정 불가 | "데이터 없음" 표시, 운영기간만으로 판단 |
| 카테고리 분류 오차 (~20%) | 벤치마크 매칭 부정확 | 수동 보정 UI + "기타" fallback |
| 광고비 추정 오차 (±30~50%) | 사용자 오해 | "추정치" 명시 + 오차 범위 표시 |

---

## 9. 성공 지표

| 지표 | 목표 |
|------|------|
| 주간 검색 횟수 | 50회+ |
| 스와이프 저장 수 | 100건+/월 |
| 모니터링 등록 | 수강생당 평균 2개+ |
| 수강생 만족도 | "유료 서비스 안 써도 되겠다" 피드백 |
