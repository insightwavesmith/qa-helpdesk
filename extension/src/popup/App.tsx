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

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    chrome.runtime.sendMessage({ type: "CHECK_EDITOR" }, (response) => {
      if (response?.success) {
        setEditorStatus(response.data as EditorStatus);
      }
    });
  }, [session]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginForm onLogin={setSession} />;
  }

  return <Dashboard session={session} editorStatus={editorStatus} onLogout={() => setSession(null)} />;
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
    <div className="container">
      <div className="header">
        <div className="logo">
          <span className="logo-icon">🏫</span>
          <div>
            <h1 className="logo-title">자사몰사관학교</h1>
            <p className="logo-subtitle">블로그 도우미</p>
          </div>
        </div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="label" htmlFor="server-url">
            서버 URL
          </label>
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
          <label className="label" htmlFor="email">
            이메일
          </label>
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
          <label className="label" htmlFor="password">
            비밀번호
          </label>
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
    </div>
  );
}

function Dashboard({
  session,
  editorStatus,
  onLogout,
}: {
  session: StoredSession;
  editorStatus: EditorStatus;
  onLogout: () => void;
}) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  const statusBadge = () => {
    if (!editorStatus) return null;
    if (editorStatus.isEditor) {
      const label = editorStatus.isBlog ? "블로그 에디터" : "카페 에디터";
      return <span className="badge badge-active">{label} 감지됨</span>;
    }
    return <span className="badge badge-inactive">에디터 아님</span>;
  };

  return (
    <div className="container">
      <div className="header">
        <div className="logo">
          <span className="logo-icon">🏫</span>
          <div>
            <h1 className="logo-title">자사몰사관학교</h1>
            <p className="logo-subtitle">블로그 도우미</p>
          </div>
        </div>
      </div>

      <div className="dashboard">
        <div className="welcome-card">
          <p className="welcome-text">안녕하세요!</p>
          <p className="welcome-email">{session.email}</p>
        </div>

        <div className="status-card">
          <p className="status-label">현재 탭 상태</p>
          {statusBadge() ?? (
            <span className="badge badge-inactive">확인 중...</span>
          )}
          {editorStatus?.isEditor && (
            <p className="status-hint">
              에디터 우측에 진단 패널이 표시됩니다.
            </p>
          )}
        </div>

        <div className="server-info">
          <p className="server-label">연결된 서버</p>
          <p className="server-url">{session.serverUrl}</p>
        </div>
      </div>

      <button className="btn-logout" onClick={handleLogout}>
        로그아웃
      </button>
    </div>
  );
}
