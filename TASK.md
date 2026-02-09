# TASK.md — Phase 3a: 인라인 편집 + 콘텐츠/회원 관리 구조 변경

> 2026-02-09 | 콘텐츠 관리 완성의 핵심
> 모찌가 만든 정보공유 글/뉴스레터를 Smith님이 실제 화면에서 편집 → 원클릭 배포

## 목표
1. /posts/[id]에서 admin이 "수정" → 보이는 그대로 인라인 편집 → "발행" 가능
2. 뉴스레터도 동일하게 인라인 편집 → "이메일 발송" 가능
3. 회원관리에 구독자 통합 (사람은 한 곳에서)
4. 이메일 발송은 발송 전용으로 정리

## 레퍼런스
- 정보공유 스타일: https://www.mfitlab.com/solutions/blog (마켓핏랩 블로그)
- 뉴스레터 스타일: https://mfl-solutions.stibee.com/ (마켓핏랩 뉴스레터)
- 인라인 편집 데모: https://wysiwyg-demo-beta.vercel.app
- TipTap editable 토글: editor.setEditable(true/false)
- Novel 에디터 참고 (Notion 스타일 TipTap): https://novel.sh

## 제약
- 작동하는 기능 건드리지 않기
- 한국어 UI only, #F75D5D, Pretendard, Light mode
- TipTap 이미 설치됨 — 추가 에디터 라이브러리 설치 금지
- 기존 /admin/content 편집 기능은 유지 (인라인 편집은 추가)
- 모바일 반응형 필수

## 컨텍스트
- DB: contents 테이블 (id, title, content, summary, category, type, status, thumbnail_url 등)
- DB: email_newsletters 테이블 (id, content_id, subject, html_content, status 등)
- DB: leads 테이블 (id, name, email, source, subscribed 등)
- 기존 TipTap 에디터: src/components/editor/ 폴더
- 기존 이미지 업로드: Supabase Storage 사용
- 기존 이메일 발송: src/app/api/admin/email/send/route.ts

---

## T1. 정보공유 인라인 편집 → frontend-dev ★핵심

**파일 (소유권):**
- src/app/(main)/posts/[id]/page.tsx (수정)
- src/components/post/InlineEditor.tsx (신규)
- src/components/post/FloatingToolbar.tsx (신규)
- src/components/post/PublishBar.tsx (신규)

**의존:** 없음 (독립 작업)

**Do:**
- /posts/[id] 페이지: admin 로그인 시 우측 상단 "수정" 버튼 표시
- "수정" 클릭 → 같은 페이지에서 TipTap editable: true 전환
- 읽기 모드와 편집 모드가 같은 DOM → 보이는 그대로 편집 (WYSIWYG)
- 플로팅 툴바: 볼드, 이탤릭, 밑줄, 제목(H2/H3), 목록, 인용, 이미지 삽입, 링크
- 이미지 클릭 → 교체 가능 (Supabase Storage 업로드)
- 제목(h1)도 인라인 편집 가능
- 상단 고정 바: [임시저장] [발행] [취소]
  - "발행" → contents.status = 'published' → /posts 목록 노출
  - "임시저장" → contents.status = 'draft' 유지
  - "취소" → 변경사항 버리고 읽기 모드로
- 편집 중 자동저장 (5초 디바운스, draft 상태)
- 비로그인/비admin → "수정" 버튼 안 보임

**완료 기준:**
- [ ] /posts/[id] 비로그인: 읽기만 가능 (수정 버튼 없음)
- [ ] /posts/[id] admin: "수정" 버튼 보임
- [ ] 수정 클릭 → 텍스트 인라인 편집 가능
- [ ] 플로팅 툴바 동작 (볼드, 이미지 등)
- [ ] 이미지 클릭 → 교체 가능
- [ ] "발행" → published → /posts 목록 노출
- [ ] "임시저장" → draft 유지
- [ ] "취소" → 읽기 모드 복귀

---

## T2. 뉴스레터 인라인 편집 + 발송 → frontend-dev

**파일 (소유권):**
- src/app/(admin)/admin/email/[id]/page.tsx (신규)
- src/components/email/NewsletterEditor.tsx (신규)
- src/components/email/NewsletterPreview.tsx (신규)
- src/components/email/SendConfirmModal.tsx (신규)

**의존:** T1 완료 후 (FloatingToolbar, InlineEditor 컴포넌트 재활용)

