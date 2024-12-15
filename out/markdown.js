"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToMarkdown = convertToMarkdown;
const utils_1 = require("./utils");
const storage_1 = require("./storage");
// 格式化能力状态
function formatCapabilityStatus(status) {
    const statusEmoji = {
        completed: '✅',
        error: '❌',
        pending: '⏳'
    };
    return `${statusEmoji[status.status]} ${status.type}`;
}
// 生成Markdown文本
function convertToMarkdown(conversation) {
    const { metadata, messages } = conversation;
    let markdown = '';
    // 添加标题和元数据
    markdown += `# ${metadata?.name || '未命名对话'}\n\n`;
    if (metadata) {
        markdown += '## 对话信息\n\n';
        markdown += `- ID: \`${conversation.id}\`\n`;
        markdown += `- 创建时间: ${(0, utils_1.formatTimestamp)(metadata.createdAt)}\n`;
        markdown += `- 最后更新: ${(0, utils_1.formatTimestamp)(metadata.lastUpdatedAt)}\n`;
        markdown += `- 模式: ${metadata.mode === 'agent' ? '智能助手' : '普通对话'}\n`;
        if (metadata.workspaceId) {
            markdown += `- 工作区: \`${metadata.workspaceId}\`\n`;
        }
        if (metadata.intent) {
            markdown += `- 意图: ${metadata.intent.category} (置信度: ${metadata.intent.confidence})\n`;
            if (metadata.intent.keywords.length > 0) {
                markdown += `- 关键词: ${metadata.intent.keywords.join(', ')}\n`;
            }
        }
        if (metadata.tags.length > 0) {
            markdown += `- 标签: ${metadata.tags.join(', ')}\n`;
        }
        // 添加统计信息
        markdown += '\n### 统计信息\n\n';
        markdown += `- 总消息数: ${metadata.statistics.messageCount}\n`;
        markdown += `- 用户消息: ${metadata.statistics.userMessageCount}\n`;
        markdown += `- 助手消息: ${metadata.statistics.assistantMessageCount}\n`;
    }
    // 添加对话内容
    markdown += '\n## 对话内容\n\n';
    messages.forEach((message, index) => {
        // 检查消息内容是否为空
        if (!message.content || message.content.trim() === '') {
            return;
        }
        const timestamp = message.timestamp ? (0, utils_1.formatTimestamp)(message.timestamp) : '';
        const role = message.role === 'user' ? '👤 用户' : '🤖 助手';
        markdown += `### ${role} (${timestamp})\n\n`;
        // 处理消息内容
        const contents = (0, storage_1.parseMessageContent)(message.content);
        let hasContent = false; // 用于跟踪是否有实际内容
        contents.forEach(content => {
            switch (content.type) {
                case 'text':
                    if (content.content.trim()) {
                        markdown += (0, utils_1.escapeMarkdown)(content.content) + '\n\n';
                        hasContent = true;
                    }
                    break;
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
                    // 简化工具调用的显示，不再显示详细参数
                    const toolName = content.metadata?.toolName || 'unknown';
                    const toolEmoji = getToolEmoji(toolName);
                    markdown += `${toolEmoji} **${getToolDescription(toolName)}**\n\n`;
                    break;
                case 'tool_result':
                    if (content.content.trim()) {
                        markdown += '<details><summary>📋 执行结果</summary>\n\n```\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
            }
        });
        // 只有在有实际内容时才添加中间输出块和分隔线
        if (hasContent) {
            // 添加中间输出块
            if (message.intermediateChunks && message.intermediateChunks.length > 0) {
                markdown += '**中间输出:**\n\n';
                message.intermediateChunks.forEach((chunk, i) => {
                    if (chunk.trim()) { // 只添加非空的中间输出
                        markdown += `<details><summary>中间输出 #${i + 1}</summary>\n\n`;
                        markdown += '```\n' + chunk + '\n```\n\n';
                        markdown += '</details>\n\n';
                    }
                });
            }
            // 添加分隔线
            if (index < messages.length - 1) {
                markdown += '---\n\n';
            }
        }
    });
    return markdown;
}
// 添加工具emoji映射函数
function getToolEmoji(toolName) {
    const emojiMap = {
        'read_file': '📖',
        'edit_file': '✏️',
        'list_dir': '📂',
        'codebase_search': '🔍',
        'grep_search': '🔎',
        'file_search': '🔦',
        'run_terminal_command': '💻',
        'delete_file': '🗑️'
    };
    return emojiMap[toolName] || '🛠️';
}
// 添加工具描述映射函数
function getToolDescription(toolName) {
    const descMap = {
        'read_file': '读取文件',
        'edit_file': '编辑文件',
        'list_dir': '列出目录',
        'codebase_search': '搜索代码',
        'grep_search': '文本搜索',
        'file_search': '查找文件',
        'run_terminal_command': '执行命令',
        'delete_file': '删除文件'
    };
    return descMap[toolName] || '工具调用';
}
//# sourceMappingURL=markdown.js.map