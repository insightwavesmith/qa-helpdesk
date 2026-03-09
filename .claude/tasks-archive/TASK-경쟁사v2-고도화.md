# TASK: 경쟁사 분석기 v2 — 검색 고도화 + UX 마무리

## 목표
수강생이 경쟁사 브랜드를 검색할 때, 브랜드명·자사몰 URL·인스타 계정 뭘 치든 해당 브랜드의 광고를 찾아준다.
공식 계정뿐 아니라 비공식 페이지(대충 만든 페이지로 광고 돌리는 경우)까지 잡아야 한다.
이 기능이 안 되면 경쟁사 분석기의 핵심 가치가 0이다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

---

## T1. 브랜드 검색 고도화 — 뭘 쳐도 찾아주는 검색

### 고객 시나리오
수강생이 "올리브영"을 치든, "oliveyoung.co.kr"을 치든, 인스타 계정을 치든 해당 브랜드의 광고를 전부 볼 수 있어야 한다.
특히 자사몰 URL을 입력하면 그 URL이 **랜딩페이지에 포함된** 모든 광고를 찾아줘야 한다. contain 매칭이다.
광고를 몰래 돌리는 비공식 페이지(숫자로만 된 페이지 등)까지 잡아야 의미가 있다.

### 검색 아키텍처 (3단계)

**1단계: 입력 분류 (프론트)**
- URL 감지 → 도메인 추출 (예: `oliveyoung.co.kr/product/xxx` → `oliveyoung.co.kr`)
- 인스타/페북 URL → username 추출
- 일반 텍스트 → 그대로

**2단계: 병렬 검색 (서버 — `/api/competitor/brands` 수정)**
사용자 입력 하나로 2개 API 동시 호출:
- A. `page_search` — 브랜드 페이지 찾기 (공식 계정, 프로필+인스타+좋아요)
- B. `ad_library` 키워드 검색 `q=도메인 or 브랜드명` — link_url에 해당 키워드가 포함된 광고 조회 (비공식 포함)
두 결과를 합쳐서 반환

**3단계: 결과 그룹핑 + 드롭다운 (프론트)**
- 📌 공식 브랜드 섹션: page_search 결과 (프로필+인스타+좋아요)
- 🔗 "이 URL로 광고하는 페이지" 섹션: 광고 검색에서 link_url contain 매칭된 page_id 그룹핑
- 드롭다운에서 브랜드/페이지 클릭 → 해당 page_id의 광고만 조회

### 검증된 사실 (API 테스트 완료)
- `q=oliveyoung.co.kr`로 키워드 검색 → link_url에 올리브영 URL 포함된 광고 2,717건 반환
- 비공식 페이지 17개가 올리브영 URL로 광고 돌리는 거 확인됨
- 한글 "올리브영" page_search → 15개 페이지, 공식 ig:oliveyoung_official 찾음
- 크레딧: 검색 1회당 2크레딧 (page_search 1 + ad_library 1)

### 파일
- `src/app/api/competitor/brands/route.ts` — 병렬 검색 로직
- `src/lib/competitor/meta-ad-library.ts` — page_results 파싱 (이미 핫픽스됨, 확인만)
- `src/app/(main)/protractor/competitor/components/brand-search-bar.tsx` — 드롭다운 2섹션

### 플레이스홀더 변경
- 현재: "브랜드명 또는 URL을 입력하세요 (예: 올리브영, instagram.com/oliveyoung)"
- 변경: "브랜드명, 자사몰 URL, 인스타 계정 등 뭐든 입력하세요"

---

## T2. 더보기 동작 수정

### 고객 시나리오
수강생이 검색 결과를 보다가 "더보기 (30/2,096)"를 누르면 다음 30건이 이어서 나와야 한다.
안 되면 고객은 "이거 30개밖에 안 보여줘?" 하고 기능 가치를 의심한다.

### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/api/competitor/search/route.ts`

### 기대 동작
- 더보기 클릭 → next_page_token으로 다음 30건 로드 → 기존 결과에 append
- 로딩 스피너 표시
- 총 건수 갱신

---

## T3. 정렬 동작 수정

### 고객 시나리오
수강생이 "운영기간순"으로 정렬해서 오래 돌아간 광고(=성과 좋은 광고)를 먼저 보고 싶다.
정렬 토글을 눌러도 순서가 안 바뀌면 의미 없는 UI다.

### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`

### 기대 동작
- 최신순: start_date 내림차순
- 운영기간순: 현재 기준 운영일수 내림차순 (오래 돌아간 광고가 위로)
- 토글 클릭 시 즉시 반영

---

## T4. 불필요한 필터 제거

### 고객 시나리오
수강생한테 Facebook/Instagram 플랫폼 구분은 의미 없다. 어차피 둘 다 보고 싶다.
"게재중" 필터도 불필요 — 검색 자체가 게재중만 가져오면 된다.
소재 유형(이미지/슬라이드/영상)만 있으면 충분하다.

### 파일
- `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`

### 기대 동작
- 게재중 필터 삭제
- Facebook / Instagram 필터 삭제
- 남는 필터: 이미지 / 슬라이드 / 영상 + 최신순 / 운영기간순

---

## T5. 카드 버튼 정리 + 브랜드 등록

### 고객 시나리오
수강생이 광고 카드를 보면서 할 수 있는 액션은 3가지:
1. 소재 보기 (이미지/영상 크게 보기)
2. 다운로드 (소재 저장)
3. 이 브랜드 모니터링 등록 (핀 꽂기)

랜딩페이지, Facebook, Ad Library 링크는 고객이 안 쓴다. 버튼이 많으면 오히려 혼란.

### 파일
- `src/app/(main)/protractor/competitor/components/ad-card.tsx`

### 기대 동작
- **소재보기** 버튼 — 유지
- **다운로드** 버튼 — 유지
- **브랜드 등록** 버튼 — 클릭 시 해당 광고의 page_id로 모니터링 즉시 등록 (핀)
  - 이미 등록된 브랜드면 "등록됨" 표시 (비활성)
  - 등록 성공 시 toast 알림
- 랜딩페이지 / Facebook / Ad Library 버튼 삭제

---

## 하지 말 것
- 모니터링 패널 UI 건드리지 마라
- 선택 다운로드(체크박스+ZIP) 건드리지 마라
- 검색 모드 토글(브랜드/키워드) 기본 구조 건드리지 마라
- 새 환경변수 추가하지 마라

## 검증 기준
- "올리브영" 검색 → 드롭다운에 공식 브랜드 + URL 광고 페이지 섹션
- "oliveyoung.co.kr" 검색 → 이 URL로 광고하는 비공식 페이지까지 표시
- 더보기 → 다음 30건 append
- 운영기간순 → 오래 돌아간 광고 위로
- 카드에 소재보기 + 다운로드 + 브랜드등록 3개만
- 게재중/Facebook/Instagram 필터 없음
