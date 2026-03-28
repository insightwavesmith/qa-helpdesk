# T7. 프로필 카드 적용 (이메일 + 정보공유) — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### 이메일 프로필 카드 (email-default-template.ts)

`SMITH_PROFILE_ROW` — Unlayer JSON 내 HTML text:
```html
<table width="100%" ...>
  <tr>
    <td style="padding:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <table>
        <tr>
          <td width="100">
            <img src="...profile-smith.png" style="width:80px;height:80px;border-radius:50%;" />
          </td>
          <td>
            <p>스미스 <span style="...color:#F75D5D;">자사몰사관학교 코치</span></p>
            <p style="...color:#64748b;">메타파트너 / 메타공식 프로페셔널<br>스킨스쿨 / 재미어트 Co-founder<br>수강생 자사몰매출 450억+</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

### 정보공유 글 상세 (PostDetailClient.tsx)
- 현재 프로필 카드 없음
- 글 본문(PostBody) 아래에 바로 댓글/관련글 등이 이어짐

## 2. 변경 설계

### 2-1. 이메일 프로필 카드 수정

SMITH_PROFILE_ROW의 text HTML을 수정:

**변경 사항**:
1. 설명 텍스트 변경: "메타파트너 / 메타공식 프로페셔널\n스킨스쿨 / 재미어트 Co-founder\n수강생 자사몰매출 450억+" → "Meta가 인증한 비즈니스 파트너\n수강생 자사몰매출 450억+"
2. Meta Business Partners 인라인 로고 추가 (하단)

**수정 후 HTML**:
```html
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="padding:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td width="100" style="vertical-align:top;">
            <img src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/profile-smith.png"
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
      <!-- Meta Business Partners 인라인 로고 -->
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9;">
        <img src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/inline-positive.png"
             alt="Meta Business Partners" style="height:36px;display:block;" />
      </div>
    </td>
  </tr>
</table>
```

> 주의: 이메일용 이미지는 Supabase Storage public URL 사용 (로컬 경로 불가)
> `inline-positive.png`가 Supabase Storage에 업로드되어 있는지 확인 필요. 없으면 업로드 필요.

### 2-2. 정보공유 프로필 카드 컴포넌트

새 컴포넌트: `src/components/posts/author-profile-card.tsx`

```tsx
export function AuthorProfileCard() {
  return (
    <div className="border-t border-b border-slate-200 py-6 mt-8">
      <div className="flex items-center gap-4">
        <img
          src="/images/meta-partner/profile-smith.png"
          alt="스미스"
          className="w-20 h-20 rounded-full object-cover flex-shrink-0"
        />
        <div>
          <p className="font-extrabold text-base text-gray-900">
            스미스{" "}
            <span className="font-semibold text-[13px] text-[#F75D5D]">
              자사몰사관학교 코치
            </span>
          </p>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            Meta가 인증한 비즈니스 파트너<br />
            수강생 자사몰매출 450억+
          </p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100">
        <img
          src="/images/meta-partner/inline-positive.png"
          alt="Meta Business Partners"
          className="h-9"
        />
      </div>
    </div>
  );
}
```

### 2-3. PostDetailClient.tsx에 삽입

PostBody 컴포넌트 바로 아래에 프로필 카드 추가:

```tsx
import { AuthorProfileCard } from "@/components/posts/author-profile-card";

// ... PostBody 아래
<PostBody content={post.body_md} />
<AuthorProfileCard />
```

## 3. 목업 대조

| 목업 요소 | 구현 |
|----------|------|
| 사진 80px 원형 | `w-20 h-20 rounded-full` |
| "스미스" + "자사몰사관학교 코치" (빨간색) | font-extrabold + text-[#F75D5D] |
| "Meta가 인증한 비즈니스 파트너" | text-[13px] text-slate-500 |
| "수강생 자사몰매출 450억+" | 동일 p 태그 내 br |
| 인라인 로고 36px | `h-9` (= 36px) |
| border-top/bottom 구분선 | `border-t border-b border-slate-200` |
| badge-row border-top | `mt-4 pt-4 border-t border-slate-100` |

## 4. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/lib/email-default-template.ts` | SMITH_PROFILE_ROW HTML 텍스트 수정 |
| `src/components/posts/author-profile-card.tsx` | 신규 컴포넌트 생성 |
| `src/app/(main)/posts/[id]/PostDetailClient.tsx` | AuthorProfileCard import + 삽입 |

## 5. 에러 처리
- 이미지 로드 실패 → alt 텍스트 표시
- 프로필 카드는 순수 정적 컴포넌트 → 데이터 fetch 에러 없음
- Supabase Storage에 inline-positive.png 미업로드 시 → 이메일에서 이미지 깨짐 → 사전 업로드 확인 필요

## 6. 이미지 경로 정리

| 용도 | 로컬 경로 | 이메일 URL |
|------|----------|-----------|
| 프로필 사진 | `/images/meta-partner/profile-smith.png` | `https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/profile-smith.png` |
| 인라인 로고 | `/images/meta-partner/inline-positive.png` | Supabase Storage URL 필요 (확인/업로드) |
