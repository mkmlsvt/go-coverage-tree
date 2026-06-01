import * as vscode from 'vscode';
import * as path from 'path';
import { CoverageService } from '../services/coverage-service';
import { CoverageConfig, CoverageReport } from '../models/coverage';

export class CoverageCommands {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly coverageService: CoverageService,
    private readonly onCoverageUpdated: (report: CoverageReport | null) => void,
    private readonly getConfig: () => CoverageConfig
  ) {}

  registerCommands(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('goCoverage.runTests', () => this.runTests()),
      vscode.commands.registerCommand('goCoverage.runPackageTests', (uri?: vscode.Uri) => this.runPackageTests(uri)),
      vscode.commands.registerCommand('goCoverage.loadCoverage', () => this.loadCoverage()),
      vscode.commands.registerCommand('goCoverage.clearCoverage', () => this.clearCoverage()),
      vscode.commands.registerCommand('goCoverage.showReport', () => this.showReport()),
      vscode.commands.registerCommand('goCoverage.refresh', () => this.refresh()),
      vscode.commands.registerCommand('goCoverage.toggleDecorations', () => this.toggleDecorations())
    );
  }

  private async runTests(): Promise<void> {
    const config = this.getConfig();
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Running tests with coverage...',
      cancellable: false
    }, async () => {
      const result = await this.coverageService.runTestsWithCoverage(config);
      
      if (result.success && result.report) {
        this.onCoverageUpdated(result.report);
        vscode.window.showInformationMessage(
          `Coverage: ${result.report.totalCoverage.toFixed(1)}% (${result.report.files.size} files)`
        );
      } else if (result.error) {
        vscode.window.showErrorMessage(`Coverage failed: ${result.error}`);
      }
    });
  }

  private async runPackageTests(uri?: vscode.Uri): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    let packagePath = './...';
    
    if (uri) {
      const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
      packagePath = `./${relativePath}/...`;
    }

    const config = this.getConfig();
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Running tests in ${packagePath}...`,
      cancellable: false
    }, async () => {
      const result = await this.coverageService.runTestsWithCoverage(config, packagePath);
      
      if (result.success && result.report) {
        this.onCoverageUpdated(result.report);
        vscode.window.showInformationMessage(
          `Coverage: ${result.report.totalCoverage.toFixed(1)}%`
        );
      } else if (result.error) {
        vscode.window.showErrorMessage(`Coverage failed: ${result.error}`);
      }
    });
  }

  private async loadCoverage(): Promise<void> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: 'Load Coverage',
      filters: {
        'Coverage Files': ['out', 'lcov', 'xml'],
        'All Files': ['*']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    
    if (fileUri && fileUri[0]) {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Loading coverage data...',
        cancellable: false
      }, async () => {
        const result = await this.coverageService.loadCoverage(fileUri[0].fsPath);
        
        if (result.success && result.report) {
          this.onCoverageUpdated(result.report);
          vscode.window.showInformationMessage(
            `Loaded coverage: ${result.report.totalCoverage.toFixed(1)}% (${result.report.files.size} files)`
          );
        } else if (result.error) {
          vscode.window.showErrorMessage(`Failed to load coverage: ${result.error}`);
        }
      });
    }
  }

  private clearCoverage(): void {
    this.coverageService.clearCoverage();
    this.onCoverageUpdated(null);
    vscode.window.showInformationMessage('Coverage data cleared');
  }

  private showReport(): void {
    const report = this.coverageService.getCurrentReport();
    
    if (!report) {
      vscode.window.showInformationMessage('No coverage data available. Run tests first.');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'coverageReport',
      'Go Coverage Report',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.generateReportHtml(report);
  }

  private async refresh(): Promise<void> {
    const config = this.getConfig();
    this.coverageService.setExcludePatterns(config.excludePatterns);
    const result = await this.coverageService.loadCoverage(config.coverageFilePath);
    if (result.success && result.report) {
      this.onCoverageUpdated(result.report);
    }
  }

  private toggleDecorations(): void {
    const config = vscode.workspace.getConfiguration('goCoverage');
    const current = config.get<boolean>('showDecorations', true);
    config.update('showDecorations', !current, vscode.ConfigurationTarget.Workspace);
    
    vscode.window.showInformationMessage(
      `Coverage decorations ${!current ? 'enabled' : 'disabled'}`
    );
  }

  private generateReportHtml(report: CoverageReport): string {
    const files = Array.from(report.files.values())
      .sort((a, b) => a.percentage - b.percentage);

    const fileRows = files.map(file => {
      const color = this.getColorForPercentage(file.percentage);
      const barWidth = Math.round(file.percentage);
      
      return `
        <tr>
          <td class="file-name">${this.escapeHtml(file.filePath)}</td>
          <td class="coverage-cell">
            <div class="coverage-bar-container">
              <div class="coverage-bar" style="width: ${barWidth}%; background-color: ${color}"></div>
            </div>
          </td>
          <td class="percentage" style="color: ${color}">${file.percentage.toFixed(1)}%</td>
          <td class="statements">${file.coveredStatements}/${file.totalStatements}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            :root {
              --bg-color: var(--vscode-editor-background);
              --text-color: var(--vscode-editor-foreground);
              --border-color: var(--vscode-panel-border);
              --header-bg: var(--vscode-editor-selectionBackground);
            }
            
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            
            body {
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
              color: var(--text-color);
              background-color: var(--bg-color);
              padding: 20px;
            }
            
            .summary {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
            }
            
            .summary-card {
              background: var(--header-bg);
              padding: 20px;
              border-radius: 8px;
              text-align: center;
            }
            
            .summary-value {
              font-size: 2.5em;
              font-weight: bold;
              margin-bottom: 5px;
            }
            
            .summary-label {
              opacity: 0.7;
              font-size: 0.9em;
            }
            
            h1 {
              margin-bottom: 20px;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            
            th, td {
              padding: 12px;
              text-align: left;
              border-bottom: 1px solid var(--border-color);
            }
            
            th {
              background: var(--header-bg);
              font-weight: 600;
            }
            
            .file-name {
              font-family: var(--vscode-editor-font-family);
              font-size: 0.9em;
              max-width: 400px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            
            .coverage-cell {
              width: 200px;
            }
            
            .coverage-bar-container {
              width: 100%;
              height: 8px;
              background: rgba(255,255,255,0.1);
              border-radius: 4px;
              overflow: hidden;
            }
            
            .coverage-bar {
              height: 100%;
              border-radius: 4px;
              transition: width 0.3s ease;
            }
            
            .percentage {
              font-weight: bold;
              text-align: right;
              width: 80px;
            }
            
            .statements {
              text-align: right;
              opacity: 0.7;
              width: 100px;
            }
            
            tr:hover {
              background: rgba(255,255,255,0.05);
            }
            
            .high { color: #4EC9B0; }
            .medium { color: #CCA700; }
            .low { color: #F14C4C; }
          </style>
        </head>
        <body>
          <h1>📊 Go Coverage Report</h1>
          
          <div class="summary">
            <div class="summary-card">
              <div class="summary-value" style="color: ${this.getColorForPercentage(report.totalCoverage)}">
                ${report.totalCoverage.toFixed(1)}%
              </div>
              <div class="summary-label">Total Coverage</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${report.files.size}</div>
              <div class="summary-label">Files</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${report.coveredStatements}</div>
              <div class="summary-label">Covered Statements</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${report.totalStatements}</div>
              <div class="summary-label">Total Statements</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Coverage</th>
                <th style="text-align: right">%</th>
                <th style="text-align: right">Statements</th>
              </tr>
            </thead>
            <tbody>
              ${fileRows}
            </tbody>
          </table>
          
          <script>
            const vscode = acquireVsCodeApi();
          </script>
        </body>
      </html>
    `;
  }

  private getColorForPercentage(percentage: number): string {
    if (percentage >= 80) return '#4EC9B0';
    if (percentage >= 50) return '#CCA700';
    return '#F14C4C';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
