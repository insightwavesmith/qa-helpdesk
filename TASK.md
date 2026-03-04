# TASK: T10-F4 — ROAS 벤치마크 기준값 표시 제거

## 목표
ROAS에 벤치마크 기준값을 표시하지 않는다. 실제 값만 보여준다.

## 현재 동작
- 벤치마크에서 ROAS 표시 시 "2.77 (기준 2.38)" 형태로 기준값이 같이 표시됨
- 총가치각도기에서도 ROAS에 기준값이 표시될 수 있음

## 기대 동작
- ROAS는 실제 값만 표시. "(기준 X.XX)" 부분 제거.
- 벤치마크 대시보드 + 총가치각도기 모두 해당.
- 다른 지표(CTR, CPC 등)의 기준값 표시는 그대로 유지.

## 참고 파일
- `src/app/(main)/protractor/real-dashboard.tsx`
- `src/components/protractor/TotalValueGauge.tsx`
- `src/app/(main)/protractor/components/benchmark-admin.tsx`

## 하지 말 것
- ROAS 데이터 수집/저장 로직 건드리지 말 것. 표시만 변경.
- ROAS 외 다른 지표의 기준값 표시는 변경하지 말 것.
- DB 스키마 변경 금지.
