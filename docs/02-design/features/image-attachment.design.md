# 질문 이미지 첨부 설계서

## 1. 데이터 모델

### questions 테이블 (이미지 관련)
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| image_urls | JSON | 첨부된 이미지 URL 배열 | DEFAULT [] |

### 이미지 저장 구조
```typescript
// questions.image_urls 저장 형식
interface ImageUrls extends Array<string> {}

// 예시 데이터
image_urls: [
  "https://supabase-bucket.s3.amazonaws.com/questions/uuid1/image1.jpg",
  "https://supabase-bucket.s3.amazonaws.com/questions/uuid2/image2.png"
]
```

### Supabase Storage 버킷 구조
```
questions/
├── {question_id}/
│   ├── image1.jpg
│   ├── image2.png
│   └── image3.gif
```

## 2. API 설계

### 이미지 업로드 API

| 함수명 | 파라미터 | 설명 | 권한 |
|--------|----------|------|------|
| uploadQuestionImage | file: File, questionId?: string | 이미지 업로드 | 승인된 사용자 |
| deleteQuestionImage | imageUrl: string | 이미지 삭제 | 본인/관리자 |

### 업로드 플로우
```typescript
// 1. 파일 검증
const validateFile = (file: File) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('지원되지 않는 파일 형식입니다.');
  }
  
  if (file.size > maxSize) {
    throw new Error('파일 크기는 최대 5MB입니다.');
  }
};

// 2. Storage 업로드
const uploadToStorage = async (file: File, path: string) => {
  const { data, error } = await supabase.storage
    .from('questions')
    .upload(path, file);
    
  if (error) throw error;
  return data;
};

// 3. 공개 URL 생성
const getPublicUrl = (path: string) => {
  const { data } = supabase.storage
    .from('questions')
    .getPublicUrl(path);
    
  return data.publicUrl;
};
```

### 질문 생성 시 이미지 연동
```typescript
export async function createQuestion(formData: {
  title: string;
  content: string;
  categoryId: number | null;
  imageUrls?: string[];  // 업로드된 이미지 URL들
}) {
  const { data } = await svc
    .from("questions")
    .insert({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      author_id: user.id,
      image_urls: formData.imageUrls || [],  // JSON 배열로 저장
    });
}
```

## 3. 컴포넌트 구조

### 이미지 업로드 컴포넌트
```
src/components/
├── ui/
│   ├── image-upload.tsx                # 드래그앤드롭 업로드
│   ├── image-preview.tsx               # 업로드 전 미리보기
│   └── progress-bar.tsx                # 업로드 진행률
└── questions/
    ├── image-gallery.tsx               # 첨부된 이미지 갤러리
    └── image-lightbox.tsx              # 이미지 확대 뷰
```

### 질문 작성 폼 연동
```typescript
// 질문 작성 페이지
interface QuestionFormState {
  title: string;
  content: string;
  categoryId: number | null;
  images: File[];           // 업로드할 파일들
  imageUrls: string[];      // 업로드 완료된 URL들
}

// 이미지 업로드 핸들러
const handleImageUpload = async (files: File[]) => {
  const uploadPromises = files.map(async (file) => {
    const path = `${questionId || 'temp'}/${file.name}`;
    const data = await uploadToStorage(file, path);
    return getPublicUrl(data.path);
  });
  
  const urls = await Promise.all(uploadPromises);
  setFormState(prev => ({
    ...prev,
    imageUrls: [...prev.imageUrls, ...urls]
  }));
};
```

## 4. 에러 처리

### 파일 업로드 실패
- **상황**: Storage 업로드 실패 (네트워크, 권한 등)
- **처리**: 재시도 버튼 제공, 에러 메시지 표시

### 파일 형식/크기 제한
- **상황**: 지원되지 않는 형식이나 크기 초과
- **처리**: 업로드 전 클라이언트 검증, 즉시 에러 표시

### Storage 할당량 초과
- **상황**: Supabase Storage 용량 한계
- **처리**: 관리자 알림, 임시 업로드 차단

## 5. 구현 순서

### 1단계: 기본 이미지 업로드
- [ ] Supabase Storage 버킷 설정
- [ ] 이미지 업로드 API 구현
- [ ] 파일 검증 로직 구현

### 2단계: 질문 폼 연동  
- [ ] 질문 작성 시 이미지 첨부 UI
- [ ] 드래그앤드롭 업로드 구현
- [ ] 업로드 진행률 표시

### 3단계: 이미지 미리보기
- [ ] 업로드 전 이미지 미리보기
- [ ] 이미지 삭제 기능
- [ ] 순서 변경 기능

### 4단계: 질문 상세 페이지 표시
- [ ] 첨부된 이미지 갤러리 표시
- [ ] 이미지 클릭 확대 (라이트박스)
- [ ] 반응형 이미지 레이아웃

### 5단계: 최적화 및 개선
- [ ] 이미지 지연 로딩 (lazy loading)
- [ ] WebP 형식 지원
- [ ] 압축 최적화

## 6. UI/UX 설계

### 드래그앤드롭 업로드
```tsx
<div
  className="border-dashed border-2 border-gray-300 p-8"
  onDrop={handleDrop}
  onDragOver={handleDragOver}
>
  <div className="text-center">
    <Upload className="mx-auto h-8 w-8 text-gray-400" />
    <p>이미지를 드래그하거나 클릭하여 업로드</p>
    <p className="text-sm text-gray-500">
      JPG, PNG, GIF, WebP • 최대 5MB • 최대 5장
    </p>
  </div>
  <input
    type="file"
    multiple
    accept="image/*"
    onChange={handleFileSelect}
    className="hidden"
  />
</div>
```

### 이미지 미리보기 카드
```tsx
<div className="relative group">
  <img
    src={previewUrl}
    alt="업로드 이미지"
    className="w-20 h-20 object-cover rounded"
  />
  <Button
    size="icon"
    variant="destructive"
    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100"
    onClick={() => removeImage(index)}
  >
    <X className="h-4 w-4" />
  </Button>
  {uploading && (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <Progress value={progress} className="w-12" />
    </div>
  )}
</div>
```

### 질문 상세 이미지 갤러리
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
  {question.image_urls?.map((url, index) => (
    <img
      key={index}
      src={url}
      alt={`첨부 이미지 ${index + 1}`}
      className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-90"
      onClick={() => openLightbox(index)}
    />
  ))}
</div>
```

## 7. Storage 정책 및 보안

### RLS 정책
```sql
-- 승인된 사용자만 이미지 업로드
CREATE POLICY "Approved users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'questions' AND
    is_approved_user()
  );

-- 본인 이미지만 삭제 가능
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'questions' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 이미지 최적화
```typescript
// 클라이언트사이드 이미지 압축 (선택적)
const compressImage = (file: File, maxWidth = 1920, quality = 0.8) => {
  return new Promise<File>((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    
    img.src = URL.createObjectURL(file);
  });
};
```

## 8. 성능 고려사항

### 이미지 로딩 최적화
- Lazy loading으로 뷰포트 진입 시 로딩
- WebP 형식 우선 제공, JPEG 폴백
- 썸네일 크기별 다중 해상도 지원

### 업로드 성능
- 병렬 업로드로 속도 개선
- 실패 시 자동 재시도 (최대 3회)
- 업로드 취소 기능 제공

### 저장소 관리
- 주기적인 미사용 이미지 정리
- 이미지 용량 모니터링
- CDN 연동 고려