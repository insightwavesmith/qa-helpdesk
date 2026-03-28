# UI 리디자인 V2 디자인 문서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 디자인 토큰 정의

### 1.1 컬러 시스템
```css
:root {
  /* Primary Brand Colors */
  --color-primary: #F75D5D;              /* 프라이머리 레드 */
  --color-primary-hover: #E54949;        /* 호버 상태 */

  /* Neutral Colors */
  --color-text: #37352f;                 /* 짙은 올리브 (메인 텍스트) */
  --color-text-secondary: #73726a;       /* 보조 텍스트 */
  --color-text-muted: #a8a29e;          /* 비활성 텍스트 */

  /* Background Colors */
  --color-background: #ffffff;           /* 흰색 배경 (라이트 모드 전용) */
  --color-background-soft: #faf9f8;     /* 더 밝은 배경 */
  --color-card: #ffffff;                 /* 카드 배경 */
  --color-card-hover: #fafafa;          /* 카드 호버 */

  /* Border & Lines */
  --color-border: #e5e7eb;              /* 기본 보더 */
  --color-border-light: #f3f4f6;        /* 연한 보더 */
  --color-border-focus: #F75D5D;        /* 포커스 보더 */

  /* Status Colors */
  --color-success: #10b981;             /* 답변 완료 */
  --color-warning: #f59e0b;             /* 답변 대기 */
  --color-error: #ef4444;               /* 오류 */
  --color-info: #3b82f6;                /* 정보 */

  /* Overlay & Shadow */
  --color-overlay: rgba(55, 53, 47, 0.1);
  --color-shadow: rgba(55, 53, 47, 0.08);
}
```

> **절대 규칙**: 다크 모드 없음. 라이트 모드 전용. (CLAUDE.md 규칙)

### 1.2 타이포그래피
```css
/* Fonts */
--font-primary: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

/* Font Sizes (clamp for responsive) */
--text-xs: clamp(0.75rem, 1vw, 0.875rem);     /* 12-14px */
--text-sm: clamp(0.875rem, 1.2vw, 1rem);      /* 14-16px */
--text-base: clamp(1rem, 1.4vw, 1.125rem);    /* 16-18px */
--text-lg: clamp(1.125rem, 1.6vw, 1.25rem);   /* 18-20px */
--text-xl: clamp(1.25rem, 2vw, 1.5rem);       /* 20-24px */
--text-2xl: clamp(1.5rem, 2.5vw, 1.875rem);   /* 24-30px */
--text-3xl: clamp(1.875rem, 3vw, 2.25rem);    /* 30-36px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 1.3 간격 & 크기
```css
/* Spacing (8pt grid) */
--space-1: 0.25rem;    /* 4px */
--space-2: 0.5rem;     /* 8px */
--space-3: 0.75rem;    /* 12px */
--space-4: 1rem;       /* 16px */
--space-5: 1.25rem;    /* 20px */
--space-6: 1.5rem;     /* 24px */
--space-8: 2rem;       /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
--space-20: 5rem;      /* 80px */

/* Container Widths */
--container-xs: 20rem;      /* 320px */
--container-sm: 24rem;      /* 384px */
--container-md: 28rem;      /* 448px */
--container-lg: 32rem;      /* 512px */
--container-xl: 36rem;      /* 576px */
--container-max: 80rem;     /* 1280px */
```

### 1.4 라운딩 & 그림자
```css
/* Border Radius */
--radius-sm: 0.375rem;     /* 6px */
--radius-md: 0.5rem;       /* 8px */
--radius-lg: 0.75rem;      /* 12px */
--radius-xl: 1rem;         /* 16px */
--radius-full: 9999px;

/* Shadows */
--shadow-sm: 0 1px 2px rgba(55, 53, 47, 0.05);
--shadow-md: 0 4px 6px rgba(55, 53, 47, 0.07);
--shadow-lg: 0 10px 15px rgba(55, 53, 47, 0.1);
--shadow-xl: 0 20px 25px rgba(55, 53, 47, 0.1);
```

### 1.5 애니메이션 & 트랜지션
```css
/* Transitions */
--transition-fast: all 0.15s ease-out;
--transition-normal: all 0.3s ease-out;
--transition-slow: all 0.5s ease-out;

/* Easing Functions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

## 2. 반응형 Breakpoints

```css
/* Mobile First Approach */
--breakpoint-sm: 640px;    /* 모바일 → 태블릿 */
--breakpoint-md: 768px;    /* 태블릿 → 작은 데스크탑 */
--breakpoint-lg: 1024px;   /* 작은 데스크탑 → 큰 데스크탑 */
--breakpoint-xl: 1280px;   /* 큰 데스크탑 → 초대형 */

/* Grid System */
모바일: 1열 (full-width)
태블릿: 2열 (gap-4)
데스크탑: 3열 (gap-6)
와이드: 4열 (gap-8)
```

## 3. 레이아웃 구조 (현재 구현)

### 역할별 레이아웃 분기
- admin, assistant → Sidebar 레이아웃 (DashboardSidebar)
- student, alumni, member, lead → StudentHeader 레이아웃

### Q&A 리스트 페이지 — 4탭 구조
```
[전체] [내 질문] [답변완료] [답변대기]
+ 카테고리 필터 (가로 스크롤 칩)
+ 검색바
```

### 질문 작성 페이지
- 폼 기반 카드 레이아웃
- 드롭다운 카테고리 선택
- 이미지 첨부 (파일 선택, 미리보기)
- 마크다운 에디터 없음 (textarea)

## 4. 컴포넌트 구조 (실제 파일)

### Layout Components
```
src/app/(main)/layout.tsx       — 역할별 레이아웃 분기
src/components/dashboard/
├── Sidebar.tsx                 — DashboardSidebar (admin/assistant용)
└── StudentHeader.tsx           — 학생/멤버용 헤더
```

### 공통 UI Components
- shadcn/ui + Radix UI 사용 (Button, Badge, Card, Dialog 등)
- TailwindCSS 4 유틸리티 기반

## 5. 접근성 (Accessibility)

### 색상 대비
- 텍스트: #37352f on #ffffff = 12.6:1 (AAA 등급)
- 보조 텍스트: #73726a on #ffffff = 5.1:1 (AA 등급)
- 포인트 컬러: #F75D5D on #ffffff = 4.5:1 (AA 등급)

### 키보드 네비게이션
- Tab 순서: 로고 → 네비게이션 → 검색 → 카드 → 페이지네이션
- Focus Visible: 명확한 아웃라인

## 6. 성능 최적화
- Next.js Image 컴포넌트 사용
- Pretendard Variable 폰트, font-display: swap
- 페이지별 코드 스플리팅

## 7. 구현 상태
- [x] 디자인 토큰 (Primary #F75D5D)
- [x] Pretendard 폰트 적용
- [x] 라이트 모드 전용 (다크 모드 없음)
- [x] 반응형 레이아웃 (모바일 375px+)
- [x] Q&A 4탭 구조
- [x] 역할별 레이아웃 분기
