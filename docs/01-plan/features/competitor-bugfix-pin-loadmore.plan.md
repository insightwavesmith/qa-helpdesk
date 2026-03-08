# 경쟁사 분석기 버그 2건 수정 — Plan

## 기능명
경쟁사 분석기(Competitor Dashboard) 핀 등록 에러 + 더보기 페이지네이션 버그 수정

## 타입
개발 (bugfix)

## 배경
2026-03-08 서비스 오픈 직전 발견된 버그 2건.
두 번의 핫픽스(9512b1c, aad4e7f)를 시도했지만 근본 원인을 잘못 짚어 여전히 재현됨.

## 버그 1: 핀(모니터링 등록) 클릭 → '브랜드명을 입력해주세요' 에러

### 재현 경로
1. 브랜드 검색 모드에서 브랜드 검색
2. 드롭다운 결과에서 핀(📌) 버튼 클릭
3. 토스트: "브랜드명을 입력하세요" (400 에러)

### 원인 분석

**근본 원인: SearchAPI.io가 `page_name`이 없는 결과를 반환하는 경우가 있음**

데이터 흐름:
```
SearchAPI.io (page_name: undefined/null)
  → meta-ad-library.ts:269  — String(p.page_name ?? "") → ""
  → brands API 응답         — { page_name: "" }
  → brand-search-bar.tsx    — onPinBrand(brand) 호출, brand.page_name = ""
  → competitor-dashboard.tsx:254 — body: { brandName: "" }
  → monitors/route.ts:118-126 — brandName.trim() === "" → 400 에러
```

핵심 라인:
- `src/lib/competitor/meta-ad-library.ts:269` — `page_name: String(p.page_name ?? "")`
  - `null`/`undefined` → `""` 빈 문자열로 변환
- `src/app/api/competitor/monitors/route.ts:121` — `if (!brandName)` 검증
  - 빈 문자열은 falsy → 에러 반환

**ad-card.tsx 핀 버튼도 동일 문제:**
- `ad-card.tsx:252` — `page_name: ad.pageName` 전달
- `transformSearchApiAd()` (meta-ad-library.ts:101) — `pageName: raw.page_name`
- SearchAPI.io raw 데이터의 `page_name`이 빈 문자열이면 동일 에러 발생

### 이전 수정 시도가 실패한 이유

| 커밋 | 수정 내용 | 왜 실패? |
|------|-----------|----------|
| 9512b1c (T6) | ad-card 핀 버튼에 `e.stopPropagation()` 추가 + console.log 디버그 | 이벤트 전파 문제가 아니라 **데이터 문제**. brandName이 빈 문자열인 근본 원인을 건드리지 않음 |
| aad4e7f (T3) | `setError()` → `toast.error()` 교체 + `json.monitor` guard 추가 | **에러 표시 방식**만 변경. 빈 brandName 전송은 그대로 |

**핵심 실패 패턴**: 에러 메시지 '브랜드명을 입력해주세요'를 보고 "입력 UI 문제"로 오진. 실제 원인은 SearchAPI.io 응답에서 `page_name`이 누락되어 빈 문자열로 변환되는 **데이터 변환 계층** 문제.

## 버그 2: 더보기 클릭 → '더 이상 새로운 광고가 없습니다'

### 재현 경로
1. 브랜드 검색 → 광고 30건+ 결과 표시
2. "더보기" 클릭
3. 토스트: "더 이상 새로운 광고가 없습니다" (실제로는 남은 광고 있음)

### 원인 분석

**근본 원인: SearchAPI.io 페이지네이션의 중복 결과 + 중복 제거 로직의 부작용**

데이터 흐름:
```
handleLoadMore() (competitor-dashboard.tsx:100-142)
  → GET /api/competitor/search?page_token=xxx[&page_id=yyy OR &q=zzz]
  → searchMetaAds() → SearchAPI.io 호출
  → 응답: { ads: [...], nextPageToken: "..." }
  → 중복 제거: existingIds = new Set(ads.map(a => a.id))
             deduped = newAds.filter(a => !existingIds.has(a.id))
  → deduped.length === 0 이면 "더 이상 새로운 광고가 없습니다" + nextPageToken = null
```

**문제 시나리오:**

SearchAPI.io의 `page_token` 기반 페이지네이션이 이전 페이지와 **완전히 동일한 광고 세트**를 반환하는 경우가 있음 (외부 API의 비결정적 페이지네이션).

1. 1페이지: 광고 ID [1-30] 반환, nextPageToken = "token2"
2. 더보기: page_token="token2"로 요청
3. 2페이지: 광고 ID [1-30] **동일 세트** 반환 (또는 대부분 겹침)
4. 중복 제거 → `deduped.length === 0`
5. `setNextPageToken(null)` → **페이지네이션 완전 종료** (복구 불가)

**추가 문제점:**
- `deduped.length === 0`일 때 `setNextPageToken(null)`로 설정하여 **다음 페이지 토큰 자체를 삭제**함
- 실제로는 3페이지 이후에 새 광고가 있을 수 있지만, 토큰이 null이 되어 더보기 버튼 비활성화
- 즉, 한 번이라도 중복 페이지가 오면 페이지네이션이 영구 중단됨

### 이전 수정 시도가 실패한 이유

| 커밋 | 수정 내용 | 왜 실패? |
|------|-----------|----------|
| 9512b1c (T5) | 디버그 로깅 추가 | 원인 파악용이지 수정 아님 |
| aad4e7f | toast.error → toast.info 변경 + 메시지 개선 | 에러 표시만 바꿈. 중복 제거 + 토큰 삭제 로직 그대로 |

## 반복 실패 원인 (메타 분석)

두 버그 모두 **"간단한 수정"으로 보이지만 반복 실패**한 공통 패턴:

1. **증상 기반 수정 (Symptom-driven fix)**
   - 에러 메시지를 보고 "표시 방식"만 바꿈 (setError → toast)
   - 이벤트 전파 문제로 오진 (stopPropagation 추가)
   - 실제 데이터 흐름을 끝까지 추적하지 않음

2. **외부 API 응답 신뢰**
   - SearchAPI.io가 항상 유효한 `page_name`을 반환한다고 가정
   - SearchAPI.io의 `page_token` 페이지네이션이 중복 없이 깔끔하게 동작한다고 가정
   - 방어적 코드(defensive coding) 부재

3. **디버깅 범위 한정**
   - 프론트엔드(UI 이벤트)만 확인하고 백엔드(API 검증) + 외부 API(SearchAPI.io 응답)까지 추적 안 함
   - `meta-ad-library.ts`의 데이터 변환 계층을 확인하지 않음

## 성공 기준
- [ ] `page_name`이 빈 문자열인 브랜드를 핀 등록 시도할 때 적절한 fallback 처리
- [ ] 더보기 클릭 시 중복 페이지가 와도 다음 페이지 시도 가능
- [ ] 실제로 광고가 더 없을 때만 "더 이상 없습니다" 표시
- [ ] 기존 정상 동작(검색, 필터, 정렬) 영향 없음

## 관련 파일
- `src/lib/competitor/meta-ad-library.ts` — 데이터 변환 (핵심)
- `src/app/api/competitor/monitors/route.ts` — 핀 등록 API
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 상태 관리
- `src/app/(main)/protractor/competitor/components/brand-search-bar.tsx` — 핀 UI
- `src/app/(main)/protractor/competitor/components/ad-card.tsx` — 광고카드 핀 UI
- `src/app/api/competitor/search/route.ts` — 검색 API
