import * as vscode from "vscode";
import { ScanReport, BlastIssue, RiskBreakdown } from "../types/PatchResult";
import { ScanSnapshot, ScanDelta } from "../scan/scanHistory";

let blastView: vscode.WebviewView | null = null;
let lastScan: ScanReport | null = null;
let lastScanId: string | undefined;
let lastHistory: ScanSnapshot[] = [];
let lastDelta: ScanDelta | null = null;

export function registerPanel(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "blastshieldView",
            new BlastShieldPanelProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function updateBlastShieldPanel(
    result: ScanReport,
    scanId?: string,
    history?: ScanSnapshot[],
    delta?: ScanDelta | null
) {
    lastScan = result;
    lastScanId = scanId;
    lastHistory = history ?? [];
    lastDelta = delta ?? null;
    if (!blastView) { return; }
    blastView.webview.html = buildHtml(result, scanId, lastHistory, lastDelta);
}

export function getLastScanResult(): ScanReport | null {
    return lastScan;
}

// ── Webview Provider ────────────────────────────────────────

class BlastShieldPanelProvider implements vscode.WebviewViewProvider {
    constructor(private ctx: vscode.ExtensionContext) { }

    resolveWebviewView(view: vscode.WebviewView) {
        blastView = view;
        view.webview.options = { enableScripts: true };

        view.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case "scanProject":
                case "rescan":
                    vscode.commands.executeCommand("blastshield.scan");
                    break;
                case "fixIssue":
                    if (lastScan) { vscode.commands.executeCommand("blastshield.fixIssue", msg.issueId); }
                    break;
                case "viewDiff":
                    if (lastScan) { vscode.commands.executeCommand("blastshield.viewIssueDiff", msg.issueId); }
                    break;
                case "fixAll":
                    if (lastScan) { vscode.commands.executeCommand("blastshield.fixAll"); }
                    break;
            }
        });

        // Show placeholder until first scan
        view.webview.html = buildEmptyHtml();
    }
}

// ── HTML builders ───────────────────────────────────────────

