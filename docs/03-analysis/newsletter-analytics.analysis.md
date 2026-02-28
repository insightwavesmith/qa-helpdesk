# 뉴스레터 성과 추적 — Gap 분석

## 분석일: 2026-02-23
## Match Rate: 68/100 (Critical 6, Warning 9)

---

## 분석 대상
- `src/components/content/newsletter-analytics-tab.tsx` (356줄)
- `src/app/api/admin/email/analytics/route.ts` (103줄)

## Critical 이슈 (6건)

| # | 이슈 | 파일:라인 | 카테고리 |
|---|------|-----------|----------|
| C1 | `as any` 타입 캐스트 — DB types에 `content_id` 컬럼 누락 | route.ts:31 | 타입 안전성 |
| C2 | Supabase `error.message`가 클라이언트에 직접 노출 | route.ts:39 | 보안 |
| C3 | `email_sends` LIMIT 없는 전체 조회 (성능 저하 위험) | route.ts:33-35 | 성능 |
| C4 | 이메일 마스킹이 클라이언트에서만 수행 — API 응답에 원본 이메일 노출 | route.ts:74-80 | 보안 |
| C5 | 클릭 추적 엔드포인트 오픈 리다이렉트 취약점 | track/route.ts:89-95 | 보안 (별도 파일) |
| C6 | `email_sends` 테이블 RLS 정책 없음 | migrations/ | DB 보안 |

### C1 상세
- `email_sends` 테이블에 `content_id` 컬럼이 마이그레이션(00012)으로 추가됐으나, `src/types/database.ts`와 `src/types/supabase.ts`에 반영 안 됨
- `(svc as any)` 캐스트로 전체 쿼리 체인의 타입 체크 무력화
- **수정**: `supabase gen types typescript` 실행 후 `as any` 제거

### C2 상세
- `{ error: error.message }` → DB 스키마 정보(테이블명, 컬럼명) 클라이언트 노출 가능
- **수정**: 제네릭 메시지 `"성과 데이터 조회에 실패했습니다."` 반환, `error.message`는 `console.error`에만 유지

### C3 상세
- `.eq("status", "sent")` 전체 조회 → 수천~수만 행 가능
- **수정**: `.limit(1000)` 추가, 장기적으로 Supabase RPC로 서버사이드 집계

### C4 상세
- 현재: DB(원본) → API(원본 전달) → Client(`maskEmail()`)
- 브라우저 DevTools에서 원본 이메일 확인 가능
- **수정**: API route에서 마스킹 후 응답

### C5 상세 (별도 파일)
- `/api/email/track/route.ts`에서 `url` 파라미터 검증 없이 302 리다이렉트
- 피싱 링크로 악용 가능
- **수정**: `SITE_URL` 도메인 화이트리스트 검증

### C6 상세
- `email_sends` 테이블에 RLS 미설정
- 서비스 클라이언트 사용하므로 현재 우회되지만, 직접 Supabase 접근 시 위험
- **수정**: `ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY` + admin 전용 정책

## Warning 이슈 (9건)

| # | 이슈 | 파일:라인 | 카테고리 |
|---|------|-----------|----------|
| W1 | fetch 에러 무시 `.catch(() => {})` — 에러 상태 UI 없음 | tab.tsx:67-74 | UX |
| W2 | 356줄, StatCard 컴포넌트 추출 가능 (60줄 반복) | tab.tsx:120-179 | DRY |
| W3 | `grid-cols-4` 모바일 미대응 → `grid-cols-2 sm:grid-cols-4` 필요 | tab.tsx:120 | 반응형 |
| W4 | 배열 인덱스를 React key로 사용 `key={i}` | tab.tsx:197 | React |
| W5 | 열람율/클릭율 계산 로직 서버/클라이언트 중복 | tab.tsx + route.ts | DRY |
| W6 | `TYPE_LABEL` 역할 라벨 매핑 다른 파일과 중복 가능 | tab.tsx:48-53 | DRY |
| W7 | `Campaign`/`SendRecord` 타입 서버/클라이언트 미공유 | 양쪽 | 타입 |
| W8 | analytics 엔드포인트 레이트 리밋 없음 | route.ts | 보안 |
| W9 | 캐싱 없음 — 매 요청마다 전체 재조회 | route.ts | 성능 |

## 통과 항목

- ✅ 한국어 UI 준수 (영어 라벨 없음)
- ✅ 인증/권한 체크 (`getUser()` + `role === "admin"`)
- ✅ 빈 상태 처리 (발송 0건 → 안내 메시지)
- ✅ 로딩 상태 처리 (Loader2 스피너)
- ✅ 네이밍 컨벤션 (camelCase/PascalCase/UPPER_SNAKE)
- ✅ 디자인 시스템 색상 (시맨틱 컬러 적절 사용)

## 수정 우선순위

1. **즉시 수정** (이번 배포): C2, C3, C4
2. **다음 스프린트**: C1 (타입 재생성), C5 (오픈 리다이렉트), C6 (RLS)
3. **개선**: W1, W3, W4 (UX/반응형/React key)
