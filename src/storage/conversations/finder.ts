import { ConversationLocation, DatabaseRow, EditorState, WorkspaceState } from '../../types';
import { Database as SQLiteDatabase } from 'sqlite';
import { log } from '../../utils';
import { withTransaction } from '../database/transaction';

export async function findCurrentConversation(db: SQLiteDatabase): Promise<string | null> {
    try {
        return await withTransaction(db, async (db) => {
            // 1. Check editor state first
            const editorState = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['workbench.editor.activeEditor']
            ) as DatabaseRow | undefined;

            if (editorState) {
                try {
                    const data = JSON.parse(editorState.value);
                    if (data.composerId) {
                        log('Found current conversation from editor state', 'info');
                        return data.composerId;
                    }
                } catch (parseErr) {
                    log(`Failed to parse editor state: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            // 2. Check composer data
            const composerData = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['composer.composerData']
            ) as DatabaseRow | undefined;

            if (composerData) {
                try {
                    const data = JSON.parse(composerData.value);
                    if (data.currentConversationId) {
                        log('Found current conversation from composer data', 'info');
                        return data.currentConversationId;
                    }
                } catch (parseErr) {
                    log(`Failed to parse composer data: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            // 3. Check recent conversations
            const recentConversation = await db.get(
                'SELECT key FROM cursorDiskKV WHERE key LIKE ? ORDER BY json_extract(value, "$.lastUpdatedAt") DESC LIMIT 1',
                ['composerData:%']
            ) as DatabaseRow | undefined;

            if (recentConversation) {
                try {
                    const parts = recentConversation.key.split(':');
                    if (parts.length === 2) {
                        log('Found current conversation from recent conversations', 'info');
                        return parts[1];
                    }
                } catch (parseErr) {
                    log(`Failed to parse recent conversation: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            log('No active conversation found', 'warn');
            return null;
        });
    } catch (err) {
        log(`Failed to query current conversation: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

export async function findActiveConversations(db: SQLiteDatabase): Promise<ConversationLocation[]> {
    const locations: ConversationLocation[] = [];

    try {
        await withTransaction(db, async (db) => {
            // 1. Check editor states
            const editorRows = await db.all(
                'SELECT value FROM ItemTable WHERE key IN (?, ?)',
                [
                    'workbench.editor.languageDetectionOpenedLanguages.global',
                    'memento/workbench.editors.files.textFileEditor'
                ]
            ) as DatabaseRow[];

            if (editorRows) {
                for (const row of editorRows) {
                    try {
                        const data = JSON.parse(row.value) as EditorState;
                        if (data.conversations || data.recentConversations) {
                            const convs = data.conversations || data.recentConversations || [];
                            for (const conv of convs) {
                                if (conv.id) {
                                    locations.push({
                                        workspaceId: '',
                                        conversationId: conv.id,
                                        timestamp: conv.timestamp || Date.now(),
                                        source: 'editor'
                                    });
                                }
                            }
                        }
                    } catch (parseErr) {
                        log(`Failed to parse editor state: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                    }
                }
            }

            // 2. Check workspace states
            const workspaceRows = await db.all(
                'SELECT value FROM ItemTable WHERE key LIKE ? OR key LIKE ?',
                ['workbench.panel.composer%', 'chat.workspace%']
            ) as DatabaseRow[];

            if (workspaceRows) {
                for (const row of workspaceRows) {
                    try {
                        const data = JSON.parse(row.value) as WorkspaceState;
                        const convId = data.activeConversation || data.currentConversation;
                        if (convId) {
                            locations.push({
                                workspaceId: data.workspaceId || '',
                                conversationId: convId,
                                timestamp: Date.now(),
                                source: 'workspace'
                            });
                        }
                    } catch (parseErr) {
                        log(`Failed to parse workspace state: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                    }
                }
            }

            // 3. Check recent conversations
            const recentRows = await db.all(
                'SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY json_extract(value, "$.lastUpdatedAt") DESC LIMIT 5',
                ['composerData:%']
            ) as DatabaseRow[];

            if (recentRows) {
                for (const row of recentRows) {
                    try {
                        const parts = row.key.split(':');
                        if (parts.length === 2) {
                            const convId = parts[1];
                            const data = JSON.parse(row.value);
                            locations.push({
                                workspaceId: data.workspaceId || '',
                                conversationId: convId,
                                timestamp: data.lastUpdatedAt || Date.now(),
                                source: 'recent'
                            });
                        }
                    } catch (parseErr) {
                        log(`Failed to parse recent conversation: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                    }
                }
            }
        });

        // Sort by timestamp and deduplicate
        return Array.from(
            new Map(
                locations
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(loc => [loc.conversationId, loc])
            ).values()
        );
    } catch (err) {
        log(`Failed to find active conversations: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return [];
    }
} 