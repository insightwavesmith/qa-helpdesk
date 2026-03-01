# 버그수정: 자동완성 방지 + 시크릿키 마스킹 Gap 분석

## Match Rate: 100%

## 일치 항목

### T1. member-detail-modal.tsx — 자동완성 방지
| 설계 항목 | 구현 상태 | 일치 |
|-----------|-----------|------|
| 수정폼 4개 input에 name + autoComplete | name/autoComplete 추가 완료 | O |
| 추가폼 5개 input에 name + autoComplete | name/autoComplete 추가 완료 | O |
| password 필드 autoComplete="new-password" | 적용 완료 | O |
| text 필드 autoComplete="off" | 적용 완료 | O |
| 기존 로직 미변경 | onChange, className 등 유지 | O |

### T2. onboarding/page.tsx — 시크릿키 마스킹
| 설계 항목 | 구현 상태 | 일치 |
|-----------|-----------|------|
| Eye, EyeOff import | 추가 완료 | O |
| showSecretKey state | useState(false) 추가 | O |
| type="text" → password | type={showSecretKey ? "text" : "password"} | O |
| Eye 토글 버튼 | relative div + absolute button 패턴 | O |
| settings-form.tsx 동일 패턴 | Eye/EyeOff 아이콘 + pr-10 공간 | O |

## 불일치 항목
없음.

## npm run build
성공.

## 수정 필요
없음.
