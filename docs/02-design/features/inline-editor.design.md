# 인라인 편집기 설계서

## 1. 데이터 모델
- contents.body_md (마크다운 원본 — 정보공유)
- contents.email_summary (HTML — 뉴스레터)
- contents.status (draft/review/ready/published)

## 2. API 설계
- `PATCH /api/contents/[id]` → body_md, title, category, tags, status 업데이트
- `POST /api/contents/[id]/publish` → status=published + published_at 설정
- `POST /api/contents/[id]/upload` → 이미지 업로드 (Supabase Storage)

## 3. 컴포넌트 구조

### /posts/[id] (기존 PostDetailClient 확장)
```
PostDetailClient
├── PostHero (썸네일 이미지 + 제목)
├── PostToc (목차)
├── PostBody (본문 렌더링)
│   └── [admin 편집모드] InlineEditor
│       ├── MDXEditor (마크다운 네이티브 WYSIWYG)
│       │   ├── 테이블 지원
│       │   ├── 이미지 삽입/교체
│       │   ├── 코드 블록
│       │   └── 마크다운 포맷 완전 보존
│       └── 메타 편집 (제목/카테고리/태그)
├── PostRelated (관련 글)
├── NewsletterCta (구독 유도)
├── PublishBar (admin: 발행/발송/저장 버튼)
```

### 에디터 교체 (TipTap → MDXEditor)
| 항목 | TipTap (현재) | MDXEditor (교체) |
|------|---------------|------------------|
| 기반 | HTML ProseMirror | 마크다운 네이티브 |
| 테이블 | 확장 필요 | 기본 내장 |
| 포맷 보존 | HTML 변환 시 손실 | 마크다운 그대로 |
| 저장 | HTML → 마크다운 역변환 | 마크다운 직접 저장 |

## 4. 에러 처리
- 저장 실패 → 로컬 스토리지 백업 + 재시도
- 이미지 업로드 실패 → 토스트 알림
- published 글 편집 시 → 상태 유지 (draft로 변경 금지)

## 5. 구현 순서
1. [x] TipTap InlineEditor 초기 구현
2. [x] PostDetailClient에 편집 모드 통합
3. [x] PublishBar (발행/발송 버튼)
4. [ ] MDXEditor 교체
5. [ ] 테이블/인용문 포맷 보존 검증
6. [ ] published 상태 버그 수정
