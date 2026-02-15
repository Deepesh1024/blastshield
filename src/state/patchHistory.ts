import * as vscode from 'vscode';

export interface PatchHistoryEntry {
    filePath: string;
    ruleId: string;
    timestamp: number;
    success: boolean;
    riskBefore?: number;
    riskAfter?: number;
    error?: string;
}

const HISTORY_KEY = 'blastshield.patchHistory';
const MAX_HISTORY = 200;

export class PatchHistory {
    private history: PatchHistoryEntry[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.history = context.globalState.get<PatchHistoryEntry[]>(HISTORY_KEY, []);
    }

    addEntry(entry: PatchHistoryEntry) {
        this.history.push(entry);
        if (this.history.length > MAX_HISTORY) {
            this.history.shift(); // FIFO eviction
        }
        this.persist();
    }

    getHistory(): PatchHistoryEntry[] {
        return [...this.history];
    }

    private persist() {
        this.context.globalState.update(HISTORY_KEY, this.history);
    }
}
