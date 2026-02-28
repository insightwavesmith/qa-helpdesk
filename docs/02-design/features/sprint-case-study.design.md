# 피드백반 스프린트 데이터 → case_study 설계서

## 1. 데이터 모델

### 입력 (source_type="notion", 135건)
- 스프린트 기준 문서 (12건): title `{이름} - Sprint {N}`
- 개선과제 to-do#1 (75건): title `개선과제(to-do#1) - {과제명}`, body_md에 `담당: {영문이름}`
- 이벤트/리뷰 to-do#2 (38건): title `이벤트&리뷰(to-do#2) - {과제명}`
- 몰입노트 (10건): 개인 귀속 어려움 → 별도 처리 제외

### 출력 (source_type="case_study", ~12건)
```json
{
  "title": "{이름} Sprint {N} — 자사몰 전환율 개선 실전 사례",
  "body_md": "병합된 마크다운",
  "type": "case_study",
  "source_type": "case_study",
  "source_ref": "notion-sprint-{이름}-{N}",
  "category": "meta_ads",
  "status": "draft",
  "embedding_status": "pending"
}
```

### 담당자 영문→한글 매핑
| 영문 | 한글 |
|------|------|
| yoobeom heo | 허유범 |
| yonghyup sung | 성용협 |
| minkyu lee | 이민규 |
| minkyu jung | 정민규 |
| myungseok hyun | 현명석 |
| hyunseok seo | 서현석 |

## 2. 병합 마크다운 구조

```markdown
# {이름} Sprint {N} 실전 사례
> 기간: YYYY-MM-DD ~ YYYY-MM-DD

## 스프린트 목표
{Sprint 문서 body_md}

## 개선과제 (to-do#1)
### {과제명}
- 상태: 완료/진행중
- 기간: {기간}
{과제 상세 내용}

## 이벤트/리뷰 과제 (to-do#2)
### {과제명}
...
```

## 3. 코드 변경

### embed-pipeline.ts
- `getPriority()` switch: `case "case_study": return 1` 추가

### contents.ts
- `autoEmbedTypes` 배열에 `"case_study"` 추가

### scripts/migrate-notion-to-case-study.mjs
- Supabase REST API로 직접 접근 (embed-notion.mjs 패턴)
- `--dry-run` 플래그 지원
- 실행 순서: INSERT → 성공 확인 → 기존 notion 삭제

## 4. 에러 처리
- INSERT 실패 시 기존 데이터 삭제 건너뜀
- 담당자 미매핑 문서는 경고 출력 후 제외
- 스프린트 미매핑 to-do는 Sprint 1로 기본 배정

## 5. 구현 순서
- [x] embed-pipeline.ts 수정 (1줄)
- [x] contents.ts 수정 (1줄)
- [x] migrate-notion-to-case-study.mjs 작성
- [ ] --dry-run 실행 검증
- [ ] 실제 실행
- [ ] npm run build 확인
