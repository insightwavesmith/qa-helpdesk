# TASK.md — 즉시 수정 (A1~A3)

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

---

## A1. 프로필 카드 문구 + 로고 수정

### 목표
정보공유 글 하단 프로필 카드와 이메일 프로필 카드를 확정 목업대로 수정

### 현재 동작
- "메타파트너 / 메타공식 프로페셔널" 표시
- "스킨스쿨 / 재미어트 Co-founder" 표시
- Meta Business Partners 인라인 로고 없거나 불일치

### 기대 동작
- 1줄차: Meta Business Partners 로고 인라인 (높이 36px) + "Meta가 인증한 비즈니스 파트너"
- 2줄차: "수강생 자사몰매출 450억+" 유지
- "스킨스쿨 / 재미어트 Co-founder" 제거
- 정보공유 글 하단 프로필 카드 + 이메일 템플릿 프로필 카드 둘 다 동일 적용
- 목업 참고: docs/mockups/profile-card-final.html

### 수정 대상 파일 (참고용)
- 정보공유 글 하단: src/components/posts/ 내 프로필 카드 컴포넌트
- 이메일 템플릿: src/app/api/admin/email/ 또는 src/components/email/ 내 프로필 카드
- Meta 로고 이미지: public/images/ 내 Meta Business Partners 로고

### 하지 말 것
- 프로필 카드 레이아웃 구조 변경
- 다른 페이지 수정

---

## A2. 정보공유 AI 생성 로딩 문구 변경

### 목표
AI 글 생성 중 표시되는 로딩 문구에서 모델명 노출 제거

### 현재 동작
- "Sonnet이 정보공유를 생성하고 있습니다..." (모델명 직접 노출)

### 기대 동작
- "AI가 글을 생성중입니다."
- 모델명(Sonnet, Claude 등) 사용자에게 노출하지 않음

### 수정 대상 파일 (참고용)
- 프론트엔드: 정보공유 생성/편집 페이지에서 "Sonnet" 문자열이 있는 곳
- 백엔드 API 응답에 모델명이 포함되어 있다면 제거

### 하지 말 것
- AI 생성 로직 변경
- 프롬프트 내용 변경
- 다른 로딩 UI 수정

---

## A3. 데일리콜랙트 overlap 제거

### 목표
collect-daily 크론에서 overlap 수집 코드 제거. 광고 데이터만 수집.

### 현재 동작
- collect-daily가 광고 데이터 수집 + overlap pair 순차 Meta API 호출 (최대 28쌍)
- overlap 때문에 Vercel 300초(maxDuration) 타임아웃 발생

### 기대 동작
- collect-daily = 광고 데이터 수집만 (Meta insights → daily_ad_insights upsert)
- overlap 관련 코드 전부 제거 (fetchCombinedReach, pair 계산, overlap upsert 등)
- 기존 overlap 데이터(DB)는 유지
- cron_runs 기록은 정상 동작 유지

### 수정 대상 파일 (참고용)
- src/app/api/cron/collect-daily/route.ts

### 하지 말 것
- overlap DB 테이블/데이터 삭제
- 프론트엔드 overlap 표시 UI 변경
- on-demand overlap API (/api/protractor/overlap) 수정
- collect-mixpanel, collect-benchmarks 수정
