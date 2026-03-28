# 개인정보처리방침 필수동의 — Plan

## 요구사항
회원가입 시 개인정보처리방침 필수 동의 체크박스를 추가하고, 동의 시점을 DB에 기록하며, /privacy 페이지 내용을 실제 서비스 기준으로 보강한다.

## 범위
| 항목 | 포함 | 제외 |
|------|------|------|
| 회원가입 체크박스 | O | |
| /privacy 내용 보강 | O | |
| 동의 시점 DB 기록 | O | |
| 로그인 페이지 | | X |
| 기존 유저 영향 | | X (NULL 허용) |

## 성공 기준
1. 체크 안 하고 가입 → 버튼 disabled
2. 체크하고 가입 → 정상 가입 + DB에 privacy_agreed_at 기록
3. /privacy 페이지 → TASK에 명시된 항목 모두 포함
4. 기존 유저 영향 없음 (컬럼 NULL 허용)
5. npm run build 성공

## 태스크 분해
### T1. 회원가입 페이지 체크박스 추가
- **파일**: `src/app/(auth)/signup/page.tsx`
- **내용**: 가입 버튼 위에 체크박스 + "개인정보처리방침" 링크 (새 탭)
- **isFormValid에 privacyAgreed 조건 추가**

### T2. /privacy 페이지 내용 보강
- **파일**: `src/app/privacy/page.tsx`
- **내용**: TASK에 명시된 7개 항목 반영 (수집 정보, 이용 목적, 보유 기간, 제3자 제공, 이용 데이터, 동의 철회, 문의)

### T3. 동의 시점 DB 기록
- **DB**: `profiles` 테이블에 `privacy_agreed_at TIMESTAMPTZ` 컬럼 추가 (NULL 허용)
- **파일**: `src/actions/auth.ts` — `savePrivacyConsent()` 서버 액션 추가
- **파일**: `src/app/(auth)/signup/page.tsx` — 가입 성공 후 서버 액션 호출

## 관련 파일
- `src/app/(auth)/signup/page.tsx` — 회원가입 폼
- `src/app/privacy/page.tsx` — 개인정보처리방침 페이지
- `src/actions/auth.ts` — 인증 서버 액션
- `src/types/database.ts` — DB 타입 (privacy_agreed_at 추가)

## 의존성
- T1, T2는 독립적 (병렬 가능)
- T3는 T1 완료 후 (체크박스 상태 필요)
