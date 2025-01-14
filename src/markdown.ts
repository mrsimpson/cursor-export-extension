/* eslint-disable @typescript-eslint/naming-convention */
import { Message, ConversationData, MessageContent, CapabilityStatus } from './types';
import { escapeMarkdown, formatTimestamp } from './utils';
import { parseMessageContent } from './storage';
import { t } from './i18n';

// 格式化能力状态
function formatCapabilityStatus(status: CapabilityStatus): string {
    const statusEmoji = {
        completed: '✅',
        error: '❌',
        pending: '⏳'
    };
    return `${statusEmoji[status.status]} ${status.type}`;
}

// 生成Markdown文本
export function convertToMarkdown(conversation: ConversationData): string {
    const { metadata, messages } = conversation;
    let markdown = '';

    // 添加标题和元数据
    markdown += `# ${metadata?.name || t('untitledConversation')}\n\n`;
    
    if (metadata) {
        markdown += `## ${t('conversationInfo')}\n\n`;
        markdown += `- ID: \`${conversation.id}\`\n`;
        markdown += `- ${t('createdAt')} ${formatTimestamp(metadata.createdAt)}\n`;
        markdown += `- ${t('lastUpdated')} ${formatTimestamp(metadata.lastUpdatedAt)}\n`;
        markdown += `- ${t('mode')} ${metadata.mode === 'agent' ? t('agentMode') : t('normalMode')}\n`;
        
        if (metadata.workspaceId) {
            markdown += `- ${t('workspace')} \`${metadata.workspaceId}\`\n`;
        }

        if (metadata.intent) {
            markdown += `- ${t('intent')} ${metadata.intent.category} (${t('confidence')} ${metadata.intent.confidence})\n`;
            if (metadata.intent.keywords.length > 0) {
                markdown += `- ${t('keywords')} ${metadata.intent.keywords.join(', ')}\n`;
            }
        }

        if (metadata.tags.length > 0) {
            markdown += `- ${t('tags')} ${metadata.tags.join(', ')}\n`;
        }

        // 添加统计信息
        markdown += `\n### ${t('statistics')}\n\n`;
        markdown += `- ${t('totalMessages')} ${metadata.statistics.messageCount}\n`;
        markdown += `- ${t('userMessages')} ${metadata.statistics.userMessageCount}\n`;
        markdown += `- ${t('assistantMessages')} ${metadata.statistics.assistantMessageCount}\n`;
    }

    // 添加对话内容
    markdown += `\n## ${t('conversationContent')}\n\n`;
    
    messages.forEach((message, index) => {
        // 检查消息内容是否为空
        if (!message.content || message.content.trim() === '') {
            return;
        }

        const role = message.role === 'user' ? t('user') : t('assistant');
        
        markdown += `### ${role}\n\n`;

        // 处理消息内容
        const contents = parseMessageContent(message.content);
        let hasContent = false;  // 用于跟踪是否有实际内容

        contents.forEach(content => {
            switch (content.type) {
                case 'text':
                    if (content.content.trim()) {
                        markdown += escapeMarkdown(content.content) + '\n\n';
                        hasContent = true;
                    }
                    break;
                case 'thinking':
                    markdown += `<details><summary>${t('thinkingProcess')}</summary>\n\n`;
                    markdown += '```thinking\n' + content.content + '\n```\n\n</details>\n\n';
                    break;
                case 'code':
                    if (content.content.trim()) {
                        const lang = content.language || 'plaintext';
                        markdown += `<details><summary>${t('code')} (${lang})</summary>\n\n`;
                        markdown += '```' + lang + '\n' + content.content + '\n```\n\n</details>\n\n';
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
                        markdown += `<details><summary>${t('executionResult')}</summary>\n\n`;
                        markdown += '```\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
            }
        });

        // 只有在有实际内容时才添加中间输出块和分隔线
        if (hasContent) {
            // 添加中间输出块
            if (message.intermediateChunks && message.intermediateChunks.length > 0) {
                markdown += `**${t('intermediateOutput')}:**\n\n`;
                message.intermediateChunks.forEach((chunk, i) => {
                    if (chunk.trim()) {  // 只添加非空的中间输出
                        markdown += `<details><summary>${t('intermediateOutputN', i + 1)}</summary>\n\n`;
                        markdown += '```\n' + chunk + '\n```\n\n</details>\n\n';
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
function getToolEmoji(toolName: string): string {
    const emojiMap: Record<string, string> = {
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
function getToolDescription(toolName: string): string {
    return t(toolName.replace(/[^a-zA-Z]/g, '') || 'unknownTool');
} 