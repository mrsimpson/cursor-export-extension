export interface Translations {
    // UI Elements
    exportButtonText: string;
    exportButtonTooltip: string;
    exportPanelTitle: string;
    exportPanelHeading: string;
    exportPanelSubheading: string;
    selectLocationButton: string;
    cancelButton: string;
    openFolderButton: string;

    // Messages
    selectOutputPath: string;
    selectSaveLocation: string;
    exportStarted: string;
    noConversation: string;
    exportSuccess: string;
    exportFailed: string;
    exportingProgress: string;
    unnamedConversation: string;

    // Installation
    checkingCursor: string;
    cursorDetected: string;
    unsupportedOS: string;
    cursorNotFound: string;
    checkingDeps: string;
    verifyingModules: string;
    modulesNotFound: string;
    depsCheckComplete: string;
    depsCheckFailed: string;
    creatingBackup: string;
    copyingDir: string;
    copyingFile: string;
    copySuccess: string;
    copyFailed: string;
    nothingCopied: string;
    verifyingInstall: string;
    verifyFailed: string;
    verifySuccess: string;
    installStart: string;
    installComplete: string;
    extensionInstalled: string;
    backupCreated: string;
    restartRequired: string;
    installFailed: string;

    // Markdown Export
    conversationInfo: string;
    createdAt: string;
    lastUpdated: string;
    modeAI: string;
    modeNormal: string;
    workspace: string;
    intent: string;
    confidence: string;
    keywords: string;
    tags: string;
    statistics: string;
    totalMessages: string;
    userMessages: string;
    assistantMessages: string;
    conversationContent: string;
    userRole: string;
    assistantRole: string;
    thinkingProcess: string;
    codeBlock: string;
    executionResult: string;
    intermediateOutput: string;
    intermediateOutputNum: string;

    // Tool Descriptions
    toolReadFile: string;
    toolEditFile: string;
    toolListDir: string;
    toolCodebaseSearch: string;
    toolGrepSearch: string;
    toolFileSearch: string;
    toolRunCommand: string;
    toolDeleteFile: string;
    toolGeneric: string;
    conversationMode: string;

    // Utils Messages
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
    defaultExportPath: string;
    testOutputDir: string;
    cursorExportDir: string;
    logPrefix: string;

    // Duration Formatting
    durationMilliseconds: string;
    durationSeconds: string;
    durationMinutesSeconds: string;
    durationHoursMinutes: string;

    // File Operations
    fileExists: string;
    directoryExists: string;
    fileNotFound: string;
    directoryNotFound: string;
    accessDenied: string;
    invalidPath: string;

    // Additional Export Messages
    noConversationFound: string;
    processing: string;
    converting: string;
    saving: string;
    noWorkspace: string;
    cursorStorageNotFound: string;
    workspaceNotFound: string;
    historyNotFound: string;
    saveSuccess: string;
    selectMetadata: string;
    configureExport: string;
    noActiveConversation: string;
    invalidConversation: string;
    accessDeniedStorage: string;
    databaseError: string;
    parseError: string;
    writeError: string;
    exportCompleted: string;
    openFile: string;
    overwritePrompt: string;
    yes: string;
    no: string;
    retry: string;
    ignore: string;
    operationInProgress: string;
    exportCancelled: string;
    exportPartialSuccess: string;
    failedConversations: string;
} 