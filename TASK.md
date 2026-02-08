# TASK: 정보공유 UI/UX 개선 + OG 이미지 개선

## 목표
수강생 관점에서 정보공유 페이지가 완성도 있어 보이도록 UI 정리.
마켓핏랩 블로그(mfitlab.com/solutions/blog) 수준의 여백/레이아웃.

## 레퍼런스
- 마켓핏랩 블로그: 좌우 여백 충분, max-width container, 카드에 이미지
- 현재 Q&A 페이지: `max-w-4xl mx-auto p-6` — 이 여백감이 기준

## 디자인 시스템
- Primary: #F75D5D, Hover: #E54949
- Background: white, Font: Pretendard
- Light mode only (다크모드 금지)

---

## T1: 정보공유 페이지 좌우 여백 + 컨테이너 정리 [frontend-dev]
- **파일**: `src/app/(main)/posts/page.tsx`
- 현재: `<div className="space-y-8">` — 여백 없음
- 수정: `<div className="max-w-6xl mx-auto px-6 py-8 space-y-8">`
- max-w-6xl (1152px): 카드 3열 + 여백. Q&A는 max-w-4xl인데 posts는 카드 레이아웃이라 더 넓어야 함
- **수강생 레이아웃(layout.tsx)**: `<main>` 에 기본 패딩 추가하지 말 것 — posts page.tsx에서 직접 처리
- **완료 기준**: 좌우 최소 24px 여백, 카드가 화면 끝에 붙지 않음

## T2: OG 이미지 카테고리별 차별화 [backend-dev]
- **파일**: `src/app/api/og/route.tsx`
- 현재: education/info 전부 파란색 (#3B82F6→#2563EB)
- 수정 — 카테고리별 색상 + 아이콘 텍스트:
  ```
  education/info: coral (#F75D5D → #E54949) + "📚"
  news/notice:    green (#10B981 → #059669) + "📰"  
  webinar:        orange (#F97316 → #EA580C) + "🎙️"
  default:        dark  (#1a1a2e → #2d2d4e) + "💡"
  ```
- OG 이미지에 subtle 패턴 추가 (grid dots 또는 diagonal lines) — CSS로 구현 가능
- **완료 기준**: `/api/og?title=테스트&category=education` → coral 배경, `/api/og?title=테스트&category=news` → green 배경

## T3: 카드 스타일 개선 [frontend-dev]
- **파일**: `src/components/posts/post-card.tsx`
- 현재: Thumbnail 컴포넌트가 OG API 호출 — 이건 유지
- 수정:
  1. 카드 테두리: `border-gray-100` → `border-gray-200` (약간 더 선명)
  2. hover 시 그림자 강화: `hover:shadow-lg` → `hover:shadow-md hover:-translate-y-0.5 transition-all`
  3. 카드 내 excerpt에서 마크다운 잔여물 정리 강화: `**[소식]**` 같은 raw markdown이 보이는 문제 수정
  4. getExcerpt 함수에서 `**`, `[`, `]` 제거 패턴 보강
- **완료 기준**: 카드 hover 시 미세하게 올라가는 애니메이션, 마크다운 잔여물 없음

## T4: 최신 콘텐츠 중복 제거 [frontend-dev]
- **파일**: `src/app/(main)/posts/posts-redesign-client.tsx`
- 현재: "전체" 탭에서 카테고리별 섹션 + "최신 콘텐츠" 섹션이 같은 포스트를 중복 노출
- 수정: "최신 콘텐츠" 섹션에서 카테고리 섹션에 이미 노출된 포스트 ID를 제외
- 또는: 카테고리별 섹션 3개 → 뉴스레터 CTA → 페이지네이션 (최신 콘텐츠 섹션 자체를 제거하고 카테고리 섹션 아래에 "전체 보기" 버튼)
- **마켓핏랩 패턴 참고**: 베스트 → 카테고리별 → CTA → 고객사례 → 최신 (중복 없음)
- dependsOn: T1
- **완료 기준**: 같은 카드가 페이지에 2번 나오지 않음

## T5: 코드 리뷰 [code-reviewer]
- T1~T4 전체 리뷰
- 체크: TypeScript 타입 오류, tailwind 클래스 유효성, 접근성(alt text 등)
- `npm run build` 통과 확인
- dependsOn: T1, T2, T3, T4

---

## 수정 대상 파일 목록
| 파일 | 담당 | 변경 내용 |
|------|------|-----------|
| `src/app/(main)/posts/page.tsx` | frontend-dev | 컨테이너 여백 |
| `src/app/api/og/route.tsx` | backend-dev | 카테고리별 색상 |
| `src/components/posts/post-card.tsx` | frontend-dev | 카드 스타일 |
| `src/app/(main)/posts/posts-redesign-client.tsx` | frontend-dev | 중복 제거 |

## 제약
- 한국어 UI, light mode only
- 기존 컴포넌트 최대한 유지, 새 파일 지양
- `npm run build` 에러 없이 통과
