import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

// Get Cursor config directory path
export function getCursorConfigPath(): string {
    const platform = process.platform;
    const home = os.homedir();

    switch (platform) {
        case 'win32':
            return path.join(home, 'AppData', 'Roaming', 'Cursor');
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', 'Cursor');
        case 'linux':
            return path.join(home, '.config', 'Cursor');
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// Get database paths
export function getDatabasePaths(): { global: string; workspace: string } {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');

    return {
        global: path.join(userPath, 'globalStorage', 'state.vscdb'),
        workspace: path.join(userPath, 'workspaceStorage', vscode.workspace.name || '', 'state.vscdb')
    };
} 