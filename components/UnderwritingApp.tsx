"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  atlasDeal,
  atlasDiligenceItems,
  atlasDocuments,
  atlasDocumentVersions,
  atlasEvidence,
  atlasFindings,
  atlasReviewedSelection,
  atlasSecurities,
  atlasSourceAssertions,
  deals,
} from "@/lib/fixtures";
import { calculateMetrics } from "@/lib/finance";
import { createUnderwritingSelectionAuditEvent, isAtlasQoeSelectionReviewed, isMemoStale } from "@/lib/memo";
import { regenerateMemoResponseSchema } from "@/lib/memo-contract";
import { assertMemoEvidenceIntegrity, resolveEvidence as resolveEvidenceChain } from "@/lib/provenance";
import { createInitialDemoState, demoReducer, type ViewKey } from "@/lib/demo-state";
import type { AuditEvent, Evidence, MemoVersion, UnderwritingSelection } from "@/lib/domain";

const viewPath: Record<ViewKey, string> = {
  deals: "/deals",
  overview: "/deals/atlas",
  securities: "/deals/atlas/securities",
  diligence: "/deals/atlas/diligence",
  memo: "/deals/atlas/memo",
};

const viewLabel: Record<ViewKey, string> = {
  deals: "Deals",
  overview: "Overview",
  securities: "Securities",
  diligence: "Due Diligence",
  memo: "IC Memo",
};

function parseView(pathname: string): ViewKey {
  if (pathname.endsWith("/securities")) return "securities";
  if (pathname.endsWith("/diligence")) return "diligence";
  if (pathname.endsWith("/memo")) return "memo";
  if (pathname.includes("/deals/atlas")) return "overview";
  return "deals";
}

function money(value: number) { return `$${value.toFixed(1)}m`; }
function ratio(value: number) { return `${value.toFixed(2)}x`; }

function resolveEvidenceSource(evidence: Evidence) {
  const { documentVersion, document } = resolveEvidenceChain(evidence.id, "atlas", {
    evidence: atlasEvidence,
    documentVersions: atlasDocumentVersions,
    documents: atlasDocuments,
    sourceAssertions: atlasSourceAssertions,
  });
  const documentLabel = `${document.name} ${documentVersion.versionLabel}`;
  return { document, documentVersion, documentLabel, citationLabel: `${documentLabel} · ${evidence.sectionLabel}` };
}

