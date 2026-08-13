export type CurrencyCode = "USD";

export type DealStage =
  | "screening"
  | "diligence"
  | "investment_committee"
  | "closed";

export type DealStatus = "active" | "preview";

export type SecurityType = "term_loan" | "revolver";
export type DocumentKind =
  | "management_materials"
  | "quality_of_earnings"
  | "customer_schedule"
  | "credit_agreement";
export type DocumentApprovalStatus = "draft" | "reviewed" | "approved";
export type DiligenceCategory =
  | "financial"
  | "commercial"
  | "legal"
  | "technology"
  | "management";
export type DiligenceStatus = "not_started" | "in_progress" | "complete";
export type ReviewStatus = "needs_review" | "confirmed" | "dismissed";
export type RiskStatus = "open" | "resolved";
export type Severity = "high" | "medium" | "low";
export type SemanticOrigin =
  | "source_observation"
  | "system_composed"
  | "model_drafted"
  | "human_entered"
  | "human_confirmed";
export type MaterializationSource = "static_demo_data" | "runtime";
export type MetricKey = "ebitda" | "net_debt" | "covenant_leverage";

export interface BorrowerCompany {
  id: string;
  name: string;
  sector: string;
}

/**
 * Monetary fields use USD millions, percentages use decimal fractions, and
 * leverage fields use turns. The unit suffixes keep those contracts visible.
 */
export interface Deal {
  id: string;
  slug: string;
  name: string;
  borrowerId: string;
  sponsor: string;
  sector: string;
  stage: DealStage;
  status: DealStatus;
  overview: string;
  currency: CurrencyCode;
  netDebtUsdM: number;
  covenantLeverageX: number;
  downsidePct: number;
  /** Structured observations that support the code-owned finance inputs. */
  financialAssertionIds?: Readonly<{
    netDebt: string;
    covenantLeverage: string;
  }>;
}

export interface Security {
  id: string;
  dealId: string;
  name: string;
  type: SecurityType;
  lien: "first_lien";
  commitmentUsdM: number;
  drawnUsdM: number;
  spreadBps: number;
  floorPct: number;
  maturityDate: string;
  amortizationPct: number;
}

export interface Document {
  id: string;
  dealId: string;
  name: string;
  kind: DocumentKind;
  currentVersionId: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionLabel: string;
  approvalStatus: DocumentApprovalStatus;
  effectiveDate: string;
  isSynthetic: true;
  materializationSource: MaterializationSource;
  sections: readonly string[];
}

export interface Evidence {
  id: string;
  dealId: string;
  documentVersionId: string;
  sectionLabel: string;
  excerpt: string;
  semanticOrigin: "source_observation";
  materializationSource: MaterializationSource;
  isSynthetic: true;
}

/**
 * A source assertion is an immutable observation from a particular source.
 * Competing assertions coexist; a reviewer chooses between them through an
 * UnderwritingSelection instead of overwriting source data.
 */
export interface SourceAssertion {
  id: string;
  dealId: string;
  metric: MetricKey;
  label: string;
  value: number;
  unit: "usd_m" | "turns";
  period: string;
  evidenceIds: readonly string[];
  semanticOrigin: "source_observation";
  materializationSource: MaterializationSource;
}

export interface UnderwritingSelection {
  id: string;
  dealId: string;
  metric: "ebitda";
  selectedAssertionId: string;
  selectedBy: string;
  selectedAt: string;
  rationale: string;
  revision: number;
  semanticOrigin: "human_confirmed";
  materializationSource: MaterializationSource;
}

export interface DiligenceItem {
  id: string;
  dealId: string;
  title: string;
  category: DiligenceCategory;
  status: DiligenceStatus;
  progressPct: number;
  documentIds: readonly string[];
  findingIds: readonly string[];
}

/** Review status and economic risk status are deliberately independent. */
export interface Finding {
  id: string;
  kind: "risk";
  dealId: string;
  diligenceItemId: string;
  title: string;
  summary: string;
  implication: string;
  mitigant: string;
  severity: Severity;
  reviewStatus: ReviewStatus;
  riskStatus: RiskStatus;
  semanticOrigin: SemanticOrigin;
  materializationSource: MaterializationSource;
  evidenceIds: readonly string[];
}

export interface MemoClaim {
  readonly id: string;
  readonly text: string;
  readonly semanticOrigin: SemanticOrigin;
  readonly materializationSource: MaterializationSource;
  readonly evidenceIds: readonly string[];
  readonly assertionIds?: readonly string[];
  readonly findingId?: string;
}

export interface MemoSection {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly body: string;
  readonly semanticOrigin: SemanticOrigin;
  readonly materializationSource: MaterializationSource;
  readonly claims: readonly MemoClaim[];
}

export interface FinanceInputs {
  netDebtUsdM: number;
  underwritingEbitdaUsdM: number;
  covenantLeverageX: number;
  downsidePct: number;
}

export interface CalculatedMetrics extends FinanceInputs {
  baseLeverageX: number;
  downsideEbitdaUsdM: number;
  downsideLeverageX: number;
  covenantHeadroomX: number;
}

export interface MemoVersion {
  readonly id: string;
  readonly dealId: string;
  readonly label: string;
  readonly version: number;
  readonly immutable: true;
  readonly materializationSource: MaterializationSource;
  readonly basedOnUnderwritingRevision: number;
  readonly underwritingSelectionId: string;
  readonly sourceMemoVersionId?: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly metrics: CalculatedMetrics;
  readonly sections: readonly MemoSection[];
}

export type AuditValue = string | number | boolean | null;

export interface AuditEvent {
  id: string;
  dealId: string;
  actor: string;
  occurredAt: string;
  action: "underwriting_selection.changed" | "memo.regenerated";
  entityType: "underwriting_selection" | "memo_version";
  entityId: string;
  before: Readonly<Record<string, AuditValue>>;
  after: Readonly<Record<string, AuditValue>>;
}
