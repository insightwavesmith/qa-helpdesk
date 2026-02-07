# TASK: UI/UX 전면 QA + 수정

> 우선순위: Critical
> 목표: 모든 페이지를 검수하고, 발견한 문제를 즉시 수정한다.
> 디자인 기준: Primary #F75D5D, hover #E54949, white bg, Pretendard 폰트, Triple Whale 심미성

## 프로젝트 구조
- Next.js 14 App Router
- Supabase (auth + DB)
- Tailwind CSS + shadcn/ui
- 한국어 UI only, 라이트 모드 only

## 수정 필수 사항 (Critical → Major → Minor 순서)

### Critical

#### C1. 대시보드 더미 데이터 제거 (/dashboard)
- `src/app/(main)/dashboard/page.tsx` 확인
- **채널별 성과** 섹션: Google Ads, Naver Ads, Kakao Ads 하드코딩 → 제거
- **캠페인 성과** 테이블: 하드코딩된 더미 캠페인 → 제거
- 데이터 없으면 깔끔한 Empty State로 대체
  - 아이콘 + "광고 데이터가 연동되면 성과를 확인할 수 있습니다" 메시지

#### C2. 대시보드 상단 카드 빈값 처리 (/dashboard)
- ROAS, 총 매출, 광고비, CTR, CPC 카드가 전부 "—" + "0% vs last period"
- 데이터 없을 때 → "—" 대신 "데이터 없음" 또는 카드 자체를 숨기기
- "vs last period" 비교값이 0%면 비교 텍스트 숨기기
- **차트도 동일**: 데이터 없으면 빈 그래프 대신 Empty State

#### C3. 대시보드 레이아웃 — 데이터 없을 때 전체적으로 자연스럽게
- 현재: 빈 카드 + 빈 차트 + 더미 데이터 = 혼란스러움
- 목표: 데이터 없는 상태에서도 "곧 데이터가 채워질 예정" 느낌의 깔끔한 페이지

### Major

#### M1. 통계 페이지 0값 수정 (/admin/stats)
- 모든 통계가 0으로 표시됨 (실제 DB에 질문 1개, 회원 3명 있음)
- `src/app/(main)/admin/stats/page.tsx` 확인
- Supabase 쿼리가 실제 데이터를 가져오는지 확인 + 수정
- profiles 테이블, questions 테이블, answers 테이블, posts 테이블 카운트

#### M2. 설정 페이지 프로필 미표시 (/settings)
- `src/app/(main)/settings/page.tsx` 확인
- 현재 로그인 유저의 profiles 데이터를 폼에 채워야 함
- 이름, 전화번호, 쇼핑몰 이름, 쇼핑몰 URL → DB에서 읽어서 defaultValue로

#### M3. 상단 날짜 필터 정리
- 헤더에 "2025.01.01 - 2025.01.31 | 최근 30일" 필터가 모든 페이지에 보임
- 이 필터가 실제 기능하는 페이지: dashboard, protractor
- 나머지 페이지에서는 보이지 않거나, 비활성 상태로 표시

### UX/디자인 점검 (수정 중 발견하면 같이 처리)

#### D1. 색상 일관성 점검
- Primary: #F75D5D (rgb 247,93,93)
- Hover: #E54949
- 사이드바 active 배경: primary/10 (연한 코랄)
- 버튼: primary 배경 + white 텍스트
- 뱃지 색상이 의미에 맞는지 확인 (리드=노랑, 멤버=초록, 관리자=빨강 등)

#### D2. 여백/간격 일관성
- 페이지 padding, 카드 간격, 섹션 간격이 페이지마다 다른지 확인
- 통일 기준: 페이지 p-6, 카드 gap-6, 섹션 gap-8

#### D3. 폰트 일관성
- Pretendard 적용 확인
- 제목: text-2xl font-bold
- 부제: text-muted-foreground
- 본문: text-sm 기본

#### D4. 반응형 기본 확인
- 사이드바가 모바일에서 어떻게 되는지 (collapse)
- 카드 그리드가 좁은 화면에서 1열로 변하는지

#### D5. 수강생 vs 관리자 뷰
- 수강생 로그인 시 관리 메뉴(회원관리, 답변검토, 통계 등)가 안 보여야 함
- 코드에서 role 기반 메뉴 필터링 확인

## 작업 방식
1. 각 페이지 코드를 읽고 문제 발견
2. 즉시 수정 (코드 변경)
3. 수정 후 `npm run build` 확인
4. 모든 수정 완료 후 `git add -A && git commit -m "fix: UI/UX QA 전면 수정" && git push`

## 참고 파일
- 디자인 기준: `docs/qa-report-ui-ux.md` (QA 보고서)
- 관련 컴포넌트: `src/components/` 하위 전체
- 레이아웃: `src/app/(main)/layout.tsx`, `src/components/sidebar.tsx`
- Supabase: `src/lib/supabase/` (client, server, service)

## 체크리스트 (완료 후 확인)
- [ ] `npm run build` 성공
- [ ] `git push` 완료
- [ ] 더미 데이터 전부 제거
- [ ] Empty State 자연스럽게 처리
- [ ] 통계 페이지 실데이터 표시
- [ ] 설정 프로필 자동 채우기
- [ ] 날짜 필터 범위 정리
- [ ] 색상/여백/폰트 일관성
