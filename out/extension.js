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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const storage_1 = require("./storage");
const markdown_1 = require("./markdown");
// 显示导出配置面板
async function showExportPanel(extensionContext) {
    // 创建webview面板
    const panel = vscode.window.createWebviewPanel('cursorExport', '导出对话设置', vscode.ViewColumn.One, {
        enableScripts: true
    });
    // 设置HTML内容
    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .form-group {
                    margin-bottom: 20px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    margin-right: 10px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="form-group">
                <h3>即将导出所有工作区的对话记录</h3>
                <p>请选择保存位置</p>
            </div>
            <div class="form-group">
                <button id="exportButton">选择导出位置</button>
                <button id="cancelButton">取消</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('exportButton').addEventListener('click', () => {
                    vscode.postMessage({ command: 'selectLocation' });
                });

                document.getElementById('cancelButton').addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });
            </script>
        </body>
        </html>
    `;
    // 处理消息
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'selectLocation':
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: utils_1.messages.selectOutputPath,
                    title: utils_1.messages.selectSaveLocation
                });
                if (folderUri && folderUri[0]) {
                    panel.dispose();
                    await exportAllConversations(folderUri[0]);
                }
                break;
            case 'cancel':
                panel.dispose();
                break;
        }
    });
}
// 导出所有对话
async function exportAllConversations(folderUri) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: utils_1.messages.exportStarted,
            cancellable: true
        }, async (progress, token) => {
            // Get all conversations
            const conversations = await (0, storage_1.getAllConversations)();
            if (!conversations || conversations.length === 0) {
                throw new Error(utils_1.messages.noConversation);
            }
            // Create a folder for exports
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportFolderName = `cursor-chat-export-${timestamp}`;
            const exportFolderUri = vscode.Uri.file(path.join(folderUri.fsPath, exportFolderName));
            await vscode.workspace.fs.createDirectory(exportFolderUri);
            // Export each conversation
            for (let i = 0; i < conversations.length; i++) {
                const conversation = conversations[i];
                // Update progress
                progress.report({
                    message: `Exporting conversation ${i + 1} of ${conversations.length}`,
                    increment: (100 / conversations.length)
                });
                // Convert to markdown
                const markdown = (0, markdown_1.convertToMarkdown)(conversation);
                // Generate filename
                const fileName = `${conversation.metadata?.name || '未命名对话'}_${conversation.id}.md`
                    .replace(/[<>:"/\\|?*]/g, '_');
                // Write file
                const fileUri = vscode.Uri.file(path.join(exportFolderUri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(markdown, 'utf8'));
            }
            // Show success message
            const openFolder = utils_1.messages.openFolder;
            const result = await vscode.window.showInformationMessage(`${utils_1.messages.exportSuccess} ${exportFolderUri.fsPath}`, openFolder);
            if (result === openFolder) {
                await vscode.commands.executeCommand('revealFileInOS', exportFolderUri);
            }
        });
    }
    catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            (0, utils_1.log)(`${utils_1.messages.exportFailed}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${utils_1.messages.exportFailed}${error.message}`);
        }
    }
}
// 导出对话
async function exportConversation(context) {
    try {
        await showExportPanel(context);
    }
    catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            (0, utils_1.log)(`${utils_1.messages.exportFailed}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${utils_1.messages.exportFailed}${error.message}`);
        }
    }
}
// 激活插件
function activate(context) {
    // 注册导出命令
    context.subscriptions.push(vscode.commands.registerCommand('cursor-export.exportHistory', () => exportConversation(context)));
    // 添加状态栏按钮
    const exportButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    exportButton.text = "$(export) 导出所有对话";
    exportButton.command = 'cursor-export.exportHistory';
    exportButton.tooltip = '导出所有工作区的对话记录';
    exportButton.show();
    context.subscriptions.push(exportButton);
}
// 停用插件
function deactivate() {
    // 清理资源
}
//# sourceMappingURL=extension.js.map