const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 检查Cursor是否已安装
function checkCursorInstallation() {
    console.log('检查Cursor安装...');
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
            throw new Error(`不支持的操作系统: ${platform}`);
    }

    if (!fs.existsSync(cursorPath)) {
        throw new Error('未检测到Cursor安装。请先安装Cursor IDE。');
    }
    console.log('✓ 已检测到Cursor安装');
}

// 检查依赖
function checkDependencies() {
    console.log('检查依赖...');
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        console.log('验证node_modules...');
        if (!fs.existsSync('node_modules')) {
            console.log('未找到node_modules，正在安装依赖...');
            execSync('npm install', { stdio: 'inherit' });
        }
        
        console.log('✓ 依赖检查完成');
    } catch (error) {
        throw new Error(`依赖检查失败: ${error.message}`);
    }
}

// 获取Cursor扩展目录
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
            throw new Error('不支持的操作系统');
    }

    if (!fs.existsSync(extensionsPath)) {
        try {
            fs.mkdirSync(extensionsPath, { recursive: true });
        } catch (error) {
            throw new Error(`创建扩展目录失败: ${error.message}`);
        }
    }

    return extensionsPath;
}

// 创建备份
function createBackup(targetDir) {
    if (fs.existsSync(targetDir)) {
        const backupDir = `${targetDir}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        console.log(`创建备份: ${backupDir}`);
        fs.cpSync(targetDir, backupDir, { recursive: true });
        return backupDir;
    }
    return null;
}

// 复制目录
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

// 复制扩展文件
function copyExtensionFiles(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`源目录不存在: ${sourceDir}`);
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
            console.warn(`警告: 文件或目录不存在: ${sourcePath}`);
            continue;
        }

        try {
            if (fs.statSync(sourcePath).isDirectory()) {
                console.log(`复制目录: ${item}`);
                copyDir(sourcePath, targetPath);
            } else {
                console.log(`复制文件: ${item}`);
                fs.copyFileSync(sourcePath, targetPath);
            }
            copiedFiles++;
            console.log(`✓ ${item} 复制成功`);
        } catch (error) {
            throw new Error(`复制 ${item} 失败: ${error.message}`);
        }
    }

    if (copiedFiles === 0) {
        throw new Error('没有复制任何文件');
    }

    // 验证安装
    console.log('\n验证安装...');
    for (const item of necessaryFiles) {
        const targetPath = path.join(targetDir, item);
        if (!fs.existsSync(targetPath)) {
            throw new Error(`验证失败: ${item} 未正确安装`);
        }
        console.log(`✓ ${item} 已正确安装`);
    }
}

// 创建扩展目录
function createExtensionDir(extensionPath) {
    if (!fs.existsSync(extensionPath)) {
        fs.mkdirSync(extensionPath, { recursive: true });
    }
}

// 主安装函数
async function installExtension() {
    try {
        console.log('=== 开始安装扩展 ===\n');

        // 检查Cursor安装
        checkCursorInstallation();

        // 检查依赖
        checkDependencies();

        // 获取扩展目录
        const extensionsPath = getCursorExtensionsPath();
        console.log(`Cursor扩展目录: ${extensionsPath}`);

        // 获取package.json
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const extensionId = `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`;
        const targetDir = path.join(extensionsPath, extensionId);
        console.log(`目标安装目录: ${targetDir}`);

        // 创建备份
        let backupDir = null;
        if (fs.existsSync(targetDir)) {
            backupDir = createBackup(targetDir);
            console.log('删除已存在的安装...');
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        // 编译TypeScript
        console.log('\n编译TypeScript...');
        execSync('npm run compile', { stdio: 'inherit' });

        // 复制文件
        console.log('\n复制扩展文件...');
        const sourceDir = path.join(__dirname, '..');
        copyExtensionFiles(sourceDir, targetDir);

        console.log('\n=== 安装完成！===');
        console.log(`扩展已安装到: ${targetDir}`);
        if (backupDir) {
            console.log(`备份已创建: ${backupDir}`);
        }
        console.log('\n请重启Cursor IDE以启用扩展。');
    } catch (error) {
        console.error('\n安装失败:', error.message);
        process.exit(1);
    }
}

// 运行安装
installExtension(); 