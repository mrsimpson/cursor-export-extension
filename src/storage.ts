import * as vscode from 'vscode';
import { open, Database as SQLiteDatabase } from 'sqlite';
import { Database as SQLite3Database } from 'sqlite3';
import { 
    ConversationData, 
    Message, 
    ConversationMetadata, 
    DatabaseRow, 
    EditorState, 
    WorkspaceState, 
    ConversationLocation, 
    ConversationWithSource,
    StorageLocations,
    CapabilityStatuses,
    CapabilityStatus,
    ToolStatus,
    MessageContent,
    MessageContentType,
    CodeContent,
    ToolResultContent,
    TextContent
} from './types';
import { log } from './utils';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
    ToolPattern,
    ToolMatch,
    RelationAnalysis,
    toolPatterns,
    matchToolPattern,
    calculateConfidence,
    analyzeRelation,
    getLineNumbers
} from './types/toolInference';
import { extractKeywords } from './utils';

// Database connection pool configuration
const DB_POOL_CONFIG = {
    maxSize: 5,                  // Maximum number of connections
    idleTimeout: 30000,         // Idle timeout (milliseconds)
    acquireTimeout: 10000,      // Connection acquisition timeout (milliseconds)
    retryAttempts: 3,           // Number of retry attempts
    retryDelay: 1000           // Retry delay (milliseconds)
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

// Clean up idle connections
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

// Periodically clean up idle connections
setInterval(cleanIdleConnections, DB_POOL_CONFIG.idleTimeout);

// Get available connection
async function getConnection(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    const pool = dbPool[type];
    
    // 1. Try to get an idle connection
    const idleConn = pool.find(conn => !conn.inUse);
    if (idleConn) {
        idleConn.inUse = true;
        idleConn.lastUsed = Date.now();
        return idleConn.db;
    }
    
    // 2. If the pool is not full, create a new connection
    if (pool.length < DB_POOL_CONFIG.maxSize) {
        let attempts = 0;
        let lastError: Error | null = null;
        
        while (attempts < DB_POOL_CONFIG.retryAttempts) {
            try {
                const paths = getDatabasePaths();
                const dbPath = type === 'global' ? paths.global : paths.workspace;

                if (!fs.existsSync(dbPath)) {
                    throw new Error(`Database file does not exist: ${dbPath}`);
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
                log(`Failed to create database connection (attempt ${attempts + 1}/${DB_POOL_CONFIG.retryAttempts}): ${lastError.message}`, 'warn');
                attempts++;
                if (attempts < DB_POOL_CONFIG.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, DB_POOL_CONFIG.retryDelay));
                }
            }
        }
        
        throw new Error(`Failed to create database connection: ${lastError?.message}`);
    }
    
    // 3. If the pool is full, wait for an available connection
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
    
    throw new Error('Database connection acquisition timeout');
}

// Release connection
function releaseConnection(type: 'global' | 'workspace', db: SQLiteDatabase) {
    const pool = dbPool[type];
    const conn = pool.find(conn => conn.db === db);
    if (conn) {
        conn.inUse = false;
        conn.lastUsed = Date.now();
    }
}

