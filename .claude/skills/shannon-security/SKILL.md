---
name: shannon-security
description: |
  AI 보안 테스터. 소스코드 분석 → 공격 벡터 식별 → 실제 익스플로잇 → 리포트.
  Use when: 보안 검증, 취약점 분석, 펜테스트, security audit, "보안 괜찮나?"
---

# Shannon Security — AI 펜테스터

> 출처: KeygraphHQ/shannon. XBOW 벤치마크 96.15%.

## 설치
```bash
pip install shannon-lite
```

## 사용법
```bash
# 소스코드 기반 보안 스캔
shannon scan --target ./brick --report /tmp/security-report.md

# 특정 파일만
shannon scan --target ./brick/auth/ --focus authentication
```

## 브릭 Gate로 연결
```yaml
gate:
  handlers:
    - type: command
      command: "shannon scan --target ./brick --report /tmp/security-report.md"
  on_fail: fail   # 취약점 발견 시 블록 실패
```

## 검증 항목
- Path traversal (../../../)
- SQL injection
- 인증 우회
- SSRF
- XSS
- 토큰/시크릿 노출
