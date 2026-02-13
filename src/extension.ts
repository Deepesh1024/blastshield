import * as vscode from "vscode";
import { scanProject, getLastScanId } from "./scan/scanProject";
import { registerDiagnostics } from "./ui/diagnostics";
import { registerCodeLens } from "./ui/codelens";

import { applyIssuePatches, applyAllPatches } from "./scan/applyPatches";
import { showIssueDiff } from "./ui/diff";
import { registerPanel, updateBlastShieldPanel, getLastScanResult } from "./ui/panel";
import { ScanReport } from "./types/PatchResult";
import { initScanHistory, recordScan, getScanHistory } from "./scan/scanHistory";

let lastScanResult: ScanReport | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log("BlastShield: activated");

    // Initialize scan history cache from persisted state
    initScanHistory(context);

    registerDiagnostics(context);
    registerCodeLens(context);

    registerPanel(context);

    // ── Scan Project ──
    context.subscriptions.push(
        vscode.commands.registerCommand("blastshield.scan", async () => {
            const result = await scanProject(context.extensionPath);
            if (!result) { return; }

            lastScanResult = result;

            // Record scan in history and compute delta
            const scanId = getLastScanId();
            const delta = recordScan(result, scanId);
            const history = getScanHistory();

            updateBlastShieldPanel(result, scanId, history, delta);
        })
    );

    // ── Fix Single Issue ──
    context.subscriptions.push(
        vscode.commands.registerCommand("blastshield.fixIssue", async (issueId?: string) => {
            const report = lastScanResult ?? getLastScanResult();
            if (!report) {
                vscode.window.showWarningMessage("BlastShield: No scan results. Run a scan first.");
                return;
            }
            if (!issueId) {
                vscode.window.showWarningMessage("BlastShield: No issue ID provided.");
                return;
            }
            await applyIssuePatches(report, issueId);
        })
    );

    // ── Fix All Issues ──
    context.subscriptions.push(
        vscode.commands.registerCommand("blastshield.fixAll", async () => {
            const report = lastScanResult ?? getLastScanResult();
            if (!report) {
                vscode.window.showWarningMessage("BlastShield: No scan results. Run a scan first.");
                return;
            }
            await applyAllPatches(report);
        })
    );

    // ── View Issue Diff ──
    context.subscriptions.push(
        vscode.commands.registerCommand("blastshield.viewIssueDiff", async (issueId?: string) => {
            const report = lastScanResult ?? getLastScanResult();
            if (!report) {
                vscode.window.showWarningMessage("BlastShield: No scan results. Run a scan first.");
                return;
            }
            if (!issueId) {
                vscode.window.showWarningMessage("BlastShield: No issue ID provided.");
                return;
            }
            await showIssueDiff(report, issueId);
        })
    );
}

export function deactivate() { }