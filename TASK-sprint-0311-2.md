# TASK: Sprint 0311-2 (3건 병렬)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

---

## T1. 답변 수정 UI 개선

### 고객 시나리오
관리자/작성자가 답변을 수정할 때 textarea가 너무 작고 이미지 첨부도 안 된다.

### 기대 동작
- 답변 수정 UI = **기존 답변 작성 폼과 동일**하게 변경
- 이미지 첨부 가능 (답변 작성 시 사용하는 이미지 업로드 컴포넌트 재활용)
- 에디터 크기도 답변 작성과 동일 (충분히 큰 textarea 또는 리치 에디터)
- 기존 답변 내용이 에디터에 pre-fill

### 힌트
- 답변 작성 컴포넌트/폼을 찾아서 수정 모드에서도 동일하게 렌더링
- `updateAnswerByAuthor` 액션 사용 (T2에서 추가한 것)

---

## T2. 수강생 관리 탭에 광고관리자 바로가기

### 고객 시나리오
관리자가 수강생 관리 목록에서 특정 수강생의 Meta 광고관리자에 바로 들어가고 싶다.

### 기대 동작
- 수강생 관리 목록에서 각 수강생 행에 "광고관리자" 버튼/링크 추가
- 클릭 시 새 탭에서 Meta Ads Manager 열림
- URL: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={account_id}`
- `account_id`는 `ad_accounts` 테이블의 `account_id` (Meta 광고계정 ID)
- 광고계정이 없는 수강생은 버튼 비활성화 또는 미표시
- 광고계정이 여러 개인 경우 드롭다운 또는 첫 번째 계정 사용

### 힌트
- 수강생 관리 페이지: `src/app/(main)/admin/members/` 또는 유사 경로
- `profiles` JOIN `ad_accounts` 필요

---

## T3. 믹스패널 Phase 2 이벤트 추가

### 고객 시나리오
Phase 1에서 핵심 17개 이벤트를 심었고, 나머지 이벤트도 추가해야 한다.

### 기대 동작
택소노미 전체는 `docs/bscamp-mixpanel-taxonomy.md` 참고.
Phase 1에서 빠진 이벤트들을 모두 추가:

**A. 인증/온보딩:**
- onboarding_step_completed (각 단계별)
- logout (session_duration_seconds 포함)

**B. QA 헬프데스크:**
- question_list_viewed (tab, page, total_count)
- answer_edited (edit_count)
- answer_helpful_clicked (answer_type)

**C. 총가치각도기:**
- protractor_date_changed (range_type, start/end_date)
- protractor_benchmark_viewed (metric, grade)
- protractor_collect_triggered (mode, account_count)
- protractor_top5_viewed (ranking_type)

**D. 경쟁사 분석기:**
- competitor_pinned (action: pin/unpin)
- competitor_monitor_created
- competitor_load_more_clicked (page, loaded_count)

**E. 콘텐츠:**
- content_list_viewed (view_mode, source_filter)
- curriculum_viewed (category)

**F. 커뮤니티:**
- post_viewed, post_created
- comment_created, like_toggled

**G. 설정:**
- ad_account_disconnected

**H. 관리자 전용:**
- admin_member_list_viewed
- admin_member_edited (fields_changed)
- admin_content_action (publish/skip/edit)
- admin_answer_reviewed
- admin_email_sent
- admin_invite_code_created

### 힌트
- Phase 1 코드 패턴 참고: `src/lib/mixpanel.ts`의 `mp.track()` 사용
- 각 페이지/컴포넌트에서 적절한 위치에 track 호출 추가
- 관리자 이벤트는 관리자 페이지에서만 fire

---

## 공통
- `npm run build` 통과 필수
- 커밋: 각각 또는 합쳐서 하나로
