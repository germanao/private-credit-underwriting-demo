import { describe, expect, it } from "vitest";
import {
  atlasDeal,
  atlasDocuments,
  atlasDocumentVersions,
  atlasEvidence,
  atlasFindings,
  atlasInitialSelection,
  atlasMemoV2,
  atlasReviewedSelection,
  atlasSecurities,
  atlasSourceAssertions,
  borrowerCompanies,
} from "../lib/fixtures";
import {
  calculateCovenantHeadroom,
  calculateDownsideEbitda,
  calculateLeverage,
  calculateMetrics,
} from "../lib/finance";
import {
  composeAtlasReviewedMemo,
  createUnderwritingSelectionAuditEvent,
  isMemoStale,
  projectAtlasFindingsForSelection,
} from "../lib/memo";
import { assertMemoEvidenceIntegrity, resolveEvidence } from "../lib/provenance";

describe("Atlas domain fixtures", () => {
  it("preserves conflicting EBITDA assertions and selects by reference", () => {
    const ebitdaAssertions = atlasSourceAssertions.filter(
      ({ metric }) => metric === "ebitda",
    );
    expect(ebitdaAssertions).toHaveLength(2);
    expect(ebitdaAssertions.map(({ value }) => value)).toEqual([33, 30]);
    expect(atlasInitialSelection.selectedAssertionId).toBe(
      "assertion-management-ebitda-33",
    );
    expect(atlasReviewedSelection.selectedAssertionId).toBe(
      "assertion-qoe-ebitda-30",
    );
    expect(ebitdaAssertions.map(({ value }) => value)).toEqual([33, 30]);
    expect(
      atlasSourceAssertions.every(
        ({ semanticOrigin, materializationSource }) =>
          semanticOrigin === "source_observation" &&
          materializationSource === "static_demo_data",
      ),
    ).toBe(true);
  });

  it("models term loan and revolver separately and reconciles $132m drawn", () => {
    expect(atlasSecurities).toHaveLength(2);
    expect(atlasSecurities.map(({ type }) => type)).toEqual([
      "term_loan",
      "revolver",
    ]);
    expect(atlasSecurities[1].commitmentUsdM).toBe(25);
    expect(
      atlasSecurities.reduce((total, security) => total + security.drawnUsdM, 0),
    ).toBe(atlasDeal.netDebtUsdM);
  });

  it("links the underwriting opportunity to a first-class borrower company", () => {
    const borrower = borrowerCompanies.find(({ id }) => id === atlasDeal.borrowerId);
    expect(borrower).toMatchObject({
      name: "Atlas Industrial Services",
      sector: "Industrial Services",
    });
  });

  it("keeps risk review, economic status, severity, and provenance separate", () => {
    const qoe = atlasFindings.find(({ id }) => id === "finding-qoe-ebitda");
    expect(qoe).toMatchObject({
      reviewStatus: "needs_review",
      riskStatus: "open",
      severity: "high",
      kind: "risk",
      semanticOrigin: "model_drafted",
      materializationSource: "static_demo_data",
    });
  });

  it("resolves evidence through document version to document", () => {
    const resolved = resolveEvidence(
      "evidence-qoe-ebitda-normalization",
      "atlas",
      {
        evidence: atlasEvidence,
        documentVersions: atlasDocumentVersions,
        documents: atlasDocuments,
        sourceAssertions: atlasSourceAssertions,
      },
    );
    expect(resolved.documentVersion.id).toBe("doc-version-qoe-v1");
    expect(resolved.document.id).toBe("doc-qoe");
  });

  it("keeps every seeded Draft v2 claim on a valid evidence chain", () => {
    expect(() =>
      assertMemoEvidenceIntegrity(atlasMemoV2, {
        evidence: atlasEvidence,
        documentVersions: atlasDocumentVersions,
        documents: atlasDocuments,
        sourceAssertions: atlasSourceAssertions,
      }),
    ).not.toThrow();
  });
});

