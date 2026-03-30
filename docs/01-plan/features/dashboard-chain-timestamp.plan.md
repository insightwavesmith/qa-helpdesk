# Dashboard Chain Timestamp (대시보드 체인 보고 시각 표시) Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Dashboard Chain Timestamp (대시보드 체인 보고 시각 표시) |
| 작성일 | 2026-03-30 |
| 프로세스 레벨 | L2 (src/ 수정 — UI 컴포넌트 추가) |
| 우선순위 | P2 |
| 배경 | PDCA 체인 완료 보고가 자동화되었으나, **마지막 보고가 언제 이루어졌는지** 대시보드에서 확인할 방법이 없음. Smith님이 체인 정상 동작 여부를 한눈에 파악하기 어려움. |
| 항목 수 | 3건 (JSON 생성 + API 라우트 + UI 컴포넌트) |

### Value Delivered (4관점)

| 관점 | 내용 |
|------|------|
| **Problem** | 체인 보고 완료 시각을 확인하려면 로그/파일을 직접 봐야 함. 대시보드에 표시 없음. |
| **Solution** | 체인 완료 시 `last-completion-report.json`에 타임스탬프 기록 → API로 서빙 → 대시보드 UI에 표시 |
| **Function UX Effect** | Admin 대시보드에서 "마지막 체인 보고: 3분 전" 형태로 즉시 확인 가능 |
| **Core Value** | 체인 자동화 **정상 동작 여부를 UI에서 실시간 모니터링** |

---

## 요구사항

### R1. JSON 파일 생성 (체인 완료 시)
- PDCA 체인 완료 보고 hook에서 `.bkit/runtime/last-completion-report.json` 파일 생성/갱신
- 스키마:
  ```json
  {
    "ts": "2026-03-30T15:30:00+09:00",
    "feature": "chain-context-fix",
    "matchRate": 98,
    "reportedBy": "CTO-1",
    "reportedTo": "COO"
  }
  ```
- `ts`: ISO 8601 타임스탬프 (체인 완료 시각)
- 이전 값은 덮어쓰기 (최신 1건만 유지)

### R2. API 라우트
- `GET /api/admin/chain-status` — `last-completion-report.json` 읽어서 JSON 응답
- Admin 권한 체크 필수
- 파일 미존재 시 `{ "ts": null, "message": "보고 없음" }` 반환

### R3. 대시보드 UI 표시
- Admin 대시보드(`admin-dashboard.tsx`)에 표시
- 위치: 기존 통계 카드 영역 상단 또는 하단
- 표시 형식: "마지막 체인 보고: N분 전 (feature명)" — `timeAgo()` 패턴 재사용
- 24시간 이상 경과 시 경고 스타일(빨간색 텍스트)
- 보고 없음 시 회색 텍스트로 "체인 보고 없음" 표시

---

## 구현 범위

| # | 항목 | 파일 (예상) | 신규/수정 |
|---|------|------------|----------|
| 1 | JSON 생성 로직 | `.bkit/hooks/helpers/` 내 체인 완료 핸들러 | 수정 |
| 2 | API 라우트 | `src/app/api/admin/chain-status/route.ts` | **신규** |
| 3 | UI 컴포넌트 | `src/components/dashboard/ChainStatusBadge.tsx` | **신규** |
| 4 | Admin 대시보드 통합 | `src/app/(main)/dashboard/admin-dashboard.tsx` | 수정 (최소) |

---

## 제외 범위

- 체인 히스토리 목록 (최신 1건만 표시)
- 체인 수동 트리거 UI
- 알림/푸시 기능

---

## 기술 판단

### JSON 파일 읽기 방식
- **선택**: API 라우트에서 `fs.readFileSync`로 직접 읽기
- **이유**: `.bkit/runtime/`은 서버 로컬 파일. DB 저장 불필요 (운영 메타데이터)
- **주의**: Cloud Run 배포 환경에서는 이 파일이 컨테이너 내부에 없으므로, **개발 환경 전용** 또는 별도 저장소(GCS) 연동 필요 시 Design 단계에서 결정

### timeAgo 유틸
- 기존 `member-dashboard.tsx`, `student-home.tsx`에 인라인 중복 정의됨
- 이번 기능에서는 `ChainStatusBadge` 내부에 동일 패턴 사용 (기존 파일 수정 안 함)

---

## 의존성

- 체인 자동화 정상 동작 (chain-context-fix 완료 — ✅ 해결됨)
- `.bkit/runtime/` 디렉토리 존재 (✅ 확인됨)

---

## 완료 기준

- [ ] 체인 완료 시 `last-completion-report.json` 생성 확인
- [ ] `/api/admin/chain-status` 정상 응답
- [ ] Admin 대시보드에 타임스탬프 표시
- [ ] 24시간 초과 시 경고 스타일 적용
- [ ] `npx tsc --noEmit --quiet` 통과
- [ ] `npm run build` 성공
- [ ] Gap 분석 Match Rate 90%+
