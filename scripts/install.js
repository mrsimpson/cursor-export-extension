const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// // Import translations
// const { t } = require('../out/i18n');

// Check if Cursor is installed
function checkCursorInstallation() {
    console.log('checkingCursor');
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
            throw new Error('unsupportedOS');
    }

    if (!fs.existsSync(cursorPath)) {
        throw new Error('cursorNotFound');
    }
    console.log('cursorDetected');
}

// Check dependencies
function checkDependencies() {
    console.log('checkingDeps');
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        console.log('verifyingModules');
        if (!fs.existsSync('node_modules')) {
            console.log('modulesNotFound');
            execSync('npm install', { stdio: 'inherit' });
        }

        console.log('depsCheckComplete');
    } catch (error) {
        throw new Error('depsCheckFailed');
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
            throw new Error('unsupportedOS');
    }

    if (!fs.existsSync(extensionsPath)) {
        try {
            fs.mkdirSync(extensionsPath, { recursive: true });
        } catch (error) {
            throw new Error('depsCheckFailed');
        }
    }

    return extensionsPath;
}

// Create backup
function createBackup(targetDir) {
    if (fs.existsSync(targetDir)) {
        const backupDir = `${targetDir}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        console.log('creatingBackup');
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

// install production dependencies in target directory
function installProductionDependencies(targetDir) {
    // Copy package.json to target directory
    fs.copyFileSync(
        path.join(__dirname, '..', 'package.json'),
        path.join(targetDir, 'package.json')
    );

    // Install only production dependencies
    execSync('npm install --omit=dev', {
        cwd: targetDir,
        stdio: 'inherit'
    });
}

// Modify the copyExtensionFiles function
function copyExtensionFiles(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        throw new Error('copyFailed');
    }

    createExtensionDir(targetDir);

    const necessaryFiles = [
        'package.json',
        'out',
        'scripts'
        // don't copy node modules but install production dependencies
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
                console.log('copyingDir');
                copyDir(sourcePath, targetPath);
            } else {
                console.log('copyingFile');
                fs.copyFileSync(sourcePath, targetPath);
            }
            copiedFiles++;
            console.log('copySuccess');
        } catch (error) {
            throw new Error('copyFailed');
        }
    }

    if (copiedFiles === 0) {
        throw new Error('nothingCopied');
    }

    // Install production dependencies
    installProductionDependencies(targetDir);

    // Verify installation
    console.log('\n' + 'verifyingInstall');
    for (const item of necessaryFiles) {
        const targetPath = path.join(targetDir, item);
        if (!fs.existsSync(targetPath)) {
            throw new Error('verifyFailed');
        }
        console.log('verifySuccess');
    }
}

// Create extension directory
function createExtensionDir(extensionPath) {
    if (!fs.existsSync(extensionPath)) {
        fs.mkdirSync(extensionPath, { recursive: true });
    }
}

// Add new function for quick reinstall
function quickReinstall(targetDir) {
    console.log('\n' + 'quickReinstallStart');

    // Only copy the 'out' directory
    const sourceOutDir = path.join(__dirname, '..', 'out');
    const targetOutDir = path.join(targetDir, 'out');

    try {
        // Remove existing out directory
        if (fs.existsSync(targetOutDir)) {
            fs.rmSync(targetOutDir, { recursive: true, force: true });
        }

        // Copy new out directory
        fs.mkdirSync(targetOutDir, { recursive: true });
        copyDir(sourceOutDir, targetOutDir);

        console.log('quickReinstallComplete');
    } catch (error) {
        throw new Error('quickReinstallFailed');
    }
}

// Modify main installation function to accept quick install flag
async function installExtension(quickInstall = false) {
    console.log('installStart');

    // Check Cursor installation
    checkCursorInstallation();

    // Get extension directory
    const extensionsPath = getCursorExtensionsPath();
    console.log('Cursor extensions directory:', extensionsPath);

    // Get package.json
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const extensionId = `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`;
    const targetDir = path.join(extensionsPath, extensionId);

    if (quickInstall) {
        // Compile TypeScript
        console.log('\nCompiling TypeScript...');
        execSync('npm run compile', { stdio: 'inherit' });

        // Quick reinstall
        quickReinstall(targetDir);
    } else {
        // Full installation process
        // Check dependencies
        checkDependencies();

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

        console.log('\n' + 'installComplete');
        if (backupDir) {
            console.log('backupCreated');
        }
    }

    console.log('\n' + 'restartRequired');
    console.error('\n' + 'installFailed');
    process.exit(1);
}

// Add command line argument parsing
const args = process.argv.slice(2);
const quickInstall = args.includes('--quick') || args.includes('-q');

// Run installation with quick flag
installExtension(quickInstall); 