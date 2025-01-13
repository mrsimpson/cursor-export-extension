import { Message, ConversationData, MessageContent, CapabilityStatuses, CapabilityStatus, ConversationMetadata } from '../../types';
import { log } from '../../utils';
import { parseMessageContent } from '../content/markdown';
import { calculateStatistics, detectIntent, detectTags } from './metadata';

export function parseMessages(data: any): Message[] {
    return data.conversation?.map((msg: any) => {
        // Base timestamp, use current time if not provided
        const timestamp = msg.timestamp || Date.now();

        // Handle tool calls
        let toolCalls = [];
        let toolResults = [];
        let intermediateChunks = [];
        let capabilityStatuses: CapabilityStatuses = {};

        // Process tool calls
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            toolCalls = msg.toolCalls.map((call: any) => ({
                ...call,
                timestamp: call.timestamp || timestamp + 1000 // Tool call timestamp 1s after message
            }));
        }

        // Process tool results
        if (msg.toolResults && Array.isArray(msg.toolResults)) {
            toolResults = msg.toolResults;
        }

        // Process intermediate chunks
        if (msg.intermediateOutput && Array.isArray(msg.intermediateOutput)) {
            intermediateChunks = msg.intermediateOutput;
        } else if (msg.chunks && Array.isArray(msg.chunks)) {
            intermediateChunks = msg.chunks;
        }

        // Process capability statuses
        if (msg.capabilityStatuses) {
            capabilityStatuses = msg.capabilityStatuses;
        } else if (msg.capabilities?.status) {
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

        // Process tool call statuses
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

export function createConversationData(
    id: string,
    data: any,
    messages: Message[]
): ConversationData {
    const metadata: ConversationMetadata = {
        name: data.name || '',
        mode: (data.mode as 'normal' | 'agent') || 'normal',
        isAgentic: data.isAgentic || false,
        createdAt: data.createdAt || Date.now(),
        lastUpdatedAt: data.lastUpdatedAt || Date.now(),
        workspaceId: data.workspaceId,
        context: {
            workspace: data.workspace,
            openFiles: data.openFiles || [],
            cursorPosition: data.cursorPosition,
            selectedText: data.selectedText,
            linterErrors: data.linterErrors || [],
            editTrailContexts: data.editTrailContexts || []
        },
        status: {
            isComplete: data.isComplete || false,
            hasError: data.hasError || false,
            lastError: data.lastError,
            lastToolCall: data.lastToolCall ? {
                name: data.lastToolCall.name,
                timestamp: data.lastToolCall.timestamp || Date.now(),
                status: data.lastToolCall.status || 'completed'
            } : undefined
        },
        statistics: calculateStatistics(messages),
        files: data.files || [],
        tags: []
    };

    // Add intent
    metadata.intent = detectIntent(messages);

    // Add tags
    const tags = detectTags({ id, messages, metadata });
    metadata.tags = Array.isArray(tags) ? tags : [];

    return {
        id,
        messages,
        metadata
    };
} 