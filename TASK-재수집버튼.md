# TASK-재수집버튼.md — 관리자 재수집 버튼 4종

> 작성: 모찌 | 2026-02-27 19:45
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 905f6a8
> ⚠️ Plan 인터뷰 스킵: 질문 없이 바로 Plan 작성 후 실행할 것
> ⚠️ 리뷰 불필요 — 바로 개발 실행

---

## 타입
기능 추가

## 제약
- npm run build 성공 필수
- 기존 /admin/protractor 페이지에 추가

---

## 작업: /admin/protractor 페이지에 재수집 버튼 4종 추가

### 위치
`src/app/(main)/admin/protractor/page.tsx` (또는 해당 컴포넌트)

### 요구사항
벤치마크 관리 섹션 아래에 **재수집 버튼 4개를 가로 일렬로** 배치:

```
[벤치마크 재수집] [광고데이터 재수집] [매출데이터 재수집] [타겟중복 재수집]
```

### 각 버튼 동작

1. **벤치마크 재수집** — 기존에 있으면 유지, 없으면 추가
   - POST `/api/cron/collect-benchmarks`
   - Authorization: CRON_SECRET (서버사이드)

2. **광고데이터 재수집** (collect-daily)
   - POST `/api/cron/collect-daily`
   - Authorization: CRON_SECRET (서버사이드)

3. **매출데이터 재수집** (collect-mixpanel)
   - POST `/api/cron/collect-mixpanel`
   - Authorization: CRON_SECRET (서버사이드)

4. **타겟중복 재수집**
   - collect-daily에 포함되어 있으므로, collect-daily와 동일 API 호출
   - 또는 별도 엔드포인트가 있으면 그걸 사용
   - 버튼 텍스트만 구분

### API 호출 방식
- 클라이언트에서 직접 크론 API를 호출하면 CRON_SECRET이 노출됨
- **Server Action** 또는 **별도 관리자 API 엔드포인트**를 만들어서 서버사이드에서 크론 API를 내부 호출
- 예: `/api/admin/trigger-cron` POST { type: "collect-daily" | "collect-benchmarks" | "collect-mixpanel" }
- 이 API에서 관리자 인증 확인 후, 내부적으로 크론 라우트의 핵심 로직 실행

### UI 요구사항
- 버튼 4개 가로 일렬 (flex, gap)
- 클릭 시 로딩 상태 표시 (스피너 또는 "수집 중...")
- 완료 시 성공/실패 토스트
- 이미 수집 중이면 중복 클릭 방지 (disabled)

### 참고
- CRON_SECRET은 Vercel env에만 있음, process.env.CRON_SECRET으로 접근
- 크론 라우트들은 GET 요청이고 Authorization 헤더에 Bearer CRON_SECRET 필요
- 관리자 인증: 기존 admin 체크 로직 재사용
