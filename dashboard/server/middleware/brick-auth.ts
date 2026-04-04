import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const BRICK_API_KEY = process.env.BRICK_API_KEY || '';
const BRICK_SESSION_SECRET = process.env.BRICK_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const BRICK_DASHBOARD_PASSWORD = process.env.BRICK_DASHBOARD_PASSWORD || '';

// 세션 토큰 저장소 (인메모리 — 서버 재시작 시 재로그인)
const activeSessions = new Map<string, { createdAt: number }>();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24시간

/**
 * 세션 토큰 생성.
 */
function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 세션 유효성 검증.
 */
function isValidSession(token: string): boolean {
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * 로그인 엔드포인트 등록.
 * POST /api/brick/auth/login { password: string }
 * → Set-Cookie: brick_session=<token>
 */
export function registerBrickAuthRoutes(app: import('express').Application): void {
  app.post('/api/brick/auth/login', (req: Request, res: Response) => {
    const { password } = req.body;

    if (!BRICK_DASHBOARD_PASSWORD) {
      // 비밀번호 미설정 → 개발 모드 자동 로그인
      const token = createSessionToken();
      activeSessions.set(token, { createdAt: Date.now() });
      res.cookie('brick_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: SESSION_TTL,
      });
      return res.json({ ok: true, mode: 'development' });
    }

    if (password !== BRICK_DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: '비밀번호 불일치' });
    }

    const token = createSessionToken();
    activeSessions.set(token, { createdAt: Date.now() });
    res.cookie('brick_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_TTL,
    });
    res.json({ ok: true });
  });

  app.post('/api/brick/auth/logout', (req: Request, res: Response) => {
    const token = req.cookies?.brick_session;
    if (token) activeSessions.delete(token);
    res.clearCookie('brick_session');
    res.json({ ok: true });
  });
}

/**
 * Brick API 인증 미들웨어.
 *
 * 인증 경로 2가지:
 * 1. 브라우저: Cookie brick_session (프론트엔드 → Express)
 * 2. 서버간: X-Brick-API-Key 헤더 (bridge.ts → Python, 외부 호출)
 *
 * 예외:
 * - GET /api/brick/engine/health (헬스체크)
 * - POST /api/brick/auth/* (로그인/로그아웃)
 */
export function requireBrickAuth(req: Request, res: Response, next: NextFunction): void {
  // 예외 경로
  if (req.path === '/api/brick/engine/health' && req.method === 'GET') {
    return next();
  }
  if (req.path.startsWith('/api/brick/auth/')) {
    return next();
  }

  // 경로 1: 세션 쿠키 (브라우저)
  const sessionToken = req.cookies?.brick_session;
  if (sessionToken && isValidSession(sessionToken)) {
    return next();
  }

  // 경로 2: API Key (서버간)
  if (BRICK_API_KEY) {
    const headerKey = req.headers['x-brick-api-key'] as string | undefined;
    const authHeader = req.headers['authorization'] as string | undefined;
    const apiKey = headerKey
      || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '');
    if (apiKey === BRICK_API_KEY) {
      return next();
    }
  }

  // 개발 모드 폴백: 키+비밀번호 둘 다 미설정
  if (!BRICK_API_KEY && !BRICK_DASHBOARD_PASSWORD && process.env.NODE_ENV === 'development') {
    console.warn('[brick-auth] 인증 미설정 — 개발 모드 통과');
    return next();
  }

  res.status(401).json({ error: '인증 실패: 로그인하거나 유효한 API Key를 제공하세요' });
}

/**
 * Brick 거버넌스 API 인증 미들웨어.
 * 승인/리뷰/override 시 approver/reviewer/overrider 식별 필수.
 */
export function requireApprover(req: Request, res: Response, next: NextFunction): void {
  const { approver, reviewer, overrider } = req.body || {};
  const identity = approver || reviewer || overrider;
  if (!identity || typeof identity !== 'string' || identity.trim() === '') {
    res.status(401).json({ error: '승인자/리뷰어 식별 필수 (approver 또는 reviewer 파라미터)' });
    return;
  }
  next();
}

// 테스트용 export
export { activeSessions, SESSION_TTL };
