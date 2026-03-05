# T3: 정보공유 생성 프록시 경유

## 요구사항
- 정보공유 콘텐츠 생성(Opus) 시 AI_PROXY_URL 환경변수가 있으면 프록시 서버 경유
- 프록시 실패 시 기존 Anthropic API로 폴백 (서비스 중단 방지)
- AI_PROXY_URL이 없으면 기존 방식 그대로 유지
- Q&A 코드 수정 금지 (정보공유 생성만 변경)

## 범위
- 수정 파일: `src/app/api/admin/curation/generate/route.ts` (1개)
- 신규 패키지 없음 (fetch 내장)
- Anthropic SDK 제거 금지 (폴백 유지)

## 환경변수
- `AI_PROXY_URL`: 프록시 엔드포인트
- `AI_PROXY_KEY`: 프록시 인증 키

## 성공 기준
1. AI_PROXY_URL 설정 시 프록시로 요청 → 정상 응답
2. 프록시 실패(네트워크/타임아웃/5xx) → Anthropic API 폴백
3. AI_PROXY_URL 미설정 → 기존 동작 100% 동일
4. thinking 블록 처리 정상 (type === "text"만 추출)
5. tsc + lint + build 통과
6. Q&A 관련 코드 무변경 확인

## 하지 말 것
- knowledge.ts, domain-intelligence.ts 등 Q&A 코드 수정
- 정보공유 프롬프트 내용 수정
- AI 수정(revise) 엔드포인트 수정
- 새 패키지 설치
