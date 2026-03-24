---
name: meta-ads-analyzer
description: |
  Meta Ads 전문 분석 스킬. Breakdown Effect, Learning Phase,
  Ad Relevance Diagnostics 진단. meta-ads-analyzer 오픈소스 기반.
  Triggers: Meta 분석, Breakdown, Learning Phase, 품질점수, 랭킹
---
# Meta Ads Analyzer

## Breakdown Effect
Meta가 "비싼" 세그먼트에 예산을 배분하는 이유:
- 총가치(Total Value) 최적화 기준
- 세그먼트별 EAR × Ad Quality 차이
- 노출당 전환 확률이 높은 곳에 집중

## Learning Phase 진단
- 학습 단계: 50회 전환 수집까지 (~7일)
- Learning Limited: 예산 부족, 타겟 너무 좁음, 편집으로 리셋
- 학습 중 편집 금지 (리셋됨)
- 진단: d.date 기준 7일 이내 + 전환 < 50 → Learning

## Ad Relevance Diagnostics (3개 랭킹)
| 랭킹 | Meta가 보는 것 | 우리 대응 |
|------|---------------|----------|
| Quality Ranking | 숨기기/신고, 텍스트과다, LP경험 | LP분석 + 5축 Quality |
| Engagement Rate Ranking | 예상 참여율 (클릭+반응+재생) | 참여합계 + 재생률 |
| Conversion Rate Ranking | 예상 전환율 (최적화목표 기준) | CTR + 결제시작 + 구매 |

## Auction Overlap
- 같은 계정 광고끼리 경쟁 → CPM 상승
- 타겟 중복률 높으면 → 광고세트 통합 권장

## 참고
- Source: github.com/mathiaschu/meta-ads-analyzer
- Andromeda 리서치: research/2026-03-24-andromeda-total-value-deep-research.md
- GEM 리서치: research/2026-03-24-gem-ear-deep-research.md
