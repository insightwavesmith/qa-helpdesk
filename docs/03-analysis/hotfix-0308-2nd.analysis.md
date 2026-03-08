# 수정사항 2차 (0308) Gap 분석

## Match Rate: 95%

## 이전 수정 원인 분석 (9512b1c)
- **T5(더보기)**: console.log만 추가 — 실제 기능 수정 0건
- **T6(핀)**: stopPropagation + console.log — 이벤트 버블링은 수정했으나 사용자 피드백 부재

### 왜 "동작 안 함"으로 느껴졌는가
1. 성공/실패 시 toast 등 즉각적 UI 피드백 없음
2. 에러 발생 시 페이지 상단 배너에만 표시 → 스크롤 위치에서 인지 불가
3. API 응답 데이터 방어 처리 없음 (json.monitor undefined 가능성)

## 일치 항목
| # | 설계 항목 | 구현 | 일치 |
|---|----------|------|------|
| 1 | T1 privacy 자사몰/광고 데이터 추가 | li 2개 추가 | ✅ |
| 2 | T2 더보기 toast 피드백 | toast.success/info/error 3종 | ✅ |
| 3 | T2 결과 0건 시 안내 | toast.info + nextPageToken null 처리 | ✅ |
| 4 | T3 핀 성공 toast | toast.success 추가 | ✅ |
| 5 | T3 핀 실패 toast | toast.error/warning 분기 | ✅ |
| 6 | T3 json.monitor 방어 | if (json.monitor) 체크 추가 | ✅ |
| 7 | console.log 디버그 제거 | 3군데 모두 제거 | ✅ |
| 8 | npm run build 성공 | ✅ 통과 | ✅ |

## 불일치 항목
| # | 항목 | 비고 |
|---|------|------|
| 1 | BrandSearchBar 드롭다운 재오픈 | 코드상 정상 — onFocus에서 hasResults 체크 후 setShowDropdown(true). 실사용 확인 필요. |

## 수정 필요
- 없음 (95% 일치)
