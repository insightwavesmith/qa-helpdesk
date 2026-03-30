---
id: PM-005
date: 2026-03-30
severity: critical
category: infra
status: resolved
prevention_tdd: [__tests__/hooks/chain-e2e-realworld.test.ts]
---

# dashboard-sync 무한 커밋 루프

## 1. 사고 요약
> 2026-03-30 — dashboard-sync-loop.sh가 매분 git commit+push → 7,396건 커밋 생성 + GitHub Actions 메일 폭탄

감지 방법: GitHub 메일 알림 폭주 + git log 확인
영향 시간: 스크립트 실행 전체 기간

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 실행 시작 | dashboard-sync-loop.sh cron 실행 (1분 간격) |
| 발견 | GitHub Actions 메일 7,396건 수신 |
| 수정 | 스크립트 삭제 + GCS 직접 업로드 + md5 비교 설계 |

## 3. 영향 범위
- **영향 파일**: .claude/hooks/dashboard-sync.sh (삭제됨)
- **영향 기능**: 대시보드 상태 동기화
- **사용자 영향**: 없음 (내부 인프라)
- **데이터 영향**: git 히스토리 오염 (7,396 커밋)

## 4. 근본 원인 (5 Whys)
1. Why: state 동기화를 git commit+push로 구현한 설계 결함
2. Why: 변경 감지 없이 무조건 commit (md5 비교 없음)
3. Why: 실행 간격 1분 (과도) + 정지 메커니즘 없음

**근본 원인 한 줄**: git commit 자동화 + 변경 감지 없음 = 무한 루프

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| dashboard-sync-loop.sh | 삭제 | chain-100-percent |
| 설계서 | GCS 직접 업로드 + md5 비교 방식으로 재설계 | - |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | GCS 직접 업로드 + md5 비교 | hook | chain-e2e-realworld:P4-1 (변경 시만) | resolved |
| 2 | 미변경 시 스킵 | hook | chain-e2e-realworld:P4-2 (미변경 스킵) | resolved |

## 7. 교훈
- 자동 실행 스크립트에는 반드시: (1) 변경 감지 (2) 실행 간격 제한 (3) 정지 메커니즘
- git commit을 자동화하면 안 된다

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
