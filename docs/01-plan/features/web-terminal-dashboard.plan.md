# 웹 터미널 대시보드 계획서

> **작성일**: 2026-03-25
> **작성자**: PM팀
> **상태**: Plan 완료
> **관련 설계**: `docs/02-design/features/agent-dashboard.design.md`, `docs/02-design/features/slack-notification.design.md`
> **기술 참조**: [Codeman](https://github.com/Ark0N/Codeman) (MIT 오픈소스)

---

## 1. 개요

### 기능 설명

CEO/COO가 브라우저에서 3개 에이전트팀(sdk-cto, sdk-pm, sdk-mkt)의 tmux 터미널 출력을 실시간으로 모니터링하고, 직접 입력(대화/지시)을 전송할 수 있는 웹 터미널 대시보드.

### 해결하려는 문제

- **세션 접속 번거로움**: 현재 tmux attach로 각 세션에 직접 접속해야 팀 출력 확인 가능 -- 브라우저에서 한 화면에 3팀 동시 모니터링으로 전환
- **세션 전환 비효율**: tmux 창 사이를 prefix 키로 오가야 함 -- 탭 한 번으로 즉시 전환
- **터미널 밖 상태 파악 불가**: 터미널을 떠나면 팀 작업 진행 상태를 알 수 없음 -- 대시보드에서 TASK 진행률과 터미널 출력을 함께 표시
- **원격 접근 불가**: 맥 앞에 있어야만 터미널 확인 가능 -- 브라우저만 있으면 어디서든 접근

### 배경/맥락

- Codeman 오픈소스(MIT)의 xterm.js + SSE/WebSocket 구조를 차용하되, bscamp에 맞게 경량화
- Codeman은 Fastify 기반 독립 서버이나, 본 프로젝트는 **별도 WebSocket 서버(Node.js) + Next.js 프론트엔드** 하이브리드 구조 채택
- 기존 `agent-dashboard.plan.md`의 모니터링 대시보드 확장 -- 터미널 뷰는 별도 `/admin/terminal` 페이지로 분리
- Smith님은 맥에서 tmux 3개 세션 운영 중: `sdk-cto`, `sdk-pm`, `sdk-mkt`
- Codeman의 6-layer anti-flicker 파이프라인, zero-lag input overlay 등 고급 기능은 Phase 2에서 선택적으로 도입

---

## 2. 핵심 요구사항

### 기능적 요구사항

| ID | 요구사항 | 우선순위 | 설명 |
|----|---------|---------|------|
| FR-01 | 실시간 터미널 뷰 (3팀 세션) | P0 | xterm.js로 tmux 세션 출력을 브라우저에 실시간 렌더링. ANSI escape 코드(색상, 커서 이동) 완전 지원 |
| FR-02 | 브라우저 입력 -> tmux send-keys 전달 | P0 | 입력창 타이핑이 해당 팀 tmux 세션에 `tmux send-keys`로 전달 |
| FR-03 | 탭/사이드바로 팀 세션 전환 | P0 | 3팀 탭 전환 시 해당 세션의 최근 출력 즉시 표시 (히스토리 유지) |
| FR-04 | 각 팀 상태 요약 (TASK, 진행률) | P1 | 사이드바에 팀별 현재 TASK, 진행률, 마지막 출력 요약 표시. 기존 agent-dashboard 상태 데이터 재활용 |
| FR-05 | 슬랙 알림 통합 로그 | P1 | 같은 페이지 사이드바에서 최근 슬랙 알림 로그 열람 (`/tmp/cross-team/slack/queue.jsonl` 연동) |
| FR-06 | 연결 상태 표시 | P1 | WebSocket 연결 상태(LIVE/RECONNECTING/DISCONNECTED) 인디케이터 |
| FR-07 | 터미널 출력 검색/필터 | P2 | xterm.js 내 텍스트 검색 (Ctrl+F 또는 검색 바) |
| FR-08 | 세션 녹화/재생 | P2 | 터미널 출력을 타임스탬프와 함께 저장하여 후속 재생 |
| FR-09 | 3팀 분할 뷰 | P2 | 3개 터미널을 한 화면에 동시 표시 (그리드 레이아웃) |

### 비기능적 요구사항

| ID | 요구사항 | 기준값 | 비고 |
|----|---------|-------|------|
| NFR-01 | 터미널 출력 지연 | < 200ms | tmux capture-pane -> WebSocket -> xterm.js 렌더링까지 |
| NFR-02 | 입력 전달 지연 | < 100ms | 키 입력 -> tmux send-keys 실행까지 |
| NFR-03 | 동시 접속 | 최소 3명 | CEO + COO + 팀 리더 |
| NFR-04 | 보안 | admin 인증 필수 | Supabase Auth 기반, WebSocket JWT 검증 |
| NFR-05 | 스크롤백 버퍼 | 1000줄 | 세션별 최근 1000줄 히스토리 유지 |
| NFR-06 | 자동 재연결 | 5초 간격, 최대 10회 | WebSocket 끊김 시 |

---

## 3. 용어 정의

| 용어 | 설명 |
|------|------|
| tmux 세션 | 터미널 멀티플렉서 세션. sdk-cto, sdk-pm, sdk-mkt 3개 운영 중 |
| capture-pane | tmux 명령어. 현재 pane의 출력 내용을 텍스트로 캡처 |
| send-keys | tmux 명령어. 지정 세션에 키 입력을 전송 |
| xterm.js | 브라우저에서 터미널을 렌더링하는 JavaScript 라이브러리. ANSI escape 지원 |
| WebSocket | 서버-클라이언트 간 양방향 실시간 통신 프로토콜 |
| SSE (Server-Sent Events) | 서버에서 클라이언트로의 단방향 실시간 스트리밍 (Codeman이 출력 전송에 사용) |
| node-pty | Node.js에서 PTY(Pseudo Terminal)를 생성하는 라이브러리. Phase 2 옵션 |
| zero-lag input | Codeman의 로컬 에코 기법. 입력을 서버 응답 없이 즉시 표시하여 지연 체감 제거 |
| ANSI escape | 터미널 색상, 커서 이동, 스타일을 제어하는 이스케이프 시퀀스 |
| 스크롤백 버퍼 | 터미널 화면 밖으로 스크롤된 이전 출력을 보존하는 메모리 영역 |

---

## 4. 범위

### In Scope -- Phase 1 (MVP)

- 3팀 tmux 세션(sdk-cto, sdk-pm, sdk-mkt) 실시간 터미널 뷰
- xterm.js 기반 브라우저 렌더링 (ANSI escape 완전 지원)
- 브라우저 입력 -> WebSocket -> tmux send-keys 전달
- 탭 기반 세션 전환 (히스토리 유지)
- 팀별 상태 요약 사이드바 (기존 agent-dashboard 데이터 재활용)
- 슬랙 통합 채널 알림 로그 (사이드바 패널)
- WebSocket 서버 (별도 Node.js 프로세스, 로컬 실행)
- admin 인증 (Supabase Auth JWT)
- 라이트 모드 xterm.js 테마 (#F75D5D 포인트 컬러)
- 위험 명령 필터링 (Destructive Detector 규칙 적용)
- 자동 재연결 (5초 간격, 최대 10회)

### Phase 2 (추후)

- 3팀 분할 뷰 (그리드 레이아웃으로 동시 표시)
- 세션 녹화/재생 (타임스탬프 기반)
- 터미널 출력 AI 요약 (Gemini Flash로 최근 출력 요약)
- 터미널 내 텍스트 검색 (xterm.js addon-search)
- zero-lag input overlay (Codeman의 xterm-zerolag-input 차용)
- node-pty 직접 연동 (capture-pane 폴링 대체)
- Cloudflare Tunnel을 통한 원격 접속 (Codeman 방식 차용)
- QR 코드 인증 (Codeman의 QR auth 구조 참고)
- 모바일 반응형 (키보드 accessory bar, 스와이프 전환)
- Ralph Loop 추적 (Codeman의 auto-compact/clear 감지 기능)

### Out of Scope

- 터미널 에뮬레이터 자체 개발 (xterm.js 사용)
- SSH 원격 접속 (tmux 세션 접근만)
- 다크 모드 (라이트 모드만 -- CLAUDE.md 규칙)
- Codeman 전체 설치/운영 (구조만 참고하여 자체 구현)
- 에이전트 세션 생성/삭제 (기존 tmux 세션에 연결만)

---

## 5. 아키텍처 개요

### 데이터 흐름

```
tmux 세션 (sdk-cto, sdk-pm, sdk-mkt)
    |
    +-- [WebSocket 서버] tmux capture-pane -t {세션} -p -S -1000
    |   (100ms 폴링, diff 감지 -> 변경분만 전송)
    |
    +-- [WebSocket 서버] (ws 라이브러리, Node.js, localhost:3001)
    |   |
    |   +-- 출력: ws -> 브라우저 xterm.js 렌더링
    |   +-- 입력: 브라우저 -> ws -> tmux send-keys -t {세션}
    |   +-- 상태: 세션 목록 + 연결 상태 주기적 브로드캐스트
    |
브라우저 (Next.js /admin/terminal 페이지)
    |
    +-- xterm.js: 터미널 출력 렌더링
    +-- 입력 바: 사용자 타이핑 -> WebSocket 전송
    +-- 사이드바: 팀 탭 + 상태 요약 + 슬랙 로그
```

### 핵심 기술 선택 근거 (Codeman 참조)

| 항목 | Codeman 방식 | 본 프로젝트 방식 | 이유 |
|------|-------------|----------------|------|
| 웹 프레임워크 | Fastify 독립 서버 | Next.js + 별도 WS 서버 | 기존 bscamp 스택 활용 |
| 출력 전송 | SSE (Server-Sent Events) | WebSocket (양방향) | 입력 전송에도 동일 채널 사용 |
| 입력 처리 | zero-lag DOM overlay + 50ms 배치 | 직접 WebSocket 전송 | MVP에서는 단순 구현 우선 |
| 프로세스 관리 | node-pty + tmux | tmux capture-pane 폴링 | 설치 의존성 최소화 |
| 인증 | Basic Auth + QR 코드 | Supabase Auth JWT | 기존 인증 체계 재활용 |
| 플리커 방지 | 6-layer anti-flicker pipeline | 기본 xterm.js + requestAnimationFrame | Phase 2에서 최적화 |
| 자동 재시작 | respawn controller + circuit breaker | PM2 또는 수동 재시작 | MVP 범위 축소 |

### 서버 구성

```
[맥 로컬]
    |
    +-- bscamp (Next.js, localhost:3000)
    |   +-- /admin/terminal 페이지 (프론트엔드)
    |   +-- /api/terminal/* (REST API fallback)
    |
    +-- terminal-ws-server (Node.js, localhost:3001)
        +-- WebSocket 서버 (ws 라이브러리)
        +-- tmux 캡처 루프 (100ms 폴링)
        +-- tmux send-keys 릴레이
```

> **핵심 제약**: WebSocket 서버는 tmux가 실행 중인 머신(맥)에서 반드시 로컬로 돌아야 한다. Cloud Run이나 Vercel에서는 tmux 세션에 접근 불가.

---

## 6. 슬랙 채널 구조 변경

### 기존 구조 (slack-notification.design.md 기준)

| 채널 | 환경변수 | 용도 |
|------|---------|------|
| `#agent-pm` | `SLACK_CHANNEL_PM` | PM팀 이벤트 수신 |
| `#agent-cto` | `SLACK_CHANNEL_CTO` | CTO팀 이벤트 수신 + 배포 알림 |
| `#agent-marketing` | `SLACK_CHANNEL_MARKETING` | 마케팅팀 이벤트 수신 |
| CEO DM | `SLACK_CEO_USER_ID` | 중요/긴급 이벤트 DM |

### 변경 후 구조

| 채널 | 환경변수 | 용도 |
|------|---------|------|
| **통합 채널** (신규) | `SLACK_UNIFIED_CHANNEL` | 3팀 모든 이벤트를 1개 채널에서 수신 |
| CEO DM | `SLACK_CEO_USER_ID` | 중요/긴급 이벤트 DM (변경 없음) |

### 변경 이유

- Smith님이 채널 1개에서 모든 팀 알림을 한눈에 보고 싶다는 요청
- 3채널 분산 시 컨텍스트 스위칭 비용 발생

### 기존 설계 영향 범위

다음 파일/문서의 채널 매핑 로직 업데이트가 필요하다:

1. **`docs/02-design/features/slack-notification.design.md`** -- 섹션 3 "채널 매핑 상세"
   - `SLACK_CHANNEL_PM`, `SLACK_CHANNEL_CTO`, `SLACK_CHANNEL_MARKETING` 환경변수를 `SLACK_UNIFIED_CHANNEL`로 통합
   - `resolveChannels()` 로직: 모든 이벤트가 통합 채널 1개로 라우팅
   - 라우팅 매트릭스 간소화
2. **`src/lib/slack-notifier.ts`** -- `CHANNELS` 객체 구조 변경
   - 기존: `{ pm: string, marketing: string, cto: string, ceoUserId: string }`
   - 변경: `{ unified: string, ceoUserId: string }` + deprecated fallback
3. **`src/types/agent-dashboard.ts`** -- `SlackChannelConfig` 인터페이스 변경
4. **`.claude/hooks/agent-slack-notify.sh`** -- 채널 ID 참조 변경

### 마이그레이션 전략

- `SLACK_UNIFIED_CHANNEL` 환경변수 신규 추가
- 기존 `SLACK_CHANNEL_PM/CTO/MARKETING`은 deprecated로 표시하되 즉시 삭제하지 않음
- `SLACK_UNIFIED_CHANNEL`이 설정되어 있으면 통합 채널로 전송, 없으면 기존 팀별 채널 fallback
- 채널 ID는 Smith님이 추후 제공 예정

---

## 7. 성공 기준

- [ ] 브라우저(`/admin/terminal`)에서 3팀 tmux 세션 출력이 200ms 이내로 실시간 표시된다
- [ ] xterm.js가 ANSI escape 코드(색상, 볼드, 커서 이동)를 정확히 렌더링한다
- [ ] 브라우저 입력창에 타이핑한 내용이 해당 팀 tmux 세션에 정확히 전달된다
- [ ] 탭 전환으로 3팀 세션 간 즉시 이동 가능하며, 이전 세션 히스토리가 유지된다
- [ ] 사이드바에 팀별 현재 TASK와 진행률이 표시된다
- [ ] 슬랙 알림 로그가 사이드바에 시간순으로 표시된다
- [ ] 인증된 admin 사용자만 페이지에 접근 가능하다
- [ ] WebSocket 서버 JWT 인증이 비인증 연결을 차단한다
- [ ] 위험 명령(rm -rf, git push --force 등)이 필터링되어 전달 차단된다
- [ ] WebSocket 끊김 시 5초 간격 자동 재연결이 동작한다
- [ ] 라이트 모드 테마가 적용되고 Primary 색상(#F75D5D)이 포인트로 사용된다
- [ ] `npm run build` 성공 (기존 기능 미영향)

---

## 8. 기술적 제약/고려사항

| 항목 | 내용 |
|------|------|
| **WebSocket 서버 위치** | tmux가 실행 중인 맥 로컬에서만 동작 가능. Cloud Run/Vercel 불가 |
| **포트** | WebSocket 서버: 3001 (기본), Next.js: 3000 |
| **프레임워크** | Next.js 15 App Router (bscamp 기존 스택) |
| **터미널 라이브러리** | xterm.js (브라우저 전용, SSR 불가 -- dynamic import 필수) |
| **WebSocket 라이브러리** | `ws` (Node.js 서버), 브라우저 네이티브 WebSocket (클라이언트) |
| **스타일** | Primary #F75D5D, Pretendard 폰트, 라이트 모드만 |
| **인증** | Supabase Auth JWT (기존 체계 재활용). WebSocket 연결 시 query param으로 전달 |
| **tmux 폴링** | 100ms 간격 capture-pane. CPU 부하 모니터링 필요 (3세션 x 10/sec = 30 calls/sec) |
| **xterm.js SSR 불가** | `dynamic(() => import('./XtermRenderer'), { ssr: false })` 사용 |
| **보안** | Destructive Detector 규칙과 동일한 위험 명령 필터링 |
| **기존 대시보드** | `/admin/agent-dashboard`와 별도 페이지. 사이드바 네비게이션으로 연결 |
| **Codeman 라이선스** | MIT -- 구조/패턴 차용에 법적 제약 없음 |

---

## 9. 리스크

| 리스크 | 영향 | 확률 | 완화 방안 |
|--------|------|------|----------|
| tmux capture-pane 폴링 CPU 부하 | 맥 성능 저하 | 중 | 폴링 간격 조절 (100ms -> 200ms), diff 감지로 변경분만 전송 |
| WebSocket 서버 크래시 | 터미널 뷰 전체 중단 | 중 | PM2 프로세스 관리자로 자동 재시작 |
| tmux 세션 종료/재시작 | 해당 팀 터미널 뷰 끊김 | 중 | 세션 상태 주기 체크, 재연결 시 히스토리 재로드 |
| xterm.js 번들 사이즈 | 초기 로딩 느림 | 저 | dynamic import + 코드 스플리팅 |
| 원격 접근 불가 (로컬 전용) | 외부에서 모니터링 불가 | 중 | Phase 2에서 Cloudflare Tunnel 도입 (Codeman 방식) |
| send-keys 보안 취약점 | 위험 명령 실행 가능 | 고 | 입력 필터링 + allowlist/blocklist + 확인 다이얼로그 |
| 슬랙 통합 채널 전환 혼란 | 기존 팀별 채널과 이중 전송 | 저 | deprecated fallback + 마이그레이션 기간 |
| CORS 이슈 | 3000 -> 3001 WebSocket 연결 차단 | 중 | WebSocket 서버에 CORS 허용 origin 설정 |

---

## 10. Codeman 참조 요약

Codeman(github.com/Ark0N/Codeman)에서 차용/참고하는 요소:

### Phase 1에서 차용

| Codeman 기능 | 차용 방식 |
|-------------|----------|
| xterm.js 터미널 렌더링 | 동일 라이브러리 사용, 테마만 라이트 모드로 변경 |
| tmux 세션 관리 | capture-pane / send-keys 구조 동일 채용 |
| 탭 기반 세션 전환 | UI 패턴 참고 (최대 20세션 -> 본 프로젝트는 3세션) |
| 자동 재연결 | 연결 끊김 시 재시도 패턴 참고 |

### Phase 2에서 참고 검토

| Codeman 기능 | 검토 사유 |
|-------------|----------|
| 6-layer anti-flicker pipeline | 60fps 부드러운 렌더링 (현재는 기본 xterm.js) |
| xterm-zerolag-input (npm 패키지) | 입력 지연 체감 제거 (DOM overlay 방식) |
| QR 코드 인증 | 모바일 접근 시 편의성 (USENIX Security 2025 기반 보안) |
| Cloudflare quick tunnel | 원격 접속 (포트 포워딩 없이) |
| respawn controller + circuit breaker | 에이전트 세션 자동 재시작 + 건강 점수 |
| Ralph Loop 추적 | auto-compact/clear 감지, TodoWrite 진행률 표시 |
| 모바일 키보드 accessory bar | /init, /clear, /compact 빠른 실행 버튼 |

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 웹 터미널 대시보드 (3팀 tmux 세션 실시간 모니터링 + 입력) |
| **작성일** | 2026-03-25 |
| **예상 규모** | WebSocket 서버 1개 + Next.js 페이지 1개 + 컴포넌트 6개 + API 3개 |

| 관점 | 내용 |
|------|------|
| **문제** | tmux 직접 접속 필요, 세션 전환 번거로움, 터미널 밖 상태 파악 불가 |
| **해결** | 브라우저에서 xterm.js로 3팀 터미널 실시간 렌더링 + send-keys로 입력 전달 |
| **기술 핵심** | Codeman 구조 차용 (xterm.js + WebSocket + tmux capture-pane/send-keys) |
| **슬랙 변경** | 팀별 3채널 -> 통합 1채널 + CEO DM (기존 설계 업데이트 필요) |
| **핵심 제약** | WebSocket 서버는 맥 로컬 필수 (tmux 접근). Cloud 배포 불가 |
| **핵심 가치** | CEO가 브라우저 하나로 3팀 에이전트 작업을 실시간 감시 + 즉시 지시 가능 |
