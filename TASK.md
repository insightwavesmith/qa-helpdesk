# TASK.md — 콘텐츠 파이프라인 유형 체계 통합

> 2026-02-11 | 카테고리×유형 2축 → 단일 유형 5가지로 통합, AI 생성 유형별 분기, email_summary 동시 생성

## 목표
1. 콘텐츠 분류를 `type` 단일축 5가지(education/case_study/webinar/notice/promo)로 통합
2. AI 콘텐츠 생성 시 유형별 프롬프트 자동 적용 + email_summary 동시 생성
3. 이메일 발송 시 유형별 템플릿 자동 매칭
4. 기존 데이터 마이그레이션 + 기존 파이프라인(Unlayer, renderEmail) 보호

## 레퍼런스
- 기획서: https://bs-camp-structure.vercel.app → "콘텐츠 파이프라인" 탭
- 현재 코드: `src/types/content.ts`, `src/actions/contents.ts`, `src/components/content/new-content-modal.tsx`
- 이메일 템플릿: `src/lib/email-renderer.ts`, `src/lib/email-templates.ts`
- Unlayer 에디터: `src/components/content/newsletter-edit-panel.tsx`

## 제약
- **`src/actions/contents.ts`의 `createContent`, `updateContent` 서버 액션 시그니처 변경 최소화** — 기존 호출부 전부 영향받음
- **Unlayer 경로 (isUnlayerHtml + email_design_json) 절대 건드리지 않기** — 기존 뉴스레터 편집/발송 파이프라인 보호
- **`renderEmail()` 기존 3개 템플릿(newsletter/webinar/performance) 유지** — promo만 추가
- **DB 마이그레이션은 backward compatible** — category 컬럼 당장 삭제 안 함 (deprecated 처리)
- email_summary A안 스펙: education 유형 800~1000자 + 이미지 1~2개

## 컨텍스트 문서
- `rules/dev.md` — 개발 규칙
- `CHANGELOG-MOZZI.md` — 최근 변경 이력

## 태스크

