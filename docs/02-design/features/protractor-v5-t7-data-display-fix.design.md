# T7. 총가치각도기 데이터 표시 이슈 — Design

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 데이터 플로우 분석

### 현재 real-dashboard.tsx 데이터 흐름

```
[상태 초기화]
  insights: []
  totalValue: null
  loadingData: false
  loadingTotalValue: false

[계정 선택 + 기간 변경 시]
  → fetchData() → /api/protractor/insights
  → useEffect (selectedAccountId + dateRange + periodNum 의존)
    → /api/protractor/total-value?account_id=...&period=...&date_start=...&date_end=...

[UI 조건]
  if (!data) → "데이터를 불러올 수 없습니다"  ← totalValue=null이면 여기
  if (data.score == null || !data.grade) → noScore=true → amber 배너
  else → 게이지 정상 렌더링
```

### API total-value 응답 분기

| 상황 | 응답 | UI 결과 |
|------|------|---------|
| 데이터 없음 (rows empty) | `{score: null, grade: null, ...}` | amber 배너 + fallback 0/F |
| 데이터 있음 + 벤치마크 없음 | `{score: 0, grade: F, hasBenchmarkData: false}` | 0점/F등급 + amber 배너 |
| 데이터 있음 + 벤치마크 있음 | `{score: N, grade: X, hasBenchmarkData: true}` | 정상 렌더링 |
| 403/500 에러 | 에러 → `setTotalValue(null)` | "데이터를 불러올 수 없습니다" |

## 2. 원인별 수정 설계

### 2-A. API 에러 시 에러 메시지 개선 (real-dashboard.tsx)

```tsx
// 현재
} catch {
  setTotalValue(null);
}

// 변경 후 (에러 상태 추가)
} catch (e) {
  setTotalValue(null);
  setTotalValueError((e as Error).message || "T3 점수 조회 실패");
}
```

새 상태 변수:
```tsx
const [totalValueError, setTotalValueError] = useState<string | null>(null);
```

### 2-B. API 응답 검증 및 로깅 강화 (total-value/route.ts)

```typescript
// 기존 catch 블록에 로깅 추가
} catch (e) {
  console.error("[total-value] Error:", {
    accountId,
    dateStart,
    dateEnd,
    error: e instanceof Error ? e.message : String(e),
  });
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Unknown error" },
    { status: 500 }
  );
}
```

### 2-C. 벤치마크 없을 때 UI 개선 (TotalValueGauge.tsx)

**현재 amber 배너 텍스트**:
```
"벤치마크 데이터가 없습니다. 벤치마크 관리 탭에서 수집하면 정확한 점수를 확인할 수 있습니다."
```

**변경 후**:
```
"벤치마크 데이터가 없어 점수를 계산할 수 없습니다.
 현재 표시된 0점은 벤치마크 미설정 상태입니다."
```

**추가: 점수 없음 상태의 게이지 시각 처리**

벤치마크 없을 때 (`hasBenchmarkData=false`) 게이지 표시 개선:
```tsx
// 벤치마크 없으면 게이지 흐리게 표시 + 점수 대신 "-" 표시
{noBenchmark ? (
  <div className="text-5xl font-black text-gray-300">-</div>
) : (
  <div className="text-5xl font-black">{displayScore}</div>
)}
```

### 2-D. SummaryCards 표시 보장

현재 SummaryCards는 `summary` 데이터가 있어야 표시됨:
```tsx
const summaryCards = summary ? toSummaryCards(summary, totalValue?.metrics ?? null) : undefined;
```

`summary`는 `insights` 집계에서 나오므로, `insights.length > 0`이면 항상 표시됨.
→ 별도 수정 불필요.

## 3. 진단 코드 추가 (임시)

실제 원인 파악을 위해 total-value API 응답을 콘솔에 로깅:

```tsx
// real-dashboard.tsx useEffect 내
const res = await fetch(`/api/protractor/total-value?${params}`);
const json: T3Response = await res.json();
console.log("[total-value] status:", res.status, "response:", json);  // 진단용
if (res.ok) {
  setTotalValue(json);
} else {
  setTotalValue(null);
}
```

→ 원인 파악 후 콘솔 로그 제거.

## 4. 영향 범위

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `src/app/api/protractor/total-value/route.ts` | 수정 | 에러 로깅 강화 |
| `src/app/(main)/protractor/real-dashboard.tsx` | 수정 | totalValueError 상태 추가, 에러 UI |
| `src/components/protractor/TotalValueGauge.tsx` | 수정 | 벤치마크 없을 때 UI 개선 (게이지 흐림, 점수 "-" 표시) |

## 5. 에러 처리

| 에러 상황 | 현재 처리 | 개선 처리 |
|----------|---------|---------|
| API 403 | `setTotalValue(null)` → 빈 게이지 | 에러 메시지 "권한이 없습니다" |
| API 500 | `setTotalValue(null)` → 빈 게이지 | 에러 메시지 "서버 오류" + 재시도 버튼 |
| 벤치마크 없음 + 점수 0 | 0점/F등급 표시 (혼란스러움) | "-"/회색 게이지 + 명확한 안내 |

## 6. 구현 체크리스트

- [ ] 브라우저 Network 탭으로 API 응답 확인 (원인 특정)
- [ ] `total-value/route.ts` 에러 로깅 추가
- [ ] `real-dashboard.tsx` `totalValueError` 상태 변수 추가
- [ ] `real-dashboard.tsx` API 호출 시 에러 상태 처리
- [ ] `TotalValueGauge.tsx` 벤치마크 없을 때 게이지 시각 처리 개선
- [ ] 진단 후 임시 콘솔 로그 제거
- [ ] `tsc --noEmit` 에러 없음
- [ ] `npm run build` 성공
