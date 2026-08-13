import { describe, expect, it } from "vitest";
import {
  atlasInitialSelection,
  atlasReviewedSelection,
} from "@/lib/fixtures";
import {
  regenerateMemoRequestSchema,
  regenerateMemoResponseSchema,
} from "@/lib/memo-contract";
import { regenerateAtlasMemo } from "@/lib/memo-service";

const validRequest = {
  dealId: "atlas",
  sourceMemoVersion: 2,
  underwritingSelectionId: atlasReviewedSelection.id,
};

describe("memo application contract", () => {
  it("returns 400 for a malformed request", () => {
    const result = regenerateAtlasMemo({ dealId: "atlas" });
    expect(regenerateMemoRequestSchema.safeParse({ dealId: "atlas" }).success).toBe(false);
    expect(result).toMatchObject({
      status: 400,
      body: { error: "The reviewed underwriting snapshot is invalid." },
    });
  });

  it("returns 409 for a stale underwriting selection", () => {
    const result = regenerateAtlasMemo({
      ...validRequest,
      underwritingSelectionId: atlasInitialSelection.id,
    });
    expect(result).toEqual({
      status: 409,
      body: {
        error: "Underwriting changed; review the latest state before updating.",
      },
    });
  });

  it("returns 200 with a validated, five-section, evidence-linked memo", () => {
    const result = regenerateAtlasMemo(validRequest);
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("Expected a successful result");

    const response = regenerateMemoResponseSchema.parse(result.body);
    expect(response.disclosure).toBe(
      "Composed deterministically from the validated reviewed selection; no live model call was made.",
    );
    expect(response.memo.sections).toHaveLength(5);
    expect(response.memo.sections.map(({ title }) => title)).toEqual([
      "Transaction Overview",
      "Financial Performance & Quality of Earnings",
      "Base / Downside Case",
      "Key Risks & Mitigants",
      "Recommendation",
    ]);
    expect(
      response.memo.sections
        .flatMap((section) => section.claims)
        .every((claim) => claim.evidenceIds.length > 0),
    ).toBe(true);
  });
});