**Do:**
- /admin/email/[id] 페이지: 뉴스레터 미리보기 + 인라인 편집
- 레이아웃: 이메일처럼 보이는 카드 (max-width 600px, 중앙 정렬)
  - 브랜드 헤더 (BS CAMP WEEKLY, #F75D5D 그라데이션)
  - 본문 영역 (TipTap 인라인 편집)
  - CTA 버튼 (텍스트/링크 편집 가능)
  - 하단 (수신거부 링크 자동 포함)
- CTA 버튼 → 정보공유 원문 /posts/[id] 자동 연결
- 상단 바: [임시저장] [이메일 발송] [취소]
- "이메일 발송" 클릭 → SendConfirmModal:
  - 수신 대상: 드롭다운 (전체 leads / 소스별 / 구독자만)
  - 발송 예정 인원 실시간 표시
  - 제목(subject) 확인/수정
  - [발송 확인] [취소]
- 발송 시 TipTap HTML → 이메일 호환 HTML 변환 (인라인 스타일)

**완료 기준:**
- [ ] /admin/email/[id] 뉴스레터 미리보기 표시
- [ ] 인라인 편집 가능 (텍스트, 이미지, CTA)
- [ ] 브랜드 헤더 + 수신거부 링크 자동 포함
- [ ] "이메일 발송" → 수신자 선택 모달
- [ ] 모달에서 수신 인원 표시
- [ ] 발송 성공

---

## T3. 회원관리 구독자 통합 → backend-dev

**파일 (소유권):**
- src/app/(admin)/admin/members/page.tsx (수정)
- src/components/admin/SubscriberTab.tsx (신규)
- src/app/api/admin/subscribers/route.ts (신규 또는 이동)

**의존:** 없음 (T1과 병렬 가능)

**Do:**
- 회원관리 탭에 "구독자" 탭 추가 (기존 전체/리드/멤버/수강생/졸업생/관리자 뒤에)
- 구독자 탭 클릭 → leads 테이블에서 구독자 목록 표시:
  - 컬럼: 이름, 이메일, 소스, 구독일, 상태(활성/수신거부)
  - 소스별 필터 (gsheet_sync / newsletter_subscribe / other)
  - 이메일/이름 검색
  - 총 인원 표시
- 기존 /admin/email의 구독자 관리 UI → 이 탭으로 이동
- /admin/email에서 구독자 탭 제거 → 발송 전용으로 정리
- "이메일 구독자 1213명 관리하기 →" 링크 → 같은 페이지 구독자 탭으로 변경

**완료 기준:**
- [ ] /admin/members "구독자" 탭 → leads 목록 표시
- [ ] 소스별 필터 동작
- [ ] 검색 동작 (이메일, 이름)
- [ ] /admin/email → 구독자 탭 없음 (발송 전용)
- [ ] 기존 회원 탭 기능 안 깨짐

---

## T4. 콘텐츠 관리 구조 정리 → frontend-dev

**파일 (소유권):**
- src/app/(admin)/admin/content/page.tsx (수정)
- src/components/admin/ContentList.tsx (수정)

**의존:** T1, T2 완료 후

**Do:**
- 콘텐츠 관리 목록 각 행에:
  - "정보공유 편집" 링크 → /posts/[id]?edit=true (인라인 편집 모드로 바로 진입)
  - "뉴스레터 편집" 링크 → /admin/email/[id]
  - 상태 배지: draft(회색) / published(초록) / sent(파랑)
- 상태 필터: 전체 / 초안 / 발행됨 / 발송됨
- ?edit=true 쿼리 → /posts/[id] 접속 시 자동으로 편집 모드 진입

**완료 기준:**
- [ ] 콘텐츠 목록에서 정보공유/뉴스레터 편집 링크 동작
- [ ] 상태 배지 정확히 표시
- [ ] ?edit=true로 편집 모드 직접 진입 가능

---

## 검증 (전체 셀프 체크)
☐ npm run build 성공
☐ 기존 /posts 읽기 기능 안 깨짐
☐ 기존 비로그인 접근 동작
☐ 기존 이메일 발송 기능 안 깨짐
☐ admin 로그인 → 인라인 편집 → 발행 전체 플로우
☐ 뉴스레터 편집 → 발송 전체 플로우
☐ 회원관리 구독자 탭 동작
☐ 모바일 반응형 깨지지 않음
