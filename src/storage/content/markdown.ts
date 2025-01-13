import { MessageContent, MessageContentType, TextContent, ToolStatus } from '../../types';
import { getLineNumbers } from '../utils';
import { generateContextId } from '../utils';
import { parseCodeBlocks } from './code';

// Handle difficult backtick patterns
function handleDifficultBackticks(text: string): string {
    // Detect sequences of 4 or more backticks
    const difficultPattern = /(`{4,})/g;
    return text.replace(difficultPattern, (match) => {
        // Convert difficult backticks to emoji tool call
        return `<function_calls><invoke name="emoji"><parameter name="emoji">code</parameter></invoke></function_calls>`;
    });
}

// When handling errors in tool calls, we need to include the status and type
function handleToolCallError(error: any): MessageContent[] {
    return [{
        type: 'tool_result',
        content: String(error),
        metadata: {
            status: 'error' as ToolStatus,
            error: String(error),
            contextId: generateContextId()
        }
    }];
}

// Also update any other error handling in the file to match the type
function handleParseError(error: any): MessageContent[] {
    return [{
        type: 'text',
        content: String(error),
        metadata: {
            contextId: generateContextId(),
            isEmoji: false
        }
    }];
}

export function parseMessageContent(text: string): MessageContent[] {
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
                        originalLineNumbers: getLineNumbers(thinkingMatch[0], text),
                        originalRange: {
                            start: thinkingMatch.index,
                            end: thinkingMatch.index + thinkingMatch[0].length
                        }
                    }
                });
            }
        }

        // Extract code blocks
        const codeBlocks = parseCodeBlocks(text);
        contents.push(...codeBlocks);

        // Extract tool calls
        const toolCallRegex = /<function_calls>\s*<invoke name="([^"]+)">([\s\S]*?)<\/invoke>\s*<\/function_calls>/g;
        let toolMatch;
        let hasToolCalls = false;
        while ((toolMatch = toolCallRegex.exec(text)) !== null) {
            hasToolCalls = true;
            const toolName = toolMatch[1];
            const paramsContent = toolMatch[2];

            // Parse tool parameters
            const params: Record<string, any> = {};
            const paramMatches = paramsContent.matchAll(/<parameter name="([^"]+)">([\s\S]*?)<\/parameter>/g);
            for (const paramMatch of paramMatches) {
                const paramName = paramMatch[1];
                const paramValue = paramMatch[2].trim();

                try {
                    params[paramName] = JSON.parse(paramValue);
                } catch {
                    params[paramName] = paramValue;
                }
            }

            if (toolMatch[0].trim()) {
                const toolCallContent = {
                    type: 'tool_call' as const,
                    content: toolMatch[0],
                    metadata: {
                        toolName,
                        toolParams: params,
                        status: 'pending' as ToolStatus,
                        originalLineNumbers: getLineNumbers(toolMatch[0], text),
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
        let toolResultMatch;
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
                        originalLineNumbers: getLineNumbers(toolResultMatch[0], text),
                        contextId: currentContext.toolCall?.metadata?.contextId
                    }
                };

                currentContext.result = resultContent;
                contents.push(resultContent);
            }
        }

        // Parse remaining text as markdown
        const markdownElements = parseMarkdownElements(text);
        contents.push(...markdownElements);

        return contents;
    } catch (error) {
        console.error('Failed to parse message content:', error);
        return [{
            type: 'text',
            content: text,
            metadata: {
                contextId: generateContextId(),
                isEmoji: false
            }
        }];
    }
}

function parseMarkdownElements(text: string): MessageContent[] {
    const elements: MessageContent[] = [];
    let currentText = text;

    // Parse headers
    const headers = text.match(/^#{1,6}\s+.+$/gm);
    if (headers) {
        headers.forEach(header => {
            elements.push({
                type: 'markdown',
                content: header,
                metadata: {
                    format: [{
                        type: 'header',
                        level: header.match(/^#+/)?.[0].length || 1
                    }]
                }
            });
        });
    }

    // Parse lists
    const lists = text.match(/^[\s-]*[-*+]\s+.+$/gm);
    if (lists) {
        lists.forEach(list => {
            elements.push({
                type: 'markdown',
                content: list,
                metadata: {
                    format: [{
                        type: 'list_item',
                        indent: (list.match(/^\s*/)?.[0].length || 0) / 2
                    }]
                }
            });
        });
    }

    // Parse blockquotes
    const quotes = text.match(/^>\s+.+$/gm);
    if (quotes) {
        quotes.forEach(quote => {
            elements.push({
                type: 'markdown',
                content: quote.substring(2),
                metadata: {
                    format: [{
                        type: 'blockquote'
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
                        type: 'table'
                    }]
                }
            });
        });
    }

    // Parse inline code
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

    return elements;
} 