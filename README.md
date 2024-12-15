# Cursor Composer Export 对话记录导出

<div align="center">

![Logo](assets/ix10tn-logo.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README_en.md) | [简体中文](README.md)

将 Cursor Composer 对话记录导出为 Markdown 文档，完整保留思考块和助手代码片段。

</div>

## ✨ 功能特点

- 📝 导出对话记录为 Markdown 格式
- 💭 保留思考块和助手代码片段
- 🔄 保持对话上下文和格式
- 📂 自定义导出路径

![导出预览](assets/export-demo.png)

## 🚀 安装说明

### 环境要求

- Node.js 14.x 或更高版本
- Cursor IDE
- 管理员权限（用于安装）

### 安装步骤

1. 克隆仓库
2. 安装依赖：
   ```bash
   npm install
   ```

![环境配置](assets/env-demo.png)

3. 安装扩展：
   ```bash
   npm run install-extension
   ```
4. 重启 Cursor IDE

![安装过程](assets/install-demo.png)

### 安装路径

扩展将被安装到：

**Windows**

```powershell
%LOCALAPPDATA%\Programs\cursor\resources\app\extensions\cursor-tools.cursor-export-extension-0.0.1\
```

**macOS**

```bash
/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-tools.cursor-export-extension-0.0.1/
```

**Linux**

```bash
/usr/share/cursor/resources/app/extensions/cursor-tools.cursor-export-extension-0.0.1/
```

## 💫 使用方法

1. 打开 Cursor IDE
2. 点击状态栏（右下角）的"导出所有对话"按钮
3. 选择保存位置
4. 点击导出

![导出界面](assets/export-ui-demo.png)

导出过程中可以在控制台查看详细日志：

![导出日志](assets/export-log-demo.png)

## 🛠️ 开发调试

### 构建

```bash
# 安装依赖
npm install

# 安装扩展
npm run install-extension

# 编译 TypeScript
npm run compile

# 开发监视模式
npm run watch
```

### 调试

1. 打开 Cursor IDE 开发者工具（Ctrl+Shift+I）
2. 切换到 Console 标签页
3. 查看扩展运行日志和错误信息

### 手动安装

```bash
# Windows (PowerShell 管理员)
.\scripts\install.ps1

# Unix
npm run install-extension
```

### 卸载

```bash
# Windows (PowerShell 管理员)
.\scripts\uninstall.ps1

# Unix
# 手动删除上述安装路径中的扩展目录
```

## 🔍 故障排除

### 常见问题

1. 安装失败

   - 以管理员身份运行
   - 安装前关闭 Cursor IDE
   - 检查文件权限
2. 导出失败

   - 确保保存位置有写入权限
   - 尝试不同的保存路径
   - 查看调试控制台错误信息

## 📄 未来规划

作为一个兴趣驱动的开源项目，我们希望在未来探索以下可能性：

### 🐛 即将修复

- 优化多层嵌套的 thinking block 和 snippet block 的解析逻辑
- 完善插件的国际化支持（中文/英文），提升多语言用户体验

### 🔬 技术探索

- 深入研究 Cursor 运行机制，尝试实现以下功能：
  - 解析 Cursor Tools 调用操作与参数提取
  - 支持的工具类型：
    - `read_file`: 读取文件
    - `edit_file`: 编辑文件
    - `list_dir`: 列出目录
    - `codebase_search`: 搜索代码
    - `grep_search`: 文本搜索
    - `file_search`: 查找文件
    - `run_terminal_command`: 执行命令
    - `delete_file`: 删除文件
  - 标注当前使用的 AI 模型信息
  - 优化工作区和对话的导出定位
  - 改进关键词语义提取与分析

### 🚀 愿景展望

我们希望探索将插件构建为智能辅助工具：

1. **上下文延续增强**
   - 缓解长文本限制带来的上下文断裂
   - 为新对话环境提供知识蒸馏
   - 保持工作连贯性

2. **Meta-Prompt 优化服务**
   - 基于工作区内容总结用户输入模式
   - 提炼并保存高质量历史 Meta-Prompt
   - 协助构建个性化 Cursorrules 文档

> 注：由于学业任务繁重，本项目将作为兴趣工程持续维护。我们期待 Cursor 团队以及全球 AI 编程开发社区能以更专业的方式，满足用户日益增长的个性化 AI 编程需求。

## 📄 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🌟 更新日志

### 0.0.1

- ✨ 首次发布
- 📝 基础 Markdown 导出
- 💭 支持思考块
- 🔄 保留助手代码片段

## 👥 联系方式

- 邮箱：zihoi.luk@foxmail.com
- GitHub Issues：[报告问题](https://github.com/TsekaLuk/Cursor-export-extension/issues)

---

<div align="center">

**Cursor Export Extension** © 2024 Tseka Luk. 基于 MIT 许可证发布。

</div>