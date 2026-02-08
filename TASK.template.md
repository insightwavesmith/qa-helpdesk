# TASK: [작업명]

## 목표
[한 문장]

## 태스크 목록

### T1: [태스크명]
- **담당**: frontend-dev
- **의존**: 없음
- **파일**: src/components/xxx.tsx (신규)
- **설명**: [구체적 요구사항]

### T2: [태스크명]
- **담당**: backend-dev
- **의존**: 없음
- **파일**: src/actions/xxx.ts (신규)
- **설명**: [구체적 요구사항]

### T3: [태스크명]
- **담당**: code-reviewer
- **의존**: T1, T2 (둘 다 완료 후)
- **파일**: 전체 리뷰 (읽기만)
- **설명**: 코드 리뷰 + 보안 체크

## 의존성 규칙
- 같은 파일 = 순차 실행 (한 명만)
- 다른 파일 = 병렬 실행
- dependsOn 태스크 완료 전 다음 태스크 시작 금지

## 기술 제약
- Next.js 15 App Router, TypeScript strict
- 한국어 UI only, Primary #F75D5D
- shadcn/ui, Pretendard 폰트, 라이트 모드만

## 완료 기준
- [ ] npm run build 성공
- [ ] lint 에러 0개
- [ ] 타입 에러 0개
- [ ] git commit + push
- [ ] /workflows:compound로 교훈 기록
