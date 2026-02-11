# TASK.md — 뉴스레터 에디터 도입 (Phase 1)
> 2026-02-11 | 마크다운 기반 이메일 편집 → Unlayer 드래그앤드롭 에디터 전환
> 리뷰 v1+v2 반영 완료: 2026-02-11 11:51

## 목표
콘텐츠 허브 관리자의 뉴스레터 편집 기능에 Unlayer 드래그앤드롭 에디터를 도입한다.
- 관리자가 스티비처럼 블록을 끌어다 놓아 이메일을 디자인할 수 있다
- 디자인 JSON + 렌더링된 HTML을 DB에 저장/불러올 수 있다
- 저장된 HTML로 이메일 발송이 된다
- BS CAMP 기본 뉴스레터 템플릿 1개가 프리로드된다

## ⚠️ 데이터 파이프라인 보호 원칙
**기존 동작하는 파이프라인을 절대 깨뜨리지 않는다.**
- 기존 email_summary → mdToPreviewHtml → newsletterTemplate → nodemailer 경로는 100% 유지
- Unlayer는 별도 경로(email_html)로 추가. 기존 경로에 영향 없어야 함
- 기존 Server Action(`src/actions/contents.ts`)은 수정하지 않음
- 기존 email/send route의 `renderEmail("newsletter", ...)` 폴백 경로 건드리지 않음
- 새 기능 추가 시 기존 코드 삭제/변경 최소화. 분기(if email_html)로 처리

## 레퍼런스
- Unlayer React 문서: https://docs.unlayer.com/builder/react-component
- Unlayer Project ID: 284274
- 스티비 뉴스레터 흐름 분석: workspace/projects/active/stibee-research.md
- 마켓핏랩 뉴스레터 레이아웃: 테두리 없음, 본문 직접 배치, 이미지 풀와이드

## 현재 코드 구조 (필독)
- **content 저장**: `src/actions/contents.ts` → `updateContent` Server Action (API route 아님!)
- **이메일 발송**: `src/app/api/admin/email/send/route.ts` → body에서 `{ html, template, templateProps }` 받음
- **발송 렌더링**: html이 없으면 `renderEmail("newsletter", { subject, bodyHtml })` 호출
- **수신거부**: `src/lib/email-templates.ts`에 `{{UNSUBSCRIBE_URL}}` placeholder → `replaceUnsubscribeUrl()` 치환
- **타입**: `src/types/content.ts` (Content interface) + `src/types/database.ts` (DB 타입)
- **CTA 설정**: newsletter-edit-panel.tsx에 CTA 프리셋 UI 있음 (전체글 읽기, 웨비나 신청 등)

## 제약
- Next.js + React + TypeScript + Tailwind CSS
- Supabase (PostgreSQL) — contents 테이블에 컬럼 추가
- Unlayer react-email-editor 무료 플랜 (projectId: 284274)
- 무료 플랜 제한: Localization 불가, Custom Storage 불가 (기본 Unlayer S3, 파일당 2MB), Stock Images/Image Editor 불가
- 무료 플랜에서 되는 것: 이미지 업로드(기본 S3, 2MB), URL 입력, 모든 기본 블록, Device Preview
- 기존 email_summary 컬럼은 유지 (하위호환)
- 기존 관리자 인증/권한 체계 그대로 유지
- 이메일 발송은 기존 nodemailer + Gmail SMTP 경로 사용
- `react-email-editor` 설치 시 React 19 peer dep 충돌 가능 → `--legacy-peer-deps` 사용

## 기존 에디터 정리 방침
1. `/admin/content/[id]` 뉴스레터 탭 (MDXEditor `newsletter-edit-panel.tsx`) → **Unlayer로 교체 (이번 Phase 1)**
2. `/admin/email` 페이지 (TipTap `email-split-editor.tsx`) → **Phase 1에서는 유지, Phase 2에서 폐기 검토**
3. `/admin/email/[id]` 페이지 → **미사용 확인 후 삭제 대상**
4. **기존 CTA 프리셋 UI** → Unlayer 에디터 내에서 버튼 블록으로 대체. 기존 CTA 설정 카드 제거.

## 기존 콘텐츠 전환 UX
- email_design_json이 있는 콘텐츠: Unlayer에 디자인 JSON 로드
- email_design_json이 없고 email_summary만 있는 콘텐츠: BS CAMP 기본 템플릿 로드 + 상단에 안내 배너 "기존 텍스트 뉴스레터가 있습니다. 아래 에디터에서 새로 디자인하세요."
- 둘 다 없는 새 콘텐츠: BS CAMP 기본 템플릿 로드

