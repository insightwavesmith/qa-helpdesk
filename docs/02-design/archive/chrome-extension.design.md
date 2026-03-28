# 크롬 확장프로그램 설계서

## 1. 데이터 모델

### 1.1 기존 테이블 활용
- 기존 lib 함수 그대로 재사용 (naver-forbidden, naver-keyword, naver-blog-scraper, post-diagnosis, profanity-db)
- 신규 DB 테이블 없음

### 1.2 확장 로컬 스토리지 (chrome.storage.local)
```typescript
interface ExtensionStorage {
  bscampUrl: string;           // bscamp 서버 URL
  supabaseAccessToken: string; // Supabase JWT
  supabaseRefreshToken: string;
  userEmail: string;
  isLoggedIn: boolean;
  settings: {
    autoAnalyze: boolean;      // 자동 분석 활성화
    panelPosition: 'right' | 'bottom'; // 패널 위치
  };
}
```

## 2. API 설계

### 2.1 확장 전용 API 엔드포인트 (`/api/ext/`)
기존 admin API의 래퍼. 인증 방식만 변경 (Supabase JWT Bearer 토큰).

#### 2.1.1 인증 헬퍼
```typescript
// src/app/api/ext/_shared.ts
async function requireExtUser(): Promise<ExtAuthSuccess | ExtAuthFailure>
// Authorization: Bearer <supabase_access_token> 헤더에서 JWT 검증
// profiles.role이 'admin' 또는 'member'인 사용자 허용
```

#### 2.1.2 금칙어 체크
```
POST /api/ext/forbidden-check
Authorization: Bearer <token>
Body: { keywords: string[] }
Response: { results: Array<{ keyword, isForbidden, isSuicideWord }> }
```

#### 2.1.3 비속어 체크
```
POST /api/ext/profanity-check
Authorization: Bearer <token>
Body: { text: string }
Response: { results: ProfanityResult[] }
```

#### 2.1.4 포스팅 진단
```
POST /api/ext/post-diagnosis
Authorization: Bearer <token>
Body: { title, content, targetKeyword, imageCount, externalLinks }
Response: { results: DiagnosisItem[], overallScore: number }
```

#### 2.1.5 키워드 분석
```
POST /api/ext/keyword-analysis
Authorization: Bearer <token>
Body: { keyword: string }
Response: { keyword: KeywordAnalysis | null, relatedKeywords: KeywordAnalysis[] }
```

#### 2.1.6 TOP3 벤치마크
```
GET /api/ext/blog-benchmark?keyword=<keyword>&count=3
Authorization: Bearer <token>
Response: { blogs: BlogBenchmark[], average: {...} }
```

### 2.2 크론 API
```
GET /api/cron/organic-benchmark
Authorization: Bearer <CRON_SECRET>
Schedule: 매주 월요일 03:00 KST (0 18 * * 1 UTC)
동작: 등록된 키워드의 TOP3 자동 크롤링 → keyword_benchmarks 테이블 저장
```

## 3. 컴포넌트 구조

### 3.1 확장 프로젝트 구조
```
extension/
├── manifest.json              # Manifest V3
├── package.json               # 확장 전용 의존성
├── tsconfig.json              # 확장 전용 TS 설정
├── vite.config.ts             # Vite 빌드 설정
├── src/
│   ├── popup/                 # 팝업 UI
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx            # 로그인/설정 화면
│   │   └── popup.css
│   ├── content/               # Content Script
│   │   ├── index.tsx          # 진입점 — DOM 감지 + React 마운트
│   │   ├── DiagnosisPanel.tsx # 실시간 진단 사이드패널 (T3)
│   │   ├── BenchmarkPanel.tsx # TOP3 벤치마크 비교 (T4)
│   │   ├── EditorInjector.ts  # SmartEditor 글 주입 (T2)
│   │   └── content.css        # 패널 스타일
│   ├── background/
│   │   └── service-worker.ts  # 메시지 라우팅, 탭 감지
│   ├── lib/
│   │   ├── api.ts             # bscamp API 통신
│   │   ├── auth.ts            # Supabase 인증 관리
│   │   ├── editor-detector.ts # SmartEditor URL/DOM 감지
│   │   ├── editor-reader.ts   # 에디터 본문 읽기 (실시간)
│   │   └── types.ts           # 공통 타입
│   └── assets/
│       └── icons/             # 확장 아이콘 (16, 48, 128px)
└── dist/                      # 빌드 출력 (chrome://extensions 로드용)
```

