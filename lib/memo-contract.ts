import { z } from "zod";

export const regenerateMemoRequestSchema = z.object({
  dealId: z.string().min(1),
  sourceMemoVersion: z.number().int().positive(),
  underwritingSelectionId: z.string().min(1),
}).strict();

export type RegenerateMemoRequest = z.infer<typeof regenerateMemoRequestSchema>;

const semanticOriginSchema = z.enum([
  "source_observation",
  "system_composed",
  "model_drafted",
  "human_entered",
  "human_confirmed",
]);

const memoClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  semanticOrigin: semanticOriginSchema,
  materializationSource: z.literal("runtime"),
  evidenceIds: z.array(z.string().min(1)).min(1),
  assertionIds: z.array(z.string().min(1)).optional(),
  findingId: z.string().min(1).optional(),
}).strict();

const memoSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().min(1).max(5),
  body: z.string().min(1),
  semanticOrigin: semanticOriginSchema,
  materializationSource: z.literal("runtime"),
  claims: z.array(memoClaimSchema),
}).strict();

export const regenerateMemoResponseSchema = z.object({
  memo: z.object({
    id: z.literal("memo-atlas-v3"),
    dealId: z.literal("atlas"),
    version: z.literal(3),
    label: z.literal("Draft v3"),
    immutable: z.literal(true),
    materializationSource: z.literal("runtime"),
    basedOnUnderwritingRevision: z.literal(2),
    underwritingSelectionId: z.literal("selection-atlas-ebitda-r2"),
    sourceMemoVersionId: z.literal("memo-atlas-v2"),
    createdAt: z.string().datetime(),
    createdBy: z.string().min(1),
    metrics: z.object({
      netDebtUsdM: z.literal(132),
      underwritingEbitdaUsdM: z.literal(30),
      covenantLeverageX: z.literal(5.75),
      downsidePct: z.literal(0.2),
      baseLeverageX: z.literal(4.4),
      downsideEbitdaUsdM: z.literal(24),
      downsideLeverageX: z.literal(5.5),
      covenantHeadroomX: z.literal(0.25),
    }).strict(),
    sections: z.array(memoSectionSchema).length(5),
  }).strict(),
  disclosure: z.literal("Composed deterministically from the validated reviewed selection; no live model call was made."),
}).strict();
