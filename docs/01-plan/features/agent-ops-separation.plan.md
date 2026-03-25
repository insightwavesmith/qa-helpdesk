# Agent Ops 프로젝트 분리 계획서

> 작성일: 2026-03-25
> 작성자: CTO Lead
> 상태: 계획

## 1. 배경

bscamp 프로젝트에 Agent Ops(에이전트 대시보드 + 웹 터미널 + 슬랙 알림) 코드가 35+파일 포함되어 있음.
이 코드는 bscamp 서비스(수강생용)와 무관한 **운영 도구**로, 별도 프로젝트로 분리하여 관리 효율성을 높인다.

## 2. 분리 대상

### 2.1 Agent Dashboard (12파일)
| 파일 | 역할 |
|------|------|
| `src/app/(main)/admin/agent-dashboard/page.tsx` | 메인 페이지 |
| `components/useDashboardState.ts` | 상태 관리 훅 |
| `components/DashboardHeader.tsx` | 헤더 |
| `components/OrgChart.tsx` | 조직도 |
| `components/TeamMemberChip.tsx` | 팀원 칩 |
| `components/TaskList.tsx` | 태스크 목록 |
| `components/TeamCard.tsx` | 팀 카드 |
| `components/CommLogPanel.tsx` | 통신 로그 |
| `components/BackgroundPanel.tsx` | 백그라운드 작업 |
| `components/PdcaStatusPanel.tsx` | PDCA 상태 |
| `components/PdcaTab.tsx` | PDCA 탭 |
| `components/TerminalTab.tsx` | 터미널 탭 |
| `components/useTerminalRest.ts` | REST 터미널 훅 |

### 2.2 Web Terminal (11파일)
| 파일 | 역할 |
|------|------|
| `src/app/(main)/admin/terminal/page.tsx` | 메인 페이지 |
| `terminal/terminal-client.tsx` | 터미널 클라이언트 |
| `terminal/components/TerminalView.tsx` | 터미널 뷰 |
| `terminal/components/XtermRenderer.tsx` | xterm.js 렌더러 |
| `terminal/components/InputBar.tsx` | 입력 바 |
| `terminal/components/StatusBar.tsx` | 상태 바 |
| `terminal/components/TerminalSidebar.tsx` | 사이드바 |
| `terminal/components/SlackAlertLog.tsx` | 슬랙 알림 로그 |
| `terminal/components/SessionTab.tsx` | 세션 탭 |
| `terminal/components/ConnectionIndicator.tsx` | 연결 표시기 |
| `terminal/hooks/useTerminalSession.ts` | 세션 훅 |
| `terminal/hooks/useTerminalWebSocket.ts` | WebSocket 훅 |

### 2.3 API Routes (9파일)
| 파일 | 역할 |
|------|------|
| `src/app/api/agent-dashboard/route.ts` | 대시보드 메인 API |
| `api/agent-dashboard/team/[teamId]/route.ts` | 팀 상세 |
| `api/agent-dashboard/log/route.ts` | 로그 조회 |
| `api/agent-dashboard/background/[taskId]/route.ts` | 백그라운드 태스크 |
| `api/agent-dashboard/slack/notify/route.ts` | 슬랙 알림 |
| `src/app/api/terminal/sessions/route.ts` | 세션 관리 |
| `api/terminal/sessions/[id]/input/route.ts` | 세션 입력 |
| `api/terminal/sessions/[id]/history/route.ts` | 세션 히스토리 |
| `api/terminal/slack-log/route.ts` | 슬랙 로그 |

### 2.4 비즈니스 로직 (4파일)
| 파일 | 역할 | 공유 여부 |
|------|------|----------|
| `src/lib/slack-notifier.ts` | 슬랙 알림 전송 | Agent Ops 전용 |
| `src/lib/slack.ts` | 슬랙 기본 클라이언트 | Agent Ops 전용 |
| `src/lib/cross-team/checkpoint.ts` | 체크포인트 관리 | Agent Ops 전용 |
| `src/lib/chain-detector.ts` | 체인 감지 | Agent Ops 전용 |

### 2.5 타입 (1파일)
| 파일 | 역할 |
|------|------|
| `src/types/web-terminal.ts` | 웹 터미널 타입 정의 |

## 3. 공유 의존성 (복제 또는 패키지화 필요)

| 모듈 | bscamp 사용 | Agent Ops 사용 | 전략 |
|------|-------------|---------------|------|
| `lib/gcs-storage.ts` | GCS 파일 업로드/다운로드 | 세션 로그 저장 | 복제 (경량) |
| `lib/db/index.ts` | Cloud SQL 연결 | PDCA 상태 조회 | 복제 |
| `lib/firebase/` | Auth + Admin | Auth 검증 | 복제 (auth 부분만) |

## 4. 분리 전략

### Phase 1: 새 리포지토리 생성
- `agent-ops` 리포지토리 생성 (GitHub)
- Next.js 15 App Router 프로젝트 초기화
- 공통 설정 복사 (tsconfig, tailwind, eslint)

### Phase 2: 코드 이동
- 35+ 파일을 새 프로젝트로 복사
- 경로 재구성: `admin/agent-dashboard` → `app/(main)/dashboard`
- 공유 의존성 복제 (db, gcs-storage, firebase auth)
- import 경로 수정

### Phase 3: bscamp 정리
- 분리된 파일 삭제
- 사이드바에서 agent-dashboard/terminal 링크 외부 URL로 변경
- tsc + build 확인

### Phase 4: 배포
- Vercel에 agent-ops 프로젝트 추가
- 환경변수 설정 (GCS, Cloud SQL, Firebase, Slack)
- 도메인 연결 (ops.bscamp.app 또는 별도)

## 5. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 공유 DB 스키마 동기화 | 타입 불일치 | database.ts 타입 파일 공유 전략 필요 |
| 인증 통합 | 별도 로그인 필요 | Firebase Auth 공유 (동일 프로젝트) |
| 배포 복잡도 증가 | 2개 Vercel 프로젝트 관리 | 동일 팀에서 관리 |

## 6. 예상 작업량

| Phase | 파일 수 | 예상 |
|-------|--------|------|
| Phase 1 | 설정 5~10파일 | 초기화 |
| Phase 2 | 35+ 이동 + import 수정 | 핵심 |
| Phase 3 | bscamp 10~15파일 수정/삭제 | 정리 |
| Phase 4 | Vercel + 환경변수 | 배포 |

## 7. 성공 기준

- [ ] agent-ops 프로젝트 독립 빌드 성공
- [ ] bscamp에서 agent-ops 코드 완전 제거
- [ ] bscamp tsc + build 성공
- [ ] agent-ops 대시보드 정상 동작
- [ ] 웹 터미널 세션 정상 동작