function buildEmptyHtml(): string {
    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8">
    <style>
        body {
            padding: 1.2rem;
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family), sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
        }
        .shield-icon {
            opacity: 0.7;
            animation: pulse 2.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.9; transform: scale(1.05); }
        }
        .scan-btn {
            margin-top: 1.5rem;
            padding: 12px 28px;
            font-size: 14px;
            font-weight: 600;
            color: #fff;
            background: linear-gradient(135deg, #0078d4, #00b4d8);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            letter-spacing: 0.3px;
        }
        .scan-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(0, 120, 212, 0.4);
            background: linear-gradient(135deg, #006abc, #009ec3);
        }
        .scan-btn:active { transform: translateY(0); }
        .subtitle {
            font-size: 0.82rem;
            opacity: 0.55;
            margin-top: 0.6rem;
            text-align: center;
            line-height: 1.5;
        }
    </style>
    </head>
    <body>
        <div class="shield-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
        </div>
        <h3 style="margin-top:0.8rem;margin-bottom:0;">BlastShield</h3>
        <p class="subtitle">AI-powered deployment safety</p>
        <button class="scan-btn" onclick="scanRepo()">Scan This Repo</button>
        <p class="subtitle">Detects production-breaking failures<br/>before they ship.</p>
        <script>
            const vscode = acquireVsCodeApi();
            function scanRepo() { vscode.postMessage({ type: 'scanProject' }); }
        </script>
    </body>
    </html>`;
}

function buildHtml(
    report: ScanReport,
    scanId?: string,
    history: ScanSnapshot[] = [],
    delta: ScanDelta | null = null
): string {
    const issues = report.issues ?? [];
    const riskScore = report.riskScore ?? 0;

    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
        const sev = issue.severity ?? "low";
        if (sev in counts) { counts[sev as keyof typeof counts]++; }
    }

    const detBadge = report.deterministic_only !== undefined
        ? (report.deterministic_only
            ? `<span class="det-badge deterministic">🔒 Deterministic</span>`
            : `<span class="det-badge ai-assisted">🤖 AI-Assisted</span>`)
        : "";

    const summaryHtml = buildSummaryHtml(issues.length, counts, riskScore, report.summary);

    // ── Graphs Section ──
    const graphsHtml = buildGraphsSection(riskScore, counts, report, history, delta);

    const riskBreakdownHtml = report.risk_breakdown
        ? buildRiskBreakdownHtml(report.risk_breakdown)
        : "";

    const issueCards = issues.map((issue, i) => buildIssueCard(issue, i)).join("");

    const fixAllHtml = issues.length > 1 ? `
        <button class="fix-all-btn" onclick="fixAll()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Fix All ${issues.length} Issues
        </button>` : "";

    const auditHtml = buildAuditFooterHtml(report, scanId);

    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            padding: 0.6rem;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-editor-foreground);
        }

        /* ── Header ── */
        .panel-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 0.2rem 0.7rem;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 0.7rem;
            flex-wrap: wrap;
        }
        .panel-header svg { opacity: 0.8; }
        .panel-header h2 { font-size: 1rem; font-weight: 600; }
        .issue-count {
            margin-left: auto;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        /* ── Badges ── */
        .det-badge {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.3px;
        }
        .det-badge.deterministic {
            background: linear-gradient(135deg, #1b5e20, #388e3c);
            color: #c8e6c9;
        }
        .det-badge.ai-assisted {
            background: linear-gradient(135deg, #4a148c, #7b1fa2);
            color: #e1bee7;
        }

        /* ── Summary ── */
        .summary-section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 0.7rem;
            margin-bottom: 0.8rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .summary-title {
            font-size: 0.82rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            opacity: 0.85;
        }
        .summary-text {
            font-size: 0.8rem;
            line-height: 1.5;
            margin-bottom: 0.5rem;
            opacity: 0.9;
            padding: 0.3rem 0;
        }
        .severity-chips {
            display: flex;
            gap: 0.35rem;
            flex-wrap: wrap;
            margin-bottom: 0.5rem;
        }
        .sev-chip {
            font-size: 0.72rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;
            color: #fff;
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }
        .sev-chip.critical { background: #c62828; }
        .sev-chip.high     { background: #e65100; }
        .sev-chip.medium   { background: #283593; }
        .sev-chip.low      { background: #2e7d32; }

        .risk-bar-container { margin-top: 0.3rem; }
        .risk-label {
            font-size: 0.78rem;
            font-weight: 600;
            margin-bottom: 3px;
            display: flex;
            justify-content: space-between;
        }
        .risk-bar {
            height: 6px;
            border-radius: 3px;
            background: var(--vscode-panel-border);
            overflow: hidden;
        }
        .risk-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.6s ease;
        }

        /* ── Graphs Section ── */
        .graphs-section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin-bottom: 0.8rem;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .graphs-section > summary {
            padding: 0.6rem 0.7rem;
            font-weight: 600;
            font-size: 0.82rem;
            cursor: pointer;
            user-select: none;
            opacity: 0.9;
        }
        .graphs-body {
            padding: 0 0.7rem 0.7rem;
        }
        .graph-row {
            display: flex;
            gap: 0.6rem;
            margin-bottom: 0.6rem;
            flex-wrap: wrap;
        }
        .graph-card {
            flex: 1;
            min-width: 100px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 0.5rem;
            text-align: center;
        }
        .graph-card-title {
            font-size: 0.68rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.6;
            margin-bottom: 0.3rem;
        }
        .graph-card svg { display: block; margin: 0 auto; }

        /* Stats cards */
        .stats-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.4rem;
            margin-bottom: 0.5rem;
        }
        .stat-card {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 0.5rem;
            text-align: center;
        }
        .stat-value {
            font-size: 1.1rem;
            font-weight: 700;
        }
        .stat-label {
            font-size: 0.65rem;
            opacity: 0.6;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            margin-top: 2px;
        }
        .stat-delta {
            font-size: 0.65rem;
            font-weight: 600;
            margin-top: 2px;
        }
        .delta-up { color: #ef5350; }
        .delta-down { color: #66bb6a; }
        .delta-same { color: #888; }

        /* Trend */
        .trend-section {
            margin-top: 0.5rem;
        }
        .trend-title {
            font-size: 0.72rem;
            font-weight: 600;
            opacity: 0.7;
            margin-bottom: 0.3rem;
        }

        /* Bar chart */
        .bar-chart { margin-top: 0.3rem; }
        .bar-row {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            margin-bottom: 3px;
            font-size: 0.7rem;
        }
        .bar-rule {
            width: 80px;
            text-align: right;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 0.65rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            opacity: 0.8;
        }
        .bar-track {
            flex: 1;
            height: 12px;
            background: var(--vscode-panel-border);
            border-radius: 3px;
            overflow: hidden;
        }
        .bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.5s ease;
        }
        .bar-score {
            width: 30px;
            text-align: right;
            font-weight: 600;
            font-size: 0.68rem;
        }

        /* ── Risk Breakdown ── */
        .risk-breakdown {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin-bottom: 0.8rem;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .risk-breakdown summary {
            padding: 0.6rem 0.7rem;
            font-weight: 600;
            font-size: 0.82rem;
            cursor: pointer;
            user-select: none;
            opacity: 0.9;
        }
        .risk-breakdown-body { padding: 0 0.7rem 0.7rem; }
        .formula-text {
            font-size: 0.76rem;
            font-family: var(--vscode-editor-font-family), monospace;
            background: var(--vscode-textCodeBlock-background);
            padding: 0.4rem;
            border-radius: 4px;
            margin-bottom: 0.5rem;
            overflow-x: auto;
        }
        .contrib-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.76rem;
        }
        .contrib-table th {
            text-align: left;
            padding: 4px 6px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
            opacity: 0.7;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .contrib-table td {
            padding: 4px 6px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .contrib-table tr:last-child td { border-bottom: none; }

        /* ── Rescan ── */
        .rescan-btn {
            width: 100%;
            padding: 0.55rem;
            margin-bottom: 0.5rem;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            color: #fff;
            background: linear-gradient(135deg, #0078d4, #00b4d8);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            transition: opacity 0.2s, transform 0.1s;
        }
        .rescan-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .rescan-btn:active { transform: translateY(0); }

        /* ── Fix All ── */
        .fix-all-btn {
            width: 100%;
            padding: 0.6rem;
            margin-bottom: 0.8rem;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            color: #fff;
            background: linear-gradient(135deg, #c2185b, #e91e63);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            transition: opacity 0.2s, transform 0.1s;
        }
        .fix-all-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .fix-all-btn:active { transform: translateY(0); }

        /* ── Cards ── */
        .card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin-bottom: 0.7rem;
            overflow: hidden;
            background: var(--vscode-editor-background);
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out both;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        .card-header {
            padding: 0.55rem 0.7rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #fff;
            font-weight: 600;
            font-size: 0.82rem;
        }
        .card-header.critical { background: linear-gradient(135deg, #b71c1c, #e53935); }
        .card-header.high     { background: linear-gradient(135deg, #e65100, #fb8c00); }
        .card-header.medium   { background: linear-gradient(135deg, #283593, #5c6bc0); }
        .card-header.low      { background: linear-gradient(135deg, #2e7d32, #66bb6a); }

        .severity-badge {
            font-size: 0.65rem;
            padding: 1px 6px;
            border-radius: 3px;
            background: rgba(255,255,255,0.22);
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        .rule-tag {
            font-size: 0.62rem;
            padding: 1px 5px;
            border-radius: 3px;
            background: rgba(255,255,255,0.15);
            font-family: var(--vscode-editor-font-family), monospace;
            letter-spacing: 0.3px;
            flex-shrink: 0;
            border: 1px solid rgba(255,255,255,0.25);
        }
        .issue-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .card-body { padding: 0.7rem; }

        .meta-row {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.3rem;
            font-size: 0.82rem;
        }
        .meta-label {
            font-weight: 600;
            opacity: 0.7;
            min-width: 36px;
        }
        .meta-value {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .section {
            margin-top: 0.5rem;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 0.4rem;
        }
        .section summary {
            cursor: pointer;
            font-weight: 600;
            font-size: 0.8rem;
            opacity: 0.85;
            padding: 0.2rem 0;
            user-select: none;
        }
        .explanation-text {
            font-size: 0.82rem;
            line-height: 1.45;
            margin-top: 0.3rem;
            opacity: 0.9;
        }
        .risk-text {
            font-size: 0.82rem;
            line-height: 1.45;
            margin-top: 0.3rem;
            opacity: 0.9;
            color: #ef5350;
        }
        .code-block {
            margin-top: 0.3rem;
            padding: 0.5rem;
            border-radius: 5px;
            background: var(--vscode-textCodeBlock-background);
            font-family: var(--vscode-editor-font-family), 'Fira Code', 'Cascadia Code', monospace;
            font-size: 0.78rem;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
        }

        .evidence-list {
            list-style: none;
            padding: 0;
            margin: 0.3rem 0 0;
        }
        .evidence-item {
            font-size: 0.78rem;
            padding: 3px 0;
            opacity: 0.9;
            line-height: 1.4;
            display: flex;
            gap: 0.4rem;
            align-items: flex-start;
        }
        .evidence-item::before {
            content: "⚙";
            flex-shrink: 0;
            opacity: 0.7;
        }

        .test-impact {
            margin-top: 0.4rem;
            padding-top: 0.4rem;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .test-impact-title {
            font-size: 0.78rem;
            font-weight: 600;
            opacity: 0.8;
            margin-bottom: 0.25rem;
        }
        .test-item {
            font-size: 0.76rem;
            padding: 1px 0;
            opacity: 0.85;
            font-family: var(--vscode-editor-font-family), monospace;
        }
        .test-item::before {
            content: "✔ ";
            color: #66bb6a;
        }

        .btn-row {
            display: flex;
            gap: 0.4rem;
            margin-top: 0.65rem;
        }
        .btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.3rem;
            padding: 0.4rem 0.6rem;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: 500;
            color: #fff;
            transition: opacity 0.15s, transform 0.1s;
        }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .btn-apply  { background: linear-gradient(135deg, #2e7d32, #43a047); }
        .btn-review { background: linear-gradient(135deg, #0277bd, #039be5); }

        .audit-footer {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 0.6rem 0.7rem;
            margin-top: 0.8rem;
            font-size: 0.72rem;
            opacity: 0.75;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.2rem 0.8rem;
        }
        .audit-footer .audit-item {
            display: flex;
            gap: 0.3rem;
        }
        .audit-footer .audit-label { font-weight: 600; }
        .audit-footer .audit-full {
            grid-column: 1 / -1;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 0.68rem;
            opacity: 0.6;
            word-break: break-all;
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
    </style>
    </head>
    <body>
        <div class="panel-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h2>BlastShield</h2>
            ${detBadge}
            <span class="issue-count">${issues.length} issue${issues.length !== 1 ? "s" : ""}</span>
        </div>

        ${summaryHtml}

        ${graphsHtml}

        ${riskBreakdownHtml}

        <button class="rescan-btn" onclick="rescan()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Rescan Project
        </button>

        ${fixAllHtml}

        ${issueCards}

        ${issues.length > 1 ? `
        <button class="fix-all-btn" onclick="fixAll()" style="margin-top:0.3rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Fix All ${issues.length} Issues
        </button>` : ""}

        ${auditHtml}

        <script>
            const vscode = acquireVsCodeApi();
            function fixIssue(id)  { vscode.postMessage({ type: "fixIssue",  issueId: id }); }
            function viewDiff(id)  { vscode.postMessage({ type: "viewDiff",  issueId: id }); }
            function fixAll()      { vscode.postMessage({ type: "fixAll" }); }
            function rescan()      { vscode.postMessage({ type: "rescan" }); }
        </script>
    </body>
    </html>`;
}

