# Cursor Composer Export

<div align="center">

![Logo](assets/ix10tn-logo.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README_en.md) | [简体中文](README.md)

Export your Cursor Composer conversations to Markdown documents, preserving thinking blocks and assistant code snippets.

</div>

## ✨ Features

- 📝 Export conversations to Markdown format
- 💭 Preserve thinking blocks and assistant code snippets
- 🔄 Maintain conversation context and formatting
- 📂 Custom export path

## 🚀 Installation

### Requirements

- Node.js 14.x or higher
- Cursor IDE
- Administrator privileges (for installation)

### Install Steps

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install extension:
   ```bash
   npm run install-extension
   ```
4. Restart Cursor IDE

### Installation Path

The extension will be installed to:

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

## 💫 Usage

1. Open Cursor IDE
2. Click "Export All Conversations" in the status bar (bottom right)
3. Select save location
4. Click Export

## 🛠️ Development

### Build

```bash
# Install dependencies
npm install

# Install extension
npm run install-extension

# Compile TypeScript
npm run compile

# Development watch mode
npm run watch
```

### Debug

1. Open project in VS Code
2. Press F5 to start debugging
3. A new Cursor IDE window will open with the extension loaded
4. Check debug console for logs

### Manual Installation

```bash
# Windows (PowerShell Admin)
.\scripts\install.ps1

# Unix
npm run install-extension
```

### Uninstall

```bash
# Windows (PowerShell Admin)
.\scripts\uninstall.ps1

# Unix
# Manually delete extension directory from installation path above
```

## 🔍 Troubleshooting

### Common Issues

1. Installation Failed

   - Run as administrator
   - Close Cursor IDE before installation
   - Check file permissions
2. Export Failed

   - Ensure write permissions for save location
   - Try different save paths
   - Check debug console for error messages

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details

## 🌟 Changelog

### 0.0.1

- ✨ Initial release
- 📝 Basic Markdown export
- 💭 Support for thinking blocks
- 🔄 Preserve assistant code snippets

## 👥 Contact

- Email: zihoi.luk@foxmail.com
- GitHub Issues: [Report Issues](https://github.com/TsekaLuk/Cursor-export-extension/issues)

---

<div align="center">

**Cursor Export Extension** © 2024 Tseka Luk. Released under the MIT License.

</div>
