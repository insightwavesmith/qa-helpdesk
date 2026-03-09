# TASK-총가치각도기-리빌드.md — 목업 100% 재현 + 데이터 연결

> 작성: 모찌 | 2026-02-26
> 우선순위: 최긴급
> 목업: `docs/design/protractor-ui-mockup.html` (반드시 읽고 시작할 것)

---

## ⚠️ 절대 규칙

1. **`docs/design/protractor-ui-mockup.html`을 반드시 처음에 읽어라.** 이 파일이 최종 디자인이다.
2. **목업의 UI/UX를 100% 그대로 구현하라.** 임의 해석/변경/생략 절대 금지.
3. **"이미 구현됨"이라고 판단하지 마라.** 현재 구현은 목업과 다르다. 전부 다시 맞춰라.
4. **라이트 모드(화이트) 전용.** 다크모드 고려 불필요.
5. **기존 컴포넌트를 삭제하지 마라.** 수정/추가만.

---

## 전체 구조 (목업 기준, 위에서 아래로)

### 1. 총가치수준 게이지 (반원형)
- 반원형 SVG 게이지 — 0~100점
- **어제 날짜 기준** 데이터로 점수 계산
- 점수 = 아래 6개 지표의 가중 평균 (목업 참고)
- 등급 표시 (S/A/B/C/D/F)

### 2. 6개 핵심 지표 카드
목업에 있는 6개 지표 카드를 그대로 구현:
- 각 카드: 지표명, 현재값, 벤치마크 대비 등급, 변화율
- **목업 레이아웃 그대로** (그리드 배치, 색상, 아이콘)

### 3. 진단 3컬럼 (기반점수 / 참여율 / 전환율)
- 목업의 3컬럼 구조 그대로
- 각 컬럼: 점수 + 세부 지표 리스트
- DiagnosticPanel 컴포넌트 사용

### 4. TOP 5 광고 (어제 기준)
- **어제 daily_ad_insights에서 상위 5개 광고** (정렬 기준: purchase_value 또는 roas)
- 각 광고: 목업에 있는 항목 전부 표시
- 1등~5등 합산해서 위의 총가치수준 평균에 반영
- **일일 데이터 보기가 핵심 기능** — 어제의 광고 성과를 한눈에

### 5. 일별 데이터 테이블
- 날짜별 주요 지표 테이블
- 현재 구현된 DailyMetricsTable 활용

---

## 데이터 연결 규칙

### 수식 정의 (최종 확정)

