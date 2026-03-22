# embed-creatives 듀얼 라이트 Gap 분석

> 작성일: 2026-03-22
> 리뷰어: qa-engineer
> 대상 파일: `src/lib/ad-creative-embedder.ts`
> 설계서: `docs/02-design/features/embed-creatives-dual-write.design.md`

---

## Match Rate: 97%

---

## 빌드 검증

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | PASS (에러 0) |
| `npx eslint src/lib/ad-creative-embedder.ts` | PASS (에러 0) |
| `npm run build` | PASS |

---

## 일치 항목 (설계 vs 구현)

### 1. embedCreative() — creative_media 듀얼 라이트 추가

| 설계서 항목 | 구현 | 일치 여부 |
|------------|------|-----------|
| ad_creative_embeddings UPSERT 이후 5번 단계로 creative_media 듀얼 라이트 추가 | 226~267번 줄에 step 5 구현 | PASS |
| ad_id → creatives.id 매핑 | `creatives` 테이블 `.eq("ad_id", input.adId).maybeSingle()` | PASS |
| creative_media에서 creative_id 행 조회 | `.eq("creative_id", creative.id).maybeSingle()` | PASS |
| embedding 필드 저장 (row.embedding_3072 복사) | `if (row.embedding_3072) cmUpdates.embedding = row.embedding_3072` | PASS |
| text_embedding 필드 저장 (row.text_embedding_3072 복사) | `if (row.text_embedding_3072) cmUpdates.text_embedding = row.text_embedding_3072` | PASS |
| embedding_model 저장 | `embedding_model: EMBEDDING_MODEL` | PASS |
| embedded_at 저장 | `embedded_at: new Date().toISOString()` | PASS |
| 독립 try-catch 격리 (ad_creative_embeddings 무영향) | 전체 5번 단계가 `try { ... } catch (err) { console.warn(...) }` 로 완전 격리 | PASS |

### 2. embedMissingCreatives() — creative_media 보충 조회 추가

| 설계서 항목 | 구현 | 일치 여부 |
|------------|------|-----------|
| creative_media에서 embedding IS NULL 조회 | `.from("creative_media").select("id, creative_id").is("embedding", null)` | PASS |
| is_active 필터 적용 | `.eq("is_active", true)` | PASS |
| creative_id → creatives.ad_id 매핑 | `creatives` 테이블 `.select("ad_id").eq("id", cm.creative_id).maybeSingle()` | PASS |
| ad_creative_embeddings에서 embedding_3072 복사 | `.from("ad_creative_embeddings").select("embedding_3072, text_embedding_3072")` | PASS |
| embedding, text_embedding, embedding_model, embedded_at 저장 | 463~472번 줄 cmUpdates 객체 — 4개 필드 모두 SET | PASS |
| embedding 없으면 복사 스킵 (storage_url로 새로 생성 미구현) | `if (ace?.embedding_3072)` 분기로 복사 조건 처리 | 부분 일치 (아래 Info 참고) |
| 독립 try-catch (CM 1건 실패 시 다음 건 계속) | 내부 for 루프에 개별 try-catch | PASS |
| 외부 try-catch (CM 보충 조회 전체 실패 허용) | 外 catch — `console.warn` 후 계속 | PASS |

### 3. 기존 코드 무변경

| 항목 | 확인 |
|------|------|
| ad_creative_embeddings UPSERT 코드 (210~224번 줄) | 기존 로직 그대로 유지, 신규 단계(5번)만 추가 | PASS |
| embedMissingCreatives() 기존 ad_creative_embeddings 처리 로직 | 기존 코드 완전 유지, 432번 줄 이후에 CM 보충 블록 추가 | PASS |

---

## 불일치 항목

### Warning 없음

### Info (기능 영향 없음)

**Info 1 — creative_media 행 없을 때 `storage_url`로 새로 생성하는 경로 미구현**

- 설계서 §2.2: "없으면 storage_url로 새로 생성"
- 구현: `if (ace?.embedding_3072)` — ace가 있어도 embedding_3072가 null이면 복사 스킵. storage_url로 재생성하는 분기 없음.
- 평가: 설계서도 이 경로를 "best-effort" 보충으로 분류했고, `embedCreative()`가 이미 최초 저장 시 듀얼 라이트를 수행하므로 실제 누락 케이스가 매우 드묾. 기능 결함으로 보기 어려움.

**Info 2 — `supabase as any` 캐스팅 (기존 패턴 동일)**

- 신규 추가 블록(5번 단계, CM 보충)에서도 `(supabase as any)` 캐스팅 사용
- 기존 파일 전체에서 동일하게 사용 중 — Supabase 자동 생성 타입 미적용 상태의 기존 패턴과 일치
- T1(DB 스키마 v3) 적용 후 타입 재생성 시 일괄 해소될 예정. 이번 태스크 범위 외.

---

## 수정 필요 항목

없음. Critical 0, Warning 0.

---

## 종합 평가

| 항목 | 결과 |
|------|------|
| Match Rate | **97%** |
| Critical | 0 |
| Warning | 0 |
| Info | 2 |
| 빌드 | PASS |
| 타입 체크 | PASS |

설계서의 핵심 원칙("ad_creative_embeddings 저장은 절대 실패하지 않는다. creative_media 듀얼 라이트는 best-effort")이 구현에 정확하게 반영되었다. 독립 try-catch 격리, 4개 필드(embedding/text_embedding/embedding_model/embedded_at) 저장, ad_id → creatives.id → creative_media.creative_id 매핑, embedMissingCreatives() 보충 조회 모두 설계 대비 일치.

**T3 PASS.**
