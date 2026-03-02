# A1~A3 즉시수정 Gap 분석

> 분석일: 2026-03-02
> 분석 대상: A1(프로필카드), A2(AI로딩문구), A3(overlap제거)

## 전체 Match Rate: 93%

---

## A1. 프로필 카드 문구 + 로고 수정

### Match Rate: 90%

### 일치 항목

| # | 설계 항목 | 구현 상태 | 파일 |
|---|----------|----------|------|
| 1 | `border-t border-b border-slate-200` (상하 테두리) | `border-t border-b border-slate-200` 일치 | `author-profile-card.tsx` L5 |
| 2 | `py-6 mt-8` (패딩/마진) | `py-6 mt-8` 일치 | `author-profile-card.tsx` L5 |
| 3 | `gap-4` (텍스트 갭) | `gap-4` 일치 | `author-profile-card.tsx` L6 |
| 4 | `font-extrabold text-base` (이름 폰트) | `font-extrabold text-base text-gray-900` 일치 | `author-profile-card.tsx` L17 |
| 5 | `text-[13px] text-[#F75D5D]` (코치 뱃지) | `font-semibold text-[13px] text-[#F75D5D]` 일치 | `author-profile-card.tsx` L19 |
| 6 | `<br />` 줄바꿈 분리 (슬래시 제거) | `Meta가 인증한 비즈니스 파트너<br />수강생 자사몰매출 450억+` 일치 | `author-profile-card.tsx` L24-26 |
| 7 | `text-[13px] text-slate-500` (설명 텍스트) | `text-[13px] text-slate-500 mt-1 leading-relaxed` 일치 | `author-profile-card.tsx` L23 |
| 8 | 별도 badge-row `mt-4 pt-4 border-t border-slate-100` | `mt-4 pt-4 border-t border-slate-100` 일치 | `author-profile-card.tsx` L31 |
| 9 | Meta 로고 `h-9 w-auto` | `h-9 w-auto` 일치 | `author-profile-card.tsx` L37 |
| 10 | ROW_PROFILE — table 구조 + `bscamp.vercel.app` 이미지 URL | table HTML 구조 + `bscamp.vercel.app` URL 일치 | `newsletter-row-templates.ts` L634 |
| 11 | ROW_PROFILE — `font-weight:800`, `font-size:16px` | `font-weight:800;font-size:16px` 일치 | `newsletter-row-templates.ts` L634 |
| 12 | ROW_PROFILE — `font-size:13px;color:#64748b` (설명) | `font-size:13px;color:#64748b;line-height:160%` 일치 | `newsletter-row-templates.ts` L634 |
| 13 | ROW_PROFILE — badge-row `margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9` | `margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9` 일치 | `newsletter-row-templates.ts` L634 |
| 14 | ROW_PROFILE — Meta 로고 `bscamp.vercel.app` URL | `https://bscamp.vercel.app/images/meta-partner/inline-positive.png` 일치 | `newsletter-row-templates.ts` L634 |

### 불일치 항목

| # | 설계 항목 | 기대값 | 실제값 | 파일 |
|---|----------|--------|--------|------|
| 1 | `email-default-template.ts` SMITH_PROFILE_ROW 변경 불필요 확인 | 설계서: 문구 `<br>` 줄바꿈 + badge-row 분리 (T7 완료) | 실제: 텍스트가 `" / "` 슬래시 연결 + 로고가 텍스트 td 내부 인라인 (구버전 유지) | `email-default-template.ts` L37 |
| 2 | SMITH_PROFILE_ROW 프로필 이미지 URL | `bscamp.vercel.app` 패턴 (설계서 T10 완료 기대) | Supabase Storage URL (`symvlrsmkjlztoopbnht.supabase.co/...`) 사용 중 | `email-default-template.ts` L37 |

### 상세 분석: SMITH_PROFILE_ROW 불일치

설계서 Section 3-3에서 "추가 변경 불필요 — 확인만"이라고 기재되어 있으나, 실제 `email-default-template.ts` L37의 SMITH_PROFILE_ROW는:

1. **텍스트 구조**: `Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+` (슬래시 연결, 한 줄)
   - 설계서 기대: `<br>` 줄바꿈 분리 (T7에서 완료되었다고 명시)
   - 실제: T7 수정이 `newsletter-row-templates.ts`에만 반영되고 `email-default-template.ts`에는 미반영

2. **로고 위치**: 텍스트 `<td>` 내부에 인라인 `<p>` + `<img>` (구버전)
   - 설계서 기대: 별도 badge-row (div.margin-top:16px)
   - 실제: `<p style="margin:8px 0 0;"><img ...>` 인라인 배치

3. **프로필 이미지 URL**: Supabase Storage URL 사용
   - 설계서 기대: `bscamp.vercel.app` (T10에서 변경 완료라고 명시)
   - 실제: `symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/...` 유지

> **판정**: 설계서에서 "변경 불필요"라고 기재했지만, 실제로는 `newsletter-row-templates.ts` ROW_PROFILE과 `email-default-template.ts` SMITH_PROFILE_ROW 간에 불일치 존재. 이는 설계서 자체의 오류(T7/T10 반영 여부 확인 누락)일 가능성이 높다. A1 구현 자체는 정확하나, `email-default-template.ts`는 별도 확인 필요.

