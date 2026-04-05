---
name: sanyuan-security
description: |
  ByteDance 보안 점검 스킬. Shannon보다 가벼운 정적 분석.
  Use when: 빠른 보안 체크, 코드 리뷰 시 보안, "간단히 보안 확인"
---

# Sanyuan Security — ByteDance 보안 점검

> 출처: sanyuan0704/sanyuan-skills. ByteDance 연구원 제작.

## 점검 항목
1. 하드코딩된 시크릿/토큰
2. SQL injection 위험 패턴
3. Path traversal 위험 패턴
4. XSS 위험 패턴
5. 인증 미적용 엔드포인트
6. 의존성 취약점 (npm audit / pip audit)

## 사용법
코드 리뷰 시 "보안 점검해라" → 이 스킬 자동 활성화
