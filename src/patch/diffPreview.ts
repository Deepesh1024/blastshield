import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Registry of virtual document contents keyed by URI path.
 * Content is set before opening the diff view.
 */
const virtualDocuments = new Map<string, string>();

export const PREVIEW_SCHEME = 'blastshield-preview';

/**
 * Provides read-only virtual documents for diff previews.
 * Registered once at extension activation.
 */
export class BlastShieldPreviewProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
        return virtualDocuments.get(uri.path) ?? '';
    }

    update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }
}

const provider = new BlastShieldPreviewProvider();

export function registerDiffPreview(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider)
    );
}

/**
 * Show a diff preview for a patch.
 * Left:  actual file on disk (read-only in diff view)
 * Right: virtual document with patched content (read-only, no save prompt)
 */
export async function showPatchDiff(
    filePath: string,
    lineStart: number,
    lineEnd: number,
    newCode: string,
    issueTitle: string
): Promise<void> {
    // Read current file content
    let originalContent = '';
    try {
        originalContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
        vscode.window.showErrorMessage(`BlastShield: Cannot read file ${filePath}`);
        return;
    }

    const lines = originalContent.split('\n');

    // Build patched content: keep lines before, insert patch, keep lines after
    // Note: lineStart is 1-indexed, array is 0-indexed
    const before = lines.slice(0, lineStart - 1);
    const after = lines.slice(lineEnd);
    const patchedContent = [...before, newCode, ...after].join('\n');

    // Store in virtual document registry
    const previewPath = `/${path.basename(filePath)}.patched`;
    virtualDocuments.set(previewPath, patchedContent);

    // Create URIs
    const leftUri = vscode.Uri.file(filePath);
    const rightUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:${previewPath}`);

    // Fire change event so VS Code picks up content
    provider.update(rightUri);

    // Open side-by-side diff
    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `BlastShield: "${issueTitle}" — Patch Preview`
    );
}

/**
 * Show diff for all patches of an issue (coalesced per file).
 */
export async function showIssueDiffPreview(
    patches: Array<{ file: string; start_line: number; end_line: number; new_code: string }>,
    issueTitle: string,
    workspaceRoot: string
): Promise<void> {
    // Group by file and apply patches bottom-up to avoid offset shift
    const byFile = new Map<string, typeof patches>();
    for (const p of patches) {
        // Resolve path absolute just to be safe for grouping key
        let absPath = p.file;
        if (!path.isAbsolute(p.file)) {
            absPath = path.resolve(workspaceRoot, p.file);
        }

        const list = byFile.get(absPath) ?? [];
        list.push(p);
        byFile.set(absPath, list);
    }

    // Usually issue diffs are single-file, but architecture supports multi-file
    // We'll just show the first file if multiple to avoid spamming tabs
    const [filePath, filePatches] = Array.from(byFile.entries())[0] || [];

    if (!filePath || !filePatches) { return; }

    // Sort by line_start descending so bottom patches don't shift top ones
    const sorted = [...filePatches].sort((a, b) => b.start_line - a.start_line);

    let content = '';
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return;
    }

    const lines = content.split('\n');

    // Apply each patch bottom-up
    for (const p of sorted) {
        // Splice: start index, delete count, insert elements
        // line_start is 1-indexed. e.g. start=5, lines[4].
        // line_end is inclusive. e.g. end=5. 5-5+1 = 1 line.
        const startIdx = p.start_line - 1;
        const deleteCount = p.end_line - p.start_line + 1;

        // Handle out of bounds gracefully
        if (startIdx < 0 || startIdx >= lines.length) { continue; }

        lines.splice(startIdx, deleteCount, p.new_code);
    }

    const previewPath = `/${path.basename(filePath)}.patched`;
    virtualDocuments.set(previewPath, lines.join('\n'));

    const leftUri = vscode.Uri.file(filePath);
    const rightUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:${previewPath}`);
    provider.update(rightUri);

    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `BlastShield: "${issueTitle}" — ${path.basename(filePath)}`
    );
}
