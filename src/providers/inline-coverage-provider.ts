import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { CoverageReport, FileCoverage } from '../models/coverage';

export class InlineCoverageProvider {
  private coveredDecorationType: vscode.TextEditorDecorationType;
  private uncoveredDecorationType: vscode.TextEditorDecorationType;
  private coverageReport: CoverageReport | null = null;
  private enabled: boolean = true;
  private excludePatterns: string[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(excludePatterns: string[] = []) {
    this.excludePatterns = excludePatterns;
    this.coveredDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('goCoverage.coveredBackground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('goCoverage.highCoverage'),
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.uncoveredDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('goCoverage.uncoveredBackground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('goCoverage.lowCoverage'),
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.updateDecorations(editor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.updateDecorations(editor);
        }
      })
    );
  }

  updateCoverage(report: CoverageReport | null): void {
    this.coverageReport = report;
    this.updateAllEditors();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateAllEditors();
  }

  updateExcludePatterns(patterns: string[]): void {
    this.excludePatterns = patterns;
    this.updateAllEditors();
  }

  private isExcluded(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    for (const pattern of this.excludePatterns) {
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        return true;
      }
    }
    
    return false;
  }

  private updateAllEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    if (!this.enabled || !this.coverageReport) {
      editor.setDecorations(this.coveredDecorationType, []);
      editor.setDecorations(this.uncoveredDecorationType, []);
      return;
    }

    const fsPath = editor.document.uri.fsPath;
    
    // Check exclude patterns
    const relativePath = path.relative(this.coverageReport.workspaceRoot, fsPath);
    if (this.isExcluded(relativePath) || this.isExcluded(fsPath)) {
      editor.setDecorations(this.coveredDecorationType, []);
      editor.setDecorations(this.uncoveredDecorationType, []);
      return;
    }

    const fileCoverage = this.findFileCoverage(fsPath);
    if (!fileCoverage) {
      editor.setDecorations(this.coveredDecorationType, []);
      editor.setDecorations(this.uncoveredDecorationType, []);
      return;
    }

    const coveredRanges: vscode.DecorationOptions[] = [];
    const uncoveredRanges: vscode.DecorationOptions[] = [];

    for (const [lineNum, lineCoverage] of fileCoverage.lines) {
      const lineIndex = lineNum - 1;
      if (lineIndex < 0 || lineIndex >= editor.document.lineCount) {
        continue;
      }

      const line = editor.document.lineAt(lineIndex);
      const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
      
      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: this.createHoverMessage(lineCoverage.hitCount)
      };

      if (lineCoverage.covered) {
        coveredRanges.push(decoration);
      } else {
        uncoveredRanges.push(decoration);
      }
    }

    editor.setDecorations(this.coveredDecorationType, coveredRanges);
    editor.setDecorations(this.uncoveredDecorationType, uncoveredRanges);
  }

  private findFileCoverage(fsPath: string): FileCoverage | undefined {
    if (!this.coverageReport) {
      return undefined;
    }

    for (const [absolutePath, coverage] of this.coverageReport.files) {
      const normalized1 = absolutePath.replace(/\\/g, '/').toLowerCase();
      const normalized2 = fsPath.replace(/\\/g, '/').toLowerCase();
      
      if (normalized1 === normalized2 || 
          normalized1.endsWith(normalized2) || 
          normalized2.endsWith(normalized1)) {
        return coverage;
      }
    }

    return undefined;
  }

  private createHoverMessage(hitCount: number): vscode.MarkdownString {
    const message = new vscode.MarkdownString();
    message.isTrusted = true;
    
    if (hitCount > 0) {
      message.appendMarkdown(`✅ **Covered** - Hit ${hitCount} time${hitCount > 1 ? 's' : ''}`);
    } else {
      message.appendMarkdown(`❌ **Not covered** - This line was never executed during tests`);
    }

    return message;
  }

  dispose(): void {
    this.coveredDecorationType.dispose();
    this.uncoveredDecorationType.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