// Open database connection
async function openDatabase(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    try {
        return await getConnection(type);
    } catch (err) {
        log(`Failed to open database: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// Close database connection
async function closeDatabase(type?: 'global' | 'workspace'): Promise<void> {
    try {
        if (type) {
            // Close all connections of the specified type
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

// Execute database transaction
async function withTransaction<T>(
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

// Get Cursor configuration directory path
function getCursorConfigPath(): string {
    const platform = process.platform;
    const home = os.homedir();
    
    switch (platform) {
        case 'win32':
            return path.join(home, 'AppData', 'Roaming', 'Cursor');
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', 'Cursor');
        case 'linux':
            return path.join(home, '.config', 'Cursor');
        default:
            throw new Error(`Unsupported operating system: ${platform}`);
    }
}

// Get database paths
function getDatabasePaths(): { global: string; workspace: string } {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    
    return {
        global: path.join(userPath, 'globalStorage', 'state.vscdb'),
        workspace: path.join(userPath, 'workspaceStorage', vscode.workspace.name || '', 'state.vscdb')
    };
}

// Detect code language
function detectLanguage(lang: string): string {
    if (!lang) {return 'plaintext';}
    
    // Remove assistant_snippet_ prefix
    if (lang.startsWith('assistant_snippet_')) {
        return 'plaintext';
    }

    // Standardize language name
    const languageMap: Record<string, string> = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'cs': 'csharp',
        'cpp': 'cpp',
        'sh': 'shell',
        'ps1': 'powershell',
        'md': 'markdown',
        'json': 'json',
        'xml': 'xml',
        'html': 'html',
        'css': 'css',
        'sql': 'sql',
        'yaml': 'yaml',
        'yml': 'yaml',
        'dockerfile': 'dockerfile',
        'docker': 'dockerfile'
    };

    return languageMap[lang.toLowerCase()] || lang.toLowerCase();
}

// Format date
function formatDate(timestamp: number | string): string {
    if (!timestamp) {return 'Invalid Date';}
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Invalid Date';
    }
}

// Get readable workspace name
function getReadableWorkspaceName(workspaceId: string): string {
    try {
        // 1. Extract project name from workspace path
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
            
            // If no configuration found, try to extract meaningful information from directory name
            const parentDir = path.dirname(workspacePath);
            if (fs.existsSync(parentDir)) {
                const dirs = fs.readdirSync(parentDir);
                const matchingDir = dirs.find(dir => dir.includes(workspaceId));
                if (matchingDir) {
                    // Remove hash part, keep possible project name
                    return matchingDir.replace(/[0-9a-f]{32}/i, '').replace(/[-_]/g, ' ').trim();
                }
            }
        }
    } catch (err) {
        log(`Failed to get workspace name: ${err instanceof Error ? err.message : String(err)}`, 'warn');
    }
    
    // If unable to get a more meaningful name, return a shortened version of the workspace ID
    return `ws-${workspaceId.substring(0, 6)}`;
}

// Deduplicate conversations
function deduplicateConversations(conversations: Record<string, ConversationWithSource>): Record<string, any> {
    const dedupedData: Record<string, any> = {};
    const convMap = new Map<string, ConversationWithSource[]>();

    // Group conversations by conversation ID
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
            // Duplicates exist, need to choose the latest version
            log(`Found duplicate conversation ${convId}`, 'info');
            convs.forEach(conv => {
                log(`Source: ${conv.source}, Database: ${conv.dbPath}`, 'info');
                log(`Last updated: ${formatDate(conv.data.lastUpdatedAt)}`, 'info');
            });

            // Sort by last updated time, choose the latest
            const newest = convs.reduce((prev, curr) => {
                const prevTime = prev.data.lastUpdatedAt || 0;
                const currTime = curr.data.lastUpdatedAt || 0;
                return currTime > prevTime ? curr : prev;
            });

            log(`Choosing version from source ${newest.source} (${formatDate(newest.data.lastUpdatedAt)})`, 'info');
            dedupedData[`composerData:${convId}`] = newest.data;
        }
    });

    return dedupedData;
}

// Handle difficult backtick patterns
function handleDifficultBackticks(text: string): string {
    // Detect consecutive 4 or more backticks
    const difficultPattern = /(`{4,})/g;
    return text.replace(difficultPattern, (match) => {
        // Convert difficult backticks to emoji tool call
        return `<function_calls><invoke name="emoji"><parameter name="emoji">code</parameter></invoke></function_calls>`;
    });
}

// Extract code blocks
function parseCodeBlocks(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    let processedRanges: Array<{start: number, end: number}> = [];
    
    // Handle assistant_snippet format
    const snippetRegex = /```assistant_snippet_[A-Za-z0-9+/]+\.txt\s*([\s\S]*?)```/g;
    let snippetMatch;
    while ((snippetMatch = snippetRegex.exec(text)) !== null) {
        const content = snippetMatch[1].trim();
        if (content) {
            contents.push({
                type: 'code' as const,
                language: 'assistant_snippet',
                content,
                metadata: {
                    backtickCount: 3,
                    originalRange: {
                        start: snippetMatch.index,
                        end: snippetMatch.index + snippetMatch[0].length
                    }
                }
            });
            processedRanges.push({
                start: snippetMatch.index,
                end: snippetMatch.index + snippetMatch[0].length
            });
        }
    }

    // Handle other code blocks
    const codeBlockRegex = /(`+)(\w*)\n([\s\S]*?)\1/g;
    while ((snippetMatch = codeBlockRegex.exec(text)) !== null) {
        // Check if this range has already been processed
        const isProcessed = snippetMatch && processedRanges.some(range => 
            snippetMatch!.index >= range.start && snippetMatch!.index < range.end
        );

        if (!isProcessed && snippetMatch &&
            !text.substring(snippetMatch.index).startsWith('```thinking') &&
            !text.substring(snippetMatch.index).startsWith('```assistant_snippet')) {
            const backticks = snippetMatch[1];
            const lang = snippetMatch[2] || '';
            const code = snippetMatch[3].trim();
            if (code) {
                contents.push({
                    type: 'code' as const,
                    language: detectLanguage(lang),
                    content: code,
                    metadata: {
                        backtickCount: backticks.length,
                        originalRange: {
                            start: snippetMatch.index,
                            end: snippetMatch.index + snippetMatch[0].length
                        }
                    }
                });
                processedRanges.push({
                    start: snippetMatch.index,
                    end: snippetMatch.index + snippetMatch[0].length
                });
            }
        }
    }

    // Sort by original position
    return contents.sort((a, b) => 
        (a.metadata?.originalRange?.start || 0) - (b.metadata?.originalRange?.start || 0)
    );
}

