import * as vscode from 'vscode';
import { ScanReport } from '../types/PatchResult';

/** A snapshot of one scan's key metrics, stored in history */
export interface ScanSnapshot {
    timestamp: number;
    scanId?: string;
    riskScore: number;
    issueCount: number;
    severityCounts: { critical: number; high: number; medium: number; low: number };
    filesScanned?: number;
    durationMs?: number;
    llmTokensUsed?: number;
    deterministic?: boolean;
    /** Per-rule weighted scores from risk_breakdown */
    violationScores: { rule_id: string; severity: string; score: number; blast: number }[];
}

/** Delta between current and previous scan */
export interface ScanDelta {
    riskScore: number;       // positive = worsened, negative = improved
    issueCount: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    newRules: string[];      // rules that appeared
    resolvedRules: string[]; // rules that disappeared
}

const HISTORY_KEY = 'blastshield.scanHistory';
const MAX_HISTORY = 20;

let history: ScanSnapshot[] = [];
let extensionContext: vscode.ExtensionContext | null = null;

/** Initialize scan history from VS Code global state */
export function initScanHistory(context: vscode.ExtensionContext) {
    extensionContext = context;
    history = context.globalState.get<ScanSnapshot[]>(HISTORY_KEY, []);
}

/** Get the full scan history (oldest first) */
export function getScanHistory(): ScanSnapshot[] {
    return history;
}

/** Get the previous scan snapshot (or null if this is the first scan) */
export function getPreviousSnapshot(): ScanSnapshot | null {
    return history.length > 0 ? history[history.length - 1] : null;
}

/** Record a new scan and compute delta from previous */
export function recordScan(report: ScanReport, scanId?: string): ScanDelta | null {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of report.issues ?? []) {
        const sev = issue.severity ?? 'low';
        if (sev in counts) { counts[sev as keyof typeof counts]++; }
    }

    const violationScores = (report.risk_breakdown?.violation_contributions ?? []).map(vc => ({
        rule_id: vc.rule_id,
        severity: vc.severity,
        score: vc.weighted_score,
        blast: vc.blast_radius_factor ?? 1
    }));

    const snapshot: ScanSnapshot = {
        timestamp: Date.now(),
        scanId,
        riskScore: report.riskScore ?? 0,
        issueCount: (report.issues ?? []).length,
        severityCounts: counts,
        filesScanned: report.audit?.files_scanned,
        durationMs: report.audit?.duration_ms,
        llmTokensUsed: report.audit?.llm_tokens_used,
        deterministic: report.deterministic_only,
        violationScores
    };

    // Compute delta from previous
    const prev = getPreviousSnapshot();
    let delta: ScanDelta | null = null;

    if (prev) {
        const prevRules = new Set(prev.violationScores.map(v => v.rule_id));
        const currRules = new Set(violationScores.map(v => v.rule_id));

        delta = {
            riskScore: snapshot.riskScore - prev.riskScore,
            issueCount: snapshot.issueCount - prev.issueCount,
            critical: counts.critical - prev.severityCounts.critical,
            high: counts.high - prev.severityCounts.high,
            medium: counts.medium - prev.severityCounts.medium,
            low: counts.low - prev.severityCounts.low,
            newRules: [...currRules].filter(r => !prevRules.has(r)),
            resolvedRules: [...prevRules].filter(r => !currRules.has(r))
        };
    }

    // Push and cap history
    history.push(snapshot);
    if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
    }

    // Persist
    if (extensionContext) {
        extensionContext.globalState.update(HISTORY_KEY, history);
    }

    return delta;
}
