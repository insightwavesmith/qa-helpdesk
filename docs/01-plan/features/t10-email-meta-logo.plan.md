# T10. 이메일 프로필 카드 Meta 로고 URL 수정

## 요구사항
- 이메일 프로필 카드의 Meta Business Partners 인라인 로고 이미지 URL을 Supabase Storage → bscamp.vercel.app 절대 URL로 변경
- 이미지 URL: `https://bscamp.vercel.app/images/meta-partner/inline-positive.png`
- 높이: 36px (유지)
- 텍스트: "Meta가 인증한 비즈니스 파트너" (유지, "공식" 표현 금지)

## 범위
- 파일: `src/lib/email-default-template.ts` 1개만 수정
- 변경: SMITH_PROFILE_ROW 내 인라인 로고 이미지 `src` 속성 URL 교체

## 현재 상태 (T7 완료 후)
- 프로필 카드에 이미 로고 이미지 존재
- URL: Supabase Storage (`https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/inline-positive.png`)
- 높이 36px, alt="Meta Business Partners" — 그대로 유지

## 성공 기준
- [x] 이미지 URL이 `https://bscamp.vercel.app/images/meta-partner/inline-positive.png`으로 변경됨
- [x] 높이 36px 유지
- [x] "공식" 텍스트 없음
- [x] `npm run build` 성공
