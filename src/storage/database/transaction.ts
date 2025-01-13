import { Database as SQLiteDatabase } from 'sqlite';
import { log } from '../../utils';

export async function withTransaction<T>(
    db: SQLiteDatabase,
    callback: (db: SQLiteDatabase) => Promise<T>
): Promise<T> {
    await db.run('BEGIN TRANSACTION');
    try {
        const result = await callback(db);
        await db.run('COMMIT');
        return result;
    } catch (err) {
        await db.run('ROLLBACK');
        throw err;
    }
} 