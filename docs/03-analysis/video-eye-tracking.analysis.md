# 영상 Eye Tracking + Canvas 오버레이 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/video-eye-tracking.design.md
> TASK: T7

---

## Match Rate: 97%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | VIDEO_PROMPT_V3에 eye_tracking 추가 | frames/fixations/timestamp/x/y/weight/label | ✅ |
| 2 | 3초 간격 프레임 | 0,3,6,9,12,15초 예시 | ✅ |
| 3 | label 허용값 6개 | 텍스트/제품/인물/CTA/배경/로고 | ✅ |
| 4 | VIDEO_PROMPT_FREE에 자유 기술 추가 | eye_tracking_description | ✅ |
| 5 | IMAGE 프롬프트 무변경 | IMAGE_PROMPT_V3/FREE 미수정 | ✅ |
| 6 | video-heatmap-overlay.tsx 신규 | "use client" + Canvas | ✅ |
| 7 | timeupdate 이벤트 리스닝 | addEventListener + cleanup | ✅ |
| 8 | 가우시안 히트맵 원형 | createRadialGradient | ✅ |
| 9 | 구간별 색상 (빨/파/초) | 0-3/3-8/8+ 초 | ✅ |
| 10 | pointer-events-none | 클릭 투과 | ✅ |
| 11 | eyeTracking null 시 null 반환 | 조건부 렌더링 | ✅ |
| 12 | tsc + build 통과 | 에러 0 | ✅ |

## 불일치: 없음

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅

---

> Gap 분석 완료. Match Rate 97%.
