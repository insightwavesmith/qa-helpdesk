# T2. 초대코드 검증 API + student_registry 매칭 설계서

## 1. 데이터 모델

### invite_codes (기존 테이블)
| 필드 | 타입 | 설명 |
|------|------|------|
| code | text PK | 초대코드 (예: BS6-2026) |
| cohort | text | 기수 |
| created_by | uuid | 생성한 관리자 |
| expires_at | timestamptz | 만료일시 |
| max_uses | integer | 최대 사용 횟수 |
| used_count | integer | 현재 사용 횟수 |

### student_registry (기존 테이블)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| email | text | 수강생 이메일 |
| matched_profile_id | uuid | 매칭된 profiles.id |

### profiles (기존 + 신규 컬럼)
| 필드 | 타입 | 설명 |
|------|------|------|
| invite_code_used | text | 사용한 초대코드 |
| cohort | text | 기수 |

## 2. API 설계

### POST /api/invite/validate
- 인증: 불필요 (공개 API, 가입 폼에서 호출)
- 요청: `{ code: string }`
- 응답 (성공): `{ valid: true, cohort: string }`
- 응답 (실패): `{ valid: false, error: string }`
- 검증 순서: 존재 -> 만료 -> 사용횟수

### Server Action: useInviteCode(userId, userEmail, code)
- 인증: 호출측에서 보장 (가입 직후)
- 로직:
  1. invite_codes UPDATE: used_count = used_count + 1 WHERE used_count < max_uses
  2. 영향 행 0 -> 에러 반환
  3. invite_codes에서 cohort 조회
  4. profiles UPDATE: invite_code_used, cohort
  5. student_registry 이메일 매칭 시도

### Server Action: getInviteCodes()
- 인증: requireAdmin()
- 반환: 전체 초대코드 목록

### Server Action: createInviteCode(data)
- 인증: requireAdmin()
- 입력: { code, cohort, expiresAt, maxUses }

### Server Action: deleteInviteCode(code)
- 인증: requireAdmin()

## 3. 에러 처리
| 상황 | 에러 메시지 |
|------|-------------|
| 코드 없음 | "유효하지 않은 초대코드입니다" |
| 코드 만료 | "초대코드가 만료되었습니다" |
| 사용 초과 | "초대코드 사용 한도를 초과했습니다" |
| 코드 미입력 | "초대코드를 입력해주세요" |
| DB 에러 | "서버 오류가 발생했습니다" |

## 4. 구현 순서
1. [x] Plan 문서 작성
2. [x] Design 문서 작성
3. [x] POST /api/invite/validate/route.ts 구현
4. [x] src/actions/invites.ts 구현
5. [ ] npm run build 확인 (pre-existing type error in admin/members — frontend 담당)
