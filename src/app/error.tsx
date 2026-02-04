"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h2>페이지 오류</h2>
      <p style={{ color: "red" }}>{error?.message || "알 수 없는 오류"}</p>
      {error?.digest && (
        <p style={{ color: "#666", fontSize: "0.875rem" }}>
          Digest: {error.digest}
        </p>
      )}
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => reset()}
          style={{
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
            padding: "0.5rem 1rem",
            cursor: "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f5f5f5",
          }}
        >
          로그인으로 이동
        </button>
      </div>
    </div>
  );
}
