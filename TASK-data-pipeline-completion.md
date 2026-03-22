# TASK: 데이터 파이프라인 완성도 100% 달성

## 고객 관점
총가치각도기에서 수강생이 소재를 클릭하면 "분석 없음"이 뜨면 안 된다. 모든 소재에 대해 AI 분석(L1 태그), 임베딩(유사도), LP 풀 스크린샷, 동영상 원본이 저장되어 있어야 한다. 지금은 12~56%만 완료돼 있어서 대부분의 소재가 불완전하다.

## 현재 상태 (병목 4개)

| 항목 | 현재 | 목표 | 갭 |
|------|------|------|-----|
| 임베딩 3072 (이미지+텍스트) | 358건 (12%) | 3,096건 (100%) | 2,738건 |
| L1 태그 (creative_intelligence) | 358건 (12%) | 3,096건 (100%) | 2,738건 |
| LP 풀 스크린샷 | 908건 (56%) | 1,522건 (100%) | 614건 |
| 동영상 원본 Storage | 0건 (0%) | VIDEO 타입 전체 | 전부 |

## 원인 분석

### 1. 임베딩 12% — `embedMissingCreatives(50)` limit 50
- `embed-creatives` 크론: 하루 1회, 50건만 보충
- `collect-daily` 끝에도 50건만 보충
- Gemini Embedding API 무료, Vercel 크론 Pro 포함 → 비용 0

### 2. L1 태그 12% — creative-pipeline Railway 배치 미실행
- L1 태깅은 Railway creative-pipeline `/analyze` 엔드포인트
- 초기 358건 이후 추가 배치 안 돌림

### 3. LP 스크린샷 56% — Railway bscamp-crawler Playwright 크래시
- EAGAIN 에러로 chromium 실행 불가
- LP 텍스트 데이터는 fetch+cheerio 폴백으로 96% 복구했지만, 스크린샷은 Playwright 필수

### 4. 동영상 원본 0% — 저장 프로세스 없음
- 현재 썸네일만 Storage 저장
- Meta CDN 동영상 URL은 시간 지나면 만료 → 저장 안 하면 소실

## 구현 방향

### Phase 1: 크론 자동화 강화 (코드 수정)

**1-1. embed-creatives 크론 강화**
- `embedMissingCreatives` limit: 50 → 200
- vercel.json 스케줄: `0 22 * * *` (하루 1회) → `0 */2 * * *` (2시간마다)
- 예상: 200건 × 12회/일 = 2,400건/일 → **2일이면 따라잡음**
- Gemini API 무료 범위 확인 (일 100만 토큰 이내)

**1-2. L1 태깅 크론 신규 또는 확장**
- 방법 A: embed-creatives 크론에 L1 태깅도 포함 (Railway /analyze 호출)
- 방법 B: 별도 크론 `analyze-creatives` 신규 생성
- 2,738건 × Gemini 2.5 Pro 비용 확인 필요 → 비용 보고 후 진행

**1-3. crawl-lps 크론 LP 스크린샷 복구**
- Railway bscamp-crawler 크래시 원인 파악 + 재배포
- crawl-lps 크론은 이미 매시간 실행 중 (`0 */1 * * *`, limit 20)
- 크래시 복구되면 자동으로 614건 처리 (약 31시간)
- limit 20 → 50 올리면 13시간

**1-4. 동영상 원본 Storage 저장**
- persist-media-to-storage.mjs 확장: VIDEO 타입일 때 video_url도 다운로드+Storage 업로드
- 또는 collect-daily에서 수집 시점에 바로 Storage 저장 (CDN 만료 전)
- 크론 `persist-media` 신규 or 기존 embed-creatives에 포함

### Phase 2: 검증
- DB 쿼리로 각 항목 완성도 100% 확인
- 총가치각도기에서 랜덤 소재 10개 클릭 → "분석 없음" 0건 확인

## 우선순위 (병렬 가능)
1. **1-1 임베딩 크론 강화** — 코드 3줄 수정, 즉시 효과 (P0)
2. **1-3 LP 크롤러 복구** — Railway 재배포, 자동 복구 (P0)
3. **1-4 동영상 저장** — 신규 개발, CDN 만료 전 시급 (P0)
4. **1-2 L1 태깅 확장** — 비용 확인 후 진행 (P1)

## 완료 조건
- [ ] 임베딩 3072: 90%+ (비활성 소재 제외)
- [ ] L1 태그: 90%+
- [ ] LP 풀 스크린샷: 90%+
- [ ] 동영상 원본 Storage: VIDEO 타입 전량 저장
- [ ] 크론 자동화: 신규 소재 수집 시 자동으로 임베딩+태깅+스크린샷+동영상 저장
- [ ] tsc + build 통과, 커밋+푸시
