# Protractor Data Fix (총가치각도기 데이터 수정) Plan

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Protractor Data Fix (총가치각도기 데이터 수정) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 1~2일 |

| 관점 | 내용 |
|------|------|
| Problem | purchase 중복집계(2배), Mixpanel 전 계정 미연동, 7개 계정 Meta 데이터 없음 |
| Solution | 수집 로직 수정 + 기존 데이터 보정, Mixpanel 설정 진단, 계정별 원인 분석 및 조치 |
| Function UX Effect | 정확한 구매 지표, Mixpanel 매출 연동 가능, 누락 계정 데이터 복구 |
| Core Value | 총가치각도기 신뢰도 확보 — 부정확한 데이터로는 코칭 불가 |

## 배경

총가치각도기에서 3건의 데이터 문제가 발견됨. 모두 수강생 코칭에 직접 영향을 미치는 문제로 신속한 해결 필요.

### 문제 1: purchase 중복집계
- **현상**: 구매 수가 2배로 표시됨 (실제 37건 → 74건으로 표시)
- **보고 위치**: `getActionValue` 함수에서 `purchase` + `omni_purchase` 합산 의심
- **영향 범위**: purchases, purchase_value, click_to_purchase_rate, checkout_to_purchase_rate, reach_to_purchase_rate, ROAS — 전환 지표 전체

### 문제 2: Mixpanel 연결 미설정
- **현상**: 20개 전체 계정이 Mixpanel 미설정 상태
- **결과**: `daily_mixpanel_insights` 테이블 비어있음, 매출 데이터 수집 불가
- **영향 범위**: 수강생 실매출 분석, 처방 시스템 정확도

### 문제 3: Meta 데이터 없음 7개 계정
- **대상**: 유비드, 리바이너, 고요아, 아토리카버크림, MKM_동현, 온기브, 리아르
- **현상**: daily_ad_insights에 데이터 없음
- **가능 원인**: 미발견/비활성/권한거부/토큰 문제

## 범위

| 구분 | 포함 | 제외 |
|------|------|------|
| 문제 1 | 수집 로직 수정 + DB 기존 데이터 보정 | 벤치마크 재계산 (별도 TASK) |
| 문제 2 | 원인 분석 + 해결 방안 설계 | 수강생 개별 Mixpanel 설정 대행 |
| 문제 3 | 계정별 원인 진단 + 조치 | 새 BM 토큰 발급 (관리자 작업) |

## 성공 기준

1. purchase 관련 지표가 Meta Ads Manager와 ±5% 이내로 일치
2. Mixpanel 미연동 원인이 문서화되고 해결 경로가 명확
3. 7개 계정 각각의 데이터 없음 원인이 식별됨
4. npm run build 성공, lint 에러 0개

## 실행 순서

### Phase 1: 진단 (DB 데이터 검증)
- **T1**: purchase 중복 DB 검증 — raw_insight 대비 purchases 컬럼 비교
- **T2**: 7개 계정 ad_accounts 테이블 존재/상태 확인
- **T3**: Mixpanel 설정 상태 확인 (ad_accounts.mixpanel_project_id)

### Phase 2: 수정
- **T4**: purchase 수집 로직 수정 (omni_purchase 단일화)
- **T5**: 기존 daily_ad_insights 데이터 보정 SQL
- **T6**: 7개 계정 원인별 조치 (재발견/권한복구/활성화)

### Phase 3: 검증
- **T7**: 수정 후 특정 계정 재수집 + Meta Ads Manager 대조
- **T8**: tsc + build + Gap 분석

## 영향 파일 (예상)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/collect-daily-utils.ts` | `calculateMetrics` — purchase 추출 로직 수정 |
| `src/lib/protractor/meta-collector.ts` | 중복 `calculateMetrics` — 동일 수정 또는 제거 |
| `src/app/api/cron/collect-daily/route.ts` | 필요시 보정 스크립트 호출 |

## 위험 요소

| 위험 | 대응 |
|------|------|
| 기존 데이터 보정 시 다른 지표 훼손 | raw_insight에서 재계산, 보정 전 백업 |
| Meta API 토큰 만료로 7개 계정 복구 불가 | 관리자에게 토큰 갱신 요청 |
| omni_purchase 단일화 시 일부 계정 데이터 누락 | omni_purchase → purchase 폴백 체인 유지 |

## 참고 문서
- `docs/02-design/features/protractor-refactoring.design.md` — 기존 설계서
- `src/lib/protractor/metric-groups.ts` — 지표 정의 single source of truth
- `docs/adr/ADR-001-account-ownership.md` — 계정 종속 원칙
