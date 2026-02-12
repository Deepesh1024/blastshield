import * as vscode from 'vscode';
import { ScanReport } from '../types/PatchResult';

const diagnosticCollection = vscode.languages.createDiagnosticCollection("blastshield");

export function registerDiagnostics(context: vscode.ExtensionContext) {
    context.subscriptions.push(diagnosticCollection);
}

export function applyDiagnostics(report: ScanReport) {
    diagnosticCollection.clear();

    // Group diagnostics by file URI
    const diagMap = new Map<string, vscode.Diagnostic[]>();

    for (const issue of report.issues) {
        for (const p of issue.patches) {
            const uriStr = vscode.Uri.file(p.file).toString();
            const diag = new vscode.Diagnostic(
                new vscode.Range(
                    new vscode.Position(p.start_line - 1, 0),
                    new vscode.Position(p.start_line - 1, 200)
                ),
                `[${issue.severity.toUpperCase()}] ${issue.issue}`,
                issue.severity === "critical" || issue.severity === "high"
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning
            );
            diag.source = "BlastShield";

            const existing = diagMap.get(uriStr) ?? [];
            existing.push(diag);
            diagMap.set(uriStr, existing);
        }
    }

    for (const [uriStr, diags] of diagMap) {
        diagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
    }
}
