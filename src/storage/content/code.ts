import { MessageContent } from '../../types';

export function detectLanguage(lang: string): string {
    if (!lang) { return 'plaintext'; }

    // Remove assistant_snippet_ prefix
    if (lang.startsWith('assistant_snippet_')) {
        return 'plaintext';
    }

    // Normalize language names
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

export function parseCodeBlocks(text: string): MessageContent[] {
    const contents: MessageContent[] = [];
    let processedRanges: Array<{ start: number, end: number }> = [];

    // Handle assistant_snippet format
    const snippetRegex = /```assistant_snippet_[A-Za-z0-9+/]+\.txt\s*([\s\S]*?)```/g;
    let snippetMatch;
    while ((snippetMatch = snippetRegex.exec(text)) !== null) {
        const content = snippetMatch[1].trim();
        if (content) {
            contents.push({
                type: 'code',
                language: 'assistant_snippet',
                content,
                metadata: {
                    backtickCount: 3,
                    originalRange: {
                        start: snippetMatch.index,
                        end: snippetMatch.index + snippetMatch[0].length
                    }
                }
            });
            processedRanges.push({
                start: snippetMatch.index,
                end: snippetMatch.index + snippetMatch[0].length
            });
        }
    }

    // Handle other code blocks
    const codeBlockRegex = /(`+)(\w*)\n([\s\S]*?)\1/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        // Check if this range has already been processed
        const isProcessed = match && processedRanges.some(range =>
            match!.index >= range.start && match!.index < range.end
        );

        if (!isProcessed && match &&
            !text.substring(match.index).startsWith('```thinking') &&
            !text.substring(match.index).startsWith('```assistant_snippet')) {
            const backticks = match[1];
            const lang = match[2] || '';
            const code = match[3].trim();
            if (code) {
                contents.push({
                    type: 'code',
                    language: detectLanguage(lang),
                    content: code,
                    metadata: {
                        backtickCount: backticks.length,
                        originalRange: {
                            start: match.index,
                            end: match.index + match[0].length
                        }
                    }
                });
            }
        }
    }

    return contents;
} 