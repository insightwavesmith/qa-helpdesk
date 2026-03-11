# TASK: 믹스패널 SDK 설치 + 트래킹 코드 심기

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

---

## 목표
bscamp 서비스에 Mixpanel SDK를 설치하고, 택소노미에 따라 이벤트 트래킹 코드를 심는다.

## 환경변수 설정

`.env.local`과 Vercel에 아래 환경변수 추가:
```
NEXT_PUBLIC_MIXPANEL_TOKEN=7274354ebbdfae7d96d716ff2a5275d5
NEXT_PUBLIC_MIXPANEL_PROJECT_ID=3999923
```

Vercel 환경변수 추가:
```bash
cd /Users/smith/Projects/qa-helpdesk
vercel env add NEXT_PUBLIC_MIXPANEL_TOKEN production < <(echo "7274354ebbdfae7d96d716ff2a5275d5")
vercel env add NEXT_PUBLIC_MIXPANEL_PROJECT_ID production < <(echo "3999923")
```

## 구현

### 1. SDK 설치 + 초기화
- `npm install mixpanel-browser`
- `src/lib/mixpanel.ts` 생성 — 초기화 + 헬퍼 함수
- `src/app/layout.tsx`에서 초기화 (클라이언트 컴포넌트)
- 개발 환경에서는 debug: true, production에서만 실제 전송

### 2. 유저 식별 + 프로필
- 로그인 성공 시: `mixpanel.identify(userId)` + `mixpanel.people.set({...})`
- 로그아웃 시: `mixpanel.reset()`
- 프로필 프로퍼티:
  - $name, $email, role, cohort, cohort_id, brand_name, shop_url
  - annual_revenue, monthly_ad_budget, category
  - ad_account_count, onboarding_completed, last_login

### 3. 슈퍼 프로퍼티 (모든 이벤트에 자동 포함)
- 로그인 시 `mixpanel.register({...})`로 설정:
  - platform: "web", app_version, user_role, user_cohort, session_id

### 4. 이벤트 트래킹 — 우선순위 순서
택소노미 전체는 `docs/bscamp-mixpanel-taxonomy.md` (워크스페이스) 참고.

**Phase 1 (필수 — 이번에 구현):**
- signup_completed, login, logout
- onboarding_step_completed, onboarding_completed
- question_created, question_detail_viewed, ai_answer_generated
- protractor_viewed, protractor_tab_switched
- competitor_searched, competitor_ad_viewed, competitor_downloaded
- content_detail_viewed
- settings_viewed, profile_updated, ad_account_connected

**Phase 2 (다음):**
- 나머지 이벤트 (list_viewed, load_more, admin 전용 등)

### 5. 구현 패턴
```typescript
// src/lib/mixpanel.ts
import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

export const mp = {
  init: () => {
    if (MIXPANEL_TOKEN) {
      mixpanel.init(MIXPANEL_TOKEN, {
        debug: process.env.NODE_ENV === 'development',
        track_pageview: true,
        persistence: 'localStorage',
      });
    }
  },
  identify: (userId: string) => mixpanel.identify(userId),
  track: (event: string, props?: Record<string, any>) => {
    if (MIXPANEL_TOKEN) mixpanel.track(event, props);
  },
  people: {
    set: (props: Record<string, any>) => mixpanel.people.set(props),
  },
  register: (props: Record<string, any>) => mixpanel.register(props),
  reset: () => mixpanel.reset(),
};
```

### 6. 주의사항
- `NEXT_PUBLIC_` prefix 필수 (클라이언트에서 접근)
- SSR에서는 mixpanel 호출 안 되게 `typeof window !== 'undefined'` 가드
- 기존 코드에 `MIXPANEL_TOKEN` 환경변수 있으면 충돌 확인 (이미 있을 수 있음)

## 검증
- `npm run build` 통과
- 개발 서버에서 브라우저 콘솔에 mixpanel debug 로그 확인
- 커밋 메시지: `feat: 믹스패널 SDK 설치 + Phase 1 이벤트 트래킹`
