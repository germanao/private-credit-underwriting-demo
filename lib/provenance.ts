import type {
  Document,
  DocumentVersion,
  Evidence,
  MemoVersion,
  SourceAssertion,
} from "./domain";

export interface ResolvedEvidence {
  evidence: Evidence;
  documentVersion: DocumentVersion;
  document: Document;
}

export interface EvidenceCatalog {
  evidence: readonly Evidence[];
  documentVersions: readonly DocumentVersion[];
  documents: readonly Document[];
  sourceAssertions: readonly SourceAssertion[];
}

/**
 * Resolves and validates the complete citation chain used by the UI and memo.
 * A string that merely looks like an evidence ID is not a valid citation.
 */
export function resolveEvidence(
  evidenceId: string,
  dealId: string,
  catalog: EvidenceCatalog,
): ResolvedEvidence {
  const evidence = catalog.evidence.find(({ id }) => id === evidenceId);
  if (!evidence) throw new Error(`Unknown evidence: ${evidenceId}`);
  if (evidence.dealId !== dealId) {
    throw new Error(`Evidence ${evidenceId} belongs to another deal`);
  }

  const documentVersion = catalog.documentVersions.find(
    ({ id }) => id === evidence.documentVersionId,
  );
  if (!documentVersion) {
    throw new Error(
      `Evidence ${evidenceId} references unknown document version ${evidence.documentVersionId}`,
    );
  }
  if (!documentVersion.sections.includes(evidence.sectionLabel)) {
    throw new Error(
      `Evidence ${evidenceId} references an unknown section on ${documentVersion.id}`,
    );
  }

  const document = catalog.documents.find(
    ({ id }) => id === documentVersion.documentId,
  );
  if (!document) {
    throw new Error(
      `Document version ${documentVersion.id} references unknown document ${documentVersion.documentId}`,
    );
  }
  if (document.dealId !== dealId) {
    throw new Error(`Document ${document.id} belongs to another deal`);
  }

  return { evidence, documentVersion, document };
}

export function assertEvidenceIdsResolve(
  evidenceIds: readonly string[],
  dealId: string,
  catalog: EvidenceCatalog,
): void {
  if (evidenceIds.length === 0) {
    throw new Error("An evidence-linked record must cite at least one source");
  }
  const uniqueIds = new Set(evidenceIds);
  if (uniqueIds.size !== evidenceIds.length) {
    throw new Error("Evidence links must not contain duplicate IDs");
  }
  for (const evidenceId of evidenceIds) {
    resolveEvidence(evidenceId, dealId, catalog);
  }
}

export function assertMemoEvidenceIntegrity(
  memo: MemoVersion,
  catalog: EvidenceCatalog,
): void {
  for (const section of memo.sections) {
    for (const claim of section.claims) {
      assertEvidenceIdsResolve(claim.evidenceIds, memo.dealId, catalog);
      const assertionIds = claim.assertionIds ?? [];
      if (new Set(assertionIds).size !== assertionIds.length) {
        throw new Error(`Claim ${claim.id} contains duplicate assertion IDs`);
      }
      for (const assertionId of assertionIds) {
        const assertion = catalog.sourceAssertions.find(
          ({ id }) => id === assertionId,
        );
        if (!assertion) {
          throw new Error(`Claim ${claim.id} references unknown assertion ${assertionId}`);
        }
        if (assertion.dealId !== memo.dealId) {
          throw new Error(`Assertion ${assertionId} belongs to another deal`);
        }
        assertEvidenceIdsResolve(assertion.evidenceIds, memo.dealId, catalog);
        for (const evidenceId of assertion.evidenceIds) {
          if (!claim.evidenceIds.includes(evidenceId)) {
            throw new Error(
              `Claim ${claim.id} omits evidence ${evidenceId} required by assertion ${assertionId}`,
            );
          }
        }
      }
    }
  }
}
