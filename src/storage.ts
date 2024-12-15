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

// 数据库连接池配置
const DB_POOL_CONFIG = {
    maxSize: 5,                  // 最大连接数
    idleTimeout: 30000,         // 空闲超时时间（毫秒）
    acquireTimeout: 10000,      // 获取连接超时时间（毫秒）
    retryAttempts: 3,           // 重试次数
    retryDelay: 1000           // 重试延迟（毫秒）
};

// 数据库连接池
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

// 清理空闲连接
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
                    log(`关闭空闲连接: ${type}`, 'info');
                } catch (err) {
                    log(`关闭空闲连接失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
            }
        }
    }
}

// 定期清理空闲连接
setInterval(cleanIdleConnections, DB_POOL_CONFIG.idleTimeout);

// 获取可用连接
async function getConnection(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    const pool = dbPool[type];
    
    // 1. 尝试获取空闲连接
    const idleConn = pool.find(conn => !conn.inUse);
    if (idleConn) {
        idleConn.inUse = true;
        idleConn.lastUsed = Date.now();
        return idleConn.db;
    }
    
    // 2. 如果连接池未满，创建新连接
    if (pool.length < DB_POOL_CONFIG.maxSize) {
        let attempts = 0;
        let lastError: Error | null = null;
        
        while (attempts < DB_POOL_CONFIG.retryAttempts) {
            try {
                const paths = getDatabasePaths();
                const dbPath = type === 'global' ? paths.global : paths.workspace;

                if (!fs.existsSync(dbPath)) {
                    throw new Error(`数据库文件不存在: ${dbPath}`);
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
                log(`创建数据库连接失败 (尝试 ${attempts + 1}/${DB_POOL_CONFIG.retryAttempts}): ${lastError.message}`, 'warn');
                attempts++;
                if (attempts < DB_POOL_CONFIG.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, DB_POOL_CONFIG.retryDelay));
                }
            }
        }
        
        throw new Error(`无法创建数据库连接: ${lastError?.message}`);
    }
    
    // 3. 如果连接池已满，等待可用连接
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
    
    throw new Error('获取数据库连接超时');
}

// 释放连接
function releaseConnection(type: 'global' | 'workspace', db: SQLiteDatabase) {
    const pool = dbPool[type];
    const conn = pool.find(conn => conn.db === db);
    if (conn) {
        conn.inUse = false;
        conn.lastUsed = Date.now();
    }
}

// 打开数据库连接
async function openDatabase(type: 'global' | 'workspace'): Promise<SQLiteDatabase> {
    try {
        return await getConnection(type);
    } catch (err) {
        log(`打开数据库失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// 关闭数据库连接
async function closeDatabase(type?: 'global' | 'workspace'): Promise<void> {
    try {
        if (type) {
            // 关闭指定类型的所有连接
            const pool = dbPool[type];
            for (const conn of pool) {
                try {
                    await conn.db.close();
                } catch (err) {
                    log(`关闭数据库连接失败: ${err instanceof Error ? err.message : String(err)}`, 'warn');
                }
            }
            pool.length = 0;
        } else {
            // 关闭所有连接
            for (const type of ['global', 'workspace'] as const) {
                const pool = dbPool[type];
                for (const conn of pool) {
                    try {
                        await conn.db.close();
                    } catch (err) {
                        log(`关闭数据库连接失败: ${err instanceof Error ? err.message : String(err)}`, 'warn');
                    }
                }
                pool.length = 0;
            }
        }
    } catch (err) {
        log(`关闭数据库失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// 执行数据库事务
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

// 获取Cursor配置目录路径
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
            throw new Error(`不支持的操作系统: ${platform}`);
    }
}

// 获取数据库路径
function getDatabasePaths(): { global: string; workspace: string } {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    
    return {
        global: path.join(userPath, 'globalStorage', 'state.vscdb'),
        workspace: path.join(userPath, 'workspaceStorage', vscode.workspace.name || '', 'state.vscdb')
    };
}

// 检测代码语言
function detectLanguage(lang: string): string {
    if (!lang) {return 'plaintext';}
    
    // 移除assistant_snippet_前缀
    if (lang.startsWith('assistant_snippet_')) {
        return 'plaintext';
    }

    // 标准化语言名称
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

// 格式化日期
function formatDate(timestamp: number | string): string {
    if (!timestamp) {return 'Invalid Date';}
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Invalid Date';
    }
}

// 获取可读的工作区名称
function getReadableWorkspaceName(workspaceId: string): string {
    try {
        // 1. 从工作区路径中提取项目名称
        const workspacePath = path.join(getCursorConfigPath(), 'User', 'workspaceStorage', workspaceId);
        if (fs.existsSync(workspacePath)) {
            // 尝试读取工作区配置
            const configPath = path.join(workspacePath, 'workspace.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.folder) {
                    // 从文件夹路径中提取项目名称
                    return path.basename(config.folder);
                }
            }
            
            // 如果找不到配置，尝试从目录名中提取有意义的信息
            const parentDir = path.dirname(workspacePath);
            if (fs.existsSync(parentDir)) {
                const dirs = fs.readdirSync(parentDir);
                const matchingDir = dirs.find(dir => dir.includes(workspaceId));
                if (matchingDir) {
                    // 移除哈希部分，保留可能的项目名称
                    return matchingDir.replace(/[0-9a-f]{32}/i, '').replace(/[-_]/g, ' ').trim();
                }
            }
        }
    } catch (err) {
        log(`获取工作区名称失败: ${err instanceof Error ? err.message : String(err)}`, 'warn');
    }
    
    // 如果无法获取更有意义的名称，返回工作区ID的简短版本
    return `ws-${workspaceId.substring(0, 6)}`;
}

// 去重处理
function deduplicateConversations(conversations: Record<string, ConversationWithSource>): Record<string, any> {
    const dedupedData: Record<string, any> = {};
    const convMap = new Map<string, ConversationWithSource[]>();

    // 按对话ID分组
    Object.entries(conversations).forEach(([key, conv]) => {
        const convId = key.split(':')[1];
        if (!convMap.has(convId)) {
            convMap.set(convId, []);
        }
        convMap.get(convId)!.push(conv);
    });

    // 处理每组重复的对话
    convMap.forEach((convs, convId) => {
        if (convs.length === 1) {
            // 没有重复，直接使用
            dedupedData[`composerData:${convId}`] = convs[0].data;
        } else {
            // 有重复，需要选择最新的版本
            log(`发现重复对话 ${convId}`, 'info');
            convs.forEach(conv => {
                log(`来源: ${conv.source}, 数据库: ${conv.dbPath}`, 'info');
                log(`更新时间: ${formatDate(conv.data.lastUpdatedAt)}`, 'info');
            });

            // 按最后更新时间排序，选择最新的
            const newest = convs.reduce((prev, curr) => {
                const prevTime = prev.data.lastUpdatedAt || 0;
                const currTime = curr.data.lastUpdatedAt || 0;
                return currTime > prevTime ? curr : prev;
            });

            log(`选择来源 ${newest.source} 的版本（${formatDate(newest.data.lastUpdatedAt)}）`, 'info');
            dedupedData[`composerData:${convId}`] = newest.data;
        }
    });

    return dedupedData;
}

// 处理难以解析的反引号模式
function handleDifficultBackticks(text: string): string {
    // 检测连续的4个或更多反引号
    const difficultPattern = /(`{4,})/g;
    return text.replace(difficultPattern, (match) => {
        // 将难以解析的反引号转换为emoji工具调用
        return `<function_calls><invoke name="emoji"><parameter name="emoji">code</parameter></invoke></function_calls>`;
    });
}

// 提取代码块
function parseCodeBlocks(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    let processedRanges: Array<{start: number, end: number}> = [];
    
    // 处理 assistant_snippet 格式
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

    // 处理其他代码块
    const codeBlockRegex = /(`+)(\w*)\n([\s\S]*?)\1/g;
    while ((snippetMatch = codeBlockRegex.exec(text)) !== null) {
        // 检查这个范围是否已经被处理过
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

    // 按原始位置排序
    return contents.sort((a, b) => 
        (a.metadata?.originalRange?.start || 0) - (b.metadata?.originalRange?.start || 0)
    );
}

// 解析消息内容
function parseMessageContent(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    let currentContext: {
        toolCall?: MessageContent,
        result?: MessageContent,
        relatedContent?: MessageContent[]
    } = {};
    
    try {
        // 预处理文本，处理难以解析的反引号模式
        text = handleDifficultBackticks(text);

        // 保留原始空行信息
        const lines = text.split('\n');
        const emptyLineIndices = lines.reduce((acc, line, index) => {
            if (line.trim() === '') {
                acc.push(index);
            }
            return acc;
        }, [] as number[]);

        // 提取thinking块
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

        // 提取assistant_snippet块
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

        // 提取代码块
        const codeBlocks = parseCodeBlocks(text);
        contents.push(...codeBlocks);

        // 提取工具调用块 - 改进XML标记配
        const toolCallRegex = /<function_calls>\s*<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>\s*<\/antml:function_calls>/g;
        let toolMatch;
        let hasToolCalls = false;
        while ((toolMatch = toolCallRegex.exec(text)) !== null) {
            hasToolCalls = true;
            const toolName = toolMatch[1];
            const paramsContent = toolMatch[2];
            
            // 解析工具参数
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

            // 创建工具调用内容
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
                
                // 特殊处理emoji工具调用
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

        // 提取工具结果
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

        // 改进工具推断逻辑
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
                
                // 添加相关内容
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

        // 提取function_results标签
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

        // 处理剩余文本
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
        log(`解析消息内容失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }

    return contents;
}

// 辅助函数

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
            // 保留空行作为单独的段落
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

        // 分析段落内容和上下文
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
    // 工具模式匹配
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

    // 上下文相关性分析
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

// 解析Markdown元素
function parseMarkdownElements(text: string, emptyLineIndices?: number[]): MessageContent[] {
    const elements: MessageContent[] = [];
    let currentText = '';

    // 解析题
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

    // 解析列表
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

    // 解析引用
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

    // 解析链接
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

    // 解析表格
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

    // 解析行内代码
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

    // 处理剩余文本
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

// 解析消息数据
function parseMessages(data: any): Message[] {
    return data.conversation?.map((msg: any) => {
        // 基础时间戳，如果没有时间戳则使用当前时间
        const timestamp = msg.timestamp || Date.now();
        
        // 处理工具调用
        let toolCalls = [];
        let toolResults = [];
        let intermediateChunks = [];
        let capabilityStatuses: CapabilityStatuses = {};

        // 处理工具调用
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            toolCalls = msg.toolCalls.map((call: any) => ({
                ...call,
                timestamp: call.timestamp || timestamp + 1000 // 工具调用时间戳比消息晚1秒
            }));
        }

        // 处理工具调用结果
        if (msg.toolResults && Array.isArray(msg.toolResults)) {
            toolResults = msg.toolResults;
        }

        // 处理中间输出块
        if (msg.intermediateOutput && Array.isArray(msg.intermediateOutput)) {
            intermediateChunks = msg.intermediateOutput;
        } else if (msg.chunks && Array.isArray(msg.chunks)) {
            intermediateChunks = msg.chunks;
        }

        // 处理能力状态
        if (msg.capabilityStatuses) {
            capabilityStatuses = msg.capabilityStatuses;
        } else if (msg.capabilities?.status) {
            // 转换能力状态
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

        // 处理工具调用状态
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

// 创建对话数据对象
function createConversationData(id: string, data: any, messages: Message[]): ConversationData {
    // 计算最后更新时间
    const lastTimestamp = Math.max(
        ...messages.map(m => m.timestamp || 0),
        ...messages.flatMap(m => (m.metadata?.toolCalls || []).map(c => c.timestamp || 0))
    );

    // 获取最后一个工具调用
    const lastToolCall = messages
        .flatMap(m => m.metadata?.toolCalls || [])
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        [0];

    const metadata: ConversationMetadata = {
        name: data.name || '未命名话',
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

    // 添加标签
    metadata.tags = detectTags({ id, messages, metadata });

    return {
        id,
        messages,
        metadata
    };
}

// 计算统计信息
function calculateStatistics(messages: Message[]): ConversationMetadata['statistics'] {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    return {
        messageCount: messages.length,
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length
    };
}

// 检测意图
function detectIntent(messages: Message[]): ConversationMetadata['intent'] {
    // 提取所有文本
    const allText = messages
        .map(m => m.content)
        .join(' ');

    // 提取关键词
    const keywords = Array.from(new Set(
        allText.match(/\b\w{4,}\b/g) || []
    )).filter(word => {
        // 滤掉常见的停用词
        const stopWords = new Set(['this', 'that', 'these', 'those', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how']);
        return !stopWords.has(word.toLowerCase());
    });

    // 检测意图类别
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
        confidence: Math.min(maxConfidence * 2, 1), // 调整置信度范围到 0-1
        keywords: keywords.slice(0, 10) // 只保留前10个关键词
    };
}

// 检测标签
function detectTags(params: { id: string; messages: Message[]; metadata: ConversationMetadata }): string[] {
    const tags = new Set<string>();
    
    // 添加基于意图的标签
    if (params.metadata.intent?.category) {
        tags.add(params.metadata.intent.category);
    }

    // 添加基于代码语言的标签
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

    // 添加基于文件的标签
    if (params.metadata.files.length > 0) {
        tags.add('has-files');
    }

    // 添加基于状态的标签
    if (params.metadata.status.hasError) {
        tags.add('has-error');
    }
    if (params.metadata.status.isComplete) {
        tags.add('completed');
    }

    // 添加基于内容特征的标签
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

// 从数据库获取对话
async function getConversationFromDB(id: string): Promise<ConversationData | null> {
    let globalDb: SQLiteDatabase | null = null;
    let workspaceDb: SQLiteDatabase | null = null;

    try {
        // 1. 首先从全局存储获取完整对话数据
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
                        log('对话不包含任何消息', 'warn');
                        return null;
                    }

                    return createConversationData(id, data, messages);
                } catch (parseErr) {
                    log(`解析对话数据失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'error');
                    return null;
                }
            }

            // 2. 如果没找到，检查工作区是否有对话引用
            workspaceDb = await openDatabase('workspace');
            const workspaceRef = await workspaceDb.get(
                'SELECT value FROM ItemTable WHERE key = ?',
                [`workbench.panel.chat.${id}`]
            ) as { value: string } | undefined;

            if (workspaceRef) {
                try {
                    const refData = JSON.parse(workspaceRef.value);
                    // 如果找到引用，再次尝试从全局存储获取
                    if (refData.composerId) {
                        const refConversation = await db.get(
                            'SELECT value FROM cursorDiskKV WHERE key = ?',
                            [`composerData:${refData.composerId}`]
                        ) as { value: string } | undefined;

                        if (refConversation) {
                            const data = JSON.parse(refConversation.value);
                            const messages = parseMessages(data);
                            
                            if (messages.length === 0) {
                                log('引用的对话不包含任何消息', 'warn');
                                return null;
                            }

                            return createConversationData(refData.composerId, data, messages);
                        }
                    }
                } catch (parseErr) {
                    log(`解析工作区引用失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'error');
                    return null;
                }
            }

            log(`未找到对话 ${id}`, 'warn');
            return null;
        });

        return result;
    } catch (err) {
        log(`从数据库获取对话失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    } finally {
        // 确保释放数据库连接
        try {
            if (globalDb) {
                releaseConnection('global', globalDb);
            }
            if (workspaceDb) {
                releaseConnection('workspace', workspaceDb);
            }
        } catch (releaseErr) {
            log(`释放数据库连接失败: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`, 'warn');
        }
    }
}

// 获取对话
async function getConversation(id?: string): Promise<ConversationData | null> {
    let db: SQLiteDatabase | null = null;
    
    try {
        // 如果没有提供ID，尝试从数据库获取当前活动对话
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

        // 如果提供了ID，直接从数据库获取
        return getConversationFromDB(id);
    } catch (err) {
        log(`获取对话失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return null;
    } finally {
        // 确保释放数据库连接
        if (db) {
            try {
                releaseConnection('global', db);
            } catch (releaseErr) {
                log(`释放数据库连接失败: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`, 'warn');
            }
        }
    }
}

// 保存导出文件
async function saveExportFile(content: string, filePath: string): Promise<void> {
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        log(`成功保存文件到: ${filePath}`, 'info');
    } catch (err) {
        log(`保存文件失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// 获取所有可能的工作区路径
function getWorkspacePaths(): string[] {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');
    
    if (!fs.existsSync(workspaceStoragePath)) {
        throw new Error(`Cursor 工作区目录不存在: ${workspaceStoragePath}`);
    }

    // 获取所有工作区目录
    const workspaces = fs.readdirSync(workspaceStoragePath)
        .map(name => path.join(workspaceStoragePath, name))
        .filter(dir => fs.statSync(dir).isDirectory());

    // 添加全局存储目录
    if (fs.existsSync(globalStoragePath)) {
        workspaces.push(globalStoragePath);
    }

    return workspaces;
}

// 查找当前活动的对话
async function findCurrentConversation(db: SQLiteDatabase): Promise<string | null> {
    try {
        return await withTransaction(db, async (db) => {
            // 1. 首先检查编辑器状态
            const editorState = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['workbench.editor.activeEditor']
            ) as DatabaseRow | undefined;

            if (editorState) {
                try {
                    const data = JSON.parse(editorState.value);
                    if (data.composerId) {
                        log('从编辑器状态找到当前对话', 'info');
                        return data.composerId;
                    }
                } catch (parseErr) {
                    log(`解析编辑器状态失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            // 2. 检查composer数据
            const composerData = await db.get(
                'SELECT value FROM ItemTable WHERE key = ? LIMIT 1',
                ['composer.composerData']
            ) as DatabaseRow | undefined;
            
            if (composerData) {
                try {
                    const data = JSON.parse(composerData.value);
                    if (data.currentConversationId) {
                        log('从composer数据找到当前对话', 'info');
                        return data.currentConversationId;
                    }
                } catch (parseErr) {
                    log(`解析composer数据失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            // 3. 检查最近的对话
            const recentConversation = await db.get(
                'SELECT key FROM cursorDiskKV WHERE key LIKE ? ORDER BY json_extract(value, "$.lastUpdatedAt") DESC LIMIT 1',
                ['composerData:%']
            ) as DatabaseRow | undefined;

            if (recentConversation) {
                try {
                    const parts = recentConversation.key.split(':');
                    if (parts.length === 2) {
                        log('从最近对话找到当前对话', 'info');
                        return parts[1];
                    }
                } catch (parseErr) {
                    log(`解析最近对话失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                }
            }

            log('未找到当前活动对话', 'warn');
            return null;
        });
    } catch (err) {
        log(`查询当前对话失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// 查找所有VSCDB文件
async function findVSCDBFiles(): Promise<string[]> {
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');
    const workspaceStoragePath = path.join(userPath, 'workspaceStorage');
    const globalStoragePath = path.join(userPath, 'globalStorage');
    const dbFiles: string[] = [];

    try {
        // 1. 检查工作区数据库
        if (fs.existsSync(workspaceStoragePath)) {
            const workspaces = fs.readdirSync(workspaceStoragePath)
                .map(name => path.join(workspaceStoragePath, name))
                .filter(dir => fs.statSync(dir).isDirectory());

            for (const workspace of workspaces) {
                const stateDb = path.join(workspace, 'state.vscdb');
                if (fs.existsSync(stateDb)) {
                    log('找到工作区数据库', 'info');
                    dbFiles.push(stateDb);
                }
            }
        }

        // 2. 检查全局数据库
        const globalStateDb = path.join(userPath, 'state-global.vscdb');
        if (fs.existsSync(globalStateDb)) {
            log('找到全局状态数据库', 'info');
            dbFiles.push(globalStateDb);
        }

        // 3. 检查全局存储目录中的数据库
        if (fs.existsSync(globalStoragePath)) {
            log('扫描全局存储目录', 'info');
            const globalDirs = fs.readdirSync(globalStoragePath);
            for (const dir of globalDirs) {
                const globalDbPath = path.join(globalStoragePath, dir, 'state.vscdb');
                if (fs.existsSync(globalDbPath)) {
                    log('找到全局存储数据库', 'info');
                    dbFiles.push(globalDbPath);
                }
            }
        }

        // 4. 检查用户数据目录下的数据库
        const userStateDb = path.join(userPath, 'state.vscdb');
        if (fs.existsSync(userStateDb)) {
            log('找到用户状态数据库', 'info');
            dbFiles.push(userStateDb);
        }

        // 5. 检查 Cursor 特定的数据库
        const cursorStateDb = path.join(cursorPath, 'state.vscdb');
        if (fs.existsSync(cursorStateDb)) {
            log('找到 Cursor 状态数据库', 'info');
            dbFiles.push(cursorStateDb);
        }

        return dbFiles;
    } catch (err) {
        log(`查找数据库文件失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
}

// 检查工作区是否包含数据库文件
function hasDatabase(workspacePath: string): boolean {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.existsSync(dbPath);
    } catch (err) {
        log(`检查数据库存在失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return false;
    }
}

// 获取工作区的最后修改时间
function getLastModified(workspacePath: string): number {
    try {
        const dbPath = path.join(workspacePath, 'state.vscdb');
        return fs.statSync(dbPath).mtimeMs;
    } catch (err) {
        log(`获取最后修改时间失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return 0;
    }
}

// 查找活动对话
async function findActiveConversations(db: SQLiteDatabase): Promise<ConversationLocation[]> {
    const locations: ConversationLocation[] = [];
    
    try {
        await withTransaction(db, async (db) => {
            // 1. 检查编辑器状态
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
                        // 解析编辑器状态中的对话ID
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
                        log(`解析编辑器状态失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                        // 继续处理下一行
                    }
                }
            }

            // 2. 检查工作区状态
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
                        log(`解析工作区状态失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                        // 继续处理下一行
                    }
                }
            }

            // 3. 检查最近的对话
            const recentRows = await db.all(
                'SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY json_extract(value, "$.lastUpdatedAt") DESC LIMIT 5',
                ['composerData:%']
            ) as DatabaseRow[];

            if (recentRows) {
                for (const row of recentRows) {
                    try {
                        const parts = row.key.split(':');
                        if (parts.length !== 2) {
                            log(`无效的对话ID格式: ${row.key}`, 'warn');
                            continue;
                        }
                        const convId = parts[1];
                        const data = JSON.parse(row.value) as { lastUpdatedAt?: number; workspaceId?: string };
                        locations.push({
                            workspaceId: data.workspaceId || '',
                            conversationId: convId,
                            timestamp: data.lastUpdatedAt || Date.now(),
                            source: 'recent'
                        });
                    } catch (parseErr) {
                        log(`解析最近对话失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, 'warn');
                        // 继续处理下一行
                    }
                }
            }
        });

        // 按时间戳排序并去重
        return Array.from(
            new Map(
                locations
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(loc => [loc.conversationId, loc])
            ).values()
        );
    } catch (err) {
        log(`查找活动对话失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return [];
    }
}

// 导出函数
export {
    getConversationFromDB,
    getConversation,
    saveExportFile,
    openDatabase,
    closeDatabase,
    parseMessageContent,
    calculateStatistics,
    detectIntent,
    detectTags,
    getWorkspacePaths,
    findCurrentConversation,
    findVSCDBFiles,
    hasDatabase,
    getLastModified,
    findActiveConversations,
    deduplicateConversations,
    getReadableWorkspaceName,
    formatDate
}; 

export async function getAllConversations(): Promise<ConversationData[]> {
    let globalDb: SQLiteDatabase | null = null;
    
    try {
        // 打开全局数据库
        globalDb = await openDatabase('global');
        
        // 查询所有对话数据
        const rows = await globalDb.all(
            'SELECT key, value FROM cursorDiskKV WHERE key LIKE ?',
            ['composerData:%']
        ) as DatabaseRow[];

        // 解析每条对话数据
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
                log(`解析对话数据失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
                // 继续处理下一条记录
            }
        }

        return conversations;
    } catch (err) {
        log(`获取所有对话失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    } finally {
        if (globalDb) {
            releaseConnection('global', globalDb);
        }
    }
} 