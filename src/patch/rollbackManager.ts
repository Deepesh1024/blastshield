import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RollbackEntry {
    filePath: string;
    originalContent: string;
    patchedCode: string; // Used to verify state before rollback
    timestamp: number;
    ruleId: string;
}

const MAX_STACK = 50;

export class RollbackManager {
    private stack: RollbackEntry[] = [];

    push(entry: RollbackEntry): void {
        this.stack.push(entry);
        if (this.stack.length > MAX_STACK) {
            this.stack.shift(); // FIFO eviction
        }
    }

    /**
     * Undo the last patch. Restores original file content.
     * Returns true if rollback succeeded.
     */
    async undoLast(): Promise<{ success: boolean; entry?: RollbackEntry; error?: string }> {
        const entry = this.stack.pop();
        if (!entry) {
            return { success: false, error: 'No patches to undo' };
        }

        try {
            // Verify file still exists
            if (!fs.existsSync(entry.filePath)) {
                return { success: false, entry, error: 'File no longer exists' };
            }

            // Read current content and verify it contains the patched code
            // (guards against user manually editing after patch)
            const currentContent = fs.readFileSync(entry.filePath, 'utf-8');
            // Check if the patched code is somewhat present (simple inclusion check)
            // Using trim() to avoid whitespace issues
            if (!currentContent.includes(entry.patchedCode.trim().slice(0, 100))) {
                const proceed = await vscode.window.showWarningMessage(
                    'File has been modified since patch was applied. Rollback may cause conflicts.',
                    'Rollback Anyway', 'Cancel'
                );
                if (proceed !== 'Rollback Anyway') {
                    this.stack.push(entry); // Re-push since user cancelled
                    return { success: false, entry, error: 'User cancelled rollback' };
                }
            }

            // Restore original content
            const uri = vscode.Uri.file(entry.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                doc.lineAt(doc.lineCount - 1).range.end
            );

            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, fullRange, entry.originalContent);
            const applied = await vscode.workspace.applyEdit(edit);

            if (!applied) {
                this.stack.push(entry); // Failed, keep on stack
                return { success: false, entry, error: 'workspace.applyEdit() failed' };
            }

            await doc.save();

            vscode.window.showInformationMessage(
                `BlastShield: Rolled back patch for rule "${entry.ruleId}" on ${path.basename(entry.filePath)}`
            );

            return { success: true, entry };
        } catch (err: any) {
            this.stack.push(entry);
            return {
                success: false,
                entry,
                error: err instanceof Error ? err.message : String(err)
            };
        }
    }

    /** Auto-restore on apply failure (no user prompt) */
    async autoRestore(entry: RollbackEntry): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(entry.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                doc.lineAt(doc.lineCount - 1).range.end
            );
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, fullRange, entry.originalContent);
            const applied = await vscode.workspace.applyEdit(edit);
            if (applied) {
                await doc.save();
            }
            return applied;
        } catch {
            return false;
        }
    }

    get size(): number { return this.stack.length; }
    peek(): RollbackEntry | undefined { return this.stack[this.stack.length - 1]; }
    clear(): void { this.stack = []; }
}
