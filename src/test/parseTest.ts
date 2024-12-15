import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sqlite3 from 'sqlite3';
import * as glob from 'glob';

interface DatabaseRow {
    key: string;
    value: string;
}

interface EditorState {
    conversations?: Array<{
        id: string;
        timestamp?: number;
    }>;
    recentConversations?: Array<{
        id: string;
        timestamp?: number;
    }>;
}

interface WorkspaceState {
    activeConversation?: string;
    currentConversation?: string;
    workspaceId?: string;
}

interface ExportOptions {
    currentOnly?: boolean;
    workspaceOnly?: boolean;
    includeMetadata?: boolean;
    includeContent?: boolean;
    format?: 'markdown' | 'json' | 'both';
    outputDir?: string;
}

interface WorkspaceInfo {
    path: string;
    id: string;
    name?: string;
    storageDir?: string;
}

interface ComposerInfo {
    id: string;
    name: string;
    createdAt: number;
    lastUpdatedAt: number;
    isActive: boolean;
    workspaceId?: string;
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
async function findCurrentConversation(db: sqlite3.Database): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT key, value FROM ItemTable 
            WHERE key = 'composer.composerData'
            LIMIT 1
        `;
        
        db.get(query, (err, row: DatabaseRow | undefined) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                resolve(null);
                return;
            }

            try {
                const data = JSON.parse(row.value);
                console.log('  当前对话数据:', JSON.stringify(data, null, 2));
                if (data.currentConversationId) {
                    resolve(data.currentConversationId);
                } else {
                    resolve(null);
                }
            } catch (err) {
                reject(err);
            }
        });
    });
}

// 查找所有VSCDB文件
async function findVSCDBFiles(): Promise<string[]> {
    const workspaces = getWorkspacePaths();
    const dbFiles: string[] = [];
    const cursorPath = getCursorConfigPath();
    const userPath = path.join(cursorPath, 'User');

    // 1. 添加工作区数据库
    for (const workspace of workspaces) {
        const stateDb = path.join(workspace, 'state.vscdb');
        if (fs.existsSync(stateDb)) {
            console.log('找到工作区数据库:', stateDb);
            dbFiles.push(stateDb);
        }
    }

    // 2. 添加全局数据库
    const globalStoragePath = path.join(userPath, 'globalStorage');
    const globalStateDb = path.join(userPath, 'state-global.vscdb');
    
    // 检查全局状态数据库
    if (fs.existsSync(globalStateDb)) {
        console.log('找到全局状态数据库:', globalStateDb);
        dbFiles.push(globalStateDb);
    }

    // 检查全局存储目录中的数据库
    if (fs.existsSync(globalStoragePath)) {
        console.log('扫描全局存储目录:', globalStoragePath);
        const globalDirs = fs.readdirSync(globalStoragePath);
        for (const dir of globalDirs) {
            const globalDbPath = path.join(globalStoragePath, dir, 'state.vscdb');
            if (fs.existsSync(globalDbPath)) {
                console.log('找到全局存储数据库:', globalDbPath);
                dbFiles.push(globalDbPath);
            }
        }
    }

    // 3. 添加用户数据目录下的数据库
    const userStateDb = path.join(userPath, 'state.vscdb');
    if (fs.existsSync(userStateDb)) {
        console.log('找到用户状态数据库:', userStateDb);
        dbFiles.push(userStateDb);
    }

    // 4. 检查 Cursor 特定的数据库
    const cursorStateDb = path.join(cursorPath, 'state.vscdb');
    if (fs.existsSync(cursorStateDb)) {
        console.log('找到 Cursor 状态数据库:', cursorStateDb);
        dbFiles.push(cursorStateDb);
    }

    return dbFiles;
}

// 检查工作区是否包含数据库文件
function hasDatabase(workspacePath: string): boolean {
    const dbPath = path.join(workspacePath, 'state.vscdb');
    return fs.existsSync(dbPath);
}

// 获取工作区的最后修改时间
function getLastModified(workspacePath: string): number {
    const dbPath = path.join(workspacePath, 'state.vscdb');
    return fs.statSync(dbPath).mtimeMs;
}

interface ToolCall {
    name: string;
    parameters?: any;
}

interface MessageMetadata {
    commandType?: number;
    toolCalls?: ToolCall[];
    toolResults?: string[];
    context?: any;
}

interface MessageContent {
    type: 'text' | 'code' | 'thinking' | 'markdown' | 'tool_call' | 'tool_result';
    content: string;
    language?: string;
    format?: {
        type: 'heading' | 'list' | 'table' | 'quote' | 'link' | 'emphasis' | 'code_inline';
        level?: number;
        url?: string;
        title?: string;
    }[];
    metadata?: {
        toolName?: string;
        toolParams?: any;
        status?: 'success' | 'error' | 'pending';
        duration?: number;
        error?: string;
    };
}

interface Message {
    type: 'user' | 'assistant';
    text: string;
    timestamp: number;
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
}

interface CapabilityStatus {
    type: string;
    status: 'completed' | 'error' | 'pending';
}

interface CapabilityStatuses {
    [key: string]: CapabilityStatus[];
}

interface ConversationMessage {
    type: 'user' | 'assistant';
    text: string;
    timestamp: number;
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

interface ParsedConversation {
    id: string;
    messages: ConversationMessage[];
    metadata: ConversationMetadata;
}

interface ConversationMetadata {
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
        editTrailContexts: any[];      // 编辑历史上下文
        diffHistories: any[];          // 差异历史
        diffHistory?: {                // 差异历史详情
            files: {
                path: string;
                scheme: string;
            }[];
            diffHistories: any[];
            uniqueId: string;
        };
        fileSelections: {              // 文件选择
            uri: {
                fsPath: string;
                external: string;
                path: string;
                scheme: string;
            };
            addedWithoutMention: boolean;
        }[];
        folderSelections: any[];       // 文件夹选择
        terminalFiles: any[];          // 终端相关文件
        notepads: any[];              // 记事本
        quotes: any[];                // 引用
        selectedCommits: any[];       // 选中的提交
        selectedPullRequests: any[];  // 选中的 PR
        selectedImages: any[];        // 选中的图片
        selections: any[];            // 选择
        terminalSelections: any[];    // 终端选择
        selectedDocs: any[];          // 选中的文档
        externalLinks: any[];         // 外部链接
        mentions?: {
            editTrailContexts: {};
            notepads: {};
            quotes: {};
            selectedCommits: {};
            selectedPullRequests: {};
            gitDiff: any[];
            gitDiffFromBranchToMain: any[];
            selectedImages: {};
            usesCodebase: any[];
            useWeb: any[];
            useLinterErrors: any[];
            useDiffReview: any[];
            useContextPicking: any[];
            useRememberThis: any[];
            diffHistory: any[];
        };
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
    capabilities?: {
        types: number[];              // 能力类型
        isIteration: boolean;         // 是否为能力迭代
        status: {                     // 能力状态
            'mutate-request': any[];
            'start-submit-chat': any[];
            'before-submit-chat': any[];
            'after-submit-chat': any[];
            'after-apply': any[];
            'composer-settled': any[];
            'composer-done': any[];
            'process-stream': any[];
            'before-ai-bubble': any[];
            'should-loop': any[];
        };
    };
    model?: {
        name: string;                 // 模型名称
        version?: string;             // 模型版本
        provider?: string;            // 模型提供者
        settings?: any;               // 模型设置
    };
    statistics: {
        messageCount: number;
        userMessageCount: number;
        assistantMessageCount: number;
        averageResponseTime: number;
        toolCallCount: number;
        errorCount: number;
        totalTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
        codeBlockCount: number;
        codeLanguages: { [key: string]: number };
        thinkingBlockCount: number;
        markdownBlockCount: number;
        fileReferenceCount: number;
        toolCallsByType: { [key: string]: number };
        toolCallSuccess: number;
        toolCallFailure: number;
        averageToolCallTime: number;
    };
    tags: string[];
    topics: string[];
    relatedConversations: Array<{
        id: string;
        similarity: number;
        reason: string;
    }>;
    files: Array<{
        path: string;
        type: 'read' | 'write' | 'reference';
        lineCount?: number;
        language?: string;
        lastModified?: number;
    }>;
}

export function parseMessageContent(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    
    // 提取thinking块
    const thinkingMatch = text.match(/```thinking\n([\s\S]*?)```/);
    if (thinkingMatch) {
        contents.push({
            type: 'thinking',
            content: thinkingMatch[1].trim()
        });
    }

    // 提取工具调用块
    const toolCallRegex = /<function_calls>\s*<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>\s*<\/antml:function_calls>/g;
    let toolMatch;
    while ((toolMatch = toolCallRegex.exec(text)) !== null) {
        const toolName = toolMatch[1];
        const paramsContent = toolMatch[2];
        
        // 解析工具参数
        const params: any = {};
        const paramMatches = paramsContent.matchAll(/<parameter name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g);
        for (const paramMatch of paramMatches) {
            params[paramMatch[1]] = paramMatch[2].trim();
        }

        contents.push({
            type: 'tool_call',
            content: toolMatch[0],
            metadata: {
                toolName,
                toolParams: params
            }
        });
    }

    // 提取工具结果
    const toolResultRegex = /<function_results>([\s\S]*?)<\/function_results>/g;
    let resultMatch;
    while ((resultMatch = toolResultRegex.exec(text)) !== null) {
        contents.push({
            type: 'tool_result',
            content: resultMatch[1].trim()
        });
    }

    // 提取代码块
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        if (!text.substring(match.index).startsWith('```thinking')) {
            const lang = match[1] || '';
            const code = match[2].trim();
            if (code) {  // 只添加非空的代码块
                contents.push({
                    type: 'code',
                    language: detectLanguage(lang),
                    content: code
                });
            }
        }
    }

    // 提取并解析Markdown格式
    let plainText = text
        .replace(/```thinking\n[\s\S]*?```/g, '')
        .replace(/```\w*\n[\s\S]*?```/g, '')
        .replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/g, '')
        .replace(/<function_results>[\s\S]*?<\/function_results>/g, '')
        .trim();

    if (plainText) {
        const markdownElements = parseMarkdownElements(plainText);
        contents.push(...markdownElements);
    }

    return contents;
}

