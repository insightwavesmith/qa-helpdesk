# 경쟁사 분석기 브랜드 등록 개선 설계서

> 작성일: 2026-03-07

## 1. 데이터 모델

### 1-1. 페이지 검색 응답 타입

```typescript
// src/types/competitor.ts 에 추가
export interface MetaPage {
  pageId: string;
  pageName: string;
  profileImageUrl: string; // Graph API: https://graph.facebook.com/{pageId}/picture?type=small
}
```

### 1-2. DB 변경

없음. 기존 `competitor_monitors.page_id` 컬럼 활용.

## 2. API 설계

### 2-1. 페이지 검색 API (T1)

```
GET /api/competitor/pages?q=검색어
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `q` | string | Y | 검색어 |

**내부 동작:**
1. 기존 `searchMetaAds({ searchTerms: q })` 호출
2. 결과에서 `page_id` 기준 중복 제거 (Map 사용)
3. 프로필 이미지: `https://graph.facebook.com/{page_id}/picture?type=small` (공개 접근)
4. 반환: `{ pages: MetaPage[] }`

**설정:**
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`

**에러:**
| 상황 | 상태 | 코드 |
|------|------|------|
| q 빈 값 | 400 | INVALID_QUERY |
| 토큰 미설정 | 503 | TOKEN_MISSING |
| API 실패 | 502 | META_API_ERROR |

**파일:** `src/app/api/competitor/pages/route.ts` (신규)

## 3. 컴포넌트 구조

### 3-1. add-monitor-dialog.tsx 개선 (T2)

**상태 추가:**
- `searchResults: MetaPage[]` - 검색 결과 페이지 목록
- `selectedPage: MetaPage | null` - 선택된 페이지
- `searching: boolean` - 검색 중 로딩
- `debounceTimer: NodeJS.Timeout` - 디바운스 타이머

**UI 변경:**
```
+------------------------------------------+
| 브랜드 모니터링 추가              [X]     |
+------------------------------------------+
| 브랜드명                                  |
| [검색 input ________________]             |
|                                           |
| (검색 결과 드롭다운 - 최대 240px)         |
| +--------------------------------------+ |
| | [프로필32px] 페이지명                 | |
| |              page_id (회색)           | |
| +--------------------------------------+ |
| | [프로필32px] 페이지명2                | |
| +--------------------------------------+ |
|                                           |
| (선택 시 칩 표시)                          |
| [로고 페이지명 X]                          |
|                                           |
| [취소]  [등록]                             |
+------------------------------------------+
```

**드롭다운 스타일:**
- bg-white, border-gray-200, shadow-lg, rounded-xl
- max-height: 240px, overflow-y-auto
- hover: bg-gray-50

**선택 칩 스타일:**
- bg-gray-100, rounded-lg, px-3 py-1.5
- 로고(20px 둥근) + 이름 + X 버튼

**프로필 이미지 fallback:**
- 이미지 없거나 로딩 실패 시: 첫 글자 아바타 (bg-[#F75D5D]/10 text-[#F75D5D])

### 3-2. monitor-brand-card.tsx 개선 (T3)

**변경:**
- `pageId`가 있으면 `<img src="https://graph.facebook.com/{pageId}/picture?type=small">` 표시 (28px 둥근)
- `pageId` 없으면 첫 글자 아바타 (28px, bg-gray-100 text-gray-600)
- `<img>` onError 시 첫 글자 아바타 fallback

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| 검색 결과 0건 | 드롭다운에 "검색 결과가 없습니다" 표시 |
| API 호출 실패 | 드롭다운에 에러 메시지 표시, 텍스트 입력 유지 |
| 이미지 로딩 실패 | 첫 글자 아바타 fallback (onError) |

## 5. 구현 순서

- [ ] T1: `src/app/api/competitor/pages/route.ts` 신규 생성
- [ ] T2: `src/types/competitor.ts`에 `MetaPage` 타입 추가
- [ ] T2: `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` 개선
- [ ] T3: `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx` 개선
- [ ] 빌드 검증: tsc + lint + npm run build
