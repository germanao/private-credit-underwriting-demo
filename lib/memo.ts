import type {
  AuditEvent,
  Deal,
  Document,
  DocumentVersion,
  Evidence,
  Finding,
  MemoClaim,
  MemoSection,
  MemoVersion,
  SourceAssertion,
  UnderwritingSelection,
} from "./domain";
import { calculateMetrics } from "./finance";
import {
  assertEvidenceIdsResolve,
  assertMemoEvidenceIntegrity,
  type EvidenceCatalog,
} from "./provenance";

export interface ComposeAtlasReviewedMemoInput {
  deal: Deal;
  sourceAssertions: readonly SourceAssertion[];
  selection: UnderwritingSelection;
  findings: readonly Finding[];
  evidence: readonly Evidence[];
  documentVersions: readonly DocumentVersion[];
  documents: readonly Document[];
  createdAt?: string;
}

function formatUsdM(value: number): string {
  return `$${value.toFixed(1)}m`;
}

function formatTurns(value: number): string {
  return `${value.toFixed(2)}x`;
}

export const ATLAS_QOE_ASSERTION_ID = "assertion-qoe-ebitda-30";

export function isAtlasQoeSelectionReviewed(
  selection: UnderwritingSelection,
): boolean {
  return selection.selectedAssertionId === ATLAS_QOE_ASSERTION_ID;
}

/** The QoE finding review state is a projection of the canonical selection. */
export function projectAtlasFindingsForSelection(
  findings: readonly Finding[],
  selection: UnderwritingSelection,
): readonly Finding[] {
  if (!isAtlasQoeSelectionReviewed(selection)) return findings;
  return findings.map((finding) =>
    finding.id === "finding-qoe-ebitda"
      ? { ...finding, reviewStatus: "confirmed" as const }
      : finding,
  );
}

function resolveSelectedAssertion(
  deal: Deal,
  sourceAssertions: readonly SourceAssertion[],
  selection: UnderwritingSelection,
): SourceAssertion {
  if (selection.dealId !== deal.id) {
    throw new Error("Underwriting selection belongs to another deal");
  }

  const assertion = sourceAssertions.find(
    ({ id }) => id === selection.selectedAssertionId,
  );

  if (!assertion) {
    throw new Error(
      `Unknown source assertion: ${selection.selectedAssertionId}`,
    );
  }

  if (assertion.dealId !== deal.id || assertion.metric !== selection.metric) {
    throw new Error("Selected assertion is incompatible with the selection");
  }

  return assertion;
}

function composeRiskClaim(finding: Finding, order: number): MemoClaim {
  return {
    id: `claim-v3-risk-${order + 1}-${finding.id}`,
    text: `${finding.title}: ${finding.summary} Mitigant: ${finding.mitigant}`,
    semanticOrigin: "system_composed",
    materializationSource: "runtime",
    evidenceIds: [...finding.evidenceIds],
    findingId: finding.id,
  };
}

/**
 * Deterministically composes the reviewed underwriting snapshot. It performs no
 * model call: finance is calculated in code and claims reuse stable evidence IDs.
 */
