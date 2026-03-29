# 에러 분류 룰북

> 자동 분류: `.claude/hooks/helpers/error-classifier.sh`
> 분류만 자동, TASK 자동 생성 안 함.

## 에러 패턴 목록

| 코드 | 패턴 | 심각도 | 자동 대응 | 수동 대응 |
|------|------|--------|----------|----------|
| RATE_LIMIT | `HTTP 429`, `rate limit`, `too many requests` | warning | 백오프 대기 후 재시도 | API 호출 빈도 조정 |
| AUTH_EXPIRED | `HTTP 401`, `unauthorized`, `invalid token` | critical | - | 토큰 갱신 |
| PERMISSION | `HTTP 403`, `forbidden`, `EACCES`, `Permission denied` | critical | - | 권한 확인 (파일/API) |
| HTTP_CLIENT_ERROR | `HTTP 4xx` (기타) | warning | - | 요청 파라미터 확인 |
| LOCK_CONFLICT | `ENOENT.*lock`, `lock file`, `EBUSY` | warning | lock 프로세스 확인 | 수동 해제 |
| NETWORK | `ETIMEOUT`, `ECONNREFUSED`, `ECONNRESET` | warning | health check | 서비스 재시작 |
| DEPENDENCY | `Cannot find module`, `MODULE_NOT_FOUND` | warning | `npm install` 자동 실행 | 패키지 버전 확인 |
| HOOK_GATE | `exit code 2`, `BLOCKED:`, `FAIL:.*quality` | info | - | 게이트 조건 해결 |
| CONTEXT_OVERFLOW | `context.*compact`, `auto-compact`, `token limit` | info | compaction 대기 | 핵심 파일 재로드 |
| UNKNOWN | 미분류 | info | - | 로그 수동 분석 |

## 심각도 기준

| 심각도 | 의미 | 대응 |
|--------|------|------|
| critical | 서비스 장애 또는 보안 문제 | 즉시 대응 필요 |
| warning | 기능 저하 또는 반복 에러 | 현재 작업 완료 후 대응 |
| info | 정상 프로세스 (게이트 차단 등) | 원인 확인만, 대응 불필요 |

## 사용 방법

```bash
source .claude/hooks/helpers/error-classifier.sh
classify_error "Error: connect ECONNREFUSED 127.0.0.1:7899"
echo "$CLASSIFIED_CODE"      # → NETWORK
echo "$CLASSIFIED_SEVERITY"  # → warning
echo "$CLASSIFIED_ACTION"    # → 서비스 health check → 재시작
```

## 룰 추가 가이드

1. 새 에러 패턴 발견 시 이 표에 추가
2. `error-classifier.sh`에 `grep -qiE` 패턴 추가 (우선순위 순서 주의)
3. TDD 케이스 추가 (`__tests__/hooks/error-classifier.test.ts`)
