# TASK-UI수정.md — 총가치각도기 v2 탭 구조 + 콘텐츠 레이아웃 수정

> 작성: 모찌 | 2026-02-27
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 6943019
> Smith님 지시 기반 (2026-02-26)

---

## 타입
UI 수정

## 목표
1. 탭 4개 → 2개 축소 (성과요약 / 콘텐츠)
2. 타겟중복을 별도 탭에서 제거 → 성과요약 탭 안 하단에 배치
3. 벤치마크 관리를 탭에서 제거 → 사이드바 "총가치각도기 관리"로만 접근
4. 콘텐츠 1~5등 카드 전부 펼쳐진 상태로 표시 (접기/펼치기 제거)

## 제약
- 기존 API/데이터 로직 변경 없음 (UI만 수정)
- OverlapAnalysis 컴포넌트 자체 수정 없음 (위치만 이동)
- BenchmarkAdmin 컴포넌트 삭제 금지 (/admin/protractor에서 사용)
- npm run build 성공 필수

---

## T1. 탭 구조 변경 — 4개 → 2개

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`

**현재:**
```tsx
<TabsTrigger value="summary">성과 요약</TabsTrigger>
<TabsTrigger value="overlap">타겟중복</TabsTrigger>
<TabsTrigger value="content">콘텐츠</TabsTrigger>
{isAdmin && <TabsTrigger value="benchmark">벤치마크 관리</TabsTrigger>}
```

**변경:**
```tsx
<TabsTrigger value="summary">성과 요약</TabsTrigger>
<TabsTrigger value="content">콘텐츠</TabsTrigger>
```

추가 변경:
- `activeTab` 상태 타입에서 `"overlap" | "benchmark"` 제거 → `"summary" | "content"` 만
- `<TabsContent value="overlap">` 블록 삭제 (코드 자체 삭제, OverlapAnalysis는 T2에서 이동)
- `<TabsContent value="benchmark">` 블록 삭제
- `isAdmin` prop 제거 (더 이상 사용 안 함)
- `BenchmarkAdmin` import 제거

**검증:** /protractor 접근 → 탭 2개만 표시 (성과요약 / 콘텐츠)

---

## T2. 타겟중복 → 성과요약 탭 안 하단 배치

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`

**현재:** `<TabsContent value="overlap">` 안에 OverlapAnalysis
**변경:** `<TabsContent value="summary">` 안에서 DiagnosticPanel 아래에 OverlapAnalysis 배치

구체적 위치 (성과요약 탭 내부 순서):
1. TotalValueGauge (게이지 + T3 점수)
2. SummaryCards (광고비/클릭/구매/ROAS)
3. DiagnosticPanel (3파트 진단)
4. **OverlapAnalysis (타겟중복) ← 여기에 추가**

조건:
- `selectedAccountId`가 있고 `periodNum >= 7`일 때만 표시 (기존 로직 유지)
- OverlapAnalysis import, overlapData/loadingOverlap/overlapError/fetchOverlap 등 기존 상태/로직 그대로 유지
- 타겟중복 섹션 위에 구분선 또는 제목 추가: `<h3>타겟중복 분석</h3>` (선택)

**검증:** 
- 성과요약 탭 → 스크롤 하단에 타겟중복 분석 표시
- 7일 미만 기간 → 타겟중복 미표시
- 별도 "타겟중복" 탭 없음

---

## T3. 벤치마크 관리 탭 제거

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`, `src/app/(main)/protractor/page.tsx`

**real-dashboard.tsx:**
- `{isAdmin && <TabsTrigger value="benchmark">벤치마크 관리</TabsTrigger>}` 삭제 (T1에서 처리)
- `{isAdmin && <TabsContent value="benchmark">...</TabsContent>}` 삭제 (T1에서 처리)
- `isAdmin` prop 정의 제거: `{ isAdmin = false }: { isAdmin?: boolean }` → 파라미터 자체 삭제
- `import { BenchmarkAdmin }` 제거

**page.tsx:**
- `isAdmin` prop 전달 코드 제거 (있으면)

**확인:** `/admin/protractor` 페이지에서 BenchmarkAdmin이 정상 렌더링되는지 확인
- 파일 경로: `src/app/(main)/admin/protractor/page.tsx` (또는 유사)
- 이 파일이 없으면 생성: BenchmarkAdmin 컴포넌트를 import해서 렌더링하는 간단한 페이지
- 사이드바에 "총가치각도기 관리" 링크가 `/admin/protractor`를 가리키는지 확인

**검증:**
- /protractor → 벤치마크 관리 탭 없음
- /admin/protractor → BenchmarkAdmin 정상 표시 (관리자만 접근)

---

## T4. 콘텐츠 1~5등 전부 펼친 상태

**파일:** `src/app/(main)/protractor/components/content-ranking.tsx`

**현재:**
- `expandedId` state로 1개만 펼침
- `isExpanded` prop + `onToggle` 콜백으로 접기/펼치기
- ChevronDown/ChevronUp 아이콘으로 토글 버튼 표시
- 기본: 1등만 펼침, 2~5등 접힘

**변경:**
- `expandedId` state 제거
- `isExpanded` prop 항상 `true` 전달 (또는 prop 자체 제거하고 항상 펼침)
- `onToggle` 콜백 제거
- 토글 버튼 (ChevronDown/ChevronUp 클릭 영역) 제거
- `ChevronDown`, `ChevronUp` import 제거 (사용처 없으면)
- 1~5등 모두 3파트 상세 그리드(기반점수/참여율/전환율 지표 + 벤치마크값/내수치) 항상 표시

**검증:**
- 콘텐츠 탭 → 1~5등 카드 전부 펼쳐진 상태
- 각 카드: 광고명 + 광고비/노출/클릭/CTR/구매 + 3파트 점수 바 + 3파트 상세 그리드
- 접기/펼치기 버튼 없음

---

## 리뷰 결과

(에이전트팀 리뷰 후 작성)

## 리뷰 보고서

(에이전트팀 리뷰 후 작성)

---

## 완료 기준
- [ ] T1: 탭 2개만 (성과요약 / 콘텐츠)
- [ ] T2: 성과요약 탭 하단에 타겟중복 표시
- [ ] T3: 벤치마크 관리 탭 없음 + /admin/protractor 정상
- [ ] T4: 콘텐츠 1~5등 전부 펼침
- [ ] npm run build 성공
- [ ] tsc --noEmit 0에러

---

## T5. video_p3s_rate 계산식 버그 수정 (긴급)

**파일:** `src/app/api/cron/collect-benchmarks/route.ts`

**현재 (잘못된):**
```ts
const videoP3s = getVideoActionValue(insight.video_play_actions);
```
`video_play_actions`는 영상 재생 시작(자동재생 포함)이므로 노출 대비 75%가 나옴 → 비정상

**변경 (GCP 원본대로):**
```ts
const videoP3s = getActionValue(actions, "video_view");
```
`actions`에서 `video_view` (3초 시청)를 가져와야 함 → 노출 대비 30%대가 정상

**추가 확인:**
- `getActionValue` 함수가 이미 존재하는지 확인 (actions 배열에서 action_type으로 값 추출)
- 없으면 GCP 원본 패턴대로 구현:
```ts
function getActionValue(actions: any[], actionType: string): number {
  const found = actions?.find((a: any) => a.action_type === actionType);
  return found ? Number(found.value) || 0 : 0;
}
```
- `thruplay`는 기존 `video_thruplay_watched_actions`에서 가져오는 게 맞음 (변경 불필요)
- `videoP100`도 기존 `video_p100_watched_actions`에서 가져오는 게 맞음

**검증:** 벤치마크 재수집 시 video_p3s_rate가 20~40% 범위로 나오면 정상

---

## T6. 타겟중복 1일부터 표시 (7일 제한 제거)

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`

