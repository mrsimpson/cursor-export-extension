type TranslationKey = string;

interface Translations {
    [key: string]: {
        [key: TranslationKey]: string;
    };
}

const translations: Translations = {
    en: {
        // Time formatting
        justNow: 'just now',
        minutesAgo: '{0} minutes ago',
        hoursAgo: '{0} hours ago',
        daysAgo: '{0} days ago',

        // Duration formatting
        milliseconds: '{0}ms',
        seconds: '{0}s',
        minutesSeconds: '{0}m {1}s',
        hoursMinutes: '{0}h {1}m',

        // UI Messages
        exportDialogTitle: 'Export Conversations',
        exportDialogDescription: 'About to export conversations from all workspaces',
        selectLocationButton: 'Select Export Location',
        cancelButton: 'Cancel',
        exportStarted: 'Starting export...',
        exportProgress: 'Exporting conversation {0} of {1}',
        exportSuccess: 'Export completed! Location:',
        openFolder: 'Open Folder',
        statusBarText: '$(export) Export All Conversations',
        statusBarTooltip: 'Export conversations from all workspaces',

        // Markdown Rendering
        untitledConversation: 'Untitled Conversation',
        conversationInfo: 'Conversation Info',
        createdAt: 'Created:',
        lastUpdated: 'Last Updated:',
        mode: 'Mode:',
        workspace: 'Workspace:',
        intent: 'Intent:',
        confidence: 'confidence:',
        keywords: 'Keywords:',
        tags: 'Tags:',
        statistics: 'Statistics',
        totalMessages: 'Total Messages:',
        userMessages: 'User Messages:',
        assistantMessages: 'Assistant Messages:',
        conversationContent: 'Conversation Content',
        user: '👤 User',
        assistant: '🤖 Assistant',
        thinkingProcess: '🤔 Thinking Process',
        code: '💻 Code',
        executionResult: '📋 Execution Result',
        intermediateOutput: 'Intermediate Output',
        intermediateOutputN: 'Intermediate Output #{0}',

        // Tool Descriptions
        readFile: 'Read File',
        editFile: 'Edit File',
        listDir: 'List Directory',
        codebaseSearch: 'Search Codebase',
        grepSearch: 'Text Search',
        fileSearch: 'Find Files',
        runCommand: 'Execute Command',
        deleteFile: 'Delete File',
        unknownTool: 'Tool Call',

        // Modes
        agentMode: 'AI Assistant',
        normalMode: 'Normal Chat'
    },
    zh: {
        // Time formatting
        justNow: '刚刚',
        minutesAgo: '{0}分钟前',
        hoursAgo: '{0}小时前',
        daysAgo: '{0}天前',

        // Duration formatting
        milliseconds: '{0}毫秒',
        seconds: '{0}秒',
        minutesSeconds: '{0}分{1}秒',
        hoursMinutes: '{0}小时{1}分',

        // UI Messages
        exportDialogTitle: '导出对话设置',
        exportDialogDescription: '即将导出所有工作区的对话记录',
        selectLocationButton: '选择导出位置',
        cancelButton: '取消',
        exportStarted: '开始导出...',
        exportProgress: '正在导出对话 {0}/{1}',
        exportSuccess: '导出完成！位置：',
        openFolder: '打开文件夹',
        statusBarText: '$(export) 导出所有对话',
        statusBarTooltip: '导出所有工作区的对话记录',

        // Markdown Rendering
        untitledConversation: '未命名对话',
        conversationInfo: '对话信息',
        createdAt: '创建时间:',
        lastUpdated: '最后更新:',
        mode: '模式:',
        workspace: '工作区:',
        intent: '意图:',
        confidence: '置信度:',
        keywords: '关键词:',
        tags: '标签:',
        statistics: '统计信息',
        totalMessages: '总消息数:',
        userMessages: '用户消息:',
        assistantMessages: '助手消息:',
        conversationContent: '对话内容',
        user: '👤 用户',
        assistant: '🤖 助手',
        thinkingProcess: '🤔 思考过程',
        code: '💻 代码',
        executionResult: '📋 执行结果',
        intermediateOutput: '中间输出',
        intermediateOutputN: '中间输出 #{0}',

        // Tool Descriptions
        readFile: '读取文件',
        editFile: '编辑文件',
        listDir: '列出目录',
        codebaseSearch: '搜索代码',
        grepSearch: '文本搜索',
        fileSearch: '查找文件',
        runCommand: '执行命令',
        deleteFile: '删除文件',
        unknownTool: '工具调用',

        // Modes
        agentMode: '智能助手',
        normalMode: '普通对话'
    }
};

// Get user's language preference
const getUserLanguage = (): string => {
    // Try to get language from VS Code
    const vscodeLanguage = process.env.VSCODE_NLS_CONFIG
        ? JSON.parse(process.env.VSCODE_NLS_CONFIG).locale
        : null;

    if (vscodeLanguage) {
        const lang = vscodeLanguage.toLowerCase().split('-')[0];
        if (translations[lang]) {
            return lang;
        }
    }

    // Fallback to system language
    const systemLanguage = Intl.DateTimeFormat().resolvedOptions().locale;
    const lang = systemLanguage.toLowerCase().split('-')[0];

    return translations[lang] ? lang : 'en';
};

// Translation function
export const t = (key: TranslationKey, ...args: any[]): string => {
    const lang = getUserLanguage();
    let text = translations[lang]?.[key] || translations.en[key] || key;

    // Replace placeholders
    args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, String(arg));
    });

    return text;
}; 