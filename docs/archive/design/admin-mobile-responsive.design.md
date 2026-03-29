# 관리자 페이지 모바일 반응형 최적화 — Design

## 1. 변경 범위
Tailwind CSS 반응형 클래스만 조정. 기능/로직 변경 없음.

## 2. 공통 패턴

### 2.1 페이지 제목
```
기존: text-2xl
변경: text-lg md:text-2xl
```

### 2.2 테이블 → 모바일 카드 변환
```tsx
{/* 데스크탑: 기존 테이블 유지 */}
<div className="hidden md:block">
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
    <Table>...</Table>
  </div>
</div>

{/* 모바일: 카드 리스트 */}
<div className="md:hidden space-y-3">
  {items.map(item => (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      {/* 핵심 정보 상단 */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{item.name}</span>
        <Badge>...</Badge>
      </div>
      {/* 부가 정보 */}
      <div className="text-sm text-gray-500">...</div>
      {/* 액션 버튼 */}
      <div className="flex gap-2 pt-1">...</div>
    </div>
  ))}
</div>
```

### 2.3 Stat 카드 그리드
```
기존: grid-cols-4 / grid-cols-3
변경: grid-cols-2 md:grid-cols-3 lg:grid-cols-4
```

### 2.4 필터/액션 바
```
기존: flex items-center gap-3
변경: flex flex-wrap items-center gap-2 md:gap-3
```

### 2.5 폼 그리드
```
기존: grid-cols-2 또는 grid-cols-3
변경: grid-cols-1 sm:grid-cols-2 또는 grid-cols-1 sm:grid-cols-3
```

## 3. 페이지별 설계

### 3.1 members-client.tsx (P1)
- 9컬럼 테이블 → `hidden md:block` + 모바일 카드
- 모바일 카드 표시 정보: 이름, 역할 Badge, 이메일, 쇼핑몰, 기수, 가입일
- 액션 버튼: 멤버 승인 / 수강생 승인 (lead일 때), 수강생 전환 (member일 때)
- 카드 클릭 → handleOpenDetail 유지
- 필터/탭: flex-wrap 추가

### 3.2 accounts-client.tsx (P1)
- 5컬럼 테이블 → `hidden md:block` + 모바일 카드
- 모바일 카드: 계정명, 계정ID(font-mono), 배정된 수강생 Badge, 상태 Badge
- 액션: 배정/해제 버튼
- 상단 info + 추가 버튼: flex-wrap

### 3.3 performance-client.tsx (P1)
- stat 카드 그리드: `grid-cols-2 sm:grid-cols-3` (동적이므로 lg도 조정)
- stat 카드 value 폰트: `text-2xl md:text-[32px]`
- 필터: `flex flex-wrap items-center gap-2 md:gap-3`
- 9컬럼 테이블 → `hidden md:block` + 모바일 카드
- 모바일 카드: 이름, 기수, ROAS Badge, 등급 Badge, 광고비, 광고매출

### 3.4 answers-review-client.tsx (P1)
- 이미 Card 기반이라 테이블 변환 불필요
- CardHeader: 날짜와 Badge를 flex-wrap
- 버튼 그룹: `flex flex-wrap gap-2`

### 3.5 content/page.tsx (P2)
- stat 카드: `grid-cols-2 md:grid-cols-4`
- 필터 3개: `flex flex-wrap gap-2 md:gap-3`
- 콘텐츠 테이블: `hidden md:block` + 모바일 카드
- TabsList: overflow-x-auto

### 3.6 email/page.tsx (P2)
- 수신자 카드: `grid-cols-1 sm:grid-cols-3`
- 폼 필드: 이미 단일 컬럼
- 웨비나 그리드: `grid-cols-1 sm:grid-cols-2`
- 성과 그리드: `grid-cols-1 sm:grid-cols-3`
- 발송이력 테이블: `hidden md:block` + 모바일 카드
- 버튼: `flex flex-col sm:flex-row gap-2`

### 3.7 invites/page.tsx (P2)
- 생성폼 그리드: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- 테이블 → `hidden md:block` + 모바일 카드
- 모바일 카드: 코드(font-mono), 기수, 사용량, 만료일, 상태 Badge, 액션

### 3.8 reviews/page.tsx (P2)
- 컨테이너: `max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-8`
- 9컬럼 테이블 → `hidden md:block` + 모바일 카드
- 모바일 카드: 제목(+YouTube아이콘), 작성자, 기수, 카테고리, 별점, 베스트/고정/삭제 아이콘

### 3.9 protractor/page.tsx (P3)
- 제목: `text-lg md:text-2xl`
- 하위 컴포넌트는 별도 처리 필요하면 추후

### 3.10 knowledge/page.tsx (P3)
- stat 카드: `grid-cols-2 md:grid-cols-4`
- AI 호출 테이블: overflow-x-auto 이미 있음, 확인만

### 3.11 owner-accounts-client.tsx (P3)
- 읽어서 확인 후 테이블 있으면 카드 변환

### 3.12 stats/page.tsx (P3)
- 이미 `sm:grid-cols-2 lg:grid-cols-3` → 양호, 확인만

### 3.13 organic/page.tsx (P3)
- 제목만 반응형 조정

## 4. 에러 처리
해당 없음 (CSS만 변경)

## 5. 구현 순서
1. [P1] members, accounts, performance, answers — 병렬
2. [P2] content, email, invites, reviews — 병렬
3. [P3] protractor, knowledge, owner-accounts, stats, organic — 병렬
4. tsc + build 검증
