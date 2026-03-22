# TASK: collect-daily 배치 분할 (긴급)

## 문제
collect-daily가 40개 계정을 순차 처리 → Vercel 5분 타임아웃 초과 → 3일째 데이터 수집 실패
- 3/19: 4개 계정만 수집됨 (36개 누락)
- 3/18: 20개만 수집 (20개 누락)
- insights_aggregated_daily 집계도 3/17에서 멈춤

## 기대 동작
40개 계정이 5분 제한 안에서 **전부** 수집 완료되어야 함. 계정이 더 늘어나도 자동으로 대응.

## 해결 방향
collect-daily 크론 1개를 **배치 4개**로 분할.

### 구체 요구사항

1. **새 크론 엔드포인트 4개** 생성:
   - `/api/cron/collect-daily-1` → 계정 1~10
   - `/api/cron/collect-daily-2` → 계정 11~20
   - `/api/cron/collect-daily-3` → 계정 21~30
   - `/api/cron/collect-daily-4` → 계정 31~40+

2. **배치 분할 방식**:
   - `ad_accounts` 테이블에서 `active=true`인 계정을 `created_at` 순으로 정렬
   - `batch` 쿼리 파라미터(1~4)로 오프셋 결정: `offset = (batch-1)*10, limit = 10`
   - batch 4는 나머지 전부 처리 (40개 초과 대비)

3. **기존 로직 재사용**:
   - `runCollectDaily` 함수에 `batch` 파라미터 추가
   - 계정 조회 시 offset/limit 적용
   - 나머지 로직(Meta API, upsert, embedMissingCreatives, precompute 등) 그대로

4. **vercel.json 크론 스케줄**:
   ```
   collect-daily-1: "0 18 * * *"     (03:00 KST)
   collect-daily-2: "5 18 * * *"     (03:05 KST)
   collect-daily-3: "10 18 * * *"    (03:10 KST)
   collect-daily-4: "15 18 * * *"    (03:15 KST)
   ```

5. **기존 `/api/cron/collect-daily` 유지**:
   - 수동 호출용으로 남겨둠 (전체 계정 처리)
   - vercel.json 크론에서는 제거

6. **중복 실행 방지**:
   - embedMissingCreatives, precompute, creative pipeline 호출은 **batch 4에서만** 실행
   - batch 1~3은 Meta 수집 + DB 저장만

7. **cron_runs 로깅**:
   - 각 배치별로 별도 cron_name: `collect-daily-1`, `collect-daily-2` 등

## 제약
- 기존 `runCollectDaily` 함수 시그니처 최소 변경
- 다른 크론은 건드리지 마
- 빌드(tsc + next build) 통과 필수
- 커밋 + push

## 참고 파일
- `src/app/api/cron/collect-daily/route.ts` — 현재 코드
- `vercel.json` — 크론 스케줄
