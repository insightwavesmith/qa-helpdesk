# 개인정보처리방침 필수동의 — 설계서

## 1. 데이터 모델

### profiles 테이블 컬럼 추가
```sql
ALTER TABLE profiles ADD COLUMN privacy_agreed_at TIMESTAMPTZ DEFAULT NULL;
```
- 기존 유저: NULL (영향 없음)
- 신규 유저: 가입 시 `NOW()` 저장

## 2. API 설계

### Server Action: `savePrivacyConsent`
- **파일**: `src/actions/auth.ts`
- **시그니처**: `savePrivacyConsent(userId: string): Promise<{ error: string | null }>`
- **로직**: `createServiceClient()` → `profiles.update({ privacy_agreed_at: new Date().toISOString() }).eq("id", userId)`
- **호출 시점**: 회원가입 성공 직후 (authData.user 확보 후)

## 3. 컴포넌트 구조

### T1: 체크박스 (signup/page.tsx)
```
위치: 가입 버튼 바로 위 (사업자등록증 업로드와 가입 버튼 사이)
```

#### 상태 추가
```typescript
const [privacyAgreed, setPrivacyAgreed] = useState(false);
```

#### isFormValid 수정
```typescript
// 기존 조건 끝에 추가
&& privacyAgreed
```

#### UI
```tsx
<div className="flex items-start gap-2">
  <input
    type="checkbox"
    id="privacyAgreed"
    checked={privacyAgreed}
    onChange={(e) => setPrivacyAgreed(e.target.checked)}
    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#F75D5D] focus:ring-[#F75D5D]"
  />
  <label htmlFor="privacyAgreed" className="text-sm text-[#374151]">
    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#F75D5D] hover:underline font-medium">
      개인정보처리방침
    </a>
    에 동의합니다 (필수)
  </label>
</div>
```

### T2: /privacy 페이지 보강
- 기존 8개 섹션 구조 유지, 내용 보강
- TASK에 명시된 항목 반영:
  1. 수집하는 개인정보: 이메일, 이름, 비밀번호
  2. 이용 목적: 서비스 제공, 수강 관리, 콘텐츠 추천
  3. 보유 기간: 회원 탈퇴 시까지
  4. 제3자 제공: Meta 광고 라이브러리 API 연동 (SearchAPI.io 경유, 개인정보 전송 없음)
  5. 수집하는 이용 데이터: 검색 기록, 콘텐츠 열람 기록, 광고 분석 기록
  6. 동의 철회: 회원 탈퇴로 가능
  7. 문의: 서비스 관리자 연락처

### T3: 동의 기록 저장 흐름
```
사용자 체크 → 가입 버튼 클릭 → signUp 성공 → savePrivacyConsent(user.id) 호출
→ 실패해도 가입은 완료 (try-catch, console.error만)
```

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| 체크박스 미체크 | 가입 버튼 disabled (폼 레벨) |
| savePrivacyConsent 실패 | console.error, 가입 플로우 정상 진행 |
| DB 컬럼 추가 실패 | 마이그레이션 재실행 |

## 5. 구현 순서
- [x] 1. Plan 문서 작성
- [x] 2. Design 문서 작성
- [ ] 3. DB 마이그레이션 SQL 작성 (profiles.privacy_agreed_at)
- [ ] 4. T1: signup/page.tsx 체크박스 + isFormValid 수정
- [ ] 5. T3: auth.ts savePrivacyConsent 서버 액션 추가
- [ ] 6. T1+T3: signup/page.tsx에서 savePrivacyConsent 호출
- [ ] 7. T2: privacy/page.tsx 내용 보강
- [ ] 8. database.ts 타입 업데이트
- [ ] 9. tsc + lint + build 검증
