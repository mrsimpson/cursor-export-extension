export interface ExportOptions {
    includeMetadata: boolean;
    includeSummary: boolean;
    includeTimestamp: boolean;
    outputPath?: string;
}

export interface CapabilityStatus {
    type: string;
    status: 'completed' | 'error' | 'pending';
}

export interface CapabilityStatuses {
    [key: string]: CapabilityStatus[];
}

export interface Message {
    role: string;
    content: string;
    timestamp?: number;
    metadata?: {
        toolCalls?: Array<{
            name: string;
            parameters?: any;
            status?: string;
            timestamp?: number;
            error?: string;
        }>;
        toolResults?: string[];
        context?: any;
    };
    capabilityStatuses?: CapabilityStatuses;
    intermediateChunks?: string[];
}

export {
    MessageContent,
    MessageContentType,
    ToolStatus,
    CodeContent,
    ThinkingContent,
    ToolCallContent,
    ToolResultContent,
    TextContent,
    MarkdownContent
} from './types/messageContent';

export interface ConversationMetadata {
    name: string;
    mode: 'normal' | 'agent';
    isAgentic: boolean;
    createdAt: number;
    lastUpdatedAt: number;
    workspaceId?: string;
    intent?: {
        category: string;
        confidence: number;
        keywords: string[];
    };
    context?: {
        workspace?: string;
        openFiles?: string[];
        cursorPosition?: {
            file: string;
            line: number;
            column: number;
        };
        selectedText?: string;
        linterErrors?: string[];
        editTrailContexts?: any[];
    };
    status: {
        isComplete: boolean;
        hasError: boolean;
        lastError?: string;
        lastToolCall?: {
            name: string;
            timestamp: number;
            status: string;
        };
    };
    statistics: {
        messageCount: number;
        userMessageCount: number;
        assistantMessageCount: number;
    };
    files: string[];
    tags: string[];
}

export interface ConversationData {
    id: string;
    messages: Message[];
    metadata?: ConversationMetadata;
}

export interface DatabaseRow {
    key: string;
    value: string;
}

export interface EditorState {
    conversations?: Array<{
        id: string;
        timestamp?: number;
    }>;
    recentConversations?: Array<{
        id: string;
        timestamp?: number;
    }>;
}

export interface WorkspaceState {
    activeConversation?: string;
    currentConversation?: string;
    workspaceId?: string;
}

export interface StorageLocations {
    cursorDataPath: string;
    workspaceStoragePath: string;
    conversationPath: string;
}

export interface WorkspaceInfo {
    path: string;
    id: string;
    name?: string;
    storageDir?: string;
}

export interface ComposerInfo {
    id: string;
    name: string;
    createdAt: number;
    lastUpdatedAt: number;
    isActive: boolean;
    workspaceId?: string;
}

export interface ConversationLocation {
    workspaceId: string;
    conversationId: string;
    timestamp: number;
    source: 'editor' | 'workspace' | 'recent';
}

export interface ConversationWithSource {
    data: any;
    source: string;
    dbPath: string;
}

export interface StorageLocations {
    cursorDataPath: string;
    workspaceStoragePath: string;
    conversationPath: string;
} 