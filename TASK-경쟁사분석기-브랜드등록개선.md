# TASK: 경쟁사 분석기 브랜드 등록 UX 개선

## 목표
키워드 검색과 브랜드 모니터링 등록을 명확히 분리. 브랜드 등록 시 Meta 페이지 검색 → 드롭다운에서 페이지 로고 + 브랜드명 선택하여 등록.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. 브랜드 검색 API 추가
### 파일
- `src/app/api/competitor/pages/route.ts` (신규)

### 기대 동작
1. `GET /api/competitor/pages?q=브랜드명` → Meta Ad Library API로 해당 키워드의 광고 페이지 목록 조회
2. 중복 제거(page_id 기준) 후 반환: `{ pages: [{ pageId, pageName, profileImageUrl? }] }`
3. Ad Library API에서 `search_terms`로 검색 → 결과의 `page_id`, `page_name` 추출 → 고유 페이지 목록 반환
4. `runtime = "nodejs"`, `dynamic = "force-dynamic"` 설정

### 참고
- `src/lib/competitor/meta-ad-library.ts`의 기존 `searchMetaAds` 활용 가능
- Ad Library API 응답에 프로필 이미지 URL은 없음 → 대안: Graph API `/{page_id}/picture` 또는 아이콘 fallback
- Meta Graph API로 페이지 프로필 사진: `https://graph.facebook.com/{page_id}/picture?type=small` (공개 접근 가능)

## T2. 브랜드 등록 다이얼로그 개선
### 파일
- `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx`

### 현재 동작
텍스트 input에 브랜드명 직접 입력 → 등록

### 기대 동작
1. 검색 input에 브랜드명 입력 → 타이핑 중 debounce (300ms) → `/api/competitor/pages?q=입력값` 호출
2. 검색 결과를 **드롭다운 리스트**로 표시:
   - 각 항목: 페이지 프로필 이미지 (둥근 32px) + 페이지명 + page_id (회색 작은 글씨)
   - 프로필 이미지 없으면 첫 글자 아바타 fallback
3. 드롭다운에서 페이지 선택 → `brandName` + `pageId` 자동 채움
4. "등록" 클릭 → POST `/api/competitor/monitors` body에 `{ brandName, pageId }` 전송
5. 기존 텍스트 직접 입력도 유지 (드롭다운 선택 안 하고 엔터 가능) — 이 경우 pageId는 null

### 디자인
- bscamp 디자인 시스템 유지 (Primary #F75D5D, Radius 0.75rem, Pretendard)
- 드롭다운: 흰색 bg, border-gray-200, shadow-lg, max-height 240px overflow-y-auto
- 선택된 페이지: input 아래에 선택된 브랜드 칩 표시 (로고+이름, X 버튼으로 해제)
- 로딩 중: 스피너 표시

## T3. 모니터링 카드에 로고 표시
### 파일
- `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx`

### 기대 동작
1. pageId가 있는 모니터는 `https://graph.facebook.com/{pageId}/picture?type=small` 이미지 표시
2. pageId 없으면 첫 글자 아바타 (현재 방식 유지 또는 추가)
3. 이미지 로딩 실패 시 첫 글자 아바타 fallback
