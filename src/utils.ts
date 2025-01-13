/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import prettier from 'prettier';
import { format as sqlFormat } from 'sql-formatter';
import { exec } from 'child_process';
import { promisify } from 'util';
import { t } from './i18n';

const execAsync = promisify(exec);

// 日志级别
type LogLevel = 'info' | 'warn' | 'error';

// 输出日志
export function log(message: string, level: LogLevel = 'info'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// 显示状态
export async function showStatus<T>(
    callback: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '导出对话',
        cancellable: false
    }, callback);
}

// 获取默认输出路径
export async function getDefaultOutputPath(): Promise<string> {
    const timestamp = new Date().toLocaleString().replace(/[/: ,]/g, '-');
    
    // 检查是否在测试环境
    const isTest = process.env.NODE_ENV === 'test';
    let outputPath: string;
    
    if (isTest) {
        // 测试环境：使用项目目录下的 test-output
        const projectRoot = process.cwd();
        outputPath = path.join(projectRoot, 'test-output', `cursor-conversation-${timestamp}.md`);
        // 确保测试输出目录存在
        const testOutputDir = path.join(projectRoot, 'test-output');
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
    } else {
        // 生产环境：优先使用工作区目录
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            outputPath = path.join(workspaceFolder.uri.fsPath, 'cursor-export', `cursor-conversation-${timestamp}.md`);
        } else {
            // 如果没有工作区，使用系统临时目录
            outputPath = path.join(os.tmpdir(), 'cursor-export', `cursor-conversation-${timestamp}.md`);
        }
        
        // 确保导出目录存在
        const exportDir = path.dirname(outputPath);
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
    }
    
    log(`默认导出路径: ${outputPath}`, 'info');
    return outputPath;
}

// 本地化消息
export const messages = {
    exportButton: "导出对话记录",
    exportSuccess: "对话记录已成功导出！",
    exportFailed: "导出失败：",
    noConversation: "没有找到活动的对话内容，请确保您正在查看一个对话",
    processing: "正在处理对话数据...",
    converting: "正在转换为Markdown格式...",
    saving: "正在保存文件...",
    noWorkspace: "未找到工作目录，请确保Cursor正确安装",
    cursorStorageNotFound: "找不到Cursor存储目录，请确保Cursor正确安装",
    workspaceNotFound: "找不到当前工作区，请尝试重启Cursor",
    historyNotFound: "未找到对话历史记录，请确保您正在查看一个对话",
    saveSuccess: "已成功导出到：",
    unsupportedOS: "不支持的操作系统，请检查系统兼容性",
    selectMetadata: "是否在导出文件中包含元数据？",
    selectOutputPath: "选择输出路径",
    selectSaveLocation: "选择导出文件保存位置",
    configureExport: "正在准备导出...",
    noActiveConversation: "没有活动的对话，请打开一个对话后再试",
    invalidConversation: "对话数据无效，请确保对话内容完整",
    accessDenied: "无法访问存储目录，请检查权限设置",
    databaseError: "数据库访问错误，请尝试重启Cursor",
    parseError: "解析对话数据失败，请确保对话格式正确",
    writeError: "写入文件失败，请检查文件权限和磁盘空间",
    exportStarted: "开始导出对话...",
    exportCompleted: "导出完成！",
    openFile: "打开文件",
    openFolder: "打开文件夹",
    invalidPath: "无效的文件路径，请选择有效的保存位置",
    overwritePrompt: "文件已存在，是否覆盖？",
    yes: "是",
    no: "否",
    cancel: "取消",
    retry: "重试",
    ignore: "忽略",
    operationInProgress: "操作正在进行中，请稍候...",
    exportCancelled: "导出已取消",
    exportPartialSuccess: "部分对话导出成功",
    failedConversations: "导出失败的对话"
};

// 转义 Markdown 特殊字符
export function escapeMarkdown(text: string): string {
    return text.replace(/([#*`\[\]()\\])/g, '\\$1');
}

export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) {
        return t('justNow');
    }

    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return t('minutesAgo', minutes);
    }

    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return t('hoursAgo', hours);
    }

    if (diff < 2592000000) {
        const days = Math.floor(diff / 86400000);
        return t('daysAgo', days);
    }

    return date.toLocaleString();
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// 格式化持续时间
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}毫秒`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}秒`;
    }
    if (ms < 3600000) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}分${seconds}秒`;
    }
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}小时${minutes}分`;
}

// 检查文件是否存在
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}

