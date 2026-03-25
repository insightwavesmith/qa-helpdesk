# ADR-002: 서비스 맥락 (모든 에이전트팀 필독)

> 마지막 업데이트: 2026-03-25
> 이 문서는 세션 시작 시 반드시 읽어야 한다. 서비스를 이해하지 못하고 개발하면 리젝.

---

## 서비스 한 줄 요약
**자사몰사관학교(bscamp)** — 자사몰 운영자(수강생)에게 "내 Meta 광고/LP가 왜 안 되는지, 뭘 고치면 되는지"를 데이터+AI로 알려주는 교육 플랫폼

## 사용자
| 유형 | 누구 | 하는 것 |
|------|------|---------|
| 수강생 | 자사몰 운영자 (~40명) | Meta 광고 돌림, 총가치각도기로 성과 진단 받음 |
| 관리자 | Smith님 (CEO) | 전체 관리, 수강생 코칭, 서비스 방향 결정 |
| 에이전트 | 모찌 (COO) + 3팀 | PM(기획), CTO(개발), 마케팅(홍보) |

## 핵심 기능

### 1. 총가치각도기 (Protractor)
수강생의 Meta 광고 성과를 벤치마크와 비교해서 진단.
- 기반(3초시청률, CTR) → 참여(반응, 댓글) → 전환(구매, ROAS)
- "너 CTR 1.2%, 평균 2.3%, 48% 부족" → 숫자 비교

### 2. 소재 5축 AI 분석
광고 소재(이미지/영상)를 AI가 분석해서 "왜 안 되는지" 진단.
- L1 태깅(Gemini) → L2 시선예측(DeepGaze) → L3 요소별 벤치마크 → L4 종합 점수

### 3. LP(상세페이지) 분석
광고 클릭 후 도달하는 LP를 크롤링+AI 분석.
- 스크린샷 + CTA + 구조분석 + 소재↔LP 일관성 점수

### 4. AI 처방 (구현 중)
진단 결과를 바탕으로 "뭘 고치면 되는지" 구체적 처방.
- DeepGaze 시선 → Gemini 결합 분석 → 벤치마크 패턴 매칭 → 처방

### 5. 경쟁사 분석
Meta Ad Library에서 경쟁사 광고 검색+비교.

## 데이터 흐름
```
수집 (매일)          저장              분석                    서빙
─────────────     ──────────     ─────────────────     ──────────
Meta API ────→ Cloud SQL DB     Gemini 5축 분석        프론트 대시보드
광고 성과         creative_media   DeepGaze 시선예측       (Vercel)
소재 이미지/영상   daily_ad_insights 임베딩 3072D
LP 크롤링         landing_pages    벤치마크 비교
                  GCS Storage     LP 구조분석
```

## 인프라
```
프론트:     Vercel (Next.js 14) — Supabase Auth
크론/API:   GCP Cloud Run (bscamp-cron)
크롤러:     GCP Cloud Run (bscamp-crawler, Playwright)
파이프라인:  GCP Cloud Run (creative-pipeline, DeepGaze)
DB:         GCP Cloud SQL (PostgreSQL)
Storage:    GCS (gs://bscamp-storage)
스케줄러:   GCP Cloud Scheduler (23개 크론)
AI:         Gemini 2.5 Pro + DeepGaze IIE
외부 API:   Meta Marketing API, Meta Ad Library API
```

## 현재 개발 단계 (2026-03-25)

### 완료
- ✅ 총가치각도기 대시보드 (3단계 벤치마크)
- ✅ 소재 5축 분석 파이프라인 (L1~L4)
- ✅ 경쟁사 분석 v2
- ✅ GCP 이관 Phase 1~5 (Railway→Cloud Run)
- ✅ Storage→GCS 이관
- ✅ 수집 구조 v3 (계정 디스커버리 + 콘텐츠 중복 제거)
- ✅ collect-daily 3단계 분리 + process-media 크론
- ✅ Meta API 전체 필드 확장 (12→30개)

### 진행 중
- 🔄 backfill 90일 (41/90일 완료)
- 🔄 임베딩 (3,166/3,355 = 94%)
- 🔄 이미지 saliency (2,133건 완료)
- 🔄 Railway 코드 정리 + USE_CLOUD_SQL 제거

### 다음
- ⏳ DeepGaze→Gemini 결합 파이프라인 (ffmpeg 씬분할)
- ⏳ 처방 시스템 (prescription_benchmarks + 프롬프트)
- ⏳ 슬랙 알림 시스템
- ⏳ 웹 터미널 대시보드
- ⏳ GCP Phase 6 보안 (Cloud SQL IP 제한)

## 팀별 역할
| 팀 | 역할 | 하지 말 것 |
|----|------|-----------|
| PM팀 | 기획/설계, Plan+Design 문서, PRD | 코드 작성 |
| CTO팀 | 구현/배포, tsc+build+QA | 기획 없이 코딩 시작 |
| 마케팅팀 | bscamp 강의 홍보, 오가닉 채널 배포 프로세스 | 서비스 기능 개발 (그건 CTO) |
| 모찌 (COO) | 3팀 조율, Smith님 소통, 기획 판단 | 직접 코딩 |

## 핵심 URL
- 서비스: https://bscamp.vercel.app
- 프로젝트: /Users/smith/projects/bscamp
- 모찌리포트: https://mozzi-reports.vercel.app
- 대시보드: https://mozzi-reports.vercel.app/dashboard

## 계정 종속 원칙 (ADR-001 참조)
모든 데이터는 account_id로 분리된다. DB 테이블, Storage 경로, API 응답, 프론트 전부.
하나라도 빠지면 리젝.

---

_이 문서는 서비스가 변경될 때마다 업데이트해야 한다._
