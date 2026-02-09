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

```
Plan → Design → Do → Check → Act
```

### 폴더 구조
```
docs/
├── 01-plan/features/{기능}.plan.md      ← 요구사항, 범위, 성공 기준
├── 02-design/features/{기능}.design.md  ← 데이터 모델, API, 컴포넌트
├── 03-analysis/{기능}.analysis.md       ← Gap 분석 (설계 vs 구현)
├── 04-report/features/{기능}.report.md  ← 완료 보고서
└── .pdca-status.json                    ← 진행 상태 추적
```

### 규칙
1. **Plan 먼저**: `01-plan/features/`에 Plan 문서가 없으면 → 작성부터
2. **Design 필수**: Plan이 있어도 Design이 없으면 → Design 작성 후 코딩
3. **코딩 중 설계서 참조**: 설계에 없는 기능 임의 추가 금지
4. **Check 필수**: 구현 완료 → Gap 분석 (설계 vs 코드 비교)
5. **Match Rate**: 90% 이상이어야 완료. 미만이면 Act(수정) 후 재검증
6. **상태 업데이트**: 각 단계 완료 시 `.pdca-status.json` 업데이트

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
- **각 기능 시작 전**: Plan 확인 → Design 작성/확인 → 승인 → 구현
- **각 기능 완료 후**: Check(Gap 분석) → Match Rate 90%+ → .pdca-status.json 업데이트
- 완료 후: `openclaw gateway wake --text 'Done' --mode now`

## 플러그인 (설치 완료 2026-02-08)
- **Compound Engineering** (v2.30.0) — every-marketplace
  - `/workflows:review` — 멀티 리뷰 (보안/성능/아키텍처)
  - `/workflows:compound` — 작업 후 교훈 문서화
  - `/workflows:plan` — 구조화된 계획
- **Conductor** (v0.1.0) — claude-conductor
  - `/conductor:setup` — 프로젝트 컨텍스트 설정
  - `/conductor:new-track` — 새 작업 트랙
  - `/conductor:implement` — 구현 실행
  - `/conductor:status` — 상태 확인

## 작업 완료 기준
- [ ] `npm run build` 성공
- [ ] lint 에러 0개
- [ ] 타입 에러 0개
- [ ] 기존 기능 깨지지 않음 확인

## 기술 스택
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- TipTap (에디터)

## 커밋 컨벤션
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- style: UI/스타일
- chore: 설정/빌드
