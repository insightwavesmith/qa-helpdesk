# 수집→저장→분석→서비스 전체 아키텍처

> 최종 갱신: 2026-03-24 | Wave 2-3 CAROUSEL 대응 반영

---

## 1. 전체 데이터 파이프라인

```mermaid
flowchart TB
    subgraph EXT["외부 데이터 소스"]
        META["Meta Graph API<br/>v21.0"]
        RAILWAY["GCP Cloud Run<br/>creative-pipeline<br/>(DeepGaze Python)"]
        GEMINI["Gemini 2.5 Pro<br/>임베딩 + 5축 분석"]
    end

    subgraph COLLECT["① 수집 입구"]
        CD["collect-daily<br/>/api/cron/collect-daily<br/>(batch 1~4, 매일 4회)"]
        CB["collect-benchmark<br/>scripts/collect-benchmark-creatives.mjs"]
        BF["backfill<br/>/api/admin/protractor/collect<br/>(mode=backfill, 90일)"]
        CC["competitor-check<br/>/api/cron/competitor-check<br/>(6시간 주기)"]
        CL["crawl-lps<br/>/api/cron/crawl-lps"]
        CK["collect-clicks<br/>/api/cron/collect-clicks"]
    end

    subgraph DB["② DB 저장 (raw JSONB + 정규화)"]
        DAI["daily_ad_insights<br/>PK: account_id, date, ad_id<br/>raw_insight JSONB, raw_ad JSONB<br/>spend, impressions, reach, ctr, roas<br/>video_p3s_rate, engagement_per_10k"]
        CR["creatives<br/>PK: id, UNIQUE: ad_id<br/>creative_type: IMAGE|VIDEO|CAROUSEL|CATALOG<br/>is_member, is_benchmark<br/>raw_creative JSONB, lp_id FK"]
        CM["creative_media<br/>PK: id, UNIQUE: creative_id+position<br/>media_type, media_url, storage_url<br/>position (CAROUSEL 카드), card_total<br/>embedding vector(3072)<br/>analysis_json JSONB, saliency_url"]
        LP["landing_pages<br/>PK: id, UNIQUE: canonical_url<br/>domain, page_type, platform<br/>is_active"]
        LPS["lp_snapshots<br/>FK: lp_id<br/>screenshot_url, cta_screenshot_url<br/>screenshot_hash, crawled_at"]
        AIC["ad_insights_classified<br/>벤치마크 기준 분류"]
        CAC["competitor_ad_cache<br/>carousel_cards JSONB"]
        LCD["lp_click_data<br/>FK: lp_id"]
    end

    subgraph PROCESS["③ 후처리 파이프라인"]
        EMB["embed-creatives<br/>/api/cron/embed-creatives<br/>Gemini 3072차원 임베딩<br/>CAROUSEL 카드별 독립"]
        FA["analyze-five-axis<br/>scripts/analyze-five-axis.mjs<br/>Cloud Run Job 01:00 KST<br/>visual/text/psychology/quality/hook"]
        DG["creative-saliency<br/>/api/cron/creative-saliency<br/>DeepGaze 시선 히트맵<br/>IMAGE 카드만 (VIDEO 스킵)"]
        AND["compute-andromeda<br/>scripts/compute-andromeda-similarity.mjs<br/>Cloud Run Job 03:00 KST<br/>4축 가중 Jaccard 유사도"]
        FR["compute-fatigue-risk<br/>scripts/compute-fatigue-risk.mjs<br/>Cloud Run Job 02:30 KST"]
        PC["precompute<br/>/api/cron/precompute<br/>insights_aggregated_daily"]
        LPA["analyze-lps<br/>scripts/analyze-lps-v2.mjs<br/>LP 2축 분석"]
        SP["compute-score-percentiles<br/>Cloud Run Job 02:00 KST"]
        CLA["analyze-creative-lp-alignment<br/>scripts/analyze-creative-lp-alignment.mjs<br/>Cloud Run Job 03:30 KST"]
    end

    subgraph API["④ API (서비스 레이어)"]
        AI["GET /api/protractor/insights<br/>광고 성과 조회"]
        AT["GET /api/protractor/total-value<br/>총가치각도기"]
        AB["GET /api/protractor/benchmarks<br/>벤치마크 비교"]
        AO["GET /api/protractor/overlap<br/>소재-LP 겹침 분석"]
        AC["GET /api/protractor/creatives<br/>소재 상세"]
        ACP["GET /api/protractor/competitor<br/>경쟁사 분석"]
        AAC["GET /api/protractor/accounts<br/>계정 목록"]
    end

    subgraph UI["⑤ 프론트엔드 (Next.js App Router)"]
        PD["protractor/page.tsx<br/>총가치각도기 대시보드"]
        PCR["protractor/creatives/page.tsx<br/>소재 분석 뷰"]
        PCP["protractor/competitor/page.tsx<br/>경쟁사 모니터링"]
        DD["dashboard/page.tsx<br/>역할별 대시보드<br/>(admin/member/student)"]
    end

    %% 수집 흐름
    META --> CD
    META --> CB
    META --> BF
    META --> CC
    CD --> DAI
    CD --> CR
    CD --> CM
    CD --> LP
    CB --> CR
    CB --> CM
    CB --> AIC
    BF --> |runCollectDaily 재사용| DAI
    CC --> CAC
    CL --> LPS
    CL --> LP
    CK --> LCD

    %% 후처리 흐름
    CM --> EMB
    GEMINI --> EMB
    EMB --> |embedding 3072| CM
    CM --> FA
    GEMINI --> FA
    FA --> |analysis_json| CM
    CM --> DG
    RAILWAY --> DG
    DG --> |saliency_url| CM
    CM --> AND
    AND --> |andromeda_signals| CM
    DAI --> FR
    DAI --> PC
    LP --> LPA
    LPS --> LPA
    CM --> SP
    CM --> CLA
    LP --> CLA

    %% API → DB
    DAI --> AI
    DAI --> AT
    AIC --> AB
    CM --> AC
    CM --> AO
    CAC --> ACP
    CR --> AAC

    %% UI → API
    AI --> PD
    AT --> PD
    AB --> PD
    AC --> PCR
    AO --> PCR
    ACP --> PCP
    AAC --> DD
    AI --> DD
```

