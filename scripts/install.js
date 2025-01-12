const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Import translations
const { t } = require('./i18n');

// Check if Cursor is installed
function checkCursorInstallation() {
    console.log(t('checkingCursor'));
    const platform = process.platform;
    let cursorPath;

    switch (platform) {
        case 'win32':
            cursorPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cursor', 'Cursor.exe');
            break;
        case 'darwin':
            cursorPath = '/Applications/Cursor.app';
            break;
        case 'linux':
            cursorPath = '/usr/share/cursor/cursor';
            break;
        default:
            throw new Error(t('unsupportedOS').replace('{0}', platform));
    }

    if (!fs.existsSync(cursorPath)) {
        throw new Error(t('cursorNotFound'));
    }
    console.log(t('cursorDetected'));
}

// Check dependencies
function checkDependencies() {
    console.log(t('checkingDeps'));
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        console.log(t('verifyingModules'));
        if (!fs.existsSync('node_modules')) {
            console.log(t('modulesNotFound'));
            execSync('npm install', { stdio: 'inherit' });
        }
        
        console.log(t('depsCheckComplete'));
    } catch (error) {
        throw new Error(t('depsCheckFailed').replace('{0}', error.message));
    }
}

// Get Cursor extensions path
function getCursorExtensionsPath() {
    const homedir = os.homedir();
    let extensionsPath;
    
    switch (process.platform) {
        case 'win32':
            extensionsPath = path.join(homedir, 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app', 'extensions');
            break;
        case 'darwin':
            extensionsPath = path.join('/Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'extensions');
            break;
        case 'linux':
            extensionsPath = path.join('/usr', 'share', 'cursor', 'resources', 'app', 'extensions');
            break;
        default:
            throw new Error(t('unsupportedOS').replace('{0}', process.platform));
    }

    if (!fs.existsSync(extensionsPath)) {
        try {
            fs.mkdirSync(extensionsPath, { recursive: true });
        } catch (error) {
            throw new Error(t('depsCheckFailed').replace('{0}', error.message));
        }
    }

    return extensionsPath;
}

// Create backup
function createBackup(targetDir) {
    if (fs.existsSync(targetDir)) {
        const backupDir = `${targetDir}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        console.log(t('creatingBackup').replace('{0}', backupDir));
        fs.cpSync(targetDir, backupDir, { recursive: true });
        return backupDir;
    }
    return null;
}

// Copy directory
function copyDir(sourceDir, targetDir) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        if (fs.statSync(sourcePath).isDirectory()) {
            copyDir(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

// Copy extension files
function copyExtensionFiles(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        throw new Error(t('copyFailed').replace('{0}', sourceDir).replace('{1}', 'Source directory does not exist'));
    }

    createExtensionDir(targetDir);

    const necessaryFiles = [
        'package.json',
        'node_modules',
        'out'
    ];

    let copiedFiles = 0;
    for (const item of necessaryFiles) {
        const sourcePath = path.join(sourceDir, item);
        const targetPath = path.join(targetDir, item);
        
        if (!fs.existsSync(sourcePath)) {
            console.warn(`Warning: ${item} does not exist at ${sourcePath}`);
            continue;
        }

        try {
            if (fs.statSync(sourcePath).isDirectory()) {
                console.log(t('copyingDir').replace('{0}', item));
                copyDir(sourcePath, targetPath);
            } else {
                console.log(t('copyingFile').replace('{0}', item));
                fs.copyFileSync(sourcePath, targetPath);
            }
            copiedFiles++;
            console.log(t('copySuccess').replace('{0}', item));
        } catch (error) {
            throw new Error(t('copyFailed').replace('{0}', item).replace('{1}', error.message));
        }
    }

    if (copiedFiles === 0) {
        throw new Error(t('nothingCopied'));
    }

    // Verify installation
    console.log('\n' + t('verifyingInstall'));
    for (const item of necessaryFiles) {
        const targetPath = path.join(targetDir, item);
        if (!fs.existsSync(targetPath)) {
            throw new Error(t('verifyFailed').replace('{0}', item));
        }
        console.log(t('verifySuccess').replace('{0}', item));
    }
}

// Create extension directory
function createExtensionDir(extensionPath) {
    if (!fs.existsSync(extensionPath)) {
        fs.mkdirSync(extensionPath, { recursive: true });
    }
}

// Main installation function
async function installExtension() {
    try {
        console.log(t('installStart') + '\n');

        // Check Cursor installation
        checkCursorInstallation();

        // Check dependencies
        checkDependencies();

        // Get extension directory
        const extensionsPath = getCursorExtensionsPath();
        console.log('Cursor extensions directory:', extensionsPath);

        // Get package.json
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const extensionId = `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`;
        const targetDir = path.join(extensionsPath, extensionId);
        console.log('Target installation directory:', targetDir);

        // Create backup
        let backupDir = null;
        if (fs.existsSync(targetDir)) {
            backupDir = createBackup(targetDir);
            console.log('Removing existing installation...');
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        // Compile TypeScript
        console.log('\nCompiling TypeScript...');
        execSync('npm run compile', { stdio: 'inherit' });

        // Copy files
        console.log('\nCopying extension files...');
        const sourceDir = path.join(__dirname, '..');
        copyExtensionFiles(sourceDir, targetDir);

        console.log('\n' + t('installComplete'));
        console.log(t('extensionInstalled').replace('{0}', targetDir));
        if (backupDir) {
            console.log(t('backupCreated').replace('{0}', backupDir));
        }
        console.log('\n' + t('restartRequired'));
    } catch (error) {
        console.error('\n' + t('installFailed').replace('{0}', error.message));
        process.exit(1);
    }
}

// Run installation
installExtension(); 