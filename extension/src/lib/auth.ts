import type { StoredSession } from "./types";

const STORAGE_KEY = "bscamp_session";

/**
 * bscamp 서버에 로그인 요청 후 세션을 chrome.storage.local에 저장
 */
export async function login(
  serverUrl: string,
  email: string,
  password: string,
): Promise<StoredSession> {
  const normalizedUrl = serverUrl.replace(/\/$/, "");

  let response: Response;
  try {
    response = await fetch(`${normalizedUrl}/api/ext/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. URL을 확인해 주세요.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    throw new Error(`로그인 실패 (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    refreshToken?: string;
  };

  const accessToken = data.access_token ?? data.accessToken ?? "";
  const refreshToken = data.refresh_token ?? data.refreshToken ?? "";

  if (!accessToken) {
    throw new Error("서버 응답에서 토큰을 찾을 수 없습니다.");
  }

  const session: StoredSession = {
    accessToken,
    refreshToken,
    email,
    serverUrl: normalizedUrl,
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  return session;
}

/**
 * 저장된 세션을 삭제하여 로그아웃 처리
 */
export async function logout(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * chrome.storage.local에서 세션 반환
 */
export async function getSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const session = result[STORAGE_KEY] as StoredSession | undefined;
  return session ?? null;
}

/**
 * 로그인 여부 확인
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.accessToken.length > 0;
}
