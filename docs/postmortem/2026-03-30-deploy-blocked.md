---
id: PM-004
date: 2026-03-30
severity: warning
category: permission
status: resolved
prevention_tdd: [__tests__/hooks/deploy-authority.test.ts]
---

# 리더 배포 명령어 차단

## 1. 사고 요약
> 2026-03-30 — validate-delegate.sh가 리더의 src/ 수정을 차단하는 것은 맞지만, 별도 인프라 명령어 권한 구분 없음 → "리더=아무것도 안 함"으로 과확장 → 배포 자체가 불가능한 상태로 고착

감지 방법: 배포 시도 시 차단 확인
영향 시간: 세션 중

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 배포 시도 | 리더가 gcloud run deploy 실행 → 차단 |
| 분석 | 코드 수정 차단과 인프라 명령어 차단 미구분 확인 |
| 수정 | validate-deploy-authority.sh 구현 (리더 배포 허용) |

## 3. 영향 범위
- **영향 파일**: .claude/hooks/validate-deploy-authority.sh
- **영향 기능**: 배포 프로세스
- **사용자 영향**: 기능 저하 — 배포 불가
- **데이터 영향**: 없음

## 4. 근본 원인 (5 Whys)
1. Why: "리더=코드 안 씀" 원칙을 "리더=아무것도 안 함"으로 과확장
2. Why: 코드 수정 차단과 인프라 명령어 차단을 구분하지 않음

**근본 원인 한 줄**: 권한 규칙의 범위가 모호하여 정당한 작업까지 차단

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| validate-deploy-authority.sh | 리더 pane_index=0 배포 허용 | chain-100-percent |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | 배포 화이트리스트 구현 | hook | deploy-authority:P3-1~P3-6 | resolved |

## 7. 교훈
- 권한 규칙은 정확한 범위 지정이 필수. "금지"의 범위가 모호하면 정당한 작업까지 차단.

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
