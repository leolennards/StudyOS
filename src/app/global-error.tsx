"use client";

/**
 * Replaces the root layout when it fails, so the router and providers may be
 * unavailable. It uses a plain anchor and inline styles deliberately: a full
 * page load is the recovery, and the stylesheet may not have loaded.
 */
/* eslint-disable @next/next/no-html-link-for-pages */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 .5rem" }}>StudyOS couldn&apos;t load</h1>
          <p style={{ color: "#555", margin: "0 0 1.5rem" }}>Reload the page to try again.</p>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "#4f46e5",
              color: "#fff",
              padding: ".6rem 1rem",
              borderRadius: ".5rem",
              textDecoration: "none",
            }}
          >
            Reload StudyOS
          </a>
          {error.digest && (
            <p style={{ color: "#888", fontSize: ".75rem", marginTop: "1.5rem" }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
