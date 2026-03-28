# B1. 프로필 카드 문구 수정 — 설계서

> 작성: 2026-03-02
> 참조: A1(a1-profile-card-final.design.md), T7(t7-profile-card.design.md)

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조

### 3-1. 정보공유 프로필 카드

**파일**: `src/components/posts/author-profile-card.tsx`

**변경 내용**: 텍스트 1줄 변경만

```tsx
// Before
<p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
  Meta가 인증한 비즈니스 파트너
  <br />
  수강생 자사몰매출 450억+
</p>

// After
<p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
  Meta Business Partner로서 광고 성과를 높입니다
  <br />
  수강생 자사몰매출 450억+
</p>
```

레이아웃, 로고, border, font-size 등 나머지 전부 변경 없음.

### 3-2. 이메일 기본 템플릿 SMITH_PROFILE_ROW

**파일**: `src/lib/email-default-template.ts`

**현재 text HTML 내 해당 부분**:
```html
<p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">
  Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+
</p>
```

**수정 후**:
```html
<p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">
  Meta Business Partner로서 광고 성과를 높입니다 / 수강생 자사몰매출 450억+
</p>
```

> 주의: 이 파일은 "/" 슬래시 연결 방식이며, A1에서 이미 확인 완료된 구조. 슬래시 구조는 유지.

### 3-3. 뉴스레터 ROW_PROFILE

**파일**: `src/lib/newsletter-row-templates.ts`

**현재 text HTML 내 해당 부분**:
```html
<p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">
  Meta가 인증한 비즈니스 파트너<br>수강생 자사몰매출 450억+
</p>
```

**수정 후**:
```html
<p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">
  Meta Business Partner로서 광고 성과를 높입니다<br>수강생 자사몰매출 450억+
</p>
```

## 4. 에러 처리
- 해당 없음 (정적 텍스트 변경만)

## 5. 구현 순서
- [ ] `src/components/posts/author-profile-card.tsx` — 문구 변경
- [ ] `src/lib/email-default-template.ts` — SMITH_PROFILE_ROW 문구 변경
- [ ] `src/lib/newsletter-row-templates.ts` — ROW_PROFILE 문구 변경
- [ ] `npm run build` 성공 확인

## 6. 변경 요약

| 위치 | Before | After |
|------|--------|-------|
| author-profile-card.tsx | Meta가 인증한 비즈니스 파트너 | Meta Business Partner로서 광고 성과를 높입니다 |
| email-default-template.ts | Meta가 인증한 비즈니스 파트너 | Meta Business Partner로서 광고 성과를 높입니다 |
| newsletter-row-templates.ts | Meta가 인증한 비즈니스 파트너 | Meta Business Partner로서 광고 성과를 높입니다 |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/components/posts/author-profile-card.tsx` | 텍스트 1줄 변경 | 매우 낮음 |
| `src/lib/email-default-template.ts` | 인라인 HTML 텍스트 변경 | 낮음 |
| `src/lib/newsletter-row-templates.ts` | 인라인 HTML 텍스트 변경 | 낮음 |
