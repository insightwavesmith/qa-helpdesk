---
name: design-system
description: 프로젝트 디자인 시스템. 색상, 폰트, 반응형, 컴포넌트 패턴.
---

# 디자인 시스템

## 색상
- Primary: `#F75D5D`
- Primary hover: `#E54949`
- Gradient: `linear-gradient(135deg, #F75D5D, #E54949)`
- Background: `#ffffff` (라이트 모드만)
- Text: `#111827` (기본), `#6B7280` (보조)
- Border: `#E5E7EB`

## 폰트
- 본문: Pretendard
- 코드: JetBrains Mono
- UI 텍스트는 전부 한국어

## 반응형 브레이크포인트
- Mobile: 375px ~ 768px
- Tablet: 768px ~ 1024px
- Desktop: 1024px+
- 모바일 퍼스트. `min-width` 미디어 쿼리 사용.

## Tailwind 패턴
- `rounded-lg` (기본 8px)
- `shadow-sm` (카드), `shadow-md` (드롭다운)
- `p-4` (기본 패딩), `gap-4` (기본 갭)
- 버튼: `px-4 py-2 rounded-lg font-medium`

## 컴포넌트 규칙
- shadcn/ui 사용 안 함. 직접 Tailwind로 구현.
- 아이콘: Lucide React.
- 토스트: react-hot-toast.
- 에디터: MDXEditor (마크다운), Unlayer (이메일).

## 이메일 HTML
- 인라인 스타일 필수 (이메일 클라이언트 호환).
- 이미지: `width` 속성 + `display: block`.
- 테이블 레이아웃.
- 최대 너비: 600px.
