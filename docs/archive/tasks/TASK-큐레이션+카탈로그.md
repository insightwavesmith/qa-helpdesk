# TASK: 큐레이션 뷰 개선 + 카탈로그 이미지 표시

## 이게 뭔지

1. 큐레이션 뷰 — 초안 탭에 콘텐츠가 비정상적으로 많이 쌓여있는 문제
2. 경쟁사 분석기 — 카탈로그 광고 이미지 표시 안 되는 문제

## 왜 필요한지

1. 큐레이션: 초안에 쌓인 콘텐츠 154건 (crawl 81건, youtube 47건) → 큐레이션 안 된 정보 덩어리가 너무 많음. 큐레이션뷰 효율 저하
2. 경쟁사 분석기: 카탈로그 광고는 cards 필드에 이미지가 있는데, 이걸 안 읽어서 이미지 표시 안 됨 → 광고 효과 분석에 지장

## 구현 내용

### T1: 큐레이션 뷰 개선
- 자동 수집된 (crawl, youtube) 콘텐츠가 draft로 남아있는 문제
- 분석:
  - 수동으로 큐레이션해서 status를 published/ready로 변경해야 함
  - 또는 자동 수집 후 status 처리 로직이 빠져있을 수도 있음
- 해결:
  - (A) 자동 수집 후 status 처리 로직 구현 (crawl, youtube)
  - (B) 기존 draft 콘텐츠 큐레이션 및 status 변경
- 후속 작업:
  - (A) 구현 후 테스트 및 검증 (crawl, youtube)
  - (B) 진행 상황 확인 (초안 탭에서 draft 콘텐츠 감소)

### T2: 카탈로그 광고 이미지 표시
- 카탈로그 광고의 이미지가 cards 필드에 있는데 이걸 안 읽어서 이미지가 안 보임
- **파일**: `src/app/(main)/protractor/competitor/components/어쩌구.tsx`
  - 카탈로그 광고(display_format = DCO, CAROUSEL)의 경우
  - snapshot.cards 필드에서 이미지 URL을 읽어와 표시