// Parse message content
function parseMessageContent(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    let currentContext: {
        toolCall?: MessageContent,
        result?: MessageContent,
        relatedContent?: MessageContent[]
    } = {};
    
    try {
        // Preprocess text, handle difficult backtick patterns
        text = handleDifficultBackticks(text);

        // Preserve original empty line information
        const lines = text.split('\n');
        const emptyLineIndices = lines.reduce((acc, line, index) => {
            if (line.trim() === '') {
                acc.push(index);
            }
            return acc;
        }, [] as number[]);

        // Extract thinking blocks
        const thinkingRegex = /```thinking\s*([\s\S]*?)```/g;
        let thinkingMatch;
        while ((thinkingMatch = thinkingRegex.exec(text)) !== null) {
            const content = thinkingMatch[1].trim();
            if (content) {
                contents.push({
                    type: 'thinking',
                    content,
                    metadata: {
                        originalLineNumbers: getOriginalLineNumbers(thinkingMatch[0], text),
                        originalRange: {
                            start: thinkingMatch.index,
                            end: thinkingMatch.index + thinkingMatch[0].length
                        }
                    }
                });
            }
        }

        // Extract assistant_snippet blocks
        const snippetRegex = /```assistant_snippet_[A-Za-z0-9+/]+\.txt[\r\n\t\f\v ]*\n([\s\S]*?)[\r\n\t\f\v ]*```/g;
        let snippetMatch: RegExpExecArray | null;
        while ((snippetMatch = snippetRegex.exec(text)) !== null) {
            const content = snippetMatch[1].trim();
            if (content) {
                contents.push({
                    type: 'code' as const,
                    language: 'assistant_snippet',
                    content,
                    metadata: {
                        backtickCount: 3,
                        originalRange: {
                            start: snippetMatch.index,
                            end: snippetMatch.index + snippetMatch[0].length
                        }
                    }
                });
            }
        }

        // Extract code blocks
        const codeBlocks = parseCodeBlocks(text);
        contents.push(...codeBlocks);

        // Extract tool call blocks - improved XML tag configuration
        const toolCallRegex = /<function_calls>\s*<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>\s*<\/antml:function_calls>/g;
        let toolMatch;
        let hasToolCalls = false;
        while ((toolMatch = toolCallRegex.exec(text)) !== null) {
            hasToolCalls = true;
            const toolName = toolMatch[1];
            const paramsContent = toolMatch[2];
            
            // Parse tool parameters
            const params: Record<string, any> = {};
            const paramMatches = paramsContent.matchAll(/<parameter name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g);
            for (const paramMatch of paramMatches) {
                const paramName = paramMatch[1];
                const paramValue = paramMatch[2].trim();
                
                try {
                    params[paramName] = JSON.parse(paramValue);
                } catch {
                    params[paramName] = paramValue;
                }
            }

            // Create tool call content
            if (toolMatch[0].trim()) {
                const toolCallContent = {
                    type: 'tool_call' as const,
                    content: toolMatch[0],
                    metadata: {
                        toolName,
                        toolParams: params,
                        status: 'pending' as ToolStatus,
                        originalLineNumbers: getOriginalLineNumbers(toolMatch[0], text),
                        contextId: generateContextId()
                    }
                };
                
                // Special handling for emoji tool calls
                if (toolName === 'emoji') {
                    const emojiContent = {
                        type: 'text' as const,
                        content: params.emoji === 'code' ? '```' : params.emoji,
                        metadata: {
                            isEmoji: true,
                            originalLineNumbers: toolCallContent.metadata.originalLineNumbers,
                            contextId: toolCallContent.metadata.contextId
                        }
                    };
                    contents.push(emojiContent);
                } else {
                    currentContext.toolCall = toolCallContent;
                    contents.push(toolCallContent);
                }
            }
        }

        // Extract tool results
        const toolResultRegex = /<function_results>([\s\S]*?)<\/function_results>/g;
        let toolResultMatch: RegExpExecArray | null;
        while ((toolResultMatch = toolResultRegex.exec(text)) !== null) {
            const content = toolResultMatch[1].trim();
            if (content) {
                let parsedContent;
                let status: ToolStatus = 'success';
                let error;

                try {
                    parsedContent = JSON.parse(content);
                } catch {
                    if (content.toLowerCase().includes('error')) {
                        status = 'error';
                        error = content;
                        parsedContent = content;
                    } else {
                        parsedContent = content;
                    }
                }

                const resultContent = {
                    type: 'tool_result' as const,
                    content: content,
                    metadata: {
                        status,
                        error,
                        result: parsedContent,
                        originalLineNumbers: toolResultMatch ? getOriginalLineNumbers(toolResultMatch[0], text) : [],
                        contextId: currentContext.toolCall?.metadata?.contextId
                    }
                };

                currentContext.result = resultContent;
                contents.push(resultContent);
            }
        }

        // Improved tool inference logic
        if (!hasToolCalls) {
            const paragraphs = splitIntoParagraphs(text, emptyLineIndices);
            const toolInferences = inferToolCalls(paragraphs);
            
            for (const inference of toolInferences) {
                const contextId = generateContextId();
                const toolCallContent = {
                    type: 'tool_call' as const,
                    content: inference.content,
                    metadata: {
                        toolName: inference.tool,
                        toolParams: inference.params,
                        status: 'pending' as ToolStatus,
                        inferred: true,
                        confidence: inference.confidence,
                        contextId,
                        originalLineNumbers: inference.lineNumbers
                    }
                };

                currentContext = {
                    toolCall: toolCallContent,
                    relatedContent: inference.relatedContent
                };
                
                contents.push(toolCallContent);
                
                // Add related content
                if (inference.relatedContent) {
                    inference.relatedContent.forEach(content => {
                        content.metadata = {
                            ...content.metadata,
                            contextId
                        };
                        contents.push(content);
                    });
                }
            }
        }

        // Extract function_results tags
        let resultMatch: RegExpExecArray | null;
        const functionResultsRegex = /(`+)<function_results>([\s\S]*?)<\/function_results>\1/g;
        while ((resultMatch = functionResultsRegex.exec(text)) !== null) {
            const backticks = resultMatch[1];
            const resultContent = resultMatch[2].trim();
            if (resultContent) {
                contents.push({
                    type: 'tool_result' as const,
                    content: resultContent,
                    metadata: {
                        status: 'success' as const,
                        backtickCount: backticks.length
                    }
                } as ToolResultContent);
            }
        }

        // Handle remaining text
        const remainingText = text.replace(functionResultsRegex, '').trim();
        if (remainingText) {
            contents.push({
                type: 'text' as const,
                content: remainingText,
                metadata: {
                    format: [{
                        type: 'paragraph'
                    }]
                }
            } as TextContent);
        }

        return contents;
    } catch (error) {
        log(`Failed to parse message content: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }

    return contents;
}

// Helper functions

function splitIntoParagraphs(text: string, emptyLineIndices: number[]): string[] {
    const lines = text.split('\n');
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];

    lines.forEach((line, index) => {
        if (emptyLineIndices.includes(index)) {
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph.join('\n'));
                currentParagraph = [];
            }
            // Preserve empty line as separate paragraph
            paragraphs.push('');
        } else {
            currentParagraph.push(line);
        }
    });

    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join('\n'));
    }

    return paragraphs;
}