describe("deterministic credit math", () => {
  it("calculates exact management and QoE cases", () => {
    expect(calculateLeverage(132, 33)).toBe(4);
    expect(calculateDownsideEbitda(33, 0.2)).toBe(26.4);
    expect(calculateLeverage(132, 26.4)).toBe(5);
    expect(calculateCovenantHeadroom(5.75, 5)).toBe(0.75);

    expect(
      calculateMetrics({
        netDebtUsdM: 132,
        underwritingEbitdaUsdM: 30,
        covenantLeverageX: 5.75,
        downsidePct: 0.2,
      }),
    ).toEqual({
      netDebtUsdM: 132,
      underwritingEbitdaUsdM: 30,
      covenantLeverageX: 5.75,
      downsidePct: 0.2,
      baseLeverageX: 4.4,
      downsideEbitdaUsdM: 24,
      downsideLeverageX: 5.5,
      covenantHeadroomX: 0.25,
    });
  });

  it("rejects invalid EBITDA and downside inputs", () => {
    expect(() => calculateLeverage(132, 0)).toThrow(RangeError);
    expect(() => calculateLeverage(132, -1)).toThrow(RangeError);
    expect(() => calculateDownsideEbitda(30, 1)).toThrow(RangeError);
    expect(() => calculateDownsideEbitda(30, -0.1)).toThrow(RangeError);
  });
});

describe("reviewed memo composition", () => {
  const confirmedFindings = projectAtlasFindingsForSelection(
    atlasFindings,
    atlasReviewedSelection,
  );

  it("derives v2 staleness from the canonical underwriting revision", () => {
    expect(isMemoStale(atlasMemoV2, 2)).toBe(true);
    expect(isMemoStale(atlasMemoV2, 1)).toBe(false);
  });

  it("creates a stable evidence-linked Draft v3", () => {
    const input = {
      deal: atlasDeal,
      sourceAssertions: atlasSourceAssertions,
      selection: atlasReviewedSelection,
      findings: confirmedFindings,
      evidence: atlasEvidence,
      documentVersions: atlasDocumentVersions,
      documents: atlasDocuments,
      createdAt: "2026-08-12T12:05:00.000Z",
    };
    const first = composeAtlasReviewedMemo(input);
    const second = composeAtlasReviewedMemo(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "memo-atlas-v3",
      label: "Draft v3",
      immutable: true,
      materializationSource: "runtime",
      basedOnUnderwritingRevision: 2,
      sourceMemoVersionId: "memo-atlas-v2",
      metrics: {
        underwritingEbitdaUsdM: 30,
        baseLeverageX: 4.4,
        downsideEbitdaUsdM: 24,
        downsideLeverageX: 5.5,
        covenantHeadroomX: 0.25,
      },
    });
    expect(first.sections).toHaveLength(5);

    const claimEvidenceIds = first.sections.flatMap((section) =>
      section.claims.flatMap((claim) => claim.evidenceIds),
    );
    expect(claimEvidenceIds).toContain("evidence-qoe-ebitda-normalization");
    expect(claimEvidenceIds).toContain("evidence-customer-concentration");
    expect(claimEvidenceIds).toContain("evidence-financial-covenant");
  });

  it("rejects a memo when a cited evidence chain cannot be resolved", () => {
    const findingsWithDanglingEvidence = confirmedFindings.map((finding) =>
      finding.id === "finding-customer-concentration"
        ? { ...finding, evidenceIds: ["evidence-does-not-exist"] }
        : finding,
    );
    expect(() =>
      composeAtlasReviewedMemo({
        deal: atlasDeal,
        sourceAssertions: atlasSourceAssertions,
        selection: atlasReviewedSelection,
        findings: findingsWithDanglingEvidence,
        evidence: atlasEvidence,
        documentVersions: atlasDocumentVersions,
        documents: atlasDocuments,
      }),
    ).toThrow("Unknown evidence");
  });

  it("rejects finance inputs that drift from their cited structured assertions", () => {
    expect(() =>
      composeAtlasReviewedMemo({
        deal: { ...atlasDeal, netDebtUsdM: 133 },
        sourceAssertions: atlasSourceAssertions,
        selection: atlasReviewedSelection,
        findings: confirmedFindings,
        evidence: atlasEvidence,
        documentVersions: atlasDocumentVersions,
        documents: atlasDocuments,
      }),
    ).toThrow("Deal net debt does not match its cited source assertion");
  });

  it("records the human selection as a before/after audit event", () => {
    expect(
      createUnderwritingSelectionAuditEvent({
        previousSelection: atlasInitialSelection,
        nextSelection: atlasReviewedSelection,
      }),
    ).toMatchObject({
      actor: "Demo Analyst",
      action: "underwriting_selection.changed",
      before: {
        assertionId: "assertion-management-ebitda-33",
        revision: 1,
      },
      after: { assertionId: "assertion-qoe-ebitda-30", revision: 2 },
    });
  });
});
