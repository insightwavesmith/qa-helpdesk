# TASK-QA버그픽스.md — 총가치각도기 v2 QA FAIL 수정

> 작성: 모찌 | 2026-02-27
> QA 결과 기반 버그 수정 (브라우저 QA 4건 FAIL)
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 4e16647

---

## 타입
버그수정

## 목표
브라우저 QA에서 발견된 FAIL 4건 수정

---

## T1. 타겟중복 탭 누락 (Critical)

**현재:** 성과요약 / 콘텐츠 / 벤치마크관리 — 3개 탭만 존재
**변경:** 성과요약 / 타겟중복 / 콘텐츠 / 벤치마크관리 — 4개 탭

수정 파일:
- `src/app/(main)/protractor/real-dashboard.tsx` — 탭 목록에 "타겟중복" 추가
- 기존 `src/components/protractor/OverlapAnalysis.tsx` 컴포넌트를 타겟중복 탭에 연결
- 탭 순서: 성과요약 → 타겟중복 → 콘텐츠 → 벤치마크관리

**검증:** /protractor 접근 시 4개 탭 모두 표시, 타겟중복 탭 클릭 시 OverlapAnalysis 렌더링

---

## T2. 수강생 벤치마크 관리 탭 숨김 (Critical)

**현재:** 수강생(student@test.com)에게도 "벤치마크 관리" 탭이 보임
**변경:** 관리자(admin)에게만 벤치마크 관리 탭 표시

수정 파일:
- `src/app/(main)/protractor/real-dashboard.tsx` — 탭 렌더링 시 사용자 role 체크
- `src/app/(main)/protractor/page.tsx` — isAdmin prop 전달 (profiles.role === 'admin')

**검증:**
- 관리자 로그인 → /protractor → 벤치마크 관리 탭 보임
- 수강생 로그인 → /protractor → 벤치마크 관리 탭 안 보임

---

## T3. 콘텐츠 탭 빈 상태 문구 수정 (Minor)

**현재:** "데이터가 없습니다"
**변경:** "벤치마크 데이터 없음" (TASK.md 스펙과 일치시키기)

수정 파일:
- `src/app/(main)/protractor/components/content-ranking.tsx` — 빈 상태 문구 변경

**검증:** 콘텐츠 탭에서 데이터 없을 때 "벤치마크 데이터 없음" 표시

---

## T4. 성과요약 탭 벤치마크 없을 때 빈 상태 처리 (Important)

**현재:** benchmarks 테이블 데이터 없으면 Meta API 오류로 표시됨
**변경:** 벤치마크 데이터 없으면 "벤치마크 데이터 없음. 벤치마크 관리 탭에서 수집하세요." 안내 + T3 점수는 기본 50점 표시

수정 파일:
- `src/app/api/protractor/total-value/route.ts` 또는 `src/app/api/diagnose/route.ts` — benchmarks 조회 결과 빈 경우 graceful 처리
- 프론트엔드 해당 컴포넌트 — 빈 벤치마크 시 안내 문구

**검증:**
- benchmarks 테이블 비어있을 때 → 오류 대신 안내 메시지
- benchmarks 데이터 있을 때 → 정상 진단 표시

---

## 리뷰 결과

(에이전트팀 리뷰 후 작성)

## 리뷰 보고서

(에이전트팀 리뷰 후 작성)

---

## 완료 기준
- [ ] T1: 4개 탭 모두 표시 + 타겟중복 탭 동작
- [ ] T2: 수강생에게 벤치마크 관리 탭 미노출
- [ ] T3: 콘텐츠 탭 빈 상태 문구 "벤치마크 데이터 없음"
- [ ] T4: 벤치마크 없을 때 안내 메시지 (오류 아닌 안내)
- [ ] npm run build 성공
- [ ] tsc --noEmit 0에러
