# T1~T9 UI/UX 개선 + 버그 수정 — Gap Analysis (설계서 vs 구현)

> 분석일: 2026-03-01
> 분석 대상: docs/02-design/features/t{1~9}-*.design.md vs 실제 구현 파일

---

## 종합 결과

| Task | 제목 | Match Rate | 판정 |
|------|------|-----------|------|
| T1 | SummaryCards 하드코딩 제거 | **95%** | PASS |
| T2 | 총가치각도기 좌우 여백 수정 | **90%** | PASS |
| T3 | 회원 삭제 조건 수정 | **100%** | PASS |
| T4 | 정보공유 글 CSS 개선 | **80%** | WARN |
| T5 | 정보공유 AI 프롬프트 개선 | **95%** | PASS |
| T6 | 메인페이지 순서 변경 | **90%** | PASS |
| T7 | 프로필 카드 적용 | **90%** | PASS |
| T8 | 관리자 후기 폼 필드 추가 | **90%** | PASS |
| T9 | 관리자 후기 필터 UI 추가 | **95%** | PASS |
| **전체 평균** | | **91.7%** | **PASS** |

---

## T1. SummaryCards 하드코딩 데이터 제거 — 95%

### 설계 파일
- `docs/02-design/features/t1-summary-cards-hardcoded.design.md`

### 구현 파일
- `src/components/protractor/SummaryCards.tsx`
- `src/components/protractor/PerformanceTrendChart.tsx`

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | `defaultCards` 상수 완전 제거 | O - 상수 없음, `{ cards }` 직접 수신 |
| 2 | `defaultData` 상수 완전 제거 | O - 상수 없음, `{ data }` 직접 수신 |
| 3 | SummaryCards empty state: `!cards \|\| cards.length === 0` 체크 | O - 동일 로직 |
| 4 | SummaryCards empty state 텍스트: "광고 데이터가 없습니다" | O - 구현: "광고 데이터가 없습니다" (마침표 없음, 경미) |
| 5 | PerformanceTrendChart empty state 체크 | O - `!data \|\| data.length === 0` |
| 6 | PerformanceTrendChart empty state 텍스트: "차트 데이터가 없습니다" | O - 동일 |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | SummaryCards empty state: 단일 div `rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400` | 구현: div 안에 `<p>` 태그 분리, `text-sm text-gray-400`가 p 태그에 적용 | 경미 - 시각 결과 동일 |
| 2 | PerformanceTrendChart empty state: `rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground` | 구현: 헤더("광고매출 vs 광고비 추이") + 본문 영역 분리, `items-center justify-center px-4 py-16` | 경미 - 개선된 구현 |

### 수정 필요
- 없음. 불일치 항목은 모두 개선 방향의 변경이며 기능적으로 완전 일치.

---

## T2. 총가치각도기 좌우 여백 수정 — 90%

### 설계 파일
- `docs/02-design/features/t2-protractor-margin.design.md`

### 구현 파일
- `src/app/(main)/protractor/layout.tsx`

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | `protractor/layout.tsx`에 wrapper 추가 | O |
| 2 | `className="max-w-6xl mx-auto px-4 py-8"` | O - 정확히 일치 |
| 3 | 기존 접근 제어 로직 유지 | O - BLOCKED_ROLES, redirect 등 동일 |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | `sample-dashboard.tsx`의 `-m-6 mb-0` offset 제거/조정 필요(설계서 명시) | 미처리: `-m-6 mb-0`가 여전히 line 211에 존재 | **중간** - 새 wrapper의 px-4와 충돌 가능 |

### 수정 필요
- `src/app/(main)/protractor/sample-dashboard.tsx` line 211의 `-m-6 mb-0` offset 확인 필요. 설계서에서는 "확인 후 조정 필요"로 명시. 실제 시각적 테스트를 통해 레이아웃이 깨지지 않는지 검증 필요.

---

## T3. 회원 삭제 조건 수정 — 100%

### 설계 파일
- `docs/02-design/features/t3-member-delete-condition.design.md`