// 确保目录存在
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
    } catch (error) {
        // 如果目录已存在，忽略错误
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileExists')) {
            throw error;
        }
    }
}

// 生成唯一ID
export function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 计算相似度
export function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
        return 1.0;
    }
    
    const costs = new Array<number>();
    for (let i = 0; i <= shorter.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= longer.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (shorter[i - 1] !== longer[j - 1]) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) {
            costs[costs.length - 1] = lastValue;
        }
    }
    
    return (longer.length - costs[costs.length - 1]) / longer.length;
}

// 提取关键词
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
    // 移除常见的停用词
    const stopWords = new Set<string>([
        // 英文常用停用词
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
        'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
        'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
        'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
        'so', 'up', 'out', 'if', 'who', 'get', 'which', 'go', 'me', 'about', 'only',
        'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
        'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
        'than', 'then', 'now', 'look', 'come', 'its', 'over', 'think', 'thinking', 'also',
        'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
        'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',

        // 英文代码相关停用词
        'function', 'class', 'method', 'variable', 'const', 'let', 'var', 'return', 'true', 'false',
        'null', 'undefined', 'import', 'export', 'default', 'module', 'require', 'async', 'await', 'try',
        'catch', 'throw', 'error', 'new', 'this', 'super', 'extends', 'implements', 'interface', 'type',
        'public', 'private', 'protected', 'static', 'final', 'void', 'break', 'continue', 'package',

        // 中文常用停用词
        '的', '了', '是', '在', '和', '有', '我', '你', '他', '她',
        '它', '这', '那', '都', '也', '就', '要', '会', '到', '说',
        '能', '与', '及', '等', '并', '或', '但', '而', '为', '以',
        '对', '从', '向', '于', '之', '使', '让', '得', '着', '过',
        '吧', '呢', '啊', '呀', '吗', '么', '哦', '啦', '呵', '嘛',
        '将', '把', '被', '给', '由', '因', '为了', '所以', '因此', '如果',
        '虽然', '但是', '然后', '接着', '另外', '此外', '不过', '只是', '还是', '一样',
        '一直', '一定', '一般', '一些', '一下', '一点', '很多', '这样', '那样', '如此',

        // 中文代码相关停用词
        '函数', '类', '方法', '变量', '常量', '返回', '导入', '导出', '模块', '包',
        '接口', '实现', '继承', '静态', '公共', '私有', '保护', '最终', '空', '未定义',
        '异步', '等待', '抛出', '捕获', '错误', '新建', '调用', '执行', '运行', '编译',

        // 系统路径和错误相关停用词
        'enoent', 'such', 'file', 'directory', 'open', 'users', 'appdata',
        'local', 'programs', 'roaming', 'desktop', 'documents', 'downloads',
        'temp', 'tmp', 'system32', 'windows', 'program', 'files', 'home',
        'root', 'usr', 'bin', 'etc', 'var', 'lib', 'opt', 'mnt', 'media',
        'path', 'dir', 'folder', 'filename', 'pathname', 'dirname', 'basename',
        'extname', 'separator', 'delimiter', 'resolve', 'join', 'normalize',
        '%username%', '%userprofile%', '%appdata%', '%localappdata%', '%temp%',
        '%systemroot%', '%programfiles%', '%programfiles(x86)%', '%commonprogramfiles%',
        '%commonprogramfiles(x86)%', '%public%', '%allusersprofile%',
        'cursor', 'tools', 'edit_files', 'read_files', 'list_dir',
        'cursor_export', 'cursor_export_extension', 'cursor_export_extension_0_0_1',
        'codebase_search', 'grep_search', 'file_search', 'run_terminal_command', 'delete_file',
        'edit_file', 'read_file', 'list_dir', 'snake_case', 'relative_workspace_path',
        'assistant_snippet', 'tool_call', 'function_calls', 'function_results',
        'explanation', 'query', 'target_directories', 'blocking', 'code_edit', 'instructions',
        'target_file', 'should_read_entire_file', 'start_line_one_indexed', 'end_line_one_indexed_inclusive',
        'case_sensitive', 'exclude_pattern', 'include_pattern', 'command', 'requireUserApproval',
        'workspace', 'desktop', 'cursor', 'export', 'extension', 'tools', 'edit', 'read', 'list',
        'search', 'grep', 'file', 'run', 'terminal', 'command', 'delete', 'snippet', 'call',
        'function', 'result', 'target', 'directory', 'block', 'code', 'instruction', 'line',
        'pattern', 'require', 'approval', 'user', 'assistant', 'human', 'system', 'error',
        'warning', 'info', 'debug', 'trace', 'log', 'message', 'status', 'progress',
        'success', 'failure', 'complete', 'start', 'end', 'begin', 'finish',

        // 中英混合常见停用词
        'ok', 'OK', 'yes', 'no', 'Yes', 'No', '好的', '可以', '行', '不行',
        'bug', 'Bug', 'BUG', 'fix', 'Fix', 'FIX', '修复', '解决', '问题', '完成',
        'todo', 'TODO', 'done', 'DONE', '待办', '已完成', '进行中', '暂停', '开始', '结束',

        // 标点符号和特殊字符
        '.', ',', '!', '?', ';', ':', '"', "'", '`', '-',
        '_', '=', '+', '*', '/', '\\', '|', '@', '#', '$',
        '%', '^', '&', '(', ')', '[', ']', '{', '}', '<',
        '>', '~', '，', '。', '！', '？', '；', '：', '"', '"',
        "'", "'", '【', '】', '《', '》', '（', '）', '、', '…',

        // 常见语气词和连接词
        'um', 'uh', 'eh', 'ah', 'oh', 'hmm', 'huh', 'well', 'like', 'so',
        'anyway', 'actually', 'basically', 'literally', 'seriously', 'honestly', 'really',
        '嗯', '啊', '哦', '呃', '额', '那个', '这个', '所以', '然后', '就是',
        '其实', '基本上', '说实话', '老实说', '真的', '确实', '当然', '可能', '大概', '应该',

        // 时间相关词汇
        'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'time', 'date',
        '年', '月', '周', '日', '时', '分', '秒', '时间', '日期', '今天',
        '明天', '昨天', '前天', '后天', '早上', '中午', '下午', '晚上', '凌晨', '半夜',

        // 数量词和单位
        'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
        '个', '只', '条', '张', '份', '本', '册', '次', '遍', '回',
        'kb', 'mb', 'gb', 'tb', 'byte', 'bytes', 'bit', 'bits',
        '字节', '位', '比特', '千字节', '兆字节', '吉字节', '太字节',

        // AI对话相关停用词
        'ai', 'AI', 'assistant', 'Assistant', 'human', 'Human', 'user', 'User',
        '助手', '用户', '对话', '聊天', '问答', '回答', '提问', '询问',
        'hello', 'hi', 'hey', 'bye', 'goodbye', 'thanks', 'thank', 'please',
        '你好', '再见', '谢谢', '请', '麻烦', '帮忙',

        // 情感和态度词
        'happy', 'sad', 'angry', 'excited', 'worried', 'confused', 'sure', 'maybe',
        '高兴', '难过', '生气', '兴奋', '担心', '困惑', '确定', '可能',
        'good', 'bad', 'great', 'terrible', 'awesome', 'horrible',
        '好', '坏', '棒', '糟糕', '优秀', '差劲',

        // 指代词和修饰词
        'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when',
        '这个', '那个', '这些', '那些', '这里', '那里', '哪里', '什么时候',
        'very', 'much', 'many', 'few', 'little', 'more', 'less',
        '很', '非常', '多', '少', '更多', '更少'
    ]);

    // 分词并统计频率
    const words = text.toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')  // 保留英文、数字、中文字符
        .split(/\s+/)
        .filter((word: string): boolean => 
            word.length > 1 && 
            !stopWords.has(word) &&
            !/^\d+$/.test(word) &&  // 过滤纯数字
            !/^[a-z0-9]+$/i.test(word)  // 过滤纯字母数字组合（可能是变量名或ID）
        );

    // 计算词频和位置权重
    const frequency: Record<string, number> = {};
    const positions: Record<string, number[]> = {};
    words.forEach((word: string, index: number): void => {
        frequency[word] = (frequency[word] || 0) + 1;
        if (!positions[word]) {
            positions[word] = [];
        }
        positions[word].push(index);
    });

    // 计算TF-IDF分数
    const totalWords = words.length;
    const scores: Record<string, number> = {};
    Object.entries(frequency).forEach(([word, freq]) => {
        // TF: 词频/总词数
        const tf = freq / totalWords;
        
        // IDF计算
        let idf: number;
        
        // 1. 尝试从预定义语料库获取IDF值
        const corpusIdf = getCorpusIDF(word);
        if (corpusIdf !== undefined) {
            // 使用语料库IDF
            idf = corpusIdf;
        } else {
            // 2. 回退到基于位置分布的IDF估算
            const spread = positions[word].length > 1 ? 
                (Math.max(...positions[word]) - Math.min(...positions[word])) / totalWords : 0;
            
            // 3. 考虑词的长度 - 较长的词通常更有意义
            const lengthBoost = Math.log(word.length) / Math.log(10); // log10(length)
            
            // 4. 考虑词的复杂度 - 包含多种字符类型的词可能更重要
            const complexity = calculateWordComplexity(word);
            
            // 组合这些因素
            idf = (1 + spread) * (1 + lengthBoost * 0.5) * (1 + complexity * 0.3);
        }

        // 位置加权：标题、开头、结尾的词更重要
        const positionBoost = calculatePositionBoost(positions[word], totalWords);
        
        // 域特定加权：某些领域的词可能更重要
        const domainBoost = getDomainBoost(word);
        
        // 最终分数
        scores[word] = tf * idf * positionBoost * domainBoost;
    });

    // 检测关键短语
    const phrases = detectKeyPhrases(words);
    phrases.forEach(phrase => {
        if (phrase.includes(' ') && !stopWords.has(phrase)) {
            scores[phrase] = (scores[phrase] || 0) + 0.5; // 短语加权
        }
    });

    // 按分数排序并返回前N个关键词
    return Object.entries(scores)
        .sort(([, a], [, b]): number => b - a)
        .slice(0, maxKeywords)
        .map(([word]): string => word);
}

