import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../utils';
import { getCursorConfigPath } from '../database/paths';

export function hasDatabase(workspacePath: string): boolean {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.existsSync(dbPath);
    } catch (err) {
        log(`Failed to check database existence: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return false;
    }
}

export function getLastModified(workspacePath: string): number {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.statSync(dbPath).mtimeMs;
    } catch (err) {
        log(`Failed to get last modified time: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return 0;
    }
}

export async function findVSCDBFiles(): Promise<string[]> {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');
    const dbFiles: string[] = [];

    try {
        // 1. Check workspace databases
        if (fs.existsSync(workspaceStoragePath)) {
            const workspaces = fs.readdirSync(workspaceStoragePath)
                .map(name => path.join(workspaceStoragePath, name))
                .filter(dir => fs.statSync(dir).isDirectory());

            for (const workspace of workspaces) {
                const stateDb = path.join(workspace, 'state.vscdb');
                if (fs.existsSync(stateDb)) {
                    log('Found workspace database', 'info');
                    dbFiles.push(stateDb);
                }
            }
        }

        // 2. Check global database
        const globalStateDb = path.join(userPath, 'state-global.vscdb');
        if (fs.existsSync(globalStateDb)) {
            log('Found global state database', 'info');
            dbFiles.push(globalStateDb);
        }

        // 3. Check global storage directory databases
        if (fs.existsSync(globalStoragePath)) {
            log('Scanning global storage directory', 'info');
            const globalDirs = fs.readdirSync(globalStoragePath);
            for (const dir of globalDirs) {
                const globalDbPath = path.join(globalStoragePath, dir, 'state.vscdb');
                if (fs.existsSync(globalDbPath)) {
                    log('Found global storage database', 'info');
                    dbFiles.push(globalDbPath);
                }
            }
        }

        // 4. Check user data directory database
        const userStateDb = path.join(userPath, 'state.vscdb');
        if (fs.existsSync(userStateDb)) {
            log('Found user state database', 'info');
            dbFiles.push(userStateDb);
        }

        // 5. Check Cursor-specific database
        const cursorStateDb = path.join(cursorPath, 'state.vscdb');
        if (fs.existsSync(cursorStateDb)) {
            log('Found Cursor state database', 'info');
            dbFiles.push(cursorStateDb);
        }

        return dbFiles;
    } catch (err) {
        log(`Failed to find database files: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
} 