function inferToolCalls(paragraphs: string[]): Array<{
    tool: string;
    params: Record<string, any>;
    content: string;
    confidence: number;
    lineNumbers: number[];
    relatedContent?: MessageContent[];
}> {
    const inferences: Array<{
        tool: string;
        params: Record<string, any>;
        content: string;
        confidence: number;
        lineNumbers: number[];
        relatedContent?: MessageContent[];
    }> = [];

    let currentContext: {
        tool?: string;
        params?: Record<string, any>;
        confidence?: number;
        relatedContent: MessageContent[];
    } = {
        relatedContent: []
    };

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const nextParagraph = i < paragraphs.length - 1 ? paragraphs[i + 1] : null;

        // Analyze paragraph content and context
        const analysis = analyzeToolContext(paragraph, nextParagraph, currentContext);
        
        if (analysis.tool) {
            inferences.push({
                tool: analysis.tool,
                params: analysis.params || {},
                content: paragraph,
                confidence: analysis.confidence || 0,
                lineNumbers: getLineNumbers(paragraph),
                relatedContent: currentContext.relatedContent
            });
        } else if (analysis.isRelated && currentContext.tool && analysis.contentType) {
            currentContext.relatedContent.push({
                type: analysis.contentType as 'text' | 'markdown',
                content: paragraph,
                metadata: {
                    relationType: analysis.relationType,
                    originalLineNumbers: getLineNumbers(paragraph)
                }
            });
        }
    }

    return inferences;
}

