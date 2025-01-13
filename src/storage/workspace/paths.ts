import * as path from 'path';
import * as fs from 'fs';
import { log } from '../../utils';
import { getCursorConfigPath } from '../database/paths';
import * as vscode from 'vscode';

export function getWorkspacePaths(): string[] {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');

    if (!fs.existsSync(workspaceStoragePath)) {
        throw new Error(`Cursor workspace directory doesn't exist: ${workspaceStoragePath}`);
    }

    // Get all workspace directories
    const workspaces = fs.readdirSync(workspaceStoragePath)
        .map(name => path.join(workspaceStoragePath, name))
        .filter(dir => fs.statSync(dir).isDirectory());

    // Add global storage directory
    if (fs.existsSync(globalStoragePath)) {
        workspaces.push(globalStoragePath);
    }

    return workspaces;
}

export function getReadableWorkspaceName(workspaceId: string): string {
    try {
        // 1. Try to extract project name from workspace path
        const workspacePath = path.join(getCursorConfigPath(), 'User', 'workspaceStorage', workspaceId);
        if (fs.existsSync(workspacePath)) {
            // Try to read workspace configuration
            const configPath = path.join(workspacePath, 'workspace.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.folder) {
                    // Extract project name from folder path
                    return path.basename(config.folder);
                }
            }

            // If no config found, try to extract meaningful info from directory name
            const parentDir = path.dirname(workspacePath);
            if (fs.existsSync(parentDir)) {
                const dirs = fs.readdirSync(parentDir);
                const matchingDir = dirs.find(dir => dir.includes(workspaceId));
                if (matchingDir) {
                    // Remove hash part, keep potential project name
                    return matchingDir.replace(/[0-9a-f]{32}/i, '').replace(/[-_]/g, ' ').trim();
                }
            }
        }
    } catch (err) {
        log(`Failed to get workspace name: ${err instanceof Error ? err.message : String(err)}`, 'warn');
    }

    // If unable to get more meaningful name, return shortened workspace ID
    return `ws-${workspaceId.substring(0, 6)}`;
} 