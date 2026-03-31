# TASK: 소재 분석 최종 3개 수정

## 우선순위: 🔴 최긴급

## 1. 3초시청률 3701% 버그 수정
파일: `src/app/(main)/protractor/creatives/components/individual/three-axis-score.tsx`

**원인**: `pctFormat(v)` = `(v * 100).toFixed(2)%` 인데, API가 이미 `%` 단위로 내려줌 (37.01).
37.01 × 100 = 3701% 버그.

**수정**: `pctFormat`을 사용하는 곳에서 이미 % 단위인 값은 `v.toFixed(2)%`로 표시.
- `video_p3s_rate`, `video_p25_rate~p100_rate`, `ctr` — 전부 이미 % 단위
- `shares_per_10k`, `saves_per_10k` — 이건 만노출 단위이므로 `per10kFormat` 유지

방법 A: `pctFormat`을 `(v).toFixed(2)%`로 변경 (곱하기 제거)
방법 B: 새 포맷 함수 추가

## 2. 씬별 DeepGaze 히트맵 이미지 표시
creative-detail API(`route.ts`)가 `video_analysis.heatmap_urls`를 응답에 포함해야 함.

현재 응답의 `creative.video_analysis`에 전체 JSON이 들어있으므로,
프론트에서 `video_analysis.heatmap_urls[i].url`로 씬별 이미지 표시 가능.

프론트 수정:
- `creative-detail-panel.tsx`의 씬 카드에서:
  - `video_analysis.heatmap_urls`에서 해당 씬 시간대의 프레임 이미지 찾기
  - `<img src={url} style="width:120px;height:213px;object-fit:cover;border-radius:6px">`
  - 없으면 현재처럼 "이미지 없음" 표시

씬 시간 매핑:
- scene_journey[i].time (예: "0-4초") → 시작초 파싱 → heatmap_urls에서 sec이 가장 가까운 것

## 3. 좌측 세로 영상 플레이어
목업 구조: `grid-template-columns: 210px 1fr`
- 좌측 210px: `<video>` 세로(9:16), width:200px, border-radius:10px, autoplay muted loop
- 영상 URL: API 응답 `creative.media_url` 또는 `creative.storage_url`
- storage_url이 gs:// 형식이면 → `https://storage.googleapis.com/` 으로 변환
- 우측: 현재 씬 타임라인

**주의**: storage_url이 `gs://bscamp-storage/...` 형태 → 공개 URL로 변환:
`gs://bscamp-storage/path` → `https://storage.googleapis.com/bscamp-storage/path`

## 검증
1. 3초시청률이 20~40% 범위의 정상 수치
2. 씬별 카드 왼쪽에 DeepGaze 히트맵 이미지 (120×213px)
3. 좌측에 세로 영상 재생
4. `npx tsc --noEmit` 에러 0개

## 절대 금지
- 다른 파일 건드리기 ❌
- 새 API 만들기 ❌
