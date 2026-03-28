# A1. 프로필 카드 문구 + 로고 수정 — 설계서

> 작성: 2026-03-02
> 참조: T7(t7-profile-card.design.md), T10(t10-email-meta-logo.design.md)

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조

### 3-1. 정보공유 프로필 카드 수정

**파일**: `src/components/posts/author-profile-card.tsx`

**현재 상태 (T7 구현)**:
```tsx
<div className="border-t border-gray-200 pt-8 mt-12">
  <div className="flex items-center gap-5">
    <div className="flex-shrink-0">
      <Image src="/images/meta-partner/profile-smith.png" ... />
    </div>
    <div>
      <p>스미스 <span>자사몰사관학교 코치</span></p>
      <p>Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+</p>
      <div className="mt-2">
        <Image src="/images/meta-partner/inline-positive.png" ... />
      </div>
    </div>
  </div>
</div>
```

**문제점 (목업 대비)**:
1. border-bottom 없음 → 목업은 `border-top + border-bottom`
2. 텍스트가 "/" 슬래시로 한 줄 연결 → 목업은 `<br>` 줄바꿈 분리
3. 로고가 텍스트 div 안에 인라인 → 목업은 별도 `badge-row` (border-top 구분선)

**수정 후 (목업 일치)**:
```tsx
import Image from "next/image";

export function AuthorProfileCard() {
  return (
    <div className="border-t border-b border-slate-200 py-6 mt-8">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <Image
            src="/images/meta-partner/profile-smith.png"
            alt="스미스"
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover"
          />
        </div>
        <div>
          <p className="font-extrabold text-base text-gray-900">
            스미스{" "}
            <span className="font-semibold text-[13px] text-[#F75D5D]">
              자사몰사관학교 코치
            </span>
          </p>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            Meta가 인증한 비즈니스 파트너
            <br />
            수강생 자사몰매출 450억+
          </p>
        </div>
      </div>
      {/* Meta Business Partners 로고 — 별도 badge-row */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <Image
          src="/images/meta-partner/inline-positive.png"
          alt="Meta Business Partners"
          width={120}
          height={36}
          className="h-9 w-auto"
        />
      </div>
    </div>
  );
}
```

**변경 상세**:
| 항목 | Before (T7) | After (목업 일치) |
|------|-------------|-------------------|
| 상위 div border | `border-t` only | `border-t border-b` |
| 상위 div padding | `pt-8 mt-12` | `py-6 mt-8` |
| 텍스트 div gap | `gap-5` | `gap-4` |
| 설명 텍스트 | `"... / ..."` 한 줄 | `<br />` 줄바꿈 분리 |
| 설명 font-size | `text-sm` | `text-[13px]` |
| 이름 font-weight | `font-bold` | `font-extrabold` |
| 로고 위치 | 텍스트 div 내부 `mt-2` | 별도 `div.mt-4.pt-4.border-t` |

### 3-2. 뉴스레터 ROW_PROFILE 수정

**파일**: `src/lib/newsletter-row-templates.ts` (line 634)

**현재 text HTML** (구버전):
```html
<p style="...">
  메타파트너 / 메타공식 프로페셔널<br>
  스킨스쿨 / 재미어트 Co-founder<br>
  수강생 자사몰매출 450억+
</p>
```

**수정 후 text HTML**:
```html
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="padding:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td width="100" style="vertical-align:top;">
            <img src="https://bscamp.vercel.app/images/meta-partner/profile-smith.png"
                 alt="스미스" style="width:80px;height:80px;border-radius:50%;display:block;" />
          </td>
          <td style="vertical-align:top;">
            <p style="margin:0;font-weight:800;font-size:16px;color:#1a1a1a;">
              스미스 <span style="font-weight:600;font-size:13px;color:#F75D5D;">자사몰사관학교 코치</span>
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">
              Meta가 인증한 비즈니스 파트너<br>수강생 자사몰매출 450억+
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9;">
        <img src="https://bscamp.vercel.app/images/meta-partner/inline-positive.png"
             alt="Meta Business Partners" style="height:36px;display:block;" />
      </div>
    </td>
  </tr>
</table>
```

> 이미지 URL은 `bscamp.vercel.app` 경로 사용 (T10에서 결정된 패턴. Supabase Storage → vercel.app)

### 3-3. 이메일 기본 템플릿 확인 (변경 불필요)

**파일**: `src/lib/email-default-template.ts` — SMITH_PROFILE_ROW
- T7에서 문구 업데이트 완료 ("Meta가 인증한 비즈니스 파트너\n수강생 자사몰매출 450억+")
- T10에서 로고 URL 변경 완료 (bscamp.vercel.app)
- **추가 변경 불필요** — 확인만

## 4. 에러 처리
- 이미지 로드 실패 → alt 텍스트 표시 (기존 동작 유지)
- 프로필 카드는 정적 컴포넌트 → 데이터 fetch 에러 없음
- 뉴스레터 ROW_PROFILE은 Unlayer JSON 내 HTML → 렌더링 시점에만 이미지 로드

## 5. 구현 순서
- [ ] `src/components/posts/author-profile-card.tsx` — 목업 레이아웃 일치 수정 (border, 줄바꿈, badge-row)
- [ ] `src/lib/newsletter-row-templates.ts` — ROW_PROFILE text HTML 교체
- [ ] `src/lib/email-default-template.ts` — 현재 상태 확인 (변경 불필요 시 skip)
- [ ] `npm run build` 성공 확인

## 6. 목업 대조

| 목업 요소 | 현재 (T7) | 수정 후 |
|----------|-----------|---------|
| border-top + border-bottom | border-top만 | ✅ 둘 다 |
| 설명 텍스트 줄바꿈 | "/" 슬래시 연결 | ✅ `<br>` 분리 |
| 로고 badge-row 분리 | 텍스트 내부 | ✅ 별도 div, border-top |
| font-extrabold | font-bold | ✅ font-extrabold |
| text-[13px] | text-sm | ✅ text-[13px] |
| py-6 mt-8 | pt-8 mt-12 | ✅ py-6 mt-8 |
| 뉴스레터 문구 | 구버전 | ✅ 신버전 |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/components/posts/author-profile-card.tsx` | 스타일/레이아웃 수정 | 낮음 |
| `src/lib/newsletter-row-templates.ts` | ROW_PROFILE HTML 교체 | 낮음 |
| `src/lib/email-default-template.ts` | 확인만 (변경 없음) | 없음 |