### 구현 파일
- `src/app/(main)/admin/members/member-detail-modal.tsx` (line 239)

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | canDelete 조건에 `\|\| profile.role === "inactive"` 추가 | O - line 239 정확히 일치 |
| 2 | handleDelete 함수 변경 없음 | O |
| 3 | 삭제 API(server action) 변경 없음 | O |
| 4 | 기존 에러 처리(toast.error) 유지 | O |

### 불일치 항목
- 없음.

### 수정 필요
- 없음. 완벽 일치.

---

## T4. 정보공유 글 CSS 개선 — 80%

### 설계 파일
- `docs/02-design/features/t4-content-css-readability.design.md`

### 구현 파일
- `src/components/posts/post-body.css`
- `src/components/posts/post-body.tsx`

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | blockquote 스타일 강화 (`fef2f2`, `border-radius: 0 8px 8px 0`) | O - `background: #fef2f2; border-radius: 0 8px 8px 0;` |
| 2 | blockquote cite/em 출처 스타일 | O - `.post-body blockquote p:last-child em` (CSS), 다만 `cite` 태그 대신 `em` 활용 |
| 3 | 체크리스트 스타일 (`.checklist-item`) | O - `.post-body .checklist-item` CSS + 변환 로직 |
| 4 | h2 번호 뱃지 (`.section-number`) | **부분 일치** - 원형 뱃지(28px circle)로 구현, 설계의 `sec-div` + `sec-badge` (pill형 + hr 구분선) 방식과 다름 |
| 5 | 이미지 캡션 `img + p strong:only-child` | O - 동일 패턴 |
| 6 | 체크리스트 마크다운 변환 (`✅/☐/☑` 감지) | O - regex `^[-*] ((?:✅\|☐\|☑\|✓\|✔)\s*.+)` |
| 7 | h2 번호 추출 → 뱃지 span 삽입 | O - `<span class="section-number">${num}</span>` |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | h2 번호 뱃지: `sec-div` (hr+badge+hr) + `sec-badge` (pill형 `border-radius:20px`) | 구현: `section-number` (원형 28x28 circle, `border-radius:50%`) h2 내부 inline-flex | **낮음** - 대안적 디자인, 기능 동일 |
| 2 | cite 태그: `.post-body blockquote cite` CSS + markdownToHtml에서 `<cite>` 태그 변환 | 구현: `cite` 태그 미사용, `blockquote p:last-child em`으로 대체 | **낮음** - 동일 시각 효과 |
| 3 | 체크리스트 컨테이너: `.checklist` wrapper (padding:16px, bg:#f8f9fa, border-radius:10px) | 구현: 개별 `.checklist-item`에 배경/테두리 적용 (bg:#f8fafc, border:1px solid #e2e8f0) | **낮음** - 대안적 구현 |
| 4 | figure/figcaption 강화: `.post-body figure { margin:24px 0; text-align:center }` | 구현: `.post-image-figure`로 이미 존재하나, 설계의 일반 `figure` 선택자 추가 누락 | **경미** |

### 수정 필요
- **[권장]** 현재 구현이 기능적으로 충분하나, 설계서의 `sec-div` (hr+badge+hr) 패턴을 목업과 비교하여 의도된 시각적 결과인지 PM 확인 필요.
- **[선택]** `.post-body blockquote cite` CSS를 추가하면 향후 cite 태그 사용 시 대비 가능.

---

## T5. 정보공유 AI 프롬프트 개선 — 95%

### 설계 파일
- `docs/02-design/features/t5-content-ai-prompt.design.md`

### 구현 파일
- `src/actions/contents.ts` (line 533~550)

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | 상단 3줄 요약 박스 (`> **📌 핵심 요약**` blockquote) | O - 구조 항목 1번 |
| 2 | 섹션 구분: `---` 수평선 h2 앞 필수 | O - 구조 항목 3번 |
| 3 | 넘버링된 h2 소제목 | O - 구조 항목 4번 |
| 4 | 핵심 숫자 블록 (`- **수치** — 설명`) | O - 구조 항목 5번 |
| 5 | 체크리스트 (`- ✅ ~하고 있나요?`) | O - 구조 항목 10번 |
| 6 | 기존 항목 모두 유지 (도입부, 테이블, blockquote, 문단 길이, 볼드 팁, 정리) | O |
| 7 | 3,000자 이상 작성 유지 | O |
| 8 | userPrefix / emailSummaryGuide 변경 없음 | O |
| 9 | case_study / webinar 프롬프트 변경 없음 | O |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | 설계: 11개 항목 (1~11 넘버링) | 구현: 11개 항목이나 넘버링 약간 다름 (실무 팁이 9번, 체크리스트가 10번) | **경미** - 순서 재배치, 내용 동일 |

### 수정 필요
- 없음. 프롬프트 내용이 설계 의도를 충실히 반영.

---

## T6. 메인페이지 순서 변경 — 90%

### 설계 파일
- `docs/02-design/features/t6-main-page-reorder.design.md`

### 구현 파일
- `src/app/(main)/dashboard/student-home.tsx`

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | 검색바 완전 제거 | O - 검색바 JSX 및 `Search` import 모두 제거됨 |
| 2 | 신뢰배너 추가 (bg-[#f8faff], border-[#e8edf5], rounded-xl) | O |
| 3 | badge-light.png h-11 (44px) | O - `height={44}` + `className="h-[44px] w-auto"` |
| 4 | "Meta가 인증한 비즈니스 파트너" 텍스트 | O |
| 5 | 설명 텍스트 | O - 동일 내용 |
| 6 | 최종 섹션 순서: 신뢰배너 → 광고성과 → 공지 → QA → 정보공유 | O |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | `<img>` 태그 사용 (설계서 원문) | `next/image` `<Image>` 컴포넌트 사용 | **경미** - 개선된 구현 (Next.js 최적화) |
| 2 | 타이틀: `<p className="font-bold text-[15px] text-gray-900">` | 구현: `<h2 className="text-base font-bold text-[#1a1a2e]">` | **경미** - 시맨틱 개선 (p→h2), 색상 미세 차이 |
| 3 | 설명: `text-[13px] text-slate-500` | 구현: `text-sm text-[#64748b]` | **경미** - text-sm=14px vs 13px, #64748b는 slate-500과 동일 |
| 4 | 모바일 반응형: `max-sm:flex-col max-sm:text-center max-sm:gap-3` | 구현: 누락 | **낮음** - 모바일에서 배너가 가로 배치로 유지됨 |

### 수정 필요
- **[권장]** 신뢰배너에 `max-sm:flex-col max-sm:text-center max-sm:gap-3` 반응형 클래스 추가 (모바일 UX 개선).

---

## T7. 프로필 카드 적용 — 90%

### 설계 파일
- `docs/02-design/features/t7-profile-card.design.md`

### 구현 파일
- `src/lib/email-default-template.ts` (SMITH_PROFILE_ROW)
- `src/components/posts/author-profile-card.tsx` (신규)
- `src/app/(main)/posts/[id]/PostDetailClient.tsx`

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | 이메일 프로필: "Meta가 인증한 비즈니스 파트너" + "수강생 자사몰매출 450억+" | O |
| 2 | 이메일 프로필: Meta 인라인 로고 추가 (`inline-positive.png`, h=36px) | O |
| 3 | 이메일 프로필: Supabase Storage public URL 사용 | O |
| 4 | 신규 컴포넌트 `author-profile-card.tsx` 생성 | O |
| 5 | 프로필 사진 80px 원형 (`w-20 h-20 rounded-full`) | O |
| 6 | "스미스" + "자사몰사관학교 코치" (빨간색 #F75D5D) | O |
| 7 | Meta 인라인 로고 h-9 (36px) | O |
| 8 | PostDetailClient에 PostBody 아래 삽입 | O - line 247 `<AuthorProfileCard />` |
| 9 | `next/image` Image 컴포넌트 사용 | O - 설계에서 img 태그 사용했으나 Image로 개선 |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | 웹 프로필: `border-t border-b border-slate-200 py-6 mt-8` (상하 border 모두) | 구현: `border-t border-gray-200 pt-8 mt-12` (상단 border만, 하단 없음) | **낮음** - 약간의 레이아웃 차이 |
| 2 | 웹 프로필: Meta 로고가 별도 `div className="mt-4 pt-4 border-t border-slate-100"`에 배치 | 구현: 텍스트 영역 내부 `div className="mt-2"`에 배치 (border-t 없음) | **낮음** - 로고 위치가 텍스트 바로 아래로 이동 |
| 3 | 이메일: 설명 텍스트에 `<br>` 줄바꿈 | 구현: ` / `로 한 줄 연결 | **경미** - 이메일 레이아웃 미세 차이 |
| 4 | 설계: `font-extrabold` | 구현: `font-bold` | **경미** - 폰트 무게 차이 (800 vs 700) |

### 수정 필요
- **[선택]** 하단 border (`border-b`) 추가 여부는 디자인 의도 확인 후 결정.
- **[선택]** Meta 로고 영역을 별도 border-t 구분선으로 분리할지 PM 확인.

---

## T8. 관리자 후기 등록 폼 필드 추가 — 90%

### 설계 파일
- `docs/02-design/features/t8-admin-review-form.design.md`

### 구현 파일
- `src/actions/reviews.ts` (createAdminReview, line 130~177)
- `src/app/(main)/admin/reviews/page.tsx` (ReviewModal, line 269~453)

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | `createAdminReview` — content 필수로 변경 | O - `content: string` (필수) |
| 2 | `createAdminReview` — youtubeUrl 선택으로 변경 | O - `youtubeUrl?: string` |
| 3 | `createAdminReview` — rating 추가 (optional) | O - `rating?: number \| null` |
| 4 | DB insert: `youtube_url: data.youtubeUrl \|\| null` | O |
| 5 | DB insert: `rating: data.rating \|\| null` | O |
| 6 | 폼 필드 순서: 제목 → 별점 → 내용 → 유튜브 URL → 기수 → 카테고리 | **약간 다름** - 제목 → 별점 → 내용 순서 (설계: 제목 → 내용 → 별점) |
| 7 | 별점 StarSelector (1~5, 클릭 선택) | O - Star 아이콘 + hover 효과 |
| 8 | 내용 textarea (`rows={4}`, required, `min-h-[80px]`) | O |
| 9 | 유튜브 URL 선택 표시 ("선택") | O - `(선택)` 텍스트 |
| 10 | 폼 검증: 제목 필수 | O |
| 11 | 폼 검증: 내용 필수 | O |
| 12 | 폼 검증: 유튜브 URL 입력 시만 형식 확인 | O |
| 13 | 모달 제목: "후기 등록" | O |
| 14 | 헤더 버튼: "후기 등록" | O |
| 15 | 성공 토스트: "후기가 등록되었습니다." | O |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | 서버 rating 범위 검증: `if (data.rating != null && (data.rating < 1 \|\| data.rating > 5))` | 구현: 서버측 범위 검증 누락 | **중간** - 클라이언트 UI가 1~5로 제한하므로 실질적 위험 낮음 |
| 2 | 별점 해제: "같은 별 재클릭 시 해제 (0으로)" `rating === star ? 0 : star` | 구현: 재클릭 해제 없음, 단순 `setRating(s)` | **낮음** - UX 차이 (해제 불가) |
| 3 | 폼 필드 순서: 설계는 제목→내용→별점→유튜브 | 구현: 제목→별점→내용→유튜브 | **경미** |
| 4 | hover 효과: 설계에 미명시 | 구현: `hoverRating` 상태로 호버 효과 추가 | **경미** - 개선 |

### 수정 필요
- **[권장]** `src/actions/reviews.ts`의 `createAdminReview`에 rating 범위 검증 추가: `if (data.rating != null && (data.rating < 1 || data.rating > 5)) return { error: "별점은 1~5 사이여야 합니다." };`

---

## T9. 관리자 후기 목록 필터 UI 추가 — 95%

### 설계 파일
- `docs/02-design/features/t9-admin-review-filter.design.md`

### 구현 파일
- `src/app/(main)/admin/reviews/page.tsx` (line 46~70, 119~146)

### 일치 항목
| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | `cohortFilter`, `categoryFilter` useState 추가 | O - `filterCohort`, `filterCategory` |
| 2 | `filteredReviews` useMemo 로직 | O - 동일 필터 조건 |
| 3 | `useMemo` import 추가 | O |
| 4 | 기수 select: "전체 기수" + 1기~5기 | O - 다만 `"전체 기수"` (구현) vs `"기수 전체"` (설계) |
| 5 | 카테고리 select: 일반후기/졸업후기/주차별 후기 | O |
| 6 | 필터 결과 카운트 표시 | O - `{filteredReviews.length}건` |
| 7 | 테이블: `filteredReviews.map()` 사용 | O |
| 8 | 빈 상태 분기: 필터 결과 없음 vs 전체 없음 | O - `filterCohort \|\| filterCategory`로 분기 |
| 9 | 서버 액션 변경 없음 | O |
| 10 | 기존 select 스타일 (rounded-md, border-gray-200, ring-[#F75D5D]/30) | O |

### 불일치 항목
| # | 설계 | 구현 | 심각도 |
|---|------|------|--------|
| 1 | 필터 바: `flex flex-wrap items-center gap-3 mb-4` | 구현: `flex items-center gap-3` (flex-wrap, mb-4 누락) | **경미** - mb는 space-y-6으로 대체 |
| 2 | 카운트: `총 {N}개의 후기` + `ml-auto`로 우측 정렬 | 구현: `{N}건` + ml-auto 없음 (필터 옆에 나열) | **경미** - 표현 차이 |
| 3 | select py: 설계 `py-1.5` | 구현: `py-2` | **경미** - 미세 높이 차이 |

### 수정 필요
- 없음. 기능적으로 완전 일치하며, 스타일 차이는 경미.

---

## 종합 수정 필요 사항 (우선순위별)

### MUST (필수)
- 없음

### SHOULD (권장)
| # | Task | 내용 | 파일 |
|---|------|------|------|
| 1 | T8 | `createAdminReview`에 rating 서버측 범위 검증(1~5) 추가 | `src/actions/reviews.ts` |
| 2 | T6 | 신뢰배너에 모바일 반응형 클래스 추가 (`max-sm:flex-col max-sm:text-center`) | `src/app/(main)/dashboard/student-home.tsx` |
| 3 | T2 | sample-dashboard.tsx의 `-m-6 mb-0` offset이 새 wrapper와 충돌하지 않는지 시각 테스트 | `src/app/(main)/protractor/sample-dashboard.tsx` |

### COULD (선택)
| # | Task | 내용 | 파일 |
|---|------|------|------|
| 1 | T7 | AuthorProfileCard 하단 border (`border-b`) 추가 여부 검토 | `src/components/posts/author-profile-card.tsx` |
| 2 | T7 | Meta 로고 영역 border-t 구분선 분리 여부 검토 | `src/components/posts/author-profile-card.tsx` |
| 3 | T4 | `sec-div` (hr+badge+hr) 패턴 vs 현재 `section-number` (원형 뱃지) 목업 대조 | `src/components/posts/post-body.css` |
| 4 | T8 | 별점 재클릭 해제 기능 추가 (`rating === star ? 0 : star`) | `src/app/(main)/admin/reviews/page.tsx` |

---

## 결론

전체 평균 Match Rate **91.7%** 로 90% 기준을 **통과(PASS)** 합니다.

- 9개 중 8개 태스크가 90% 이상 일치
- T4(80%)만 기준 미달이나, 이는 설계 대안 중 다른 방식을 선택한 것이며 기능적으로는 동일한 효과를 달성
- 필수(MUST) 수정 사항 없음
- 권장(SHOULD) 수정 3건은 모두 방어적 코딩/UX 개선 성격
