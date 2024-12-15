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
exports.ConversationPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const markdown_1 = require("../markdown");
const utils_1 = require("../utils");
const storage_1 = require("../storage");
class ConversationPanel {
    constructor(panel, extensionPath) {
        this._disposables = [];
        this._conversations = [];
        this._isLoading = false;
        this._panel = panel;
        // 设置webview内容
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionPath);
        // 监听webview面板关闭
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        // 处理webview中的消息
        this._panel.webview.onDidReceiveMessage(async (message) => {
            if (this._isLoading) {
                vscode.window.showInformationMessage(utils_1.messages.operationInProgress);
                return;
            }
            try {
                switch (message.command) {
                    case 'export':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: utils_1.messages.selectOutputPath,
                            title: utils_1.messages.selectSaveLocation
                        });
                        if (folderUri && folderUri[0]) {
                            await this.exportAllConversations(folderUri[0]);
                        }
                        break;
                    case 'refresh':
                        await this.updateContent();
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            }
            catch (error) {
                (0, utils_1.log)(`处理webview消息失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
                vscode.window.showErrorMessage(utils_1.messages.databaseError);
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionPath) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (ConversationPanel.currentPanel) {
            ConversationPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('cursorConversation', 'Cursor Conversations Export', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(extensionPath, 'webview'))
            ]
        });
        ConversationPanel.currentPanel = new ConversationPanel(panel, extensionPath);
        ConversationPanel.currentPanel.updateContent();
    }
    async updateContent(conversation) {
        if (this._isLoading) {
            return;
        }
        this._isLoading = true;
        let db = null;
        try {
            // 显示加载状态
            this._panel.webview.postMessage({
                command: 'setLoading',
                loading: true
            });
            if (conversation) {
                // If conversation is provided, use it directly
                this._conversations = [conversation];
            }
            else {
                // Otherwise fetch conversations from database
                // 获取所有数据库文件
                const dbFiles = await (0, storage_1.findVSCDBFiles)();
                if (dbFiles.length === 0) {
                    throw new Error(utils_1.messages.cursorStorageNotFound);
                }
                // 获取所有活动对话
                this._conversations = [];
                let processedCount = 0;
                const totalDbs = dbFiles.length;
                for (const dbPath of dbFiles) {
                    try {
                        // 使用数据库连接
                        db = await (0, storage_1.openDatabase)('global');
                        const activeConvs = await (0, storage_1.findActiveConversations)(db);
                        // 更新进度
                        processedCount++;
                        this._panel.webview.postMessage({
                            command: 'updateProgress',
                            current: processedCount,
                            total: totalDbs,
                            message: `正在处理数据库 ${processedCount}/${totalDbs}`
                        });
                        // 获取对话数据
                        for (const conv of activeConvs) {
                            const conversation = await (0, storage_1.getConversation)(conv.conversationId);
                            if (conversation) {
                                this._conversations.push(conversation);
                            }
                        }
                    }
                    catch (err) {
                        (0, utils_1.log)(`处理数据库失败 ${dbPath}: ${err instanceof Error ? err.message : String(err)}`, 'error');
                        vscode.window.showWarningMessage(`处理数据库失败: ${dbPath}`);
                    }
                    finally {
                        // 确保关闭数据库连接
                        if (db) {
                            await (0, storage_1.closeDatabase)('global');
                            db = null;
                        }
                    }
                }
            }
            // 更新UI
            this._panel.webview.postMessage({
                command: 'update',
                conversations: this._conversations.map(conv => ({
                    id: conv.id,
                    name: conv.metadata?.name || '未命名对话',
                    timestamp: conv.metadata?.lastUpdatedAt || Date.now(),
                    messageCount: conv.messages.length,
                    mode: conv.metadata?.mode || 'normal',
                    hasError: conv.metadata?.status.hasError || false
                }))
            });
        }
        catch (error) {
            (0, utils_1.log)(`更新内容失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
            vscode.window.showErrorMessage(utils_1.messages.databaseError + ': ' + (error instanceof Error ? error.message : String(error)));
        }
        finally {
            // 隐藏加载状态
            this._panel.webview.postMessage({
                command: 'setLoading',
                loading: false
            });
            this._isLoading = false;
            // 确保数据库连接被关闭
            if (db) {
                try {
                    await (0, storage_1.closeDatabase)('global');
                }
                catch (err) {
                    (0, utils_1.log)(`关闭数据库连接失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
            }
        }
    }
    _getWebviewContent(webview, extensionPath) {
        try {
            const htmlPath = path.join(extensionPath, 'webview', 'index.html');
            let html = require('fs').readFileSync(htmlPath, 'utf8');
            // 替换 CSS 和 JavaScript 文件路径
            const cssPath = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'webview', 'styles.css')));
            const scriptPath = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'webview', 'main.js')));
            html = html.replace('${cssPath}', cssPath.toString());
            html = html.replace('${scriptPath}', scriptPath.toString());
            return html;
        }
        catch (error) {
            (0, utils_1.log)(`加载webview内容失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
            throw error;
        }
    }
    async exportAllConversations(folderUri) {
        if (this._isLoading) {
            return;
        }
        this._isLoading = true;
        try {
            if (this._conversations.length === 0) {
                throw new Error(utils_1.messages.noConversation);
            }
            // 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: utils_1.messages.exportStarted,
                cancellable: true
            }, async (progress, token) => {
                const total = this._conversations.length;
                let current = 0;
                const failed = [];
                for (const conversation of this._conversations) {
                    // 检查是否取消
                    if (token.isCancellationRequested) {
                        throw new Error(utils_1.messages.exportCancelled);
                    }
                    try {
                        const name = conversation.metadata?.name || '未命名对话';
                        progress.report({
                            message: `(${current + 1}/${total}) ${name}`,
                            increment: (100 / total)
                        });
                        // 更新UI进度
                        this._panel.webview.postMessage({
                            command: 'updateExportProgress',
                            current: current + 1,
                            total,
                            currentName: name
                        });
                        // 转换为 Markdown
                        const markdown = (0, markdown_1.convertToMarkdown)(conversation);
                        // 生成文件名
                        const fileName = `${name}_${conversation.id}.md`
                            .replace(/[<>:"/\\|?*]/g, '_'); // 替换非法字符
                        // 写入文件
                        const fileUri = vscode.Uri.file(path.join(folderUri.fsPath, fileName));
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(markdown, 'utf8'));
                        current++;
                    }
                    catch (err) {
                        (0, utils_1.log)(`导出对话失败 ${conversation.id}: ${err instanceof Error ? err.message : String(err)}`, 'error');
                        failed.push(conversation.metadata?.name || conversation.id);
                        // 继续处理下一个对话
                    }
                }
                // 如果有失败的对话，显示警告
                if (failed.length > 0) {
                    vscode.window.showWarningMessage(`${utils_1.messages.exportPartialSuccess}\n${utils_1.messages.failedConversations}: ${failed.join(', ')}`);
                }
            });
            // 显示成功消息
            const openFolder = utils_1.messages.openFolder;
            const result = await vscode.window.showInformationMessage(`${utils_1.messages.exportSuccess} ${folderUri.fsPath}`, openFolder);
            if (result === openFolder) {
                await vscode.commands.executeCommand('revealFileInOS', folderUri);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message === utils_1.messages.exportCancelled) {
                vscode.window.showInformationMessage(utils_1.messages.exportCancelled);
            }
            else {
                (0, utils_1.log)(`导出失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
                vscode.window.showErrorMessage(utils_1.messages.exportFailed + (error instanceof Error ? error.message : String(error)));
            }
        }
        finally {
            // 重置导出进度
            this._panel.webview.postMessage({
                command: 'resetExportProgress'
            });
            this._isLoading = false;
        }
    }
    dispose() {
        ConversationPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
exports.ConversationPanel = ConversationPanel;
//# sourceMappingURL=panel.js.map