### T1. DB + 타입 확장 → backend-dev
- 파일: `src/types/content.ts`, `src/types/database.ts`, `supabase/migrations/` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] `ContentType` = `'education' | 'case_study' | 'webinar' | 'notice' | 'promo'`
  - [ ] `ContentCategory` 타입은 유지하되 deprecated 주석 추가
  - [ ] Supabase 마이그레이션 SQL: type 컬럼 CHECK 제약 확장 (5가지)
  - [ ] 기존 데이터 마이그레이션 (순서 중요):
    - `category='education' AND type='info'` → `type='education'`
    - `category='notice' AND type != 'promo'` → `type='notice'`
    - `category='case_study' AND type != 'promo'` → `type='case_study'`
    - `type='result'` → `type='case_study'` (리뷰 이슈 #1)
    - `type='promo'` → 그대로 유지
    - 나머지 → `type='education'` (기본값)
  - [ ] `createContent()` input에 `email_summary?: string | null` 추가 (리뷰 이슈 #2)
  - [ ] `generateNewsletterFromContents()` 함수의 구형 type 참조(info/result) → 새 5가지 type으로 업데이트 (리뷰 이슈 #3)
  - [ ] `npm run build` 타입 에러 0

### T2. 새 콘텐츠 모달 UI 변경 → frontend-dev
- 파일: `src/components/content/new-content-modal.tsx`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 카테고리+유형 2개 셀렉트 → 콘텐츠 유형 1개 셀렉트로 통합
  - [ ] 5가지 유형 표시: 📚 교육 / 📊 고객사례 / 🎓 웨비나 / 📢 공지 / 🎯 홍보
  - [ ] 선택된 유형이 `createContent()`에 `type`으로 전달
  - [ ] AI 입력은 기존 Textarea 유지 (이미 확장됨)
  - [ ] `handleCreate` useCallback 의존성 배열에 누락된 deps 추가 (리뷰 이슈 #5)
  - [ ] `npm run build` 성공

### T3. AI 생성 유형별 프롬프트 + email_summary 동시 생성 → backend-dev
- 파일: `src/actions/contents.ts` (generateContentWithAI 함수 + CONTENT_SYSTEM_PROMPT)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] `generateContentWithAI(topic, type)` — type 파라미터 추가
  - [ ] 유형별 시스템 프롬프트 매핑 (5개):
    - education: 마켓핏랩 교육톤, 3000자+, 넘버링 소제목
    - case_study: 비포-애프터, 수치 강조, 후기 톤
    - webinar: 일시/장소/내용/혜택, 참여 유도
    - notice: 간결한 안내문
    - promo: 혜택 강조, 긴급성, 소셜프루프
  - [ ] AI 응답에서 body_md + email_summary 동시 추출 (구분자 `---EMAIL_SUMMARY---` 사용)
  - [ ] email_summary 스타일도 유형별 프롬프트에 포함:
    - education: 800~1000자 + 핵심 포인트 3~4개
    - case_study: 성과 하이라이트 + ROAS/매출 수치
    - webinar: 어젠다 요약 + 일시 + 등록 CTA
    - notice: 변경사항 요약 1~2문단
    - promo: 핵심 혜택 + 기간 + CTA
  - [ ] 반환 타입: `{ title, bodyMd, emailSummary }` (emailSummary 추가)
  - [ ] `npm run build` 성공

### T4. createContent 호출부 연결 → frontend-dev
- 파일: `src/components/content/new-content-modal.tsx` (handleCreate, handleGenerate)
- 의존: T2 + T3 완료 후
- 완료 기준:
  - [ ] `handleGenerate()`에서 `generateContentWithAI(topic, type)` 호출 (유형 전달)
  - [ ] 반환된 emailSummary를 `createContent({ ..., email_summary })` 에 포함
  - [ ] AI 생성 완료 후 콘텐츠 상세 페이지로 이동 시 뉴스레터 탭에 email_summary 표시 확인

### T5. 콘텐츠 설정/사이드바 UI 업데이트 → frontend-dev
- 파일: `src/components/content/content-settings-panel.tsx`, `src/components/content/detail-sidebar.tsx`, `src/components/content/content-editor-dialog.tsx`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 카테고리 셀렉트 제거 → 유형 셀렉트 1개로 통합 (5가지)
  - [ ] 사이드바에 유형 라벨 표시 (기존 CATEGORY_LABEL → TYPE_LABEL)
  - [ ] content-editor-dialog에서도 유형 1개 셀렉트
  - [ ] `npm run build` 성공

### T6. promo 이메일 템플릿 추가 + 유형별 자동 매칭 → backend-dev
- 파일: `src/lib/email-templates.ts`, `src/lib/email-renderer.ts`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] `promoTemplate()` 신규 — 혜택 강조 + 강한 CTA 버튼 + BS CAMP 브랜딩
  - [ ] `TemplateName`에 `"promo"` 추가
  - [ ] `renderEmail("promo", props)` 동작 확인
  - [ ] 기존 newsletter/webinar/performance 템플릿 변경 없음

### T7. 콘텐츠 목록 필터 업데이트 → frontend-dev
- 파일: `src/app/(main)/admin/content/page.tsx`, `src/components/content/content-picker-dialog.tsx`
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 목록 필터에서 카테고리 → 유형으로 변경 (5가지)
  - [ ] content-picker-dialog도 유형 기준 필터
  - [ ] `npm run build` 성공

## 검증 (셀프 체크)
☐ npm run build 성공
☐ 기존 3개 활성 콘텐츠 편집/조회 정상
☐ 기존 Unlayer 뉴스레터 편집/저장 정상 (isUnlayerHtml 경로)
☐ 기존 email_summary 기반 발송 정상 (renderEmail 경로)
☐ 새 콘텐츠 → 유형 "홍보" 선택 → AI 생성 → email_summary 동시 저장 확인
☐ 새 콘텐츠 → 유형 "웨비나" 선택 → AI 생성 → 웨비나 톤 확인
☐ 콘텐츠 목록 필터 유형별 동작
☐ 보관(archived) 콘텐츠 필터 기존대로 동작
