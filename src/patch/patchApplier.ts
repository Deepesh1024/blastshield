import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { validatePatch, validatePatchSchema, ValidationResult } from './patchValidator';
import { RollbackManager } from './rollbackManager';
import { ProjectCache } from '../state/projectCache';
import { PatchResponse } from '../types/PatchResult';

export interface ApplyResult {
    success: boolean;
    filePath: string;
    ruleId: string;
    error?: string;
    validation?: ValidationResult;
}

export class PatchApplier {
    constructor(
        private rollback: RollbackManager,
        private cache: ProjectCache,
        private workspaceRoot: string
    ) { }

    async applyPatch(rawPatch: unknown): Promise<ApplyResult> {
        // Step 3: Schema parse
        const patch = validatePatchSchema(rawPatch);
        if (!patch) {
            return { success: false, filePath: '', ruleId: '', error: 'Malformed patch JSON' };
        }

        // Step 4: Full validation
        const validation = await validatePatch(patch, this.workspaceRoot, new Map(Object.entries(this.cache.getAllHashes())));
        if (!validation.valid) {
            return {
                success: false,
                filePath: patch.file_path,
                ruleId: patch.rule_id,
                error: validation.errors.join('; '),
                validation
            };
        }

        // Show warnings to user
        for (const w of validation.warnings) {
            vscode.window.showWarningMessage(`BlastShield: ${w}`);
        }

        // Step 7: Snapshot for rollback
        const resolvedPath = path.resolve(this.workspaceRoot, patch.file_path);
        const originalContent = fs.readFileSync(resolvedPath, 'utf-8');
        this.rollback.push({
            filePath: resolvedPath,
            originalContent,
            patchedCode: patch.new_code,
            timestamp: Date.now(),
            ruleId: patch.rule_id
        });

        // Step 8: Apply edit
        const targetUri = vscode.Uri.file(resolvedPath);
        const doc = await vscode.workspace.openTextDocument(targetUri);
        const edit = new vscode.WorkspaceEdit();
        const startPos = new vscode.Position(patch.line_start - 1, 0);
        // line_end is inclusive 1-based index of last line to replace
        // Range takes end-line as exclusive if char is 0, or we include the full line content? 
        // VSCode Range(startLine, startChar, endLine, endChar).
        // If we want to replace lines 5 to 5. Start: (4, 0). End: (5, 0). (Replace line 4 entirely)
        const endPos = new vscode.Position(patch.line_end, 0);

        // We replace with new code + newline if needed? 
        // The patch generator usually sends a block of code.
        // If we replace lines 5-6 with "foo", we expect line 5 and 6 to be gone, and "foo" inserted.
        edit.replace(targetUri, new vscode.Range(startPos, endPos), patch.new_code + '\n');

        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
            // Auto-rollback (pop from stack)
            await this.rollback.undoLast(); // Actually we just pop since applied failed, undoLast logic might try to apply revert edit
            // Simple pop is better if apply failed entirely. But undoLast executes rollback logic.
            // If apply failed, file content didn't change, so we don't need to revert file content.
            // But we pushed to stack.
            // Let's refine rollback manager to expose pop? Or just let undoLast fail gracefully.
            return {
                success: false,
                filePath: resolvedPath,
                ruleId: patch.rule_id,
                error: 'workspace.applyEdit() failed — no changes applied'
            };
        }

        // Step 9: Save
        await doc.save();

        // Step 10: Update hash in cache
        const newContent = fs.readFileSync(resolvedPath, 'utf-8');
        const crypto = require('crypto');
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        this.cache.updateFileHash(resolvedPath, newHash);

        return { success: true, filePath: resolvedPath, ruleId: patch.rule_id };
    }
}