export function detectLanguage(lang: string): string {
    if (!lang) return 'plaintext';
    
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

export function parseMarkdownElements(text: string): MessageContent[] {
    const elements: MessageContent[] = [];
    let currentText = '';

    // 解析标题
    const headings = text.match(/^#{1,6}\s+.+$/gm);
    if (headings) {
        headings.forEach(heading => {
            const level = heading.match(/^(#+)/)?.[1].length || 1;
            elements.push({
                type: 'markdown',
                content: heading.replace(/^#+\s+/, ''),
                format: [{
                    type: 'heading',
                    level
                }]
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
                format: [{
                    type: 'list'
                }]
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
                format: [{
                    type: 'quote'
                }]
            });
        });
    }

    // 解析链接
    const links = text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const link of links) {
        elements.push({
            type: 'markdown',
            content: link[1],
            format: [{
                type: 'link',
                url: link[2],
                title: link[1]
            }]
        });
    }

    // 解析表格
    const tables = text.match(/\|.+\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g);
    if (tables) {
        tables.forEach(table => {
            elements.push({
                type: 'markdown',
                content: table,
                format: [{
                    type: 'table'
                }]
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
                format: [{
                    type: 'code_inline'
                }]
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

function calculateStatistics(messages: Message[]): ConversationMetadata['statistics'] {
    const stats = calculateDetailedStatistics(messages);
    return {
        messageCount: stats.messageCount,
        userMessageCount: stats.userMessageCount,
        assistantMessageCount: stats.assistantMessageCount,
        averageResponseTime: stats.averageResponseTime,
        toolCallCount: stats.toolCallCount,
        errorCount: stats.errorCount,
        totalTokens: stats.totalTokens,
        promptTokens: stats.promptTokens,
        completionTokens: stats.completionTokens,
        codeBlockCount: stats.codeBlockCount,
        codeLanguages: stats.codeLanguages,
        thinkingBlockCount: stats.thinkingBlockCount,
        markdownBlockCount: stats.markdownBlockCount,
        fileReferenceCount: stats.fileReferenceCount,
        toolCallsByType: stats.toolCallsByType,
        toolCallSuccess: stats.toolCallSuccess,
        toolCallFailure: stats.toolCallFailure,
        averageToolCallTime: stats.averageToolCallTime
    };
}

function detectIntent(messages: Message[]): ConversationMetadata['intent'] {
    // 提取所有文本
    const allText = messages
        .map(m => m.text)
        .join(' ');

    // 提取关键词
    const keywords = Array.from(new Set(
        allText.match(/\b\w{4,}\b/g) || []
    )).filter(word => {
        // 过滤掉常见的停用词
        const stopWords = new Set(['this', 'that', 'these', 'those', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how']);
        return !stopWords.has(word.toLowerCase());
    });

    // 检测意图类别
    const patterns = {
        code_generation: /(?:create|generate|write|implement|build)\b/i,
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
        keywords: keywords.slice(0, 10) // 只保留前10个关键
    };
}

function detectTopics(messages: Message[]): string[] {
    const topics = new Set<string>();
    const topicPatterns = [
        /(?:about|regarding|concerning|discussing)\s+([^,.!?]+)/gi,
        /(?:how to|help with)\s+([^,.!?]+)/gi,
        /(?:implement|create|build|develop)\s+([^,.!?]+)/gi,
        /(?:debug|fix|solve)\s+([^,.!?]+)/gi,
        /(?:optimize|improve|enhance)\s+([^,.!?]+)/gi
    ];

    messages.forEach(msg => {
        if (msg.type === 'user') {
            topicPatterns.forEach(pattern => {
                const matches = msg.text.matchAll(pattern);
                for (const match of matches) {
                    if (match[1] && match[1].length > 3) {
                        topics.add(match[1].trim().toLowerCase());
                    }
                }
            });
        }
    });

    return Array.from(topics);
}

function detectTags(conversation: ParsedConversation): string[] {
    const tags = new Set<string>();
    
    // 添加基于意图的标签
    if (conversation.metadata.intent?.category) {
        tags.add(conversation.metadata.intent.category);
    }

    // 添加基于代码语言的标签
    Object.keys(conversation.metadata.statistics.codeLanguages).forEach(lang => {
        tags.add(`lang:${lang}`);
    });

    // 添加基于工具使用的标签
    Object.keys(conversation.metadata.statistics.toolCallsByType).forEach(tool => {
        tags.add(`tool:${tool}`);
    });

    // 添加基于文件类型的标签
    conversation.metadata.files.forEach(file => {
        if (file.language) {
            tags.add(`file:${file.language}`);
        }
    });

    // 添加基于状态的标签
    if (conversation.metadata.status.hasError) {
        tags.add('has-error');
    }
    if (conversation.metadata.status.isComplete) {
        tags.add('completed');
    }

    // 添加基于内容特征的标签
    if (conversation.metadata.statistics.thinkingBlockCount > 0) {
        tags.add('has-thinking');
    }
    if (conversation.metadata.statistics.codeBlockCount > 0) {
        tags.add('has-code');
    }
    if (conversation.metadata.statistics.fileReferenceCount > 0) {
        tags.add('has-files');
    }

    return Array.from(tags);
}

function findRelatedConversations(
    currentConv: ParsedConversation,
    allConvs: ParsedConversation[]
): Array<{ id: string; similarity: number; reason: string }> {
    const related: Array<{ id: string; similarity: number; reason: string }> = [];

    allConvs.forEach(conv => {
        if (conv.id === currentConv.id) return;

        let similarity = 0;
        const reasons: string[] = [];

        // 检查主题相似度
        const commonTopics = currentConv.metadata.topics.filter(t => 
            conv.metadata.topics.includes(t)
        );
        if (commonTopics.length > 0) {
            similarity += 0.3 * (commonTopics.length / Math.max(currentConv.metadata.topics.length, conv.metadata.topics.length));
            reasons.push(`共同主题: ${commonTopics.join(', ')}`);
        }

        // 检查标签相似度
        const commonTags = currentConv.metadata.tags.filter(t =>
            conv.metadata.tags.includes(t)
        );
        if (commonTags.length > 0) {
            similarity += 0.2 * (commonTags.length / Math.max(currentConv.metadata.tags.length, conv.metadata.tags.length));
            reasons.push(`共同标签: ${commonTags.join(', ')}`);
        }

        // 检查文件相似度
        const currentFiles = new Set(currentConv.metadata.files.map(f => f.path));
        const commonFiles = conv.metadata.files.filter(f => currentFiles.has(f.path));
        if (commonFiles.length > 0) {
            similarity += 0.3 * (commonFiles.length / Math.max(currentConv.metadata.files.length, conv.metadata.files.length));
            reasons.push(`共同文件: ${commonFiles.map(f => path.basename(f.path)).join(', ')}`);
        }

        // 检查时间相关性
        const timeGap = Math.abs(currentConv.metadata.createdAt - conv.metadata.createdAt);
        if (timeGap < 3600000) { // 1小时内
            similarity += 0.2;
            reasons.push('近期对话');
        }

        if (similarity > 0.3) {
            related.push({
                id: conv.id,
                similarity,
                reason: reasons.join('; ')
            });
        }
    });

    return related.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

function calculateDetailedStatistics(messages: Message[]): ConversationMetadata['statistics'] {
    const stats = {
        messageCount: messages.length,
        userMessageCount: 0,
        assistantMessageCount: 0,
        averageResponseTime: 0,
        toolCallCount: 0,
        errorCount: 0,
        codeBlockCount: 0,
        codeLanguages: {} as { [key: string]: number },
        thinkingBlockCount: 0,
        markdownBlockCount: 0,
        fileReferenceCount: 0,
        toolCallsByType: {} as { [key: string]: number },
        toolCallSuccess: 0,
        toolCallFailure: 0,
        averageToolCallTime: 0,
        totalTokens: undefined,
        promptTokens: undefined,
        completionTokens: undefined
    };

    let totalResponseTime = 0;
    let responseCount = 0;
    let totalToolCallTime = 0;

    messages.forEach((msg, index) => {
        if (msg.type === 'user') {
            stats.userMessageCount++;
            
            // 计算响应时间
            if (index < messages.length - 1 && messages[index + 1].type === 'assistant') {
                const responseTime = messages[index + 1].timestamp - msg.timestamp;
                if (responseTime > 0 && responseTime < 300000) { // 排除超5分钟的异常值
                    totalResponseTime += responseTime;
                    responseCount++;
                }
            }
        } else if (msg.type === 'assistant') {
            stats.assistantMessageCount++;

            // 分析消息内容
            const codeBlocks = msg.text.match(/```[\s\S]*?```/g) || [];
            codeBlocks.forEach(block => {
                const lang = block.match(/```(\w+)/)?.[1]?.toLowerCase();
                if (lang === 'thinking') {
                    stats.thinkingBlockCount++;
                } else {
                    stats.codeBlockCount++;
                    if (lang && lang !== 'plaintext') {
                        stats.codeLanguages[lang] = (stats.codeLanguages[lang] || 0) + 1;
                    }
                }
            });

            // 统计文件引用
            const fileRefs = msg.text.match(/`[^`]+\.[a-zA-Z0-9]+`/g) || [];
            stats.fileReferenceCount += fileRefs.length;

            // 统计 Markdown 块
            const mdBlocks = msg.text.match(/(?:^|\n)(?:[#*>-]|[0-9]+\.)\s/g) || [];
            stats.markdownBlockCount += mdBlocks.length;

            // 分析工具调用
            if (msg.metadata?.toolCalls?.length) {
                msg.metadata.toolCalls.forEach(call => {
                    stats.toolCallCount++;
                    const toolName = call.name || 'unknown';
                    stats.toolCallsByType[toolName] = (stats.toolCallsByType[toolName] || 0) + 1;

                    if (call.status === 'success') {
                        stats.toolCallSuccess++;
                    } else if (call.status === 'error') {
                        stats.toolCallFailure++;
                        stats.errorCount++;
                    }

                    if (call.timestamp) {
                        const nextCall = msg.metadata?.toolCalls?.find(c => 
                            c.timestamp !== undefined && 
                            call.timestamp !== undefined && 
                            c.timestamp > call.timestamp
                        );
                        if (nextCall?.timestamp && call.timestamp) {
                            const callTime = nextCall.timestamp - call.timestamp;
                            if (callTime > 0 && callTime < 30000) { // 排除超30秒的异常值
                                totalToolCallTime += callTime;
                            }
                        }
                    }
                });
            }
        }
    });

    // 计算平均值
    stats.averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    stats.averageToolCallTime = stats.toolCallCount > 0 ? totalToolCallTime / stats.toolCallCount : 0;

    return stats;
}

function parseConversation(data: any): ParsedConversation[] {
    const conversations: ParsedConversation[] = [];
    
    try {
        // 第一遍：收集所有对话
        Object.entries(data).forEach(([key, value]) => {
            try {
                if (!key.startsWith('composerData:')) return;
                
                const conv = value as any;
                if (!conv.conversation || !Array.isArray(conv.conversation)) {
                    console.warn(`警告: 对话数据格式错误 (${key})`);
                    return;
                }

                // 生成基准时间戳
                const baseTimestamp = conv.createdAt || (Date.now() - 3600000); // 默认创建时间为1小时前
                
                // 处理消息时间戳和中间状态
                const messages = conv.conversation.map((msg: any, index: number) => {
                    // 如果没有时间戳，根据消息顺序生成递增的时间戳
                    const timestamp = msg.timestamp || (baseTimestamp + index * 60000); // 每条消息间隔1分钟
                    
                    // 处理工具调用和中间状态
                    let toolCalls = [];
                    let toolResults = [];
                    let intermediateChunks = [];
                    let capabilityStatuses = {};

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
                        // 转换旧格式的能力状态
                        capabilityStatuses = Object.entries(msg.capabilities.status).reduce<CapabilityStatuses>((acc, [key, value]) => {
                            if (Array.isArray(value)) {
                                acc[key] = value.map((v: any) => ({
                                    type: v.type || 'unknown',
                                    status: v.status || 'completed'
                                }));
                            }
                            return acc;
                        }, {});
                    }

                    // 处理工具调用状态
                    if (toolCalls.length > 0) {
                        const toolCallStatuses: CapabilityStatus[] = toolCalls.map((call: any) => ({
                            type: call.name,
                            status: call.status || 'pending'
                        }));
                        capabilityStatuses = {
                            ...capabilityStatuses,
                            'tool-calls': toolCallStatuses
                        };
                    }

                    return {
                        type: msg.type === 1 ? 'user' : 'assistant',
                        text: msg.text || '',
                        timestamp,
                        metadata: {
                            toolCalls,
                            toolResults,
                            context: msg.context
                        },
                        capabilityStatuses,
                        intermediateChunks
                    };
                });

                // 计算最后更新时间
                const lastTimestamp = Math.max(
                    ...messages.map((m: Message) => m.timestamp),
                    ...messages.flatMap((m: Message) => (m.metadata?.toolCalls || []).map((c: { timestamp?: number }) => c.timestamp || 0))
                );

                conversations.push({
                    id: key.split(':')[1],
                    messages,
                    metadata: {
                        name: conv.name || '未命名对话',
                        mode: conv.isAgentic ? 'agent' : 'normal',  // 根据 isAgentic 字段判断模式
                        isAgentic: conv.isAgentic || false,         // 保留原始的 isAgentic 字段
                        createdAt: conv.createdAt || baseTimestamp,
                        lastUpdatedAt: conv.lastUpdatedAt || lastTimestamp,
                        workspaceId: conv.workspaceId,
                        intent: detectIntent(messages),
                        context: conv.context || {},
                        status: {
                            isComplete: conv.isComplete || false,
                            hasError: false,
                            lastError: conv.lastError,
                            lastToolCall: undefined
                        },
                        statistics: calculateDetailedStatistics(messages),
                        tags: [],
                        topics: detectTopics(messages),
                        relatedConversations: [],
                        files: []
                    }
                });
            } catch (err) {
                console.error(`解析对话数据失败 (${key}):`, err instanceof Error ? err.message : String(err));
            }
        });

        // 第二遍：补充关联信息
        conversations.forEach(conv => {
            try {
                // 添加标签
                conv.metadata.tags = detectTags(conv);

                // 查找相关对话
                conv.metadata.relatedConversations = findRelatedConversations(conv, conversations);

                // 收集文件引用
                const files = new Map<string, {
                    path: string;
                    type: 'read' | 'write' | 'reference';
                    lineCount?: number;
                    language?: string;
                    lastModified?: number;
                }>();

                // 从工具调用中提取
                conv.messages.forEach(msg => {
                    msg.metadata?.toolCalls?.forEach(call => {
                        if (call.name === 'read_file' && call.parameters?.relative_workspace_path) {
                            files.set(call.parameters.relative_workspace_path, {
                                path: call.parameters.relative_workspace_path,
                                type: 'read',
                                lineCount: call.parameters.end_line_one_indexed_inclusive - call.parameters.start_line_one_indexed + 1
                            });
                        } else if (call.name === 'edit_file' && call.parameters?.target_file) {
                            files.set(call.parameters.target_file, {
                                path: call.parameters.target_file,
                                type: 'write'
                            });
                        }
                    });
                });

                // 从文本中提取
                const fileRefs = new Set<string>();
                conv.messages.forEach(msg => {
                    const refs = msg.text.match(/`[^`]+\.[a-zA-Z0-9]+`/g) || [];
                    refs.forEach(ref => {
                        const path = ref.replace(/`/g, '').trim();
                        if (!files.has(path)) {
                            fileRefs.add(path);
                        }
                    });
                });

                fileRefs.forEach(path => {
                    if (!files.has(path)) {
                        files.set(path, {
                            path,
                            type: 'reference'
                        });
                    }
                });

                // 尝试检测文件语言
                files.forEach(file => {
                    const ext = path.extname(file.path).toLowerCase();
                    switch (ext) {
                        case '.ts':
                        case '.tsx':
                            file.language = 'typescript';
                            break;
                        case '.js':
                        case '.jsx':
                            file.language = 'javascript';
                            break;
                        case '.py':
                            file.language = 'python';
                            break;
                        case '.java':
                            file.language = 'java';
                            break;
                        case '.c':
                            file.language = 'c';
                            break;
                        case '.cpp':
                        case '.cc':
                            file.language = 'cpp';
                            break;
                        case '.cs':
                            file.language = 'csharp';
                            break;
                        case '.go':
                            file.language = 'go';
                            break;
                        case '.rs':
                            file.language = 'rust';
                            break;
                        case '.rb':
                            file.language = 'ruby';
                            break;
                        case '.php':
                            file.language = 'php';
                            break;
                        case '.swift':
                            file.language = 'swift';
                            break;
                        case '.kt':
                            file.language = 'kotlin';
                            break;
                        case '.scala':
                            file.language = 'scala';
                            break;
                        case '.m':
                            file.language = 'objective-c';
                            break;
                        case '.sql':
                            file.language = 'sql';
                            break;
                        case '.html':
                            file.language = 'html';
                            break;
                        case '.css':
                            file.language = 'css';
                            break;
                        case '.scss':
                            file.language = 'scss';
                            break;
                        case '.less':
                            file.language = 'less';
                            break;
                        case '.json':
                            file.language = 'json';
                            break;
                        case '.xml':
                            file.language = 'xml';
                            break;
                        case '.yaml':
                        case '.yml':
                            file.language = 'yaml';
                            break;
                        case '.md':
                            file.language = 'markdown';
                            break;
                        case '.sh':
                            file.language = 'shell';
                            break;
                        case '.bat':
                            file.language = 'batch';
                            break;
                        case '.ps1':
                            file.language = 'powershell';
                            break;
                        case '.dockerfile':
                            file.language = 'dockerfile';
                            break;
                        case '.r':
                            file.language = 'r';
                            break;
                        case '.dart':
                            file.language = 'dart';
                            break;
                    }
                });

                conv.metadata.files = Array.from(files.values());
            } catch (err) {
                console.error(`补充对话信息失败 (${conv.id}):`, err instanceof Error ? err.message : String(err));
            }
        });

        return conversations;
    } catch (err) {
        console.error('解析对话数据失败:', err instanceof Error ? err.message : String(err));
        return [];
    }
}

function exportToMarkdown(conversation: ParsedConversation): string {
    let markdown = '';

    // 添加标题
    markdown += `# ${conversation.metadata.name || '未命名对话'}\n\n`;

    // 添加会话信息
    markdown += '## 会话信息\n\n';
    markdown += `- **ID:** \`${conversation.id}\`\n`;
    markdown += `- **模式:** ${conversation.metadata.mode === 'agent' ? '🤖 Agent模式' : '👥 普通模式'}\n`;
    markdown += `- **状态:** ${conversation.metadata.status.isComplete ? '✅ 已完成' : '❌ 未完成'}\n`;
    markdown += `- **创建时间:** ${formatDate(conversation.metadata.createdAt)}\n`;
    markdown += `- **最后更新:** ${formatDate(conversation.metadata.lastUpdatedAt)}\n\n`;

    // 如果有文件操作，添加文件操作部分
    if (conversation.metadata.files && conversation.metadata.files.length > 0) {
        markdown += '## 文件操作\n\n';
        markdown += '### 🔗 引用的文件\n\n';
        conversation.metadata.files.forEach(file => {
            const lang = file.language ? ` (${file.language})` : '';
            markdown += `- \`${file.path}\`${lang}\n`;
        });
        markdown += '\n';
    }

    // 添加标签
    markdown += '## 🏷️ 标签\n\n';
    const tags = new Set<string>();
    tags.add('other'); // 默认标签

    // 添加语言标签
    conversation.messages.forEach(msg => {
        const codeBlocks = msg.text.match(/```(\w+)/g);
        if (codeBlocks) {
            codeBlocks.forEach(block => {
                const lang = block.replace('```', '').trim();
                if (lang && lang !== 'thinking') {
                    tags.add(`lang:${lang}`);
                }
            });
        }
    });

    // 添加特殊标签
    if (conversation.messages.some(msg => msg.text.includes('```thinking'))) {
        tags.add('has-thinking');
    }
    if (conversation.messages.some(msg => msg.text.match(/```\w+/))) {
        tags.add('has-code');
    }
    if (conversation.metadata.files && conversation.metadata.files.length > 0) {
        tags.add('has-files');
    }

    markdown += Array.from(tags).map(tag => `\`${tag}\``).join(' ') + ' \n\n';

    // 添加统计信息
    markdown += '<details><summary>📊 统计信息</summary>\n\n';
    
    // 基本统计
    markdown += '### 基本统计\n\n';
    markdown += `- 消息总数: ${conversation.metadata.statistics.messageCount}\n`;
    markdown += `  - 用户消息: ${conversation.metadata.statistics.userMessageCount}\n`;
    markdown += `  - 助手消息: ${conversation.metadata.statistics.assistantMessageCount}\n`;
    markdown += `- 平均响应时间: ${(conversation.metadata.statistics.averageResponseTime / 1000).toFixed(2)}秒\n\n`;

    // 代码统计
    if (conversation.metadata.statistics.codeBlockCount > 0) {
        markdown += '### 代码统计\n\n';
        markdown += `- 代码块总数: ${conversation.metadata.statistics.codeBlockCount}\n`;
        
        // 统计语言分布
        markdown += '- 语言分布:\n';
        Object.entries(conversation.metadata.statistics.codeLanguages).forEach(([lang, count]) => {
            markdown += `  - ${lang}: ${count}\n`;
        });
        markdown += '\n';
    }

    // 其他统计
    markdown += '### 其他统计\n\n';
    markdown += `- Thinking块数量: ${conversation.metadata.statistics.thinkingBlockCount}\n`;
    markdown += `- Markdown块数量: ${conversation.metadata.statistics.markdownBlockCount}\n`;
    markdown += `- 文件引用数量: ${conversation.metadata.statistics.fileReferenceCount}\n`;

    markdown += '</details>\n\n';

    // 添加上下文信息
    markdown += '<details><summary>📝 上下文信息</summary>\n\n';
    if (conversation.metadata.context) {
        if (conversation.metadata.context.workspace) {
            markdown += `### 工作区\n\n\`${conversation.metadata.context.workspace}\`\n\n`;
        }
        if (conversation.metadata.context.openFiles?.length) {
            markdown += '### 打开的文件\n\n';
            conversation.metadata.context.openFiles.forEach(file => {
                markdown += `- \`${file}\`\n`;
            });
            markdown += '\n';
        }
        if (conversation.metadata.context.cursorPosition) {
            const pos = conversation.metadata.context.cursorPosition;
            markdown += '### 光标位置\n\n';
            markdown += `\`${pos.file}:${pos.line}:${pos.column}\`\n\n`;
        }
        if (conversation.metadata.context.selectedText) {
            markdown += '### 选中的文本\n\n';
            markdown += '```\n' + conversation.metadata.context.selectedText + '\n```\n\n';
        }
        if (conversation.metadata.context.linterErrors?.length) {
            markdown += '### Linter错误\n\n';
            conversation.metadata.context.linterErrors.forEach(error => {
                markdown += `- ${error}\n`;
            });
            markdown += '\n';
        }
    }
    markdown += '</details>\n\n';

    // 添加对话内容
    markdown += '## 💬 对话内容\n\n';
    conversation.messages.forEach((msg, index) => {
        const role = msg.type === 'user' ? '👤 用户' : '🤖 助手';
        const timestamp = formatDate(msg.timestamp);
        markdown += `### ${role} (${timestamp})\n\n`;

        // 处理消息内容
        const contents = parseMessageContent(msg.text);
        contents.forEach(content => {
            switch (content.type) {
                case 'thinking':
                    markdown += '<details><summary>🤔 思考过程</summary>\n\n```thinking\n' + content.content + '\n```\n\n</details>\n\n';
                    break;
                case 'code':
                    if (content.content.trim()) {
                        const lang = content.language || 'plaintext';
                        markdown += '<details><summary>💻 代码 (' + lang + ')</summary>\n\n```' + lang + '\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
                case 'tool_call':
                    markdown += '<details><summary>🛠️ 工具调用</summary>\n\n```xml\n' + content.content + '\n```\n\n';
                    if (content.metadata?.toolParams) {
                        markdown += '**参数:**\n```json\n' + JSON.stringify(content.metadata.toolParams, null, 2) + '\n```\n';
                    }
                    markdown += '</details>\n\n';
                    break;
                case 'tool_result':
                    if (content.content.trim()) {
                        markdown += '<details><summary>📋 工具调用结果</summary>\n\n```\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
                case 'markdown':
                    if (content.content.trim()) {
                        if (content.format) {
                            content.format.forEach(fmt => {
                                switch (fmt.type) {
                                    case 'heading':
                                        markdown += '#'.repeat(fmt.level || 1) + ' ' + content.content + '\n\n';
                                        break;
                                    case 'list':
                                        markdown += '- ' + content.content + '\n';
                                        break;
                                    case 'quote':
                                        markdown += '> ' + content.content + '\n\n';
                                        break;
                                    case 'link':
                                        markdown += `[${content.content}](${fmt.url})` + '\n\n';
                                        break;
                                    case 'code_inline':
                                        markdown += '`' + content.content + '`';
                                        break;
                                    case 'table':
                                        markdown += content.content + '\n\n';
                                        break;
                                }
                            });
                        } else {
                            markdown += content.content + '\n\n';
                        }
                    }
                    break;
                default:
                    if (content.content.trim()) {
                        markdown += content.content + '\n\n';
                    }
            }
        });

        markdown += '---\n\n';
    });

    return markdown;
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
        console.warn('获取工作区名称失败:', err instanceof Error ? err.message : String(err));
    }
    
    // 如果无法获取更有意义的名称，返回工作区ID的简短版本
    return `ws-${workspaceId.substring(0, 6)}`;
}

async function exportConversations(conversations: ParsedConversation[]): Promise<void> {
    const outputDir = path.join(process.cwd(), 'test-output');
    
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 导出每个对话
    for (const conv of conversations) {
        try {
            // 生成文件名
            const date = new Date(conv.metadata.createdAt);
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD 格式
            const sanitizedName = (conv.metadata.name || 'untitled')
                .replace(/[<>:"/\\|?*]/g, '_') // 替换Windows不允许的文件名字符
                .replace(/\s+/g, '_'); // 替换空格为下划线
            
            // 获取可读的工作区名称
            const workspaceInfo = conv.metadata.workspaceId ? 
                `_${getReadableWorkspaceName(conv.metadata.workspaceId)}` : '';
            
            // 组合文件名：日期_名称_工作区名称_对话ID
            const baseFileName = `${dateStr}_${sanitizedName}${workspaceInfo}_${conv.id.substring(0, 6)}`;
            
            // 导出对话内容
            const fileName = `${outputDir}/${baseFileName}.md`;
            const markdown = exportToMarkdown(conv);
            fs.writeFileSync(fileName, markdown, 'utf8');
            console.log(`✓ 已导出对话 ${conv.metadata.name} 到 ${fileName}`);

            // 导出元数据
            const metadataFileName = `${outputDir}/${baseFileName}.json`;
            const metadata = {
                id: conv.id,
                name: conv.metadata.name,
                createdAt: conv.metadata.createdAt,
                lastUpdatedAt: conv.metadata.lastUpdatedAt,
                workspaceId: conv.metadata.workspaceId,
                workspaceName: conv.metadata.workspaceId ? getReadableWorkspaceName(conv.metadata.workspaceId) : undefined,
                intent: conv.metadata.intent,
                context: conv.metadata.context,
                status: conv.metadata.status,
                statistics: conv.metadata.statistics,
                tags: conv.metadata.tags,
                topics: conv.metadata.topics,
                relatedConversations: conv.metadata.relatedConversations,
                files: conv.metadata.files
            };
            fs.writeFileSync(metadataFileName, JSON.stringify(metadata, null, 2), 'utf8');
            console.log(`✓ 已导出元数据到 ${metadataFileName}`);
        } catch (err) {
            console.error(`导出对话 ${conv.metadata.name || conv.id} 失败:`, err instanceof Error ? err.message : String(err));
        }
    }
}

// 测试数据
const testData = {
    'composerData:test': {
        composerId: 'test-conversation',
        name: '测试对话',
        createdAt: Date.now() - 3600000, // 1小时前
        lastUpdatedAt: Date.now(),
        conversation: [
            {
                bubbleId: 'msg1',
                type: 1, // user
                text: '你好，这是一个测试消息\n```python\nprint("Hello World")\n```',
                timestamp: Date.now() - 3000000
            },
            {
                bubbleId: 'msg2',
                type: 2, // assistant
                text: '```thinking\n让我思考一下...\n这是一个测试消息\n```\n\n好，我来帮你测试。\n\n这是一个代码示例：\n```javascript\nconsole.log("Test");\n```',
                timestamp: Date.now() - 2000000,
                toolCalls: [
                    {
                        name: 'test_tool',
                        parameters: { test: 'value' },
                        status: 'success',
                        timestamp: Date.now() - 2500000
                    }
                ],
                toolResults: ['测试结果']
            }
        ]
    }
};

interface ConversationLocation {
    workspaceId: string;
    conversationId: string;
    timestamp: number;
    source: 'editor' | 'workspace' | 'recent';
}

async function findActiveConversations(db: sqlite3.Database): Promise<ConversationLocation[]> {
    return new Promise((resolve, reject) => {
        const locations: ConversationLocation[] = [];
        
        // 1. 检查编辑器状态
        const editorQuery = `
            SELECT value FROM ItemTable 
            WHERE key IN (
                'workbench.editor.languageDetectionOpenedLanguages.global',
                'memento/workbench.editors.files.textFileEditor'
            )
        `;
        
        db.all(editorQuery, [], (err, editorRows: DatabaseRow[]) => {
            if (err) {
                console.warn('查询编辑器状态失败:', err);
            } else if (editorRows) {
                editorRows.forEach(row => {
                    try {
                        const data = JSON.parse(row.value) as EditorState;
                        // 解析编辑器状态中的对话ID
                        if (data.conversations || data.recentConversations) {
                            const convs = data.conversations || data.recentConversations || [];
                            convs.forEach(conv => {
                                if (conv.id) {
                                    locations.push({
                                        workspaceId: '',
                                        conversationId: conv.id,
                                        timestamp: conv.timestamp || Date.now(),
                                        source: 'editor'
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('解析编辑器状态失败:', e);
                    }
                });
            }
            
            // 2. 检查工作区状态
            const workspaceQuery = `
                SELECT value FROM ItemTable 
                WHERE key LIKE 'workbench.panel.composer%' 
                OR key LIKE 'chat.workspace%'
            `;
            
            db.all(workspaceQuery, [], (err, workspaceRows: DatabaseRow[]) => {
                if (err) {
                    console.warn('查询工作区状态失败:', err);
                } else if (workspaceRows) {
                    workspaceRows.forEach(row => {
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
                        } catch (e) {
                            console.warn('解析工作区状态失败:', e);
                        }
                    });
                }
                
                // 3. 检查最近的对话
                const recentQuery = `
                    SELECT key, value FROM cursorDiskKV 
                    WHERE key LIKE 'composerData:%'
                    ORDER BY json_extract(value, '$.lastUpdatedAt') DESC
                    LIMIT 5
                `;
                
                db.all(recentQuery, [], (err, recentRows: DatabaseRow[]) => {
                    if (err) {
                        console.warn('查询最近对话失败:', err);
                    } else if (recentRows) {
                        recentRows.forEach(row => {
                            try {
                                const parts = row.key.split(':');
                                if (parts.length !== 2) {
                                    console.warn('无效的对话ID格式:', row.key);
                                    return;
                                }
                                const convId = parts[1];
                                const data = JSON.parse(row.value) as { lastUpdatedAt?: number; workspaceId?: string };
                                locations.push({
                                    workspaceId: data.workspaceId || '',
                                    conversationId: convId,
                                    timestamp: data.lastUpdatedAt || Date.now(),
                                    source: 'recent'
                                });
                            } catch (e) {
                                console.warn('解析最近对话失败:', e);
                            }
                        });
                    }
                    
                    // 按时间戳排序并去重
                    const uniqueLocations = Array.from(
                        new Map(
                            locations
                                .sort((a, b) => b.timestamp - a.timestamp)
                                .map(loc => [loc.conversationId, loc])
                        ).values()
                    );
                    
                    resolve(uniqueLocations);
                });
            });
        });
    });
}

// 添加新的去重函数
interface ConversationWithSource {
    data: any;
    source: string;
    dbPath: string;
}

function deduplicateConversations(conversations: { [key: string]: ConversationWithSource }): { [key: string]: any } {
    const dedupedData: { [key: string]: any } = {};
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
            console.log(`发现重复对话 ${convId}:`);
            convs.forEach(conv => {
                console.log(`  - 来源: ${conv.source}, 数据库: ${conv.dbPath}`);
                console.log(`    更新时间: ${formatDate(conv.data.lastUpdatedAt)}`);
            });

            // 按最后更新时间排序，选择最新的
            const newest = convs.reduce((prev, curr) => {
                const prevTime = prev.data.lastUpdatedAt || 0;
                const currTime = curr.data.lastUpdatedAt || 0;
                return currTime > prevTime ? curr : prev;
            });

            console.log(`  选择来源 ${newest.source} 的版本（${formatDate(newest.data.lastUpdatedAt)}）`);
            dedupedData[`composerData:${convId}`] = newest.data;
        }
    });

    return dedupedData;
}

// 修改 main 函数中的相关部分
async function main(useTestData: boolean = false) {
    let currentDb: sqlite3.Database | undefined;
    
    try {
        let data: any;

        if (useTestData) {
            console.log('\n=== 开始解析测试数据 ===\n');
            data = testData;
        } else {
            console.log('\n=== 开始解析数据库数据 ===\n');
            
            // 1. 查找所有数据库文件
            console.log('1. 查找数据库文件...');
            const dbFiles = await findVSCDBFiles();
            if (dbFiles.length === 0) {
                throw new Error('未找到数据库文件');
            }
            console.log(`✓ 找到 ${dbFiles.length} 个数据库文件:`);
            dbFiles.forEach(file => console.log(`  - ${file}`));

            // 2. 遍历所有数据库
            const allConversations: { [key: string]: ConversationWithSource } = {};
            const activeLocations: ConversationLocation[] = [];

            for (const dbPath of dbFiles) {
                console.log(`\n正在处理数据库: ${dbPath}`);
                
                try {
                    // 打开数据库
                    const db = new sqlite3.Database(dbPath);
                    currentDb = db;
                    
                    // 查找活动对话
                    const locations = await findActiveConversations(db);
                    activeLocations.push(...locations);
                    
                    if (locations.length > 0) {
                        console.log('✓ 找到活动对话:');
                        locations.forEach(loc => {
                            const timestamp = formatDate(loc.timestamp);
                            console.log(`  - [${loc.source}] ${loc.conversationId} (${timestamp}`);
                        });
                    }

                    // 读取对话数据
                    const dbData = await new Promise<{ [key: string]: ConversationWithSource }>((resolve, reject) => {
                        const query = 'SELECT key, value FROM cursorDiskKV WHERE key LIKE "composerData:%"';
                        console.log('执行查询:', query);
                        
                        db.all(query, [], (err, rows: DatabaseRow[]) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            console.log(`找到 ${rows.length} 条记录`);
                            const data: { [key: string]: ConversationWithSource } = {};
                            rows.forEach(row => {
                                try {
                                    const convId = row.key.split(':')[1];
                                    const convData = JSON.parse(row.value);
                                    console.log(`处理对话 ${convId}:`, {
                                        createdAt: convData.createdAt ? formatDate(convData.createdAt) : 'unknown',
                                        lastUpdatedAt: convData.lastUpdatedAt ? formatDate(convData.lastUpdatedAt) : 'unknown'
                                    });
                                    
                                    // 存储对话来源信息
                                    data[row.key] = {
                                        data: convData,
                                        source: path.basename(path.dirname(dbPath)),
                                        dbPath
                                    };

                                    // 标记活动对话
                                    if (activeLocations.some(loc => loc.conversationId === convId)) {
                                        data[row.key].data.isActive = true;
                                    }
                                } catch (err) {
                                    console.warn(`警告: 解析数据失败 (${row.key}):`, err instanceof Error ? err.message : String(err));
                                }
                            });
                            resolve(data);
                        });
                    });

                    // 合并数据
                    Object.assign(allConversations, dbData);

                    // 关闭数据库连接
                    await new Promise<void>((resolve, reject) => {
                        db.close(err => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    currentDb = undefined;
                } catch (err) {
                    console.warn(`警告: 处理数据库失败 (${dbPath}):`, err instanceof Error ? err.message : String(err));
                    if (currentDb) {
                        currentDb.close();
                        currentDb = undefined;
                    }
                    continue;
                }
            }

            const totalKeys = Object.keys(allConversations).length;
            if (totalKeys === 0) {
                throw new Error('未找到任何对话数据');
            }

            // 去重处理
            console.log('\n2. 对话去重...');
            data = deduplicateConversations(allConversations);
            const dedupedCount = Object.keys(data).length;
            console.log(`✓ 原始对话数: ${totalKeys}`);
            console.log(`✓ 去重后对话数: ${dedupedCount}`);
            if (totalKeys > dedupedCount) {
                console.log(`✓ 移除了 ${totalKeys - dedupedCount} 个重复对话`);
            }
        }

        // 3. 解析对话数据
        console.log('\n3. 解析对话数据...');
        const conversations = parseConversation(data);
        console.log(`✓ 成功解析 ${conversations.length} 个对话`);

        // 显示对话时间范围
        if (conversations.length > 0) {
            const timestamps = conversations.map(conv => conv.metadata.createdAt);
            const minDate = formatDate(Math.min(...timestamps));
            const maxDate = formatDate(Math.max(...timestamps));
            console.log(`对话时间范围: ${minDate} 至 ${maxDate}`);
        }

        // 4. 导出对话
        await exportConversations(conversations);
        console.log('\n=== 处理完成 ===\n');

        return conversations;
    } catch (err) {
        console.error('处理失败:', err instanceof Error ? err.message : String(err));
        throw err;
    } finally {
        if (currentDb) {
            currentDb.close();
        }
    }
}

// 运行测试模式
if (process.argv.includes('--test')) {
    main(true);
} else {
    main(false);
}

// 添加格式化日期的函数
function formatDate(dateStr: string | number): string {
    if (!dateStr) return 'Invalid Date';
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return 'Invalid Date';
    }
}
