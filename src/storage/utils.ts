
export function generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getLineNumbers(content: string, fullText: string): number[] {
    const startIndex = fullText.indexOf(content);
    if (startIndex === -1) { return []; }

    const precedingText = fullText.substring(0, startIndex);
    const startLine = precedingText.split('\n').length;
    const contentLines = content.split('\n').length;

    return Array.from({ length: contentLines }, (_, i) => startLine + i);
} 

export function formatDate(dateStr: string | number): string {
    if (!dateStr) return 'Invalid Date';
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return 'Invalid Date';
    }
}