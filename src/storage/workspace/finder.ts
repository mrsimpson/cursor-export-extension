import { Database as SQLiteDatabase } from 'sqlite';
import { DatabaseRow, EditorState, WorkspaceState } from '../../types';
import { log } from '../../utils';
import { withTransaction } from '../database/transaction';

export async function findWorkspaceState(db: SQLiteDatabase): Promise<WorkspaceState | null> {
    try {
        return await withTransaction(db, async (db) => {
            const stateRow = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['workbench.state']
            ) as DatabaseRow | undefined;

            if (stateRow) {
                try {
                    return JSON.parse(stateRow.value) as WorkspaceState;
                } catch (parseErr) {
                    log(`Failed to parse workspace state: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }
            return null;
        });
    } catch (err) {
        log(`Failed to find workspace state: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    }
}

export async function findEditorState(db: SQLiteDatabase): Promise<EditorState | null> {
    try {
        return await withTransaction(db, async (db) => {
            const editorRow = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['workbench.editor.state']
            ) as DatabaseRow | undefined;

            if (editorRow) {
                try {
                    return JSON.parse(editorRow.value) as EditorState;
                } catch (parseErr) {
                    log(`Failed to parse editor state: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }
            return null;
        });
    } catch (err) {
        log(`Failed to find editor state: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    }
} 