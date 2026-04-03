/**
 * 유령 유저 복구 스크립트
 * Firebase Auth에 존재하지만 profiles 테이블에 row가 없는 유저를 찾아 프로필 생성
 *
 * 실행: dotenv -e .env.local npx tsx scripts/fix-ghost-users.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { getFirebaseAuth } from "../src/lib/firebase/admin";
import { getPool } from "../src/lib/db/pool";
import { toProfileId } from "../src/lib/firebase-uid-to-uuid";

async function fixGhostUsers() {
  const auth = getFirebaseAuth();
  const pool = getPool();

  // Firebase Auth 전체 유저 목록
  const listResult = await auth.listUsers(1000);
  const firebaseUsers = listResult.users;

  console.log(`Firebase Auth 유저 수: ${firebaseUsers.length}`);

  // profiles 테이블의 모든 id 조회
  const { rows: profiles } = await pool.query("SELECT id FROM profiles");
  const profileIds = new Set(profiles.map((r: { id: string }) => r.id));

  console.log(`profiles 테이블 row 수: ${profileIds.size}`);

  // 유령 유저 찾기: Firebase UID → toProfileId(uid) → profiles.id에 없으면 ghost
  const ghostUsers = firebaseUsers.filter((u) => !profileIds.has(toProfileId(u.uid)));

  console.log(`유령 유저 수: ${ghostUsers.length}`);

  if (ghostUsers.length === 0) {
    console.log("유령 유저 없음. 종료.");
    await pool.end();
    return;
  }

  // 복구: profiles INSERT
  for (const ghost of ghostUsers) {
    const profileId = toProfileId(ghost.uid);
    console.log(`복구 중: ${ghost.uid} → ${profileId} (${ghost.email})`);

    await pool.query(
      `INSERT INTO profiles (id, email, name, role, onboarding_status, onboarding_step)
       VALUES ($1, $2, $3, 'lead', 'not_started', 0)
       ON CONFLICT (id) DO NOTHING`,
      [profileId, ghost.email || "", ghost.displayName || ""]
    );
  }

  console.log(`복구 완료: ${ghostUsers.length}명`);
  await pool.end();
}

fixGhostUsers().catch((err) => {
  console.error("스크립트 실패:", err);
  process.exit(1);
});
