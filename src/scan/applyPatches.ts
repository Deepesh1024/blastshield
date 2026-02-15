import * as vscode from 'vscode';
import * as path from 'path';
import { ScanReport, BlastIssue, SinglePatch } from '../types/PatchResult';

/**
 * Apply patches for a single issue by its ID.
 */
export async function applyIssuePatches(
    report: ScanReport,
    issueId: string
): Promise<{ success: boolean; file: string; error?: string }[]> {
    const issue = report.issues.find(i => i.id === issueId);
    if (!issue) {
        vscode.window.showWarningMessage(`BlastShield: Issue ${issueId} not found.`);
        return [];
    }

    const results = await applyPatchList(issue.patches);

    const applied = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (failed === 0) {
        vscode.window.showInformationMessage(
            `BlastShield: Fixed "${issue.issue}" — ${applied} patch${applied !== 1 ? "es" : ""} applied.`
        );
    } else {
        vscode.window.showWarningMessage(
            `BlastShield: "${issue.issue}" — ${applied} applied, ${failed} failed.`
        );
    }

    return results;
}

/**
 * Apply patches for ALL issues in the report.
 */
export async function applyAllPatches(
    report: ScanReport
): Promise<Map<string, { success: boolean; file: string; error?: string }[]>> {
    const resultMap = new Map<string, { success: boolean; file: string; error?: string }[]>();

    for (const issue of report.issues) {
        const results = await applyPatchList(issue.patches);
        resultMap.set(issue.id, results);
    }

    // Build summary
    let totalApplied = 0;
    let totalFailed = 0;
    const summaryLines: string[] = [];

    for (const [issueId, results] of resultMap) {
        const issue = report.issues.find(i => i.id === issueId);
        const applied = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        totalApplied += applied;
        totalFailed += failed;

        for (const r of results) {
            if (r.success) {
                summaryLines.push(`✔ ${shortenPath(r.file)} patched`);
            } else {
                summaryLines.push(`✖ ${shortenPath(r.file)} failed: ${r.error}`);
            }
        }
    }

    if (totalFailed === 0) {
        vscode.window.showInformationMessage(
            `BlastShield: Fix All complete — ${totalApplied} patch${totalApplied !== 1 ? "es" : ""} applied.`
        );
    } else {
        vscode.window.showWarningMessage(
            `BlastShield: Fix All — ${totalApplied} applied, ${totalFailed} failed.`
        );
    }

    return resultMap;
}

/**
 * Internal helper: apply a list of SinglePatch objects.
 */
async function applyPatchList(
    patches: SinglePatch[]
): Promise<{ success: boolean; file: string; error?: string }[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showErrorMessage("BlastShield: No workspace open.");
        return [];
    }

    const results: { success: boolean; file: string; error?: string }[] = [];

    for (const p of patches) {
        if (!p) { continue; }

        // Resolve path (absolute or relative to workspace)
        let resolvedPath: string;
        if (path.isAbsolute(p.file)) {
            resolvedPath = p.file;
        } else {
            resolvedPath = path.resolve(workspace.uri.fsPath, p.file);
        }

        // Guard against path traversal
        if (!resolvedPath.startsWith(workspace.uri.fsPath)) {
            results.push({ success: false, file: p.file, error: "path traversal blocked" });
            continue;
        }

        const targetUri = vscode.Uri.file(resolvedPath);

        let doc: vscode.TextDocument;
        try {
            doc = await vscode.workspace.openTextDocument(targetUri);
        } catch {
            results.push({ success: false, file: resolvedPath, error: "cannot open file" });
            continue;
        }

        // Apply the edit
        const edit = new vscode.WorkspaceEdit();
        const start = new vscode.Position(p.start_line - 1, 0);
        const end = new vscode.Position(p.end_line, 0);
        edit.replace(targetUri, new vscode.Range(start, end), p.new_code);

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            await doc.save();
            results.push({ success: true, file: resolvedPath });
        } else {
            results.push({ success: false, file: resolvedPath, error: "edit failed" });
        }
    }

    return results;
}

function shortenPath(filepath: string): string {
    const parts = filepath.replace(/\\/g, "/").split("/");
    if (parts.length <= 3) { return filepath; }
    return "…/" + parts.slice(-2).join("/");
}
