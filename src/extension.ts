import * as vscode from 'vscode';
import * as path from 'path';
import { ExportOptions } from './types';
import { showStatus, getDefaultOutputPath, log } from './utils';
import {
    getConversationFromDB as getConversation,
    getAllConversations,
    saveExportFile
} from './storage';
import { convertToMarkdown } from './markdown';
import { t } from './i18n';
import { ConversationData, DatabaseRow } from './types';

// Show export configuration panel
async function showExportPanel(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'cursorExport',
        t('exportPanelTitle'),
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    // Set HTML content
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
                <h3>${t('exportPanelHeading')}</h3>
                <p>${t('exportPanelSubheading')}</p>
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

    // Handle messages
    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'selectLocation':
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: t('selectOutputPath'),
                    title: t('selectSaveLocation')
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

// Export all conversations
async function exportAllConversations(folderUri: vscode.Uri) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('exportStarted'),
            cancellable: true
        }, async (progress, token) => {
            // Get all conversations
            const conversations = await getAllConversations();
            if (!conversations || conversations.length === 0) {
                throw new Error(t('noConversation'));
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
                    message: t('exportingProgress').replace('{0}', (i + 1).toString()).replace('{1}', conversations.length.toString()),
                    increment: (100 / conversations.length)
                });

                // Convert to markdown
                const markdown = convertToMarkdown(conversation);
                
                // Generate filename
                const fileName = `${conversation.metadata?.name || t('unnamedConversation')}_${conversation.id}.md`
                    .replace(/[<>:"/\\|?*]/g, '_');

                // Write file
                const fileUri = vscode.Uri.file(path.join(exportFolderUri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(
                    fileUri,
                    Buffer.from(markdown, 'utf8')
                );
            }

            // Show success message
            const openFolder = t('openFolderButton');
            const result = await vscode.window.showInformationMessage(
                `${t('exportSuccess')} ${exportFolderUri.fsPath}`,
                openFolder
            );

            if (result === openFolder) {
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

// Export conversation
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

// Activate extension
export function activate(context: vscode.ExtensionContext) {
    // Register export command
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-export.exportHistory', () => exportConversation(context))
    );

    // Add status bar button
    const exportButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    exportButton.text = t('exportButtonText');
    exportButton.command = 'cursor-export.exportHistory';
    exportButton.tooltip = t('exportButtonTooltip');
    exportButton.show();
    context.subscriptions.push(exportButton);
}

// Deactivate extension
export function deactivate() {
    // Clean up resources
}