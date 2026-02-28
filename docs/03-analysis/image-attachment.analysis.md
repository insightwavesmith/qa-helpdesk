# 질문 이미지 첨부 Gap 분석

## 설계서 vs 실제 구현 비교

### 1. 데이터 모델 분석

#### ✅ 데이터베이스 스키마 완벽 구현
- questions 테이블에 `image_urls JSON` 필드 정확히 존재
- 배열 형태 저장 구조 설계서와 일치
- 기본값 `[]` 빈 배열로 설정됨

#### ✅ 타입 정의 정확히 구현
```typescript
// database.ts에서 정확한 타입 정의
questions: {
  Row: {
    image_urls: Json;  // JSON 배열 타입
    // ... 다른 필드들
  };
  Insert: {
    image_urls?: Json;  // 선택적 필드
  };
}
```

### 2. API 구현 현황 분석

#### ✅ 질문 생성 시 이미지 URL 저장 구현
```typescript
// createQuestion in actions/questions.ts
export async function createQuestion(formData: {
  title: string;
  content: string;
  categoryId: number | null;
  imageUrls?: string[];  // ✅ 이미지 URL 배열 지원
}) {
  const { data } = await svc
    .from("questions")
    .insert({
      // ... 다른 필드들
      image_urls: formData.imageUrls && formData.imageUrls.length > 0
        ? formData.imageUrls
        : [],  // ✅ 정확한 저장 로직
    });
}
```

#### ❌ 이미지 업로드 API 미구현
| 설계서 함수 | 구현 상태 | 설명 |
|-------------|----------|------|
| uploadQuestionImage | ❌ | Supabase Storage 업로드 API |
| deleteQuestionImage | ❌ | 이미지 삭제 API |
| validateFile | ❌ | 파일 형식/크기 검증 |
| getPublicUrl | ❌ | Storage 공개 URL 생성 |

### 3. Supabase Storage 설정 분석

#### ❌ Storage 버킷 미설정
```bash
# Supabase Storage 버킷 확인
# 결과: 'questions' 버킷이 존재하지 않음
```

#### ❌ Storage 정책 미구현
- RLS 정책 설계서에는 있으나 실제 미적용
- 이미지 업로드/삭제 권한 제어 없음

### 4. 컴포넌트 구조 분석

#### ❌ 설계서 컴포넌트 전혀 미구현
```
❌ src/components/
   ├── ui/
   │   ├── image-upload.tsx         # 미구현
   │   ├── image-preview.tsx        # 미구현  
   │   └── progress-bar.tsx         # 미구현
   └── questions/
       ├── image-gallery.tsx        # 미구현
       └── image-lightbox.tsx       # 미구현
```

#### 🔍 질문 작성 폼 확인
```typescript
// src/app/(main)/questions/new/new-question-form.tsx 확인 필요
// 현재 이미지 업로드 UI가 있는지 확인
```

<function_calls>
<invoke name="Read">
<parameter name="path">/home/node/.openclaw/workspace/projects/qa-knowledge-base/app/src/app/(main)/questions/new/new-question-form.tsx