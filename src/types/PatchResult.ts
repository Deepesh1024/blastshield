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
}

export interface ScanReport {
    issues: BlastIssue[];
    riskScore: number;
}

/** @deprecated Use ScanReport instead */
export interface PatchResult {
    issue: string;
    risk_line: number;
    explanation: string;
    patches: SinglePatch[];
}
