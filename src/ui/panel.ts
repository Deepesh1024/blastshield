import * as vscode from "vscode";
import { ScanReport, BlastIssue } from "../types/PatchResult";

let blastView: vscode.WebviewView | null = null;
let lastScan: ScanReport | null = null;

export function registerPanel(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "blastshieldView",
            new BlastShieldPanelProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function updateBlastShieldPanel(result: ScanReport) {
    lastScan = result;
    if (!blastView) { return; }
    blastView.webview.html = buildHtml(result);
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
            if (!lastScan) { return; }

            switch (msg.type) {
                case "fixIssue":
                    vscode.commands.executeCommand("blastshield.fixIssue", msg.issueId);
                    break;
                case "viewDiff":
                    vscode.commands.executeCommand("blastshield.viewIssueDiff", msg.issueId);
                    break;
                case "fixAll":
                    vscode.commands.executeCommand("blastshield.fixAll");
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
    <head><meta charset="UTF-8"></head>
    <body style="padding:1.2rem;color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family),sans-serif;">
        <div style="text-align:center;margin-top:2rem;opacity:0.6;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h3 style="margin-top:0.8rem;">BlastShield</h3>
            <p style="font-size:0.85rem;">No analysis yet.<br/>Run <b>BlastShield: Scan Project</b> to start.</p>
        </div>
    </body>
    </html>`;
}

function buildHtml(report: ScanReport): string {
    const issues = report.issues ?? [];
    const riskScore = report.riskScore ?? 0;

    // Severity counts
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
        const sev = issue.severity ?? "low";
        if (sev in counts) { counts[sev as keyof typeof counts]++; }
    }

    // Summary section
    const summaryHtml = buildSummaryHtml(issues.length, counts, riskScore);

    // Issue cards
    const issueCards = issues.map((issue, i) => buildIssueCard(issue, i)).join("");

    // Fix All button (only if > 1 issue)
    const fixAllHtml = issues.length > 1 ? `
        <button class="fix-all-btn" onclick="fixAll()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Fix All ${issues.length} Issues
        </button>` : "";

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

        /* Risk score bar */
        .risk-bar-container {
            margin-top: 0.3rem;
        }
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
        .issue-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .card-body { padding: 0.7rem; }

        /* ── Meta rows ── */
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

        /* ── Sections ── */
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

        /* ── Test Impact ── */
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

        /* ── Buttons ── */
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

        /* ── Scrollbar ── */
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
            <span class="issue-count">${issues.length} issue${issues.length !== 1 ? "s" : ""}</span>
        </div>

        ${summaryHtml}

        ${fixAllHtml}

        ${issueCards}

        ${issues.length > 1 ? `
        <button class="fix-all-btn" onclick="fixAll()" style="margin-top:0.3rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Fix All ${issues.length} Issues
        </button>` : ""}

        <script>
            const vscode = acquireVsCodeApi();
            function fixIssue(id)  { vscode.postMessage({ type: "fixIssue",  issueId: id }); }
            function viewDiff(id)  { vscode.postMessage({ type: "viewDiff",  issueId: id }); }
            function fixAll()      { vscode.postMessage({ type: "fixAll" }); }
        </script>
    </body>
    </html>`;
}

function buildSummaryHtml(
    total: number,
    counts: { critical: number; high: number; medium: number; low: number },
    riskScore: number
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

    return `
    <div class="summary-section">
        <div class="summary-title">Project Summary</div>
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

function buildIssueCard(issue: BlastIssue, index: number): string {
    const sev = issue.severity ?? "low";
    const sevLabel = sev.toUpperCase();

    const patchPreview = (issue.patches ?? []).map(p => escapeHtml(p.new_code)).join("\n\n");
    const fileDisplay = issue.file ? escapeHtml(shortenPath(issue.file)) : "—";
    const lineRange = issue.patches.length > 0
        ? `${issue.patches[0].start_line} → ${issue.patches[0].end_line}`
        : "—";

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
                <span class="issue-title">${escapeHtml(issue.issue)}</span>
            </div>
            <div class="card-body">
                <div class="meta-row">
                    <span class="meta-label">File</span>
                    <span class="meta-value" title="${escapeHtml(issue.file)}">${fileDisplay}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Lines</span>
                    <span class="meta-value">${lineRange}</span>
                </div>

                <details class="section" open>
                    <summary>Issue</summary>
                    <p class="explanation-text">${escapeHtml(issue.explanation)}</p>
                </details>

                <details class="section">
                    <summary>Risk</summary>
                    <p class="risk-text">${escapeHtml(issue.risk)}</p>
                </details>

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
