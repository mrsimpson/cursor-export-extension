import * as vscode from 'vscode';
import { open, Database as SQLiteDatabase } from 'sqlite';
import { Database as SQLite3Database } from 'sqlite3';
import { log } from '../../utils';
import { getDatabasePaths } from './paths';
import * as fs from 'fs';

// Database pool configuration
const DB_POOL_CONFIG = {
    maxSize: 5,
    idleTimeout: 30000,
    acquireTimeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000
};

// Database connection pool
interface PooledConnection {
    db: SQLiteDatabase;
    lastUsed: number;
    inUse: boolean;
}

const dbPool: {
    global: PooledConnection[];
    workspace: PooledConnection[];
} = {
    global: [],
    workspace: []
};

// Clean idle connections
async function cleanIdleConnections() {
    const now = Date.now();
    for (const type of ['global', 'workspace'] as const) {
        const pool = dbPool[type];
        for (let i = pool.length - 1; i >= 0; i--) {
            const conn = pool[i];
            if (!conn.inUse && now - conn.lastUsed > DB_POOL_CONFIG.idleTimeout) {
                try {
                    await conn.db.close();
                    pool.splice(i, 1);
                    log(`Closed idle connection: ${type}`, 'info');
                } catch (err) {
                    log(`Failed to close idle connection: ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
            }
        }
    }
}

// Periodically clean idle connections
setInterval(cleanIdleConnections, DB_POOL_CONFIG.idleTimeout);

// Get available connection
export async function getConnection(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    const pool = dbPool[type];

    // 1. Try to get idle connection
    const idleConn = pool.find(conn => !conn.inUse);
    if (idleConn) {
        idleConn.inUse = true;
        idleConn.lastUsed = Date.now();
        return idleConn.db;
    }

    // 2. Create new connection if pool isn't full
    if (pool.length < DB_POOL_CONFIG.maxSize) {
        let attempts = 0;
        let lastError: Error | null = null;

        while (attempts < DB_POOL_CONFIG.retryAttempts) {
            try {
                const paths = getDatabasePaths();
                const dbPath = type === 'global' ? paths.global : paths.workspace;

                if (!fs.existsSync(dbPath)) {
                    throw new Error(`Database file doesn't exist: ${dbPath}`);
                }

                const db = await open({
                    filename: dbPath,
                    driver: SQLite3Database
                });

                const conn: PooledConnection = {
                    db,
                    lastUsed: Date.now(),
                    inUse: true
                };
                pool.push(conn);
                return db;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                attempts++;
                if (attempts < DB_POOL_CONFIG.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, DB_POOL_CONFIG.retryDelay));
                }
            }
        }

        throw new Error(`Cannot create database connection: ${lastError?.message}`);
    }

    // 3. Wait for available connection if pool is full
    const startTime = Date.now();
    while (Date.now() - startTime < DB_POOL_CONFIG.acquireTimeout) {
        const conn = pool.find(conn => !conn.inUse);
        if (conn) {
            conn.inUse = true;
            conn.lastUsed = Date.now();
            return conn.db;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Timeout getting database connection');
}

// Release connection
export function releaseConnection(type: 'global' | 'workspace', db: SQLiteDatabase) {
    const pool = dbPool[type];
    const conn = pool.find(conn => conn.db === db);
    if (conn) {
        conn.inUse = false;
        conn.lastUsed = Date.now();
    }
}

// Open database connection
export async function openDatabase(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    try {
        return await getConnection(type);
    } catch (err) {
        log(`Failed to open database: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// Close database connection
export async function closeDatabase(type?: 'global' | 'workspace'): Promise<void> {
    try {
        if (type) {
            // Close all connections of specified type
            const pool = dbPool[type];
            for (const conn of pool) {
                try {
                    await conn.db.close();
                } catch (err) {
                    log(`Failed to close database connection: ${err instanceof Error ? err.message : String(err)}`, 'warn');
                }
            }
            pool.length = 0;
        } else {
            // Close all connections
            for (const type of ['global', 'workspace'] as const) {
                const pool = dbPool[type];
                for (const conn of pool) {
                    try {
                        await conn.db.close();
                    } catch (err) {
                        log(`Failed to close database connection: ${err instanceof Error ? err.message : String(err)}`, 'warn');
                    }
                }
                pool.length = 0;
            }
        }
    } catch (err) {
        log(`Failed to close database: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
} 