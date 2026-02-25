# TASK-통합.md — 총가치각도기 UI/UX 완전 반영 + UX 버그 + 타겟중복

> 작성: 모찌 | 2026-02-25
> **반드시 아래 문서를 전부 읽고 시작할 것. 읽지 않고 "이미 구현됨" 판단 금지.**

---

## 필수 참고 문서 (로컬 파일 — 반드시 읽어)

| 문서 | 경로 | 역할 |
|------|------|------|
| 통합 기획서 | `docs/design/protractor-integrated-plan.html` | 서비스 전체 설계 (구조, 데이터흐름, 수강생↔총가치각도기 연결) |
| UI 목업 | `docs/design/protractor-ui-mockup.html` | **현재 화면이 이 목업과 완전히 일치해야 함** |
| 타겟중복 분석 | `docs/design/overlap-analysis.html` | 타겟중복율 실제 API 테스트 결과 + 설계 |
| 타겟중복 코드리뷰 | `docs/design/overlap-code-review.html` | 타겟중복 기존 코드 분석 |
| 기존 GCP 원본 | `/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/cluade_code/meta-ads-benchmark/dynamic.html` | 원래 서비스 UI 참고 |

---

## 개요

총가치각도기의 UI/UX가 기획서·목업과 완전히 다름. 목업 HTML을 기준으로 pixel-level 맞춤 + UX 버그 수정 + 타겟중복 탭 UI 개선을 한번에 진행.

**핵심 원칙: 목업 HTML의 CSS/레이아웃/구조를 그대로 React 컴포넌트로 옮긴다.**

---

## Part A. 총가치각도기 UI — 목업 완전 반영

### A1. 각도기(프로트랙터) 반원형 게이지 — 신규

- **현재**: 없음 (등급 원형만 있음)
- **목업**: 반원형 SVG 게이지 (F~A+ 컬러 세그먼트 + 바늘 + 등급 텍스트)
- 목업 HTML의 `.gauge-section` + `.protractor` SVG 코드 그대로 가져와서 React 컴포넌트화
- `TotalValueGauge.tsx`를 목업 기준으로 완전 리라이트
- 등급(A~F)에 따라 바늘 각도 변경
- 하단 설명 텍스트: "전체적으로 양호하나, 전환율 개선이 필요합니다" 등

### A2. 진단 3컬럼 — 목업 디테일 맞춤

- **현재**: 3컬럼 있으나 p50/p75 수치 없음, 컬러 dot 없음
- **목업**: 각 지표마다 값 + `p50 28.00 / p75 35.00` + 컬러 dot(🟢🟡🔴)
- `DiagnosticPanel.tsx`를 목업 CSS 기준으로 수정
- 파트 헤더에 배지 (🟢 우수 / 🟡 보통 / 🔴 미달)

### A3. TOP 5 광고 보기 버튼

- **현재**: 없음
- **목업**: 파란 테두리 큰 버튼 "TOP 5 광고 자세히 보기 →"
- 클릭 시 하단 TOP 5 광고 테이블로 스크롤 또는 확장

### A4. 광고계정 연결 배너 — 목업 스타일

- **현재**: 파란 박스
- **목업**: 녹색 그라데이션 배너 + 🔗 아이콘
- `.connect-banner` CSS 그대로 반영

### A5. KPI 카드 + 레이아웃 순서

- 목업 순서: 상단 네비 → 연결 배너 → KPI 카드 → **각도기 게이지** → 진단 3컬럼 → 차트 → TOP 5 버튼 → 일별 테이블
- 현재 순서와 다르면 목업 순서대로 재배치

### A6. 수강생 ↔ 총가치각도기 연결 체크

- 수강생 가입 → 온보딩(광고계정 입력) → 총가치각도기에서 해당 계정 데이터 표시
- 이 흐름이 끊어져 있으면 연결 수정
- `profiles.ad_account_id` → `ad_accounts.account_id` → Meta API 호출 → daily_ad_insights 수집 → 대시보드 표시

---

## Part B. UX 버그 수정

### B1. 관리자 수강생 탭 — 믹스패널ID/광고계정/대시보드ID 수정 가능하게

- 현재: 읽기 전용
- 변경: 인라인 편집 또는 수정 모달
- 필드: 믹스패널 프로젝트 ID, 믹스패널 대시보드 ID, 광고계정 ID

### B2. 수강생 온보딩 — 로그인으로 돌아가기 버튼

- 현재: 뒤로가기 방법 없음
- 추가: "로그인으로 돌아가기" 버튼 (로그아웃 + 로그인 페이지 이동)

### B3. 수강생 설정창 — 믹스패널/광고계정/대시보드ID 재입력

- 현재: 온보딩 이후 수정 불가
- 변경: 설정 페이지에서 수정 가능 (없으면 신규 생성)
- 필드: 믹스패널 프로젝트 ID, 믹스패널 대시보드 ID, 광고계정 ID

### B4. 믹스패널 대시보드 ID 입력 필드 추가

- DB: `profiles` 테이블에 `mixpanel_board_id` 컬럼 추가 (없으면)
- 온보딩 + 설정 + 관리자 화면 모두에 입력란 추가
- 총가치각도기 TOP 5 광고의 "믹스패널" 버튼: `https://mixpanel.com/project/{project_id}/view/{board_id}` 링크

### B5. 초대코드 만료일 기능 동작 안 함

- 현재: 만료일 지나도 코드 사용 가능
- 수정: 회원가입 시 만료일 검증 + `useInviteCode()` 호출하여 used_count 증가

---

## Part C. 타겟중복 탭 UI

- "성과 요약" / "타겟중복" 탭 전환
- 목업 참고: `docs/design/protractor-ui-mockup.html` 하단 타겟중복 섹션
- 설계 참고: `docs/design/overlap-analysis.html`
- 전체 중복률 히어로 카드 + 60% 이상 위험 경고
- 캠페인명/세트명 그대로 표시
- 아코디언 없이 항상 펼침

---

## 실행 순서

1. **먼저** docs/design/ 문서 4개 전부 읽기
2. Part A (목업 반영) → Part B (UX 버그) → Part C (타겟중복)
3. 빌드 확인 + 커밋 + 푸시

---

## 리뷰 결과

(리뷰 후 작성)
