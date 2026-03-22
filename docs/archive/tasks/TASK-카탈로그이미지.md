# TASK: 카탈로그(DCO) 광고 이미지 표시 수정

## 이게 뭔지

경쟁사 분석기에서 카탈로그(동적소재) 광고의 이미지가 안 보이는 버그 수정.

## 왜 필요한지

수강생이 경쟁사 광고를 검색하면 카탈로그 광고는 이미지 없이 빈 카드로 표시된다. 실제로는 이미지가 있는데 코드가 안 읽고 있는 것.

## 구현 내용

### T1: SearchAPI.io 응답 파싱 수정
- **파일**: `src/lib/competitor/meta-ad-library.ts` (응답 파싱 부분)
- **원인**: 카탈로그(DCO) 광고는 `snapshot.images`가 비어있고, 이미지가 `snapshot.cards[]` 배열의 각 요소 안에 `original_image_url`, `resized_image_url` 필드로 들어있다.
- **수정**: 광고 파싱 시 `snapshot.images`가 비어있으면 `snapshot.cards[0].original_image_url`을 대표 이미지로 사용
- cards가 여러 개면 첫 번째 card의 이미지를 대표 썸네일로, 나머지는 추가 이미지로 저장

### T2: 카드 UI에서 카탈로그 이미지 표시
- **파일**: 광고 카드 컴포넌트 (`src/app/(main)/protractor/competitor/components/ad-card.tsx` 또는 유사)
- 이미지가 있으면 정상 표시
- cards 여러 장이면 캐러셀/슬라이드 또는 첫 장만 표시 (기존 캐러셀 로직 있으면 활용)

### T3: 빌드 검증
- `npm run build` 성공 확인

## 참고 — SearchAPI.io 응답 구조

일반 광고:
```
snapshot.images: [{original_image_url: "https://..."}]
snapshot.cards: []
```

카탈로그(DCO) 광고:
```
snapshot.images: []
snapshot.cards: [
  {original_image_url: "https://...", resized_image_url: "https://...", title: "...", ...},
  {original_image_url: "https://...", resized_image_url: "https://...", title: "...", ...}
]
snapshot.display_format: "DCO"
```

## 하지 말 것
- SearchAPI.io 호출 로직 변경 금지
- 다른 광고 타입(일반 이미지/영상) 표시 건드리지 마라
- API route 변경 불필요
