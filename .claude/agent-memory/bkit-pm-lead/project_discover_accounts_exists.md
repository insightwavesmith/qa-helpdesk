---
name: discover-accounts 크론 이미 구현됨
description: collection-v3에서 구현된 discover-accounts가 /me/adaccounts로 전체 계정 발견하지만, 실제 동작 여부 미확인 (DB에 45개만 있음)
type: project
---

discover-accounts 크론(`src/app/api/cron/discover-accounts/route.ts`)이 이미 collection-v3에서 구현됨.
- `/me/adaccounts` → 90일 impressions 체크 → ad_accounts UPSERT (is_member=false)
- 주 1회 월요일 실행 예정

**Why:** BM-Full-Account-Sync TASK에서 "새 크론 추가" 대신 기존 크론 점검이 우선이라는 것을 발견. ad_accounts에 45개밖에 없는 이유가 discover-accounts 미동작 때문인지 확인 필요.

**How to apply:** 새 기능으로 크론을 만드는 것이 아니라, 기존 discover-accounts가 왜 150개를 못 채웠는지 진단부터 시작해야 함. Cloud Scheduler 등록 여부, cron_runs 로그, /me/adaccounts 토큰 권한 확인.
