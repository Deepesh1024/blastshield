import * as vscode from 'vscode';
import { BlastIssue } from '../types/PatchResult';

interface CacheState {
    version: number;
    lastScanTime: number;
    projectScore: number;
    fileHashes: Record<string, string>; // path -> sha256
    issues: Record<string, BlastIssue[]>; // path -> issues
}

export class ProjectCache {
    private state: CacheState;

    constructor(private context: vscode.ExtensionContext) {
        // Restore from workspaceState or init empty
        this.state = context.workspaceState.get<CacheState>('blastshield_cache') ?? {
            version: 1,
            lastScanTime: 0,
            projectScore: 0,
            fileHashes: {},
            issues: {}
        };
    }

    updateFileHash(path: string, hash: string) {
        this.state.fileHashes[path] = hash;
        this.persist();
    }

    updateFileIssues(path: string, issues: BlastIssue[]) {
        this.state.issues[path] = issues;
        // Recompute total score logic here if needed
        this.persist();
    }

    getFileHash(path: string): string | undefined {
        return this.state.fileHashes[path];
    }

    getAllHashes(): Map<string, string> {
        return new Map(Object.entries(this.state.fileHashes));
    }

    private persist() {
        this.context.workspaceState.update('blastshield_cache', this.state);
    }
}
