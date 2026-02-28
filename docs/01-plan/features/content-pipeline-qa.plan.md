# Content Pipeline QA — Plan

> 2026-02-15 | 콘텐츠 파이프라인 v3 아키텍처 재설계

## 배경
QA 점검 결과 5건의 구조적 문제 발견:
1. RAG 미연결 (생성↔지식 단절)
2. webinar 타입 → Template B 미매핑
3. email_summary에 배너 ### 구조 미포함
4. 미리보기/검토 단계 부재
5. TYPE_PROMPTS에 실제 강의 정보 없음

## 목표
- 통합 지식 서비스 구조: 하나의 Knowledge Layer → 다수 Consumer (QA 답변, 뉴스레터, 정보공유, 향후 확장)
- RAG를 콘텐츠 생성에 연결
- 타입 시스템 정리 (TYPE_TO_TEMPLATE 상수 테이블)
- email_summary 배너 구조 강제
- 미리보기+검증 단계 신설

## v3 아키텍처 (5계층)
```
LAYER 0a · 지식 기반 (pgvector + bge-m3 + Gemini embedding)
LAYER 0b · RAG Bridge (통합 검색 → 컨텍스트 조립) ← NEW
LAYER 1a · AI 생성 (Claude + RAG context + emailSummaryGuide 강화)
LAYER 1b · 미리보기+검증 (### 헤딩 분석, 배너 매칭 시각화) ← NEW
LAYER 2  · 템플릿 빌드+배포 (TYPE_TO_TEMPLATE, Unlayer, Resend)
```

## Consumer 확장 구조
```
Knowledge Service (LAYER 0a + 0b)
  ├─ Consumer 1: QA AI 답변 (수강생 질문 → 지식 검색 → 답변)
  ├─ Consumer 2: 뉴스레터/정보공유 (주제 → 지식 검색 → 콘텐츠 생성)
  ├─ Consumer 3: 웨비나 모집글 (일정+강의 내용 → 모집 콘텐츠)
  └─ Consumer N: (미래) 챗봇, 커리큘럼 자동 생성 등
```

## 구현 로드맵
- P0 (즉시): 타입 매핑 + emailSummaryGuide — ~35줄
- P1 (1~2일): RAG 연결 — ~50줄
- P2 (3~5일): 미리보기 UX + 검증 — ~175줄

## ADR
1. RAG 주입: system prompt에 주입 (Accepted)
2. 타입 통합: TYPE_TO_TEMPLATE 매핑 테이블 분리 (Accepted)
3. email_summary 검증: soft(프롬프트) + hard(포스트 검증) 혼합 (Accepted)
4. 미리보기 UX: 모달 내 추가 스텝 (Accepted)
5. 토큰 예산: RAG 3,000자 / 생성 5,000자 (Accepted)

## 리뷰 보고서
- `docs/review/2026-02-15-content-pipeline-qa.html` — QA 이슈 5건 분석
- `docs/review/2026-02-15-content-pipeline-architecture-v3.html` — v3 아키텍처 (61KB, Mermaid 3, ADR 5)

## 상태
- [x] QA 분석 (5건 이슈 발견)
- [x] v3 아키텍처 보고서 작성
- [ ] Smith님 승인
- [ ] P0 구현
- [ ] P1 구현
- [ ] P2 구현
