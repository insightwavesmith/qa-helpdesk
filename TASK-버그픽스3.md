# TASK-버그픽스3.md — 진단패널 import 누락 + 타겟중복 타임아웃

> 작성: 모찌 | 2026-02-26
> 우선순위: 긴급

---

## T1. DiagnosticPanel import 누락 수정 (진단 3컬럼)

### 현재
- `src/components/protractor/DiagnosticPanel.tsx` — 완전 구현됨 (기반점수/참여율/전환율 3컬럼)
- `src/components/protractor/sample-dashboard.tsx` — DiagnosticPanel 사용 중 (정상)
- `src/components/protractor/real-dashboard.tsx` — **DiagnosticPanel import 없음, JSX에도 없음**
- TASK-통합 커밋(`71a09e8`)에서 Top5AdCards로 교체하면서 진단 패널이 레이아웃에서 삭제됨

### 변경
1. `real-dashboard.tsx` 상단에 DiagnosticPanel import 추가
2. 레이아웃에서 적절한 위치에 DiagnosticPanel JSX 추가 (sample-dashboard.tsx의 배치 참고)
3. DiagnosticPanel에 필요한 props 확인 후 real-dashboard의 데이터와 연결
4. Top5AdCards와 DiagnosticPanel **둘 다** 렌더링 (하나를 빼지 말 것)

### 검증
- `npm run build` PASS
- real-dashboard에서 DiagnosticPanel이 렌더링되는지 (데이터 있을 때)

---

## T2. 타겟중복 API 타임아웃 수정

### 현재
- 타겟중복 API가 최대 15개 adset의 pair 조합(최대 105개)을 Meta API에 순차 호출
- Vercel Pro 타임아웃 60초 초과 → 504/500 에러
- 7일 이상 기간 선택 시 adset 수가 많아져서 발생

### 변경
1. adset 상한을 15 → 8로 줄이기 (최대 28 pair = 현실적 시간 내 완료)
2. 함수에 deadline 가드 추가 — 남은 시간 5초 이하면 현재까지 결과 반환
3. API 응답에 `truncated: true` 플래그 추가 (상한 초과 시)
4. `export const maxDuration = 300;` 추가 (타겟중복 API route)
5. 프론트엔드: truncated일 때 "일부 결과만 표시됩니다" 안내 표시

### 파일
- 타겟중복 API route 파일 찾아서 수정 (`grep -r "overlap" src/app/api/`)
- 타겟중복 프론트엔드 컴포넌트 (truncated 안내)

### 검증
- 7일 이상 선택 시 에러 없이 결과 반환
- `npm run build` PASS

---

## T3. 반원형 게이지 fallback 처리

### 현재
- `TotalValueGauge.tsx`에서 API 실패 시 `return null` → 게이지가 조용히 사라짐
- 사용자 입장에서 왜 안 보이는지 알 수 없음

### 변경
1. API 실패/데이터 없음 시 "데이터를 불러올 수 없습니다" placeholder 표시 (return null 대신)
2. 로딩 중 스켈레톤 UI 유지

---

## 완료 기준
- [ ] DiagnosticPanel이 real-dashboard에서 렌더링
- [ ] 타겟중복 7일 이상 에러 없음
- [ ] 게이지 fallback placeholder 표시
- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS

## 금지 사항
- 기존 컴포넌트 삭제/대체 금지 (추가만)
- DB 변경 없음
