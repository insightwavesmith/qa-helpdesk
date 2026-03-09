# TASK: 서비스 전반 로딩 속도 성능 분석

## 배경
서비스 전체가 매우 느리다. 페이지 전환, 데이터 로딩, 컴포넌트 렌더링 등 전반적으로 사용자 체감 속도가 좋지 않다.
원인이 캐싱 문제인지, API 호출 병목인지, 번들 크기인지, DB 쿼리인지 — 근본 원인을 찾아야 한다.

## 왜 필요한가
수강생들이 서비스를 매일 사용한다. 로딩이 느리면 이탈하고, 신뢰를 잃는다.
서비스 오픈일(오늘)에 이 상태면 첫인상이 나쁘다.

## 분석 범위

### T1: 프론트엔드 번들 & 렌더링 분석
- Next.js 빌드 출력 확인 (페이지별 번들 크기, static vs dynamic)
- 불필요한 클라이언트 컴포넌트 ("use client") 남용 여부
- 무거운 라이브러리 (recharts, 에디터 등) lazy loading 안 되는 곳
- 이미지 최적화 (next/image 사용 여부, 외부 이미지 도메인 설정)

### T2: API 호출 패턴 분석
- 페이지 로드 시 동시 API 호출 수 — waterfall 문제 있는지
- SWR 캐시 설정 확인 (revalidation 주기, dedupingInterval 등)
- 불필요한 중복 API 호출 여부
- API 라우트의 응답 시간 병목 (특히 Meta API 호출하는 라우트)

### T3: DB 쿼리 성능
- Supabase 쿼리에 인덱스 부족한 테이블
- N+1 쿼리 패턴
- 큰 테이블 full scan 여부

### T4: 캐싱 전략 리뷰
- Next.js 페이지/API 캐시 설정 (revalidate, cache-control)
- Supabase 호출에 캐시 레이어 있는지
- static generation 가능한데 dynamic으로 되어있는 페이지

## 산출물
- `docs/reviews/performance-analysis.md` — 병목 지점 목록 + 심각도(P0/P1/P2) + 개선 제안
- 코드 수정은 하지 마라. 분석 리포트만.

## 제약
- 코드 수정 금지 — 분석만
- 실제 배포 환경(Vercel) 기준으로 판단
- 추측 아닌 코드 근거로 작성
