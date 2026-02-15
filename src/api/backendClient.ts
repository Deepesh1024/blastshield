import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ScanResponse, PatchRequest, PatchResponse, ScanReport } from '../types/PatchResult';

export class BackendClient {
    private baseUrl: string = "";
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.loadConfig();
    }

    private loadConfig() {
        const envPath = path.join(this.extensionPath, '.env');
        try {
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf-8');
                for (const line of content.split('\n')) {
                    const parts = line.split('=');
                    if (parts.length >= 2 && parts[0].trim() === 'BLASTSHIELD_API_URL') {
                        this.baseUrl = parts.slice(1).join('=').trim();
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load .env', e);
        }

        if (!this.baseUrl) {
            // Log but don't throw yet - UI will handle missing config
            console.warn('BLASTSHIELD_API_URL not set');
        }
    }

    async scanProject(files: { path: string, content: string }[]): Promise<ScanResponse> {
        return this.post<ScanResponse>('/scan', { files });
    }

    async scanFile(filePath: string, content: string): Promise<ScanResponse> {
        // Single file scan
        return this.post<ScanResponse>('/scan', {
            files: [{ path: filePath, content }]
        });
    }

    async pollScanStatus(scanId: string): Promise<ScanResponse> {
        return this.get<ScanResponse>(`/scan/${scanId}/status`);
    }

    async requestPatch(payload: PatchRequest): Promise<PatchResponse> {
        return this.post<PatchResponse>('/patch', payload);
    }

    private async post<T>(endpoint: string, body: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    private async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET' });
    }

    private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
        if (!this.baseUrl) {
            this.loadConfig(); // Try reloading
            if (!this.baseUrl) {
                throw new Error('BLASTSHIELD_API_URL not configured');
            }
        }

        const url = `${this.baseUrl}${endpoint}`;
        const MAX_RETRIES = 3;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                return await response.json() as T;
            } catch (err: any) {
                if (attempt === MAX_RETRIES - 1) throw err;

                // Exponential backoff: 500ms, 1000ms, 2000ms
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            }
        }
        throw new Error('Unreachable code');
    }
}
