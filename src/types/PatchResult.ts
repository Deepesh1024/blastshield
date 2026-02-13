export interface SinglePatch {
    file: string;
    start_line: number;
    end_line: number;
    new_code: string;
}

export interface BlastIssue {
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    file: string;
    issue: string;
    explanation: string;
    risk: string;
    patches: SinglePatch[];
    testImpact: string[];
    /** Exact line number from AST analysis (v2.0.0+) */
    line?: number;
    /** Deterministic rule that detected the issue (v2.0.0+) */
    rule_id?: string;
    /** Deterministic proof chain (v2.0.0+) */
    evidence?: string[];
}

export interface ViolationContribution {
    rule_id: string;
    severity: string;
    weighted_score: number;
    blast_radius_factor?: number;
    description?: string;
}

export interface RiskBreakdown {
    total_score: number;
    formula: string;
    violation_contributions: ViolationContribution[];
}

export interface ScanAudit {
    scan_id: string;
    files_scanned: number;
    violations_found: number;
    duration_ms: number;
    llm_tokens_used: number;
}

export interface ScanReport {
    issues: BlastIssue[];
    riskScore: number;
    /** Overall scan summary text (v2.0.0+) */
    summary?: string;
    /** Explainable risk scoring breakdown (v2.0.0+) */
    risk_breakdown?: RiskBreakdown;
    /** true = deterministic only, false = AI-assisted (v2.0.0+) */
    deterministic_only?: boolean;
    /** Scan metadata (v2.0.0+) */
    audit?: ScanAudit;
}

/** Top-level scan response wrapper (v2.0.0+) */
export interface ScanResponse {
    message: string;
    scan_id?: string;
    report?: ScanReport;
    detail?: string;
}

/** @deprecated Use ScanReport instead */
export interface PatchResult {
    issue: string;
    risk_line: number;
    explanation: string;
    patches: SinglePatch[];
}
