---
name: openchrome-qa
description: |
  실제 Chrome 브라우저 자동화 QA. 로그인 세션 유지, 봇 감지 회피, 15x 토큰 압축.
  Use when: 브라우저 테스트, UI QA, E2E 테스트, "실제로 클릭해서 확인", 웹 자동화
---

# OpenChrome QA — 브라우저 자동화

> 출처: shaun0927/openchrome. Playwright 대비 RAM 1/17, 속도 80x.

## 설치
```bash
npm i -g openchrome-mcp
```

## MCP 등록
```bash
claude mcp add openchrome -- npx openchrome-mcp
```

## 특징
- 실제 Chrome CDP 직접 제어 (미들웨어 없음)
- 로그인 세션 유지 (매번 로그인 불필요)
- 봇 감지 안 됨 (TLS 핑거프린트 정상)
- 20개 병렬 탭 300MB (Playwright는 5GB+)
- DOM 직렬화 15x 토큰 압축
- 힌트 엔진 30+ 규칙 (LLM 실수 방지)

## 브릭 Gate로 연결
```yaml
gate:
  handlers:
    - type: command
      command: "npx openchrome-mcp test --url https://bscamp.app --check login,dashboard,qa"
```

## 사용 예시
```
oc navigate https://bscamp.app
oc click "로그인" 
oc fill "#email" "test@bscamp.kr"
oc screenshot /tmp/qa-result.png
```