**현재:**
```tsx
if (periodNum < 7) return;  // 7일 미만이면 fetch 안 함
```

**변경:**
- `periodNum < 7` 조건 제거
- 1일(어제)부터도 타겟중복 분석 fetch + 표시
- 성과요약 하단에 항상 표시 (계정 선택 시)

---

## T7. 콘텐츠 탭 — 지출순 1~5등 카드 표시 안 되는 문제 수정

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`, `src/app/(main)/protractor/components/content-ranking.tsx`

**현재 문제:** 콘텐츠 탭에서 1~5등 카드가 안 나옴

**확인 사항:**
1. `insights` 배열이 비어있는지 확인 — 렌더링 조건: `selectedAccountId && insights.length > 0`
2. `insights` API가 정상 응답하는지 (daily_ad_insights에 데이터 있음: 2/26 25건)
3. `getTop5Ads(insights)`가 정상 동작하는지 (ad_id별 합산 → spend DESC → 5개)
4. ContentRanking 컴포넌트가 정상 렌더링하는지

**수정:**
- 콘텐츠 탭에서 insights 데이터가 있을 때 반드시 1~5등 카드 표시
- 빈 상태일 때는 "데이터 없음" 메시지

---

## T8. 콘텐츠 카드별 벤치마크 비교 표시

**파일:** `src/app/(main)/protractor/components/content-ranking.tsx`

**현재:** 카드에 3파트 상세 그리드가 있으나 벤치마크 값과 비교 표시 안 됨
**변경:** 각 콘텐츠(광고)별로 벤치마크 데이터와 비교하여 지표별 `벤치마크값 / 내수치` 형식 표시

**로직:**
1. 각 광고의 `creative_type`(VIDEO/IMAGE)에 맞는 벤치마크 행 조회
2. 영상/참여 지표 → engagement ABOVE_AVERAGE 벤치마크
3. 전환 지표 → conversion ABOVE_AVERAGE 벤치마크
4. 지표별 표시: `벤치마크값% / 내수치%` + 판정 색상(🟢🟡🔴)
5. 벤치마크 없으면 "벤치마크 없음" 표시

**참고:** `findAboveAvg` 유틸 함수가 이미 import되어 있음 — 이걸 활용

**검증:**
- 콘텐츠 탭 → 1~5등 카드 각각에 3파트 상세 그리드 + 벤치마크 비교 수치 표시

---

## T9. 총가치각도기 광고계정 삭제 버튼 추가

**파일:** `src/app/(main)/protractor/real-dashboard.tsx` (또는 광고계정 드롭다운/관리 컴포넌트)

**현재:** 총가치각도기 페이지에서 광고계정 추가는 가능하지만 삭제 불가
**참고:** 설정 페이지(`/settings/settings-form.tsx`)에는 삭제 기능 있음 — `removeAdAccount` 액션 + Trash2 아이콘

**변경:**
- 총가치각도기 페이지의 광고계정 드롭다운 또는 계정 관리 영역에 삭제 버튼(Trash2) 추가
- `/settings/settings-form.tsx`의 삭제 로직 참고: `removeAdAccount` 서버 액션 사용
- confirm 다이얼로그 포함 ("광고계정 {id}를 삭제하시겠습니까?")
- 삭제 후 계정 목록 refresh

**검증:** 총가치각도기 → 광고계정 옆 삭제 버튼 → 클릭 → confirm → 삭제 완료
