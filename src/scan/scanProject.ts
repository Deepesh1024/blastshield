import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ScanReport, BlastIssue, ScanResponse } from '../types/PatchResult';
import { applyDiagnostics } from '../ui/diagnostics';
import { setCodeLensReport } from '../ui/codelens';

function loadEnv(envPath: string): Record<string, string> {
    const vars: Record<string, string> = {};
    try {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) { continue; }
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) { continue; }
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim();
            vars[key] = value;
        }
    } catch {
        // .env file not found — that's okay
    }
    return vars;
}

// Track the timestamp of the last successful scan
let lastScanTimestamp: number | null = null;

// Store the last scan_id for display in the panel
let lastScanId: string | undefined;
export function getLastScanId(): string | undefined { return lastScanId; }

/**
 * Poll the backend for a queued scan result.
 * Returns the completed ScanResponse or undefined on failure.
 */
async function pollForScanResult(
    apiUrl: string,
    scanId: string
): Promise<ScanResponse | undefined> {
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLLS = 150; // 5 minutes max

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "BlastShield: Scan queued — processing large project…",
            cancellable: true
        },
        async (progress, token) => {
            for (let i = 0; i < MAX_POLLS; i++) {
                if (token.isCancellationRequested) {
                    vscode.window.showWarningMessage("BlastShield: Scan cancelled.");
                    return undefined;
                }

                progress.report({
                    message: `Polling… (${i * 2}s elapsed)`,
                    increment: 100 / MAX_POLLS
                });

                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

                try {
                    const resp = await fetch(`${apiUrl}/scan/${scanId}/status`);
                    const json: any = await resp.json();

                    if (json.status === "complete") {
                        return json as ScanResponse;
                    }
                    // Otherwise keep polling (status is "pending" / "processing")
                } catch (err) {
                    vscode.window.showErrorMessage(
                        `BlastShield: Polling error — ${err instanceof Error ? err.message : String(err)}`
                    );
                    return undefined;
                }
            }

            vscode.window.showErrorMessage("BlastShield: Scan timed out after 5 minutes.");
            return undefined;
        }
    );
}

export async function scanProject(extensionPath: string): Promise<ScanReport | undefined> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showErrorMessage("BlastShield: No workspace is open.");
        return;
    }

    // Load API URL from .env in the extension's directory
    const env = loadEnv(path.join(extensionPath, '.env'));
    const apiUrl = env.BLASTSHIELD_API_URL;
    if (!apiUrl) {
        vscode.window.showErrorMessage(
            "BlastShield: BLASTSHIELD_API_URL not set. Add a .env file in the extension directory. See .env.example for reference."
        );
        return;
    }

    const allFiles = await vscode.workspace.findFiles(
        '**/*.{js,ts,py,java,go,cpp}',
        '{venv,node_modules,.git,__pycache__,.idea,.vscode,dist,build,out}/**'
    );

    // Filter to only changed files if this is a rescan
    const isRescan = lastScanTimestamp !== null;
    let filesToScan = allFiles;

    if (isRescan) {
        filesToScan = allFiles.filter(f => {
            try {
                const stat = fs.statSync(f.fsPath);
                return stat.mtimeMs > lastScanTimestamp!;
            } catch {
                return false;
            }
        });

        if (filesToScan.length === 0) {
            vscode.window.showInformationMessage("BlastShield: No files changed since last scan. All clear! ✅");
            return;
        }
    }

    const fileContents: any[] = [];
    for (const f of filesToScan) {
        const doc = await vscode.workspace.openTextDocument(f);
        fileContents.push({ path: f.fsPath, content: doc.getText() });
    }

    const scanLabel = isRescan
        ? `Rescanning ${fileContents.length} changed file${fileContents.length !== 1 ? 's' : ''}...`
        : `Scanning ${fileContents.length} files...`;

    vscode.window.showInformationMessage(`BlastShield: ${scanLabel}`);

    let response: Response;
    try {
        response = await fetch(`${apiUrl}/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: fileContents })
        });
    } catch (err) {
        vscode.window.showErrorMessage(
            `BlastShield: Network error — ${err instanceof Error ? err.message : String(err)}`
        );
        return;
    }

    let json: any = await response.json();

    if (json.message === "error") {
        vscode.window.showErrorMessage(`BlastShield: Backend error — ${json.detail}`);
        return;
    }

    // ── Handle queued scans (large projects, backend v2.0.0+) ──
    if (json.message === "scan_queued" && json.scan_id) {
        const completed = await pollForScanResult(apiUrl, json.scan_id);
        if (!completed || !completed.report) {
            return;
        }
        json = completed;
    }

    // Mark scan timestamp on success
    lastScanTimestamp = Date.now();

    // Store scan_id for panel display
    lastScanId = json.scan_id;

    const report: ScanReport = json.report;

    // Show summary notification if available
    if (report.summary) {
        vscode.window.showInformationMessage(`BlastShield: ${report.summary}`);
    }

    // Feed diagnostics & codelens
    applyDiagnostics(report);
    setCodeLensReport(report);

    return report;
}
