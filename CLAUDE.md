# CLAUDE.md — 프로젝트 규칙 (에이전트팀 필수 읽기)

## 절대 규칙
1. **코드 품질**: lint 에러 0개 유지. `npm run build` 반드시 성공.
2. **한국어 UI**: 모든 사용자 노출 텍스트는 한국어. 영어 라벨 금지.
3. **기존 파일 최소 변경**: 신규 파일 추가 선호. 기존 파일 대폭 수정 지양.
4. **디자인 시스템**: Primary `#F75D5D`, hover `#E54949`, Pretendard 폰트, 라이트 모드만.
5. **DB 안전**: RLS 정책 필수. SECURITY DEFINER → SET search_path = public. 변수명 테이블/타입과 겹치지 않게.
6. **bkit PDCA 강제**: 설계 문서 없이 코딩 시작 절대 금지. 아래 워크플로우 필수.

## bkit PDCA 워크플로우 (필수)

**모든 기능 개발은 이 순서를 따른다. 예외 없음.**
**코딩부터 시작하면 리젝한다. Plan → Design 문서가 docs/에 있어야 코딩 시작 가능.**

```
Plan → Design → Do → Check → Act
```

### 폴더 구조 (iCloud 동기화)
```
docs/                                    ← iCloud 심볼릭 링크 (절대 삭제/이동 금지)
├── 01-plan/features/{기능}.plan.md      ← 요구사항, 범위, 성공 기준
├── 02-design/features/{기능}.design.md  ← 데이터 모델, API, 컴포넌트
├── 03-analysis/{기능}.analysis.md       ← Gap 분석 (설계 vs 구현)
├── 04-report/features/{기능}.report.md  ← 완료 보고서
├── mockup/                              ← UX 목업 (HTML/이미지)
└── .pdca-status.json                    ← 진행 상태 추적
```

### ⚠ 실행 전 체크 (매 태스크)
```
□ docs/01-plan/features/{기능}.plan.md 있는가? → 없으면 작성
□ docs/02-design/features/{기능}.design.md 있는가? → 없으면 작성
□ .pdca-status.json에 해당 기능 상태 기록했는가?
→ 3개 다 YES여야 코딩 시작 가능
```

### 규칙
1. **Plan 먼저**: `01-plan/features/`에 Plan 문서가 없으면 → 작성부터
2. **Design 필수**: Plan이 있어도 Design이 없으면 → Design 작성 후 코딩
3. **코딩 중 설계서 참조**: 설계에 없는 기능 임의 추가 금지
4. **Check 필수**: 구현 완료 → Gap 분석 (설계 vs 코드 비교)
5. **Match Rate**: 90% 이상이어야 완료. 미만이면 Act(수정) 후 재검증
6. **상태 업데이트**: 각 단계 완료 시 `.pdca-status.json` 업데이트
7. **기존 문서 확인**: 같은 기능의 이전 plan/design/analysis가 있으면 반드시 읽고 시작

### 역할별 담당
| 역할 | Plan | Design | Do | Check | Act |
|------|:----:|:------:|:--:|:-----:|:---:|
| **Leader** | 검토 | 검토+승인 | 분배 | 검토 | 판단 |
| **frontend-dev** | - | 컴포넌트 설계 | 프론트 구현 | - | 프론트 수정 |
| **backend-dev** | - | API/DB 설계 | 백엔드 구현 | - | 백엔드 수정 |
| **code-reviewer** | - | - | - | Gap 분석 | 검증 |

### Design 문서 필수 항목
```markdown
# {기능} 설계서
## 1. 데이터 모델 — 엔티티, 필드, 타입, 관계
## 2. API 설계 — Method, Endpoint, 요청/응답
## 3. 컴포넌트 구조 — 페이지 구성, 상태 관리
## 4. 에러 처리 — 에러 코드, 사용자 메시지
## 5. 구현 순서 — 체크리스트 (의존성 순서)
```

### Check (Gap 분석) 필수 항목
```markdown
# {기능} Gap 분석
## Match Rate: XX%
## 일치 항목: ...
## 불일치 항목: ...
## 수정 필요: ...
```

