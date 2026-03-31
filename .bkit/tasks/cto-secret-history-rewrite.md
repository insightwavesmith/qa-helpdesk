# TASK: git 히스토리에서 슬랙 봇토큰 제거

## 배경
커밋 973688b에서 `.bkit/hooks/pdca-chain-handoff.sh` 파일에 슬랙 봇토큰이 하드코딩됨.
코드 수정(35b99bc)은 완료됐지만 git 히스토리에 토큰값이 남아있음.

노출된 토큰: `xoxb-6381574326117-10003218702306-UaJ5htlQVIPgFKlYpkpVMzoQ`
노출 파일: `.bkit/hooks/pdca-chain-handoff.sh`
노출 커밋: 973688b

## 목표
git 히스토리에서 해당 토큰 값을 제거하고 origin/main에 force push

## 수행 방법
`git filter-repo` 사용 (brew install git-filter-repo 로 설치 가능)

```bash
# 프로젝트 루트에서 실행
cd /Users/smith/projects/bscamp

# 토큰 값을 placeholder로 교체
git filter-repo --replace-text <(echo "xoxb-6381574326117-10003218702306-UaJ5htlQVIPgFKlYpkpVMzoQ==>REMOVED_SLACK_TOKEN")

# remote 재설정 (filter-repo가 제거함)
git remote add origin https://github.com/insightwavesmith/qa-helpdesk.git

# force push
git push --force origin main
```

## 주의
- force push이므로 팀원 있으면 사전 공지 (현재 단독 운영이라 OK)
- push 후 GitHub secret scanning에서 resolved 확인
- .env.local의 실제 토큰값은 유지 (코드에서만 제거)

## 완료 기준
- git log -S "xoxb-6381574326117" --oneline 결과 없음
- git push origin main 성공 (push 차단 없음)

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
