# Go Coverage Tree

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-green)
![License](https://img.shields.io/badge/license-MIT-orange)

**GoLand-style test coverage visualization for VS Code and Cursor IDE**

Visualize your Go test coverage directly in the file explorer with percentage badges and color-coded indicators - just like in GoLand/IntelliJ IDEA.

![Coverage Demo](images/demo.png)

## ✨ Features

### 📊 File Explorer Decorations
- **Percentage badges** on files and folders showing coverage
- **Color-coded indicators**: 
  - 🟢 Green (80%+): High coverage
  - 🟡 Yellow (50-80%): Medium coverage  
  - 🔴 Red (<50%): Low coverage

### 🌳 Coverage Tree View
- Dedicated sidebar panel showing coverage hierarchy
- Expandable directory structure
- Click to open files
- Aggregate coverage for directories

### 📝 Inline Editor Decorations
- Line-by-line coverage highlighting
- Green background for covered lines
- Red background for uncovered lines
- Hover for hit count information

### 📈 Status Bar
- Quick coverage overview
- Click to show detailed report
- Warning colors for low coverage

### 🎯 Coverage Report
- Beautiful HTML report in webview
- Sortable file list
- Visual coverage bars
- Summary statistics

## 🚀 Quick Start

1. **Install the extension** from VS Code Marketplace

2. **Run tests with coverage**:
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run `Go Coverage: Run Tests with Coverage`
   
   Or run manually:
   ```bash
   go test -coverprofile=coverage.out ./...
   ```

3. **View coverage** in file explorer and Coverage sidebar panel

## 📋 Commands

| Command | Description |
|---------|-------------|
| `Go Coverage: Run Tests with Coverage` | Run all tests and generate coverage |
| `Go Coverage: Run Package Tests with Coverage` | Run tests for selected package |
| `Go Coverage: Load Coverage File` | Load an existing coverage file |
| `Go Coverage: Show Report` | Open coverage report in webview |
| `Go Coverage: Clear Coverage Data` | Clear all coverage data |
| `Go Coverage: Toggle File Decorations` | Toggle coverage badges on/off |
| `Go Coverage: Refresh` | Reload coverage data |

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `goCoverage.coverageFilePath` | `coverage.out` | Path to coverage file |
| `goCoverage.autoWatch` | `true` | Watch for coverage file changes |
| `goCoverage.showDecorations` | `true` | Show file explorer decorations |
| `goCoverage.showInlineHints` | `true` | Show inline editor decorations |
| `goCoverage.threshold.low` | `50` | Threshold for low coverage (red) |
| `goCoverage.threshold.medium` | `80` | Threshold for medium coverage (yellow) |
| `goCoverage.testFlags` | `-v -race` | Additional flags for go test |
| `goCoverage.excludePatterns` | `["**/vendor/**", ...]` | Patterns to exclude |

## 🎨 Custom Colors

You can customize colors in your `settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "goCoverage.highCoverage": "#00ff00",
    "goCoverage.mediumCoverage": "#ffff00",
    "goCoverage.lowCoverage": "#ff0000",
    "goCoverage.coveredBackground": "#00ff0020",
    "goCoverage.uncoveredBackground": "#ff000020"
  }
}
```

## 📁 Supported Formats

- **Go Coverage** (`coverage.out`) - Native Go test coverage format
- **LCOV** (`coverage.lcov`, `*.lcov`) - Standard LCOV format

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/kemal-savut/go-coverage-tree.git
cd go-coverage-tree

# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package extension
npm run package
```

### Testing the Extension

1. Press `F5` to open Extension Development Host
2. Open a Go project
3. Run `go test -coverprofile=coverage.out ./...`
4. See coverage decorations appear!

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📮 Feedback

- 🐛 [Report bugs](https://github.com/kemal-savut/go-coverage-tree/issues)
- 💡 [Request features](https://github.com/kemal-savut/go-coverage-tree/issues)
- ⭐ Star the repo if you find it useful!

---

Made with ❤️ for the Go community