---

## 2. 수집 입구 상세

```mermaid
flowchart LR
    subgraph DAILY["collect-daily (4배치)"]
        direction TB
        B1["/api/cron/collect-daily-1<br/>계정 1~10"]
        B2["/api/cron/collect-daily-2<br/>계정 11~20"]
        B3["/api/cron/collect-daily-3<br/>계정 21~30"]
        B4["/api/cron/collect-daily-4<br/>계정 31~전체<br/>+ 후처리 트리거"]
    end

    META["Meta Ads API"] --> B1 & B2 & B3 & B4

    B1 & B2 & B3 & B4 --> S1["Step 1: daily_ad_insights<br/>onConflict: account_id,date,ad_id<br/>raw_insight, raw_ad JSONB"]
    B1 & B2 & B3 & B4 --> S2["Step 2: creatives<br/>onConflict: ad_id<br/>getCreativeType() → IMAGE|VIDEO|CAROUSEL|CATALOG<br/>is_member=true, raw_creative JSONB"]
    B1 & B2 & B3 & B4 --> S3["Step 3: creative_media<br/>onConflict: creative_id,position<br/>CAROUSEL → extractCarouselCards() N행<br/>IMAGE/VIDEO → position=0 단일행"]
    B1 & B2 & B3 & B4 --> S4["Step 4: landing_pages<br/>onConflict: canonical_url<br/>extractLpUrl() 3단계 fallback"]

    B4 --> POST["후처리 (batch 4만)"]
    POST --> E1["embedMissingCreatives()"]
    POST --> E2["SHARE→VIDEO 일괄 수정"]
    POST --> E3["runPrecomputeAll()"]
    POST --> E4["Creative Pipeline 호출"]
```

---

## 3. CAROUSEL 데이터 흐름

```mermaid
flowchart TB
    AD["Meta 광고 데이터<br/>(ad.creative)"]

    AD --> GT{"getCreativeType(ad)"}
    GT -->|"oss.template_data 존재<br/>OR afs.images >= 2"| CAROUSEL["CAROUSEL"]
    GT -->|"video_id 존재"| VIDEO["VIDEO"]
    GT -->|"image_hash 존재"| IMAGE["IMAGE"]
    GT -->|"product_set_id"| CATALOG["CATALOG"]

    CAROUSEL --> ECC["extractCarouselCards(ad)"]
    ECC --> |"template_data.elements"| CARDS["카드 배열<br/>[{imageHash, videoId, lpUrl, position}]"]
    ECC --> |"fallback: afs.images"| CARDS

    CARDS --> CM1["creative_media position=0<br/>card_total=N"]
    CARDS --> CM2["creative_media position=1<br/>card_total=N"]
    CARDS --> CMN["creative_media position=N-1<br/>card_total=N"]

    VIDEO --> CM0V["creative_media position=0<br/>card_total=1"]
    IMAGE --> CM0I["creative_media position=0<br/>card_total=1"]

    CM1 & CM2 & CMN --> EMB["embed-creatives<br/>카드별 독립 임베딩"]
    CM1 & CM2 & CMN --> FA5["analyze-five-axis<br/>카드별 5축 분석"]
    CM1 & CM2 & CMN --> DGZ["creative-saliency<br/>IMAGE 카드만 DeepGaze"]
```

---

## 4. DB 테이블 관계

