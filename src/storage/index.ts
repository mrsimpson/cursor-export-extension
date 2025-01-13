// Database exports
export {
    openDatabase,
    closeDatabase,
    getConnection,
    releaseConnection
} from './database/connection';
export { withTransaction } from './database/transaction';
export {
    getCursorConfigPath,
    getDatabasePaths
} from './database/paths';

// Conversation exports
export {
    parseMessages,
    createConversationData
} from './conversations/parser';
export {
    calculateStatistics,
    detectIntent,
    detectTags
} from './conversations/metadata';
export {
    findCurrentConversation,
    findActiveConversations
} from './conversations/finder';
export {
    getConversationFromDB,
    getAllConversations,
    deduplicateConversations
} from './conversations/manager';

// Content parsing exports
export { parseMessageContent } from './content/markdown';
export {
    detectLanguage,
    parseCodeBlocks
} from './content/code';

// Workspace exports
export {
    getWorkspacePaths,
    getReadableWorkspaceName
} from './workspace/paths';
export {
    hasDatabase,
    getLastModified,
    findVSCDBFiles
} from './workspace/state';
export {
    findWorkspaceState,
    findEditorState
} from './workspace/finder';

// Export functionality
export { saveExportFile } from './export';

// Utility exports
export { formatDate, generateContextId } from './utils'; 