---
team: unassigned
created: 2026-03-28
status: pending
owner: leader
---
# TASK: 수집 갭 해소 — 미수집 계정 + 미분석 소재/LP 배치

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
Phase 1 코드 구현은 거의 완료됐는데, 실제 데이터 수집/분석에 갭이 크다.

## 현재 숫자 (2026-03-23 11:00 기준)
- 계정: 42개 등록, **23개만 성과 수집됨** → 19개 미수집
- 소재: 3,022건 중 **2,526건 미분석** (5축)
- LP: 216건 중 **132건 미분석**
- 소재 storage 없는 것: 83건
- 소재 미임베딩: 105건
- 글로우빈/프로이덴: 3/19에서 수집 멈춤

## TASK 1: 미수집 19개 계정 원인 파악
1. `ad_accounts` 테이블에서 active=true인데 `daily_ad_insights`에 데이터 없는 계정 목록 추출
2. 각 계정의 `meta_ad_account_id`로 Meta API 접근 가능한지 확인
3. 원인 분류: (a) Meta 권한 없음 (b) 광고 안 돌리는 중 (c) collect-daily 버그
4. (c)면 코드 수정, (a)면 목록 정리해서 보고

## TASK 2: 미분석 소재 2,526건 배치 분석
1. `analyze-five-axis.mjs`로 미분석 소재 배치 실행
2. 이미지는 빠름 (건당 $0.003), 영상은 느림 (건당 $0.015)
3. GCP Cloud Run Job `bscamp-analyze-five-axis` 트리거하거나 로컬 배치 실행
4. 진행률 로그 남기기

## TASK 3: LP 미분석 132건 배치 분석
1. `job-analyze-lps` Cloud Run Job 트리거
2. 또는 로컬에서 `analyze-lps-v2.mjs` 배치 실행
3. LP saliency(DeepGaze)도 미분석분 있으면 같이 돌리기

## TASK 4: LP 미디어 다운로드 (신규)
1. `.claude/tasks/TASK-LP-MEDIA-DOWNLOAD.md` 참고
2. crawl-lps에 미디어(GIF/이미지/영상) 다운로드 기능 추가
3. HTML 파싱 → 미디어 URL 추출 → Storage 저장

## TASK 5: 나머지 갭
1. storage 없는 소재 83건 → download-missing-media.mjs 실행
2. 미임베딩 105건 → embed-creatives 배치
3. 글로우빈/프로이덴 수집 멈춤 원인 확인

## 우선순위
TASK 1 (원인파악) → TASK 2 (5축 배치) → TASK 3 (LP 배치) → TASK 4 (LP 미디어) → TASK 5 (나머지)

## 계정 종속 체크
- [x] 전부 account_id 기준으로 동작
