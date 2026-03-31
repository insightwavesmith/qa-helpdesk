# TASK: 인프라 잔재 정리 (Supabase/Vercel → GCP 이관 완료 정리)

## 배경
GCS/Cloud SQL 이관은 완료됐지만 프로젝트 문서와 파일에 옛날 인프라 참조가 남아있어
CTO가 새 세션 열 때마다 Supabase 참조 코드를 작성하는 문제 발생.

## 목표
프로젝트 전체에서 Supabase/Vercel 잔재를 GCP 기준으로 정리

## 수행 항목

### 1. CLAUDE.md 업데이트
- 파일: `/Users/smith/projects/bscamp/CLAUDE.md`
- "Supabase (PostgreSQL + Auth)" → Cloud SQL (PostgreSQL)
- Vercel 배포 관련 내용 → GCP Cloud Run / Cloud Build
- 현재 실제 인프라 반영: Cloud SQL, GCS, Cloud Run, Railway

### 2. 잔재 파일/폴더 삭제
- `supabase/` 폴더 (마이그레이션 파일들) — Cloud SQL로 이관 완료
- `.env.local` 내 Supabase 관련 주석 정리
- Vercel 설정 파일 확인 후 불필요한 것 제거

### 3. env 변수 정리
- `.env.local.example` (있다면) Supabase URL/키 제거
- 실제 사용 안 하는 환경변수 목록 파악 및 제거

### 4. MEMORY.md 대기 목록 정리
- 파일: `/Users/smith/.openclaw/workspace/MEMORY.md`
- "대기" 섹션에서 이미 완료된 항목 삭제
- 예: "GCP 전체 이관 (Vercel→GCP, Supabase→Cloud SQL)" → 완료됐으면 제거

## 완료 기준
- `grep -r "supabase" /Users/smith/projects/bscamp/CLAUDE.md` 결과 없음
- `supabase/` 폴더 삭제 or 아카이브
- CLAUDE.md에 현재 인프라(Cloud SQL/GCS/Cloud Run) 정확히 반영

## 결과물
- 수정된 CLAUDE.md
- 정리 완료 후 커밋

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
