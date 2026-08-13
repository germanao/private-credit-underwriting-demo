import {
  atlasDeal,
  atlasDocuments,
  atlasDocumentVersions,
  atlasEvidence,
  atlasFindings,
  atlasReviewedSelection,
  atlasSourceAssertions,
} from "./fixtures";
import {
  regenerateMemoRequestSchema,
  regenerateMemoResponseSchema,
} from "./memo-contract";
import {
  composeAtlasReviewedMemo,
  projectAtlasFindingsForSelection,
} from "./memo";

export type MemoServiceResult =
  | { status: 200; body: ReturnType<typeof regenerateMemoResponseSchema.parse> }
  | { status: 400; body: { error: string; issues: unknown[] } }
  | { status: 409; body: { error: string } };

/** Application command for the single scenario implemented by the prototype. */
export function regenerateAtlasMemo(body: unknown): MemoServiceResult {
  const parsed = regenerateMemoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: "The reviewed underwriting snapshot is invalid.",
        issues: parsed.error.issues,
      },
    };
  }

  const preconditionsMet =
    parsed.data.dealId === atlasDeal.id &&
    parsed.data.sourceMemoVersion === 2 &&
    parsed.data.underwritingSelectionId === atlasReviewedSelection.id;
  if (!preconditionsMet) {
    return {
      status: 409,
      body: {
        error: "Underwriting changed; review the latest state before updating.",
      },
    };
  }

  const memo = composeAtlasReviewedMemo({
    deal: atlasDeal,
    sourceAssertions: atlasSourceAssertions,
    selection: atlasReviewedSelection,
    findings: projectAtlasFindingsForSelection(
      atlasFindings,
      atlasReviewedSelection,
    ),
    evidence: atlasEvidence,
    documentVersions: atlasDocumentVersions,
    documents: atlasDocuments,
    createdAt: atlasReviewedSelection.selectedAt,
  });

  return {
    status: 200,
    body: regenerateMemoResponseSchema.parse({
      memo,
      disclosure:
        "Composed deterministically from the validated reviewed selection; no live model call was made.",
    }),
  };
}
