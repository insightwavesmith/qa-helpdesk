# TASK: 총가치각도기 + 서비스 통합 개선

> Plan 인터뷰 스킵

## 리뷰 결과

- T1: unit="pct" → "decimal" 수정 필요, benchmark-admin.tsx line 42 ROAS 수동 항목 중복 삭제, 전환 점수 5→6개 평균 변동 인지, 주석 13→14 수정
- T2: Supabase 클라이언트 createServiceClient() 사용, Gemini 모델 text-embedding-004로 통일, Vercel 300초 타임아웃 대책(maxDuration+배치), NOTION_TOKEN/DB ID 환경변수 분리, 중복체크=source_ref 기존 방식 유지
- T3: 이미 커밋 1f00900에서 upsert 구현됨 → 삭제

## T1. ROAS 지표 복원 (14개 완성)

현재: metric-groups.ts에 13개
변경: roas 추가해서 14개로 복원

- **파일**: src/lib/protractor/metric-groups.ts
- **현재**: 전환율 그룹에 5개 (CTR, 결제시작율, 구매전환율, 결제→구매율, 노출당구매확률)
- **변경**: roas 추가 → 6개. 전체 3+5+6=14개
- roas: key="roas", label="ROAS", ascending=true, unit="decimal", benchKey="avg_roas", benchGroup="conversion"
- 주석 13→14로 수정 (metric-groups.ts line 2,5 + content-ranking.tsx line 139)
- **benchmark-admin.tsx line 42**: ROAS 수동 항목 삭제 (METRIC_GROUPS에서 자동 파생되므로 중복)
- **참고**: 전환 점수가 5→6개 평균으로 변동됨 (의도된 변경)

## T2. 노션 캠프반 파이프라인 자동화

현재: scripts/embed-notion.mjs (수동 실행 스크립트)만 있음
변경: API 엔드포인트 + 크론 등록

- **신규 파일**: src/app/api/cron/sync-notion/route.ts
- **현재**: `node scripts/embed-notion.mjs` 수동 실행
- **변경**:
  - embed-notion.mjs 로직을 API route로 이식
  - Supabase: createServiceClient() 사용 (raw REST 아님)
  - Gemini 임베딩: text-embedding-004 사용 (프로젝트 표준, embed-notion.mjs의 gemini-embedding-001 아님)
  - vercel.json에 크론 등록 (매일 04:00 UTC = 13:00 KST)
  - maxDuration: 300 설정 + 배치 처리 (50건씩)
  - 환경변수: NOTION_TOKEN, NOTION_DB_* (4개 DB ID) → process.env
  - 멤버 DB, 몰입노트 DB, to-do DB 동기화

## 완료 기준

- [ ] T1: metric-groups.ts 14개 + 총가치각도기에 ROAS 표시 + benchmark-admin 중복 없음
- [ ] T2: /api/cron/sync-notion 동작 + vercel.json 크론 등록
- [ ] npm run build 성공
- [ ] 커밋 + 푸시
