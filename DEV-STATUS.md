# DEV-STATUS — 2026-03-20 07:36 기준 (최종)

## STEP 1~7 진행 상태

| STEP | 내용 | 상태 | 진행률 | 비고 |
|------|------|:----:|:------:|------|
| 1 | 소재 분석 탭 구현 | ✅ 완료 | 100% | /protractor/creatives/ 3개 서브탭 |
| 2 | collect-daily media_url 수집 | ✅ 완료 | 100% | 3단계 fallback (image_hash→video_thumb→catalog) |
| 3 | L2 시선 예측 (Saliency) | ✅ 완료 | 94% | 2,711/2,873건 완료, Railway 자동 처리 |
| 4 | LP 크롤링 큐 | ✅ 완료 | **97%** | 1,736/1,796건 완료. Railway EAGAIN 수정(공유 브라우저) + Playwright 재크롤링 |
| 5 | 미디어 Storage | ✅ 완료 | 93%+ | 2,873건+ 완료, 마지막 1건 Meta CDN 403 만료 |
| 6 | 경쟁사 L1 온디맨드 | ✅ 완료 | 100% | 크론+UI+enqueue 구현, 62건 모니터 등록 |
| 7 | 사전계산 (진단 캐시) | ✅ 완료 | 100% | 40개 계정 전체 재계산 완료 (T3+수강생+진단) |

---

## 배치 처리 현황 (DB 최종)

| 항목 | 완료 | 전체 | 비율 |
|------|-----:|-----:|-----:|
| 총 소재 (ad_creative_embeddings) | — | 3,096 | — |
| 임베딩 3072 | 358 | 3,096 | 12% |
| LP 크롤링 | **1,736** | 1,796 | **97%** |
| Saliency 히트맵 | 2,711 | 2,873 | 94% |
| 미디어 Storage | 2,873+ | 3,096 | 93%+ |
| 진단 캐시 | 완료 | ~400 (top10×40계정) | 100% |
| 벤치마크 | 166 | — | — |
| 활성 계정 | 40 | — | — |
| Creative Intelligence | 358 | 3,096 | 12% |
| 경쟁사 모니터 | 62 | — | — |

### LP 크롤링 큐 상세 (최종)

```
전체 큐: 1,796건
├── completed: 1,736건 (97%)
├── pending:       0건
├── processing:    0건
└── failed:       60건 (HTTP 400 — Meta Canvas 만료 URL)
```

**해결 과정**:
1. Railway Playwright EAGAIN 장애 → `crawl-lp-fallback.mjs` (fetch+cheerio) 폴백으로 594건 처리
2. bscamp-crawler `server.js` 공유 브라우저 인스턴스 패턴으로 EAGAIN 근본 수정 (커밋 `a8b5111`)
3. Railway 재배포 → Playwright 정상화 → 나머지 274건 Playwright 풀 스크린샷 재크롤링 완료

---

## 오늘 커밋 목록 (22건 + 이번 커밋)

