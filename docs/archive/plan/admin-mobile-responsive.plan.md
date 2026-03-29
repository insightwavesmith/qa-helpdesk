# 관리자 페이지 모바일 반응형 최적화 — Plan

## 요약
관리자(admin) 페이지 13개를 모바일(375px~430px)에서 사용할 수 있도록 Tailwind 반응형 클래스 조정.
기능/UX 로직 변경 없음. CSS만 수정.

## 배경
관리자가 모바일에서 회원 관리, 성과 확인 등을 해야 하는 상황에서 데스크탑 전용 테이블이 깨짐.

## 대상 페이지 (우선순위)

### P1 — 가장 많이 쓰는 페이지
| # | 페이지 | 파일 | 핵심 변경 |
|---|--------|------|-----------|
| 1 | members | members-client.tsx (549줄) | 9컬럼 테이블 → 모바일 카드 |
| 2 | accounts | accounts-client.tsx (526줄) | 5컬럼 테이블 → 모바일 카드 |
| 3 | performance | performance-client.tsx (456줄) | 요약카드 그리드 + 9컬럼 테이블 |
| 4 | answers | answers-review-client.tsx (429줄) | 카드 기반이라 패딩/폰트 조정 |

### P2 — 자주 쓰는 페이지
| # | 페이지 | 파일 | 핵심 변경 |
|---|--------|------|-----------|
| 5 | content | page.tsx (462줄) | stat카드 그리드 + 테이블 + 필터 |
| 6 | email | page.tsx (849줄) | 3컬럼 stat → 반응형 + 폼 + 테이블 |
| 7 | invites | page.tsx (422줄) | 생성폼 그리드 + 테이블 → 카드 |
| 8 | reviews | page.tsx (485줄) | 9컬럼 테이블 → 모바일 카드 |

### P3 — 가끔 쓰는 페이지
| # | 페이지 | 파일 | 핵심 변경 |
|---|--------|------|-----------|
| 9 | protractor | page.tsx + sub-clients | 제목/패딩 조정 |
| 10 | knowledge | page.tsx (293줄) | 4컬럼 stat → 반응형 + 테이블 |
| 11 | owner-accounts | owner-accounts-client.tsx | 테이블 → 카드 |
| 12 | stats | page.tsx (170줄) | 6카드 그리드 → 반응형 |
| 13 | organic | page.tsx (52줄) | 제목/패딩만 |

## 반응형 패턴 규칙
1. **테이블 → 모바일 카드**: `hidden md:block` (데스크탑), `md:hidden` (모바일 카드)
2. **그리드**: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`
3. **패딩**: 제목 `text-lg md:text-2xl`, 컨테이너 패딩은 레이아웃에서 이미 처리
4. **버튼**: `flex flex-col sm:flex-row gap-2`
5. **차트/넓은 콘텐츠**: `overflow-x-auto`

## 금지사항
- 기능 추가/삭제 금지
- API 호출 로직 변경 금지
- 컴포넌트 이름/props 변경 금지
- 새 npm 패키지 추가 금지
- 레이아웃(layout.tsx) 변경 금지

## 성공 기준
- tsc --noEmit 통과
- next build 통과
- 375px/430px 뷰포트에서 깨짐 없음
