import * as vscode from 'vscode';
import { ScanReport, BlastIssue } from '../types/PatchResult';
import { applyDiagnostics } from '../ui/diagnostics';
import { setCodeLensReport } from '../ui/codelens';

export async function scanProject(): Promise<ScanReport | undefined> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showErrorMessage("BlastShield: No workspace is open.");
        return;
    }

    const files = await vscode.workspace.findFiles(
        '**/*.{js,ts,py,java,go,cpp}',
        '{venv,node_modules,.git,__pycache__,.idea,.vscode,dist,build,out}/**'
    );

    const fileContents: any[] = [];
    for (const f of files) {
        const doc = await vscode.workspace.openTextDocument(f);
        fileContents.push({ path: f.fsPath, content: doc.getText() });
    }

    vscode.window.showInformationMessage(
        `BlastShield: Scanning ${fileContents.length} files...`
    );

    const response = await fetch("http://3.84.151.23/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: fileContents })
    });

    const json: any = await response.json();

    if (json.message === "error") {
        vscode.window.showErrorMessage(`BlastShield: Backend error — ${json.detail}`);
        return;
    }

    if (json.message === "invalid_json") {
        vscode.window.showErrorMessage("BlastShield: Backend returned invalid JSON from LLM.");
        return;
    }

    const report: ScanReport = json.report;

    // Feed diagnostics & codelens
    applyDiagnostics(report);
    setCodeLensReport(report);

    return report;
}
