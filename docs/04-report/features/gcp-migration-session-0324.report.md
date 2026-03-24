# GCP 이관 + 배치 실행 세션 보고서

**날짜**: 2026-03-24
**세션**: main (Opus 4.6)
**소요 시간**: ~3시간

---

## 1. 완료 항목

### 1-1. Storage→GCS 이관 Phase 1 (Wave 1-4)
- **commit**: `546c117`
- **파일**: 20파일 (+201줄 -199줄)
- **내용**:
  - Wave 1: `/api/upload` route + `upload-client.ts` + 서버 사이드 4파일 GCS 교체
  - Wave 2: 클라이언트 10파일 `uploadFile()` from `@/lib/upload-client` 교체
  - Wave 3: 이메일 템플릿 3파일 `USE_CLOUD_SQL` dual-write 패턴 적용
  - Wave 4: tsc + lint + build 통과
- **Match Rate**: 95% (GCS 버킷 public 설정 + 배너 복사 미완)

### 1-2. 이벤트 체인 구현
- **commit**: `ff3ccfc`
- **파일**: 3파일
- **내용**:
  - `src/lib/pipeline-chain.ts` 생성 — fire-and-forget `triggerNext()` 유틸
  - `collect-daily/route.ts` — chain=true 시 process-media 자동 트리거
  - `process-media/route.ts` — chain=true 시 embed+saliency 병렬 트리거
- **체인 흐름**:
  ```
  collect-daily?chain=true → process-media → [embed-creatives, creative-saliency, video-saliency]
  ```

### 1-3. Vercel 의존 제거
- **commit**: `4292148`
- **파일**: 36파일 (-81줄)
- **내용**: 33개 API route에서 `export const maxDuration` 삭제 + `vercel.json` → `{}`

### 1-4. Cloud SQL 호환 fix
- **commit**: `9bcd934`
- **파일**: 2파일
- **내용**: `creative-saliency` + `video-saliency`에서 `creatives!inner(...)` PostgREST 조인 → 2-step query + JS merge 패턴으로 교체
- **검증**: creative-saliency HTTP 200 확인 (500카드, 474건 동기화)

### 1-5. CREATIVE_PIPELINE_URL 기본값
- **commit**: `4e3673e`
- **파일**: 3파일
- **내용**: `creative-saliency`, `video-saliency`, `analyze-lp-saliency`에 Cloud Run URL 기본값 추가

### 1-6. Destructive Detector hook
- **commit**: `dd72d45`
- **파일**: 5파일
- **내용**: 8가지 위험 패턴 자동 차단 (rm -rf, force push, DB삭제 등)

### 1-7. Cloud Scheduler 등록 (4건)
| Job | Schedule (KST) | 상태 |
|-----|---------------|------|
| bscamp-collect-daily | 매일 03:00 (chain=true) | 업데이트 |
| bscamp-embed-creatives | 매일 20:00 | 업데이트 |
| bscamp-creative-saliency | 매일 20:30 | 신규 |
| bscamp-video-saliency | 매일 21:00 | 신규 |

### 1-8. 배치 실행 결과

| 배치 | 1회차 | 2회차 | 합계 |
|------|-------|-------|------|
| creative-saliency | 500카드/474 sync | 500카드/420 sync | 1000카드, 894건 동기화 |
| embed-creatives | 50건/2 embedded | 50건/0 embedded | 100건 처리 |
| video-saliency | 타임아웃 | 157건/1 analyzed | 157건 |
| bulk sync | — | — | 2,804건 saliency_url 일괄 동기화 |

---

## 2. 커밋 이력 (이번 세션)

| 해시 | 메시지 | 파일 수 |
|------|--------|---------|
| `546c117` | feat: Storage→GCS 이관 Phase 1 | 20파일 |
| `ae41545` | fix: process-media Cloud SQL 호환 | 1파일 |
| `ff3ccfc` | feat: 수집 파이프라인 이벤트 체인 | 3파일 |
| `4292148` | chore: Vercel 의존 제거 maxDuration | 36파일 |
| `9bcd934` | fix: creative/video-saliency Cloud SQL 호환 | 2파일 |
| `4e3673e` | feat: PIPELINE_URL 기본값 추가 | 3파일 |
| `dd72d45` | chore: Destructive Detector hook | 5파일 |

---

## 3. Cloud Run 상태

- **서비스**: `bscamp-cron`
- **리전**: `asia-northeast3`
- **최신 리비전**: `bscamp-cron-00019-b7j`
- **URL**: `https://bscamp-cron-906295665279.asia-northeast3.run.app`

---

## 4. 남은 작업 (다음 세션)

### P0 (즉시)
- [ ] GCS 버킷 `bscamp-storage` public read 설정 (배너 이미지 접근용)
- [ ] 뉴스레터 배너 PNG 파일 GCS 복사 (Supabase → GCS)
- [ ] `USE_CLOUD_SQL=true` 환경변수 Cloud Run에 설정

### P1 (이번 주)
- [ ] embed-creatives 전량 처리 (현재 ~400건 미처리)
- [ ] video-saliency stderr maxBuffer 오류 해결 (ffmpeg 출력 제한)
- [ ] creative-saliency 미처리분 반복 실행 (500건씩 계속)

### P2 (다음 주)
- [ ] Supabase Auth → Firebase Auth 전환 (Phase 4)
- [ ] Supabase DB → Cloud SQL 전환 (Phase 5)
- [ ] Railway 서비스 완전 중단
- [ ] Vercel → Cloud Run 프론트 전환 (Phase 6)

---

## 5. 기술 결정 사항

1. **PostgREST 조인 → 2-step query**: Cloud SQL에서 `table!inner(cols)` 조인 미지원 → 별도 쿼리 + JS merge 패턴 채택
2. **이벤트 체인 fire-and-forget**: AbortController 2s 타임아웃으로 비동기 트리거, Cloud Scheduler 백업 스케줄 병행
3. **dual-write 패턴**: `USE_CLOUD_SQL` 환경변수로 GCS/Supabase Storage 분기
4. **배치 타임아웃**: embed-creatives ~850s, creative-saliency ~490s, video-saliency ~775s — Cloud Run 기본 300s 초과하므로 timeout 설정 필요
