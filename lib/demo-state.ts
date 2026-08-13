import type {
  AuditEvent,
  MemoVersion,
  UnderwritingSelection,
} from "./domain";
import { atlasInitialSelection, atlasMemoV2 } from "./fixtures";

export type ViewKey = "deals" | "overview" | "securities" | "diligence" | "memo";

export interface DemoState {
  view: ViewKey;
  selection: UnderwritingSelection;
  memoVersions: MemoVersion[];
  currentMemoVersion: number;
  auditEvents: AuditEvent[];
  activeEvidenceId: string | null;
  showMemoDiff: boolean;
  generationStatus: "idle" | "loading" | "error";
  generationError: string | null;
}

export type DemoAction =
  | { type: "NAVIGATE"; view: ViewKey }
  | { type: "OPEN_EVIDENCE"; evidenceId: string }
  | { type: "CLOSE_EVIDENCE" }
  | { type: "CONFIRM_QOE"; selection: UnderwritingSelection; auditEvent: AuditEvent }
  | { type: "TOGGLE_MEMO_DIFF" }
  | { type: "MEMO_GENERATION_STARTED" }
  | { type: "MEMO_GENERATION_SUCCEEDED"; memo: MemoVersion; auditEvent: AuditEvent }
  | { type: "MEMO_GENERATION_FAILED"; message: string }
  | { type: "RESET" };

export function createInitialDemoState(): DemoState {
  return {
    view: "deals",
    selection: atlasInitialSelection,
    memoVersions: [atlasMemoV2],
    currentMemoVersion: 2,
    auditEvents: [],
    activeEvidenceId: null,
    showMemoDiff: false,
    generationStatus: "idle",
    generationError: null,
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, view: action.view, activeEvidenceId: null, showMemoDiff: false };
    case "OPEN_EVIDENCE":
      return { ...state, activeEvidenceId: action.evidenceId };
    case "CLOSE_EVIDENCE":
      return { ...state, activeEvidenceId: null };
    case "CONFIRM_QOE":
      if (state.selection.id === action.selection.id) return state;
      return {
        ...state,
        selection: action.selection,
        auditEvents: [...state.auditEvents, action.auditEvent],
      };
    case "TOGGLE_MEMO_DIFF":
      return { ...state, showMemoDiff: !state.showMemoDiff };
    case "MEMO_GENERATION_STARTED":
      return { ...state, generationStatus: "loading", generationError: null };
    case "MEMO_GENERATION_SUCCEEDED":
      if (state.memoVersions.some((memo) => memo.version === action.memo.version)) {
        return { ...state, generationStatus: "idle", generationError: null };
      }
      return {
        ...state,
        memoVersions: [...state.memoVersions, action.memo],
        currentMemoVersion: action.memo.version,
        auditEvents: [...state.auditEvents, action.auditEvent],
        generationStatus: "idle",
        generationError: null,
        showMemoDiff: false,
      };
    case "MEMO_GENERATION_FAILED":
      return { ...state, generationStatus: "error", generationError: action.message };
    case "RESET":
      return createInitialDemoState();
    default:
      return state;
  }
}
