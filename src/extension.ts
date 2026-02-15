import * as vscode from 'vscode';
import { BackendClient } from './api/backendClient';
import { ProjectCache } from './state/projectCache';
import { PatchHistory } from './state/patchHistory';
import { RollbackManager } from './patch/rollbackManager';
import { PatchApplier } from './patch/patchApplier';
import { ScanManager } from './scan/scanManager';
import { registerDiagnostics } from './ui/diagnostics';
import { registerCodeLens } from './ui/codelens';
import { registerPanel, getLastScanResult } from './ui/panel';
import { initScanHistory } from './scan/scanHistory';
import { registerDiffPreview, showIssueDiffPreview } from './patch/diffPreview';
import { ScanReport } from './types/PatchResult';

export function activate(context: vscode.ExtensionContext) {
    console.log("BlastShield: activated (Architecture v2)");

    // 1. Initialize State
    // Legacy scan history (metrics)
    initScanHistory(context);

    // New state
    const cache = new ProjectCache(context);
    const patchHistory = new PatchHistory(context); // Not used yet but initialized
    const rollback = new RollbackManager();

    // 2. Initialize Core Services
    const client = new BackendClient(context.extensionPath);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const applier = new PatchApplier(rollback, cache, workspaceRoot);

    // 3. Initialize Managers
    const scanManager = new ScanManager(client, cache);

    // 4. Register UI Providers
    registerDiagnostics(context);
    registerCodeLens(context);
    registerPanel(context);
    registerDiffPreview(context);

    // 5. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand("blastshield.scan", async () => {
            await scanManager.scanProject();
        }),

        vscode.commands.registerCommand("blastshield.fixIssue", async (issueId?: string) => {
            if (!issueId) {
                vscode.window.showWarningMessage("BlastShield: No issue ID provided.");
                return;
            }
            await scanManager.fixIssue(issueId, applier);
        }),

        vscode.commands.registerCommand("blastshield.fixAll", async () => {
            await scanManager.fixAllSequential(applier);
        }),

        vscode.commands.registerCommand("blastshield.viewIssueDiff", async (issueId?: string) => {
            if (!issueId) { return; }
            const report = getLastScanResult();
            if (!report) { return; }

            const issue = report.issues.find(i => i.id === issueId);
            if (!issue || !issue.patches?.length) {
                vscode.window.showInformationMessage("No patches available for this issue.");
                return;
            }

            await showIssueDiffPreview(
                issue.patches,
                issue.issue,
                workspaceRoot
            );
        }),

        vscode.commands.registerCommand("blastshield.rollback", async () => {
            await rollback.undoLast();
        })
    );

    // 6. Hook Events
    scanManager.registerOnSave(context);
}

export function deactivate() { }