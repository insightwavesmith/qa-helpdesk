# 경쟁사 분석기 Plan

> 목업: https://mozzi-reports.vercel.app/reports/mockup/2026-03-06-competitor-analyzer-v2.html
> 작성일: 2026-03-06

---

## 배경

수강생이 경쟁사 광고를 분석하려면 Meta Ad Library 웹사이트에 직접 가서 일일이 찾아봐야 한다. 총가치각도기 안에 "경쟁사 분석" 탭을 추가하여, 브랜드 검색 -> 광고 카드뷰 -> AI 인사이트까지 원스톱으로 제공한다. 특히 **운영기간이 긴 광고 = 수익성 높은 광고**라는 핵심 인사이트를 즉시 파악할 수 있게 한다.

## 범위

| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| **T1** | 경쟁사 광고 검색 - Meta Ad Library API 연동 | 없음 |
| **T2** | 브랜드 모니터링 등록 + 신규 광고 알림 | T1 (검색 UI/API 기반) |
| **T3** | AI 인사이트 - 검색 결과 자동 분석 | T1 (검색 결과 데이터) |

## 성공 기준

- [ ] `npm run build` 성공 (META_AD_LIBRARY_TOKEN 없어도 빌드 가능)
- [ ] lint 에러 0개
- [ ] T1: 브랜드명 검색 -> Meta Ad Library 광고 카드 리스트 표시
- [ ] T1: 운영기간순 정렬, 30일+ 필터, 플랫폼 필터 동작
- [ ] T2: 브랜드 모니터링 등록/삭제, Cron으로 신규 광고 감지
- [ ] T3: 검색 결과 AI 분석 (훅 유형, 시즌 패턴 등) 표시
- [ ] bscamp 디자인 시스템 적용 (Primary #F75D5D, Pretendard, 라이트모드)
- [ ] 총가치각도기 탭 네비게이션에 "경쟁사 분석" 탭 추가
- [ ] 데스크탑(1920px) + 모바일(375px) 반응형

## 실행 순서

```
Phase 1: T1 (검색 API + UI)
Phase 2: T2 (모니터링) + T3 (AI 인사이트) — 병렬 가능
```

## 선행 조건

- `META_AD_LIBRARY_TOKEN` 환경변수 (.env.local) - Smith님 발급 예정
- 토큰 없어도 빌드 가능하게 설계 (optional chaining + graceful error)
- ai-proxy Quick Tunnel 주소 (T3 AI 인사이트용)

## 위험 요소

| 위험 | 영향 | 완화 |
|------|------|------|
| Meta Ad Library API Rate Limit (200 calls/hour) | T2 Cron 대량 호출 시 초과 | 모니터링 브랜드 수 제한 + 배치 간격 조절 |
| Meta API가 engagement 데이터 미제공 | 좋아요/댓글/공유 분석 불가 | 운영기간을 유일한 수익성 시그널로 활용 |
| META_AD_LIBRARY_TOKEN 미설정 시 | API 호출 불가 | 에러 UI + 토큰 미설정 안내 메시지 |
| ad_snapshot_url iframe 보안 제한 | 일부 브라우저에서 미표시 | fallback 이미지/텍스트 표시 |

## T1 상세: 경쟁사 광고 검색

### 이게 뭔지
브랜드명/키워드 입력 -> Meta Ad Library API 검색 -> 광고 카드 리스트 표시

### 왜 필요한지
수강생이 경쟁사 광고를 서비스 안에서 바로 검색하고 운영기간 기반 수익성을 파악할 수 있다.

### 구현 내용
- API Route: `/api/competitor/search` (GET)
  - query params: `search_terms`, `country` (default: KR)
  - Meta Ad Library API v19.0 호출
  - 응답 가공: 운영기간(일수) 계산, 정렬
- UI: 검색바 + 필터칩 + 광고 카드 리스트
- 총가치각도기 탭에 "경쟁사 분석" 서브탭 추가

## T2 상세: 브랜드 모니터링

### 이게 뭔지
관심 브랜드 등록 -> Cron으로 신규 광고 감지 -> 알림

### 왜 필요한지
매번 수동 검색 없이 경쟁사 동향 자동 추적

### 구현 내용
- DB: `competitor_monitors`, `competitor_alerts` 테이블
- API: CRUD + Cron (`/api/cron/competitor-check`)
- UI: 모니터링 패널 (브랜드 카드 + 신규 뱃지)

## T3 상세: AI 인사이트

### 이게 뭔지
검색 결과 광고 데이터 -> AI 자동 분석 (패턴/전략 요약)

### 왜 필요한지
수강생이 직접 패턴 파악 대신 AI가 실행 가능한 인사이트 제공

### 구현 내용
- API: `/api/competitor/insights` (POST)
- AI 분석: 장기 광고 비율, 영상/이미지 비율, 훅 유형 분류, 시즌 패턴
- 24시간 캐시 (DB)
- UI: 통계 카드 4개 + 텍스트 인사이트 섹션
