# TASK-QA수정6.md — QA 결과 기반 총가치각도기 최종 수정

> 작성: 모찌 | 2026-02-27 17:40
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 9304b34
> 브라우저 QA 결과 기반 (2026-02-27 17:35)

---

## 타입
버그 수정

## 목표
1. 콘텐츠 탭 진단 데이터 정상 표시
2. collect-daily에서 ad_id/ad_name 정상 저장
3. 레거시 필드 완전 제거
4. 콘텐츠 어제 기간 API 에러 수정

## 제약
- daily_ad_insights 테이블 구조 변경 금지
- npm run build 성공 필수

---

## T1. collect-daily에서 ad_id/ad_name이 NULL로 저장되는 버그 (Critical)

**파일:** `src/app/api/cron/collect-daily/route.ts`

**현재 문제:**
DB 확인: `daily_ad_insights`의 `ad_id`, `ad_name`이 전부 NULL (255건)
코드: `ad.id ?? null`, `ad.name ?? null` (261~262줄)

**원인 추정:**
Meta `/ads` 엔드포인트 응답에서 `ad.id`/`ad.name`이 최상위가 아닌 다른 경로에 있을 수 있음
- `/ads` 응답 구조: `{ data: [{ id, name, insights: { data: [...] }, ... }] }`
- `ad.id`가 있어야 하는데 NULL이면 응답 구조가 다르거나, `fields`에 `id,name`이 반영 안 되는 것

**확인 사항:**
1. Meta API 응답에서 `ad.id`/`ad.name` 실제 존재 여부 — console.log 추가해서 확인
2. 응답 구조가 `{ data: [{ id: "123", name: "광고명", ... }] }` 형태인지
3. `account_name`이 뜬다면 → 계정 정보가 DB에서 오는 것, `ad.id`는 API 응답에서 와야 함

**수정 방향:**
- Meta API 응답 구조에 맞게 `ad_id`, `ad_name` 매핑 수정
- GCP 원본 `collect_benchmarks.py` 참고: `ad.get("ad_id") or ad.get("id")` 패턴
- 수정 후 `ad_id`/`ad_name`이 정상 저장 되면 `getTop5Ads()`에서 #1~#5 정상 표시됨

---

## T2. 콘텐츠 진단 데이터 없음 — diagnose API 디버깅

**파일:** `src/app/api/diagnose/route.ts`, `src/app/(main)/protractor/components/content-ranking.tsx`

**현재:** 콘텐츠 카드에 "진단 데이터 없음" 표시

**원인 추정:**
1. diagnose API가 광고별로 벤치마크 비교 → ad_id가 NULL이면 진단 불가
2. 또는 diagnose API 호출 시 에러 발생

**확인 사항:**
- content-ranking.tsx에서 diagnose API 호출 코드 확인 (543줄)
- ad_id가 NULL인 광고를 diagnose 요청에 보내면 어떻게 되는지
- benchmarks 테이블에 ABOVE_AVERAGE 데이터 있음 (6행) → 벤치마크 자체는 존재

**수정:** C1 수정 후 ad_id 정상이면 자동 해결 가능. 그래도 ad_id NULL일 때 fallback 처리 필요.

---

## T3. 콘텐츠 탭 "어제" 기간 API 에러

**파일:** `src/app/(main)/protractor/components/content-ranking.tsx`

**현재:** "Unexpected token '<', '<!DOCTYPE ...'" — diagnose API가 HTML 반환

**원인:** C1과 동일 근본 원인이거나, NEXT_PUBLIC_SITE_URL 관련 내부 fetch 문제
- 또는 diagnose API POST 요청이 인증 없이 호출되어 로그인 페이지 HTML 반환

**수정:** 
- content-ranking.tsx에서 fetch("/api/diagnose") 호출 시 credentials: "include" 확인
- 에러 시 JSON 파싱 전 response.ok 체크 + content-type 확인
- HTML 반환 시 적절한 에러 메시지 표시 ("진단 서비스 오류" 등)

---

## T4. 레거시 필드 미제거 — member-detail-modal

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 277줄 부근에 "메타 광고계정 ID" 필드 + 믹스패널 프로젝트/보드/시크릿키 필드가 여전히 존재

**변경:**
- 277~310줄 부근의 레거시 필드 섹션 전체 제거:
  - "메타 광고계정 ID" input
  - "믹스패널 프로젝트 ID" input
  - "믹스패널 보드 ID" input
  - "믹스패널 시크릿키" input
- 하단 "배정된 광고계정" 섹션만 유지 (여기서 수정 가능)
- 제거 전 이 필드들의 state 변수가 다른 곳에서 사용되는지 확인 → 사용 안 하면 state도 제거

---

## T5. OverlapAnalysis 내부 7일 제한 제거 확인

**파일:** `src/components/protractor/OverlapAnalysis.tsx`, `src/app/api/protractor/overlap/route.ts`

**현재:** 이전 수정에서 제거했어야 하는데 QA에서 여전히 "7일 이상 선택" 메시지 표시

**확인:**
- OverlapAnalysis.tsx에서 `daysBetween < 7` 조건 존재 여부
- overlap/route.ts에서 `daysBetween < 7` 조건 존재 여부
- 두 곳 다 제거

**수정:** 1일부터 분석 실행. 데이터 부족 시 "데이터 부족" 안내 (에러가 아닌 안내)

---

## 참고: GCP 원본 ad 필드 매핑

```python
# collect_benchmarks.py (GCP 원본)
"ad_id": ad.get("ad_id") or ad.get("id"),
"ad_name": ad.get("ad_name") or ad.get("name"),
```

Meta API 응답에서 `/act_{id}/ads` 호출 시 각 ad 객체의 `id`가 광고 ID.
`/act_{id}/insights` 호출 시는 `ad_id` 필드로 옴.

---

## 리뷰 결과
- 2026-02-27 브라우저 QA 기반 버그 리포트. 5건 모두 코드 확인 완료.
- T1: ad_id/ad_name GCP fallback 패턴 적용
- T2: diagMap null ad_id 가드 + diagnose route null 스킵
- T3: fetch credentials + res.ok 체크 + JSON 파싱 안전 래핑
- T4: 레거시 state/input/handler 제거
- T5: 미사용 daysBetween 함수 삭제

## 완료 기준
- [ ] C1: ad_id/ad_name NULL → 정상값 저장 (collect-daily 수정)
- [ ] C2: 콘텐츠 카드 3파트 진단 + 벤치마크 비교 정상 표시
- [ ] C3: 콘텐츠 어제 기간 API 에러 해결
- [ ] C4: 레거시 필드 완전 제거
- [ ] C5: 타겟중복 7일 제한 완전 제거
- [ ] npm run build 성공
