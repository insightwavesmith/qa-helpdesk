# TASK: 수집 구조 v3 — 전체 광고계정 디스커버리 + 콘텐츠 중복 제거

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

**먼저 현재 코드를 분석해서 마이그레이션 필요 여부부터 리뷰해라. 구현 전에 리뷰 결과를 정리해서 보고.**

## 배경

현재 collect-daily는 ad_accounts 테이블에 등록된 42개 계정만 수집한다.
하지만 Meta API 토큰으로 접근 가능한 광고계정은 훨씬 많다 (가입 안 한 수강생 포함).
접근 가능한 모든 계정의 데이터를 수집하고, 프론트에서는 계정별로 필터해서 보여주는 구조로 전환.

## 핵심 원칙

```
수집 = 접근 가능한 전부 (웨어하우스)
서빙 = 계정별 필터 (프론트)
```

## STEP 1: 계정 디스커버리 크론

Meta API `/me/adaccounts`로 접근 가능한 전체 광고계정 목록 조회.

1. 앱 토큰으로 `/me/adaccounts?fields=account_id,name,account_status,currency` 호출
2. 각 계정의 최근 90일 impressions 조회 (간단 체크)
3. 90일간 광고 한 번도 안 돌린 계정 → 스킵
4. 활성 계정 → ad_accounts 테이블에 upsert
   - 이미 있으면 업데이트 (이름, 상태 등)
   - 없으면 신규 등록 (is_member=false, 가입 안 한 수강생)
5. 기존 ad_accounts에 있지만 API 접근 불가한 계정 → active=false

주기: 주 1회 (계정 변동 잦지 않음)

## STEP 2: 콘텐츠 중복 제거

현재: ad_id 기준 → 같은 소재를 여러 광고에서 돌리면 콘텐츠 중복 저장됨.
변경: image_hash(이미지) / video_id(영상) 기준으로 콘텐츠 1건만 저장.

### Meta API 구조
```
Ad (ad_id, 매번 고유)
└ Creative (creative_id, 복사하면 바뀜 → 신뢰 못 함)
  └ image_hash / video_id (원본 파일 식별자 → 진짜 중복 키)
```

### 변경 사항
- creative_media: `content_hash` 컬럼 추가 (image_hash 또는 video_id 저장)
- 콘텐츠 저장: content_hash 기준 중복 체크. 이미 있으면 콘텐츠 다운로드 스킵.
- 성과: ad_id × date 기준으로 전부 저장 (같은 소재라도 광고별 성과 다름)
- 분석(5축/DeepGaze/임베딩): content_hash 기준 1번만 실행
- creatives 테이블: 같은 content_hash를 공유하는 여러 ad_id 연결 가능해야 함

### 중복 시나리오
```
광고A (ad_id: 111) → Creative(image_hash: abc123) → 콘텐츠 1번 저장
광고B (ad_id: 222) → Creative(image_hash: abc123) → 같은 콘텐츠 → 스킵
성과: 광고A 성과, 광고B 성과 각각 저장
분석: image_hash=abc123에 대해 5축 1번만
```

## STEP 3: 수집 흐름 정리

### 숫자 (매일)
```
collect-daily
→ ad_accounts에서 active=true 전체 (디스커버리로 등록된 계정 포함)
→ Meta API yesterday
→ daily_ad_insights upsert (account_id, date, ad_id)
→ raw_insight, raw_ad JSONB 저장
```

### 콘텐츠 (신규만)
```
collect-daily 시 creatives + creative_media upsert
→ content_hash(image_hash/video_id) 이미 있으면 콘텐츠 스킵
→ 새 콘텐츠만 process-media가 다운로드 → GCS
```

### 트리거 (자동 감지)
- collect-daily가 매일 전체 active 광고를 가져오므로 새 광고 자동 감지
- 새 ad_id → creatives upsert → content_hash 체크 → 신규면 process-media 대상

## 리뷰 요청 사항

구현 전에 아래 항목 리뷰해서 보고해라:

1. **DB 마이그레이션 필요한 것**: 어떤 테이블에 어떤 컬럼/인덱스 추가 필요?
2. **기존 코드 영향 범위**: collect-daily, process-media, embed-creatives, analyze-five-axis 등 어디를 수정해야 하나?
3. **creatives ↔ creative_media 관계**: content_hash 기반 중복 제거 시 현재 1:N 관계가 어떻게 바뀌나?
4. **ad_accounts 테이블 변경**: 디스커버리로 자동 등록될 때 필요한 컬럼 (is_member, discovered_at 등)
5. **backfill 호환성**: 기존 backfill 엔드포인트가 새 구조에서도 동작하나?

## 참고

- 현재 DB: Cloud SQL (34.50.5.237)
- 현재 코드: src/app/api/cron/collect-daily/route.ts, src/app/api/cron/process-media/route.ts
- 중복 제거 키: image_hash (이미지), video_id (영상). creative_id는 복사 시 바뀌므로 신뢰 안 함.
- ad_accounts 현재: 42개 (active 38, inactive 4)

## 완료 기준
- 리뷰 보고서 먼저 작성 (마이그레이션 범위 + 영향 분석)
- Smith님 승인 후 구현 시작
