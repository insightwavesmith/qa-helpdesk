# 벤치마크 뷰 개선 — Plan

## 기능 요약
크리에이티브 타입별 벤치마크를 카테고리(기반/참여/전환)로 그룹핑하고, 계산방식 툴팁을 추가하며, IMAGE/CATALOG에서 영상 지표를 숨기는 프론트엔드 개선.

## 배경
- 벤치마크 수집 로직 개선됨 (커밋 `21a8bb2`, `071c4ca`)
- DB에 VIDEO/IMAGE/CATALOG별 벤치마크 데이터 이미 저장
- 프론트에서 카테고리별 표시 + 계산방식 안내 필요

## 범위
### 포함
1. benchmark-admin.tsx: 지표 카테고리 3개 그룹핑 + ranking_type 매핑
2. benchmark-admin.tsx: 각 지표 옆 계산방식 툴팁 (info 아이콘)
3. benchmark-admin.tsx: IMAGE/CATALOG 탭에서 영상 지표 숨기기
4. content-ranking.tsx: creative_type별 영상 지표 표시/숨김

### 제외
- 벤치마크 수집 로직 변경 (이미 완료)
- 진단 API 변경 (이미 creative_type별 매칭 중)
- metric-groups.ts 구조 변경 (기존 3곳에서 공유 중이므로 유지)

## 성공 기준
- [x] 기반/참여/전환 3개 카테고리로 지표 표시
- [x] 기반+참여 → engagement ranking, 전환 → conversion ranking 데이터 사용
- [x] IMAGE/CATALOG에서 영상 지표 (3초시청률, 완시청률, 잔존율) 숨김
- [x] 각 지표 hover 시 계산 공식 표시
- [x] tsc + lint + build 통과

## 관련 파일
- `src/app/(main)/protractor/components/benchmark-admin.tsx` — 주요 수정
- `src/app/(main)/protractor/components/content-ranking.tsx` — creative_type별 숨김
- `src/lib/protractor/metric-groups.ts` — 참조만 (수정 없음)
- `src/app/api/protractor/benchmarks/route.ts` — 참조만 (수정 없음)
