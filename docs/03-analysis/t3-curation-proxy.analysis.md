# T3: 정보공유 생성 프록시 경유 — Gap 분석

분석 일자: 2026-03-05
수정 파일: src/app/api/admin/curation/generate/route.ts (1개)

## Match Rate: 100%

## 검증 항목 (11/11 일치)

| # | 항목 | 판정 | 상세 |
|---|------|------|------|
| 1 | 설계서 5-1~5-5 체크포인트 | ✅ 일치 | 5개 전부 구현 완료 |
| 2 | callViaProxy() 헬퍼 | ✅ 일치 | AbortController 120초 timeout, x-proxy-key 조건부 헤더, !ok throw |
| 3 | callAnthropicDirect() 헬퍼 | ✅ 일치 | 기존 fetch 로직 그대로 래핑 |
| 4 | 프록시 우선 → 폴백 분기 | ✅ 일치 | if(proxyUrl) try proxy → catch fallback 구조 |
| 5 | AI_PROXY_URL 미설정 시 기존 동작 | ✅ 일치 | else 분기에서 callAnthropicDirect 직접 호출 |
| 6 | 프록시+폴백 모두 실패 시 500 | ✅ 일치 | 내부 catch + 외곽 catch 모두 500 반환 |
| 7 | console.log/warn 로깅 | ✅ 일치 | 프록시 사용/실패/폴백성공/에러 4단계 로깅 |
| 8 | thinking 블록 처리 유지 | ✅ 일치 | type === "text" 추출 로직 무변경 |
| 9 | Q&A 코드 무변경 | ✅ 일치 | knowledge.ts, domain-intelligence.ts 변경 없음 |
| 10 | 프롬프트 내용 무변경 | ✅ 일치 | systemPrompt/userPrompt 텍스트 동일 |
| 11 | revise 엔드포인트 무변경 | ✅ 일치 | generate/route.ts 1개만 수정 |

## 빌드 검증
- tsc: ✅ 에러 0
- lint: ✅ 에러 0
- npm run build: ✅ 성공

## 수정 필요 항목
없음
