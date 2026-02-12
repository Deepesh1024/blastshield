import * as vscode from "vscode";
import { ScanReport } from "../types/PatchResult";

/**
 * Show a diff preview for a specific issue by its ID.
 * Displays the first patch of the issue as a side-by-side diff.
 */
export async function showIssueDiff(report: ScanReport, issueId: string) {
    const issue = report.issues.find(i => i.id === issueId);
    if (!issue) {
        vscode.window.showWarningMessage(`BlastShield: Issue ${issueId} not found.`);
        return;
    }

    const patches = issue.patches ?? [];
    if (patches.length === 0) {
        vscode.window.showInformationMessage("BlastShield: No patches to review for this issue.");
        return;
    }

    const patch = patches[0];

    const left = vscode.Uri.file(patch.file);
    const rightUri = vscode.Uri.parse(
        `untitled:${patch.file}.blastshield-fix`
    );

    const doc = await vscode.workspace.openTextDocument(rightUri);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(rightUri, new vscode.Position(0, 0), patch.new_code);
    await vscode.workspace.applyEdit(edit);

    await vscode.commands.executeCommand(
        "vscode.diff",
        left,
        rightUri,
        `BlastShield: ${issue.issue} — Patch Preview`
    );
}