function analyzeToolContext(
    paragraph: string,
    nextParagraph: string | null,
    currentContext: {
        tool?: string;
        params?: Record<string, any>;
        confidence?: number;
        relatedContent: MessageContent[];
    }
): {
    isTool: boolean;
    isRelated: boolean;
    tool?: string;
    params?: Record<string, any>;
    confidence?: number;
    contentType?: string;
    relationType?: string;
} {
    // Tool mode matching
    for (const pattern of toolPatterns) {
        const match = matchToolPattern(paragraph, pattern);
        if (match) {
            return {
                isTool: true,
                isRelated: false,
                tool: pattern.tool,
                params: match.params,
                confidence: calculateConfidence(match, pattern)
            };
        }
    }

    // Context relevance analysis
    if (currentContext.tool) {
        const relationAnalysis = analyzeRelation(paragraph, currentContext);
        if (relationAnalysis.isRelated) {
            return {
                isTool: false,
                isRelated: true,
                contentType: relationAnalysis.contentType,
                relationType: relationAnalysis.relationType
            };
        }
    }

    return {
        isTool: false,
        isRelated: false
    };
}

function preserveEmptyLines(text: string): string {
    return text.split('\n').map(line => line.trim() === '' ? '' : line).join('\n');
}

function getOriginalLineNumbers(content: string, fullText: string): number[] {
    const startIndex = fullText.indexOf(content);
    if (startIndex === -1) {return [];}

    const precedingText = fullText.substring(0, startIndex);
    const startLine = precedingText.split('\n').length;
    const contentLines = content.split('\n').length;

    return Array.from({length: contentLines}, (_, i) => startLine + i);
}

function generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Parse Markdown elements
function parseMarkdownElements(text: string, emptyLineIndices?: number[]): MessageContent[] {
    const elements: MessageContent[] = [];
    let currentText = '';

    // Parse headings
    const headings = text.match(/^#{1,6}\s+.+$/gm);
    if (headings) {
        headings.forEach(heading => {
            const level = heading.match(/^(#+)/)?.[1].length || 1;
            elements.push({
                type: 'markdown',
                content: heading.replace(/^#+\s+/, ''),
                metadata: {
                    format: [{
                        type: 'heading',
                        level
                    }]
                }
            });
        });
    }

    // Parse lists
    const lists = text.match(/^[\s-]*[-*+]\s+.+$/gm);
    if (lists) {
        lists.forEach(item => {
            elements.push({
                type: 'markdown',
                content: item.replace(/^[\s-]*[-*+]\s+/, ''),
                metadata: {
                    format: [{
                        type: 'list'
                    }]
                }
            });
        });
    }

    // Parse quotes
    const quotes = text.match(/^>\s+.+$/gm);
    if (quotes) {
        quotes.forEach(quote => {
            elements.push({
                type: 'markdown',
                content: quote.replace(/^>\s+/, ''),
                metadata: {
                    format: [{
                        type: 'quote'
                    }]
                }
            });
        });
    }

    // Parse links
    const links = text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const link of links) {
        elements.push({
            type: 'markdown',
            content: link[1],
            metadata: {
                format: [{
                    type: 'link',
                    url: link[2],
                    title: link[1]
                }]
            }
        });
    }

    // Parse tables
    const tables = text.match(/\|.+\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g);
    if (tables) {
        tables.forEach(table => {
            elements.push({
                type: 'markdown',
                content: table,
                metadata: {
                    format: [{
                        type: 'paragraph'
                    }]
                }
            });
        });
    }

    // Parse inline codes
    const inlineCodes = text.match(/`[^`]+`/g);
    if (inlineCodes) {
        inlineCodes.forEach(code => {
            elements.push({
                type: 'markdown',
                content: code.replace(/`/g, ''),
                metadata: {
                    format: [{
                        type: 'code_inline'
                    }]
                }
            });
        });
    }

    // Handle remaining text
    currentText = text
        .replace(/^#{1,6}\s+.+$/gm, '')
        .replace(/^[\s-]*[-*+]\s+.+$/gm, '')
        .replace(/^>\s+.+$/gm, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '')
        .replace(/\|.+\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g, '')
        .replace(/`[^`]+`/g, '')
        .trim();

    if (currentText) {
        elements.push({
            type: 'text',
            content: currentText
        });
    }

    return elements;
}

// Parse message data
function parseMessages(data: any): Message[] {
    return data.conversation?.map((msg: any) => {
        // Basic timestamp, if no timestamp then use current time
        const timestamp = msg.timestamp || Date.now();
        
        // Handle tool calls
        let toolCalls = [];
        let toolResults = [];
        let intermediateChunks = [];
        let capabilityStatuses: CapabilityStatuses = {};

        // Handle tool calls
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            toolCalls = msg.toolCalls.map((call: any) => ({
                ...call,
                timestamp: call.timestamp || timestamp + 1000 // Tool call timestamp is 1 second after message
            }));
        }

        // Handle tool call results
        if (msg.toolResults && Array.isArray(msg.toolResults)) {
            toolResults = msg.toolResults;
        }

        // Handle intermediate output chunks
        if (msg.intermediateOutput && Array.isArray(msg.intermediateOutput)) {
            intermediateChunks = msg.intermediateOutput;
        } else if (msg.chunks && Array.isArray(msg.chunks)) {
            intermediateChunks = msg.chunks;
        }

        // Handle capability statuses
        if (msg.capabilityStatuses) {
            capabilityStatuses = msg.capabilityStatuses;
        } else if (msg.capabilities?.status) {
            // Convert capability statuses
            capabilityStatuses = Object.entries(msg.capabilities.status).reduce<CapabilityStatuses>((acc, [key, value]) => {
                if (Array.isArray(value)) {
                    acc[key] = value.map((v: any) => ({
                        type: v.type || key,
                        status: v.status || 'completed',
                        timestamp: v.timestamp,
                        duration: v.duration,
                        error: v.error,
                        metadata: v.metadata
                    }));
                }
                return acc;
            }, {});
        }

        // Handle tool call statuses
        if (toolCalls.length > 0) {
            const toolCallStatuses: CapabilityStatus[] = toolCalls.map((call: any) => ({
                type: call.name,
                status: call.status || 'pending',
                timestamp: call.timestamp,
                duration: call.duration,
                error: call.error,
                metadata: {
                    parameters: call.parameters,
                    result: call.result
                }
            }));
            capabilityStatuses = {
                ...capabilityStatuses,
                ['tool-calls']: toolCallStatuses
            };
        }

        return {
            role: msg.type === 1 ? 'user' : 'assistant',
            content: msg.text || '',
            timestamp,
            metadata: {
                toolCalls,
                toolResults,
                context: msg.context
            },
            capabilityStatuses,
            intermediateChunks
        };
    }) || [];
}

// Create conversation data object
function createConversationData(id: string, data: any, messages: Message[]): ConversationData {
    // Calculate last updated time
    const lastTimestamp = Math.max(
        ...messages.map(m => m.timestamp || 0),
        ...messages.flatMap(m => (m.metadata?.toolCalls || []).map(c => c.timestamp || 0))
    );

    // Get last tool call
    const lastToolCall = messages
        .flatMap(m => m.metadata?.toolCalls || [])
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        [0];

    const metadata: ConversationMetadata = {
        name: data.name || 'Unnamed Conversation',
        mode: data.isAgentic ? 'agent' : 'normal',
        isAgentic: data.isAgentic || false,
        createdAt: data.createdAt || Date.now(),
        lastUpdatedAt: data.lastUpdatedAt || lastTimestamp,
        workspaceId: data.workspaceId,
        intent: detectIntent(messages),
        context: {
            workspace: data.context?.workspace,
            openFiles: data.context?.openFiles || [],
            cursorPosition: data.context?.cursorPosition,
            selectedText: data.context?.selectedText,
            linterErrors: data.context?.linterErrors || [],
            editTrailContexts: data.context?.editTrailContexts || []
        },
        status: {
            isComplete: data.isComplete || false,
            hasError: false,
            lastError: data.lastError,
            lastToolCall: lastToolCall ? {
                name: lastToolCall.name,
                timestamp: lastToolCall.timestamp || lastTimestamp,
                status: lastToolCall.status || 'completed'
            } : undefined
        },
        statistics: calculateStatistics(messages),
        files: [],
        tags: []
    };

    // Add tags
    metadata.tags = detectTags({ id, messages, metadata });

    return {
        id,
        messages,
        metadata
    };
}

// Calculate statistics
function calculateStatistics(messages: Message[]): ConversationMetadata['statistics'] {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    return {
        messageCount: messages.length,
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length
    };
}

// Detect intent
function detectIntent(messages: Message[]): ConversationMetadata['intent'] {
    // Extract all text
    const allText = messages
        .map(m => m.content)
        .join(' ');

    // Extract keywords
    const keywords = Array.from(new Set(
        allText.match(/\b\w{4,}\b/g) || []
    )).filter(word => {
        // Filter out common stop words
        const stopWords = new Set(['this', 'that', 'these', 'those', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how']);
        return !stopWords.has(word.toLowerCase());
    });

    // Detect intent category
    const patterns: Record<string, RegExp> = {
        codeGeneration: /(?:create|generate|write|implement|build)\b/i,
        debugging: /(?:debug|fix|solve|error|issue|problem|bug)\b/i,
        explanation: /(?:explain|understand|what|how|why|tell)\b/i,
        refactoring: /(?:refactor|improve|optimize|clean|restructure)\b/i
    };

    let maxConfidence = 0;
    let detectedCategory = 'other';

    Object.entries(patterns).forEach(([category, pattern]) => {
        const matches = allText.match(pattern) || [];
        const confidence = matches.length / allText.split(/\s+/).length;
        if (confidence > maxConfidence) {
            maxConfidence = confidence;
            detectedCategory = category;
        }
    });

    return {
        category: detectedCategory,
        confidence: Math.min(maxConfidence * 2, 1), // Adjust confidence range to 0-1
        keywords: keywords.slice(0, 10) // Only keep the first 10 keywords
    };
}

// Detect tags
function detectTags(params: { id: string; messages: Message[]; metadata: ConversationMetadata }): string[] {
    const tags = new Set<string>();
    
    // Add tags based on intent
    if (params.metadata.intent?.category) {
        tags.add(params.metadata.intent.category);
    }

    // Add tags based on code language
    const codeLanguages = new Set<string>();
    params.messages.forEach(msg => {
        const contents = parseMessageContent(msg.content);
        contents.forEach(content => {
            if (content.type === 'code' && content.language) {
                codeLanguages.add(content.language);
            }
        });
    });
    codeLanguages.forEach(lang => {
        tags.add(`lang:${lang}`);
    });

    // Add tags based on files
    if (params.metadata.files.length > 0) {
        tags.add('has-files');
    }

    // Add tags based on status
    if (params.metadata.status.hasError) {
        tags.add('has-error');
    }
    if (params.metadata.status.isComplete) {
        tags.add('completed');
    }

    // Add tags based on content features
    const contentTypes = new Set<string>();
    params.messages.forEach(msg => {
        const contents = parseMessageContent(msg.content);
        contents.forEach(content => {
            contentTypes.add(content.type);
        });
    });

    if (contentTypes.has('thinking')) {
        tags.add('has-thinking');
    }
    if (contentTypes.has('code')) {
        tags.add('has-code');
    }
    if (contentTypes.has('tool_call')) {
        tags.add('has-tool-calls');
    }
    if (contentTypes.has('tool_result')) {
        tags.add('has-tool-results');
    }

    return Array.from(tags);
}

// Get conversation from database
async function getConversationFromDB(id: string): Promise<ConversationData | null> {
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

            // 2. If not found, check if workspace has conversation reference
            workspaceDb = await openDatabase('workspace');
            const workspaceRef = await workspaceDb.get(
                'SELECT value FROM ItemTable WHERE key = ?',
                [`workbench.panel.chat.${id}`]
            ) as { value: string } | undefined;

            if (workspaceRef) {
                try {
                    const refData = JSON.parse(workspaceRef.value);
                    // If reference found, try global storage again
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
        // Ensure database connections are released
        try {
            if (globalDb) {
                releaseConnection('global', globalDb);
            }
            if (workspaceDb) {
                releaseConnection('workspace', workspaceDb);
            }
        } catch (releaseErr) {
            log(`Failed to release database connections: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`, 'warn');
        }
    }
}

// Get conversation
async function getConversation(id?: string): Promise<ConversationData | null> {
    let db: SQLiteDatabase | null = null;
    
    try {
        // If no ID provided, try to get current active conversation from database
        if (!id) {
            db = await openDatabase('global');
            try {
                const currentId = await findCurrentConversation(db);
                if (currentId) {
                    return getConversationFromDB(currentId);
                }
                return null;
            } finally {
                if (db) {
                    releaseConnection('global', db);
                }
            }
        }

        // If ID provided, directly get from database
        return getConversationFromDB(id);
    } catch (err) {
        log(`Failed to get conversation: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    } finally {
        // Ensure database connection is released
        if (db) {
            try {
                releaseConnection('global', db);
            } catch (releaseErr) {
                log(`Failed to release database connection: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`, 'warn');
            }
        }
    }
}

