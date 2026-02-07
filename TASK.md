# TASK: 이메일 AI 자동작성 기능

> 설계 문서: docs/02-design/P1-email-ai-write.md 참조
> 디자인: Primary #F75D5D, hover #E54949, Pretendard, shadcn/ui

## 요약
이메일 발송 페이지에서 "AI 작성" 버튼 → 카테고리/주제 선택 → AI가 뉴스레터 초안 생성 → TipTap 에디터에 삽입

## 만들 파일

### 1. AI 작성 다이얼로그 (신규)
`src/components/email/ai-write-dialog.tsx`
- shadcn Dialog 사용
- 카테고리 드롭다운: blueprint / trend / webinar / tips / custom
- 주제 텍스트 입력 (선택)
- 톤 선택: educational / casual / urgent
- "생성하기" 버튼 → POST /api/admin/email/ai-write 호출
- 로딩 상태 표시 (스피너)
- 성공 시 콜백으로 HTML 전달 → 부모가 에디터에 삽입

### 2. API 엔드포인트 (신규)
`src/app/api/admin/email/ai-write/route.ts`
- POST 핸들러
- request body: { category, topic?, tone, template }
- 콘텐츠 소스 파일 읽기 (카테고리별 매핑)
- 프롬프트 조합 → LLM API 호출은 하지 않음!
- **대신**: 콘텐츠 소스에서 직접 HTML 뉴스레터를 조합
  - 카테고리별 소스 파일을 읽고
  - 구조화된 뉴스레터 HTML 템플릿에 내용 삽입
  - 제목(subject) + 본문(content) + 참조소스(sources) 반환
- **주의**: 외부 AI API 호출 없음. 파일 기반 조합으로 구현

### 소스 파일 경로 (서버에서 읽을 수 있는 경로)
콘텐츠 소스 파일들은 다음 경로에 있음:
```
/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/claude/brand-school/marketing/knowledge/
  blueprint/
    01-getting-started/  (campaign-objectives.md, ads-manager-structure.md, advantage-plus-shopping.md)
    02-targeting/        (audience-targeting.md)
    03-optimization/     (pixel-and-capi.md, advantage-plus-shopping.md)
    04-measurement/      (measurement-methodology.md)
    05-creative/         (creative-best-practices.md)
  blogs/
    2026-02-flighted-meta-best-practices.md
    2026-02-anchour-meta-2026-playbook.md
```

### 콘텐츠 조합 로직
1. 카테고리에 맞는 .md 파일들을 읽음
2. 각 파일에서 핵심 섹션 추출 (## 헤더 기준)
3. 뉴스레터 HTML 템플릿에 삽입:
   - 인사말
   - 메인 콘텐츠 (소스에서 추출)
   - CTA (총가치각도기 사용, Q&A 질문 등)
   - 푸터
4. topic이 있으면 해당 주제 관련 섹션만 필터링

### 3. TipTap 에디터 수정
`src/components/email/tiptap-editor.tsx`
- 툴바에 "AI 작성" 버튼 추가 (Sparkles 아이콘)
- 클릭 시 ai-write-dialog 열림
- 다이얼로그에서 생성 완료 → editor.commands.setContent(html)로 삽입

### 4. 이메일 페이지 수정
`src/app/(main)/admin/email/page.tsx`
- AI 작성 결과에서 subject도 받아서 제목 필드에 자동 채우기

## 뉴스레터 HTML 템플릿 구조
```html
<h2>{제목}</h2>
<p>안녕하세요, 자사몰사관학교입니다.</p>
<p>{인트로 - 1~2문장}</p>

<h3>{섹션1 제목}</h3>
<p>{섹션1 내용}</p>
<ul>
  <li>{포인트1}</li>
  <li>{포인트2}</li>
  <li>{포인트3}</li>
</ul>

<h3>{섹션2 제목}</h3>
<p>{섹션2 내용}</p>

<hr />
<p><strong>총가치각도기로 내 광고 성과를 확인해보세요</strong></p>
<p>궁금한 점은 Q&A 게시판에 남겨주세요.</p>
```

## 작업 순서
1. content-sources 유틸 (소스 파일 읽기)
2. /api/admin/email/ai-write API
3. ai-write-dialog.tsx UI
4. tiptap-editor.tsx 수정 (버튼 추가)
5. email page.tsx 수정 (제목 자동 채우기)
6. npm run build
7. git add -A && git commit -m "feat: 이메일 AI 자동작성" && git push
8. openclaw gateway wake --text "Done: 이메일 AI 자동작성 완료" --mode now

## 체크리스트
- [ ] AI 작성 버튼이 에디터 툴바에 보임
- [ ] 클릭 → 다이얼로그 열림
- [ ] 카테고리 선택 + 생성 → 에디터에 HTML 삽입
- [ ] 제목도 자동 채워짐
- [ ] 소스 파일을 못 읽어도 에러 안 남 (graceful fallback)
- [ ] npm run build 성공
- [ ] git push 완료
