declare module 'sqlite' {
    import { Database as SQLite3Database } from 'sqlite3';

    export interface SqliteOptions {
        filename: string;
        driver: typeof SQLite3Database;
    }

    export interface Statement {
        run(...params: any[]): Promise<{ lastID: number; changes: number }>;
        get(...params: any[]): Promise<any>;
        all(...params: any[]): Promise<any[]>;
        finalize(): Promise<void>;
    }

    export interface Database {
        open(): Promise<Database>;
        close(): Promise<void>;
        run(sql: string, ...params: any[]): Promise<{ lastID: number; changes: number }>;
        get(sql: string, ...params: any[]): Promise<any>;
        all(sql: string, ...params: any[]): Promise<any[]>;
        exec(sql: string): Promise<void>;
        prepare(sql: string): Promise<Statement>;
    }

    export function open(options: SqliteOptions): Promise<Database>;
} 