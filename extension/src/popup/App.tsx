import { useState, useEffect } from "react";
import { login, logout, getSession } from "../lib/auth";
import type { StoredSession } from "../lib/types";

type EditorStatus = {
  isEditor: boolean;
  isBlog: boolean;
  isCafe: boolean;
  url?: string;
} | null;

export default function App() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorStatus, setEditorStatus] = useState<EditorStatus>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  // 에디터 상태 확인 — 로그인 여부와 무관하게 항상 실행
  useEffect(() => {
    if (loading) return;
    chrome.runtime.sendMessage({ type: "CHECK_EDITOR" }, (response) => {
      if (response?.success) {
        setEditorStatus(response.data as EditorStatus);
      }
    });
  }, [loading]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* 헤더 */}
      <div className="header">
        <div className="logo">
          <span className="logo-icon">{"\u{1F3EB}"}</span>
          <div>
            <h1 className="logo-title">자사몰사관학교</h1>
            <p className="logo-subtitle">블로그 도우미</p>
          </div>
        </div>
      </div>

      {/* 현재 탭 상태 — 항상 표시 */}
      <div className="dashboard">
        <EditorStatusCard editorStatus={editorStatus} />

        {/* 기본 기능 안내 */}
        <div className="feature-card">
          <p className="feature-title">기본 진단 (로그인 불필요)</p>
          <ul className="feature-list">
            <li>{"\u{2705}"} 글자 수 실시간 카운트</li>
            <li>{"\u{2705}"} 이미지 수 체크</li>
            <li>{"\u{2705}"} 키워드 반복 횟수</li>
            <li>{"\u{2705}"} 문단 길이 분석</li>
          </ul>
        </div>

        {/* 로그인 연동 기능 */}
        {session ? (
          <LoggedInCard session={session} onLogout={() => setSession(null)} />
        ) : (
          <div className="feature-card">
            <p className="feature-title">bscamp 연동 (로그인 시 활성화)</p>
            <ul className="feature-list feature-list-locked">
              <li>{"\u{1F512}"} 금칙어 실시간 체크</li>
              <li>{"\u{1F512}"} 비속어 자동 검출</li>
              <li>{"\u{1F512}"} TOP3 벤치마크 비교</li>
              <li>{"\u{1F512}"} 멀티채널 발행</li>
            </ul>
            <button
              className="btn-toggle-login"
              onClick={() => setShowLogin(!showLogin)}
            >
              {showLogin ? "접기" : "로그인하여 활성화"}
            </button>
            {showLogin && (
              <LoginForm onLogin={(s) => { setSession(s); setShowLogin(false); }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditorStatusCard({ editorStatus }: { editorStatus: EditorStatus }) {
  if (!editorStatus) {
    return (
      <div className="status-card">
        <p className="status-label">현재 탭 상태</p>
        <span className="badge badge-inactive">확인 중...</span>
      </div>
    );
  }

  if (editorStatus.isEditor) {
    const label = editorStatus.isBlog ? "블로그 에디터" : "카페 에디터";
    return (
      <div className="status-card">
        <p className="status-label">현재 탭 상태</p>
        <span className="badge badge-active">{label} 감지됨</span>
        <p className="status-hint">에디터 우측에 진단 패널이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="status-card">
      <p className="status-label">현재 탭 상태</p>
      <span className="badge badge-inactive">에디터 아님</span>
      <p className="status-hint">네이버 블로그/카페 글쓰기 페이지에서 자동으로 진단 패널이 표시됩니다.</p>
    </div>
  );
}

function LoggedInCard({
  session,
  onLogout,
}: {
  session: StoredSession;
  onLogout: () => void;
}) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <div className="feature-card">
      <p className="feature-title">bscamp 연동 활성화됨</p>
      <div className="logged-in-info">
        <p className="logged-in-email">{session.email}</p>
        <p className="logged-in-server">{session.serverUrl}</p>
      </div>
      <ul className="feature-list">
        <li>{"\u{2705}"} 금칙어 실시간 체크</li>
        <li>{"\u{2705}"} 비속어 자동 검출</li>
        <li>{"\u{2705}"} TOP3 벤치마크 비교</li>
        <li>{"\u{2705}"} 멀티채널 발행</li>
      </ul>
      <button className="btn-logout" onClick={handleLogout}>
        로그아웃
      </button>
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (session: StoredSession) => void }) {
  const [serverUrl, setServerUrl] = useState("https://bscamp.kr");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const session = await login(serverUrl, email, password);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-form-inline" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label" htmlFor="server-url">서버 URL</label>
        <input
          id="server-url"
          className="input"
          type="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://bscamp.kr"
          required
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="email">이메일</label>
        <input
          id="email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일을 입력하세요"
          required
          autoComplete="email"
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="password">비밀번호</label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호를 입력하세요"
          required
          autoComplete="current-password"
        />
      </div>
      {error && <p className="error-message">{error}</p>}
      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
