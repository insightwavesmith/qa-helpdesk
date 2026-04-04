---
name: security-auditor
description: OWASP Top 10 보안 점검 + 코드 보안 분석.
---

# Security Auditor

OWASP Top 10 기준 보안 취약점 점검 스킬.

## 점검 항목

1. **Injection**: SQL/NoSQL/OS command injection
2. **Broken Authentication**: 인증 우회, 세션 관리
3. **Sensitive Data Exposure**: 민감 정보 노출
4. **XXE**: XML External Entity
5. **Broken Access Control**: 권한 상승, IDOR
6. **Security Misconfiguration**: 기본 설정 취약점
7. **XSS**: Cross-Site Scripting
8. **Insecure Deserialization**: 역직렬화 취약점
9. **Known Vulnerabilities**: 라이브러리 CVE
10. **Insufficient Logging**: 로깅/모니터링 부족

## 사용법

CTO가 배포 전 `/security-audit` 호출하여 보안 점검 수행.
