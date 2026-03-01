# T4. 정보공유 글 CSS 개선 — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### 렌더링 파이프라인
```
body_md (마크다운) → markdownToHtml() (post-body.tsx) → sanitizeHtml() → dangerouslySetInnerHTML
```

- 렌더링 컴포넌트: `src/components/posts/post-body.tsx`
- CSS 파일: `src/components/posts/post-body.css`
- 컨테이너 클래스: `.post-body`

### 기존 CSS 요약 (post-body.css)

| 요소 | 현재 스타일 |
|------|-----------|
| blockquote | `border-left: 4px solid #F75D5D`, `background: #FFF5F5`, italic |
| h2 | 24px bold, `border-top: 1px solid #eee`, margin-top 48px |
| ul/ol | padding-left 24px |
| img | width 100%, border-radius 8px |
| figcaption | font-size 13px, color #9ca3af |

## 2. 변경 설계

### 2-1. blockquote 강화

현재 blockquote 스타일은 이미 빨간 바 + 배경이 적용되어 있음. 미세 조정 필요:

```css
.post-body blockquote {
  background: #fef2f2;          /* 기존 #FFF5F5 → 약간 더 따뜻한 톤 */
  border-left: 4px solid #F75D5D;
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin: 18px 0;
  font-size: 14px;
  font-style: italic;
  color: #555;
  line-height: 1.7;
}
```

### 2-2. 인용 출처 (cite) 스타일 — 신규

blockquote 내에서 "—" 로 시작하는 마지막 줄을 cite로 처리.

**CSS 추가**:
```css
.post-body blockquote cite,
.post-body blockquote p:last-child:has(> em) {
  display: block;
  font-size: 12px;
  font-style: normal;
  color: #aaa;
  margin-top: 6px;
}
```

> 주의: markdownToHtml()에서 `— 텍스트` 패턴을 `<cite>` 태그로 감싸는 처리가 필요할 수 있음. 단, 변환 로직 '변경'이 아닌 CSS 클래스 '추가'의 범위에서 처리.

### 2-3. 체크리스트 스타일 — 신규

✅, ☐, ☑ 문자가 포함된 리스트 아이템에 배경 박스 스타일 적용.

**CSS 추가**:
```css
/* 체크리스트 스타일 — post-body 내에서만 적용 */
.post-body ul li:has(> :first-child:is([data-check])),
.post-body .checklist {
  list-style: none;
  padding: 16px;
  margin: 14px 0;
  background: #f8f9fa;
  border-radius: 10px;
}

.post-body .check-item,
.post-body ul li[data-check] {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 14px;
  line-height: 1.55;
  color: #333;
}

.post-body .check-item:last-child {
  border-bottom: none;
}
```

**대안 (순수 CSS)**: ✅/☐/☑ 가 텍스트이므로, markdownToHtml()에서 이들을 포함한 li를 감지하여 클래스를 부여하는 방식이 더 안정적:
```typescript
// post-body.tsx 내 li 변환 시
if (liText.match(/^[✅☐☑]/)) {
  return `<li class="check-item">${liText}</li>`;
}
```

### 2-4. h2 번호 뱃지 스타일

목업에서는 SECTION 01 ~ 05 형태의 뱃지 + h2 조합. CSS만으로 `## 1.` 형태의 번호를 추출하여 뱃지화하기는 어려움.

**접근법**: markdownToHtml()에서 `## 숫자. 제목` 패턴을 감지하여 번호 뱃지 span을 삽입:

```html
<!-- Before -->
<h2>1. AI가 고객의 구매 여정을 바꾸고 있어요</h2>

<!-- After -->
<div class="sec-div"><hr><span class="sec-badge">01</span><hr></div>
<h2>AI가 고객의 구매 여정을 바꾸고 있어요</h2>
```

**CSS 추가**:
```css
.post-body .sec-div {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 34px 0 16px;
}

.post-body .sec-div hr {
  flex: 1;
  border: none;
  border-top: 2px solid #f0f0f0;
}

.post-body .sec-badge {
  background: #F75D5D;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
```

### 2-5. 이미지 캡션 강화

기존 figcaption 스타일 보강:

```css
.post-body figure {
  margin: 24px 0;
  text-align: center;
}

.post-body figcaption {
  font-size: 13px;
  color: #9ca3af;
  margin-top: 8px;
  line-height: 1.5;
}

/* 이미지 바로 아래 볼드 텍스트가 캡션 역할일 때 */
.post-body img + p > strong:only-child {
  display: block;
  font-size: 13px;
  color: #9ca3af;
  font-weight: 500;
  text-align: center;
  margin-top: -8px;
  margin-bottom: 16px;
}
```

## 3. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/components/posts/post-body.css` | blockquote 미세조정, cite/checklist/sec-badge/caption CSS 추가 |
| `src/components/posts/post-body.tsx` | 체크리스트 class, h2 번호 뱃지 span, cite 태그 삽입 (변환 로직 자체가 아닌 출력 HTML에 class 추가) |

## 4. 목업 대조표

| 목업 요소 | CSS 클래스 | 구현 방식 |
|----------|-----------|----------|
| 3줄 요약 박스 | `.summary-box` | T5(프롬프트)에서 blockquote로 생성 → blockquote CSS로 대응 |
| SECTION 뱃지 | `.sec-badge` | h2 번호 추출 → 뱃지 span 삽입 |
| 수치 그리드 | `.stat-grid` | CSS로 구현 가능하나, 프롬프트가 이 형식을 생성해야 함 (T5 연계) |
| 체크리스트 | `.checklist` / `.check-item` | ✅/☐ 패턴 감지 → class 부여 |
| blockquote + cite | `.post-body blockquote cite` | "—" 패턴 → cite 태그 |
| 이미지 캡션 | `figcaption` | 기존 figure/figcaption 스타일 보강 |

## 5. 에러 처리
- 기존 마크다운에 ✅/☐/☑ 가 없는 경우 → 체크리스트 CSS 미적용 (무해)
- h2에 번호가 없는 경우 → 뱃지 미생성 (기존 h2 스타일 유지)
- sanitizeHtml에 `cite` 태그 허용 여부 확인 필요 → 허용 목록에 없으면 추가
