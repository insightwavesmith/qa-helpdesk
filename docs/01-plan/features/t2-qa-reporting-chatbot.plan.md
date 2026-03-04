# T2. QA 리포팅 챗봇 (채널톡 스타일) — Plan

## 기능 ID
`t2-qa-reporting-chatbot`

## 요구사항 요약
관리자(admin/assistant)가 QA 이슈를 채널톡 스타일 플로팅 챗봇으로 간편 제출할 수 있는 도구. AI(Sonnet)가 입력을 구조화된 QA 항목으로 정리.

## 현재 상태 (AS-IS)
- QA 이슈 발견 시 수동으로 정리 → 슬랙/문서로 공유
- 체계적 QA 수집 도구 없음
- 이미지(스크린샷) 첨부 프로세스 번거로움

## 기대 상태 (TO-BE)
1. 우하단 플로팅 챗 버튼 (관리자만 표시)
2. 클릭 시 채팅 패널 슬라이드업
3. 텍스트 + 이미지(스크린샷) 첨부 가능
4. AI(Sonnet)가 입력을 QA 항목으로 구조화 (제목, 설명, 심각도, 스크린샷)
5. 제출된 QA 항목 목록 뷰 (날짜, 제목, 상태)
6. Supabase `qa_reports` 테이블에 저장

## 사용자
- 관리자(admin/assistant) 3~4명
- 수강생(student/member)에게는 완전 비노출

## 범위

### 신규 파일
- `src/components/qa-chatbot/` — 챗봇 UI 컴포넌트 디렉토리
  - `QaChatButton.tsx` — 플로팅 버튼
  - `QaChatPanel.tsx` — 채팅 패널 (메시지 입력 + 이미지 첨부 + 전송)
  - `QaReportList.tsx` — QA 항목 목록 뷰
- `src/actions/qa-reports.ts` — Server Action (CRUD)
- `src/app/api/qa-chatbot/route.ts` — Sonnet API 호출 엔드포인트

### 수정 파일
- `src/app/(main)/layout.tsx` — 챗봇 버튼 삽입 (admin 조건부)

### DB
- `qa_reports` 테이블 신규 생성 (마이그레이션)

## 범위 밖 (하지 말 것)
- 수강생에게 챗봇 노출
- 기존 Q&A(질문답변) 시스템과 통합/연동
- 복잡한 워크플로우 (칸반, 할당 등)
- Haiku 등 작은 모델 사용 금지 — **Sonnet만**
- 기존 컴포넌트/액션 파일 대폭 수정

## 기술 스택
- AI: Anthropic Sonnet (`claude-sonnet-3`)
- Storage: Supabase Storage (이미지 업로드 — 기존 패턴 재사용)
- DB: Supabase PostgreSQL (`qa_reports` 테이블)
- UI: shadcn/ui + Tailwind + Radix

## 성공 기준
- [ ] 관리자 로그인 시 우하단에 챗봇 버튼 표시
- [ ] 수강생 로그인 시 챗봇 버튼 미표시
- [ ] 텍스트 + 이미지 첨부 후 전송 시 Sonnet가 QA 항목으로 구조화
- [ ] 구조화된 QA 항목이 DB에 저장됨
- [ ] QA 목록에서 제출된 항목 조회 가능
- [ ] `npm run build` 성공
- [ ] 모바일(375px) + 데스크탑(1920px) 반응형

## 리스크
- **중간**: 새 테이블 + 새 API 엔드포인트 + 새 UI 컴포넌트 세트
- Anthropic API 키 환경변수 기존 존재 확인 필요
- Supabase Storage 버킷 정책 확인 필요

## 예상 작업량
- DB 마이그레이션: 1시간
- API 엔드포인트: 1시간
- UI 컴포넌트: 3시간
- QA: 1시간
- **총: ~6시간**

## 의존성
- T1과 독립적
- Anthropic API 키 (`ANTHROPIC_API_KEY`) — 기존 환경변수
- Supabase 서비스 — 기존 인프라
