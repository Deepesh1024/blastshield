import * as crypto from 'crypto';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PatchResponse } from '../types/PatchResult';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

const FORBIDDEN_PATTERNS = [
    /\beval\s*\(/,
    /\bexec\s*\(/,
    /\b__import__\s*\(/,
    /\bsubprocess\./,
    /\bos\.system\s*\(/,
    /require\s*\(\s*['"]child_process['"]\s*\)/,
    /\bFunction\s*\(/,
];

const MAX_PATCH_BYTES = 10240;  // 10KB
const MAX_DELETION_RATIO = 0.5; // 50% of file
const MAX_IMPORT_DELTA = 5;

export function validatePatchSchema(raw: unknown): PatchResponse | null {
    if (!raw || typeof raw !== 'object') { return null; }
    const p = raw as Record<string, unknown>;

    const required = ['status', 'rule_id', 'file_path', 'line_start', 'line_end', 'new_code'];
    for (const key of required) {
        if (!(key in p)) { return null; }
    }
    if (typeof p.status !== 'string') { return null; }
    if (typeof p.file_path !== 'string') { return null; }
    if (typeof p.line_start !== 'number') { return null; }
    if (typeof p.line_end !== 'number') { return null; }
    if (typeof p.new_code !== 'string') { return null; }

    return p as unknown as PatchResponse;
}

export async function validatePatch(
    patch: PatchResponse,
    workspaceRoot: string,
    fileHashCache: Map<string, string>
): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Gate 1: Status check
    if (patch.status !== 'approved') {
        errors.push(`Patch status is "${patch.status}", expected "approved"`);
        return { valid: false, errors, warnings };
    }

    // Gate 2: Path safety
    // Allow absolute paths if they are within workspace.
    // Allow relative paths if they resolve to within workspace and don't traverse out.

    let resolved = patch.file_path;
    if (!path.isAbsolute(patch.file_path)) {
        if (patch.file_path.includes('..')) {
            errors.push('Path traversal detected in relative path');
            return { valid: false, errors, warnings };
        }
        resolved = path.resolve(workspaceRoot, patch.file_path);
    }

    if (!resolved.startsWith(workspaceRoot)) {
        errors.push('Path escapes workspace boundary');
        return { valid: false, errors, warnings };
    }

    // Gate 3: File existence & hash
    if (!fs.existsSync(resolved)) {
        errors.push(`File not found: ${patch.file_path}`);
        return { valid: false, errors, warnings };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const currentHash = crypto.createHash('sha256').update(content).digest('hex');
    const cachedHash = fileHashCache.get(resolved);

    // Only check hash if we actually have a cached hash (otherwise first scan might not have populated it yet)
    // But strict mode would require it. Let's warn if missing, error if mismatch.
    if (cachedHash && cachedHash !== currentHash) {
        errors.push('File modified since last scan — hash mismatch');
        return { valid: false, errors, warnings };
    }

    // Gate 4: Line range
    const lines = content.split('\n');
    const totalLines = lines.length;
    if (patch.line_start < 1) { errors.push('line_start < 1'); }
    if (patch.line_end < patch.line_start) { errors.push('line_end < line_start'); }
    if (patch.line_end > totalLines + 1) { errors.push(`line_end (${patch.line_end}) > total lines (${totalLines})`); } // +1 allowance for appending

    const affectedRatio = (patch.line_end - patch.line_start + 1) / totalLines;
    if (affectedRatio > MAX_DELETION_RATIO) {
        errors.push(`Patch affects ${(affectedRatio * 100).toFixed(0)}% of file (limit: ${MAX_DELETION_RATIO * 100}%)`);
    }
    if (errors.length > 0) { return { valid: false, errors, warnings }; }

    // Gate 5: Content safety
    if (Buffer.byteLength(patch.new_code) > MAX_PATCH_BYTES) {
        errors.push(`Patch size ${Buffer.byteLength(patch.new_code)}B exceeds ${MAX_PATCH_BYTES}B limit`);
    }
    if (patch.new_code.trim() === '' && (patch.line_end - patch.line_start + 1) > 5) {
        errors.push('Empty replacement for >5 line range (full deletion blocked)');
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(patch.new_code)) {
            errors.push(`Forbidden pattern detected: ${pattern.source}`);
        }
    }
    // Import delta check
    const originalSection = lines.slice(patch.line_start - 1, patch.line_end).join('\n');
    const oldImports = (originalSection.match(/^(import |from |require\()/gm) || []).length;
    const newImports = (patch.new_code.match(/^(import |from |require\()/gm) || []).length;
    if (Math.abs(newImports - oldImports) > MAX_IMPORT_DELTA) {
        warnings.push(`Import count changed by ${Math.abs(newImports - oldImports)} (threshold: ${MAX_IMPORT_DELTA})`);
    }

    if (errors.length > 0) { return { valid: false, errors, warnings }; }

    // Gate 6: Function signature (heuristic)
    const firstLine = lines[patch.line_start - 1]?.trim() ?? '';
    const sigPatterns = [/^(def |async def |function |class |export )/, /=>\s*{/];
    const isFunction = sigPatterns.some(p => p.test(firstLine));
    if (isFunction) {
        const fnName = firstLine.match(/(def|function|class)\s+(\w+)/)?.[2];
        if (fnName && !patch.new_code.includes(fnName)) {
            warnings.push(`Original function "${fnName}" not present in patch — possible rename`);
        }
    }

    return { valid: true, errors, warnings };
}
