// 消息内容类型
export type MessageContentType = 'thinking' | 'tool_call' | 'tool_result' | 'code' | 'text' | 'markdown';

// 工具状态
export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'completed';

// 格式类型
export type FormatType = 'text' | 'code' | 'link' | 'emphasis' | 'strong' | 'heading' | 'list' | 'quote' | 'table' | 'header' | 'list_item' | 'blockquote' | 'code_inline';

// 格式元素
export interface FormatElement {
    type: FormatType;
    level?: number;
    indent?: number;
    url?: string;
    title?: string;
}

// 基础消息内容接口
interface BaseMessageContent {
    type: MessageContentType;
    content: string;
    metadata?: {
        contextId?: string;
        originalLineNumbers?: number[];
        backtickCount?: number;
        relationType?: string;
        format?: FormatElement[];
        originalRange?: {
            start: number;
            end: number;
        };
    };
}

// Thinking块
export interface ThinkingContent extends BaseMessageContent {
    type: 'thinking';
}

// 工具调用
export interface ToolCallContent extends BaseMessageContent {
    type: 'tool_call';
    metadata: {
        toolName: string;
        toolParams: Record<string, any>;
        status: ToolStatus;
        inferred?: boolean;
        confidence?: number;
        contextId?: string;
        originalLineNumbers?: number[];
        backtickCount?: number;
        relationType?: string;
        originalRange?: {
            start: number;
            end: number;
        };
    };
}

// 工具结果
export interface ToolResultContent extends BaseMessageContent {
    type: 'tool_result';
    metadata: {
        status: ToolStatus;
        error?: string;
        result?: any;
        contextId?: string;
        originalLineNumbers?: number[];
        backtickCount?: number;
        relationType?: string;
        originalRange?: {
            start: number;
            end: number;
        };
    };
}

// 代码块
export interface CodeContent extends BaseMessageContent {
    type: 'code';
    language: string;
}

// 文本内容
export interface TextContent extends BaseMessageContent {
    type: 'text';
    metadata?: {
        contextId?: string;
        originalLineNumbers?: number[];
        format?: FormatElement[];
        backtickCount?: number;
        relationType?: string;
        isEmoji?: boolean;
        originalRange?: {
            start: number;
            end: number;
        };
    };
}

// Markdown内容
export interface MarkdownContent extends BaseMessageContent {
    type: 'markdown';
    metadata?: {
        contextId?: string;
        originalLineNumbers?: number[];
        format?: FormatElement[];
        backtickCount?: number;
        relationType?: string;
        originalRange?: {
            start: number;
            end: number;
        };
    };
}

// 消息内容联合类型
export type MessageContent =
    | ThinkingContent
    | ToolCallContent
    | ToolResultContent
    | CodeContent
    | TextContent
    | MarkdownContent; 