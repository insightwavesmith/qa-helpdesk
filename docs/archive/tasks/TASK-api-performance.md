# TASK: 총가치각도기 API 응답속도 개선

---

## 빌드/테스트
- `npm run build` 성공 필수

---

## 현재 상황 (실측 데이터)
총가치각도기 페이지 로드 시 API 응답 시간:

```
/api/protractor/accounts    — 1,217ms
/api/sales-summary          — 475ms
/api/protractor/insights    — 1,273ms
/api/protractor/total-value — 2,126ms
/api/protractor/overlap     — 4,471ms  ← 제일 느림
/api/protractor/accounts    — 1,274ms  ← 중복 호출
```

수강생이 탭 전환할 때마다 4~5초 기다려야 해서 체감 속도가 매우 나쁨.

---

## T1. accounts 중복 호출 제거

### 이게 뭔지
같은 페이지에서 `/api/protractor/accounts`를 2번 호출하고 있음.

### 왜 필요한지
불필요한 네트워크 요청 1회 + 서버 부하 감소.

### 기대
accounts API 호출이 1회로 줄어야 함.

---

## T2. overlap(타겟중복률) 속도 개선

### 이게 뭔지
4.5초 걸리는 가장 느린 API. 수강생이 페이지 볼 때마다 이걸 기다려야 함.

### 왜 필요한지
총가치각도기 체감 로딩의 병목. 이거 하나가 전체 페이지 로딩을 잡고 있음.

### 기대
2초 이내로 응답. 사전계산 테이블 활용하거나, 쿼리 최적화하거나, 캐시하거나 — 방법은 자유.

---

## T3. total-value 사전계산 캐시 활용 확인

### 이게 뭔지
사전계산 Phase 1에서 `t3_scores_precomputed` 테이블을 만들었는데, total-value API가 아직 2.1초 걸림. 캐시를 안 타고 있을 가능성.

### 왜 필요한지
사전계산의 목적이 응답속도 개선인데, 개선이 안 되고 있으면 의미 없음.

### 기대
캐시 히트 시 500ms 이내. 캐시 미스 시 기존 실시간 계산 폴백.

---

## T4. Supabase 쿼리 최적화

### 이게 뭔지
전반적으로 1초 이상 걸리는 API가 많음. 쿼리 자체가 비효율적일 수 있음.

### 왜 필요한지
모든 API가 1초 넘으면 탭 전환 체감이 나쁨.

### 기대
주요 API (accounts, insights, total-value) 평균 1초 이내.

---

## 검증 기준
- `npm run build` 성공
- 총가치각도기 페이지 전체 로딩 5초 → 2초 이내 목표
- 기존 기능 깨지지 않음 (데이터 정확도 유지)

## 하지 말 것
- UI/디자인 변경 금지
- 새로운 외부 의존성 추가 금지
- 다른 페이지(Q&A, 정보공유 등) 수정 금지
