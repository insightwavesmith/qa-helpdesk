# T10-F4: ROAS 벤치마크 기준값 표시 제거

## 요구사항
- ROAS 지표에서 벤치마크 기준값 표시를 제거한다
- 실제 값만 표시하고 "(기준 X.XX)" 또는 "기준 대비 X%" 부분을 숨긴다
- 벤치마크 대시보드(SummaryCards) + 총가치각도기(TotalValueGauge, DiagnosticPanel) 모두 해당
- 다른 지표(CTR, CPC, 3초시청률 등)의 기준값 표시는 그대로 유지

## 범위
- **표시(UI)만 변경**. 데이터 수집/저장 로직 변경 금지.
- DB 스키마 변경 금지.
- ROAS 외 다른 지표의 기준값 표시 변경 금지.

## 성공 기준
1. SummaryCards에서 ROAS 카드에 "▲/▼ 기준 X.XX" 텍스트가 표시되지 않는다
2. TotalValueGauge 지표 카드에서 ROAS의 "기준 대비 X%" 텍스트가 표시되지 않는다
3. DiagnosticPanel에서 ROAS의 "기준 대비 X%" 텍스트가 표시되지 않는다
4. 다른 지표의 벤치마크 표시는 정상 작동한다
5. tsc + lint + build 모두 통과한다

## 참고 파일
- `src/lib/protractor/aggregate.ts` — toSummaryCards() ROAS 벤치마크 생성
- `src/components/protractor/SummaryCards.tsx` — benchmarkText 렌더링
- `src/components/protractor/TotalValueGauge.tsx` — 지표 카드 "기준 대비" 표시
- `src/components/protractor/DiagnosticPanel.tsx` — 진단 상세 "기준 대비" 표시