// 检测关键短语
function detectKeyPhrases(words: string[]): string[] {
    const phrases: string[] = [];
    const minPhraseLen = 2;
    const maxPhraseLen = 4;

    // 滑动窗口检测短语
    for (let len = minPhraseLen; len <= maxPhraseLen; len++) {
        for (let i = 0; i <= words.length - len; i++) {
            const phrase = words.slice(i, i + len).join(' ');
            phrases.push(phrase);
        }
    }

    return phrases;
}

// 检测语言
export function detectLanguage(text: string): string {
    // 简单的语言检测规则
    const patterns = {
        chinese: /[\u4e00-\u9fa5]/,
        japanese: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/,
        korean: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]/,
        english: /^[a-zA-Z\s\p{P}]*$/u
    };

    const charCount = text.length;
    const counts = {
        chinese: (text.match(/[\u4e00-\u9fa5]/g) || []).length,
        japanese: (text.match(/[\u3040-\u30ff]/g) || []).length,
        korean: (text.match(/[\uac00-\ud7af]/g) || []).length,
        english: (text.match(/[a-zA-Z]/g) || []).length
    };

    const ratios = {
        chinese: counts.chinese / charCount,
        japanese: counts.japanese / charCount,
        korean: counts.korean / charCount,
        english: counts.english / charCount
    };

    const maxRatio = Math.max(...Object.values(ratios));
    const language = Object.entries(ratios).find(([, ratio]) => ratio === maxRatio)?.[0] || 'unknown';

    return language;
}