## AI 요약 기능 연계
- Phase 1: AI 요약은 기존 그대로 (email_summary 저장). Unlayer 에디터는 별도 저장 경로.
- Phase 2: AI가 Unlayer JSON 직접 생성 방식으로 전환 검토

## 태스크

### T1. DB 스키마 확장 + 타입 갱신 → backend-dev
- 파일: 직접 SQL, `src/types/database.ts`, `src/types/content.ts`
- 의존: 없음
- 작업:
  - contents 테이블에 컬럼 추가:
    - `email_design_json` (jsonb, nullable) — Unlayer 디자인 JSON
    - `email_html` (text, nullable) — Unlayer에서 export한 HTML
  - 기존 email_summary 컬럼은 그대로 유지
  - `src/types/database.ts` 타입 갱신
  - `src/types/content.ts` Content interface에 새 필드 추가
- 완료 기준:
  - [ ] 두 컬럼이 contents 테이블에 존재
  - [ ] 기존 데이터에 영향 없음
  - [ ] RLS 정책이 새 컬럼도 커버
  - [ ] `database.ts` + `content.ts` 타입에 새 컬럼 반영됨

### T2. Unlayer 에디터 컴포넌트 구현 → frontend-dev
- 파일:
  - package.json (react-email-editor 추가)
  - src/components/admin/unlayer-editor.tsx (신규)
  - src/components/admin/newsletter-edit-panel.tsx (기존 MDXEditor → Unlayer로 교체)
- 의존: 없음 (T1과 병렬 가능, 저장 API 연동만 T3 이후)
- 작업:
  - `npm install react-email-editor --legacy-peer-deps`
  - **SSR 비활성화 필수**: `dynamic(() => import(...), { ssr: false })` 사용
  - UnlayerEditor 컴포넌트 생성:
    - projectId: 284274
    - displayMode: "email"
    - `"use client"` 컴포넌트
    - onReady에서 기존 디자인 JSON 로드 (있으면)
    - 없으면 BS CAMP 기본 템플릿 로드
    - email_summary만 있는 경우: 기본 템플릿 + 안내 배너
  - Unlayer를 **풀폭으로 배치** (기존 2컬럼 구조 → Unlayer 내장 미리보기로 대체)
  - **기존 CTA 프리셋 카드 제거** (Unlayer 에디터 내 버튼 블록으로 대체)
  - 저장 버튼: exportHtml → design JSON + HTML을 전용 API로 전송
  - 미리보기: Unlayer 내장 Device Preview 활용
  - 테스트 발송 버튼: exportHtml → send API에 `{ html: exportedHtml }` 전달
- 완료 기준:
  - [ ] 뉴스레터 탭에서 Unlayer 에디터 렌더링됨 (SSR 에러 없음)
  - [ ] 블록 드래그앤드롭 정상 작동
  - [ ] 저장 → DB 저장 → 새로고침 시 디자인 복원
  - [ ] 테스트 발송 기능 동작

### T3. Unlayer 전용 저장 API route 신규 생성 → backend-dev
- 파일:
  - src/app/api/admin/content/[id]/newsletter/route.ts (신규)
- 의존: T1 완료 후 (T2와 병렬 가능)
- 작업:
  - **기존 `src/actions/contents.ts` Server Action은 수정하지 않음** (파이프라인 보호)
  - 새 API route 생성: `PATCH /api/admin/content/[id]/newsletter`
    - body: `{ email_design_json, email_html }`
    - Supabase service client로 해당 content의 두 필드만 업데이트
    - admin 권한 확인
  - **body size limit**: route 단위로 `export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }` 설정
    - 또는 Next.js 16 App Router 방식: `export const maxDuration` + request body를 수동 파싱
- 완료 기준:
  - [ ] 새 API route로 디자인 JSON + HTML 저장 정상
  - [ ] 대용량 JSON (5MB) 저장 시 에러 없음
  - [ ] 기존 Server Action(`updateContent`)에 변경 없음
  - [ ] admin 권한 없으면 403

### T4. BS CAMP 기본 뉴스레터 템플릿 → frontend-dev
- 파일:
  - src/lib/email-default-template.ts (신규)
- 의존: T2 완료 후
- 작업:
  - Unlayer JSON 형식의 기본 템플릿 생성:
    - 헤더: BS CAMP 로고 텍스트 + 빨간 라인 (기존 스타일)
    - 본문: 제목 블록 + 텍스트 블록 + 이미지 블록 + 텍스트 블록
    - CTA: 빨간 버튼 "전체 아티클 읽기 →"
    - 푸터: 자사몰 사관학교 정보 + **`{{UNSUBSCRIBE_URL}}` placeholder 포함 필수** (replaceUnsubscribeUrl 치환용)
  - 600px 너비, 테두리 없음 (스티비/마켓핏랩 스타일)
  - 이미지 width: 100% (풀와이드)
  - 본문 좌우 패딩: 24px
