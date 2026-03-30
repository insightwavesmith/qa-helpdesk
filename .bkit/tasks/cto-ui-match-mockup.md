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

## ✅ 완료 체크리스트

### 핵심 구현
- [x] 씬별 상세 분석 컴포넌트 구현 (`scene-detail-analysis.tsx`)
- [x] 고객 여정 요약 4단계 컴포넌트 구현 (`journey-summary.tsx`)
- [x] 오디오 분석 컴포넌트 구현 (`audio-analysis.tsx`)
- [x] 기존 CustomerJourney에 scene_analysis 데이터 연결
- [x] CreativeDetailPanel에 신규 컴포넌트 통합

### 인프라 개선
- [x] AnalysisJsonV3 타입에 scene_analysis/customer_journey_summary 필드 추가
- [x] creative-detail API 응답에 video_analysis 포함
- [x] scene-parser 유틸리티로 데이터 파싱 로직 구현

### 품질 검증
- [x] tsc 타입 에러 0개 확인
- [x] npm run build 성공 확인
- [x] ESLint 에러 0개 확인
- [x] 데이터 흐름 정합성 검증 완료
- [x] null 방어 코드 완비
- [x] 실제 엔젤앤비 데이터로 테스트 완료

### Git 관리
- [x] git commit 완료 (커밋: 81eee80)
- [x] git push 완료
- [x] PDCA 상태 파일 업데이트 완료

**최종 결과:** 소재분석 탭 UI 목업 매칭 구현 성공적 완료 (7시 데드라인 여유있게 달성)
