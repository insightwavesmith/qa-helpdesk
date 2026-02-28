# TASK-보안수정.md

> **Plan 인터뷰 활성 — 리스크 큰 작업이므로 질문하고 확인받기**
> **코드 수정 TASK — 서비스 안정성 최우선**
> **1건 수정 → 빌드 확인 → 다음 1건**

## 배경
보안 코드리뷰 보고서 기반 수정. Critical/High 이슈 우선.
보고서: /Users/smith/projects/mozzi-reports/public/reports/security/2026-02-28-security-audit.html

---

## T1. Supabase RLS 설정 (Critical)
**현재**: ad_accounts, daily_ad_insights, service_secrets, benchmarks, daily_overlap_insights 등 5개+ 테이블에 RLS 미설정. 인증된 사용자가 타인 데이터 접근 가능.
**목표**: 전체 테이블 RLS 활성화 + 정책 설정
**세부**:
- ad_accounts: user_id = auth.uid() 기반 SELECT/INSERT/UPDATE/DELETE
- daily_ad_insights: account_id가 본인 ad_accounts에 속하는지 확인
- service_secrets: user_id = auth.uid()
- benchmarks: SELECT는 전체 허용 (공용 벤치마크), INSERT/UPDATE는 service_role만
- daily_overlap_insights: account_id 기반 본인만
- daily_mixpanel_insights: account_id 기반 본인만
- knowledge_chunks: SELECT 전체 허용, INSERT/UPDATE/DELETE는 admin만
- questions: SELECT 전체, INSERT는 인증 사용자, UPDATE/DELETE는 본인+admin
- posts: SELECT 전체, INSERT/UPDATE/DELETE는 admin
- email_sends: admin만
- invite_codes: SELECT는 인증 사용자(가입 시 검증용), INSERT/UPDATE/DELETE는 admin
**파일**: SQL 마이그레이션 파일 생성 (supabase/migrations/)
**주의**: RLS 잘못 걸면 서비스 전체 먹통. 각 테이블 1개씩 설정 → 즉시 서비스 동작 확인

## T2. 하드코딩된 시크릿 제거 (Critical)
**현재**: 코드 내 하드코딩된 토큰/키 존재 (보고서 ENV-02 참조)
**목표**: 모든 시크릿을 환경변수로 이동
**주의**: 어떤 파일 어떤 라인인지 보고서 상세 확인 후 수정

## T3. 총가치각도기 비즈니스 로직 보호 (High)
**현재**: API 응답에 벤치마크 원본 수치 + 계산 과정이 그대로 노출. 개발자 도구 Network 탭으로 T3 점수 계산 방식, 벤치마크 기준값 전부 파악 가능.
**목표**: 클라이언트에 최소 정보만 전달
**세부**:
- /api/diagnose 응답에서 벤치마크 raw 수치 제거
- 클라이언트에는 결과만 전달: 지표값 + 판정(good/average/poor) + 점수
- 벤치마크 기준값(aboveAvg)은 서버에서만 비교, 클라이언트에 내려보내지 않음
- T3 점수 계산 로직은 이미 서버 — 유지
- 콘텐츠 탭 카드도 동일 적용
**주의**: 프론트엔드에서 벤치마크 수치를 직접 표시하는 UI가 있으면 서버에서 "기준 대비 %" 형태로 변환해서 내려주기

## T4. XSS 방지 (High)
**현재**: dangerouslySetInnerHTML 사용처에서 sanitize 미적용
**목표**: DOMPurify 등으로 sanitize 적용
**파일**: 보고서 API-07 상세 참조

## T5. Mixpanel 시크릿 암호화 (High)
**현재**: service_secrets 테이블에 시크릿키 평문 저장
**목표**: 서버 측 암호화 (AES-256 등) 후 저장, 사용 시 복호화
**세부**:
- 암호화 키는 환경변수 (ENCRYPTION_KEY)
- 조회 API 응답에서는 마스킹 (****) 유지

## T6. Rate Limiting (Medium)
**현재**: 로그인/이메일 발송 API에 rate limiting 없음
**목표**: 기본 rate limiting 적용
**세부**: Next.js middleware 또는 upstash/ratelimit 사용

---

## 실행 순서
1. T1 (RLS) — 테이블 1개씩, 각각 빌드+동작 확인
2. T2 (시크릿 제거)
3. T3 (각도기 보호) — 가장 중요, API 응답 구조 변경
4. T4 (XSS)
5. T5 (암호화)
6. T6 (Rate Limit)

## 리뷰 결과
- 리뷰 보고서: /Users/smith/projects/mozzi-reports/public/reports/security/2026-02-28-security-fix-review.html
- 리뷰 완료일: 2026-02-28
- T1 RLS: 4개 테이블 신규 + 2개 정책 보완 필요 (benchmarks/daily_mixpanel_insights 등 이미 설정 완료 확인)
- T2 시크릿: scripts/embed-all.mjs 하드코딩 JWT 발견
- T3 각도기: /api/diagnose 응답에 above_avg/average_avg 노출 확인
- T4 XSS: post-body.tsx dangerouslySetInnerHTML 무방비 확인
- T5 암호화: service_secrets 평문 저장 확인
- T6 Rate Limit: 공개 API rate limiting 미적용 확인

## 완료 기준
- 모든 테이블 RLS 활성화
- 하드코딩 시크릿 0건
- /api/diagnose 응답에 벤치마크 원본값 미포함
- 개발자 도구로 T3 계산 방식 역추적 불가
- XSS sanitize 적용
- 빌드 성공 + 기존 기능 정상 동작