// ── Summary ─────────────────────────────────────────────────

function buildSummaryHtml(
    total: number,
    counts: { critical: number; high: number; medium: number; low: number },
    riskScore: number,
    summaryText?: string
): string {
    const riskColor = riskScore >= 70 ? "#e53935"
        : riskScore >= 40 ? "#fb8c00"
            : "#66bb6a";

    const chips = [
        counts.critical > 0 ? `<span class="sev-chip critical">${counts.critical} Critical</span>` : "",
        counts.high > 0 ? `<span class="sev-chip high">${counts.high} High</span>` : "",
        counts.medium > 0 ? `<span class="sev-chip medium">${counts.medium} Medium</span>` : "",
        counts.low > 0 ? `<span class="sev-chip low">${counts.low} Low</span>` : "",
    ].filter(Boolean).join("");

    const summaryParagraph = summaryText
        ? `<div class="summary-text">${escapeHtml(summaryText)}</div>`
        : "";

    return `
    <div class="summary-section">
        <div class="summary-title">Project Summary</div>
        ${summaryParagraph}
        <div class="severity-chips">${chips}</div>
        <div class="risk-bar-container">
            <div class="risk-label">
                <span>Risk Score</span>
                <span style="color:${riskColor}">${riskScore}/100</span>
            </div>
            <div class="risk-bar">
                <div class="risk-fill" style="width:${riskScore}%;background:${riskColor};"></div>
            </div>
        </div>
    </div>`;
}