// 格式化代码
export async function formatCode(code: string, language: string): Promise<string> {
    try {
        // 标准化语言名称
        const normalizedLang = normalizeLanguage(language.toLowerCase());
        
        // 如果代码为空，直接返回
        if (!code.trim()) {
            return code;
        }

        // 根据语言选择合适的格式化方法
        switch (normalizedLang) {
            case 'javascript':
            case 'typescript':
            case 'jsx':
            case 'tsx':
                return await formatJavaScript(code);
                
            case 'html':
            case 'xml':
            case 'svg':
                return await formatHTML(code);
                
            case 'css':
            case 'scss':
            case 'less':
                return await formatCSS(code);
                
            case 'json':
            case 'jsonc':
                return formatJSON(code);
                
            case 'python':
                return await formatPython(code);
                
            case 'sql':
                return formatSQL(code);
                
            default:
                // 对于不支持的语言，保持原格式但规范化空白字符
                return normalizeWhitespace(code);
        }
    } catch (error) {
        // 如果格式化失败，记录错误并返回原始代码
        console.warn(`格式化代码失败: ${error instanceof Error ? error.message : String(error)}`);
        return code;
    }
}

// 标准化语言名称
function normalizeLanguage(lang: string): string {
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
        'yml': 'yaml',
        'dockerfile': 'docker'
    };
    
    return languageMap[lang] || lang;
}

