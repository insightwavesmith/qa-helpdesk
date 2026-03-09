# TASK-버그픽스4.md — 리빌드 QA 버그 + 탭 초기화

> 작성: 모찌 | 2026-02-26
> 우선순위: 긴급 (보안 이슈 포함)
> 참고: docs/design/protractor-ui-mockup.html (목업)

---

## T1. 🔴 보안: 설정 페이지 믹스패널 자격증명 pre-fill 노출

### 현재
- `/settings` 페이지의 광고계정 추가 폼에서 믹스패널 보드ID와 시크릿키 입력필드에 하드코딩된 기본값이 pre-fill로 노출됨
- 모든 계정(관리자/수강생)에서 동일하게 보임
- 노출 값: `walter.kim666@gmail.com` / `!!132455aa`

### 목업
- 빈 입력필드 (placeholder만 표시)

### 변경
1. `src/app/(main)/settings/settings-form.tsx`에서 추가 폼의 초기값을 빈 문자열로 설정
2. placeholder는 "믹스패널 프로젝트 ID" / "믹스패널 보드 ID" / "믹스패널 시크릿키" 안내 텍스트만
3. 하드코딩된 기본값이 있다면 완전 제거

---

## T2. 🔴 "어제" 단일 날짜 게이지 데이터 로딩 실패

### 현재
- 기간을 "어제"로 선택하면 게이지 영역에 "데이터를 불러올 수 없습니다" 표시
- 하단 4개 기본 카드(광고비/클릭/구매/ROAS)는 정상 표시됨
- "7일"로 선택하면 게이지 정상 렌더링

### 목업
- 어제 데이터도 정상 표시되어야 함

### 변경
1. `/api/protractor/total-value` API가 단일 날짜(start=end) 요청 시 왜 실패하는지 확인
2. daily_ad_insights에 2026-02-25 데이터가 있는지 확인 (collect-daily로 1,401건 수집됨)
3. API의 날짜 필터링 로직 수정 — start=end일 때도 정상 반환
4. 벤치마크 비교 로직에서 단일 날짜도 처리 가능하게

---

## T3. 🟡 반원형 SVG 게이지 → 원형 글자 배지로 변경됨

### 현재
- 게이지가 `D` 글자 + 원형 배지 형태로 렌더링
- 목업의 반원형 SVG 게이지(0~100점, 색상 그라데이션)와 다름

### 목업 (`docs/design/protractor-ui-mockup.html`)
- 반원형(180도) SVG 게이지
- 0~100 숫자 점수
- 등급별 색상 구간 (빨강~초록)
- 바늘로 현재 점수 표시

### 변경
1. `src/components/protractor/TotalValueGauge.tsx` 확인
2. 목업의 반원형 SVG 게이지 코드가 이전 커밋(`af29fbd`)에서 구현됨
3. 리빌드 커밋(`2fb36da`)에서 원형 배지로 교체된 것으로 추정
4. 목업 기준 반원형 SVG 게이지로 복원 — `docs/design/protractor-ui-mockup.html`의 게이지 HTML/CSS 참고
5. 점수(0~100) + 등급(S/A/B/C/D/F) + 색상 구간 표시

---

## T4. 🟡 일별 데이터 테이블 미구현

### 현재
- 총가치각도기 페이지에 일별 데이터 테이블이 없음
- 이전에 `DailyMetricsTable` 컴포넌트가 있었으나 리빌드에서 빠진 것으로 추정

### 목업
- 날짜별 주요 지표 테이블 (광고비, 클릭, CTR, 구매, ROAS 등)

### 변경
1. `real-dashboard.tsx`에서 `DailyMetricsTable` import 및 렌더링 확인
2. 없으면 추가 — 기존 컴포넌트 재사용
3. 위치: TOP5 광고 아래, 페이지 하단

---

## T5. 🟡 기존 광고계정 믹스패널 편집 UI

### 현재
- 설정 페이지에서 광고계정 추가/삭제는 가능
- 기존 계정의 믹스패널 프로젝트ID/보드ID/시크릿키 수정 UI 없음

### 목업
- 각 계정에 편집 버튼 → 믹스패널 정보 수정 가능

### 변경
1. `settings-form.tsx`에서 기존 계정 목록의 각 항목에 "편집" 버튼 추가
2. 클릭 시 인라인 편집 또는 모달로 믹스패널 정보 수정
3. 저장 시 `ad_accounts` + `service_secrets` 업데이트

---

## T6. 🟡 탭 초기화(뒤로가기 로딩) 버그

### 현재
- 관리자 콘텐츠 관리에서 큐레이션→컨텐츠→정보공유 탭 이동 후 뒤로가기 누르면 탭이 초기화되면서 다시 로딩
- URL에 탭 상태가 저장되지 않아 발생

### 변경
1. 콘텐츠 관리 페이지에서 탭 상태를 URL searchParams에 저장 (`?tab=curation` / `?tab=content` / `?tab=posts`)
2. 페이지 진입 시 searchParams에서 탭 복원
3. 탭 전환 시 `router.push` 또는 `router.replace`로 URL 업데이트
4. 뒤로가기 시 이전 탭 상태 유지

---

## 완료 기준

- [ ] T1: 설정 페이지 추가 폼 빈 상태, 하드코딩 값 제거
- [ ] T2: "어제" 기간 게이지 정상 렌더링
- [ ] T3: 반원형 SVG 게이지 목업대로 복원
- [ ] T4: 일별 데이터 테이블 페이지에 표시
- [ ] T5: 기존 계정 믹스패널 편집 UI
- [ ] T6: 뒤로가기 시 탭 상태 유지
- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS

## 리뷰 결과

> 리뷰: 에이전트팀 (Opus 4.6) | 2026-02-26
> 리뷰 보고서: https://mozzi-reports.vercel.app/reports/reviews/2026-02-26-bugfix4-review.md

| Task | 정확도 | 난이도 | 주요 피드백 |
|------|--------|--------|------------|
| T1 | 부분 불일치 | 낮 | 하드코딩 아닌 브라우저 autofill 의심 → autoComplete="off" 적용 |
| T2 | 일치 | 중 | insights 가드가 API 호출 차단 + 데이터 존재 확인 선행 |
| T3 | 일치 | 높 | API에 score 필드 추가 필요 + SVG 공수 큼 |
| T4 | 일치 | 낮 | import 추가만, 기존 컴포넌트 재사용 |
| T5 | 일치 | 중 | 시크릿키 마스킹 + updateAdAccount 서버액션 추가 |
| T6 | 일치 | 낮 | 기존 패턴 복사, router.replace 권장 |

권장 순서: T1 → T2 → T6 → T4 → T5 → T3

## 리뷰 보고서

T1 수정: "하드코딩 제거" → "autoComplete=off 적용"으로 변경
T2 추가: insights 가드 조건 수정 + 폴백 전략 결정 필요
T5 추가: 시크릿키 마스킹 패턴 ("●●●●●●", 빈칸=변경없음)
T6 추가: router.replace 사용 + Suspense 래핑

---

## 금지 사항
- 목업에 있는 UI 요소 생략/변경 금지
- DB 마이그레이션 없음
- 다크모드 고려 불필요
