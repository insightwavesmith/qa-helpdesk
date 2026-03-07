# 큐레이션 잔여 버그 수정 Gap 분석

> Design: `docs/02-design/features/curation-residual-bugs.design.md`
> Date: 2026-03-07

---

## Match Rate: 95%

## 일치 항목

### T1: isMetadataKey 패턴 보강 (100%)
- [x] `COLON_KV_PATTERN`: `/^[a-z_]+:/i` → `/^[a-zA-Z_]+\s*:/` — 콜론 앞 공백 허용, 대소문자 명시적 매칭
- [x] `NUMERIC_SUFFIX` 패턴 추가: `/^[a-z_]+_\d+$/i` — `section_index_0` 등
- [x] `filterValidTopics` import하는 `curation-card.tsx`, `topic-map-view.tsx`는 코드 변경 불필요 (자동 반영)
- [x] 한국어 포함 토픽은 필터링 안 됨 (정상 보존)

### T2: formatSummary JSON 배열 엣지케이스 (90%)
- [x] BOM 제거: `aiSummary.replace(/^\uFEFF/, "")` 추가
- [x] 줄바꿈 sanitize: `trimmed.replace(/\n/g, "\\n").replace(/\t/g, "\\t")` 추가
- [x] fallback 강화: JSON 파싱 실패 시 `stripJsonChars`로 수동 strip 후 단일 텍스트 반환
- [x] `stripJsonChars`에 `\\n` → 공백 치환 추가
- [ ] DB 실제 1건의 값 확인 미실행 (DB 접근 불가 — 런타임 테스트 필요)

### T3: 불릿 스트리핑 regex 수정 (100%)
- [x] Before: `/^[\s]*[*\-•◦\d.]+[\s]*/`
- [x] After: `/^[\s]*(?:[-\u2022\u25E6]\s+|\d+[.)]\s+|\*(?!\*)\s+)/`
- [x] `\*(?!\*)` — 단일 `*` 불릿만 매칭, `**`(볼드)는 보존
- [x] 모든 불릿 패턴에 `\s+` (공백 필수) 추가
- [x] 검증 케이스 설계서 7개 패턴 모두 커버

## 불일치 항목

| 항목 | 설계 | 구현 | 사유 |
|------|------|------|------|
| DB 데이터 확인 | 구현 전 SQL 쿼리 실행 | 미실행 | DB 직접 접근 불가. 코드 패턴 기반으로 설계서 수정안 그대로 적용 |

## 수정 필요: 없음

## 빌드 검증
- [x] `npx tsc --noEmit` — 타입 에러 0개
- [x] `npm run lint` — 수정 파일 에러 0개 (기존 warning은 무관)
- [x] `npm run build` — 빌드 성공

## 변경 파일
1. `src/lib/topic-utils.ts` — T1: COLON_KV_PATTERN 수정 + NUMERIC_SUFFIX 추가
2. `src/components/curation/curation-card.tsx` — T2: BOM 제거 + JSON sanitize + fallback / T3: 불릿 regex 수정 + stripJsonChars \\n 처리