// 格式化 JavaScript/TypeScript 代码
async function formatJavaScript(code: string): Promise<string> {
    try {
        return await prettier.format(code, {
            parser: 'babel-ts',
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: true,
            trailingComma: 'es5',
            bracketSpacing: true,
            arrowParens: 'avoid'
        });
    } catch (error) {
        console.warn(`JavaScript格式化失败: ${error instanceof Error ? error.message : String(error)}`);
        return normalizeWhitespace(code);
    }
}

// 格式化 HTML/XML 代码
async function formatHTML(code: string): Promise<string> {
    try {
        return await prettier.format(code, {
            parser: 'html',
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            singleQuote: true,
            bracketSameLine: false,
            htmlWhitespaceSensitivity: 'css'
        });
    } catch (error) {
        console.warn(`HTML格式化失败: ${error instanceof Error ? error.message : String(error)}`);
        return normalizeWhitespace(code);
    }
}

// 格式化 CSS 代码
async function formatCSS(code: string): Promise<string> {
    try {
        return await prettier.format(code, {
            parser: 'css',
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            singleQuote: true
        });
    } catch (error) {
        console.warn(`CSS格式化失败: ${error instanceof Error ? error.message : String(error)}`);
        return normalizeWhitespace(code);
    }
}

// 格式化 JSON 代码
function formatJSON(code: string): string {
    try {
        // 尝试解析和格式化 JSON
        return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
        // 如果解析失败，返回原始代码
        return code;
    }
}

// 格式化 Python 代码
async function formatPython(code: string): Promise<string> {
    try {
        // 创建临时文件
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `tmp_${Date.now()}.py`);
        
        try {
            // 写入代码到临时文件
            await fs.promises.writeFile(tmpFile, code, 'utf8');
            
            // 尝试使用 black，如果失败则尝试 autopep8
            try {
                await execAsync(`black --quiet "${tmpFile}"`);
            } catch {
                try {
                    await execAsync(`autopep8 --in-place "${tmpFile}"`);
                } catch {
                    throw new Error('未找到可用的Python格式化工具');
                }
            }
            
            // 读取格式化后的代码
            const formattedCode = await fs.promises.readFile(tmpFile, 'utf8');
            return formattedCode;
        } finally {
            // 清理临时文件
            try {
                await fs.promises.unlink(tmpFile);
            } catch {
                // 忽略删除临时文件的错误
            }
        }
    } catch (error) {
        console.warn(`Python格式化失败: ${error instanceof Error ? error.message : String(error)}`);
        return normalizeWhitespace(code);
    }
}

// 格式化 SQL 代码
function formatSQL(code: string): string {
    try {
        return sqlFormat(code, {
            language: 'sql',
            tabWidth: 2,
            keywordCase: 'upper',
            linesBetweenQueries: 2,
            indentStyle: 'standard'
        });
    } catch (error) {
        console.warn(`SQL格式化失败: ${error instanceof Error ? error.message : String(error)}`);
        return normalizeWhitespace(code);
    }
}

// 规范化空白字符
function normalizeWhitespace(code: string): string {
    return code
        // 统一换行符
        .replace(/\r\n?/g, '\n')
        // 删除行尾空白字符
        .replace(/[ \t]+$/gm, '')
        // 确保文件以单个换行符结束
        .replace(/\n*$/, '\n');
}

