# 질문 이미지 첨부 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### questions 테이블
| 필드명 | 타입 | 설명 |
|--------|------|------|
| image_urls | Json | 첨부 이미지 URL 배열 (NULLABLE) |

### answers 테이블
| 필드명 | 타입 | 설명 |
|--------|------|------|
| image_urls | Json | 답변 이미지 URL 배열 (NULLABLE) |

### Supabase Storage
- **버킷명**: `question-images` (public)
- **경로**: `questions/{timestamp-random}.{ext}` (flat 구조, question_id 미포함)

> 주의: 이미지는 질문 생성 전에 업로드되므로 question_id 서브폴더 없음

## 2. API 설계

### 이미지 업로드 (new-question-form.tsx 인라인)
```typescript
// 파일 검증
const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const maxSize = 5 * 1024 * 1024; // 5MB

// Storage 업로드
const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
const filePath = `questions/${fileName}`;
await supabase.storage.from("question-images").upload(filePath, file);

// 공개 URL 생성
const { data } = supabase.storage.from("question-images").getPublicUrl(filePath);
```

### 질문 생성 시 이미지 연동
```typescript
// createQuestion (actions/questions.ts)
await svc.from("questions").insert({
  ...formData,
  image_urls: imageUrls || [],
});
```

### 답변 생성 시 이미지 연동
```typescript
// createAnswer (actions/answers.ts)
await svc.from("answers").insert({
  ...answerData,
  image_urls: imageUrls || [],
});
```

## 3. 컴포넌트 구조

### 이미지 업로드 (질문 작성 폼에 인라인)
```
src/app/(main)/questions/new/
└── new-question-form.tsx       # 이미지 업로드 UI 포함 (별도 컴포넌트 없음)
    ├── 파일 선택 input (type="file", multiple)
    ├── 미리보기 그리드 (업로드 전)
    └── X 버튼으로 삭제
```

> 별도 image-upload.tsx 컴포넌트 없음. 드래그앤드롭 미구현. 업로드 진행률 미구현.

### 이미지 표시 (질문 상세)
```
src/components/questions/
├── ImageGallery.tsx            # 첨부 이미지 그리드 (PascalCase)
└── ImageLightbox.tsx           # 이미지 확대 뷰 (PascalCase)
```

## 4. 에러 처리
- 파일 형식/크기 초과 → 클라이언트 검증, 즉시 에러 표시
- Storage 업로드 실패 → 에러 메시지 표시
- 이미지 없는 질문 → 정상 처리 (image_urls 빈 배열)

## 5. 구현 상태
- [x] 파일 선택 + 미리보기 UI
- [x] Supabase Storage 업로드
- [x] questions.image_urls 저장
- [x] answers.image_urls 저장
- [x] ImageGallery + ImageLightbox 컴포넌트
- [ ] 드래그앤드롭 업로드
- [ ] 업로드 진행률 표시
