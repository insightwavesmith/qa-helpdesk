# 뉴스레터 에디터 도입 (Phase 1) — Plan

## 1. 목표
콘텐츠 허브 관리자의 뉴스레터 편집을 MDXEditor(마크다운) → Unlayer(드래그앤드롭) 에디터로 전환.

## 2. 범위
- Unlayer 에디터 통합 (react-email-editor)
- DB 컬럼 추가 (email_design_json, email_html)
- 전용 저장 API route 신규 생성
- BS CAMP 기본 템플릿 1개
- 이메일 발송 시 Unlayer HTML 분기 추가

## 3. 범위 외
- 기존 email_summary 파이프라인 수정 (보호)
- 기존 Server Action(contents.ts) 수정
- Phase 2 AI→Unlayer JSON 직접 생성
- /admin/email 페이지 (TipTap) 수정

## 4. 제약 사항
- Unlayer 무료 플랜 (projectId: 284274)
- React 19 peer dep → --legacy-peer-deps
- SSR 비활성화 필수 (dynamic import)
- 기존 파이프라인 100% 보존

## 5. 성공 기준
- [ ] Unlayer 에디터 로드 (SSR 에러 없음)
- [ ] 블록 드래그앤드롭 정상
- [ ] 저장 → 새로고침 → 디자인 복원
- [ ] Unlayer HTML 발송 시 이중 래핑 없음
- [ ] 수신거부 링크 정상
- [ ] 기존 email_summary 발송 100% 정상
- [ ] npm run build 성공

## 6. 태스크 의존성
```
T1 (DB+타입) ─┬─ T3 (저장 API)
              │
T2 (에디터UI) ─┼─ T3 연동 ─── T4 (기본 템플릿)
                              │
                          T5 (발송 분기)
```

## 7. 리스크
| 리스크 | 대응 |
|--------|------|
| exportHtml 이중 래핑 | isUnlayerHtml 플래그로 renderEmail 스킵 |
| body size limit | 전용 API route에서 10MB 허용 |
| SSR 충돌 | dynamic import + ssr: false |
| React 19 peer dep 충돌 | --legacy-peer-deps |
| 수신거부 placeholder 누락 | 기본 템플릿 푸터에 필수 포함 |
