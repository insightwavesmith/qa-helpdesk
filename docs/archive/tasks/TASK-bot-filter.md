# TASK: 믹스패널 봇/크롤러 트래픽 필터링

## 배경
믹스패널에 버지니아, 캘리포니아 등 해외 트래픽이 잡히고 있음. 검색엔진 봇, 크롤러, 프리렌더러 등이 JS를 실행하면서 이벤트가 찍히는 것.
실제 수강생 데이터만 깨끗하게 수집돼야 함.

## 요구사항

### 믹스패널 트래킹 코드에 봇 필터 추가
- `src/lib/mixpanel.ts` (또는 Provider 컴포넌트)에서 봇 감지 시 트래킹 비활성화
- 봇 감지 조건:
  1. `navigator.webdriver === true` (headless 브라우저)
  2. User-Agent에 bot/crawler/spider/googlebot/bingbot/facebookexternalhit/prerender 등 포함
  3. `window.__PRERENDER` 등 프리렌더러 플래그
- 봇이면 `mixpanel.opt_out_tracking()` 호출하거나, 이벤트 전송 자체를 스킵

### 기존 봇 데이터 처리
- 이건 코드로 안 됨, 믹스패널 대시보드에서 필터 걸면 됨 → 코드 수정 범위 아님

## 빌드 검증
- `npm run build` 통과

## 커밋 + 푸시
- 커밋 메시지: `fix: 믹스패널 봇/크롤러 트래픽 필터링 추가`
- main 브랜치에 푸시
