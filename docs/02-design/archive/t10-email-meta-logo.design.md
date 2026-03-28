# T10. 이메일 프로필 카드 Meta 로고 — 설계서

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조
- **파일**: `src/lib/email-default-template.ts`
- **대상**: `SMITH_PROFILE_ROW` 상수 (line 7~72)
- **변경**: `text` 속성 내 `<img>` 태그의 `src` URL만 교체

### Before
```
src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/inline-positive.png"
```

### After
```
src="https://bscamp.vercel.app/images/meta-partner/inline-positive.png"
```

## 4. 에러 처리
- 해당 없음 (정적 HTML 템플릿)

## 5. 구현 순서
- [x] `email-default-template.ts` SMITH_PROFILE_ROW의 인라인 로고 이미지 URL 교체
- [x] `npm run build` 성공 확인
