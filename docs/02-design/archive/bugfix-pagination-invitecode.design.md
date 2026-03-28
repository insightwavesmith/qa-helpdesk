# 버그 수정: 경쟁사 분석기 페이지네이션 + 초대코드 사용량 — Design

> 작성일: 2026-03-08
> 타입: 분석/리뷰 (코드 수정 금지)

---

## 1. 데이터 모델

### 버그 1: 페이지네이션 — 변경 없음
기존 테이블/모델 변경 불필요. SearchAPI.io 호출 파라미터만 수정.

### 버그 2: 초대코드 — 변경 검토

| 항목 | 현재 | 변경안 |
|------|------|--------|
| `invite_codes.is_active` | 없음 | (선택) 추가 — boolean DEFAULT true |
| `invite_codes.used_count` | 0으로 고정된 상태 | DB 수동 수정으로 실제 값 반영 |

---

## 2. API 설계

### 버그 1: SearchAPI.io 호출 파라미터 규칙

| 시나리오 | 필수 파라미터 | 선택 파라미터 | 제외 파라미터 |
|----------|--------------|--------------|--------------|
| 키워드 새 검색 | `engine`, `api_key`, `q` | `country`, `ad_active_status`, `media_type` | `page_token` |
| page_id 새 검색 | `engine`, `api_key`, `page_id` | `country`, `ad_active_status`, `media_type` | `page_token`, `q` |
| 페이지네이션 (키워드) | `engine`, `api_key`, `page_token`, `q` | — | `country`, `ad_active_status`, `media_type` |
| 페이지네이션 (page_id) | `engine`, `api_key`, `page_token`, `page_id` | — | `country`, `ad_active_status`, `media_type`, `q` |

**핵심**: 페이지네이션 시 `page_token` + 원래 검색 키(`q` 또는 `page_id`) 포함, 나머지 파라미터 제외.

### `GET /api/competitor/search` — 변경 없음
기존 라우트 로직은 이미 q/page_id/page_token 모두 파싱하므로 수정 불필요.

---

## 3. 컴포넌트 구조 / 상태 관리

### 버그 1: handleLoadMore 수정

**현재 상태**:
```
handleLoadMore → URLSearchParams({ page_token }) → API 호출
```

**수정 후 상태**:
```
handleLoadMore → URLSearchParams({ page_token, q|page_id }) → API 호출
                  ↑ searchQuery 또는 searchPageId state에서 복원
```

**변경 대상**: `competitor-dashboard.tsx` 줄 113-118

```typescript
// AS-IS
const fetchParams = new URLSearchParams({
  page_token: currentToken,
});

// TO-BE
const fetchParams = new URLSearchParams({
  page_token: currentToken,
});
if (searchPageId) {
  fetchParams.set("page_id", searchPageId);
} else if (searchQuery) {
  fetchParams.set("q", searchQuery);
}
```

**영향 범위**: handleLoadMore 함수 내부만. 다른 컴포넌트에 영향 없음.

### 버그 1: searchMetaAds 수정

**변경 대상**: `meta-ad-library.ts` 줄 162-182

```typescript
// AS-IS
if (params.pageToken) {
  url.searchParams.set("page_token", params.pageToken);
  // q/page_id 없음 → SearchAPI.io 거부
}

// TO-BE
if (params.pageToken) {
  url.searchParams.set("page_token", params.pageToken);
  // SearchAPI.io는 page_token만으로 불충분 — q 또는 page_id 필수
  if (params.searchPageIds) {
    url.searchParams.set("page_id", params.searchPageIds);
  } else if (params.searchTerms) {
    url.searchParams.set("q", params.searchTerms);
  }
  // country, ad_active_status, media_type는 제외
  // → page_token에 인코딩되어 있으므로 중복 전송 시 새 쿼리로 해석됨
}
```

### 버그 2: invites.ts — 코드 자체는 4차 수정으로 해결됨

**확인 사항**:
- `let updateQuery` 재할당 ✅ (줄 50)
- `.eq("used_count", currentUsed)` 낙관적 잠금 ✅ (줄 58)
- 폴백 직접 업데이트 ✅ (줄 74-77)

**남은 작업**: DB 데이터 수동 수정 (bs-06 코드의 used_count를 실제 사용자 수로 맞추기)

---

## 4. 에러 처리

### 버그 1
| 에러 상황 | 현재 동작 | 변경 |
|-----------|-----------|------|
| SearchAPI.io 파라미터 누락 | `SEARCH_API_ERROR` → toast.error | 수정 후 발생 안 함 |
| 중복 광고만 반환 | 자동 재시도 (MAX 3회) | 유지 |
| 네트워크 오류 | toast.error | 유지 |

### 버그 2
| 에러 상황 | 현재 동작 | 개선 제안 |
|-----------|-----------|-----------|
| useInviteCode 실패 | console.error만 (silent) | 관리자 알림 or audit log 테이블 INSERT 검토 |
| 낙관적 잠금 실패 | 폴백 직접 업데이트 | 유지 (합리적) |
| 만료 코드 사용 시도 | "초대코드가 만료되었습니다" 반환 | 유지 |

---

## 5. 구현 순서 — 체크리스트

### 버그 1: 페이지네이션
- [ ] `meta-ad-library.ts` 줄 162-182: pageToken + q/page_id 함께 전송
- [ ] `competitor-dashboard.tsx` 줄 113-118: handleLoadMore에 searchQuery/searchPageId 포함
- [ ] 테스트: 키워드 검색 → 더보기 → 광고 추가 확인
- [ ] 테스트: 브랜드(page_id) 검색 → 더보기 → 광고 추가 확인
- [ ] 테스트: 3페이지 연속 더보기 정상 동작 확인

### 버그 2: 초대코드
- [ ] DB 수동 수정: bs-06 used_count를 실제 가입자 수로 업데이트
- [ ] 전체 초대코드 used_count 정합성 확인 (`profiles.invite_code_used` 기준 카운트)
- [ ] (선택) silent failure 개선 — console.error → audit log
- [ ] (선택) 만료 자동 처리 구현 (Cron or View)
- [ ] 테스트: 신규 초대코드 생성 → 가입 → used_count +1 확인

---

## 부록: 이전 수정 시도 요약

### 페이지네이션 (4회 수정 이력)
| 차수 | 수정 내용 | 결과 |
|------|-----------|------|
| 1-3차 | q/page_id를 page_token과 함께 전송 + country 등도 포함 | 새 쿼리로 해석 → 중복 반환 |
| 4차 | page_token만 전송, q/page_id 제거 | SearchAPI.io 필수 파라미터 누락 에러 |
| **수정안** | **page_token + q 또는 page_id만 전송, 나머지 제외** | **예상: 정상 동작** |

### 초대코드 (4회 수정 이력)
| 차수 | 수정 내용 | 결과 |
|------|-----------|------|
| 1-3차 | `const updateBuilder` → `.eq()` 재할당 누락 | WHERE 조건 미적용 → 0행 매칭 |
| 4차 | `let updateQuery` + 폴백 로직 추가 | 코드 수정 완료, DB 데이터 미수정 |
| **수정안** | **DB 데이터 수동 수정** | **예상: 정합성 복구** |
