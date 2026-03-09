# TASK-QA수정7.md — Smith님 직접 QA 피드백 반영

> 작성: 모찌 | 2026-02-27 18:08
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 9304b34 (+ 미커밋 수정 6파일 존재)
> Smith님 직접 피드백 기반

---

## 타입
버그 수정 + 기능 추가

## 우선순위: 높음

## 미커밋 수정 포함
git diff에 6파일 수정 있음 — 이번 TASK 수정과 함께 커밋할 것

---

## 리뷰 결과
계획 검토 완료 — D1~D6 구현 계획 승인됨 (plan mode exit 후 구현)

## T1. 광고계정 삭제 — 삭제됐다고 나오지만 실제 안 됨

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 삭제 confirm → "삭제되었습니다" 알림 → 실제 DB에서 삭제 안 됨

**확인:**
- handleDeleteAccount 함수에서 DELETE API 호출이 올바른지
- API 응답 에러를 무시하고 있는지
- soft delete(active=false)인지 hard delete인지
- 삭제 후 계정 목록 refresh(refetch) 호출하는지

**수정:**
- 삭제 API 호출 → 응답 확인 → 성공 시 목록 즉시 새로고침
- 여러 개 삭제 가능 (각 계정마다 삭제 버튼)

---

## T2. 광고계정/믹스패널 **추가** 기능 없음

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 수강생 상세에서 기존 광고계정 수정만 가능, 새 광고계정 추가 불가

**수정:**
- "배정된 광고계정" 섹션에 "+ 광고계정 추가" 버튼 추가
- 클릭 → 추가 폼 표시 (5개 필드 전부)
- 저장 → POST /api/protractor/accounts (또는 기존 addAdAccount action)
- 저장 후 목록 즉시 새로고침

---

## T3. 5개 필드 세트 통일 — 모든 입력/수정 경로

**필수 5개 필드 (항상 세트):**
1. 광고계정 ID (account_id)
2. 광고계정명 (account_name)
3. 믹스패널 프로젝트 ID (mixpanel_project_id)
4. 믹스패널 시크릿키 (service_secrets 테이블)
5. 믹스패널 보드 ID (mixpanel_board_id)

**현재 문제:**
- 수정 폼에 시크릿키 필드 누락 (스크린샷: 광고계정명 + 프로젝트ID + 보드ID만 3개)
- 추가/수정 UI에서 5개 필드가 일관되지 않음

**수정 대상 (모든 입력/수정 경로):**
1. `member-detail-modal.tsx` — 관리자 수정 폼 → 5개 필드 전부
2. `member-detail-modal.tsx` — 관리자 추가 폼 (D2) → 5개 필드 전부
3. `settings-form.tsx` — 수강생 본인 수정 → 5개 필드 전부
4. 온보딩 폼 — 5개 필드 전부

**시크릿키 특이사항:**
- service_secrets 테이블에 `secret_act_{account_id}` 형태로 저장
- 보안상 읽기 시 마스킹 표시 (예: ****ab12)
- 수정 시 빈값이면 기존 유지, 새 값이면 업데이트

---

## T4. 타겟중복 — 새로고침 버튼 삭제 + 데이터 안 나옴

**파일:** `src/components/protractor/OverlapAnalysis.tsx`

**수정:**
- 새로고침 버튼(RefreshCw 아이콘) 제거
- 페이지 로드 시 자동으로 overlap 데이터 fetch
- 데이터 안 나오는 원인: overlap/route.ts에서 7일 제한이 아직 남아있을 수 있음 (미커밋 수정에서 제거됐는지 확인)

---

## T5. 참여율 진단상세 — 개별 지표 4개 + 합계

**파일:** `src/app/(main)/protractor/components/diagnosis-detail.tsx` (또는 해당 컴포넌트)

**현재:** "참여합계/만노출" 하나만 표시 (스크린샷 확인)

**변경:**
참여율 섹션 구조:
```
참여율                              94점 · 우수
┌─────────────────────────────────────────┐
│ 좋아요/만노출          15.2  🟢        │
│ 기준선: 12.3                           │
│                                        │
│ 댓글/만노출            3.1   🟢        │
│ 기준선: 2.5                            │
│                                        │
│ 공유/만노출            1.8   🟡        │
│ 기준선: 2.1                            │
│                                        │
│ 저장/만노출            4.8   🟢        │
│ 기준선: 3.2                            │
│                                        │
│ ──────────────────────────────         │
│ 참여합계/만노출        24.9  🟢        │
│ 기준선: 19.99                          │
└─────────────────────────────────────────┘
```

- 좋아요(reactions_per_10k), 댓글(comments_per_10k), 공유(shares_per_10k), 저장(saves_per_10k) 개별 표시
- 그 아래에 합계(engagement_per_10k) 구분선과 함께 표시
- 각 지표마다 벤치마크 기준선 + 판정 색상(🟢/🟡/🔴)

---

## T6. 콘텐츠 #2~#5 안 나옴 (ad_id NULL 버그)

**파일:** `src/app/api/cron/collect-daily/route.ts`

**현재:** 미커밋 수정에 ad_id 매핑 수정 포함 확인 필요
**확인:** `git diff src/app/api/cron/collect-daily/route.ts` 에서 ad.id 매핑이 수정됐는지

**참고:** ad_id NULL은 collect-daily 재실행 후에야 데이터가 정상으로 채워짐.
→ 코드 수정 + 배포 후 Vercel Crons에서 collect-daily 수동 트리거 필요

---

## 완료 기준
- [ ] D1: 광고계정 삭제 → 실제 삭제 + 목록 새로고침
- [ ] D2: 광고계정/믹스패널 추가 버튼 + 5개 필드
- [ ] D3: 수정 폼 5개 필드 통일 (시크릿키 포함)
- [ ] D4: 타겟중복 새로고침 버튼 삭제 + 데이터 표시
- [ ] D5: 참여율 개별 4개 + 합계
- [ ] D6: ad_id NULL 수정 (미커밋 수정 확인)
- [ ] 이전 미커밋 수정 포함해서 커밋
- [ ] npm run build 성공
