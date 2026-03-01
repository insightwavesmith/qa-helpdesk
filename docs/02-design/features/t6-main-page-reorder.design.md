# T6. 메인페이지 순서 변경 — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### student-home.tsx 섹션 순서 (현재)
```
1. 검색바 (mb-12)
   - h1 "궁금한 것이 있으신가요?"
   - 검색 input (readOnly, /questions 링크)
2. 광고성과 (mb-12)
   - <StudentAdSummary data={adSummary} />
3. 공지사항 (mb-12)
4. 최근 Q&A
5. 정보공유 최신글 (mt-12)
```

### import 현황
```typescript
import { Search } from "lucide-react";  // 검색바 아이콘 → 제거 대상
```

## 2. 변경 설계

### 2-1. 검색바 제거

**제거 범위** (104~123줄):
```tsx
{/* 검색바 */}
<div className="mb-12">
  <div className="max-w-2xl mx-auto">
    <h1 className="text-3xl font-bold text-center mb-6 text-text-main">
      궁금한 것이 있으신가요?
    </h1>
    <Link href="/questions" className="block">
      <div className="relative search-focus rounded-xl">
        <input ... readOnly />
        <Search className="..." />
      </div>
    </Link>
  </div>
</div>
```

- import에서 `Search` 제거

### 2-2. 신뢰배너 추가

검색바 자리에 신뢰배너 삽입:

```tsx
{/* 신뢰배너 */}
<section className="mb-12">
  <div className="bg-[#f8faff] border border-[#e8edf5] rounded-xl p-5 flex items-center gap-5">
    <div className="flex-shrink-0">
      <img
        src="/images/meta-partner/badge-light.png"
        alt="Meta Business Partners"
        className="h-11"
      />
    </div>
    <div>
      <p className="font-bold text-[15px] text-gray-900">
        Meta가 인증한 비즈니스 파트너
      </p>
      <p className="text-[13px] text-slate-500 mt-0.5">
        자사몰사관학교는 Meta Business Partner로서 검증된 메타 광고 교육을 제공합니다.
      </p>
    </div>
  </div>
</section>
```

**모바일 반응형**:
```tsx
className="... flex items-center gap-5 max-sm:flex-col max-sm:text-center max-sm:gap-3"
```

### 2-3. 최종 섹션 순서

```
1. 신뢰배너 (mb-12)     ← NEW
2. 광고성과 (mb-12)     ← 기존 유지
3. 공지사항 (mb-12)     ← 기존 유지
4. 최근 Q&A             ← 기존 유지
5. 정보공유 최신글 (mt-12) ← 기존 유지
```

### 2-4. import 정리

**Before**:
```typescript
import { Search } from "lucide-react";
```

**After**:
```typescript
// Search import 제거 (더 이상 사용하지 않음)
```

> `next/image`의 `Image` 컴포넌트 사용을 권장하나, 기존 코드 패턴이 `<img>`를 사용하므로 일관성 유지. 필요 시 Next.js Image로 교체.

## 3. 목업 대조

| 목업 요소 | 구현 |
|----------|------|
| badge-light.png (h=44px) | `<img className="h-11">` (h-11 = 44px) |
| "Meta가 인증한 비즈니스 파트너" | `<p className="font-bold text-[15px]">` |
| 설명 텍스트 | `<p className="text-[13px] text-slate-500">` |
| bg-[#f8faff] border border-[#e8edf5] | 직접 적용 |
| rounded-xl p-5 flex items-center gap-5 | 직접 적용 |

## 4. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/app/(main)/dashboard/student-home.tsx` | 검색바 제거 + 신뢰배너 추가 + import 정리 |

- StudentAdSummary: 변경 없음
- 공지/QA/정보공유 섹션: 변경 없음
- Sidebar: 변경 없음

## 5. 에러 처리
- badge-light.png 이미지 로드 실패 → alt 텍스트 "Meta Business Partners" 표시
- 이미지 파일 존재 확인: `public/images/meta-partner/badge-light.png` (TASK.md에 "이미 존재" 명시)
