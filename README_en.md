# Cursor Composer Export

<div align="center">

![Logo](assets/ix10tn-logo.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README_en.md) | [简体中文](README.md)

Export your Cursor Composer conversations to beautiful Markdown documents with rich customization options.

</div>

## ✨ Features

![Feature Preview](https://raw.githubusercontent.com/your-repo/cursor-export/main/assets/features.gif)

### 🎯 Core Features

- 📝 One-click export to Markdown format
- 🎨 Beautiful graphical configuration interface
- 🔄 Preserves conversation context and formatting
- 📊 Supports metadata and statistics
- 🕒 Smart timestamp management
- 📂 Flexible file saving options

### 🛠️ Customization Options

![Configuration Panel](https://raw.githubusercontent.com/your-repo/cursor-export/main/assets/config-panel.png)

- **Metadata Options**

  - Conversation ID and statistics
  - Session timestamps
  - Workspace information
- **Content Options**

  - Conversation topic summary
  - Message timestamps
  - Markdown formatting settings
- **Save Options**

  - Custom save location
  - Smart file naming
  - File overwrite protection

## 🚀 Quick Start

### 📥 Installation

1. Open Extensions in Cursor IDE
2. Search for "Cursor Export"
3. Click Install
4. Restart Cursor IDE

### 💫 Usage

1. Open Cursor IDE
2. Click "Export All Conversations" in the status bar (bottom right)
3. Select save location
4. Click Export

## 📝 Export Result

![Export Preview](https://raw.githubusercontent.com/your-repo/cursor-export/main/assets/export-preview.png)

- Structured Markdown document
- Clear role markers for conversations
- Elegant separators and formatting
- Complete metadata information
- Beautiful timestamp display

## ⚙️ Extension Settings

This extension contributes the following settings:

- `cursorExport.defaultPath`: Default export path
- `cursorExport.defaultOptions`: Default export options
- `cursorExport.autoOpen`: Auto-open file after export
- `cursorExport.dateFormat`: Timestamp format

## 🔍 Troubleshooting

### Common Issues

<details>
<summary>Can't see the export button?</summary>

Check:

1. Are you in a Composer conversation view?
2. Is the extension properly installed?
3. Have you restarted Cursor IDE?

</details>

<details>
<summary>Export failed?</summary>

Common causes:

1. Conversation content access failed
2. File permission issues
3. Invalid storage path

Solutions:

- Ensure you're in the correct conversation view
- Check file permissions
- Verify storage path

</details>

<details>
<summary>How to verify installation?</summary>

Check extension directory:

**Windows**

```
%LOCALAPPDATA%\Programs\cursor\resources\app\extensions\cursor-tools.cursor-export-extension-0.0.1\
```

**macOS**

```
/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-tools.cursor-export-extension-0.0.1/
```

**Linux**

```
/usr/share/cursor/resources/app/extensions/cursor-tools.cursor-export-extension-0.0.1/
```

</details>

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 🌟 Changelog

### 0.0.1 (2024-12-08)

- ✨ Initial release
- 🎨 Graphical configuration interface
- 🔧 Custom export options
- 📝 Markdown format support
- 🛠️ Error handling improvements

## 💖 Support

If you find this project helpful, please:

- ⭐ Star the project
- 📢 Share it with others
- 🐛 Report issues
- 🌟 Suggest features

## 👥 Author

- Email: zihoi.luk@foxmail.com

---

<div align="center">

**Cursor Export Extension** © 2024 Tseka Luk. Released under the MIT License.

</div>

## 📥 Installation

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

### Manual Installation

```bash
# Windows (PowerShell Admin)
.\scripts\install.ps1

# Unix
npm run install-extension
```
