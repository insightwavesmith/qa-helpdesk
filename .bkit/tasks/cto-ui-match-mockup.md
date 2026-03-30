# TASK: 소재분석 탭 UI를 목업과 동일하게 구현

## 긴급도: 최고 (7시까지 완료 필수 — Smith님 수면 중)

## 레퍼런스 목업
https://mozzi-reports.vercel.app/reports/plan/2026-03-23-customer-journey-v5

## 현재 상태
- 소재분석 탭 데이터 연결 완료 (API 200, 성과 데이터 연결됨)
- UI가 목업 대비 매우 빈약

## 목업에 있고 현재 없는 것

### 개별소재 탭 — 씬별 상세 분석
1. **씬별 시선 분석**: 각 씬(0-3초 훅, 3-10초 데모, 10-20초 결과, 20-27초 팁, 27-30초 CTA)
   - 👁 봤다: 시각적 설명
   - 👂 들었다: 오디오/나레이션
   - 🧠 느꼈다: 심리 반응
   - 📍 시선 포인트
   - 📝 자막 분석
   - 💊 개선안 + 근거

2. **고객 여정 요약 4단계**:
   - 👁👂 감각 (시각+청각 요약)
   - 🧠 사고 (심리 흐름)
   - 🖱 행동-선행 (CTR)
   - 💳 행동-후행 (ROAS/전환)

3. **오디오 분석**:
   - 나레이션 톤
   - BGM 장르
   - 감정 흐름

4. **시선 히트맵 타임라인**: 재생 진행에 따른 시선 변화

### 포트폴리오 탭
- 소재 클러스터 시각화 (임베딩 유사도 기반) — 목업 수준

## 데이터
- 엔젤앤비 계정: `1112351559994391`
- 분석 완료 소재 17개 (analysis_json + video_analysis 있음)
- video_analysis에 씬별 데이터 들어있음 — 이걸 UI에 뿌려라
- DB: Cloud SQL 직접연결 (`postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp`)
- **Supabase 안 씀**

## 기존 컴포넌트 (수정/확장)
- `src/app/(main)/protractor/creatives/components/individual/creative-detail-panel.tsx`
- `src/app/(main)/protractor/creatives/components/individual/customer-journey.tsx`
- `src/app/(main)/protractor/creatives/components/individual/gaze-analysis.tsx`
- `src/app/(main)/protractor/creatives/components/individual/prescription-cards.tsx`
- `src/app/(main)/protractor/creatives/components/individual/three-axis-score.tsx`
- `src/app/(main)/protractor/creatives/components/individual/five-axis-card.tsx`

## API
- `GET /api/protractor/creative-detail?id={media_id}&account_id={account_id}` — 200 OK
- `GET /api/protractor/prescription?id={media_id}` — 200 OK
- `GET /api/admin/creative-intelligence?account_id={account_id}` — 200 OK

## 디자인
- 화이트 배경 (라이트 모드)
- 목업의 카드 스타일, 이모지 사용, 색상 그대로 따라라
- 반응형 불필요 — 데스크톱만

## 절대 하지 말 것
- API 구조 변경 ❌
- DB 스키마 변경 ❌  
- 새로운 분석 돌리기 ❌
- Supabase 사용 ❌

## 완료 기준
- localhost:3000/protractor/creatives 에서 엔젤앤비 선택 → 개별소재 탭이 목업과 동일 수준
- 씬별 봤다/들었다/느꼈다 + 처방 + 오디오 분석 표시
