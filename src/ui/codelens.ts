import * as vscode from 'vscode';
import { ScanReport } from '../types/PatchResult';

class BlastShieldCodeLensProvider implements vscode.CodeLensProvider {

    private report: ScanReport | null = null;

    setReport(report: ScanReport) {
        this.report = report;
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.report) { return []; }

        const lenses: vscode.CodeLens[] = [];

        for (const issue of this.report.issues) {
            for (const p of issue.patches) {
                if (document.uri.fsPath === p.file) {
                    const range = new vscode.Range(
                        new vscode.Position(p.start_line - 1, 0),
                        new vscode.Position(p.start_line - 1, 0)
                    );
                    const lens = new vscode.CodeLens(range, {
                        title: `⚡ BlastShield: Fix "${issue.issue}"`,
                        command: "blastshield.fixIssue",
                        arguments: [issue.id]
                    });
                    lenses.push(lens);
                }
            }
        }

        return lenses;
    }
}

const provider = new BlastShieldCodeLensProvider();

export function registerCodeLens(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ pattern: "**/*" }, provider)
    );
}

export function setCodeLensReport(report: ScanReport) {
    provider.setReport(report);
}