- 완료 기준:
  - [ ] 새 콘텐츠에서 뉴스레터 탭 열면 기본 템플릿이 로드됨
  - [ ] 기본 템플릿의 푸터에 `{{UNSUBSCRIBE_URL}}` 존재
  - [ ] 발송 시 이메일 클라이언트에서 정상 렌더링
  - [ ] 모바일에서도 깨지지 않음

### T5. 이메일 발송 Unlayer 분기 추가 → backend-dev
- 파일:
  - src/app/api/admin/email/send/route.ts (기존 수정 — 최소 변경)
- 의존: T3, T4 완료 후
- 작업:
  - **핵심: Unlayer exportHtml은 이미 DOCTYPE + head + body 포함한 완전한 HTML 반환**
  - 기존 발송 로직 수정 (send/route.ts):
    - 프론트에서 `{ html: unlayerHtml }` 형태로 보내면 → `renderEmail` 호출 스킵 → html을 fullHtml로 직접 사용
    - **이미 `html` 필드로 직접 전달하는 경로가 없음** → 현재는 항상 `renderEmail("newsletter", { bodyHtml: html })` 호출
    - 수정: body에 `isUnlayerHtml: true` 플래그 추가, true면 `renderEmail` 건너뛰고 html 직접 사용
    - 수신거부: `replaceUnsubscribeUrl(fullHtml, unsubUrl)` 적용 (Unlayer HTML 안의 `{{UNSUBSCRIBE_URL}}` 치환)
  - **기존 경로 (template/templateProps, 또는 html → renderEmail 래핑) 절대 변경 안 함**
- 완료 기준:
  - [ ] Unlayer HTML 발송 시 이중 래핑 안 됨 (renderEmail 스킵 확인)
  - [ ] Unlayer HTML 발송 시 수신거부 링크 정상 치환
  - [ ] 기존 email_summary 기반 발송 100% 정상 동작 (폴백)

## 태스크 의존성
```
T1 (DB + 타입) ──── T3 (저장 API route 신규)
                              │
T2 (에디터 UI) ──── T3 연동 ──── T4 (기본 템플릿, 수신거부 포함)
                                              │
                                        T5 (발송 분기)
```
- T1/T2 병렬 진행
- T3는 T1 완료 후 (타입 필요)
- T4는 T2 완료 후 (에디터에서 테스트)
- T5는 T3+T4 완료 후 (발송 분기 + 수신거부 placeholder 검증)

## 리스크
| 리스크 | 영향 | 대응 |
|--------|------|------|
| exportHtml 이중 래핑 | 이메일 깨짐 | T5에서 isUnlayerHtml 플래그로 renderEmail 스킵 |
| body size limit | 대형 JSON 저장 실패 | 전용 API route에서 10MB 설정 |
| SSR 충돌 | 서버 렌더링 에러 | dynamic import + ssr: false |
| React 19 peer dep 충돌 | 설치 실패 | --legacy-peer-deps |
| 수신거부 placeholder 누락 | 법적 이슈 | T4에서 필수 포함, 검증 체크리스트 |
| 기존 파이프라인 손상 | 발송 장애 | Server Action 미수정, 기존 renderEmail 경로 보존 |

## 검증 (셀프 체크)
☐ npm run build 성공
☐ 기존 관리자 기능 안 깨졌나 (콘텐츠 목록, 기본 정보 탭, 본문 편집 탭)
☐ **기존 email_summary 기반 테스트 발송 → 정상 (파이프라인 보호 확인)**
☐ 새 콘텐츠 → 뉴스레터 탭 → Unlayer 에디터 로드 (SSR 에러 없음)
☐ 블록 추가/삭제/이동 정상
☐ 이미지 블록에 URL 입력 → 미리보기에서 표시
☐ 이미지 직접 업로드 (2MB 이하) → 정상 표시
☐ 저장 → 새로고침 → 디자인 복원
☐ 대용량 디자인 JSON 저장 시 에러 없음
☐ Unlayer 테스트 발송 → Gmail 정상 렌더링 (이중 래핑 없음)
☐ Unlayer 발송 이메일에서 수신거부 링크 정상 동작
☐ 기존 email_summary만 있는 콘텐츠 열면 안내 배너 + 기본 템플릿
☐ 모바일 미리보기 정상
☐ 기존 CTA 프리셋으로 저장한 콘텐츠 열어도 에러 없음
