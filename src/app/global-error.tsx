"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h2>오류가 발생했습니다</h2>
        <p style={{ color: "red" }}>{error.message}</p>
        {error.digest && (
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            Digest: {error.digest}
          </p>
        )}
        <pre
          style={{
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: "8px",
            overflow: "auto",
            fontSize: "0.75rem",
            maxHeight: "300px",
          }}
        >
          {error.stack}
        </pre>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
