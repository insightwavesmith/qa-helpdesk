# TASK: 총가치각도기 UI/UX 업데이트 기획 + 구현 계획 보고

## 배경
총가치각도기에 소재 분석(컨텐츠 탭) 강화 + 랜딩페이지 탭 신규 추가가 필요함.
현재 기존 코드 기반에서 어떻게 업데이트할지 *계획을 먼저 세워서 보고*해라.

## 참고 자료 (반드시 읽을 것)
1. **목업**: `/Users/smith/projects/mozzi-reports/public/reports/mockup/2026-03-19-protractor-full-mockup.html` — 4탭 전체 UI 목업 (대시보드/소재분석/랜딩페이지/경쟁사)
2. **아키텍처**: `/Users/smith/projects/mozzi-reports/public/reports/architecture/2026-03-19-collection-analysis-architecture.html` — 7번 탭 "AI 분석 아키텍처" 참고
3. **기획서**: `/Users/smith/projects/mozzi-reports/public/reports/plan/2026-03-19-creative-benchmark-integration.html` — 소재분석×벤치마크 연동
4. **현재 코드**: `/Users/smith/projects/bscamp/src/app/(main)/protractor/` — 기존 총가치각도기

## 해야 할 일
기존 총가치각도기 코드를 분석해서, 목업 기준으로 UI/UX 업데이트를 *어떻게 할지 계획서*를 작성해라.

### 계획서에 포함할 내용
1. **현재 코드 구조 분석** — 어떤 컴포넌트가 있고, 어떤 API를 쓰고 있는지
2. **변경 범위** — 새로 만들 파일, 수정할 파일, 삭제할 파일 목록
3. **탭 구조 변경** — 대시보드 | 소재 분석(컨텐츠) | 랜딩페이지(신규) | 경쟁사 분석
4. **소재 분석 탭 업데이트 계획**:
   - 왼쪽: 내 소재 카드 (이미지 + L1 태그 + 점수)
   - 오른쪽: AI 분석 + 벤치마크 패턴 비교 + 개선점
   - 하단: 히트맵 오버레이 (L2 시선 데이터) + 영역별 비교 + 시선 동선
   - 필요한 API 엔드포인트 (있는 것 / 새로 만들 것)
5. **랜딩페이지 탭 신규 구현 계획**:
   - LP 스크린샷 + 구조 분석 결과
   - 벤치마크 LP 패턴 비교
   - 필요한 API 엔드포인트
6. **데이터 의존성** — 지금 DB에 있는 데이터로 가능한 것 vs 추가 수집 필요한 것
7. **단계별 구현 순서** — 뭘 먼저 하고 뭘 나중에 할지 우선순위
8. **예상 작업량** — 파일 수, 줄 수 대략적 예상

### 계획서 형식
`/Users/smith/projects/bscamp/docs/protractor-uiux-update-plan.md`에 마크다운으로 작성

## 주의
- 코드 수정하지 마라. 계획서만 작성해라.
- 목업 HTML을 반드시 읽고 UI 구조를 파악해라.
- 현재 protractor 디렉토리 코드를 전부 읽어서 현황 파악해라.
- `tsc --noEmit`으로 현재 상태 에러 없는지 확인해라.
