# 경쟁사 분석기 버그 2건 수정 — 설계서

## 1. 데이터 모델
기존 테이블/타입 변경 없음. `BrandPage`, `CompetitorAd`, `CompetitorMonitor` 타입 그대로 사용.

## 2. API 설계
기존 API 엔드포인트 변경 없음. 내부 로직만 수정.

## 3. 컴포넌트 구조 — 수정 대상

### 버그 1: 핀 등록 빈 brandName 문제

#### 수정 지점 A: `meta-ad-library.ts` — searchBrandPages() (Line 267-278)
**현재 코드:**
```typescript
page_name: String(p.page_name ?? ""),
```
**문제:** `page_name`이 null/undefined이면 빈 문자열 `""` 생성

**수정 방향:**
- `page_name`이 빈 문자열이 되는 결과를 필터링하거나
- `page_name`이 없으면 `page_alias` 또는 `page_id`를 fallback으로 사용

#### 수정 지점 B: `brand-search-bar.tsx` — handlePin() (Line 126-132)
**현재 코드:**
```typescript
onPinBrand?.(brand);
```
**문제:** `brand.page_name`이 빈 문자열이어도 그대로 전송

**수정 방향:**
- 핀 클릭 전 `brand.page_name` 유효성 사전 검증
- 빈 문자열이면 toast.warning("브랜드명이 없는 페이지입니다") 표시

#### 수정 지점 C: `ad-card.tsx` — 핀 onClick (Line 248-261)
**현재 코드:**
```typescript
onPinBrand({ page_name: ad.pageName, ... });
```
**문제:** `ad.pageName`이 빈 문자열이면 동일 에러

**수정 방향:**
- 동일하게 사전 검증 추가

#### 수정 지점 D (선택): `competitor-dashboard.tsx` — handlePinBrand() (Line 234-278)
**현재 코드:**
```typescript
body: JSON.stringify({ brandName: brand.page_name, ... })
```
**수정 방향:**
- 최종 방어선: `brand.page_name`이 빈 문자열이면 API 호출 차단

### 버그 2: 더보기 페이지네이션 중복 → 조기 종료 문제

#### 수정 지점 E: `competitor-dashboard.tsx` — handleLoadMore() (Line 100-142)
**현재 코드:**
```typescript
const existingIds = new Set(ads.map((a) => a.id));
const deduped = newAds.filter((a) => !existingIds.has(a.id));

if (deduped.length === 0) {
  toast.info("더 이상 새로운 광고가 없습니다");
  setNextPageToken(null);  // ← 토큰 삭제 → 복구 불가
  return;
}
```

**문제:**
1. 중복 페이지가 오면 `nextPageToken`을 null로 설정 → 페이지네이션 영구 종료
2. 서버에서 반환한 `nextPageToken`이 있으면 다음 페이지에 새 광고가 있을 수 있음

**수정 방향:**
- `deduped.length === 0`이더라도 서버 응답의 `nextPageToken`이 있으면 토큰 유지 (다음 더보기 시도 가능)
- 연속 N회(예: 3회) 중복 페이지가 오면 그때 종료 판정
- 또는: `deduped.length === 0`이면 자동으로 다음 페이지 한 번 더 시도 (silent retry)

## 4. 에러 처리

### 버그 1 에러 처리
| 상황 | 현재 | 수정 후 |
|------|------|---------|
| page_name 빈 문자열 브랜드 핀 클릭 | API 400 → "브랜드명을 입력하세요" | 프론트에서 사전 차단 → "브랜드명이 확인되지 않는 페이지입니다" |
| page_name null/undefined (SearchAPI 응답) | `""` 빈 문자열로 변환 | `page_alias` 또는 `page_id`로 fallback, 그래도 없으면 결과에서 제외 |

### 버그 2 에러 처리
| 상황 | 현재 | 수정 후 |
|------|------|---------|
| 중복 페이지 반환 (deduped === 0) | 토큰 삭제 + "더 이상 없습니다" | 서버 nextPageToken 있으면 유지 + "새 광고를 찾는 중..." 또는 자동 재시도 |
| 실제로 모든 광고 소진 | 토큰 삭제 + "더 이상 없습니다" | 동일 (정상 동작) |
| 연속 3회 중복 | 해당 케이스 없음 | 토큰 삭제 + "더 이상 새로운 광고가 없습니다" |

## 5. 구현 순서 — 체크리스트

### 버그 1 (핀 등록)
- [ ] `meta-ad-library.ts` — `searchBrandPages()`: `page_name` 빈 문자열 → fallback 처리 (page_alias → page_id) + 그래도 없으면 필터링
- [ ] `competitor-dashboard.tsx` — `handlePinBrand()`: `brand.page_name` 유효성 검증 추가 (방어 코드)
- [ ] `brand-search-bar.tsx` — UI에서 `page_name` 없는 브랜드 핀 버튼 비활성화 또는 경고
- [ ] `ad-card.tsx` — 동일 방어 코드 추가

### 버그 2 (더보기)
- [ ] `competitor-dashboard.tsx` — `handleLoadMore()`: deduped === 0일 때 서버 nextPageToken 보존 로직 추가
- [ ] 연속 중복 카운터 상태 추가 (`duplicateRetryCount`)
- [ ] 3회 연속 중복 시에만 페이지네이션 종료

### 공통
- [ ] tsc --noEmit 통과
- [ ] next lint 통과
- [ ] npm run build 통과
- [ ] 수동 QA: 브랜드 검색 → 핀 등록 정상 동작 확인
- [ ] 수동 QA: 30건 이상 결과 → 더보기 정상 로드 확인
