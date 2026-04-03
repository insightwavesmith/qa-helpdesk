export async function brickFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  // API Key 헤더 불필요 — httpOnly 쿠키가 자동 전송됨

  return fetch(`/api/brick${path}`, {
    ...options,
    headers,
    credentials: 'include',  // 세션 쿠키 포함
  });
}

/**
 * 대시보드 로그인.
 * 성공 시 brick_session 쿠키가 Set-Cookie로 설정됨.
 */
export async function brickLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/brick/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  return res.json();
}

export async function brickLogout(): Promise<void> {
  await fetch('/api/brick/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
