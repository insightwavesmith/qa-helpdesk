# 뉴스레터 에디터 도입 (Phase 1) — Design

## 1. 데이터 모델

### contents 테이블 확장
| 컬럼 | 타입 | Nullable | 설명 |
|------|------|----------|------|
| email_design_json | jsonb | YES | Unlayer 디자인 JSON |
| email_html | text | YES | Unlayer에서 export한 완전한 HTML |

- 기존 email_summary, email_subject, email_cta_text, email_cta_url 유지
- RLS: 기존 정책이 새 컬럼도 자동 커버 (행 단위 정책)

### SQL
```sql
ALTER TABLE contents
  ADD COLUMN email_design_json jsonb,
  ADD COLUMN email_html text;
```

## 2. API 설계

### PATCH /api/admin/content/[id]/newsletter (신규)
- **목적**: Unlayer 디자인 JSON + HTML 저장
- **인증**: admin 권한 필수
- **Body**:
```json
{
  "email_design_json": { ... },
  "email_html": "<!DOCTYPE html>..."
}
```
- **응답**: `{ success: true }` / `{ error: "..." }`
- **body size**: 10MB 허용
- **기존 Server Action 수정 없음**

### POST /api/admin/email/send (기존, 최소 수정)
- body에 `isUnlayerHtml: true` 플래그 추가
- `isUnlayerHtml && html` → renderEmail 스킵, html 직접 사용
- `replaceUnsubscribeUrl()` 적용은 동일

## 3. 컴포넌트 구조

### 신규 파일
- `src/components/admin/unlayer-editor.tsx` — Unlayer 에디터 래퍼 (use client)
- `src/lib/email-default-template.ts` — BS CAMP 기본 Unlayer JSON 템플릿
- `src/app/api/admin/content/[id]/newsletter/route.ts` — 저장 API

### 수정 파일
- `src/components/content/newsletter-edit-panel.tsx` — MDXEditor → Unlayer 교체
  - CTA 프리셋 카드 제거
  - 2컬럼 구조 → Unlayer 풀폭
  - 저장 → 전용 API route 호출
  - 테스트 발송 → isUnlayerHtml: true 플래그 추가
- `src/app/api/admin/email/send/route.ts` — isUnlayerHtml 분기 추가
- `src/types/database.ts` — contents 타입에 새 컬럼 추가
- `src/types/content.ts` — Content interface에 새 필드 추가

### UnlayerEditor 컴포넌트 설계
```tsx
interface UnlayerEditorProps {
  contentId: string;
  initialDesignJson?: object | null;
  hasLegacySummary?: boolean;
  onSave: (designJson: object, html: string) => Promise<void>;
  onExportHtml: (html: string) => void;
}
```
- projectId: 284274, displayMode: "email"
- onReady: 기존 디자인 JSON 로드 또는 기본 템플릿 로드
- exportHtml 메서드 expose (ref 기반)

### newsletter-edit-panel 상태 전환
- email_design_json 있음 → Unlayer에 디자인 로드
- email_design_json 없음 + email_summary 있음 → 기본 템플릿 + 안내 배너
- 둘 다 없음 → 기본 템플릿

## 4. 에러 처리
| 상황 | 코드 | 메시지 |
|------|------|--------|
| 비인증 | 401 | 인증이 필요합니다. |
| 비관리자 | 403 | 관리자 권한이 필요합니다. |
| 콘텐츠 없음 | 404 | 콘텐츠를 찾을 수 없습니다. |
| 저장 실패 | 500 | 저장에 실패했습니다. |
| body 크기 초과 | 413 | 본문이 너무 큽니다. |

## 5. 구현 순서 (체크리스트)
1. [T1] DB 컬럼 추가 → database.ts 타입 갱신 → content.ts 타입 갱신
2. [T2] react-email-editor 설치 → unlayer-editor.tsx → newsletter-edit-panel.tsx 교체
3. [T3] /api/admin/content/[id]/newsletter/route.ts 생성
4. [T4] email-default-template.ts 기본 템플릿 생성
5. [T5] send/route.ts에 isUnlayerHtml 분기 추가
6. npm run build 확인
