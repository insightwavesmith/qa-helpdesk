# TASK: 처방 시스템 구현

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
5축 분석 결과를 기반으로 "뭘 바꿔야 하는지" 처방을 자동 생성하는 시스템.
처방 = 축1(레퍼런스 원론) + 축2(실데이터 패턴) 합산.

## 선행 조건
- ⚠️ TASK-P2-FIVE-AXIS-BATCH.md 완료 후 실행 (5축 데이터가 있어야 패턴 추출 가능)

## 단계별 TASK

### STEP 1: prescription_patterns 테이블 생성
```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  metric TEXT NOT NULL,
  avg_value NUMERIC,
  median_value NUMERIC,
  sample_count INTEGER,
  confidence TEXT,
  lift_vs_average NUMERIC,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  category TEXT
);
```
- Cloud SQL(34.50.5.237)에 생성

### STEP 2: 패턴 추출 스크립트
- scripts/extract-prescription-patterns.mjs 생성
- creative_media.analysis_json에서 속성값 추출
- daily_ad_insights JOIN → 속성별 성과 평균/중위값/샘플수
- 신뢰도: N>=30 높음, N>=10 보통, N<10 낮음
- lift% = (속성 평균 - 전체 평균) / 전체 평균 × 100
- prescription_patterns에 upsert
- 카테고리별 분리

### STEP 3: 5축 분석 프롬프트에 처방 가이드 삽입
- analyze-five-axis.mjs의 VIDEO_PROMPT_V3 / IMAGE_PROMPT_V3 수정
- 축1: plans/prescription-prompt-guide.md 핵심 규칙 고정 삽입
- 축2: prescription_patterns에서 해당 소재 속성값의 패턴 동적 삽입
- 벤치마크 유사소재 Top3 5축+성과 동적 삽입 (임베딩 코사인 유사도)
- 처방 우선순위 Top 3 출력
- 절대 금지: CTA 버튼 추가 처방 금지, 세이프티존 밖 배치 금지

### STEP 4: 패턴 추출 크론 등록
- Cloud Scheduler에 등록 (주 1회 화요일, collect-benchmarks 후)
- extract-prescription-patterns.mjs 실행

## 참고 파일
- plans/prescription-prompt-guide.md
- plans/meta-ad-prescription-guide.md
- plans/axis2-real-data-architecture.md

## 완료 기준
- prescription_patterns 테이블 데이터 존재
- 5축 분석 시 처방 포함된 결과 출력
- 크론 정상 등록 + 1회 실행 확인
