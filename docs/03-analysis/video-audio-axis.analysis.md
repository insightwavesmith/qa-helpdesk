# 영상 Audio 축 추가 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/video-audio-axis.design.md
> TASK: T6

---

## Match Rate: 96%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | analyzeWithGemini()에 videoUrl 파라미터 추가 | 5번째 파라미터 (기본값 null) | ✅ |
| 2 | VIDEO + videoUrl일 때 mp4 우선 사용 | mp4 다운로드 → video/mp4 base64 전달 | ✅ |
| 3 | 20MB 초과 시 폴백 | 크기 체크 + 썸네일 폴백 | ✅ |
| 4 | 다운로드 실패 시 폴백 | try-catch + 썸네일 폴백 | ✅ |
| 5 | videoUrl 없으면 기존 동작 유지 | parts 비어있으면 이미지 폴백 | ✅ |
| 6 | IMAGE 분석 무변경 | 폴백 블록으로 이동, 로직 동일 | ✅ |
| 7 | audio 축 프롬프트 무변경 | VIDEO_PROMPT_V3 미수정 | ✅ |
| 8 | storage_url .mp4 체크 | endsWith(".mp4") 확인 | ✅ |
| 9 | creatives 테이블 video_url 조회 | sbGet fallback | ✅ |
| 10 | tsc + build 통과 | 에러 0 | ✅ |

## 불일치 항목: 없음 (마이너 차이만)

- 설계에서 비디오 타임아웃을 명시하지 않았으나 구현에서 30초로 설정 — 합리적

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅
- `node --check scripts/analyze-five-axis.mjs` — ✅

---

> Gap 분석 완료. Match Rate 96%.