## 에이전트팀 운영
- 이 프로젝트는 **상시 에이전트팀**으로 운영됨
- Leader는 delegate 모드 — 코드 직접 작성 금지, 조율만
- 모든 구현은 plan approval 후에만 진행
- TASK.md를 읽고 작업 분배 (의존성 순서 준수)

### 리더 메모리 보존 (필수)
- **세션 종료 전**: `~/.claude/agent-memory/leader/MEMORY.md`에 현재 진행 상황 저장
  - 완료된 태스크, 진행 중 태스크, 남은 이슈, 팀원별 상태
- **세션 시작 시**: `~/.claude/agent-memory/leader/MEMORY.md` 먼저 읽기
- 이 파일이 없으면 TASK.md + 팀원 메모리로 상태 파악

### 태스크 수행 순서 (강제)
```
1. TASK.md 읽기
2. 해당 기능의 기존 docs 확인 (01-plan, 02-design, 03-analysis)
3. Plan 없으면 → docs/01-plan/features/{기능}.plan.md 작성
4. Design 없으면 → docs/02-design/features/{기능}.design.md 작성
5. .pdca-status.json 업데이트 (상태: designing → implementing)
6. 구현
7. Check → docs/03-analysis/{기능}.analysis.md 작성
8. Match Rate 90%+ 확인
9. .pdca-status.json 업데이트 (상태: completed)
10. openclaw gateway wake --text 'Done' --mode now
```

**2번에서 기존 문서가 있으면 반드시 읽고, 설계 변경이 필요하면 문서부터 업데이트한다.**
**이 순서를 건너뛰고 바로 코딩하면 리젝된다.**

## Plan Mode
- settings.json에 `defaultMode: "plan"` 설정됨
- Leader는 TASK.md 받으면 **먼저 Plan Mode로 코드 탐색** → 계획 수립 → 승인 후 구현
- Shift+Tab으로 Normal/Plan/Delegate 전환

## 브라우저 QA (Chrome 확장)
- Claude Code Chrome 확장 설치됨. 에이전트팀이 직접 브라우저 QA 가능.
- 구현 완료 후 Chrome으로 localhost:3000 열어서 스크린샷 찍고 UI 검증할 것.
- 데스크탑(1920px) + 모바일(375px) 두 가지 뷰포트 확인 필수.
- 목업/디자인과 비교 → 차이점 발견 시 직접 수정.
- 콘솔 에러 확인.

## Skills (자동 로드)
`.claude/skills/`에 프로젝트 스킬 등록됨. 관련 작업 시 자동 참조:
- `nextjs-supabase.md` — App Router + Supabase 패턴
- `design-system.md` — 색상/폰트/반응형 규칙
- `email-parser.md` — 뉴스레터 BANNER_MAP + 파서 규칙
- `webapp-testing.md` — Playwright 브라우저 QA

## Git Worktree (병렬 작업 시)
팀원 간 파일 충돌 방지. 같은 파일 수정이 예상되면 worktree 사용:
```bash
# 팀원별 worktree 생성
git worktree add ../qa-helpdesk-frontend feature/frontend
git worktree add ../qa-helpdesk-backend feature/backend
# 작업 완료 후 머지
git merge feature/frontend
git worktree remove ../qa-helpdesk-frontend
```

## Hooks (자동 실행)
- **PreToolUse**: main 브랜치 경고 + claude -p 차단
- **TaskCompleted**: tsc 타입 체크 + lint 체크 + 모찌 알림 (OpenClaw webhook)
- **TeammateIdle**: 다음 태스크 자동 배정 (idle 방지)
- **Stop**: 컨텍스트 체크

## 플러그인
- **bkit** (v1.5.2) — PDCA 워크플로우, `/pdca plan {기능}`

## 작업 완료 기준
- [ ] `npm run build` 성공
- [ ] lint 에러 0개
- [ ] 타입 에러 0개
- [ ] 기존 기능 깨지지 않음 확인
- [ ] Playwright 스크린샷 QA (데스크탑 + 모바일)

## TASK.md 타입별 행동 규칙 (절대 준수)

TASK.md의 `## 타입` 섹션을 반드시 확인 후 실행:

| 타입 | 허용 | 금지 |
|------|------|------|
| **목업** | HTML 목업 파일 생성, 보고서 작성 | src/ 코드 파일 수정, DB 변경 |
| **분석/리뷰** | 파일 읽기, 보고서 작성 | 모든 파일 수정 |
| **개발** | 코드 구현, DB 변경 | — |

