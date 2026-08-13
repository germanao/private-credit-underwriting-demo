import { describe, expect, it } from "vitest";
import { createInitialDemoState, demoReducer } from "@/lib/demo-state";
import { atlasReviewedSelection } from "@/lib/fixtures";
import {
  createUnderwritingSelectionAuditEvent,
  isAtlasQoeSelectionReviewed,
} from "@/lib/memo";

describe("demo state transitions", () => {
  it("confirms the QoE selection once while preserving an open economic risk", () => {
    const initial = createInitialDemoState();
    const auditEvent = createUnderwritingSelectionAuditEvent({
      previousSelection: initial.selection,
      nextSelection: atlasReviewedSelection,
    });
    const reviewed = demoReducer(initial, { type: "CONFIRM_QOE", selection: atlasReviewedSelection, auditEvent });
    const repeated = demoReducer(reviewed, { type: "CONFIRM_QOE", selection: atlasReviewedSelection, auditEvent });

    expect(reviewed.selection.selectedAssertionId).toBe("assertion-qoe-ebitda-30");
    expect(isAtlasQoeSelectionReviewed(reviewed.selection)).toBe(true);
    expect(reviewed.selection.revision).toBe(2);
    expect(reviewed.auditEvents).toHaveLength(1);
    expect(repeated).toBe(reviewed);
  });

  it("restores the canonical initial state on reset", () => {
    const initial = createInitialDemoState();
    const changed = { ...initial, showMemoDiff: true, activeEvidenceId: "evidence-qoe-ebitda-normalization" };
    expect(demoReducer(changed, { type: "RESET" })).toEqual(initial);
  });
});
