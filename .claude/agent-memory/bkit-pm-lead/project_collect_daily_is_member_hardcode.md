---
name: collect-daily creatives is_member 하드코딩
description: collect-daily가 creatives UPSERT 시 is_member=true, source="member"를 하드코딩 — 비수강생 계정 소재도 member로 잘못 표시
type: project
---

`src/app/api/cron/collect-daily/route.ts` 182-183줄:
```
source: "member",
is_member: true,
```

**Why:** 비수강생 계정(discover-accounts가 is_member=false로 등록)의 소재도 creatives 테이블에 is_member=true로 들어감. 벤치마크에서 수강생/비수강생 구분이 안 됨.

**How to apply:** collect-daily 수정 시 ad_accounts.is_member 값을 조회해서 동적으로 설정해야 함. runCollectDaily 시작 시 isMemberMap을 만들어 collectAccount에 전달.
