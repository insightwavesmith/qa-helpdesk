# TASK: CTO팀 남은 작업 마무리

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 순서대로 진행

### 1. Railway 코드 정리 + OFF
- `src/lib/railway-crawler.ts` → 파일명 `cloud-run-crawler.ts`로 변경
- 환경변수 `RAILWAY_CRAWLER_URL` → `CRAWLER_URL`로 변경
- 환경변수 `RAILWAY_API_SECRET` → `CRAWLER_SECRET`로 변경
- 코드 내 "railway" 문자열 전부 "cloud-run"으로 변경
- import 경로 전부 수정
- 빌드(tsc + lint) 확인

### 2. USE_CLOUD_SQL 분기 제거
- `src/lib/db/index.ts`에서 USE_CLOUD_SQL 분기 제거 — Cloud SQL만 사용하도록 단순화
- `src/actions/auth.ts` 등에서 USE_CLOUD_SQL 관련 코드 제거
- Vercel 환경변수에서 USE_CLOUD_SQL 삭제는 코드 제거 후 안전하게 진행
- grep으로 USE_CLOUD_SQL 전체 검색해서 남은 거 없는지 확인

### 3. agent-state-sync.sh 완성
- 각 팀(sdk-cto, sdk-pm, sdk-mkt) tmux 세션 상태를 JSON으로 출력하는 스크립트
- `/tmp/cross-team/` 폴더에 각 팀 상태 파일 갱신
- 크론 또는 hook으로 자동 실행 가능하게

### 4. 커밋 + 푸시
- 작업 단위별 커밋 (1, 2, 3 각각)
- main 브랜치에 push

## 하지 말 것
- 처방 시스템 (나중에)
- 5축 배치 (나중에)
- Auth Firebase 전환 (나중에)
- GCP 보안 설정 (나중에)
