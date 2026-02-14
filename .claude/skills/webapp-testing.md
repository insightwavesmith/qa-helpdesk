---
name: webapp-testing
description: Playwright 기반 웹 앱 테스트. 브라우저 QA, 스크린샷, UI 검증.
---

# 웹 앱 테스트 (Playwright)

## 설치
```bash
npx playwright install chromium
```

## 기본 패턴
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')  # 필수: JS 로드 대기
    
    # 스크린샷
    page.screenshot(path='/tmp/test.png', full_page=True)
    
    # 모바일 뷰포트
    page.set_viewport_size({"width": 375, "height": 812})
    page.screenshot(path='/tmp/test-mobile.png', full_page=True)
    
    browser.close()
```

## QA 체크리스트
- [ ] 데스크탑 (1920px) 스크린샷
- [ ] 모바일 (375px) 스크린샷
- [ ] 주요 기능 클릭 + 결과 확인
- [ ] 에러 상태 (빈 데이터, 잘못된 입력) 확인
- [ ] 콘솔 에러 없는지 확인

## 결정 트리
```
정적 HTML? → 파일 직접 읽고 셀렉터 확인
동적 앱? → 서버 실행 중?
  ├─ 아니오 → npm run dev 먼저 실행
  └─ 예 → networkidle 대기 → 스크린샷 → 셀렉터 확인 → 액션
```

## 주의
- networkidle 대기 전에 DOM 검사하지 말 것
- headless=True 필수 (서버 환경)
- 스크린샷은 /tmp/ 에 저장
