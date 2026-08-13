# Task 1 — Private Equity Memo Intelligence

> A narrow, evidence-first approach to summarizing investment memos, surfacing material risks, and integrating reviewed findings with an existing client system.

This proposal is intentionally separate from the repository's private credit prototype. It addresses a private equity memo-review workflow and optimizes for one trustworthy decision path rather than broad feature coverage.

## Suggested next steps

I would begin with the investment decision and work backward to the minimum data and controls required to support it:

1. Obtain two or three sanitized representative memos and one reviewer-accepted result.
2. Agree on the authoritative-document rule, the acceptance standard for a useful risk, and the intended integration behavior.
3. Implement one narrow source-to-reviewed-finding workflow.
4. Review the result with an investment professional before proposing a wider client-system pilot.

## 1. Three specific client questions

### Question 1 — Which memo version is authoritative?

**What rule should identify the authoritative memo version when competing copies exist: Investment Committee approval, an explicit status in the deal system, or another version rule?**

Technically, this determines ingestion behavior, version reconciliation, and when analysis must stop for human review. For the investment team, it prevents analysis based on assumptions that have already been superseded.

### Question 2 — When should customer concentration trigger a risk?

**For the first demo, what exact revenue-concentration threshold should trigger a risk—for example, the top two customers exceeding 40% of revenue—and must an investment professional confirm that finding before it appears in the Investment Committee memo or is written back to the selected client system?**

Technically, this defines the calculation, evidence fields, review state, and downstream write gate. For the investment team, it anchors the demonstration to a measurable underwriting rule and prevents generic warnings from entering decision materials.

### Question 3 — What should the first integration do?

**For the first integration, which existing system and business object should participate, and should the demonstrated behavior read the authoritative memo, write the reviewed finding, or perform both operations?**

Technically, this defines the adapter boundary and data ownership. Field mappings, API details, authentication, and failure behavior can then be inspected within that boundary. For the client, it preserves mature systems of record while testing the new intelligence layer.

## 2. One demonstration I would build in 24 hours

I would prove one trustworthy decision path from source to reviewed output rather than maximize feature coverage.

### Scope

- One synthetic private equity deal.
- One known, text-native investment memo format.
- One current approved memo and one superseded version.
- One complete review path centered on customer concentration.
- No indexing of the complete document archive.

### What works end to end

```text
Competing memo versions
        ↓
Human authority resolution
        ↓
Section-bounded ingestion with stable document and version IDs
        ↓
Schema-constrained summary, facts, and candidate findings
        ↓
Server-side evidence validation
        ↓
Evidence-linked human review
        ↓
Confirmed finding → integration adapter → audit event
```

The application would show both memo versions and block analysis while the authoritative source remains unresolved. After the current version is selected, the ingestion service would assign stable document and version identifiers, extract section-bounded text, and create evidence records containing the source version, section, and exact excerpt.

I would use the language model to propose structured findings—not to establish source truth or replace investment judgment. A live, schema-constrained request would return an executive summary, material facts, and candidate findings. Each finding would contain a category, materiality, rationale, evidence identifiers, source version, and review state. The server would validate the response and reject evidence identifiers that were not created during ingestion.

### Central demonstration moment

The memo presents strong growth and retention, while a supporting section states that two customers represent 41% of revenue. The application would surface this concentration as a risk to:

- Revenue durability.
- Valuation assumptions.
- The value-creation plan.
- Exit options.

Selecting the finding would open the exact source version, section, and excerpt supporting it. A finding without a valid ingested evidence reference would be marked **Insufficient evidence** and could not be confirmed. This prevents fabricated references; it does not claim the application can determine whether the excerpt supports the interpretation. The investment professional makes that judgment while reviewing the cited text.

The reviewer could confirm, edit, or dismiss the finding. Only a confirmed finding could pass through the integration adapter. An audit event would record the source version, original finding, reviewer action, final state, time, and synchronization result.

### Working boundary

Document parsing, version resolution, the language-model request, schema validation, evidence navigation, review state, and audit recording would genuinely work. The documents would be static synthetic data. The durable output would be the structured finding and its provenance, not only generated prose—creating a path from one memo review to reusable institutional knowledge.

## 3. Two things I would mock

For the demonstration, I would mock unavailable external dependencies while keeping the integration boundaries and contracts real.

### Mock 1 — Existing-system connector

I would implement a vendor-neutral local adapter with typed request and response contracts, validation, and deterministic success and failure results. It would simulate reading memo metadata or writing a confirmed finding without claiming access to client systems or data.

This allows the client to evaluate the integration boundary while its existing platform remains authoritative.

### Mock 2 — Enterprise identity and deal permissions

I would use one fixed investment professional with reviewer rights and a simulated deal-permission check. The production design would identify where enterprise authentication, user provisioning, tenant isolation, and deal-level authorization apply.

This preserves the review control point without presenting prototype controls as production-ready.

## 4. One thing I would explicitly ignore

### Historical portfolio-wide semantic search

Trustworthy search across the complete archive requires entity resolution, authoritative-document rules, version reconciliation, and permission-aware retrieval. Building those foundations would consume the demonstration budget without improving validation of the selected memo-review workflow.

The client first needs evidence that one important decision path is reliable. Expanding coverage before proving that path would create breadth without trust.

## 5. One key technical or product risk

### Analyzing the wrong source version correctly

For this workflow, source correctness is a more fundamental trust boundary than model sophistication.

- **Failure mechanism:** The service selects a superseded memo and analyzes it correctly. Its extraction and evidence references may be valid for that document while the result is still wrong for the current investment decision.
- **Investment consequence:** An Investment Committee could rely on superseded assumptions because the output appears well supported. One such incident could distort judgment and damage confidence in the product.
- **Mitigation:** Store immutable document and version identifiers; display approval and freshness metadata; surface competing versions; link every material claim to source evidence; refuse to continue while authority is unresolved; and require reviewer confirmation before downstream use.
