"""인증 API 라우트 — 로그인/로그아웃/사용자 관리."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from brick.auth.middleware import authenticate_request, require_role_dep
from brick.auth.models import BrickUser
from brick.auth.session import create_session, destroy_session
from brick.auth.users import authenticate_user, create_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request models ──

class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "viewer"
    workspace_id: int = 1


class GoogleLoginRequest(BaseModel):
    credential: str  # Google ID token


# ── 엔드포인트 ──

@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    """로그인 → 세션 쿠키 발급."""
    user = authenticate_user(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="인증 실패")
    ip = request.client.host if request.client else None
    token = create_session(user.id, user.workspace_id, ip)
    response.set_cookie(
        key="brick_session",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {"ok": True, "user": {"id": user.id, "username": user.username, "role": user.role}}


@router.post("/google")
async def google_login(body: GoogleLoginRequest, request: Request, response: Response):
    """Google Sign-In → 세션 생성."""
    from brick.auth.google import verify_google_id_token
    from brick.auth.db import get_db

    payload = await verify_google_id_token(body.credential)

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()

    if row is None:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        role = "admin" if count == 0 else "viewer"
        is_approved = 1 if count == 0 else 0
        conn.execute(
            "INSERT INTO users (username, display_name, password_hash, email, provider, "
            "avatar_url, role, is_approved, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (payload.email, payload.name or payload.email, "google-oauth",
             payload.email, "google", payload.picture, role, is_approved, 1),
        )
        conn.commit()
        if is_approved == 0:
            raise HTTPException(status_code=403, detail="관리자 승인 대기")
        row = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()
    else:
        if dict(row).get("is_approved") == 0:
            raise HTTPException(status_code=403, detail="관리자 승인 대기")

    ip = request.client.host if request.client else None
    token = create_session(row["id"], row["workspace_id"], ip)
    response.set_cookie(
        key="brick_session", value=token,
        httponly=True, samesite="lax", max_age=7 * 24 * 3600,
    )
    return {"ok": True, "user": {"id": row["id"], "email": row["email"], "role": row["role"]}}


@router.post("/logout")
async def logout(request: Request, response: Response):
    """로그아웃 → 세션 쿠키 삭제."""
    token = request.cookies.get("brick_session")
    if token:
        destroy_session(token)
    response.delete_cookie("brick_session")
    return {"ok": True}


@router.get("/me")
async def me(user: BrickUser = Depends(authenticate_request)):
    """현재 인증된 사용자 정보."""
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "workspace_id": user.workspace_id,
    }


@router.post("/users")
async def create_user_endpoint(
    body: CreateUserRequest,
    user: BrickUser = Depends(require_role_dep("admin")),
):
    """사용자 생성 (admin 전용)."""
    new_user = create_user(
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        role=body.role,
        workspace_id=body.workspace_id,
    )
    return {"ok": True, "user": {"id": new_user.id, "username": new_user.username, "role": new_user.role}}
