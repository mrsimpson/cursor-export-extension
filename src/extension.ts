import * as vscode from 'vscode';
import * as path from 'path';
import { ExportOptions } from './types';
import { messages, showStatus, getDefaultOutputPath, log } from './utils';
import { getConversation, saveExportFile, getAllConversations } from './storage';
import { convertToMarkdown } from './markdown';

// 显示导出配置面板
async function showExportPanel(extensionContext: vscode.ExtensionContext): Promise<void> {
    // 创建webview面板
    const panel = vscode.window.createWebviewPanel(
        'cursorExport',
        '导出对话设置',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

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
    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'selectLocation':
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: messages.selectOutputPath,
                    title: messages.selectSaveLocation
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
async function exportAllConversations(folderUri: vscode.Uri) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: messages.exportStarted,
            cancellable: true
        }, async (progress, token) => {
            // Get all conversations
            const conversations = await getAllConversations();
            if (!conversations || conversations.length === 0) {
                throw new Error(messages.noConversation);
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
                const markdown = convertToMarkdown(conversation);
                
                // Generate filename
                const fileName = `${conversation.metadata?.name || '未命名对话'}_${conversation.id}.md`
                    .replace(/[<>:"/\\|?*]/g, '_');

                // Write file
                const fileUri = vscode.Uri.file(path.join(exportFolderUri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(
                    fileUri,
                    Buffer.from(markdown, 'utf8')
                );
            }

            // Show success message
            const openFolder = messages.openFolder;
            const result = await vscode.window.showInformationMessage(
                `${messages.exportSuccess} ${exportFolderUri.fsPath}`,
                openFolder
            );

            if (result === openFolder) {
                await vscode.commands.executeCommand('revealFileInOS', exportFolderUri);
            }
        });
    } catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            log(`${messages.exportFailed}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${messages.exportFailed}${error.message}`);
        }
    }
}

// 导出对话
async function exportConversation(context: vscode.ExtensionContext) {
    try {
        await showExportPanel(context);
    } catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            log(`${messages.exportFailed}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${messages.exportFailed}${error.message}`);
        }
    }
}

// 激活插件
export function activate(context: vscode.ExtensionContext) {
    // 注册导出命令
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-export.exportHistory', () => exportConversation(context))
    );

    // 添加状态栏按钮
    const exportButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    exportButton.text = "$(export) 导出所有对话";
    exportButton.command = 'cursor-export.exportHistory';
    exportButton.tooltip = '导出所有工作区的对话记录';
    exportButton.show();
    context.subscriptions.push(exportButton);
}

// 停用插件
export function deactivate() {
    // 清理资源
}