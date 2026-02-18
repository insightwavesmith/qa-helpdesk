# TASK: 뉴스레터 목업 v8 ↔ 실제 렌더링 일치 (Round 3)

## 목표
목업 v8과 실제 Gmail 렌더링 사이의 시각적 차이 7건을 수정하여 99% 일치 달성.

## 제약
- 수정 파일: `src/lib/newsletter-row-templates.ts` 1개만
- Gmail 호환 인라인 스타일만 사용 (CSS class 금지)
- linear-gradient는 Gmail 미지원 → solid color 유지
- 기존 Unlayer JSON 구조(makeTextRow 패턴) 유지
- `npm run build` 통과 필수

## 현재 코드

### createInsightRows — 팁박스 (라인 ~167)
```ts
rows.push(
  makeTextRow(
    "insight-tip",
    `<div style="background:#FFF8E7;border-left:4px solid #FDBA74;border-radius:0 6px 6px 0;padding:14px 18px;font-size:13.5px;line-height:1.6;color:#555">\n  ${tipHtml}\n</div>`,
    "12px 24px",
  ),
);
```

### createBannerRow — CSS 배너 (라인 ~388)
```ts
return makeTextRow(
  `banner-${slug}`,
  `<table cellpadding="0" cellspacing="0" style="width:66%;"><tr><td style="background-color:#F75D5D;height:52px;padding:0 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1px;line-height:52px;">${escapeHtml(bannerKey)}</td></tr></table>`,
  "24px 24px 0px",
);
```

### createHeroRow — 히어로 (라인 ~410, ~421)
```ts
const heroHtml = `...<p style="color:#ffffff;font-size:24px;font-weight:800;...">`;
// ...
containerPadding: "80px 32px",
```

### ROW_PROFILE — 프로필 사진 (라인 ~589)
```ts
text: '...<img src="..." style="width:80px;height:80px;border-radius:50%;..." />...</td width="100"...',
```

### createIntroRow (라인 ~479)
```ts
`<p style="font-size:14px;line-height:170%;margin:0;">...`
```

### ROW_FOOTER (라인 ~700+)
```ts
backgroundColor: "#f7f7f7",
```

## 태스크

### T1. 팁박스 색상 → 핑크 통일 (→ frontend-dev)
- `createInsightRows()` 팁박스 스타일 변경
- `background:#FFF8E7` → `background:#FFF5F5`
- `border-left:4px solid #FDBA74` → `border-left:3px solid #F75D5D`

### T2. CSS 배너 크기 조정 (→ frontend-dev)
- `createBannerRow()` 테이블 스타일 변경
- `width:66%` → `max-width:400px` + `width:400` 속성 추가
- `height:52px` → `height:60px`
- `line-height:52px` → `line-height:60px`
- `border-radius:4px 0 0 4px` td에 추가

### T3. 히어로 패딩 축소 (→ frontend-dev)
- `createHeroRow()` containerPadding 변경
- `"80px 32px"` → `"40px 32px"`

### T4. 히어로 타이틀 폰트 축소 (→ frontend-dev)
- `createHeroRow()` heroHtml 내 font-size 변경
- `font-size:24px` → `font-size:22px`

### T5. 프로필 사진 축소 (→ frontend-dev)
- `ROW_PROFILE` 상수 내 이미지 크기 변경
- `width:80px;height:80px` → `width:60px;height:60px`
- `td width="100"` → `td width="80"`

### T6. 인트로 텍스트 크기 (→ frontend-dev)
- `createIntroRow()` font-size 변경
- `font-size:14px` → `font-size:15px` (두 군데 모두)

### T7. 푸터 배경색 (→ frontend-dev)
- `ROW_FOOTER` backgroundColor 변경
- `"#f7f7f7"` → `"#f5f5f5"`

## 검증
- [ ] T1: Unlayer 에디터에서 교육 콘텐츠 뉴스레터 생성 → 팁박스가 핑크 배경(#FFF5F5) + 빨간 좌측보더(#F75D5D)로 표시
- [ ] T2: Gmail에서 배너가 ~400px 너비, 60px 높이로 표시 (좌정렬)
- [ ] T3: Gmail에서 웨비나 히어로 섹션이 목업과 동일한 높이 (상하 40px)
- [ ] T4: Gmail에서 히어로 타이틀이 22px로 표시
- [ ] T5: Gmail에서 프로필 사진이 60x60px 원형으로 표시
- [ ] T6: Gmail에서 인트로 본문이 15px로 표시
- [ ] T7: Gmail에서 푸터 배경이 #f5f5f5로 표시
- [ ] `npm run build` 성공
- [ ] 3종(교육/웨비나/고객사례) Gmail 테스트 발송 통과

## 엣지 케이스
1. Gmail Android: table에 `border-radius` 무시됨 → 배너 border-radius 안 되어도 기능상 문제 없음
2. Outlook: `max-width` 미지원 → `width="400"` HTML 속성 동시 설정으로 대응
3. 모바일 뷰(320px): 배너 max-width:400px가 화면보다 넓어질 수 있음 → 실제로는 Unlayer가 `max-width: 600px` 컨테이너 안에서 렌더링하므로 OK

## 수정 파일
| 파일 | 수정 내용 |
|------|----------|
| `src/lib/newsletter-row-templates.ts` | T1~T7 전부 (7개 함수/상수) |

## 체크리스트
- [ ] T1: 팁박스 #FFF5F5 + #F75D5D
- [ ] T2: 배너 max-width:400px, height:60px
- [ ] T3: 히어로 패딩 40px
- [ ] T4: 히어로 타이틀 22px
- [ ] T5: 프로필 60x60px
- [ ] T6: 인트로 15px
- [ ] T7: 푸터 #f5f5f5
- [ ] npm run build SUCCESS
- [ ] Gmail QA 3종 PASS

## 레퍼런스
- 목업 v8: https://mozzi-reports.vercel.app/reports/task/2026-02-18-newsletter-mockup-v8.html
- 디자인 스펙 v7: https://mozzi-reports.vercel.app/reports/task/2026-02-18-newsletter-detail-fix.html
- 골드 스탠다드: `~/projects/qa-helpdesk/newsletter-reference/`

## 리뷰 보고서
보고서 파일: mozzi-reports/public/reports/review/2026-02-18-newsletter-mockup-alignment-r3.html
(에이전트팀 리뷰 후 작성 예정)
