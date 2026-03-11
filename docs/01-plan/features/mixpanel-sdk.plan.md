# Mixpanel SDK 클라이언트 트래킹 Plan

## 목표
bscamp 서비스에 Mixpanel 클라이언트 SDK를 설치하고, Phase 1 택소노미에 따라 이벤트 트래킹 코드를 심는다.

## 범위
- SDK 설치 + 초기화 (`src/lib/mixpanel.ts` + Provider 컴포넌트)
- 유저 식별 (`identify`, `people.set`, `register`, `reset`)
- Phase 1 이벤트 15종 트래킹

## Phase 1 이벤트 목록
| 이벤트 | 트리거 위치 |
|--------|------------|
| signup_completed | 회원가입 완료 → 로그인 페이지 리다이렉트 시 |
| login | 로그인 성공 시 |
| logout | 로그아웃 시 |
| onboarding_step_completed | 온보딩 각 스텝 완료 시 |
| onboarding_completed | 온보딩 전체 완료 시 |
| question_created | 질문 등록 성공 시 |
| question_detail_viewed | 질문 상세 페이지 진입 시 |
| ai_answer_generated | AI 답변 생성 완료 시 (서버→클라이언트 불가, question_created에 포함) |
| protractor_viewed | 총가치각도기 페이지 진입 시 |
| protractor_tab_switched | 성과요약/콘텐츠 탭 전환 시 |
| content_detail_viewed | 콘텐츠 상세 페이지 진입 시 |
| settings_viewed | 설정 페이지 진입 시 |
| profile_updated | 프로필 저장 성공 시 |
| ad_account_connected | 광고계정 추가 성공 시 |
| competitor_searched / competitor_ad_viewed / competitor_downloaded | 벤치마크 관련 (현재 미구현 — Phase 2로 이동) |

## 성공 기준
- `npm run build` 통과
- 개발 서버에서 mixpanel debug 로그 확인
- SSR 에러 없음

## 제외 사항
- Phase 2 이벤트 (list_viewed, load_more, admin 전용)
- 서버사이드 전용 이벤트 (ai_answer_generated)
- competitor 관련 이벤트 (UI 미구현)