// 生成目录
export function generateTOC(markdown: string): string {
    const headings = markdown.match(/^#{1,6}\s+.+$/gm) || [];
    if (headings.length === 0) {
        return '';
    }

    let toc = '## 目录\n\n';
    headings.forEach(heading => {
        const level = heading.match(/^(#+)/)?.[1].length || 1;
        const title = heading.replace(/^#+\s+/, '');
        const indent = '  '.repeat(level - 1);
        const anchor = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        toc += `${indent}- [${title}](#${anchor})\n`;
    });

    return toc + '\n';
}

// 从预定义语料库获取IDF值
function getCorpusIDF(word: string): number | undefined {
    // 常用词IDF值缓存
    const commonWordsIDF: Record<string, number> = {
        // 软件架构相关
        'arch_pattern': 1.6, 'arch_framework': 1.5, 'arch_design': 1.4,
        'arch_structure': 1.4, 'arch_layer': 1.4, 'arch_service': 1.3, 'arch_component': 1.4,
        '系统架构': 1.6, '技术框架': 1.5, '架构设计': 1.4,
        '系统结构': 1.4, '系统层级': 1.4, '微服务': 1.3, '系统组件': 1.4,

        // 开发工作流
        'dev_workflow': 1.5, 'dev_pipeline': 1.5, 'dev_deployment': 1.5,
        'dev_build': 1.3, 'dev_release': 1.4, 'dev_version': 1.3, 'dev_update': 1.3,
        '开发流程': 1.5, '流水线': 1.5, '系统部署': 1.5,
        '项目构建': 1.3, '版本发布': 1.4, '版本管理': 1.3, '系统更新': 1.3,

        // 编程概念
        'prog_algorithm': 1.6, 'prog_datastructure': 1.6, 'prog_object': 1.4,
        'prog_class': 1.4, 'prog_interface': 1.4, 'prog_inheritance': 1.5,
        'prog_polymorphism': 1.6,
        '算法实现': 1.6, '数据结构': 1.6, '对象设计': 1.4,
        '类定义': 1.4, '接口设计': 1.4, '继承关系': 1.5,
        '多态性': 1.6,

        // 错误处理
        'err_exception': 1.5, 'err_debug': 1.4, 'err_logging': 1.4,
        'err_trace': 1.4, 'err_crash': 1.5, 'err_failure': 1.5, 'err_recovery': 1.5,
        '异常处理': 1.5, '程序调试': 1.4, '日志记录': 1.4,
        '错误追踪': 1.4, '系统崩溃': 1.5, '故障恢复': 1.5,

        // UI/UX相关
        'ui_interface': 1.4, 'ui_usability': 1.5, 'ui_accessibility': 1.5,
        'ui_responsive': 1.5, 'ui_layout': 1.4, 'ui_interaction': 1.5,
        '用户界面': 1.4, '可用性': 1.5, '无障碍': 1.5,
        '响应式': 1.5, '布局': 1.4, '交互': 1.5,

        // 测试相关
        'test_unit': 1.5, 'test_integration': 1.5, 'test_coverage': 1.5,
        'test_assertion': 1.5, 'test_mock': 1.5, 'test_benchmark': 1.5,
        '单元测试': 1.5, '集成测试': 1.5, '测试覆盖': 1.5,
        '测试断言': 1.5, '模拟测试': 1.5, '性能测试': 1.5,

        // 版本控制
        'git_commit': 1.4, 'git_branch': 1.4, 'git_merge': 1.4,
        'git_conflict': 1.5, 'git_repository': 1.4,
        '代码提交': 1.4, '分支管理': 1.4, '代码合并': 1.4,
        '冲突解决': 1.5, '代码仓库': 1.4,

        // 云计算/DevOps
        'cloud_container': 1.5, 'cloud_kubernetes': 1.6, 'cloud_scaling': 1.5,
        'cloud_monitoring': 1.5, 'cloud_metrics': 1.5, 'cloud_alert': 1.5,
        'cloud_deployment': 1.5,
        '容器技术': 1.5, '容器编排': 1.6, '弹性伸缩': 1.5,
        '系统监控': 1.5, '监控指标': 1.5, '告警管理': 1.5,
        '云部署': 1.5,

        // AI/ML相关
        'ml_model': 1.5, 'ml_training': 1.5, 'ml_inference': 1.6,
        'ml_dataset': 1.5, 'ml_neural': 1.6, 'ml_accuracy': 1.5,
        '模型训练': 1.5, '模型推理': 1.6, '数据集': 1.5,
        '神经网络': 1.6, '模型精度': 1.5,

        // 安全相关
        'sec_authentication': 1.6, 'sec_authorization': 1.6, 'sec_encryption': 1.6,
        'sec_vulnerability': 1.6, 'sec_threat': 1.6, 'sec_risk': 1.5,
        '身份认证': 1.6, '访问授权': 1.6, '数据加密': 1.6,
        '安全漏洞': 1.6, '安全威胁': 1.6, '风险控制': 1.5,

        // 性能相关
        'perf_optimization': 1.5, 'perf_latency': 1.5, 'perf_throughput': 1.5,
        'perf_bottleneck': 1.5, 'perf_profiling': 1.5,
        '性能优化': 1.5, '响应延迟': 1.5, '系统吞吐': 1.5,
        '性能瓶颈': 1.5, '性能分析': 1.5,

        // 数据库相关
        'db_query': 1.4, 'db_index': 1.4, 'db_transaction': 1.5,
        'db_schema': 1.5, 'db_migration': 1.5, 'db_backup': 1.4,
        '数据查询': 1.4, '索引优化': 1.4, '事务处理': 1.5,
        '数据库设计': 1.5, '数据迁移': 1.5, '数据备份': 1.4,

        // API相关
        'api_endpoint': 1.4, 'api_request': 1.3, 'api_response': 1.3,
        'api_rest': 1.4, 'api_graphql': 1.5, 'api_webhook': 1.5,
        'api_interface': 1.4,
        'API端点': 1.4, 'API请求': 1.3, 'API响应': 1.3,
        'REST_API': 1.4, 'GraphQL_API': 1.5, 'Webhook_API': 1.5,
        'API接口': 1.4,

        // 项目管理
        'pm_milestone': 1.4, 'pm_deadline': 1.4, 'pm_priority': 1.4,
        'pm_requirement': 1.4, 'pm_scope': 1.4, 'pm_agile': 1.4,
        '里程碑': 1.4, '截止日期': 1.4, '优先级': 1.4,
        '需求管理': 1.4, '项目范围': 1.4, '敏捷开发': 1.4,

        // 代码质量
        'code_quality': 1.5, 'code_refactor': 1.5, 'code_review': 1.4,
        'code_standard': 1.4, 'code_convention': 1.4, 'code_documentation': 1.4,
        '代码质量': 1.5, '代码重构': 1.5, '代码评审': 1.4,
        '编码规范': 1.4, '文档规范': 1.4
    };
    
    return commonWordsIDF[word.toLowerCase()];
}

// 计算词的复杂度
function calculateWordComplexity(word: string): number {
    let complexity = 0;
    
    // 检查是否包含中文字符
    if (/[\u4e00-\u9fa5]/.test(word)) complexity += 0.5;
    
    // 检查是否包含英文字符
    if (/[a-zA-Z]/.test(word)) complexity += 0.3;
    
    // 检查是否包含数字
    if (/\d/.test(word)) complexity += 0.2;
    
    // 检查是否包含其他特殊字符
    if (/[^\w\s\u4e00-\u9fa5]/.test(word)) complexity += 0.4;
    
    return complexity;
}

// 计算位置加权
function calculatePositionBoost(positions: number[], totalWords: number): number {
    let boost = 1.0;
    
    // 标题位置 (前5%)
    if (positions.some(pos => pos < totalWords * 0.05)) boost *= 2.0;
    
    // 开头位置 (5-15%)
    else if (positions.some(pos => pos < totalWords * 0.15)) boost *= 1.5;
    
    // 结尾位置 (后15%)
    else if (positions.some(pos => pos > totalWords * 0.85)) boost *= 1.3;
    
    // 分散度加权
    if (positions.length > 1) {
        const spread = (Math.max(...positions) - Math.min(...positions)) / totalWords;
        boost *= (1 + spread * 0.5);
    }
    
    return boost;
}

// 获取领域特定加权
function getDomainBoost(word: string): number {
    // 技术领域重要词加权
    const techBoosts: Record<string, number> = {
        // 架构相关
        'arch_pattern': 1.6, 'arch_framework': 1.5, 'arch_design': 1.4,
        'arch_structure': 1.4, 'arch_layer': 1.4, 'arch_service': 1.3, 'arch_component': 1.4,
        '系统架构': 1.6, '技术框架': 1.5, '架构设计': 1.4,
        '系统结构': 1.4, '系统层级': 1.4, '微服务': 1.3, '系统组件': 1.4,

        // 开发工作流
        'dev_workflow': 1.5, 'dev_pipeline': 1.5, 'dev_deployment': 1.5,
        'dev_build': 1.3, 'dev_release': 1.4, 'dev_version': 1.3, 'dev_update': 1.3,
        '开发流程': 1.5, '流水线': 1.5, '系统部署': 1.5,
        '项目构建': 1.3, '版本发布': 1.4, '版本管理': 1.3, '系统更新': 1.3,

        // 编程概念
        'prog_algorithm': 1.6, 'prog_datastructure': 1.6, 'prog_object': 1.4,
        'prog_class': 1.4, 'prog_interface': 1.4, 'prog_inheritance': 1.5,
        'prog_polymorphism': 1.6,
        '算法实现': 1.6, '数据结构': 1.6, '对象设计': 1.4,
        '类定义': 1.4, '接口设计': 1.4, '继承关系': 1.5,
        '多态性': 1.6,

        // 错误处理
        'err_exception': 1.5, 'err_debug': 1.4, 'err_logging': 1.4,
        'err_trace': 1.4, 'err_crash': 1.5, 'err_failure': 1.5, 'err_recovery': 1.5,
        '异常处理': 1.5, '程序调试': 1.4, '日志记录': 1.4,
        '错误追踪': 1.4, '系统崩溃': 1.5, '故障恢复': 1.5,

        // UI/UX相关
        'ui_interface': 1.4, 'ui_usability': 1.5, 'ui_accessibility': 1.5,
        'ui_responsive': 1.5, 'ui_layout': 1.4, 'ui_interaction': 1.5,
        '用户界面': 1.4, '可用性': 1.5, '无障碍': 1.5,
        '响应式': 1.5, '布局': 1.4, '交互': 1.5,

        // 测试相关
        'test_unit': 1.5, 'test_integration': 1.5, 'test_coverage': 1.5,
        'test_assertion': 1.5, 'test_mock': 1.5, 'test_benchmark': 1.5,
        '单元测试': 1.5, '集成测试': 1.5, '测试覆盖': 1.5,
        '测试断言': 1.5, '模拟测试': 1.5, '性能测试': 1.5,

        // 版本控制
        'git_commit': 1.4, 'git_branch': 1.4, 'git_merge': 1.4,
        'git_conflict': 1.5, 'git_repository': 1.4,
        '代码提交': 1.4, '分支管理': 1.4, '代码合并': 1.4,
        '冲突解决': 1.5, '代码仓库': 1.4,

        // 云计算/DevOps
        'cloud_container': 1.5, 'cloud_kubernetes': 1.6, 'cloud_scaling': 1.5,
        'cloud_monitoring': 1.5, 'cloud_metrics': 1.5, 'cloud_alert': 1.5,
        'cloud_deployment': 1.5,
        '容器技术': 1.5, '容器编排': 1.6, '弹性伸缩': 1.5,
        '系统监控': 1.5, '监控指标': 1.5, '告警管理': 1.5,
        '云部署': 1.5,

        // AI/ML相关
        'ml_model': 1.5, 'ml_training': 1.5, 'ml_inference': 1.6,
        'ml_dataset': 1.5, 'ml_neural': 1.6, 'ml_accuracy': 1.5,
        '模型训练': 1.5, '模型推理': 1.6, '数据集': 1.5,
        '神经网络': 1.6, '模型精度': 1.5,

        // 安全相关
        'sec_authentication': 1.6, 'sec_authorization': 1.6, 'sec_encryption': 1.6,
        'sec_vulnerability': 1.6, 'sec_threat': 1.6, 'sec_risk': 1.5,
        '身份认证': 1.6, '访问授权': 1.6, '数据加密': 1.6,
        '安全漏洞': 1.6, '安全威胁': 1.6, '风险控制': 1.5,

        // 性能相关
        'perf_optimization': 1.5, 'perf_latency': 1.5, 'perf_throughput': 1.5,
        'perf_bottleneck': 1.5, 'perf_profiling': 1.5,
        '性能优化': 1.5, '响应延迟': 1.5, '系统吞吐': 1.5,
        '性能瓶颈': 1.5, '性能分析': 1.5,

        // 数据库相关
        'db_query': 1.4, 'db_index': 1.4, 'db_transaction': 1.5,
        'db_schema': 1.5, 'db_migration': 1.5, 'db_backup': 1.4,
        '数据查询': 1.4, '索引优化': 1.4, '事务处理': 1.5,
        '数据库设计': 1.5, '数据迁移': 1.5, '数据备份': 1.4,

        // API相关
        'api_endpoint': 1.4, 'api_request': 1.3, 'api_response': 1.3,
        'api_rest': 1.4, 'api_graphql': 1.5, 'api_webhook': 1.5,
        'api_interface': 1.4,
        'API端点': 1.4, 'API请求': 1.3, 'API响应': 1.3,
        'REST_API': 1.4, 'GraphQL_API': 1.5, 'Webhook_API': 1.5,
        'API接口': 1.4,

        // 项目管理
        'pm_milestone': 1.4, 'pm_deadline': 1.4, 'pm_priority': 1.4,
        'pm_requirement': 1.4, 'pm_scope': 1.4, 'pm_agile': 1.4,
        '里程碑': 1.4, '截止日期': 1.4, '优先级': 1.4,
        '需求管理': 1.4, '项目范围': 1.4, '敏捷开发': 1.4,

        // 代码质量
        'code_quality': 1.5, 'code_refactor': 1.5, 'code_review': 1.4,
        'code_standard': 1.4, 'code_convention': 1.4, 'code_documentation': 1.4,
        '代码质量': 1.5, '代码重构': 1.5, '代码评审': 1.4,
        '编码规范': 1.4, '文档规范': 1.4
    };
    
    return techBoosts[word.toLowerCase()] || 1.0;
}