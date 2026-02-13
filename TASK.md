# TASK: 뉴스레터 템플릿 목업 일치 수정

## 배경
email-mockup-all.html 목업과 실제 Unlayer 템플릿 렌더링이 다름.
폰트, 도형, 색상, 여백 등이 불일치.

## 목업 기준 (public/email-mockup-all.html)
- 폰트: Pretendard Variable (웹폰트 @import)
- section-banner: linear-gradient(135deg) 사선 그라데이션
- Before/After 카드: border-radius 12px, ba-before(#f1f3f8), ba-after(#FEF2F2 + #FECACA)
- 프로필 카드: border-radius 12px, 회색배경 #f8f9fc
- CTA 버튼: border-radius 8px
- quote-block: border-left 3px solid + border-radius 0 8px 8px 0
- bullet-list: ::before pseudo-element로 색상 도트
- 전반적으로 border-radius가 많이 사용됨 (8~12px)

## Unlayer 제약사항
- Unlayer는 CSS gradient를 직접 지원하지 않음
- Unlayer에서 가능한 것: 단색 배경, 이미지, HTML 블록
- 해결: gradient가 필요한 section-banner는 HTML 블록으로 구현

## 수정 사항

### 1. 폰트 통일
모든 템플릿(A/B/C)에서 Pretendard 폰트 적용.
- body values에 fontFamily 추가: "'Pretendard Variable', -apple-system, 'Segoe UI', sans-serif"
- 또는 Unlayer의 body.values.fontFamily 설정

### 2. Section Banner → HTML 블록
현재 단색 배경 → 목업처럼 gradient 사선 배경으로 변경.
Unlayer에서 type: "html" 블록으로 교체:
```html
<div style="height:56px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);position:relative;">
  <span style="position:absolute;left:32px;top:50%;transform:translateY(-50%);color:white;font-size:14px;font-weight:700;letter-spacing:1px;">INSIGHT 01</span>
</div>
```
Template B: #10B981→#059669, Template C: #F97316→#EA580C

### 3. Before/After 카드 (Template C)
현재 Unlayer 2컬럼 → HTML 블록으로 교체해서 목업과 동일하게:
- border-radius 12px
- ba-before: background #f1f3f8, border 1px solid #e2e8f0
- ba-after: background #FEF2F2, border 1px solid #FECACA
- 숫자: font-size 28px, font-weight 800

### 4. 프로필 카드 (Template C)
- border-radius 12px
- background: #f8f9fc
- 아바타: 64px 원형, 주황 배경

### 5. Quote Block
- border-left: 3px solid (테마색)
- border-radius: 0 8px 8px 0
- background: #f8f9fc

### 6. CTA 버튼
- border-radius: 8px (현재와 비교 확인)
- 패딩: 14px 32px

### 7. Bullet List
- 빨간/초록/주황 도트 (현재 HTML 텍스트 → 스타일 확인)

## 파일
- `src/lib/email-default-template.ts` — Template A/B/C JSON 수정

## 검증
1. npm run build 성공
2. 각 템플릿 Unlayer 에디터에서 목업과 시각적 일치 확인
