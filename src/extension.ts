import * as vscode from 'vscode';
import * as path from 'path';
import { ExportOptions } from './types';
import { showStatus, getDefaultOutputPath, log } from './utils';
import { getConversation, saveExportFile, getAllConversations } from './storage';
import { convertToMarkdown } from './markdown';
import { t } from './i18n';

// 显示导出配置面板
async function showExportPanel(extensionContext: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'cursorExport',
        t('exportDialogTitle'),
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
                <h3>${t('exportDialogDescription')}</h3>
            </div>
            <div class="form-group">
                <button id="exportButton">${t('selectLocationButton')}</button>
                <button id="cancelButton">${t('cancelButton')}</button>
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
                    openLabel: t('selectLocationButton'),
                    title: t('exportDialogTitle')
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
            title: t('exportStarted'),
            cancellable: true
        }, async (progress, token) => {
            const conversations = await getAllConversations();
            if (!conversations || conversations.length === 0) {
                throw new Error(t('noConversation'));
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportFolderName = `cursor-chat-export-${timestamp}`;
            const exportFolderUri = vscode.Uri.file(path.join(folderUri.fsPath, exportFolderName));
            await vscode.workspace.fs.createDirectory(exportFolderUri);

            for (let i = 0; i < conversations.length; i++) {
                const conversation = conversations[i];
                
                progress.report({ 
                    message: t('exportProgress', i + 1, conversations.length),
                    increment: (100 / conversations.length)
                });

                const markdown = convertToMarkdown(conversation);
                const fileName = `${conversation.metadata?.name || t('untitledConversation')}_${conversation.id}.md`
                    .replace(/[<>:"/\\|?*]/g, '_');

                const fileUri = vscode.Uri.file(path.join(exportFolderUri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(
                    fileUri,
                    Buffer.from(markdown, 'utf8')
                );
            }

            const result = await vscode.window.showInformationMessage(
                `${t('exportSuccess')} ${exportFolderUri.fsPath}`,
                t('openFolder')
            );

            if (result === t('openFolder')) {
                await vscode.commands.executeCommand('revealFileInOS', exportFolderUri);
            }
        });
    } catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            log(`${t('exportFailed')}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${t('exportFailed')}${error.message}`);
        }
    }
}

// 导出对话
async function exportConversation(context: vscode.ExtensionContext) {
    try {
        await showExportPanel(context);
    } catch (error) {
        if (error instanceof Error && error.message !== 'cancelled') {
            log(`${t('exportFailed')}${error.message}`, 'error');
            vscode.window.showErrorMessage(`${t('exportFailed')}${error.message}`);
        }
    }
}

// 激活插件
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-export.exportHistory', () => exportConversation(context))
    );

    const exportButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    exportButton.text = t('statusBarText');
    exportButton.command = 'cursor-export.exportHistory';
    exportButton.tooltip = t('statusBarTooltip');
    exportButton.show();
    context.subscriptions.push(exportButton);
}

// 停用插件
export function deactivate() {
    // 清理资源
}