// ── Graphs Section ──────────────────────────────────────────

function buildGraphsSection(
    riskScore: number,
    counts: { critical: number; high: number; medium: number; low: number },
    report: ScanReport,
    history: ScanSnapshot[],
    delta: ScanDelta | null
): string {
    const gaugeHtml = buildRiskGaugeSvg(riskScore, delta);
    const donutHtml = buildSeverityDonutSvg(counts, delta);
    const barChartHtml = buildViolationBarChart(report);
    const statsHtml = buildStatsCards(report, delta);
    const trendHtml = history.length > 1 ? buildTrendLine(history) : "";

    return `
    <details class="graphs-section" open>
        <summary>📈 Scan Analytics</summary>
        <div class="graphs-body">
            ${statsHtml}
            <div class="graph-row">
                <div class="graph-card">
                    <div class="graph-card-title">Risk Score</div>
                    ${gaugeHtml}
                </div>
                <div class="graph-card">
                    <div class="graph-card-title">Severity</div>
                    ${donutHtml}
                </div>
            </div>
            ${barChartHtml}
            ${trendHtml}
        </div>
    </details>`;
}

// ── Risk Gauge (semicircular SVG) ───────────────────────────

function buildRiskGaugeSvg(score: number, delta: ScanDelta | null): string {
    const cx = 60, cy = 55, r = 40;
    const startAngle = Math.PI;
    const endAngle = 0;
    const scoreAngle = Math.PI - (score / 100) * Math.PI;

    const bgArcD = describeArc(cx, cy, r, startAngle, endAngle);
    const scoreArcD = describeArc(cx, cy, r, startAngle, scoreAngle);

    const color = score >= 70 ? "#e53935" : score >= 40 ? "#fb8c00" : "#66bb6a";

    const circumference = Math.PI * r;
    const scoreLen = (score / 100) * circumference;
    const bgLen = circumference;

    const deltaHtml = delta
        ? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="8" font-weight="600" fill="${delta.riskScore > 0 ? '#ef5350' : delta.riskScore < 0 ? '#66bb6a' : '#888'}">${delta.riskScore > 0 ? '▲' : delta.riskScore < 0 ? '▼' : '—'} ${Math.abs(delta.riskScore)}</text>`
        : "";

    return `
    <svg width="120" height="75" viewBox="0 0 120 75">
        <path d="${bgArcD}" fill="none" stroke="rgba(128,128,128,0.2)" stroke-width="8" stroke-linecap="round"/>
        <path d="${scoreArcD}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round">
            <animate attributeName="stroke-dasharray" from="0 ${bgLen}" to="${scoreLen} ${bgLen}" dur="0.8s" fill="freeze"/>
        </path>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="18" font-weight="700" fill="${color}">${score}</text>
        ${deltaHtml}
    </svg>`;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy - r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy - r * Math.sin(endAngle);
    const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

// ── Severity Donut (SVG) ────────────────────────────────────

function buildSeverityDonutSvg(
    counts: { critical: number; high: number; medium: number; low: number },
    delta: ScanDelta | null
): string {
    const cx = 50, cy = 42, r = 30;
    const total = counts.critical + counts.high + counts.medium + counts.low;

    if (total === 0) {
        return `
        <svg width="100" height="90" viewBox="0 0 100 90">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(128,128,128,0.2)" stroke-width="10"/>
            <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#66bb6a">✓</text>
            <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="7" opacity="0.6">Clean</text>
        </svg>`;
    }

    const segments = [
        { count: counts.critical, color: "#e53935", label: "C" },
        { count: counts.high, color: "#fb8c00", label: "H" },
        { count: counts.medium, color: "#5c6bc0", label: "M" },
        { count: counts.low, color: "#66bb6a", label: "L" }
    ].filter(s => s.count > 0);

    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const paths = segments.map(seg => {
        const pct = seg.count / total;
        const len = pct * circumference;
        const gap = circumference - len;
        const html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
            stroke="${seg.color}" stroke-width="10"
            stroke-dasharray="${len} ${gap}"
            stroke-dashoffset="${-offset}"
            transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += len;
        return html;
    });

    // Legend below
    const legend = segments.map((seg, i) => {
        const lx = 8 + i * 25;
        return `<rect x="${lx}" y="78" width="6" height="6" rx="1" fill="${seg.color}"/>
                <text x="${lx + 8}" y="84" font-size="7" opacity="0.8">${seg.count}${seg.label}</text>`;
    }).join("");

    return `
    <svg width="100" height="90" viewBox="0 0 100 90">
        ${paths.join("")}
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="14" font-weight="700">${total}</text>
        ${legend}
    </svg>`;
}

// ── Violation Bar Chart ─────────────────────────────────────

function buildViolationBarChart(report: ScanReport): string {
    const contributions = report.risk_breakdown?.violation_contributions;
    if (!contributions || contributions.length === 0) { return ""; }

    const maxScore = Math.max(...contributions.map(vc => vc.weighted_score), 1);
    const sevColorMap: Record<string, string> = {
        critical: "#e53935", high: "#fb8c00", medium: "#5c6bc0", low: "#66bb6a"
    };

    const bars = contributions.map(vc => {
        const pct = (vc.weighted_score / maxScore) * 100;
        const color = sevColorMap[vc.severity] ?? "#888";
        const rule = escapeHtml(vc.rule_id.length > 14 ? vc.rule_id.slice(0, 12) + "…" : vc.rule_id);
        return `
        <div class="bar-row">
            <span class="bar-rule" title="${escapeHtml(vc.rule_id)}">${rule}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="bar-score">${vc.weighted_score.toFixed(1)}</span>
        </div>`;
    }).join("");

    return `
    <div style="margin-top:0.4rem;">
        <div class="graph-card-title">Violation Contributions</div>
        <div class="bar-chart">${bars}</div>
    </div>`;
}

// ── Stats Cards with Delta ──────────────────────────────────

function buildStatsCards(report: ScanReport, delta: ScanDelta | null): string {
    const audit = report.audit;

    const formatDelta = (val: number, invert: boolean = false): string => {
        if (val === 0) { return `<span class="stat-delta delta-same">— no change</span>`; }
        // For risk/issues: positive = bad. For resolved: invert
        const isGood = invert ? val > 0 : val < 0;
        const cls = isGood ? "delta-down" : "delta-up";
        const arrow = val > 0 ? "▲" : "▼";
        return `<span class="stat-delta ${cls}">${arrow} ${Math.abs(val)}</span>`;
    };

    const issuesDelta = delta ? formatDelta(delta.issueCount) : "";
    const riskDelta = delta ? formatDelta(delta.riskScore) : "";

    const cards = [
        `<div class="stat-card">
            <div class="stat-value">${(report.issues ?? []).length}</div>
            <div class="stat-label">Issues</div>
            ${issuesDelta}
        </div>`,
        `<div class="stat-card">
            <div class="stat-value" style="color:${report.riskScore >= 70 ? '#e53935' : report.riskScore >= 40 ? '#fb8c00' : '#66bb6a'}">${report.riskScore ?? 0}</div>
            <div class="stat-label">Risk Score</div>
            ${riskDelta}
        </div>`
    ];

    if (audit) {
        cards.push(
            `<div class="stat-card">
                <div class="stat-value">${audit.files_scanned}</div>
                <div class="stat-label">Files Scanned</div>
            </div>`,
            `<div class="stat-card">
                <div class="stat-value">${audit.duration_ms}ms</div>
                <div class="stat-label">Duration</div>
            </div>`
        );
    }

    // Show resolved/new rules from delta
    let rulesHtml = "";
    if (delta) {
        if (delta.resolvedRules.length > 0) {
            rulesHtml += `<div style="font-size:0.72rem;margin-top:0.3rem;color:#66bb6a;">✅ Resolved: ${delta.resolvedRules.map(r => `<code>${escapeHtml(r)}</code>`).join(", ")}</div>`;
        }
        if (delta.newRules.length > 0) {
            rulesHtml += `<div style="font-size:0.72rem;margin-top:0.2rem;color:#ef5350;">🆕 New: ${delta.newRules.map(r => `<code>${escapeHtml(r)}</code>`).join(", ")}</div>`;
        }
    }

    return `
    <div class="stats-row">${cards.join("")}</div>
    ${rulesHtml}`;
}

// ── Trend Line (SVG sparkline) ──────────────────────────────

function buildTrendLine(history: ScanSnapshot[]): string {
    if (history.length < 2) { return ""; }

    const w = 220, h = 50;
    const padX = 10, padY = 5;
    const plotW = w - 2 * padX;
    const plotH = h - 2 * padY;

    const scores = history.map(s => s.riskScore);
    const maxScore = Math.max(...scores, 100);
    const minScore = Math.min(...scores, 0);
    const range = maxScore - minScore || 1;

    const points = scores.map((score, i) => {
        const x = padX + (i / (scores.length - 1)) * plotW;
        const y = padY + plotH - ((score - minScore) / range) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const polyline = points.join(" ");
    const lastPt = points[points.length - 1].split(",");
    const lastScore = scores[scores.length - 1];
    const lastColor = lastScore >= 70 ? "#e53935" : lastScore >= 40 ? "#fb8c00" : "#66bb6a";

    // Gradient fill under the line
    const fillPoints = `${padX},${padY + plotH} ${polyline} ${padX + plotW},${padY + plotH}`;

    // Scan labels
    const labels = history.map((s, i) => {
        const x = padX + (i / (scores.length - 1)) * plotW;
        return `<text x="${x.toFixed(1)}" y="${h}" text-anchor="middle" font-size="5" opacity="0.4">${i + 1}</text>`;
    }).join("");

    return `
    <div class="trend-section">
        <div class="graph-card-title">Risk Trend (${history.length} scans)</div>
        <svg width="${w}" height="${h + 8}" viewBox="0 0 ${w} ${h + 8}" style="width:100%;height:auto;">
            <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${lastColor}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${lastColor}" stop-opacity="0.02"/>
                </linearGradient>
            </defs>
            <!-- grid lines -->
            <line x1="${padX}" y1="${padY}" x2="${padX + plotW}" y2="${padY}" stroke="rgba(128,128,128,0.1)" stroke-width="0.5"/>
            <line x1="${padX}" y1="${padY + plotH / 2}" x2="${padX + plotW}" y2="${padY + plotH / 2}" stroke="rgba(128,128,128,0.1)" stroke-width="0.5"/>
            <line x1="${padX}" y1="${padY + plotH}" x2="${padX + plotW}" y2="${padY + plotH}" stroke="rgba(128,128,128,0.1)" stroke-width="0.5"/>
            <!-- fill -->
            <polygon points="${fillPoints}" fill="url(#trendGrad)"/>
            <!-- line -->
            <polyline points="${polyline}" fill="none" stroke="${lastColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <animate attributeName="stroke-dasharray" from="0 1000" to="1000 0" dur="1s" fill="freeze"/>
            </polyline>
            <!-- dots -->
            ${points.map((pt, i) => {
        const [x, y] = pt.split(",");
        const c = scores[i] >= 70 ? "#e53935" : scores[i] >= 40 ? "#fb8c00" : "#66bb6a";
        return `<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke="var(--vscode-editor-background)" stroke-width="1.5"/>`;
    }).join("")}
            <!-- last score label -->
            <text x="${lastPt[0]}" y="${parseFloat(lastPt[1]) - 6}" text-anchor="middle" font-size="8" font-weight="700" fill="${lastColor}">${lastScore}</text>
            ${labels}
        </svg>
    </div>`;
}

// ── Risk Breakdown ──────────────────────────────────────────

function buildRiskBreakdownHtml(rb: RiskBreakdown): string {
    const rows = (rb.violation_contributions ?? []).map(vc => {
        const blastFactor = vc.blast_radius_factor !== undefined
            ? `${vc.blast_radius_factor.toFixed(1)}×`
            : "—";
        return `
            <tr>
                <td><code>${escapeHtml(vc.rule_id)}</code></td>
                <td>${escapeHtml(vc.severity)}</td>
                <td>${vc.weighted_score.toFixed(1)}</td>
                <td>${blastFactor}</td>
            </tr>`;
    }).join("");

    return `
    <details class="risk-breakdown">
        <summary>📊 Risk Breakdown — ${rb.total_score.toFixed(0)}/100</summary>
        <div class="risk-breakdown-body">
            <div class="formula-text">${escapeHtml(rb.formula)}</div>
            <table class="contrib-table">
                <thead>
                    <tr>
                        <th>Rule</th>
                        <th>Severity</th>
                        <th>Score</th>
                        <th>Blast</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </details>`;
}

// ── Issue Cards ─────────────────────────────────────────────

function buildIssueCard(issue: BlastIssue, index: number): string {
    const sev = issue.severity ?? "low";
    const sevLabel = sev.toUpperCase();

    const patchPreview = (issue.patches ?? []).map(p => escapeHtml(p.new_code)).join("\n\n");
    const fileDisplay = issue.file ? escapeHtml(shortenPath(issue.file)) : "—";

    const lineDisplay = issue.line !== undefined
        ? `Line ${issue.line}`
        : (issue.patches.length > 0
            ? `${issue.patches[0].start_line} → ${issue.patches[0].end_line}`
            : "—");

    const ruleTag = issue.rule_id
        ? `<span class="rule-tag">${escapeHtml(issue.rule_id)}</span>`
        : "";

    const evidenceHtml = issue.evidence && issue.evidence.length > 0
        ? `<details class="section">
                <summary>Evidence (${issue.evidence.length})</summary>
                <ul class="evidence-list">
                    ${issue.evidence.map(e => `<li class="evidence-item"><span>${escapeHtml(e)}</span></li>`).join("")}
                </ul>
           </details>`
        : "";

    const testImpactHtml = issue.testImpact && issue.testImpact.length > 0
        ? `<div class="test-impact">
            <div class="test-impact-title">Likely impacted tests:</div>
            ${issue.testImpact.map(t => `<div class="test-item">${escapeHtml(t)}</div>`).join("")}
           </div>`
        : "";

    return /* html */ `
        <div class="card" style="animation-delay:${index * 0.08}s">
            <div class="card-header ${sev}">
                <span class="severity-badge">${sevLabel}</span>
                ${ruleTag}
                <span class="issue-title">${escapeHtml(issue.issue)}</span>
            </div>
            <div class="card-body">
                <div class="meta-row">
                    <span class="meta-label">File</span>
                    <span class="meta-value" title="${escapeHtml(issue.file)}">${fileDisplay}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Line</span>
                    <span class="meta-value">${lineDisplay}</span>
                </div>

                <details class="section" open>
                    <summary>Issue</summary>
                    <p class="explanation-text">${escapeHtml(issue.explanation)}</p>
                </details>

                <details class="section">
                    <summary>Risk</summary>
                    <p class="risk-text">${escapeHtml(issue.risk)}</p>
                </details>

                ${evidenceHtml}

                <details class="section">
                    <summary>Patch Preview</summary>
                    <pre class="code-block">${patchPreview}</pre>
                </details>

                ${testImpactHtml}

                <div class="btn-row">
                    <button class="btn btn-apply" onclick="fixIssue('${escapeHtml(issue.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Fix This Issue
                    </button>
                    <button class="btn btn-review" onclick="viewDiff('${escapeHtml(issue.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View Patch Diff
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ── Audit Footer ────────────────────────────────────────────

function buildAuditFooterHtml(report: ScanReport, scanId?: string): string {
    const audit = report.audit;
    if (!audit && !scanId) { return ""; }

    const items: string[] = [];

    if (audit) {
        items.push(`<div class="audit-item"><span class="audit-label">Files:</span> ${audit.files_scanned}</div>`);
        items.push(`<div class="audit-item"><span class="audit-label">Violations:</span> ${audit.violations_found}</div>`);
        items.push(`<div class="audit-item"><span class="audit-label">Duration:</span> ${audit.duration_ms}ms</div>`);
        items.push(`<div class="audit-item"><span class="audit-label">LLM Tokens:</span> ${audit.llm_tokens_used}</div>`);
    }

    const idDisplay = audit?.scan_id ?? scanId;
    if (idDisplay) {
        items.push(`<div class="audit-full">Scan ID: ${escapeHtml(idDisplay)}</div>`);
    }

    return `<div class="audit-footer">${items.join("")}</div>`;
}

// ── Utilities ───────────────────────────────────────────────

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function shortenPath(filepath: string): string {
    const parts = filepath.replace(/\\/g, "/").split("/");
    if (parts.length <= 3) { return filepath; }
    return "…/" + parts.slice(-3).join("/");
}