export function composeAtlasReviewedMemo({
  deal,
  sourceAssertions,
  selection,
  findings,
  evidence,
  documentVersions,
  documents,
  createdAt = selection.selectedAt,
}: ComposeAtlasReviewedMemoInput): MemoVersion {
  if (deal.id !== "atlas") {
    throw new Error("The demo composer only supports the Atlas scenario");
  }
  const catalog: EvidenceCatalog = {
    evidence,
    documentVersions,
    documents,
    sourceAssertions,
  };
  const selectedAssertion = resolveSelectedAssertion(
    deal,
    sourceAssertions,
    selection,
  );
  const financialAssertionIds = deal.financialAssertionIds;
  if (!financialAssertionIds) {
    throw new Error("Atlas requires source-backed net debt and covenant inputs");
  }
  const netDebtAssertion = sourceAssertions.find(
    ({ id }) => id === financialAssertionIds.netDebt,
  );
  const covenantAssertion = sourceAssertions.find(
    ({ id }) => id === financialAssertionIds.covenantLeverage,
  );
  if (
    !netDebtAssertion ||
    netDebtAssertion.dealId !== deal.id ||
    netDebtAssertion.metric !== "net_debt" ||
    netDebtAssertion.unit !== "usd_m"
  ) {
    throw new Error("Atlas net-debt assertion is missing or incompatible");
  }
  if (
    !covenantAssertion ||
    covenantAssertion.dealId !== deal.id ||
    covenantAssertion.metric !== "covenant_leverage" ||
    covenantAssertion.unit !== "turns"
  ) {
    throw new Error("Atlas covenant assertion is missing or incompatible");
  }
  if (netDebtAssertion.value !== deal.netDebtUsdM) {
    throw new Error("Deal net debt does not match its cited source assertion");
  }
  if (covenantAssertion.value !== deal.covenantLeverageX) {
    throw new Error("Deal covenant does not match its cited source assertion");
  }
  for (const assertion of sourceAssertions.filter(
    (candidate) => candidate.dealId === deal.id,
  )) {
    assertEvidenceIdsResolve(assertion.evidenceIds, deal.id, catalog);
  }
  for (const finding of findings.filter(
    (candidate) => candidate.dealId === deal.id,
  )) {
    assertEvidenceIdsResolve(finding.evidenceIds, deal.id, catalog);
  }
  const metrics = calculateMetrics({
    netDebtUsdM: netDebtAssertion.value,
    underwritingEbitdaUsdM: selectedAssertion.value,
    covenantLeverageX: covenantAssertion.value,
    downsidePct: deal.downsidePct,
  });
  const confirmedOpenFindings = findings
    .filter(
      (finding) =>
        finding.dealId === deal.id &&
        finding.reviewStatus === "confirmed" &&
        finding.riskStatus === "open",
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const sections: readonly MemoSection[] = [
    {
      id: "memo-atlas-v3-transaction-overview",
      title: "Transaction Overview",
      order: 1,
      body: `${deal.sponsor} is seeking sponsor-backed acquisition financing for ${deal.name} through a $120m first-lien term loan and a $25m revolving facility.`,
      semanticOrigin: "system_composed",
      materializationSource: "runtime",
      claims: [
        {
          id: "claim-v3-capitalization",
          text: "The proposed capitalization includes a $120m first-lien term loan and a $25m revolving facility.",
          semanticOrigin: "system_composed",
          materializationSource: "runtime",
          evidenceIds: ["evidence-debt-capitalization"],
          assertionIds: [netDebtAssertion.id],
        },
      ],
    },
    {
      id: "memo-atlas-v3-quality-of-earnings",
      title: "Financial Performance & Quality of Earnings",
      order: 2,
      body: `${deal.name} is underwritten on ${formatUsdM(
        metrics.underwritingEbitdaUsdM,
      )} of reviewed EBITDA. The reviewer selected the QoE-supported assertion while preserving the conflicting management assertion.`,
      semanticOrigin: "system_composed",
      materializationSource: "runtime",
      claims: [
        {
          id: "claim-v3-reviewed-ebitda",
          text: `Reviewed underwriting EBITDA is ${formatUsdM(
            metrics.underwritingEbitdaUsdM,
          )}.`,
          semanticOrigin: "human_confirmed",
          materializationSource: "runtime",
          evidenceIds: [...selectedAssertion.evidenceIds],
          assertionIds: [selectedAssertion.id],
        },
      ],
    },
    {
      id: "memo-atlas-v3-credit-metrics",
      title: "Base / Downside Case",
      order: 3,
      body: `Base leverage is ${formatTurns(
        metrics.baseLeverageX,
      )}. A 20% EBITDA downside produces ${formatUsdM(
        metrics.downsideEbitdaUsdM,
      )} of EBITDA, ${formatTurns(
        metrics.downsideLeverageX,
      )} leverage, and ${formatTurns(
        metrics.covenantHeadroomX,
      )} of headroom to the synthetic ${formatTurns(
        metrics.covenantLeverageX,
      )} covenant.`,
      semanticOrigin: "system_composed",
      materializationSource: "runtime",
      claims: [
        {
          id: "claim-v3-downside-metrics",
          text: `At a 20% downside, leverage is ${formatTurns(
            metrics.downsideLeverageX,
          )} with ${formatTurns(metrics.covenantHeadroomX)} of covenant headroom.`,
          semanticOrigin: "system_composed",
          materializationSource: "runtime",
          evidenceIds: [
            ...selectedAssertion.evidenceIds,
            "evidence-debt-capitalization",
            "evidence-financial-covenant",
          ],
          assertionIds: [
            selectedAssertion.id,
            netDebtAssertion.id,
            covenantAssertion.id,
          ],
        },
      ],
    },
    {
      id: "memo-atlas-v3-key-risks",
      title: "Key Risks & Mitigants",
      order: 4,
      body:
        confirmedOpenFindings.length > 0
          ? confirmedOpenFindings
              .map(
                (finding) =>
                  `${finding.title}: ${finding.implication} Mitigant: ${finding.mitigant}`,
              )
              .join("\n\n")
          : "No confirmed open findings are available for this reviewed snapshot.",
      semanticOrigin: "system_composed",
      materializationSource: "runtime",
      claims: confirmedOpenFindings.map(composeRiskClaim),
    },
    {
      id: "memo-atlas-v3-recommendation",
      title: "Recommendation",
      order: 5,
      body: "Analyst recommendation: Not entered. The prototype supports decision preparation; it does not make an autonomous credit decision.",
      semanticOrigin: "system_composed",
      materializationSource: "runtime",
      claims: [],
    },
  ];

  const memo: MemoVersion = {
    id: "memo-atlas-v3",
    dealId: deal.id,
    label: "Draft v3",
    version: 3,
    immutable: true,
    materializationSource: "runtime",
    basedOnUnderwritingRevision: selection.revision,
    underwritingSelectionId: selection.id,
    sourceMemoVersionId: "memo-atlas-v2",
    createdAt,
    createdBy: selection.selectedBy,
    metrics,
    sections,
  };
  assertMemoEvidenceIntegrity(memo, catalog);
  return memo;
}

export function isMemoStale(
  memo: MemoVersion,
  currentUnderwritingRevision: number,
): boolean {
  return memo.basedOnUnderwritingRevision < currentUnderwritingRevision;
}

export interface CreateUnderwritingSelectionAuditEventInput {
  previousSelection: UnderwritingSelection;
  nextSelection: UnderwritingSelection;
  actor?: string;
  occurredAt?: string;
}

export function createUnderwritingSelectionAuditEvent({
  previousSelection,
  nextSelection,
  actor = nextSelection.selectedBy,
  occurredAt = nextSelection.selectedAt,
}: CreateUnderwritingSelectionAuditEventInput): AuditEvent {
  if (previousSelection.dealId !== nextSelection.dealId) {
    throw new Error("Cannot audit selections from different deals");
  }

  return {
    id: `audit-underwriting-selection-r${nextSelection.revision}`,
    dealId: nextSelection.dealId,
    actor,
    occurredAt,
    action: "underwriting_selection.changed",
    entityType: "underwriting_selection",
    entityId: nextSelection.id,
    before: {
      selectionId: previousSelection.id,
      assertionId: previousSelection.selectedAssertionId,
      revision: previousSelection.revision,
    },
    after: {
      selectionId: nextSelection.id,
      assertionId: nextSelection.selectedAssertionId,
      revision: nextSelection.revision,
    },
  };
}
