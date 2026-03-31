# TASK: 20분 스프린트 — 목업 100% UI + GCS 배포

## 데드라인: 09:31 (20분)

## 핵심 원칙
- **디자인 100% 목업 동일** — 데이터 없으면 "데이터 없음" 표기하되 UI 구조는 그대로
- 매우 깊은 사고로 구현
- 완료 후 GCS(Cloud Run) 배포 필수

## 레퍼런스 목업 (이 HTML을 100% 복제)
- 개별소재: `docs/02-design/mockups/creative-analysis-v2.html` (cat으로 읽어라)
- 포트폴리오: `docs/02-design/mockups/portfolio-tab-v2.html` (cat으로 읽어라)
- 원본: https://mozzi-reports.vercel.app/reports/plan/2026-03-23-customer-journey-v5

## 지표 체계 (Smith님 최종 확정 09:09)

### 3대축 (성과 — 벤치마크 대비 7일)
🟢 기반 (재생율 곡선):
  - 3초시청률 (%)
  - 25% 재생률 (video_p25 / reach × 100)
  - 50% 재생률 (video_p50 / reach × 100)
  - 75% 재생률 (video_p75 / reach × 100)
  - 100% 재생률 (video_p100 / reach × 100)

🟡 참여:
  - 공유/만노출
  - 저장/만노출

🔴 전환:
  - CTR (%)

❌ 제외: 좋아요, 댓글, 구매전환율, ROAS, 결제시작율

### 총가치 점수 빼라 (기간별로 달라짐)

## 5축 Gemini 프롬프트 스키마 추가 (prescription-prompt.ts)
PRESCRIPTION_OUTPUT_SCHEMA에 추가:
1. ad_axis (광고축 카테고리): 포맷/훅유형/메시징/타겟/구조/설득/오퍼/Andromeda/PDA
2. scene_journey (씬별 봤다/들었다/느꼈다): time/type/watched/heard/felt/cognitive_load
3. scene_gaze_prescription (씬별 시선+처방): gaze/subtitle/prescription
4. audio_analysis (오디오): narration_tone/bgm/emotion_flow/sound_prescription
5. customer_journey_detail (여정상세): sensation/thinking/action_click/action_purchase/core_insight

상세 스키마: `.bkit/tasks/cto-prompt-schema-addition.md` 참조

## 성과역추적 수정
- creative-detail API: 30일 → 7일로 변경
- daily_ad_insights에서 ad_id로 조회 (creative_id 아님!)
- video_p25~p100은 reach 대비 %로 환산

## 엔젤앤비 Top5 재분석
force=true로 재분석:
- 0cbd1fe9-8e2e-463a-8093-b6a4412ad881
- 5f8183b6-bce9-48bb-b438-5866c83211c9
- 4fa14aef-61c1-4617-bfeb-859f625e9126
- 0a3504cf-abc6-47c2-99fd-1622a1cea7b2
- 42384121-5ac9-4e82-8308-ee290493bca9

## UI 컴포넌트 (목업과 100% 동일)
### 개별소재 탭
1. 📊 성과 3대축 (기반/참여/전환) — 점수 + 세부항목 펼치기
2. 📋 광고축 카테고리 (포맷/훅/메시징/타겟/구조/설득/Andromeda/PDA)
3. ① 고객 이해 — 씬별 봤다/들었다/느꼈다 + 시선 히트맵 + 이탈 곡선 그래프
4. 📊 고객 여정 요약 4단계 + 핵심 인사이트
5. 👁 씬별 시선 분석 + 처방 (📝자막 + 💊개선안)
6. 🔊 오디오 분석
7. 🏆 개선 우선순위 Top3

### 포트폴리오 탭
- 목업 그대로 (portfolio-tab-v2.html)

## 디자인 규칙
- 화이트 배경 / 라이트 모드
- Pretendard 폰트
- 이모지 적극 사용
- 카드: 둥근 모서리 12px, 그림자, padding 1.5rem
- 목업 CSS 변수 그대로: --ac:#F75D5D, --bg2:#f8fafc 등
- 데이터 없으면 "데이터 없음" 회색 표기 (UI 구조는 유지)

## GCS 배포
- 로컬 확인 후 커밋 + Cloud Run 배포
- bscamp.app에 반영

## DB
- Cloud SQL: postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp
- **Supabase 절대 쓰지 마**
- Gemini API Key: AIzaSyBQZUTjVUeYiT1XLzkWZEjJ7cmSZEbtgus
