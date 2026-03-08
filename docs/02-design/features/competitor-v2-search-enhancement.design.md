# 경쟁사v2 검색 고도화 — Design

## 1. 데이터 모델

### 새 타입: AdPage (types/competitor.ts)
```typescript
/** ad_library 키워드 검색에서 발견된 광고 페이지 (비공식 포함) */
export interface AdPage {
  page_id: string;
  page_name: string;
  ad_count: number;
}
```

### API 응답 변경: /api/competitor/brands
```typescript
// Before
{ brands: BrandPage[] }

// After
{
  brands: BrandPage[];       // page_search 결과 (공식 브랜드)
  adPages: AdPage[];         // ad_library에서 발견된 페이지 (비공식 포함)
  searchedDomain: string | null;  // URL 입력 시 추출된 도메인
}
```

## 2. API 설계

### GET /api/competitor/brands?q={query}

**요청**: 기존과 동일 (q 파라미터)

**서버 로직**:
```
1. rawQ에서 URL 감지 → 도메인 추출 (기존 extractQueryFromUrl)
2. 입력이 URL이면:
   - extractedDomain = 도메인 (예: oliveyoung.co.kr)
   - pageSearchQuery = 도메인에서 브랜드명 추출 (예: oliveyoung)
   - adLibraryQuery = 원본 도메인 (예: oliveyoung.co.kr)
3. 입력이 일반 텍스트면:
   - pageSearchQuery = rawQ
   - adLibraryQuery = rawQ
4. Promise.allSettled 병렬 호출:
   - A: searchBrandPages(pageSearchQuery)
   - B: searchMetaAds({ searchTerms: adLibraryQuery, limit: 50 })
5. B 결과에서 page_id별 그룹핑 → AdPage[] (상위 10개)
6. A와 B 결과 합쳐서 반환
```

**응답**:
```json
{
  "brands": [
    { "page_id": "123", "page_name": "올리브영", "ig_username": "oliveyoung_official", ... }
  ],
  "adPages": [
    { "page_id": "456", "page_name": "숫자페이지123", "ad_count": 15 },
    { "page_id": "789", "page_name": "비공식 올리브영", "ad_count": 8 }
  ],
  "searchedDomain": "oliveyoung.co.kr"
}
```

## 3. 컴포넌트 구조

### brand-search-bar.tsx 변경

**State 추가**:
```typescript
const [adPages, setAdPages] = useState<AdPage[]>([]);
```

**드롭다운 2섹션 구조**:
```
┌──────────────────────────────────┐
│ 📌 공식 브랜드                     │
│ ┌──────────────────────────────┐ │
│ │ 🟢 올리브영  @oliveyoung...  📌│ │
│ │ 🟢 올리브영 글로벌            📌│ │
│ └──────────────────────────────┘ │
│                                  │
│ 🔗 이 URL로 광고하는 페이지 (17개) │
│ ┌──────────────────────────────┐ │
│ │ 숫자페이지123     광고 15건   │ │
│ │ 비공식 올리브영    광고 8건   │ │
│ │ ...                          │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**Props 추가 (BrandSearchBarProps)**:
- `onAdPageSelect: (adPage: AdPage) => void` — adPage 클릭 시 해당 page_id로 검색

**동작**:
1. searchBrands() 호출 → API에서 `{ brands, adPages }` 받기
2. brands가 있으면 📌 섹션 표시
3. adPages가 있으면 🔗 섹션 표시
4. 공식 브랜드 클릭 → 기존 onBrandSelect (page_id로 검색)
5. adPage 클릭 → onBrandSelect에 BrandPage 형태로 변환하여 전달

### competitor-dashboard.tsx
- BrandSearchBar에 별도 prop 불필요 — adPage 클릭 시 기존 handleBrandSelect 재활용
  - AdPage → BrandPage 변환은 brand-search-bar 내부에서 처리

### 플레이스홀더 변경
```
Before: "브랜드명 또는 URL을 입력하세요 (예: 올리브영, instagram.com/oliveyoung)"
After:  "브랜드명, 자사몰 URL, 인스타 계정 등 뭐든 입력하세요"
```

## 4. 에러 처리

| 에러 | 처리 |
|------|------|
| page_search 실패 + ad_library 성공 | adPages만 표시, brands 빈 배열 |
| page_search 성공 + ad_library 실패 | brands만 표시, adPages 빈 배열 |
| 둘 다 실패 | 기존 에러 메시지 표시 |
| ad_library 결과 0건 | 🔗 섹션 숨김 |
| URL 입력인데 도메인 추출 실패 | 원본 텍스트로 page_search만 |

## 5. 구현 순서 (체크리스트)

- [ ] 1. `types/competitor.ts` — AdPage 타입 추가
- [ ] 2. `brands/route.ts` — 병렬 검색 + 응답 구조 변경
- [ ] 3. `brand-search-bar.tsx` — adPages state + 드롭다운 2섹션 + 플레이스홀더
- [ ] 4. tsc + lint + build 검증
