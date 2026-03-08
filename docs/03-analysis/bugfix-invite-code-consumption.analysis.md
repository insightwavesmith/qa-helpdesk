# 초대코드 invite_code_used 저장 + used_count 증가 — Gap 분석

> 분석일: 2026-03-09

## Match Rate: 100%

## 설계 기준
- docs/01-plan/features/bugfix-pagination-invitecode.plan.md (버그2 섹션)
- docs/02-design/features/bugfix-pagination-invitecode.design.md (버그2 섹션)

## 일치 항목

| # | 설계 항목 | 구현 상태 | 일치 |
|---|-----------|-----------|------|
| 1 | DB 데이터 수동 수정 (invite_code_used 복구) | ✅ 마이그레이션 C1: auth.users 메타데이터에서 복구 | ✅ |
| 2 | 전체 초대코드 used_count 정합성 재계산 | ✅ 마이그레이션 C2: profiles 기준 카운트로 재계산 | ✅ |
| 3 | 신규 가입 시 used_count +1 증가 | ✅ RPC consume_invite_code: FOR UPDATE 행잠금 + 원자적 증가 | ✅ |
| 4 | 신규 가입 시 invite_code_used 저장 | ✅ 이중 보장: (A) 트리거에서 저장 + (B) RPC에서 저장 | ✅ |
| 5 | max_uses 도달 시 비활성화 | ✅ RPC 내 v_current_used >= max_uses 체크 | ✅ |

## 불일치 항목
없음

## 설계 대비 추가 구현 (개선)

| # | 추가 항목 | 이유 |
|---|-----------|------|
| 1 | handle_new_user 트리거에 invite_code_used 추가 | 서버 액션 실패 시에도 트리거에서 최소 저장 보장 (벨트) |
| 2 | consume_invite_code RPC 함수 | 기존 multi-step JS 업데이트 → 단일 트랜잭션 + FOR UPDATE 행잠금으로 원자적 처리 (서스펜더) |
| 3 | student_registry 매칭도 RPC 내 포함 | 기존과 동일 기능이나 트랜잭션 내 일관성 보장 |

## 근본 원인 분석

### 기존 코드의 문제
1. **handle_new_user 트리거**가 `invite_code_used` 컬럼을 INSERT하지 않음
2. **useInviteCode 서버 액션**이 multi-step (read → update invite_codes → update profiles → update student_registry)으로 구성되어, 중간 단계 실패 시 silent failure
3. **`const` → `let` 변경**은 4차 수정에서 해결했으나, 기존 5명 데이터 미복구

### 수정 내용
1. **트리거 업데이트**: `handle_new_user()`에 `invite_code_used` 컬럼 추가 → signUp 시 트리거가 메타데이터에서 직접 저장
2. **RPC 함수**: `consume_invite_code()` — FOR UPDATE 행잠금 + 단일 트랜잭션으로 used_count 증가 + profiles 업데이트 + student_registry 매칭을 원자적 처리
3. **데이터 복구**: auth.users 메타데이터에서 invite_code 추출 → profiles 업데이트, used_count 재계산

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `supabase/migrations/20260309_fix_invite_code_consumption.sql` | 트리거 업데이트 + RPC 함수 생성 + 데이터 복구 |
| `src/actions/invites.ts` | useInviteCode → RPC 호출로 교체 (122줄 → 40줄) |

## 빌드 검증
- [x] `npx tsc --noEmit` — 타입 에러 0개
- [x] `npx eslint` — lint 에러 0개
- [x] `npm run build` — 빌드 성공