export function UnderwritingApp({ initialView = "deals" }: { initialView?: ViewKey }) {
  const [state, dispatch] = useReducer(
    demoReducer,
    initialView,
    (view) => ({ ...createInitialDemoState(), view }),
  );
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/deals");
    }
    const view = parseView(window.location.pathname);
    dispatch({ type: "NAVIGATE", view });
    const evidenceId = new URLSearchParams(window.location.search).get("evidence");
    if (evidenceId) dispatch({ type: "OPEN_EVIDENCE", evidenceId });
    const onPop = () => {
      dispatch({ type: "NAVIGATE", view: parseView(window.location.pathname) });
      const id = new URLSearchParams(window.location.search).get("evidence");
      if (id) {
        dispatch({ type: "OPEN_EVIDENCE", evidenceId: id });
      } else {
        dispatch({ type: "CLOSE_EVIDENCE" });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const assertion = atlasSourceAssertions.find((item) => item.id === state.selection.selectedAssertionId)!;
  const metrics = useMemo(() => calculateMetrics({
    netDebtUsdM: atlasDeal.netDebtUsdM,
    underwritingEbitdaUsdM: assertion.value,
    covenantLeverageX: atlasDeal.covenantLeverageX,
    downsidePct: atlasDeal.downsidePct,
  }), [assertion.value]);
  const initialMetrics = useMemo(() => calculateMetrics({
    netDebtUsdM: atlasDeal.netDebtUsdM,
    underwritingEbitdaUsdM: 33,
    covenantLeverageX: atlasDeal.covenantLeverageX,
    downsidePct: atlasDeal.downsidePct,
  }), []);
  const reviewed = isAtlasQoeSelectionReviewed(state.selection);
  const currentMemo = state.memoVersions.find((memo) => memo.version === state.currentMemoVersion)!;
  const activeEvidence = atlasEvidence.find((item) => item.id === state.activeEvidenceId) ?? null;

  function navigate(view: ViewKey, evidenceId?: string) {
    const path = evidenceId ? `${viewPath[view]}?evidence=${encodeURIComponent(evidenceId)}` : viewPath[view];
    window.history.pushState({}, "", path);
    dispatch({ type: "NAVIGATE", view });
    if (evidenceId) dispatch({ type: "OPEN_EVIDENCE", evidenceId });
  }

  function openEvidence(evidenceId: string) {
    window.history.pushState({}, "", `${viewPath[state.view]}?evidence=${encodeURIComponent(evidenceId)}`);
    dispatch({ type: "OPEN_EVIDENCE", evidenceId });
  }

  const closeEvidence = useCallback(() => {
    const currentView = parseView(window.location.pathname);
    dispatch({ type: "CLOSE_EVIDENCE" });
    window.history.replaceState({}, "", viewPath[currentView]);
  }, []);

  function confirmQoe() {
    if (reviewed) return;
    const runtimeSelection: UnderwritingSelection = {
      ...atlasReviewedSelection,
      selectedAt: new Date().toISOString(),
      materializationSource: "runtime",
    };
    const auditEvent = createUnderwritingSelectionAuditEvent({
      previousSelection: state.selection,
      nextSelection: runtimeSelection,
      actor: "Demo Analyst",
    });
    dispatch({ type: "CONFIRM_QOE", selection: runtimeSelection, auditEvent });
    setToast({
      title: "Underwriting assumption updated",
      body: "EBITDA changed from $33.0m to $30.0m. Four downstream calculations updated.",
    });
  }

  async function regenerateMemo() {
    if (!reviewed || state.currentMemoVersion === 3 || state.generationStatus === "loading") return;
    dispatch({ type: "MEMO_GENERATION_STARTED" });
    try {
      const response = await fetch("/api/memo/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealId: "atlas",
          sourceMemoVersion: 2,
          underwritingSelectionId: state.selection.id,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : `Memo update failed (${response.status}).`;
        throw new Error(error);
      }
      const validated = regenerateMemoResponseSchema.safeParse(payload);
      if (!validated.success) {
        throw new Error("The memo service returned an invalid reviewed snapshot.");
      }
      const memo: MemoVersion = validated.data.memo;
      assertMemoEvidenceIntegrity(memo, {
        evidence: atlasEvidence,
        documentVersions: atlasDocumentVersions,
        documents: atlasDocuments,
        sourceAssertions: atlasSourceAssertions,
      });
      const audit: AuditEvent = {
        id: "audit-memo-v3",
        dealId: "atlas",
        actor: "Demo Analyst",
        occurredAt: new Date().toISOString(),
        action: "memo.regenerated",
        entityType: "memo_version",
        entityId: memo.id,
        before: { memoVersion: 2 },
        after: { memoVersion: 3 },
      };
      dispatch({ type: "MEMO_GENERATION_SUCCEEDED", memo, auditEvent: audit });
      setToast({ title: "Draft v3 is current", body: "The memo was composed deterministically from reviewed underwriting and evidence-linked findings." });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Memo update failed.";
      dispatch({ type: "MEMO_GENERATION_FAILED", message: `${detail} Draft v2 is unchanged and your underwriting selection is preserved.` });
    }
  }

  function resetDemo() {
    dispatch({ type: "RESET" });
    window.history.pushState({}, "", "/deals");
    setToast({ title: "Demo reset", body: "The initial conflict, Draft v2, and management-selected EBITDA have been restored." });
  }

  return (
    <div className="app-shell">
      <SideNav view={state.view} navigate={navigate} />
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs"><span>Active Underwriting</span>{state.view !== "deals" && <><span>/</span><b>Atlas Industrial Services</b><span>/</span><span>{viewLabel[state.view]}</span></>}</div>
          <div className="top-actions">
            <span className="badge synthetic">Synthetic demo data</span>
            <span className="footnote">Memory-only · refresh resets</span>
            <button className="button small" onClick={resetDemo}>↺ Reset demo</button>
          </div>
        </header>
        <div className="content">
          {state.view === "deals" ? (
            <DealsPage metrics={metrics} openAtlas={() => navigate("overview")} />
          ) : (
            <>
              <DealHeader view={state.view} navigate={navigate} />
              <section
                id={`atlas-panel-${state.view}`}
                role="tabpanel"
                aria-labelledby={`atlas-tab-${state.view}`}
                tabIndex={0}
              >
                {state.view === "overview" && <OverviewPage metrics={metrics} reviewed={reviewed} navigate={navigate} openEvidence={openEvidence} />}
                {state.view === "securities" && <SecuritiesPage metrics={metrics} initialMetrics={initialMetrics} reviewed={reviewed} navigate={navigate} />}
                {state.view === "diligence" && (
                  <DiligencePage
                    reviewed={reviewed}
                    auditEvents={state.auditEvents}
                    openEvidence={openEvidence}
                  />
                )}
                {state.view === "memo" && (
                  <MemoPage
                    currentMemo={currentMemo}
                    metrics={metrics}
                    initialMetrics={initialMetrics}
                    reviewed={reviewed}
                    underwritingRevision={state.selection.revision}
                    showDiff={state.showMemoDiff}
                    generationStatus={state.generationStatus}
                    generationError={state.generationError}
                    toggleDiff={() => dispatch({ type: "TOGGLE_MEMO_DIFF" })}
                    regenerate={regenerateMemo}
                    openEvidence={openEvidence}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </main>
      {activeEvidence && (
        <EvidenceDrawer
          evidence={activeEvidence}
          reviewed={reviewed}
          onClose={closeEvidence}
          onConfirm={confirmQoe}
        />
      )}
      {toast && <div className="toast" role="status"><strong>{toast.title}</strong><span>{toast.body}</span></div>}
    </div>
  );
}

function SideNav({ view, navigate }: { view: ViewKey; navigate: (view: ViewKey) => void }) {
  const items: [ViewKey, string, string][] = [
    ["deals", "▦", "Deals"], ["overview", "⌂", "Overview"], ["securities", "≡", "Securities"], ["diligence", "✓", "Due Diligence"], ["memo", "¶", "IC Memo"],
  ];
  return <aside className="side-nav">
    <div className="brand"><div className="brand-mark">CU</div><div><div className="brand-title">Credit Underwriting</div><div className="brand-sub">Private credit workspace</div></div></div>
    <div className="nav-label">Underwriting</div>
    <nav aria-label="Primary navigation">
      {items.map(([key, glyph, label]) => <button key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => navigate(key)}><span className="nav-glyph">{glyph}</span>{label}</button>)}
    </nav>
    <div className="nav-spacer" />
    <div className="demo-user"><div className="avatar">DA</div><div><strong>Demo Analyst</strong><span>Mocked identity · Review rights</span></div></div>
  </aside>;
}

function DealHeader({ view, navigate }: { view: ViewKey; navigate: (view: ViewKey) => void }) {
  const tabs: ViewKey[] = ["overview", "securities", "diligence", "memo"];
  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: ViewKey) {
    const currentIndex = tabs.indexOf(current);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    navigate(tabs[nextIndex]);
    window.requestAnimationFrame(() => document.getElementById(`atlas-tab-${tabs[nextIndex!]}`)?.focus());
  }
  return <>
    <div className="page-head">
      <div><div className="eyebrow">Sponsor-backed acquisition financing</div><h1>Atlas Industrial Services</h1><div className="subtitle">Northstar Capital Partners · Owner: Sarah Chen · Target IC: 18 Sep 2026</div></div>
      <div className="legend"><span className="badge info">Due diligence</span><span className="badge">Sponsor-backed</span><span className="badge synthetic">Synthetic</span></div>
    </div>
    <div className="deal-tabs" role="tablist" aria-label="Atlas deal sections">{tabs.map((tab) => <button key={tab} id={`atlas-tab-${tab}`} role="tab" aria-selected={view === tab} aria-controls={`atlas-panel-${tab}`} tabIndex={view === tab ? 0 : -1} className={`deal-tab ${view === tab ? "active" : ""}`} onClick={() => navigate(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)}>{viewLabel[tab]}</button>)}</div>
  </>;
}

function DealsPage({ metrics, openAtlas }: { metrics: ReturnType<typeof calculateMetrics>; openAtlas: () => void }) {
  return <>
    <div className="page-head"><div><div className="eyebrow">Private credit pipeline</div><h1>Active Underwriting</h1><div className="subtitle">Three synthetic opportunities · one evidence-to-memo workflow implemented in depth</div></div><div className="legend"><span className="badge good">1 interactive</span><span className="badge static">2 static previews</span></div></div>
    <div className="panel"><div className="panel-head queue-head"><div><h3>Underwriting queue</h3><p>Atlas reflects the current in-memory underwriting selection.</p></div><button className="button small primary queue-primary-action" onClick={openAtlas}>Open interactive Atlas deal</button></div><div className="table-scroll">
      <table className="data-table deals-table"><caption className="sr-only">Active underwriting opportunities</caption><thead><tr><th>Borrower</th><th>Sponsor</th><th>Stage</th><th>Facility</th><th>EBITDA</th><th>Net leverage</th><th>High risks</th><th>IC date</th><th>Owner</th><th></th></tr></thead><tbody>
        <tr className="clickable" onDoubleClick={openAtlas}><td><div className="company-cell"><div className="company-icon">AI</div><div><strong>Atlas Industrial Services</strong><span>Industrials · Interactive</span></div></div></td><td>Northstar Capital</td><td><span className="badge info">Diligence</span></td><td className="tabular">$145m committed</td><td className="tabular">{money(metrics.underwritingEbitdaUsdM)}</td><td className="tabular">{ratio(metrics.baseLeverageX)}</td><td><span className="badge high">2 High</span></td><td>18 Sep</td><td>Sarah Chen</td><td><button className="button small primary table-open-action" onClick={openAtlas}>Open Atlas</button></td></tr>
        {deals.filter((deal) => deal.id !== "atlas").map((deal) => <tr key={deal.id}><td><div className="company-cell"><div className="company-icon">{deal.name.slice(0,2).toUpperCase()}</div><div><strong>{deal.name}</strong><span>{deal.sector} · Static preview</span></div></div></td><td>{deal.sponsor}</td><td><span className="badge static">Static preview</span></td><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Unassigned</td><td></td></tr>)}
      </tbody></table>
    </div></div>
    <div className="footnote" style={{ marginTop: 12 }}>All entities and figures are fictional. No client systems or confidential data are connected.</div>
  </>;
}

function MetricCard({ label, value, meta, tone }: { label: string; value: string; meta: string; tone?: string }) {
  return <div className="panel metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={`metric-meta ${tone ?? ""}`}>{meta}</div></div>;
}

function OverviewPage({ metrics, reviewed, navigate, openEvidence }: { metrics: ReturnType<typeof calculateMetrics>; reviewed: boolean; navigate: (view: ViewKey, evidenceId?: string) => void; openEvidence: (id: string) => void }) {
  return <div className="stack">
    <div className="grid-4"><MetricCard label="Committed facilities" value="$145m" meta="$132m currently drawn" /><MetricCard label="Underwriting EBITDA" value={money(metrics.underwritingEbitdaUsdM)} meta={reviewed ? "Human-selected · QoE-supported" : "Current selection · Management Materials v1"} /><MetricCard label="Net leverage" value={ratio(metrics.baseLeverageX)} meta="Calculated from selected input" /><MetricCard label="High risks" value="2" meta="High severity · review states vary" tone="delta" /></div>
    <div className={`alert ${reviewed ? "green" : "red"}`} role="status"><div><div className="alert-title">{reviewed ? "Underwriting assumption changed" : "QoE review required"}</div><div className="alert-copy">{reviewed ? "EBITDA moved from $33.0m to $30.0m; four downstream calculations updated. Both source assertions remain preserved." : "QoE supports $30.0m versus $33.0m in management materials. The conflicting values require reviewer confirmation."}</div></div><button className={`button ${reviewed ? "" : "primary"}`} onClick={() => reviewed ? navigate("memo") : navigate("diligence", "evidence-qoe-ebitda-normalization")}>{reviewed ? "Review memo impact" : "Review QoE evidence"}</button></div>
    <div className="split"><div className="panel"><div className="panel-head"><div><h3>Underwriting inputs</h3><p>Source observations coexist; selection is a separate human action.</p></div></div><div className="panel-body"><div className="conflict-card"><div className="conflict-head"><div><strong style={{ fontSize: 11 }}>EBITDA source conflict</strong><div className="footnote">FY2026 · USD millions</div></div><span className={`badge ${reviewed ? "good" : "medium"}`}>{reviewed ? "Selection confirmed" : "Needs review"}</span></div><div className="assertion"><div><strong style={{ fontSize: 11 }}>Management-adjusted EBITDA</strong><div className="assertion-source">Management Materials v1 → Financial Summary</div></div><div className="assertion-value tabular">$33.0m</div><span className={`badge ${reviewed ? "" : "info"}`}>{reviewed ? "Preserved" : "Selected"}</span></div><div className="assertion"><div><strong style={{ fontSize: 11 }}>QoE-supported EBITDA</strong><div className="assertion-source">Quality of Earnings Report v1 → EBITDA Normalization</div></div><div className="assertion-value tabular">$30.0m</div><span className={`badge ${reviewed ? "good" : "medium"}`}>{reviewed ? "Selected" : "Competing"}</span></div></div></div></div>
      <div className="stack"><RisksCompact openEvidence={openEvidence} /><ProgressPanel /></div>
    </div>
  </div>;
}

function RisksCompact({ openEvidence }: { openEvidence: (id: string) => void }) {
  const rows = atlasFindings.slice(0,3);
  return <div className="panel"><div className="panel-head"><div><h3>Material findings</h3><p>Review state is separate from economic risk.</p></div></div><div className="panel-body" style={{ paddingTop: 4, paddingBottom: 4 }}>{rows.map((risk) => <div className="risk-row" key={risk.id}><span className={`badge ${risk.severity === "high" ? "high" : "medium"}`}>{risk.severity}</span><div><div className="risk-title">{risk.title}</div><div className="risk-copy">{risk.summary}</div></div><button className="source-link" onClick={() => openEvidence(risk.evidenceIds[0])}>View source</button></div>)}</div></div>;
}

function ProgressPanel() {
  return <div className="panel"><div className="panel-head"><div><h3>Document intake readiness</h3><p>Static completeness of seeded source packages—not finding resolution</p></div></div><div className="panel-body progress-list">{atlasDiligenceItems.map((item) => <div className="progress-item" key={item.id}><span>{item.category === "financial" ? "Financial / QoE" : item.category[0].toUpperCase() + item.category.slice(1)}</span><div className="progress-track" role="progressbar" aria-label={`${item.title} document intake readiness`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progressPct}><div className="progress-fill" style={{ width: `${item.progressPct}%` }} /></div><span className="tabular">{item.progressPct}%</span></div>)}</div></div>;
}

function SecuritiesPage({ metrics, initialMetrics, reviewed, navigate }: { metrics: ReturnType<typeof calculateMetrics>; initialMetrics: ReturnType<typeof calculateMetrics>; reviewed: boolean; navigate: (view: ViewKey, evidenceId?: string) => void }) {
  return <div className="stack">
    <div className="page-head" style={{ marginBottom: 0 }}><div><h2>Capital Structure & Proposed Securities</h2><div className="subtitle">A Security is a debt facility or tranche within the Atlas underwriting opportunity.</div></div><button className="button" onClick={() => reviewed ? navigate("memo") : navigate("diligence", "evidence-qoe-ebitda-normalization")}>{reviewed ? "View IC memo impact" : "Review EBITDA conflict"}</button></div>
    <div className="grid-2">{atlasSecurities.map((security) => <div className="panel facility" key={security.id}><div><h3>{security.name}</h3><div className="term-line"><span>First lien</span><span>SOFR + {security.spreadBps} bps</span><span>{(security.floorPct * 100).toFixed(1)}% floor</span><span>{(security.amortizationPct * 100).toFixed(0)}% amortization</span></div></div><div><div className="facility-amount">${security.commitmentUsdM}m</div><div className="facility-sub">${security.drawnUsdM}m drawn · Static terms</div></div></div>)}</div>
    <div className="split"><div className="panel"><div className="panel-head"><div><h3>Facility terms</h3><p>Static demo data; terms are not editable.</p></div></div><table className="data-table"><thead><tr><th>Facility</th><th>Committed</th><th>Drawn</th><th>Seniority</th><th>Pricing</th><th>Amortization</th><th>Maturity</th></tr></thead><tbody>{atlasSecurities.map((security) => <tr key={security.id}><td><strong>{security.name}</strong></td><td className="tabular">${security.commitmentUsdM}m</td><td className="tabular">${security.drawnUsdM}m</td><td>Senior secured / first lien</td><td className="tabular">SOFR + {security.spreadBps}</td><td className="tabular">{(security.amortizationPct * 100).toFixed(0)}% p.a.</td><td>{security.maturityDate}</td></tr>)}</tbody></table></div>
      <div className="panel"><div className="panel-head"><div><h3>Base / downside case</h3><p>Calculated from current underwriting EBITDA</p></div><span className="badge synthetic">5.75x synthetic covenant</span></div><div className="panel-body scenario"><div className="scenario-grid"><span className="head">Metric</span><span className="head">Before</span><span className="head">Current</span><span>Underwriting EBITDA</span><span className={reviewed ? "old tabular" : "tabular"}>{money(initialMetrics.underwritingEbitdaUsdM)}</span><span className="new tabular">{money(metrics.underwritingEbitdaUsdM)}</span><span>Base leverage</span><span className={reviewed ? "old tabular" : "tabular"}>{ratio(initialMetrics.baseLeverageX)}</span><span className="new tabular">{ratio(metrics.baseLeverageX)}</span><span>20% downside EBITDA</span><span className={reviewed ? "old tabular" : "tabular"}>{money(initialMetrics.downsideEbitdaUsdM)}</span><span className="new tabular">{money(metrics.downsideEbitdaUsdM)}</span><span>Downside leverage</span><span className={reviewed ? "old tabular" : "tabular"}>{ratio(initialMetrics.downsideLeverageX)}</span><span className="new tabular">{ratio(metrics.downsideLeverageX)}</span><span>Headroom</span><span className={reviewed ? "old tabular" : "tabular"}>{ratio(initialMetrics.covenantHeadroomX)}</span><span className="new tabular">{ratio(metrics.covenantHeadroomX)}</span></div><div className="footnote" style={{ marginTop: 15 }}>Net leverage = net debt / EBITDA. Headroom is a modeled cushion, not a legal covenant-compliance conclusion.</div></div></div>
    </div>
  </div>;
}

function DiligencePage({ reviewed, auditEvents, openEvidence }: { reviewed: boolean; auditEvents: AuditEvent[]; openEvidence: (id: string) => void }) {
  return <div className="stack">
    <div className="page-head" style={{ marginBottom: 0 }}><div><h2>Due Diligence Review</h2><div className="subtitle">Static source material, working review state, and evidence-linked findings.</div></div><div className="legend"><span className="badge static">4 seeded documents</span><span className="badge good">5 workstreams</span></div></div>
    <ProgressPanel />
    <div className="conflict-card"><div className="conflict-head"><div><div className="legend"><span className="badge high">Severity: High</span><span className={`badge ${reviewed ? "good" : "medium"}`}>Review: {reviewed ? "Confirmed" : "Needs review"}</span><span className="badge high">Risk: Open</span></div><h2 style={{ marginTop: 10 }}>QoE normalization reduces supported EBITDA</h2><div className="subtitle">Two source assertions remain preserved until the reviewer selects the underwriting input.</div></div><button className="button primary" onClick={() => openEvidence("evidence-qoe-ebitda-normalization")}>{reviewed ? "View selected evidence" : "View QoE evidence"}</button></div><div className="assertion"><div><strong style={{ fontSize: 11 }}>Management Materials v1</strong><div className="assertion-source">Financial Summary · Seeded source assertion</div></div><div className="assertion-value tabular">$33.0m</div><span className={`badge ${reviewed ? "" : "info"}`}>{reviewed ? "Preserved" : "Current"}</span></div><div className="assertion"><div><strong style={{ fontSize: 11 }}>Quality of Earnings Report v1</strong><div className="assertion-source">EBITDA Normalization · Seeded source assertion</div></div><div className="assertion-value tabular">$30.0m</div><span className={`badge ${reviewed ? "good" : "medium"}`}>{reviewed ? "Selected" : "Competing"}</span></div></div>
    <div className="split"><div className="panel"><div className="panel-head"><div><h3>Findings register</h3><p>Initial findings are static demo data; review selections are real.</p></div></div><div className="panel-body" style={{ paddingTop: 4, paddingBottom: 4 }}>{atlasFindings.map((finding) => <div className="risk-row" key={finding.id}><span className={`badge ${finding.severity === "high" ? "high" : "medium"}`}>{finding.severity}</span><div><div className="risk-title">{finding.title}</div><div className="risk-copy">{finding.id === "finding-qoe-ebitda" && reviewed ? "Confirmed for underwriting. Economic risk remains open." : finding.summary}</div><div className="footnote" style={{ marginTop: 5 }}>Review: {finding.id === "finding-qoe-ebitda" && reviewed ? "Confirmed" : finding.reviewStatus.replace("_", " ")} · Risk: {finding.riskStatus}</div></div><button className="source-link" onClick={() => openEvidence(finding.evidenceIds[0])}>View source</button></div>)}</div></div>
      <div className="stack"><div className="panel"><div className="panel-head"><div><h3>Review activity</h3><p>In-memory audit events</p></div></div><div className="panel-body">{auditEvents.length ? <div className="stack">{auditEvents.map((event) => <div className="audit-item" key={event.id}><div className="audit-dot">✓</div><div><strong>{event.action === "underwriting_selection.changed" ? "Underwriting selection changed" : "Memo version composed"}</strong><p>{event.actor} · {new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<br />{Object.values(event.before).join(" · ")} → {Object.values(event.after).join(" · ")}</p></div></div>)}</div> : <div className="empty-state">No review action recorded yet.</div>}</div></div><div className="panel"><div className="panel-head"><div><h3>Intentional uncertainty</h3><p>Static failure-state example</p></div></div><div className="panel-body"><span className="badge medium">Needs review</span><p className="risk-copy" style={{ marginTop: 9 }}>Covenant definitions are still under legal review. Impact is not assessed; the demo does not invent a conclusion.</p><button className="source-link" onClick={() => openEvidence("evidence-financial-covenant")}>View available source context</button></div></div></div>
    </div>
  </div>;
}

function MemoPage({ currentMemo, metrics, initialMetrics, reviewed, underwritingRevision, showDiff, generationStatus, generationError, toggleDiff, regenerate, openEvidence }: { currentMemo: MemoVersion; metrics: ReturnType<typeof calculateMetrics>; initialMetrics: ReturnType<typeof calculateMetrics>; reviewed: boolean; underwritingRevision: number; showDiff: boolean; generationStatus: string; generationError: string | null; toggleDiff: () => void; regenerate: () => void; openEvidence: (id: string) => void }) {
  const v3 = currentMemo.version === 3;
  const stale = isMemoStale(currentMemo, underwritingRevision);
  const sections = [...currentMemo.sections].sort((left, right) => left.order - right.order);
  return <div className="split">
    <div>
      {stale && <div className="stale-banner"><div><div className="alert-title">Underwriting changed since Draft v2</div><div className="alert-copy">The EBITDA input and four calculations changed; the finding review state was confirmed.</div></div><div className="top-actions"><button className="button" onClick={toggleDiff}>Review changes</button><button className="button primary" onClick={regenerate} disabled={generationStatus === "loading"}>{generationStatus === "loading" ? "Updating Draft v3…" : "Update memo"}</button></div></div>}
      {generationError && <div className="alert red" role="alert"><div><div className="alert-title">Memo update failed</div><div className="alert-copy">{generationError} Try again.</div></div><button className="button" onClick={regenerate}>Try again</button></div>}
      {v3 && <div className="alert green" style={{ marginBottom: 13 }}><div><div className="alert-title">Draft v3 is current</div><div className="alert-copy">Composed deterministically from reviewed underwriting. Draft v2 remains available for comparison.</div></div><button className="button" onClick={toggleDiff}>Compare with Draft v2</button></div>}
      <article className="memo-shell"><div className="memo-cover"><div className="memo-kicker">Investment Committee Memorandum</div><h2>Atlas Industrial Services</h2><div className="memo-meta"><span>Draft v{currentMemo.version}</span><span>{stale ? "Out of date" : "Current"}</span><span>{v3 ? "Composed from reviewed underwriting" : "Static demo content"}</span></div></div>
        {sections.map((section, index) => <MemoSectionView key={section.id} section={section} number={index + 1} openEvidence={openEvidence} />)}
      </article>
    </div>
    <div className="stack"><div className="panel"><div className="panel-head"><div><h3>Memo state</h3><p>Versioned snapshot of underwriting</p></div><span className={`badge ${stale ? "medium" : "good"}`}>{stale ? "Out of date" : "Current"}</span></div><div className="panel-body"><div className="metric-label">Current version</div><div className="metric-value">Draft v{currentMemo.version}</div><div className="metric-meta">Based on underwriting revision {currentMemo.basedOnUnderwritingRevision}</div>{!reviewed && <p className="footnote" style={{ marginTop: 12 }}>Reflects the current management-selected EBITDA; the QoE conflict remains unresolved.</p>}</div></div>
      {showDiff && <div className="panel"><div className="panel-head"><div><h3>Compare with Draft v2</h3><p>Before and current reviewed state</p></div></div><div className="panel-body">{[
        ["Underwriting EBITDA", money(initialMetrics.underwritingEbitdaUsdM), money(metrics.underwritingEbitdaUsdM)],
        ["Base leverage", ratio(initialMetrics.baseLeverageX), ratio(metrics.baseLeverageX)],
        ["Downside EBITDA", money(initialMetrics.downsideEbitdaUsdM), money(metrics.downsideEbitdaUsdM)],
        ["Downside leverage", ratio(initialMetrics.downsideLeverageX), ratio(metrics.downsideLeverageX)],
        ["Headroom", ratio(initialMetrics.covenantHeadroomX), ratio(metrics.covenantHeadroomX)],
        ["Finding review", "Needs review", reviewed ? "Confirmed" : "Needs review"],
      ].map(([label,before,after]) => <div className="diff-grid" key={label}><span>{label}</span><span className="tabular">{before}</span><span className="arrow">→</span><strong className="tabular">{after}</strong></div>)}</div></div>}
      <div className="panel"><div className="panel-head"><div><h3>Truth ledger</h3><p>What this page actually does</p></div></div><div className="panel-body stack"><div><span className="badge good">Real</span><p className="footnote">Finance, staleness, version comparison, deterministic composition, evidence links.</p></div><div><span className="badge static">Static demo data</span><p className="footnote">Initial document excerpts, findings, and most Draft v2 prose.</p></div><div><span className="badge">Not implemented</span><p className="footnote">Live AI, document parsing, persistence, and investment recommendation.</p></div></div></div>
    </div>
  </div>;
}

function MemoSectionView({ section, number, openEvidence }: { section: MemoVersion["sections"][number]; number: number; openEvidence: (id: string) => void }) {
  return <section className="memo-section">
    <h3>{number}. {section.title}</h3>
    {section.body.split("\n\n").map((paragraph, index) => <p key={`${section.id}-body-${index}`}>{paragraph}</p>)}
    {section.claims.length > 0 && <ul className="memo-claims">{section.claims.map((claim) => <li key={claim.id}>
      <div className="claim-copy">{claim.text}</div>
      <div className="claim-sources" aria-label="Supporting sources">{claim.evidenceIds.map((id) => {
        const evidence = atlasEvidence.find((item) => item.id === id);
        if (!evidence) return <span key={id} className="citation missing">Missing evidence: {id}</span>;
        const source = resolveEvidenceSource(evidence);
        return <button key={id} className="citation" onClick={() => openEvidence(id)} aria-label={`Open supporting source: ${source.citationLabel}`}>{source.citationLabel}</button>;
      })}</div>
    </li>)}</ul>}
  </section>;
}

function EvidenceDrawer({ evidence, reviewed, onClose, onConfirm }: { evidence: Evidence; reviewed: boolean; onClose: () => void; onConfirm: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onClose]);
  const isQoe = evidence.id === "evidence-qoe-ebitda-normalization";
  const source = resolveEvidenceSource(evidence);
  return <><button className="drawer-backdrop" onClick={onClose} aria-label="Close evidence drawer" tabIndex={-1} /><aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><div className="drawer-head"><div><div className="eyebrow">Seeded source evidence</div><h2 id="evidence-title">{source.documentLabel}</h2><div className="subtitle">{evidence.sectionLabel} · {source.documentVersion?.approvalStatus ?? "Unknown status"} · Stable ID: {evidence.id}</div></div><button ref={closeRef} className="close-button" onClick={onClose} aria-label="Close evidence drawer">×</button></div><div className="drawer-body"><span className="badge synthetic">Static demo data</span><div className="drawer-label">Evidence excerpt</div><div className="excerpt">“{evidence.excerpt}”</div>{isQoe && <><div className="drawer-label">Competing assertions</div><div className="conflict-card"><div className="assertion"><div><strong style={{ fontSize: 11 }}>Management Materials v1</strong><div className="assertion-source">Adjusted EBITDA</div></div><div className="assertion-value tabular">$33.0m</div><span className="badge">Preserved</span></div><div className="assertion"><div><strong style={{ fontSize: 11 }}>{source.documentLabel}</strong><div className="assertion-source">{evidence.sectionLabel}</div></div><div className="assertion-value tabular">$30.0m</div><span className={`badge ${reviewed ? "good" : "medium"}`}>{reviewed ? "Selected" : "Proposed"}</span></div></div><div className="drawer-label">Review action</div><button className="button primary" style={{ width: "100%" }} disabled={reviewed} onClick={onConfirm}>{reviewed ? "Selected for underwriting" : "Use $30.0m for underwriting"}</button><p className="footnote">This human action changes the underwriting selection. It does not overwrite either source assertion or resolve the economic risk.</p></>}</div></aside></>;
}
