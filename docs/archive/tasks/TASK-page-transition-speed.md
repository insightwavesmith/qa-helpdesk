# TASK: 전체 탭 전환 속도 개선 — prefetch + 이미지 최적화

---

## 빌드/테스트
- `npm run build` 성공 필수

---

## 이게 뭔지
모든 탭(홈, Q&A, 정보공유, 수강후기, 총가치각도기) 전환 시 1초 이상 걸림. 정보공유 글의 이미지도 느리게 로드됨.

## 왜 필요한지
수강생 30명이 매일 쓰는데, 탭 누를 때마다 1초 기다리면 답답함.

---

## T1. next/link prefetch 확인 및 적용

### 이게 뭔지
Next.js의 next/link는 뷰포트에 보이면 자동으로 해당 페이지를 미리 로드함. 이게 제대로 작동하고 있는지 확인하고, 안 되고 있으면 수정.

### 기대
네비게이션 바의 탭 링크가 hover 시 또는 뷰포트 진입 시 미리 로드 → 클릭하면 즉시 전환.

---

## T2. Next.js Router Cache 설정

### 이게 뭔지
Next.js App Router에서 클라이언트 사이드 캐시를 활용해 이미 방문한 페이지를 다시 방문할 때 서버 요청 없이 즉시 표시.

### 기대
탭 왔다갔다 할 때 이미 로드된 페이지는 즉시 표시.

---

## T3. 정보공유 이미지 최적화

### 이게 뭔지
정보공유 글의 이미지가 Supabase Storage 원본 크기 그대로 로드됨. 썸네일/목록에서는 작은 크기면 충분.

### 기대
- 목록 페이지: 이미지를 적절한 크기로 리사이즈하여 로드
- next/image 활용 (이미 remotePatterns에 supabase.co 있음)
- Supabase Storage의 transform 기능 또는 next/image의 자동 리사이즈 활용

---

## T4. loading.tsx 체감 개선

### 이게 뭔지
이미 P1에서 /protractor, /dashboard, /reviews에 loading.tsx 추가함. /questions, /posts에도 인라인 로딩이 있는지 확인하고, 부족하면 보강.

### 기대
탭 전환 시 즉시 Skeleton UI 표시 → 데이터 로드 후 실제 콘텐츠 교체.

---

## 하지 말 것
- API 로직 변경 금지 (이미 P0~P2에서 완료)
- 에디터 관련 변경 금지
- 관리자 페이지 변경 금지
