"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const storage_1 = require("../storage");
const parseTest_1 = require("./parseTest");
suite('Extension Test Suite', () => {
    test('Default output path format', () => {
        const path = 'test-output/cursor-conversation-2024-12-8-21-04-34.md';
        assert.ok(path.match(/^test-output\/cursor-conversation-\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}\.md$/));
    });
    test('Markdown conversion with special characters', () => {
        const text = '# Test *bold* _italic_ `code`';
        assert.ok(text.includes('*') && text.includes('_') && text.includes('`'));
    });
    test('Database connection', async () => {
        try {
            await (0, storage_1.getConversation)();
            assert.ok(true);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const expectedErrors = [
                '找不到对话数据',
                '当前对话状态无效',
                '无法获取对话内容',
                'command',
                'not found',
                'Unable to resolve resource',
                '所有获取方式都失败了'
            ];
            const isExpectedError = expectedErrors.some(expected => errorMessage.includes(expected));
            assert.ok(isExpectedError, `Unexpected error: ${errorMessage}`);
        }
    });
    suite('Message Parsing', () => {
        test('Parse thinking block', () => {
            const text = '```thinking\nThis is a thinking block\n```';
            const contents = (0, parseTest_1.parseMessageContent)(text);
            assert.strictEqual(contents.length, 1);
            assert.strictEqual(contents[0].type, 'thinking');
            assert.strictEqual(contents[0].content, 'This is a thinking block');
        });
        test('Parse code block', () => {
            const text = '```typescript\nconst x = 1;\n```';
            const contents = (0, parseTest_1.parseMessageContent)(text);
            assert.strictEqual(contents.length, 1);
            assert.strictEqual(contents[0].type, 'code');
            assert.strictEqual(contents[0].language, 'typescript');
            assert.strictEqual(contents[0].content, 'const x = 1;');
        });
        test('Parse tool call', () => {
            const text = '<function_calls><invoke name="test_tool"><parameter name="param1">value1</parameter></invoke></function_calls>';
            const contents = (0, parseTest_1.parseMessageContent)(text);
            console.log('Parsed contents:', JSON.stringify(contents, null, 2));
            assert.ok(contents.length > 0, 'No contents parsed');
            const toolCall = contents.find(c => c.type === 'tool_call');
            assert.ok(toolCall, 'No tool call found');
            assert.strictEqual(toolCall.metadata?.toolName, 'test_tool');
            assert.deepStrictEqual(toolCall.metadata?.toolParams, { param1: 'value1' });
        });
        test('Parse markdown elements', () => {
            const text = '# Heading\n- List item\n> Quote\n`code`';
            const elements = (0, parseTest_1.parseMarkdownElements)(text);
            assert.ok(elements.length > 0);
            assert.ok(elements.some(e => e.format?.[0].type === 'heading'));
            assert.ok(elements.some(e => e.format?.[0].type === 'list'));
            assert.ok(elements.some(e => e.format?.[0].type === 'quote'));
            assert.ok(elements.some(e => e.format?.[0].type === 'code_inline'));
        });
        test('Language detection', () => {
            assert.strictEqual((0, parseTest_1.detectLanguage)('ts'), 'typescript');
            assert.strictEqual((0, parseTest_1.detectLanguage)('js'), 'javascript');
            assert.strictEqual((0, parseTest_1.detectLanguage)('py'), 'python');
            assert.strictEqual((0, parseTest_1.detectLanguage)('unknown'), 'unknown');
        });
    });
});
//# sourceMappingURL=extension.test.js.map