# TASK: 전체 사이트 성능 심층 분석 — 원인 규명 + 개선 방향 보고서

---

## 이게 뭔지
bscamp 사이트가 모든 탭 전환에서 느림. 총가치각도기뿐 아니라 Q&A, 정보공유 같은 단순 목록도 1초 이상. 수강생 체감 속도가 매우 나쁨.

## 왜 필요한지
수강생 30명이 매일 쓰는 서비스인데, 탭 하나 누를 때마다 1~5초 기다리면 신뢰도와 사용률이 떨어짐.

## 실측 데이터 (2026-03-12 08:08 KST)
```
대시보드 → Q&A:       /questions 1,070ms
대시보드 → 정보공유:    /posts 1,063ms
대시보드 → 총가치각도기:
  /api/protractor/accounts    1,217ms
  /api/sales-summary          475ms
  /api/protractor/insights    1,273ms
  /api/protractor/total-value 2,126ms
  /api/protractor/overlap     4,471ms
  /api/protractor/accounts    1,274ms (중복)
```

## 해야 할 것

### 1단계: 심층 프로파일링
- 모든 페이지(/dashboard, /questions, /posts, /reviews, /protractor, /protractor/competitor)의 로딩 구조 분석
- Server Component vs Client Component 비율
- 어떤 데이터 fetching 패턴 사용 중? (Server Action, Route Handler, SWR, RSC fetch 등)
- Supabase 쿼리 개수와 각각의 실행 시간 (쿼리 플랜 포함)
- Next.js 라우팅 방식: prefetch 작동 여부, layout 구조, loading.tsx 존재 여부
- JS 번들 크기 분석 (어떤 라이브러리가 큰지)
- Vercel 서버리스 함수 콜드 스타트 영향

### 2단계: 원인별 분류
각 원인이 전체 지연에 몇 % 기여하는지 정량적으로 분류:
- 네트워크 왕복 (한국 ↔ Vercel 리전)
- Supabase 왕복 (Vercel 리전 ↔ Supabase 리전)
- 서버 렌더링 시간
- 클라이언트 하이드레이션 시간
- JS 번들 파싱/실행 시간
- 불필요한 API 호출 (중복, 워터폴)

### 3단계: 개선 방향 보고서 작성
`docs/performance-analysis.md`에 작성:
- 현재 상태 (실측 데이터 기반)
- 원인 분석 (정량적)
- 개선 방안 (우선순위별, 예상 효과 포함)
- 각 방안의 구현 난이도와 리스크

## 보고서 포맷
```markdown
# bscamp 성능 분석 보고서

## 1. 현재 상태
(실측 데이터)

## 2. 아키텍처 분석
(렌더링 방식, 데이터 흐름, 번들 구조)

## 3. 원인 분석
(각 원인별 기여도 %)

## 4. 개선 방안
(우선순위 P0~P3, 예상 효과, 난이도)

## 5. 권장 실행 순서
(즉시/단기/중기)
```

## 하지 말 것
- 코드 수정 하지 마. 분석+보고만.
- 추측으로 원인 적지 마. 코드/설정 근거 필수.
- "일반적으로 Next.js는..." 같은 일반론 금지. 이 프로젝트 코드 기준으로만.

## 검증 기준
- `docs/performance-analysis.md` 파일이 존재하고, 위 포맷대로 작성됨
- 최소 5개 이상 페이지 분석
- 원인별 기여도가 정량적으로 제시됨
- 개선 방안이 3개 이상, 각각 예상 효과 포함
