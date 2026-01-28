import * as vscode from 'vscode';
import * as path from 'path';
import {
  CoverageReport,
  FileCoverage,
  DirectoryCoverage,
  ThresholdConfig
} from '../models/coverage';

function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getThresholdColor(percentage: number, thresholds: ThresholdConfig): vscode.ThemeColor {
  if (percentage >= thresholds.medium) {
    return new vscode.ThemeColor('goCoverage.highCoverage');
  }
  if (percentage >= thresholds.low) {
    return new vscode.ThemeColor('goCoverage.mediumCoverage');
  }
  return new vscode.ThemeColor('goCoverage.lowCoverage');
}

export class CoverageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly coverage: number,
    public readonly itemType: 'file' | 'directory' | 'root',
    public readonly thresholds: ThresholdConfig,
    public readonly filePath?: string,
    public readonly children?: CoverageTreeItem[]
  ) {
    super(label, collapsibleState);
    this.setupItem();
  }

  private setupItem(): void {
    const progressBar = createProgressBar(this.coverage);
    const percentage = Math.round(this.coverage);
    this.description = `${percentage}% ${progressBar}`;
    this.tooltip = this.createTooltip();
    this.iconPath = this.getIcon();
    
    if (this.itemType === 'file' && this.filePath) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(this.filePath)]
      };
      this.resourceUri = vscode.Uri.file(this.filePath);
    }

    this.contextValue = this.itemType;
  }

  private createTooltip(): vscode.MarkdownString {
    const progressBar = createProgressBar(this.coverage, 20);
    const emoji = this.getCoverageEmoji();
    const status = this.getCoverageStatus();
    
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${emoji} ${this.label}\n\n`);
    md.appendMarkdown(`**Coverage:** ${this.coverage.toFixed(1)}%\n\n`);
    md.appendMarkdown(`\`${progressBar}\`\n\n`);
    md.appendMarkdown(`**Status:** ${status}`);
    return md;
  }

  private getCoverageEmoji(): string {
    if (this.coverage >= 80) return '🟢';
    if (this.coverage >= 50) return '🟡';
    if (this.coverage > 0) return '🟠';
    return '🔴';
  }

  private getCoverageStatus(): string {
    if (this.coverage >= 80) return 'Excellent';
    if (this.coverage >= 50) return 'Good';
    if (this.coverage > 0) return 'Needs improvement';
    return 'No coverage';
  }

  private getIcon(): vscode.ThemeIcon {
    const color = getThresholdColor(this.coverage, this.thresholds);
    
    if (this.itemType === 'directory') {
      return new vscode.ThemeIcon('folder', color);
    }
    if (this.itemType === 'root') {
      return new vscode.ThemeIcon('graph', color);
    }
    return new vscode.ThemeIcon('file-code', color);
  }
}

export class CoverageTreeProvider implements vscode.TreeDataProvider<CoverageTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CoverageTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private coverageReport: CoverageReport | null = null;
  private _thresholds: ThresholdConfig;
  private treeItems: CoverageTreeItem[] = [];

  constructor(thresholds: ThresholdConfig) {
    this._thresholds = thresholds;
  }

  updateCoverage(report: CoverageReport | null): void {
    if (report && report.files.size === 0 && this.coverageReport && this.coverageReport.files.size > 0) {
      return;
    }
    this.coverageReport = report;
    this.buildTree();
    this._onDidChangeTreeData.fire();
  }

  updateThresholds(thresholds: ThresholdConfig): void {
    this._thresholds = thresholds;
    this.buildTree();
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this.buildTree();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CoverageTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CoverageTreeItem): CoverageTreeItem[] {
    if (!this.coverageReport) {
      return [];
    }

    if (!element) {
      return this.treeItems;
    }

    return element.children || [];
  }

  private buildTree(): void {
    if (!this.coverageReport) {
      this.treeItems = [];
      return;
    }

    const rootItem = new CoverageTreeItem(
      'Coverage Summary',
      vscode.TreeItemCollapsibleState.Expanded,
      this.coverageReport.totalCoverage,
      'root',
      this._thresholds,
      undefined,
      this.buildDirectoryItems()
    );

    this.treeItems = [rootItem];
  }

  private buildDirectoryItems(): CoverageTreeItem[] {
    if (!this.coverageReport) {
      return [];
    }

    const rootDirs = this.findRootDirectories();
    const rootFiles = this.findRootFiles();

    const items: CoverageTreeItem[] = [];

    for (const dir of rootDirs) {
      items.push(this.createDirectoryItem(dir));
    }

    for (const file of rootFiles) {
      items.push(this.createFileItem(file));
    }

    return this.sortItems(items);
  }

  private findRootDirectories(): DirectoryCoverage[] {
    if (!this.coverageReport) {
      return [];
    }

    const rootDirs: DirectoryCoverage[] = [];
    
    for (const [dirPath, dir] of this.coverageReport.directories) {
      if (!dirPath.includes('/')) {
        rootDirs.push(dir);
      }
    }

    return rootDirs;
  }

  private findRootFiles(): FileCoverage[] {
    if (!this.coverageReport) {
      return [];
    }

    const rootFiles: FileCoverage[] = [];
    
    for (const file of this.coverageReport.files.values()) {
      const relativePath = path.relative(
        this.coverageReport.workspaceRoot,
        file.absolutePath
      );
      if (!relativePath.includes(path.sep) && !relativePath.includes('/')) {
        rootFiles.push(file);
      }
    }

    return rootFiles;
  }

  private createDirectoryItem(dir: DirectoryCoverage): CoverageTreeItem {
    const children: CoverageTreeItem[] = [];

    for (const subdir of dir.subdirectories) {
      children.push(this.createDirectoryItem(subdir));
    }

    for (const file of dir.files) {
      children.push(this.createFileItem(file));
    }

    const sortedChildren = this.sortItems(children);
    const hasChildren = sortedChildren.length > 0;

    return new CoverageTreeItem(
      dir.name,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      dir.percentage,
      'directory',
      this._thresholds,
      undefined,
      sortedChildren
    );
  }

  private createFileItem(file: FileCoverage): CoverageTreeItem {
    const fileName = path.basename(file.absolutePath);
    
    return new CoverageTreeItem(
      fileName,
      vscode.TreeItemCollapsibleState.None,
      file.percentage,
      'file',
      this._thresholds,
      file.absolutePath
    );
  }

  private sortItems(items: CoverageTreeItem[]): CoverageTreeItem[] {
    return items.sort((a, b) => {
      if (a.itemType === 'directory' && b.itemType !== 'directory') {
        return -1;
      }
      if (a.itemType !== 'directory' && b.itemType === 'directory') {
        return 1;
      }
      return a.label.localeCompare(b.label);
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