// Save export file
async function saveExportFile(content: string, filePath: string): Promise<void> {
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        log(`Successfully saved file to: ${filePath}`, 'info');
    } catch (err) {
        log(`Failed to save file: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// Get all possible workspace paths
function getWorkspacePaths(): string[] {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');
    
    if (!fs.existsSync(workspaceStoragePath)) {
        throw new Error(`Cursor workspace directory does not exist: ${workspaceStoragePath}`);
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

// Find current active conversation
async function findCurrentConversation(db: SQLiteDatabase): Promise<string | null> {
    try {
        return await withTransaction(db, async (db) => {
            // 1. First check editor state
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

// Find all VSCDB files
async function findVSCDBFiles(): Promise<string[]> {
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

        // 3. Check global storage directories for databases
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

        // 4. Check user data directory for databases
        const userStateDb = path.join(userPath, 'state.vscdb');
        if (fs.existsSync(userStateDb)) {
            log('Found user state database', 'info');
            dbFiles.push(userStateDb);
        }

        // 5. Check Cursor-specific databases
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

// Check if workspace contains database file
function hasDatabase(workspacePath: string): boolean {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.existsSync(dbPath);
    } catch (err) {
        log(`Failed to check database existence: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return false;
    }
}

// Get last modified time of workspace
function getLastModified(workspacePath: string): number {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.statSync(dbPath).mtimeMs;
    } catch (err) {
        log(`Failed to get last modified time: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return 0;
    }
}

// Get all possible workspace paths
function getWorkspacePaths(): string[] {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');

    if (!fs.existsSync(workspaceStoragePath)) {
        throw new Error(`Cursor workspace directory does not exist: ${workspaceStoragePath}`);
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

// Get conversation from database
async function getConversationFromDB(id: string): Promise<ConversationData | null> {
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

            // 2. If not found, check if workspace has conversation reference
            workspaceDb = await openDatabase('workspace');
            const workspaceRef = await workspaceDb.get(
                'SELECT value FROM ItemTable WHERE key = ?',
                [`workbench.panel.chat.${id}`]
            ) as { value: string } | undefined;

            if (workspaceRef) {
                try {
                    const refData = JSON.parse(workspaceRef.value);
                    // If reference found, try global storage again
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
        // Ensure database connections are released
        try {
            if (globalDb) {
                releaseConnection('global', globalDb);
            }
            if (workspaceDb) {
                releaseConnection('workspace', workspaceDb);
            }
        } catch (releaseErr) {
            log(`Failed to release database connections: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`, 'warn');
        }
    }
}