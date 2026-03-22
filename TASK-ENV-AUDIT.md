# TASK: 환경변수 전수 점검 및 누락 등록

## 배경
bscamp 프로젝트에 여러 기능이 추가되면서 환경변수가 29개까지 늘어남. 코드에서 사용하는 환경변수 중 .env.local이나 Vercel에 누락된 게 있을 수 있음.

## 고객 관점
모든 기능이 프로덕션(Vercel)에서 정상 동작해야 한다. 환경변수 누락으로 특정 기능이 깨지면 안 된다.

## 해야 할 일

### 1. 코드 전수 스캔
- `process.env.` 로 참조하는 모든 환경변수 목록 추출
- 어떤 파일에서, 어떤 기능에서 사용하는지 매핑

### 2. 현재 등록 현황 대조
- `.env.local` 파일과 대조 → 빠진 거 체크
- `.env.example` 파일 있으면 참조

### 3. 기능별 분류 리포트
- 각 기능(수집, 분석, LP, 임베딩, 크롤링, 이메일, 슬랙, 결제 등)별로 필요한 키 정리
- 누락된 키 있으면 `.env.local`에 추가 (값은 기존 패턴 참고하되, 민감 키는 placeholder로)

### 4. Vercel 환경변수 대조
- Vercel에 등록된 29개와 코드에서 필요한 전체 목록 대조
- 누락 있으면 `vercel env add` CLI로 등록
  - Vercel CLI 설치돼 있음. 프로젝트 루트에서 실행.
  - Production/Preview/Development 전체 환경에 등록

### 5. Supabase 관련
- Supabase Edge Functions에서 사용하는 환경변수도 점검
- `supabase/functions/` 하위 코드 스캔
- Supabase secrets 누락 있으면 `supabase secrets set` 으로 등록

## 결과물
- 환경변수 전수 매핑 테이블 (변수명 / 용도 / .env.local / Vercel / Supabase)
- 누락 발견 시 등록 완료 확인

## 주의
- 기존 값 절대 변경하지 마. 누락된 것만 추가.
- 민감 키 값은 로그에 찍지 마.
- `.env.local`은 git에 올리지 마.