### 3.2 팝업 컴포넌트
```
App.tsx
├── LoginForm — 이메일/비밀번호 로그인
├── Settings — 서버 URL, 자동분석 토글
└── Status — 로그인 상태, 현재 페이지 감지 여부
```

### 3.3 Content Script 컴포넌트
```
DiagnosisPanel.tsx (메인 사이드패널)
├── Header — "bscamp 진단" 로고 + 접기/펼치기
├── ScoreOverview — 종합 점수 (원형 게이지)
├── DiagnosisSection — 6개 진단 항목
│   ├── CharCountItem — 글자수 (🟢🟡🔴)
│   ├── ImageCountItem — 이미지 수
│   ├── KeywordDensityItem — 키워드 반복
│   ├── ParagraphLengthItem — 문단 길이
│   ├── ForbiddenWordItem — 금칙어
│   └── ProfanityItem — 비속어
├── BenchmarkSection — TOP3 비교 (T4)
│   ├── KeywordInput — 타겟 키워드 입력
│   ├── ComparisonChart — 바 차트 (내 글 vs 평균)
│   └── GapAnalysis — 부족한 항목 안내
└── Footer — 새로고침 버튼
```

### 3.4 상태 관리
- 패널 내부: React useState/useEffect
- 에디터 변경 감지: MutationObserver → 디바운스(1초) → API 호출
- 로그인 상태: chrome.storage.local
- 메시지 통신: chrome.runtime.sendMessage (content ↔ service-worker)

## 4. 에러 처리

| 에러 코드 | 상황 | 사용자 메시지 |
|-----------|------|--------------|
| AUTH_REQUIRED | 로그인 필요 | "bscamp 로그인이 필요합니다. 확장 팝업에서 로그인해주세요." |
| AUTH_EXPIRED | 토큰 만료 | "세션이 만료되었습니다. 다시 로그인해주세요." |
| API_ERROR | 서버 오류 | "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |
| NETWORK_ERROR | 네트워크 끊김 | "네트워크 연결을 확인해주세요." |
| EDITOR_NOT_FOUND | 에디터 감지 실패 | "SmartEditor를 찾을 수 없습니다." |
| RATE_LIMITED | API 과다 호출 | "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." |

## 5. 구현 순서

### Phase 1: 기반 (T1)
- [ ] extension 프로젝트 초기화 (package.json, tsconfig, vite.config)
- [ ] manifest.json 작성
- [ ] 팝업 UI 기본 (로그인 폼)
- [ ] service-worker 기본
- [ ] API 통신 유틸 (lib/api.ts, lib/auth.ts)
- [ ] 서버 측: /api/ext/ 엔드포인트 5개 + _shared.ts
- [ ] bscamp tsconfig.json에 extension/ exclude 추가

### Phase 2: 진단 패널 (T3)
- [ ] content script 진입점 (에디터 감지)
- [ ] DiagnosisPanel 컴포넌트
- [ ] 에디터 본문 실시간 읽기 (MutationObserver)
- [ ] 6개 진단 항목 UI
- [ ] API 연동 (금칙어, 비속어)

### Phase 3: 벤치마크 (T4)
- [ ] BenchmarkPanel 컴포넌트
- [ ] TOP3 API 호출 + 비교 차트
- [ ] Gap 분석 메시지

### Phase 4: 글 주입 (T2)
- [ ] EditorInjector — SmartEditor DOM 조작
- [ ] chrome.debugger API (iframe 접근)
- [ ] 외부 데이터 수신 (window.postMessage)

### Phase 5: 카페 발행 (T5)
- [ ] 카페 에디터 감지
- [ ] 요약 + 링크 주입
- [ ] 게시판 선택

### Phase 6: 크론 (T6)
- [ ] /api/cron/organic-benchmark 라우트
- [ ] vercel.json crons 추가