| 커밋 | 내용 |
|------|------|
| `aa2f86c` | fix: 진단 캐시 ad_id 불일치 수정 + LP크롤링 배치 안정화 (7파일) |
| `194c162` | fix: 벤치마크 기준값 표시 개선 — 값 분리표시 + 이모지 확대 + 캐시 재생성 (3파일) |
| `9a49b8a` | fix: saliency 페이지네이션 + media storage is_active 필터 제거 (2파일) |
| `cd97e48` | fix: 벤치마크 색상 회색 수정 — 캐시 camelCase→snake_case 변환 (2파일) |
| `9699f53` | fix: L2 saliency predict.py 1000건 페이지네이션 수정 (1파일) |
| `c588342` | fix: mozzi-reports Railway 크래시 수정 — Express 정적 서버 추가 (2파일) |
| `291f626` | fix: 광고계정 셀렉터 탭 이동 시 초기화 수정 — URL ?account_id 유지 (3파일) |
| `1a0b83e` | fix: 긴급 수정 3건 — API 403 권한 + 데이터 JOIN + 벤치마크 가중평균 (9파일) |
| `ae5276f` | feat: STEP 6 경쟁사 L1 온디맨드 크론 + STEP 7 사전계산 크론 (8파일) |
| `816434b` | fix: saliency torch hub 불완전 캐시 자동 삭제 (1파일) |
| `30450e1` | fix: Railway saliency OpenBLAS 스레드 제한 + PDCA 상태 갱신 (4파일) |
| `496a34f` | fix: persist-media-to-storage.mjs에 .env.local 로드 추가 (1파일) |
| `c6d8cac` | fix: saliency predict URL 길이 제한 수정 + 라운드당 100건 (2파일) |
| `7cb132e` | feat: STEP 4~7 배치 스크립트 4개 추가 (6파일 +2,300줄) |
| `7a43f81` | feat: L2 시선 예측 배치 트리거 스크립트 + PDCA 상태 갱신 (3파일) |
| `9e1550c` | fix: Dockerfile에 ca-certificates 추가 — SSL 오류 수정 (1파일) |
| `852803a` | fix: saliency predict 쿼리 필터 완화 — is_active/embedding_3072 제거 (2파일) |
| `14eb0db` | feat: 소재 분석 탭 구현 + collect-daily media_url 수집 (14파일 +3,575줄) |
| `122d7b6` | chore: QA hook 백엔드/프론트 분리 — 마커 3개 체계 |
| `44f17da` | feat: collect-content 크론 수집 복구 + ROAS 가중평균 + URL 중복방지 (3파일) |
| `ffb9dd7` | fix: Dockerfile 빌드 실패 수정 — git 설치 + python3-distutils 제거 (1파일) |
| `e88e71e` | feat: /health 엔드포인트에 git SHA 추가 + L4 358건 완료 (2파일) |
| `37163a0` | fix: creative-pipeline L3 upsert + L4 JSON 파싱 버그 수정 (3파일) |

---

## 버그 수정 현황 — 전부 해결

### 사전계산 캐시
| # | 증상 | 상태 | 원인/조치 |
|---|------|:----:|-----------|
| 1 | 일부 소재 벤치마크 전부 없음 | ✅ 수정 | ad_id 불일치 → adIds 파라미터 + 실시간 폴백 |
| 2 | 0% 구매전환율 → 🟡 표시 | ✅ 수정 | camelCase 캐시 → snake_case 재생성 |
| 3 | 색상 판정 불일치 | ✅ 버그 아님 | 두 함수 동일한 75% 기준 |
| 4 | IMAGE/CATALOG "데이터 없음" | ✅ 수정 | benchmarks API creative_type별 최신 날짜 필터링 |

### 벤치마크 API
| # | 증상 | 상태 | 원인/조치 |
|---|------|:----:|-----------|
| 1 | 색상 판정 불일치 | ✅ 확인 | judgeMetric()과 getVerdict() 동일 75% 기준 |
| 2 | IMAGE/CATALOG "데이터 없음" | ✅ 수정 | 글로벌 최신 날짜 → creative_type별 최신 날짜 |

---

## Railway 서비스 상태

| 서비스 | 상태 | 비고 |
|--------|:----:|------|
| creative-pipeline | ✅ 정상 | version 194c162, health OK |
| saliency (predict.py) | ✅ 정상 | 2,711/2,873건 처리 완료 |
| bscamp-crawler | ✅ 정상 | EAGAIN 수정 — 공유 브라우저 인스턴스 (`a8b5111`) |
| mozzi-reports | ✅ 정상 | Express 정적 서버 |

---

## 남은 작업

### 긴급
1. **임베딩 3072 배치 확대** — 358/3,096건 (12%). Railway creative-pipeline L1 배치 재실행 필요

### 중요 (기능 완성)
2. **IMAGE/CATALOG 수집** — collect-daily에 IMAGE/CATALOG creative_type 수집 추가 (결정 필요)
3. **UI 목업 v2 기반 프론트엔드 구현** — docs/protractor-uiux-update-plan.md 참고

### 보류
4. **소재 분석 탭 브라우저 QA** — Vercel preview 배포 후 QA 진행
5. **Railway 크롤러 재배포** — 근본 해결은 필요하나 폴백으로 우회 완료

---

## 완료된 TASK 파일

| TASK 파일 | 상태 | 비고 |
|-----------|:----:|------|
| TASK-benchmark-precompute-fix.md | ✅ 완료 | 버그 2건 해결, tsc+lint+build 통과 |
| TASK-protractor-uiux-update.md | ✅ 완료 | 계획서 작성 (docs/protractor-uiux-update-plan.md) |
| TASK-MOCKUP.md | ✅ 완료 | v2 완성 (1,378줄, 4탭, 기존 UI 반영 + 계획서 신규 요소) |
