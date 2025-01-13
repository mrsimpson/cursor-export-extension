import { Message, ConversationMetadata } from '../../types';
import { parseMessageContent } from '../content/markdown';

export function calculateStatistics(messages: Message[]): ConversationMetadata['statistics'] {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    return {
        messageCount: messages.length,
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length
    };
}

export function detectIntent(messages: Message[]): ConversationMetadata['intent'] {
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

    // Detect intent categories
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
        confidence: Math.min(maxConfidence * 2, 1), // Adjust confidence to 0-1 range
        keywords: keywords.slice(0, 10) // Keep only top 10 keywords
    };
}

export function detectTags(params: {
    id: string,
    messages: Message[],
    metadata: ConversationMetadata
}): string[] {
    const tags = new Set<string>();
    const { messages, metadata } = params;

    // Add basic tags
    if (metadata.isAgentic) {
        tags.add('agent');
    }

    // Add intent-based tags
    if (metadata.intent?.category) {
        tags.add(`intent:${metadata.intent.category}`);
    }

    // Add content-based tags
    messages.forEach(msg => {
        const contents = parseMessageContent(msg.content);
        contents.forEach(content => {
            if (content.type === 'code') {
                tags.add('has-code');
            }
            if (content.type === 'tool_call') {
                tags.add('has-tool-calls');
            }
            if (content.type === 'tool_result') {
                tags.add('has-tool-results');
            }
        });
    });

    return Array.from(tags);
} 