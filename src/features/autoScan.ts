import * as vscode from 'vscode';
import { scanProject } from '../scan/scanProject';

export function registerAutoScan(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => {
            vscode.commands.executeCommand("blastshield.scan");
        })
    );
}
