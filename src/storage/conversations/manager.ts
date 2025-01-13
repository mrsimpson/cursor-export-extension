import { ConversationData, ConversationWithSource, DatabaseRow } from '../../types';
import { Database as SQLiteDatabase } from 'sqlite';
import { log } from '../../utils';
import { openDatabase, releaseConnection } from '../database/connection';
import { withTransaction } from '../database/transaction';
import { parseMessages, createConversationData } from './parser';
import { formatDate } from '..';

export async function getConversationFromDB(id: string): Promise<ConversationData | null> {
    let globalDb: SQLiteDatabase | null = null;
    let workspaceDb: SQLiteDatabase | null = null;

    try {
        // 1. First try to get complete conversation data from global storage
        globalDb = await openDatabase('global');
        const result = await withTransaction(globalDb, async (db) => {
            const conversationData = await db.get(
                'SELECT value FROM cursorDiskKV WHERE key = ?',
                [`composerData:${id}`]
            ) as { value: string } | undefined;

            if (conversationData) {
                try {
                    const data = JSON.parse(conversationData.value);
                    const messages = parseMessages(data);

                    if (messages.length === 0) {
                        log('Conversation contains no messages', 'warn');
                        return null;
                    }

                    return createConversationData(id, data, messages);
                } catch (parseErr) {
                    log(`Failed to parse conversation data: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'error');
                    return null;
                }
            }

            // 2. If not found, check workspace for conversation reference
            workspaceDb = await openDatabase('workspace');
            const workspaceRef = await workspaceDb.get(
                'SELECT value FROM ItemTable WHERE key = ?',
                [`workbench.panel.chat.${id}`]
            ) as { value: string } | undefined;

            if (workspaceRef) {
                try {
                    const refData = JSON.parse(workspaceRef.value);
                    if (refData.composerId) {
                        const refConversation = await db.get(
                            'SELECT value FROM cursorDiskKV WHERE key = ?',
                            [`composerData:${refData.composerId}`]
                        ) as { value: string } | undefined;

                        if (refConversation) {
                            const data = JSON.parse(refConversation.value);
                            const messages = parseMessages(data);

                            if (messages.length === 0) {
                                log('Referenced conversation contains no messages', 'warn');
                                return null;
                            }

                            return createConversationData(refData.composerId, data, messages);
                        }
                    }
                } catch (parseErr) {
                    log(`Failed to parse workspace reference: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'error');
                    return null;
                }
            }

            log(`Conversation ${id} not found`, 'warn');
            return null;
        });

        return result;
    } catch (err) {
        log(`Failed to get conversation from database: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    } finally {
        if (globalDb) {
            releaseConnection('global', globalDb);
        }
        if (workspaceDb) {
            releaseConnection('workspace', workspaceDb);
        }
    }
}

export async function getAllConversations(): Promise<ConversationData[]> {
    let globalDb: SQLiteDatabase | null = null;

    try {
        globalDb = await openDatabase('global');

        const rows = await globalDb.all(
            'SELECT key, value FROM cursorDiskKV WHERE key LIKE ?',
            ['composerData:%']
        ) as DatabaseRow[];

        const conversations: ConversationData[] = [];
        for (const row of rows) {
            try {
                const data = JSON.parse(row.value);
                const messages = parseMessages(data);

                if (messages.length > 0) {
                    const id = row.key.split(':')[1];
                    conversations.push(createConversationData(id, data, messages));
                }
            } catch (err) {
                log(`Failed to parse conversation data: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
        }

        return conversations;
    } catch (err) {
        log(`Failed to get all conversations: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    } finally {
        if (globalDb) {
            releaseConnection('global', globalDb);
        }
    }
}

export function deduplicateConversations(conversations: Record<string, ConversationWithSource>): Record<string, any> {
    const dedupedData: Record<string, any> = {};
    const convMap = new Map<string, ConversationWithSource[]>();

    // Group by conversation ID
    Object.entries(conversations).forEach(([key, conv]) => {
        const convId = key.split(':')[1];
        if (!convMap.has(convId)) {
            convMap.set(convId, []);
        }
        convMap.get(convId)!.push(conv);
    });

    // Process each group of duplicate conversations
    convMap.forEach((convs, convId) => {
        if (convs.length === 1) {
            // No duplicates, use as is
            dedupedData[`composerData:${convId}`] = convs[0].data;
        } else {
            // Has duplicates, need to select newest version
            log(`Found duplicate conversation ${convId}`, 'info');
            convs.forEach(conv => {
                log(`Source: ${conv.source}, Database: ${conv.dbPath}`, 'info');
                log(`Updated at: ${formatDate(conv.data.lastUpdatedAt)}`, 'info');
            });

            // Sort by last update time and select newest
            const newest = convs.reduce((prev, curr) => {
                const prevTime = prev.data.lastUpdatedAt || 0;
                const currTime = curr.data.lastUpdatedAt || 0;
                return currTime > prevTime ? curr : prev;
            });

            log(`Selected version from ${newest.source} (${formatDate(newest.data.lastUpdatedAt)})`, 'info');
            dedupedData[`composerData:${convId}`] = newest.data;
        }
    });

    return dedupedData;
} 