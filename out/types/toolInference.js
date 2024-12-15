"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolPatterns = void 0;
exports.matchToolPattern = matchToolPattern;
exports.calculateConfidence = calculateConfidence;
exports.analyzeRelation = analyzeRelation;
exports.getLineNumbers = getLineNumbers;
// 工具模式定义
exports.toolPatterns = [
    {
        tool: 'edit_file',
        confidence: 0.95,
        patterns: [
            // 英文强动作表达 - 更具体的编辑意图
            /(?:edit(?:ing)?|modif(?:y|ying)|updat(?:e|ing)|chang(?:e|ing)|revis(?:e|ing)|alter(?:ing)?|rewrit(?:e|ing)|fix(?:ing)?)\s+(?:the\s+)?(?:code\s+in|content\s+of|file)?\s*[`"]([^`"]+)[`"]/i,
            // 英文意图表达 - 明确的编辑目的
            /(?:let me|I'll|I will|going to|need to)\s+(?:edit|modify|update|change|revise|alter|rewrite|fix)\s+(?:the\s+)?(?:code\s+in|content\s+of|file)?\s*[`"]([^`"]+)[`"]/i,
            // 英文变更表达 - 强调修改行为
            /(?:mak(?:e|ing)|add(?:ing)?|implement(?:ing)?)\s+(?:changes|modifications|edits|updates|fixes)\s+(?:to|in)\s*[`"]([^`"]+)[`"]/i,
            // 中文强动作表达 - 明确编辑意图
            /(?:编辑|修改|更新|更改|修正|调整|重写|改写|改动)\s*(?:代码|文件|文档|内容)?\s*[`"]([^`"]+)[`"]/,
            // 中文意图表达 - 清晰的编辑目的
            /(?:我要|我来|我需要|让我|准备|打算|需要)\s*(?:编辑|修改|更新|更改|修正|调整|重写|改写)\s*(?:代码|文件|文档|内容)?\s*[`"]([^`"]+)[`"]/,
            // 中文变更表达 - 强调修改动作
            /(?:改一?下|改改|修改一?下|调整一?下|改动一?下)\s*(?:代码|文件|文档|内容)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            // 更具体的编辑上下文模式
            /(?:edit|modify|update|change|revise|alter|rewrite|fix)/i,
            /(?:编辑|修改|更新|更改|修正|调整|重写|改写|改动)/,
            /(?:changes?|modifications?|updates?|fixes?)/i,
            /(?:改动|变更|修改|更新)/
        ],
        paramExtractor: (match) => ({
            relativeWorkspacePath: match[1]
        })
    },
    {
        tool: 'read_file',
        confidence: 0.7,
        patterns: [
            // 英文只读表达
            /(?:read(?:ing)?|view(?:ing)?|display(?:ing)?|show(?:ing)?|get(?:ting)?)\s+(?:the\s+)?(?:content(?:s|)\s+of|file)?\s*[`"]([^`"]+)[`"]/i,
            // 英文意图表达
            /(?:let me|I'll|I will|going to|need to)\s+(?:read|view|display|show|get)\s+(?:the\s+)?(?:content(?:s|)\s+of|file)?\s*[`"]([^`"]+)[`"]/i,
            // 中文只读表达
            /(?:读取|查看|显示|获取)\s*(?:文件|文档|内容)?\s*[`"]([^`"]+)[`"]/,
            // 中文意图表达
            /(?:我要|我来|我需要|让我|准备|打算|需要)\s*(?:读取|查看|显示|获取)\s*(?:文件|文档|内容)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /(?:read|view|display|show|get)\s+(?:content|file)/i,
            /(?:读取|查看|显示|获取)\s*(?:内容|文件)/,
            /file\s+content/i,
            /文件内容/
        ],
        paramExtractor: (match) => ({
            relativeWorkspacePath: match[1]
        })
    },
    {
        tool: 'list_dir',
        confidence: 0.7,
        patterns: [
            // 英文目录操作表达
            /(?:list(?:ing)?|browse|explore)\s+(?:the\s+)?(?:directory|folder|files?\s+in)\s*[`"]([^`"]+)[`"]/i,
            // 英文意图表达
            /(?:let me|I'll|I will|going to|need to)\s+(?:list|browse|explore)\s+(?:the\s+)?(?:directory|folder|files?\s+in)\s*[`"]([^`"]+)[`"]/i,
            // 中文目录操作表达
            /(?:列出|列举|浏览)\s*(?:目录|文件夹|路径|下的文件)?\s*[`"]([^`"]+)[`"]/,
            // 中文意图表达
            /(?:我要|我来|我需要|让我|准备|打算|需要)\s*(?:列出|列举|浏览)\s*(?:目录|文件夹|路径|下的文件)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /(?:directory|folder)\s+content/i,
            /(?:目录|文件夹)\s*内容/,
            /files?\s+list/i,
            /文件\s*列表/
        ],
        paramExtractor: (match) => ({
            relativeWorkspacePath: match[1]
        })
    },
    {
        tool: 'codebase_search',
        confidence: 0.8,
        patterns: [
            // 英文搜索表达 - 明确搜索意图
            /(?:search(?:ing)?|find(?:ing)?|look(?:ing)?)\s+(?:for|through)\s+(?:code|pattern|example|usage|reference)\s*[`"]([^`"]+)[`"]/i,
            // 英文查找表达 - 强调搜索目的
            /(?:locate|discover|seek)\s+(?:code|pattern|example|usage|reference)\s*[`"]([^`"]+)[`"]/i,
            // 中文搜索表达 - 明确搜索意图
            /(?:搜索|查找|寻找)\s*(?:代码|模式|示例|用法|引用)?\s*[`"]([^`"]+)[`"]/,
            // 中文查找表达 - 强调搜索目的
            /(?:定位|检索|搜寻)\s*(?:代码|模式|示例|用法|引用)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            // 更具体的搜索上下文模式
            /(?:search|find|look|seek|query)/i,
            /(?:搜索|查找|寻找|检索)/,
            /(?:code|pattern|example|usage|reference)/i,
            /(?:代码|模式|示例|用法|引用)/
        ],
        paramExtractor: (match) => ({
            query: match[1]
        })
    },
    {
        tool: 'grep_search',
        confidence: 0.8,
        patterns: [
            // 英文正式表达
            /(?:grep|searching text|finding text|looking for text|searching pattern|finding pattern|searching regex|finding regex)\s+[`"]([^`"]+)[`"]/i,
            /(?:let me|I'll|I will|going to|please|could you|can you)\s+(?:grep|search text|find text|look for text|search pattern|find pattern)\s+[`"]([^`"]+)[`"]/i,
            // 中文正式表达
            /(?:文本搜索|内容搜索|正则搜索|文本查找|内容查找|正则查找|全文搜索)\s*[`"]([^`"]+)[`"]/,
            /(?:让我|我来|我要|我想|请|麻烦|帮我)\s*(?:搜索|查找|寻找|检索|查询|定位|搜寻)\s*[`"]([^`"]+)[`"]/,
            // 中英混合表达
            /(?:让我|我来)?(?:grep|search|find)\s*(?:一下|下)?(?:文本|内容|正则)?\s*[`"]([^`"]+)[`"]/i,
            // 口语化表达
            /(?:找找|搜搜|瞧瞧|看看)\s*(?:文本|内容|正则)?\s*[`"]([^`"]+)[`"]/,
            // 省略主语
            /(?:找|搜|查)\s*(?:文本|内容|正则)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /text search/i,
            /文本搜索/,
            /pattern match/i,
            /模式匹配/
        ],
        paramExtractor: (match) => ({
            query: match[1]
        })
    },
    {
        tool: 'file_search',
        confidence: 0.8,
        patterns: [
            // 英文正式表达
            /(?:searching file|finding file|looking for file|locating file|searching for file)\s+[`"]([^`"]+)[`"]/i,
            /(?:let me|I'll|I will|going to|please|could you|can you)\s+(?:search file|find file|look for file|locate file)\s+[`"]([^`"]+)[`"]/i,
            // 中文正式表达
            /(?:搜索文件|查找文件|寻找文件|定位文件)\s*[`"]([^`"]+)[`"]/,
            /(?:让我|我来|我要|我想|请|麻烦|帮我)\s*(?:搜索|查找|寻找|定位)\s*(?:文件|文档)?\s*[`"]([^`"]+)[`"]/,
            // 中英混合表达
            /(?:让我|我来)?(?:search|find|locate)\s*(?:一下|下)?(?:文件|文档)?\s*[`"]([^`"]+)[`"]/i,
            // 口语化表达
            /(?:找找|搜搜|瞧瞧|看看)\s*(?:文件|文档)?\s*[`"]([^`"]+)[`"]/,
            // 省略主语
            /(?:找|搜|查)\s*(?:文件|文档)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /file search/i,
            /文件搜索/,
            /find file/i,
            /查找文件/
        ],
        paramExtractor: (match) => ({
            query: match[1]
        })
    },
    {
        tool: 'run_terminal_command',
        confidence: 0.8,
        patterns: [
            // 英文正式表达
            /(?:running|executing|launching|starting|performing|issuing|sending|trying)\s+(?:the command|command)?\s*[`"]([^`"]+)[`"]/i,
            /(?:let me|I'll|I will|going to|please|could you|can you)\s+(?:run|execute|launch|start|perform|issue|send|try)\s+(?:the command|command)?\s*[`"]([^`"]+)[`"]/i,
            /(?:run|execute|launch|start)\s+[`"]([^`"]+)[`"]/i,
            // 中文正式表达
            /(?:运行|执行|启动|开始|发送|尝试)\s*(?:命令|指令|程序)?\s*[`"]([^`"]+)[`"]/,
            /(?:让我|我来|我要|我想|请|麻烦|帮我)\s*(?:运行|执行|启动|开始|发送|尝试)\s*(?:命令|指令|程序)?\s*[`"]([^`"]+)[`"]/,
            // 中英混合表达
            /(?:让我|我来)?(?:run|execute|start)\s*(?:一下|下)?(?:命令|指令)?\s*[`"]([^`"]+)[`"]/i,
            // 口语化表达
            /(?:跑跑|试试|执行下|运行下)\s*(?:这个|那个)?(?:命令|指令)?\s*[`"]([^`"]+)[`"]/,
            // 省略主语
            /(?:跑|试|执行|运行)\s*(?:一下|下)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /command execution/i,
            /命令执行/,
            /terminal/i,
            /终端/
        ],
        paramExtractor: (match) => ({
            command: match[1],
            requireUserApproval: true
        })
    },
    {
        tool: 'delete_file',
        confidence: 0.8,
        patterns: [
            // 英文正式表达
            /(?:deleting|removing|erasing|clearing|wiping)\s+(?:the file|file)?\s*[`"]([^`"]+)[`"]/i,
            /(?:let me|I'll|I will|going to|please|could you|can you)\s+(?:delete|remove|erase|clear|wipe)\s+(?:the file|file)?\s*[`"]([^`"]+)[`"]/i,
            // 中文正式表达
            /(?:删除|移除|清除|清理|擦除)\s*(?:文件|文档)?\s*[`"]([^`"]+)[`"]/,
            /(?:让我|我来|我要|我想|请|麻烦|帮我)\s*(?:删除|移除|清除|清理|擦除)\s*(?:文件|文档)?\s*[`"]([^`"]+)[`"]/,
            // 中英混合表达
            /(?:让我|我来)?(?:delete|remove)\s*(?:一下|下)?(?:文件|文档)?\s*[`"]([^`"]+)[`"]/i,
            // 口语化表达
            /(?:删删|删掉|清清|清掉)\s*(?:这个|那个)?(?:文件|文档)?\s*[`"]([^`"]+)[`"]/,
            // 省略主语
            /(?:删|清|移除)\s*(?:一下|下)?\s*[`"]([^`"]+)[`"]/
        ],
        contextPatterns: [
            /file deletion/i,
            /文件删除/,
            /remove file/i,
            /移除文件/
        ],
        paramExtractor: (match) => ({
            targetFile: match[1]
        })
    }
];
// 工具匹配函数
function matchToolPattern(text, pattern) {
    for (const p of pattern.patterns) {
        const match = text.match(p);
        if (match) {
            return {
                tool: pattern.tool,
                params: pattern.paramExtractor ? pattern.paramExtractor(match) : { input: match[1] },
                confidence: pattern.confidence,
                pattern: p,
                match
            };
        }
    }
    return null;
}
// 计算置信度
function calculateConfidence(match, pattern) {
    let confidence = pattern.confidence;
    // 基于匹配质量调整置信度
    if (match.match[0].length === match.match.input?.length) {
        confidence *= 1.3; // 提高完整匹配的加分
    }
    // 基于上下文模式调整置信度
    if (pattern.contextPatterns) {
        let contextMatches = 0;
        for (const cp of pattern.contextPatterns) {
            if (match.match.input?.match(cp)) {
                contextMatches++;
            }
        }
        // 根据匹配的上下文数量增加置信度
        if (contextMatches > 0) {
            confidence *= (1 + 0.1 * contextMatches);
        }
    }
    // 基于动作语义强度调整置信度
    const strongActionWords = {
        edit_file: /(?:edit|modify|update|change|revise|alter|rewrite|fix|编辑|修改|更新|更改|修正|调整|重写|改写|改动)/i,
        read_file: /(?:read|view|display|show|get|读取|查看|显示|获取)/i,
        list_dir: /(?:list|browse|explore|列出|列举|浏览)/i,
        codebase_search: /(?:search|find|seek|hunt|scan|query|locate|搜索|查找|寻找|检索|查询|定位|搜寻)/i,
        grep_search: /(?:grep|search text|find text|look for text|search pattern|find pattern|文本搜索|内容搜索|正则搜索)/i,
        file_search: /(?:search file|find file|look for file|locate file|搜索文件|查找文件|寻找文件|定位文件)/i,
        run_terminal_command: /(?:run|execute|launch|start|perform|issue|send|try|运行|执行|启动|开始|发送|尝试)/i,
        delete_file: /(?:delete|remove|erase|clear|wipe|删除|移除|清除|清理|擦除)/i
    };
    if (strongActionWords[match.tool]?.test(match.match[0])) {
        confidence *= 1.2; // 强动作加分
    }
    return Math.min(confidence, 1); // 确保置信度不超过1
}
// 分析段落间关系
function analyzeRelation(paragraph, context) {
    if (!context.tool) {
        return { isRelated: false };
    }
    // 检查是否是工具结果
    if (isToolResult(paragraph)) {
        return {
            isRelated: true,
            contentType: 'tool_result',
            relationType: 'result',
            confidence: 0.9
        };
    }
    // 检查是否是相关代码
    if (isCodeBlock(paragraph)) {
        return {
            isRelated: true,
            contentType: 'code',
            relationType: 'example',
            confidence: 0.8
        };
    }
    // 检查是否是相关说明
    if (isExplanation(paragraph, context)) {
        return {
            isRelated: true,
            contentType: 'text',
            relationType: 'explanation',
            confidence: 0.7
        };
    }
    return { isRelated: false };
}
// 辅助函数
function isToolResult(text) {
    return /^(?:Contents of|File|Directory|Error|Result):/i.test(text) ||
        text.includes('```') ||
        /^(?:内容|文件|目录|错误|结果)：/.test(text);
}
function isCodeBlock(text) {
    return text.startsWith('```') && text.endsWith('```');
}
function isExplanation(text, context) {
    const explanationPatterns = {
        read_file: /(?:这个文件|this file|文件内容|file contents|查看内容|view contents|显示内容|show contents)/i,
        edit_file: /(?:修改|编辑|changes|edits|modifications|更新|update|改动|修正)/i,
        list_dir: /(?:目录内容|directory contents|文件列表|file list|目录下的文件|files in directory|文件夹内容|folder contents)/i,
        codebase_search: /(?:搜索结果|search results|找到以下|found following|匹配项|matches)/i,
        grep_search: /(?:文本搜索|text search|内容匹配|content matches|正则匹配|regex matches)/i,
        file_search: /(?:文件搜索|file search|找到文件|found files|匹配文件|matching files)/i,
        run_terminal_command: /(?:命令输出|command output|执行结果|execution result|运行结果|run result)/i,
        delete_file: /(?:删除结果|deletion result|移除结果|removal result|清理结果|cleanup result)/i
    };
    return context.tool ? Boolean(text.match(explanationPatterns[context.tool])) : false;
}
// 获取行号
function getLineNumbers(text) {
    const lines = text.split('\n');
    return Array.from({ length: lines.length }, (_, i) => i + 1);
}
//# sourceMappingURL=toolInference.js.map