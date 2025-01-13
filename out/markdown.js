"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToMarkdown = convertToMarkdown;
const utils_1 = require("./utils");
const storage_1 = require("./storage");
const i18n_1 = require("./i18n");
// Format capability status
function formatCapabilityStatus(status) {
    const statusEmoji = {
        completed: '✅',
        error: '❌',
        pending: '⏳'
    };
    return `${statusEmoji[status.status]} ${status.type}`;
}
// Generate Markdown text
function convertToMarkdown(conversation) {
    const { metadata, messages } = conversation;
    let markdown = '';
    // Add title and metadata
    markdown += `# ${metadata?.name || (0, i18n_1.t)('unnamedConversation')}\n\n`;
    if (metadata) {
        markdown += `## ${(0, i18n_1.t)('conversationInfo')}\n\n`;
        markdown += `- ID: \`${conversation.id}\`\n`;
        markdown += `- ${(0, i18n_1.t)('createdAt')}: ${(0, utils_1.formatTimestamp)(metadata.createdAt)}\n`;
        markdown += `- ${(0, i18n_1.t)('lastUpdated')}: ${(0, utils_1.formatTimestamp)(metadata.lastUpdatedAt)}\n`;
        markdown += `- ${(0, i18n_1.t)('conversationMode')}: ${metadata.mode === 'agent' ? (0, i18n_1.t)('modeAI') : (0, i18n_1.t)('modeNormal')}\n`;
        if (metadata.workspaceId) {
            markdown += `- ${(0, i18n_1.t)('workspace')}: \`${metadata.workspaceId}\`\n`;
        }
        if (metadata.intent) {
            markdown += `- ${(0, i18n_1.t)('intent')}: ${metadata.intent.category} (${(0, i18n_1.t)('confidence')}: ${metadata.intent.confidence})\n`;
            if (metadata.intent.keywords.length > 0) {
                markdown += `- ${(0, i18n_1.t)('keywords')}: ${metadata.intent.keywords.join(', ')}\n`;
            }
        }
        if (metadata.tags.length > 0) {
            markdown += `- ${(0, i18n_1.t)('tags')}: ${metadata.tags.join(', ')}\n`;
        }
        // Add statistics
        markdown += `\n### ${(0, i18n_1.t)('statistics')}\n\n`;
        markdown += `- ${(0, i18n_1.t)('totalMessages')}: ${metadata.statistics.messageCount}\n`;
        markdown += `- ${(0, i18n_1.t)('userMessages')}: ${metadata.statistics.userMessageCount}\n`;
        markdown += `- ${(0, i18n_1.t)('assistantMessages')}: ${metadata.statistics.assistantMessageCount}\n`;
    }
    // Add conversation content
    markdown += `\n## ${(0, i18n_1.t)('conversationContent')}\n\n`;
    messages.forEach((message, index) => {
        // Check if message content is empty
        if (!message.content || message.content.trim() === '') {
            return;
        }
        const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
        markdown += `### ${role}\n\n`;
        // Process message content
        const contents = (0, storage_1.parseMessageContent)(message.content);
        let hasContent = false; // Track if there's actual content
        contents.forEach(content => {
            switch (content.type) {
                case 'text':
                    if (content.content.trim()) {
                        markdown += (0, utils_1.escapeMarkdown)(content.content) + '\n\n';
                        hasContent = true;
                    }
                    break;
                case 'thinking':
                    markdown += '<details><summary>🤔 Thinking Process</summary>\n\n```thinking\n' + content.content + '\n```\n\n</details>\n\n';
                    break;
                case 'code':
                    if (content.content.trim()) {
                        const lang = content.language || 'plaintext';
                        markdown += '<details><summary>💻 Code (' + lang + ')</summary>\n\n```' + lang + '\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
                case 'tool_call':
                    // Simplify tool call display, no longer showing detailed parameters
                    const toolName = content.metadata?.toolName || 'unknown';
                    const toolEmoji = getToolEmoji(toolName);
                    markdown += `${toolEmoji} **${getToolDescription(toolName)}**\n\n`;
                    break;
                case 'tool_result':
                    if (content.content.trim()) {
                        markdown += '<details><summary>📋 Execution Result</summary>\n\n```\n' + content.content + '\n```\n\n</details>\n\n';
                    }
                    break;
            }
        });
        // Only add intermediate output block and separator when there's actual content
        if (hasContent) {
            // Add intermediate output block
            if (message.intermediateChunks && message.intermediateChunks.length > 0) {
                markdown += '**Intermediate Output:**\n\n';
                message.intermediateChunks.forEach((chunk, i) => {
                    if (chunk.trim()) { // Only add non-empty intermediate outputs
                        markdown += `<details><summary>Intermediate Output #${i + 1}</summary>\n\n`;
                        markdown += '```\n' + chunk + '\n```\n\n';
                        markdown += '</details>\n\n';
                    }
                });
            }
            // Add separator
            if (index < messages.length - 1) {
                markdown += '---\n\n';
            }
        }
    });
    return markdown;
}
// Add tool emoji mapping function
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
function getToolDescription(toolName) {
    const toolMap = {
        'read_file': 'toolReadFile',
        'edit_file': 'toolEditFile',
        'list_dir': 'toolListDir',
        'codebase_search': 'toolCodebaseSearch',
        'grep_search': 'toolGrepSearch',
        'file_search': 'toolFileSearch',
        'run_terminal_command': 'toolRunCommand',
        'delete_file': 'toolDeleteFile'
    };
    const translationKey = toolMap[toolName] || 'toolGeneric';
    return (0, i18n_1.t)(translationKey);
}
//# sourceMappingURL=markdown.js.map