```mermaid
erDiagram
    ad_accounts ||--o{ creatives : "account_id"
    ad_accounts ||--o{ daily_ad_insights : "account_id"
    ad_accounts ||--o{ landing_pages : "account_id"

    creatives ||--o{ creative_media : "creative_id (1:N, position별)"
    creatives }o--|| landing_pages : "lp_id FK"

    daily_ad_insights }o--|| creatives : "ad_id"

    creative_media ||--o| creative_saliency : "ad_id 기준"

    landing_pages ||--o{ lp_snapshots : "lp_id"
    landing_pages ||--o| lp_analysis : "lp_id"
    landing_pages ||--o{ lp_click_data : "lp_id"

    creatives ||--o{ creative_lp_map : "creative_id"
    landing_pages ||--o{ creative_lp_map : "landing_page_id"

    ad_accounts {
        string account_id PK
        string account_name
        boolean active
        string meta_status
    }

    creatives {
        uuid id PK
        string ad_id UK
        string account_id FK
        string creative_type "IMAGE|VIDEO|CAROUSEL|CATALOG"
        boolean is_member
        boolean is_benchmark
        string source "member|benchmark"
        uuid lp_id FK
        jsonb raw_creative
    }

    creative_media {
        uuid id PK
        uuid creative_id FK
        int position "CAROUSEL 카드 순서"
        int card_total
        string media_type "IMAGE|VIDEO"
        string media_url
        string storage_url
        string media_hash
        vector embedding "3072차원"
        jsonb analysis_json "5축+andromeda"
        string saliency_url
        jsonb raw_creative
    }

    daily_ad_insights {
        string account_id PK
        date date PK
        string ad_id PK
        float spend
        int impressions
        int reach
        int clicks
        float ctr
        float roas
        float video_p3s_rate
        float engagement_per_10k
        jsonb raw_insight
        jsonb raw_ad
    }

    landing_pages {
        uuid id PK
        string account_id
        string canonical_url UK
        string domain
        string page_type
        string platform
    }

    lp_snapshots {
        uuid id PK
        uuid lp_id FK
        string viewport
        string screenshot_url
        string screenshot_hash
    }
```

---

## 5. Cloud Run Jobs 스케줄

```mermaid
gantt
    title 일일 파이프라인 실행 순서 (KST)
    dateFormat HH:mm
    axisFormat %H:%M

    section 수집
    collect-daily batch1~4       :cd, 03:00, 30min
    collect-benchmarks           :cb, 03:30, 15min
    collect-clicks               :ck, 04:00, 15min
    competitor-check             :cc, 00:00, 10min

    section 후처리
    embed-creatives              :em, 03:30, 30min
    analyze-five-axis            :fa, 01:00, 60min
    compute-score-percentiles    :sp, 02:00, 15min
    compute-fatigue-risk         :fr, 02:30, 15min
    compute-andromeda-similarity :an, 03:00, 30min
    analyze-lp-alignment         :la, 03:30, 15min
    analyze-lp-saliency          :ls, 04:00, 30min

    section 크롤링
    crawl-lps                    :cl, 05:00, 60min
```

---

## 6. Storage 경로 패턴 (ADR-001)

```
gs://bscamp-storage/
├── creatives/
│   └── {account_id}/
│       └── media/
│           ├── {ad_id}.jpg          ← 소재 이미지
│           └── {ad_id}.mp4          ← 소재 영상
├── lp/
│   └── {account_id}/
│       └── {lp_id}/
│           ├── mobile_full.jpg      ← LP 전체 스크린샷
│           ├── mobile_cta.jpg       ← LP CTA 영역
│           ├── page.html            ← LP HTML 원본
│           └── media/
│               └── {hash}.{ext}     ← LP 미디어 자산
└── saliency/
    └── {ad_id}_attention.png        ← DeepGaze 히트맵
```

---

## 7. 주요 라이브러리 의존성

```mermaid
flowchart LR
    CT["creative-type.ts<br/>getCreativeType()"] --> CD["collect-daily/route.ts"]
    CT --> CB["collect-benchmark.mjs<br/>(인라인 복제)"]
    CT --> EC["embed-creatives/route.ts"]

    CC["carousel-cards.ts<br/>extractCarouselCards()"] --> CD
    CC --> CB

    ACE["ad-creative-embedder.ts<br/>embedCreative()"] --> EC
    ACE --> CD

    CIF["creative-image-fetcher.ts<br/>fetchImageUrlsByHash()<br/>fetchVideoThumbnails()"] --> CD

    LPN["lp-normalizer.ts<br/>normalizeUrl()<br/>classifyUrl()"] --> CD

    PRE["precompute.ts<br/>runPrecomputeAll()"] --> CD
    PRE --> |"insights_aggregated_daily"| PC["/api/cron/precompute"]

    GM["gemini.ts<br/>embedText()<br/>generateContent()"] --> ACE
    GM --> FA["analyze-five-axis.mjs"]
```
