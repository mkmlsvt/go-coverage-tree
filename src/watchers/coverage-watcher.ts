import * as vscode from 'vscode';
import * as path from 'path';

export class CoverageWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 500;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly onCoverageFileChanged: (filePath: string) => Promise<void>,
    private readonly onCoverageFileDeleted: (filePath: string) => void
  ) {}

  watch(patterns: string[]): void {
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      
      this.disposables.push(
        watcher.onDidCreate(uri => this.handleChange(uri.fsPath)),
        watcher.onDidChange(uri => this.handleChange(uri.fsPath)),
        watcher.onDidDelete(uri => this.handleDelete(uri.fsPath))
      );
      
      this.watchers.push(watcher);
    }
  }

  private handleChange(filePath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(async () => {
      try {
        await this.onCoverageFileChanged(filePath);
      } catch (error) {
        console.error('Error handling coverage file change:', error);
      }
    }, this.DEBOUNCE_MS);
  }

  private handleDelete(filePath: string): void {
    const fileName = path.basename(filePath);
    vscode.window.showInformationMessage(`Coverage file deleted: ${fileName}`);
    this.onCoverageFileDeleted(filePath);
  }

  dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