**목업 또는 분석 타입에서 src/ 파일 수정 시도 = 즉시 중단 + Smith님 승인 요청**

---

## 개발 완료 후 QA (필수 — 건너뛰기 금지)
TASK.md의 `## 완료 후 QA` 섹션 실행:
1. `/bkit pdca check` 실행 → qa-strategist + qa-monitor 자동 수행
2. bkit QA 결과 확인 (Match Rate 90%+, Critical 0)
3. QA봇에게 결과 보고 (sessions_send → agent:qa-lead:main)

bkit QA는 코드/로그 기반 내부 검증. 브라우저 QA(고객 관점)는 QA봇이 별도 진행.

## 프로젝트 파일 구조 (팀원 탐색 최소화용)
```
src/
├── actions/          ← Server Actions (DB CRUD)
│   ├── answers.ts    — 답변 생성/승인/거절 + embedQAPair 훅
│   ├── questions.ts  — 질문 생성 + AI 자동답변(createAIAnswerForQuestion)
│   ├── contents.ts   — 콘텐츠 CRUD
│   ├── embed-pipeline.ts — 임베딩 파이프라인 (embedContentToChunks)
│   ├── auth.ts       — 회원가입/로그인
│   ├── admin.ts      — 회원 관리 (역할 변경, 승인)
│   └── leads.ts, posts.ts, recipients.ts, search.ts, subscribers.ts
├── lib/              ← 핵심 비즈니스 로직
│   ├── knowledge.ts  — RAG 엔진 (454줄, generate(), buildSearchResults, ConsumerConfig)
│   ├── rag.ts        — generateRAGAnswer(), createAIAnswerForQuestion()
│   ├── gemini.ts     — Gemini API (embedding, flash, vision)
│   ├── qa-embedder.ts — QA 분리 임베딩 (embedQAPair)
│   ├── reranker.ts   — Gemini Flash reranking
│   ├── query-expander.ts — 쿼리 확장
│   ├── image-embedder.ts — Vision→텍스트→임베딩
│   ├── chunk-utils.ts — chunkText(700자, 100 overlap)
│   ├── supabase/     — client.ts, server.ts, middleware.ts
│   ├── email-*.ts    — 이메일/뉴스레터 렌더링
│   ├── newsletter-*.ts — 뉴스레터 스키마/템플릿
│   └── diagnosis/    — 광고 진단 엔진
├── app/
│   ├── (auth)/       — login, signup, pending, subscribe, unsubscribe
│   ├── (main)/admin/ — 관리자 페이지 (answers, content, email, knowledge, members, stats)
│   ├── (main)/dashboard/ — 역할별 대시보드
│   ├── (main)/posts/ — 정보공유 게시판
│   ├── (main)/questions/ — Q&A
│   └── (main)/protractor/ — 총가치각도기 (광고 진단)
├── components/       — 공통 UI (DashboardSidebar, ImageGallery 등)
├── types/            — database.ts, content.ts, supabase.ts
└── middleware.ts     — 인증 + 역할 기반 리다이렉트
```

### 핵심 의존성 흐름
```
questions.ts → rag.ts → knowledge.ts → gemini.ts
                                      → reranker.ts
                                      → query-expander.ts
answers.ts → qa-embedder.ts → gemini.ts → chunk-utils.ts
embed-pipeline.ts → gemini.ts → chunk-utils.ts
```

### DB 테이블 (주요)
- `profiles` — 사용자 (role: lead/member/student/alumni/admin)
- `questions` — Q&A 질문 (image_urls jsonb)
- `answers` — Q&A 답변 (image_urls jsonb, is_approved, is_ai_generated)
- `contents` — 콘텐츠 (body_md, email_summary, category, source_type)
- `knowledge_chunks` — RAG 벡터 (1,912개, embedding vector(768), source_type TEXT)
- `student_registry` — 수강생 명단 (78명, profiles와 미연결)
- `cohorts` — 기수 정보

## 기술 스택
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- MDXEditor (마크다운 WYSIWYG 에디터)
- Playwright (브라우저 QA)

## 커밋 컨벤션
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- style: UI/스타일
- chore: 설정/빌드