| 지표 | 공식 | 비고 |
|---|---|---|
| **훅비율 (3초 시청률)** | `video_play_actions합 / reach × 100` | ⚠️ 분모가 reach (impressions 아님!) |
| CTR | Meta API 직접 반환값 | |
| CPC | Meta API 직접 반환값 | |
| CPM | Meta API 직접 반환값 | |
| ROAS | purchaseValue / spend | |
| 완시청률 (thruplay_rate) | thruplay / impressions × 100 | |
| 유지율 (retention_rate) | thruplay / video_play_actions합 × 100 | |
| 참여율 지표 | reactions/comments/shares/**saves** per 10k impressions | ⚠️ saves 추가 필수 |
| 참여합계 (engagement) | (reactions+comments+shares+saves) / impressions × 10,000 | ⚠️ saves 포함 |
| 클릭→구매전환율 | purchases / clicks × 100 | |
| 체크아웃→구매전환율 | purchases / initiateCheckout × 100 | |
| 노출대비 구매전환율 | purchases / impressions × 100 | |

### 훅비율 수정 필요
현재 `calculateMetrics()`에서:
```typescript
// 현재 (잘못됨)
video_p3s_rate: impressions > 0 ? round(videoP3s / impressions * 100, 4) : null,

// 수정 (올바름)
video_p3s_rate: reach > 0 ? round(videoP3s / reach * 100, 4) : null,
```
- `reach`는 Meta API에서 이미 요청하고 있음 (`insight.reach`)
- collect-daily의 calculateMetrics에서 reach를 사용하도록 수정
- DB에 reach 값도 저장 필요 (현재 저장 안 됨 → 추가)

### TOP 5 데이터 가져오기
```sql
SELECT * FROM daily_ad_insights 
WHERE account_id = ? AND date = '어제'
ORDER BY purchase_value DESC
LIMIT 5
```

### 총가치수준 점수
- TOP 5 광고의 지표를 합산/평균
- 벤치마크 대비 등급으로 변환
- 6개 지표 가중평균 → 0~100 점수

---

## 수정 대상 파일

1. `src/app/(main)/protractor/real-dashboard.tsx` — 전체 레이아웃을 목업에 맞게 재구성
2. `src/components/protractor/TotalValueGauge.tsx` — 목업 디자인 반영
3. `src/components/protractor/DiagnosticPanel.tsx` — 목업 3컬럼 구조 확인
4. `src/components/protractor/*.tsx` — 기타 컴포넌트 목업 일치
5. `src/app/api/cron/collect-daily/route.ts` — 훅비율 수식 수정 (reach 기반) + reach 저장
6. `src/app/api/protractor/` — TOP 5 API 등 필요시 추가/수정

---

## 완료 기준

- [ ] `docs/design/protractor-ui-mockup.html`과 실제 UI가 시각적으로 일치
- [ ] 어제 데이터 기준 TOP 5 광고 표시
- [ ] 총가치수준 게이지에 점수 표시
- [ ] 진단 3컬럼 데이터 연결
- [ ] 훅비율 = video_play_actions / reach × 100
- [ ] reach 값 daily_ad_insights에 저장
- [ ] saves 수집 + saves_per_10k 계산
- [ ] engagement_per_10k에 saves 포함 (4개 합산)
- [ ] 일별 데이터 테이블 정상
- [ ] 라이트모드(화이트) 전용
- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS

---

---

## Part 1. 프론트엔드 UI 재구성

## Part 2. 백엔드 수정

## 리뷰 결과
- 모찌 검토 완료 (2026-02-26)
- 목업 대비 100% 재현 확인 필요

## 백엔드 수정 사항

### B1. 기존 가입자 광고계정/믹스패널 변경 기능
- 현재: 온보딩(최초 가입) 때만 광고계정/믹스패널 입력 가능
- 수정: **설정 페이지에서 언제든 변경 가능하게**
  - 광고계정 ID 변경
  - 믹스패널 프로젝트 ID / 시크릿키 변경
  - 변경 시 `ad_accounts` + `service_secrets` + `profiles` 모두 갱신
  - 기존 `saveAdAccount()` 로직 재사용

### B2. 1명 다수 광고계정 지원
- 현재: 1 user = 1 ad_account (profiles.meta_account_id 단일값)
- 수정: **1 user = N ad_accounts**
  - `ad_accounts` 테이블은 이미 user_id로 연결되어 다수 지원 가능
  - 총가치각도기 상단에 **계정 선택 드롭다운** 추가
  - 선택한 계정 기준으로 대시보드 데이터 표시
  - 설정 페이지에서 광고계정 추가/삭제 가능
  - `profiles.meta_account_id`는 대표 계정으로 유지 (호환성)

### B3. 훅비율 수식 수정
- 현재: `video_play_actions / impressions × 100`
- 수정: `video_play_actions / reach × 100`
- 파일: `src/app/api/cron/collect-daily/route.ts` → `calculateMetrics()`
- `reach` 값은 이미 Meta API에서 요청하고 DB에 저장됨

### B4. saves(저장) 수집 추가
- 현재: collect-daily에서 reactions/comments/shares만 수집, saves 없음
- 수정:
  1. `collect-daily/route.ts`에서 `onsite_conversion.post_save` 액션 추가 수집
  2. DB에 `saves_per_10k` 컬럼 추가 (float8, nullable)
  3. `saves_per_10k = saves / impressions × 10,000`
  4. `engagement_per_10k = (reactions + comments + shares + saves) / impressions × 10,000` (기존: saves 빠져있음)
  5. `collect-benchmarks`에 `saves_per_10k` 벤치마크 항목 추가
- 참여합계 = 좋아요 + 댓글 + 공유 + 저장 4개의 합

### B5. collect-daily reach 저장 확인
- `calculateMetrics()` 반환값에 `reach` 포함 여부 확인
- DB UPSERT에 `reach` 포함 여부 확인
- 없으면 추가

---

## 금지 사항

- 목업에 없는 UI 요소 추가 금지 (단, 계정 선택 드롭다운/설정 변경 UI는 예외)
- 목업에 있는 UI 요소 생략 금지
- 다크모드 스타일 추가 금지
- "이미 구현됨" 판단 후 스킵 금지 — 목업과 비교하여 다르면 수정
