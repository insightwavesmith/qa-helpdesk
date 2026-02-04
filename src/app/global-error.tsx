"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h2>오류가 발생했습니다</h2>
        <p style={{ color: "red" }}>{error?.message || "알 수 없는 오류"}</p>
        {error?.digest && (
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            Digest: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f5f5f5",
          }}
        >
          다시 시도
        </button>
        <button
          onClick={() => (window.location.href = "/login")}
          style={{
            marginTop: "1rem",
            marginLeft: "0.5rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f5f5f5",
          }}
        >
          로그인으로 이동
        </button>
      </body>
    </html>
  );
}
