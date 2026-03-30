# SESSION-STATE — 마지막 업데이트: 2026-03-30

## 최근 완료 작업 (이번 세션)

| # | 작업 | 커밋 | 상태 |
|---|------|------|------|
| 1 | Video Pipeline Dedup Fix (영상 파이프라인 중복제거 수정) | `6f93d63` | 완료, main push |
| 2 | BM Full Account Sync (BM 전체 계정 동기화) | `816216d` | 완료, main push |
| 3 | QA탭 image_urls JSON.stringify 버그 수정 | `a996443` | 완료, main push |

## 주요 변경 요약

### Video Pipeline Dedup Fix (`6f93d63`, 26파일, +3316/-96줄)
- video-saliency 251건 무한반복 제거 (pre-sync)
- embed chain 끊김 복구 (`dedup > 0` 조건 추가)
- 49건 비디오 소스URL 누락 → 개별 fallback API 추가
- L1 hook 파이프라인 정리
- TDD 64건 Green, Match Rate 97%

### BM Full Account Sync (`816216d`, 14파일, +1150/-46줄)
- collect-daily: 고정 4배치 → DYNAMIC_BATCH_SIZE=20 동적 배치
- collect-daily: `is_member: true` 하드코딩 → isMemberMap 동적 조회
- discover-accounts: 순수함수 3개 export (TDD용)
- TDD 18건 Green, Match Rate 92%
- 수동 실행 완료: discover-accounts (154개 중 90개 활성 동기화) + collect-daily (90개 계정 수집)

### QA탭 버그 수정 (`a996443`, 2파일, +9/-13줄)
- `image_urls` JSONB 컬럼에 `JSON.stringify()` 이중 인코딩 → 배열 직접 전달
- questions.ts 2곳 + answers.ts 3곳 = 5곳 수정

## 미완료 / 남은 작업

| 작업 | 상태 | 비고 |
|------|------|------|
| Cloud Scheduler에 discover-accounts 등록 | 미완료 | 인프라 작업 (GCP 콘솔), 코드는 준비됨 |
| 권한 에러 3계정 28건 비디오 | 대기 | Smith님 권한 부여 완료, 다음 process-media 실행 시 해소 예상 |
| 영상 파이프라인 실제 DB 수치 확인 | 미확인 | Supabase SQL 에디터에서 조회 필요 |

## 배포 환경 메모
- 호스팅: Cloud Run (Vercel 사용 안 함)
- Cloud Run URL: `bscamp-cron-906295665279.asia-northeast3.run.app`
- 사이트: `bscamp.app`
- Cron 인증: `Authorization: Bearer {CRON_SECRET}`

## 파이프라인 체인 상태
```
collect-daily → process-media → embed-creatives + creative-saliency + video-saliency (병렬)
```
- 전 단계 정상 동작 확인 (2026-03-30)
- fire-and-forget 방식 (pipeline-chain.ts, 2초 abort)

## 계정 현황
- Meta BM 전체 계정: 154개
- 활성 계정 (DB 동기화): 90개
- 비활성 스킵: 64개 (UNSETTLED/CLOSED)
