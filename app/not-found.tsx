export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div className="panel" style={{ maxWidth: 480, padding: 28, textAlign: "center" }}>
        <div className="eyebrow">Route not modeled</div>
        <h1>Underwriting record not found</h1>
        <p className="subtitle">Only the synthetic Atlas workflow is interactive in this prototype.</p>
        {/* A plain anchor deliberately avoids the hosted vinext prefetch runtime. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button primary" href="/deals" style={{ marginTop: 14, textDecoration: "none" }}>Return to active underwriting</a>
      </div>
    </main>
  );
}
