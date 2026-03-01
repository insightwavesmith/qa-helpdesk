# BS CAMP QA Helpdesk — PDCA 프로젝트 현황

> 최종 업데이트: 2026-03-01 13:10 KST
> 프로젝트: https://bscamp.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk

---

## Phase: Act (반복 개선)

## 최근 완료 (2026-03-01)

### 보안 수정 T1~T9 (완료, push 완료)
- T1: RLS 정책 강화 → a20bf82
- T2: 시크릿 하드코딩 제거
- T3: 각도기 비즈니스 로직 보호
- T4: XSS 방어
- T5: 시크릿키 암호화
- T6: Rate Limiting → 30be15c
- T7: 무제한 쿼리 방어 → cb829ba
- T8: requireAdmin 적용
- T9: 미사용 API 삭제
- 벤치마크 API admin-only → 47a9430, 27fea93

### UI 개선 U1~U4 (완료, push 완료)
- U1: 지표 바 → 기준 대비 % → 16a5952
- U2: 파트별 A/B/C 등급
- U3: 콘텐츠 탭 벤치마크 기준값
- U4: 타임존 버그 수정
- 개별지표 등급 제거 + status key_name → 12c2fb1

### 5필드 통합 (완료, push 완료)
- F1: key_name 패턴 통일
- F2: profiles 레거시 쓰기 제거
- F3: Mixpanel 상태 3단계 (미연동/보드없음/연동완료)
- F4: 온보딩 계정명 추가
- F5: 수정 폼 5개 필드 노출
- → 446f323

### 인프라
- 크론 KST 03:00 변경 → e0befa0
- TASK.md 포맷 규칙 (rules/task-format.md)
- Agent SDK 설치 + Max Pro 인증 성공

---

## 현재 진행 중
- 5필드 통합 QA (서브에이전트)
- Agent SDK 전환 검토

---

## 대기 (다음 작업)

### 우선순위 높음
1. 수강생 등수/랭킹 기능 (2026-03-01 지시)
2. 콘텐츠 이미지 기획
3. daily_ad_insights 과거 재수집 (2/06~2/25)
4. encrypt/decrypt 호환 수정

### 보통
5. 메타 배지 로고 → UI
6. NOTION_TOKEN Vercel 등록
7. Agent SDK 에이전트팀 스크립트

### 백로그
- Context Warehouse (파킹)
- 초대코드 만료 기능

---

## 핵심 지표
- 배포: https://bscamp.vercel.app (READY)
- 최신 커밋: 446f323
- 빌드: 성공
- 크론: KST 03:00
- 에이전트팀: Claude Code Agent Teams (tmux)
- 모델: Opus 4.6 (메인), Sonnet 4.6 (서브/크론)
