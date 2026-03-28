# SEO 기초 인프라 설계서

## 1. 데이터 모델
- 기존 `organic_posts` 테이블 활용 (신규 테이블 없음)
- sitemap에서 `status='published'`인 게시물만 조회

## 2. API 설계

### GET /api/admin/gsc
- 인증: admin only (requireAdmin)
- 쿼리: startDate, endDate, dimensions (optional)
- 응답: `{ data: SearchAnalyticsRow[] }`
- 환경변수 미설정 시 빈 배열 반환

## 3. 컴포넌트 구조

### 신규 파일
| 파일 | 역할 |
|------|------|
| `src/app/sitemap.ts` | 동적 sitemap.xml 생성 |
| `src/app/robots.ts` | robots.txt 생성 |
| `src/components/seo/json-ld.tsx` | JSON-LD 구조화 데이터 |
| `src/lib/gsc.ts` | Google Search Console API 클라이언트 |
| `src/lib/naver-searchadvisor.ts` | 네이버 서치어드바이저 API 클라이언트 |
| `src/app/api/admin/gsc/route.ts` | GSC API 엔드포인트 |

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/layout.tsx` | metadata에 openGraph, twitter 추가 + JsonLd 컴포넌트 import |

## 4. 에러 처리
- GSC/서치어드바이저: 환경변수 미설정 → 빈 배열 반환 (에러 아님)
- sitemap: DB 조회 실패 → 정적 페이지만 포함
- API 인증 실패 → 401/403

## 5. 구현 순서
- [x] T1: sitemap.ts
- [x] T2: robots.ts
- [x] T3: layout.tsx OG 메타태그
- [x] T4: json-ld.tsx + layout.tsx 연결
- [x] T5: gsc.ts + API route
- [x] T6: naver-searchadvisor.ts