### 수정 필요

| 우선순위 | 항목 | 설명 |
|---------|------|------|
| P2 | `email-default-template.ts` SMITH_PROFILE_ROW 동기화 | `newsletter-row-templates.ts` ROW_PROFILE과 동일한 table 구조 + `bscamp.vercel.app` URL + `<br>` 줄바꿈 + badge-row 분리로 업데이트 필요. 단, 설계서에서 "변경 불필요"로 명시했으므로 PM 확인 후 처리 권장. |

---

## A2. 정보공유 AI 생성 로딩 문구 변경

### Match Rate: 100%

### 일치 항목

| # | 설계 항목 | 구현 상태 | 파일 |
|---|----------|----------|------|
| 1 | Line ~46 주석: `// AI 호출` | `// AI 호출` 일치 | `generate-preview-modal.tsx` L46 |
| 2 | Line ~108 로딩 텍스트: `AI가 글을 생성중입니다.` | `AI가 글을 생성중입니다.` 일치 | `generate-preview-modal.tsx` L108 |
| 3 | 백엔드 모델명 `claude-sonnet-4-6` 변경 없음 | `model: "claude-sonnet-4-6"` 유지 확인 | `api/admin/curation/generate/route.ts` L176 |
| 4 | 에러 메시지에 모델명 미포함 | `"정보공유 생성에 실패했습니다."` (모델명 없음) 확인 | `generate-preview-modal.tsx` L62 |

### 불일치 항목

없음.

---

## A3. 데일리콜랙트 overlap 제거

### Match Rate: 100%

### 일치 항목

| # | 설계 항목 | 구현 상태 | 파일 |
|---|----------|----------|------|
| 1 | `fetchActiveAdsets` 코드 삭제 | collect-daily에 해당 코드 없음 확인 | `collect-daily/route.ts` |
| 2 | `fetchCombinedReach` 코드 삭제 | collect-daily에 해당 코드 없음 확인 | `collect-daily/route.ts` |
| 3 | `makePairKey` 코드 삭제 | collect-daily에 해당 코드 없음 확인 | `collect-daily/route.ts` |
| 4 | `daily_overlap_insights` 참조 삭제 | collect-daily에 해당 참조 없음 확인 | `collect-daily/route.ts` |
| 5 | `overlap-utils.ts` import 삭제 | collect-daily에 `overlap-utils` import 없음 확인 | `collect-daily/route.ts` |
| 6 | `overlap-utils.ts` 파일 보존 | `src/lib/protractor/overlap-utils.ts` 존재 확인 | `overlap-utils.ts` |
| 7 | `/api/protractor/overlap/route.ts` 변경 없음 | 파일 존재 + collect-daily와 독립적 import 확인 | `overlap/route.ts` |
| 8 | `hasPartialError` 로직 유지 | L250 선언 + L330 광고 수집 실패 시 `true` 세팅 확인 | `collect-daily/route.ts` L250, L330 |
| 9 | `totalRecords` 계산 — `meta_ads`만 카운트 | `results.reduce((sum, r) => sum + (typeof r.meta_ads === "number" ? r.meta_ads : 0), 0)` 확인 | `collect-daily/route.ts` L336 |
| 10 | `cron_runs` 로깅 — `startCronRun` / `completeCronRun` | 정상 동작 확인 (L243, L337-342, L353) | `collect-daily/route.ts` |
| 11 | 응답 포맷 — `overlap_rate` 필드 자연 소멸 | `accountResult`에 `overlap_rate` 할당 없음, `meta_ads`만 존재 | `collect-daily/route.ts` L278-281 |

### 불일치 항목

없음.

---

## 빌드 검증

| 항목 | 결과 | 상세 |
|------|------|------|
| `npm run build` | **성공** | `Compiled successfully in 3.0s`, 67/67 static pages 생성 |
| lint errors | **기존 이슈만** | `newsletter-row-templates.ts` L84 `makeImageRow` unused (기존, A1-A3 무관) |
| tsc | **기존 이슈만** | `.next/dev/types/validator.ts` — `api/notifications/route.js` 모듈 미발견 (기존, A1-A3 무관) |

---

## 요약

| Feature | Match Rate | 상태 |
|---------|-----------|------|
| A1. 프로필 카드 문구 + 로고 수정 | 90% | `author-profile-card.tsx` + `newsletter-row-templates.ts` 완전 일치. `email-default-template.ts` SMITH_PROFILE_ROW는 설계서에서 "변경 불필요"로 명시했으나 실제로는 구버전 유지 중 (PM 확인 필요) |
| A2. AI 생성 로딩 문구 변경 | 100% | 모든 항목 완전 일치 |
| A3. overlap 제거 | 100% | 모든 항목 완전 일치, 독립 API 영향 없음 확인 |

> **결론**: A2, A3는 설계서와 100% 일치. A1은 주요 구현 파일 2개(`author-profile-card.tsx`, `newsletter-row-templates.ts`)는 설계서와 완전 일치하나, `email-default-template.ts`의 SMITH_PROFILE_ROW가 구버전 형태를 유지하고 있어 설계서의 "변경 불필요" 판정 자체를 PM이 재확인할 필요가 있다.
