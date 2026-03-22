# TASK: P0-1 DB 스키마 v3 — SQL 적용 + 검증 완료까지

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
P0-1 코드는 이미 완성됨. SQL 파일 + 코드 변경 끝났지만 **DB에 적용 안 됨**.
지금부터 SQL 실행 → 검증 → 커밋 → 완료까지 끝내라.

## 참고 파일
- Plan: `docs/01-plan/features/p0-db-schema-v3.plan.md`
- SQL: `supabase/migrations/20260322_v3_schema_additions.sql`
- 실행 플랜: `docs/01-plan/features/architecture-v3-execution-plan.md` (T1)

## 해야 할 것

### STEP 1: SQL 실행
- [ ] `20260322_v3_schema_additions.sql`을 Supabase에 실행
- [ ] Supabase Management API (`$SUPABASE_ACCESS_TOKEN`) 사용 가능
- [ ] 또는 supabase CLI (`npx supabase db push`)

### STEP 2: DB 적용 확인
- [ ] creative_media에 saliency_url, is_active, updated_at 컬럼 존재 확인
- [ ] landing_pages에 content_hash, last_crawled_at 컬럼 존재 확인
- [ ] lp_analysis에 reference_based, data_based, eye_tracking 컬럼 존재 확인
- [ ] creative_lp_map에 message_alignment, cta_alignment, offer_alignment, overall_score, issues 컬럼 존재 확인
- [ ] competitor_ad_cache에 analysis_json 컬럼 존재 확인
- [ ] lp_click_data 테이블 생성 확인
- [ ] change_log 테이블 생성 확인
- [ ] creatives.source = 'member'로 변경 + CHECK 제약 확인

### STEP 3: 코드 동기화 확인
- [ ] `grep -r "bscamp" src/` — 'bscamp' 하드코딩 0건 확인 (전부 'member'로 변경됨)
- [ ] RPC 2개 (get_student_creative_summary 등) source='member' 확인
- [ ] `tsc --noEmit` 에러 0건
- [ ] `npm run build` 성공

### STEP 4: 커밋 + 푸시
- [ ] 변경사항 전부 커밋 (SQL + 코드 + 훅 + 스킬 + CLAUDE.md)
- [ ] git push

### STEP 5: 미완료 작업 마무리
- [ ] STEP 3(비디오 89건 다운로드) — 완료 or 스킵 판단
- [ ] STEP 4(이미지 2,709건 Storage 이동) — 완료 or 스킵 판단
- [ ] 완료 후 DEV-STATUS.md 업데이트

## 완료 조건
- DB SQL 적용됨
- 모든 신규 컬럼/테이블 존재
- source='member' 전환 완료 + 기존 쿼리 안 깨짐
- tsc + build 통과
- git push 완료
- DEV-STATUS.md 최신화

## 완료되면
슬랙으로 결과 보고 (notify-openclaw.sh가 자동 전송)
