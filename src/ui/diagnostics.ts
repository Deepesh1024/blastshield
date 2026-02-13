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
        const sevLevel =
            issue.severity === "critical" || issue.severity === "high"
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;

        const ruleTag = issue.rule_id ? ` [${issue.rule_id}]` : "";
        const diagMessage = `[${issue.severity.toUpperCase()}]${ruleTag} ${issue.issue}`;

        // ── Primary: use issue.line if available (AST-precise, v2.0.0+) ──
        if (issue.line !== undefined && issue.file) {
            const uriStr = vscode.Uri.file(issue.file).toString();
            const line = Math.max(0, issue.line - 1); // 0-indexed
            const diag = new vscode.Diagnostic(
                new vscode.Range(
                    new vscode.Position(line, 0),
                    new vscode.Position(line, 200)
                ),
                diagMessage,
                sevLevel
            );
            diag.source = "BlastShield";
            if (issue.rule_id) {
                diag.code = issue.rule_id;
            }

            const existing = diagMap.get(uriStr) ?? [];
            existing.push(diag);
            diagMap.set(uriStr, existing);
        }

        // ── Fallback: use patch locations (original behavior) ──
        if (issue.line === undefined) {
            for (const p of issue.patches) {
                const uriStr = vscode.Uri.file(p.file).toString();
                const diag = new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(p.start_line - 1, 0),
                        new vscode.Position(p.start_line - 1, 200)
                    ),
                    diagMessage,
                    sevLevel
                );
                diag.source = "BlastShield";
                if (issue.rule_id) {
                    diag.code = issue.rule_id;
                }

                const existing = diagMap.get(uriStr) ?? [];
                existing.push(diag);
                diagMap.set(uriStr, existing);
            }
        }
    }

    for (const [uriStr, diags] of diagMap) {
        diagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
    }
}
