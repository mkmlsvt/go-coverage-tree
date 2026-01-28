import * as vscode from 'vscode';
import * as path from 'path';
import {
  CoverageReport,
  FileCoverage,
  DirectoryCoverage,
  ThresholdConfig,
  ThresholdLevel,
  getThresholdLevel,
  formatBadge
} from '../models/coverage';

export class CoverageDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private coverageReport: CoverageReport | null = null;
  private thresholds: ThresholdConfig;
  private enabled: boolean = true;
  private fileCoverageCache: Map<string, FileCoverage> = new Map();
  private dirCoverageCache: Map<string, DirectoryCoverage> = new Map();

  constructor(thresholds: ThresholdConfig) {
    this.thresholds = thresholds;
  }

  updateCoverage(report: CoverageReport | null): void {
    if (report && report.files.size === 0 && this.coverageReport && this.coverageReport.files.size > 0) {
      console.log('[Go Coverage] Ignoring empty report, keeping existing coverage');
      return;
    }
    
    this.coverageReport = report;
    this.buildCaches();
    this._onDidChangeFileDecorations.fire(undefined);
  }

  private buildCaches(): void {
    this.fileCoverageCache.clear();
    this.dirCoverageCache.clear();

    if (!this.coverageReport) {
      console.log('[Go Coverage] No coverage report, clearing caches');
      return;
    }

    console.log(`[Go Coverage] Building cache from ${this.coverageReport.files.size} files`);
    console.log(`[Go Coverage] Workspace root: ${this.coverageReport.workspaceRoot}`);

    let sampleLogged = false;
    for (const [absolutePath, coverage] of this.coverageReport.files) {
      const normalizedPath = absolutePath.replace(/\\/g, '/').toLowerCase();
      this.fileCoverageCache.set(normalizedPath, coverage);
      
      const relativePath = path.relative(this.coverageReport.workspaceRoot, absolutePath)
        .replace(/\\/g, '/').toLowerCase();
      this.fileCoverageCache.set(relativePath, coverage);

      if (!sampleLogged && coverage.percentage > 0) {
        console.log(`[Go Coverage] Sample file with coverage:`);
        console.log(`  absolutePath: ${absolutePath}`);
        console.log(`  normalizedPath: ${normalizedPath}`);
        console.log(`  relativePath: ${relativePath}`);
        console.log(`  coverage: ${coverage.percentage.toFixed(1)}%`);
        sampleLogged = true;
      }
    }

    for (const [dirPath, coverage] of this.coverageReport.directories) {
      const normalizedPath = dirPath.replace(/\\/g, '/').toLowerCase();
      this.dirCoverageCache.set(normalizedPath, coverage);
    }

    console.log(`[Go Coverage] Built cache: ${this.fileCoverageCache.size} files, ${this.dirCoverageCache.size} dirs`);
  }

  updateThresholds(thresholds: ThresholdConfig): void {
    this.thresholds = thresholds;
    this._onDidChangeFileDecorations.fire(undefined);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!this.enabled || !this.coverageReport) {
      return undefined;
    }

    const fileCoverage = this.findFileCoverage(uri);
    if (fileCoverage) {
      return this.createFileDecoration(fileCoverage.percentage);
    }

    const dirCoverage = this.findDirectoryCoverage(uri);
    if (dirCoverage) {
      return this.createFileDecoration(dirCoverage.percentage);
    }

    return undefined;
  }

  private debugLogCount = 0;

  private findFileCoverage(uri: vscode.Uri): FileCoverage | undefined {
    if (!this.coverageReport) {
      return undefined;
    }

    const fsPath = uri.fsPath;
    
    if (!fsPath.endsWith('.go') || fsPath.endsWith('_test.go')) {
      return undefined;
    }

    const normalizedFsPath = fsPath.replace(/\\/g, '/').toLowerCase();
    const relativePath = path.relative(this.coverageReport.workspaceRoot, fsPath)
      .replace(/\\/g, '/').toLowerCase();

    let result: FileCoverage | undefined;
    
    if (this.fileCoverageCache.has(normalizedFsPath)) {
      result = this.fileCoverageCache.get(normalizedFsPath);
    } else if (this.fileCoverageCache.has(relativePath)) {
      result = this.fileCoverageCache.get(relativePath);
    } else {
      for (const [cachedPath, coverage] of this.fileCoverageCache) {
        if (normalizedFsPath.endsWith(cachedPath) || cachedPath.endsWith(normalizedFsPath)) {
          result = coverage;
          break;
        }
        if (normalizedFsPath.endsWith('/' + cachedPath) || cachedPath.endsWith('/' + normalizedFsPath)) {
          result = coverage;
          break;
        }
        if (relativePath === cachedPath || cachedPath === relativePath) {
          result = coverage;
          break;
        }
      }
    }

    if (this.debugLogCount < 5) {
      const found = result ? `FOUND (${result.percentage.toFixed(0)}%)` : 'NOT FOUND';
      console.log(`[Go Coverage] File: ${relativePath} -> ${found}`);
      this.debugLogCount++;
    }

    return result;
  }

  private findDirectoryCoverage(uri: vscode.Uri): DirectoryCoverage | undefined {
    if (!this.coverageReport) {
      return undefined;
    }

    const fsPath = uri.fsPath;
    const relativePath = path.relative(this.coverageReport.workspaceRoot, fsPath)
      .replace(/\\/g, '/').toLowerCase();

    if (this.dirCoverageCache.has(relativePath)) {
      return this.dirCoverageCache.get(relativePath);
    }

    for (const [cachedPath, coverage] of this.dirCoverageCache) {
      if (cachedPath === relativePath || relativePath === cachedPath) {
        return coverage;
      }
    }

    return undefined;
  }

  private createFileDecoration(percentage: number): vscode.FileDecoration {
    const level = getThresholdLevel(percentage, this.thresholds);
    const badge = this.createBadge(percentage);
    const color = this.getColor(level);
    const tooltip = this.createTooltip(percentage, level);

    return {
      badge,
      color,
      tooltip,
      propagate: false
    };
  }

  private createBadge(percentage: number): string {
    return formatBadge(percentage);
  }

  private getColor(level: ThresholdLevel): vscode.ThemeColor {
    switch (level) {
      case 'none':
      case 'low':
        return new vscode.ThemeColor('goCoverage.lowCoverage');
      case 'medium':
        return new vscode.ThemeColor('goCoverage.mediumCoverage');
      case 'high':
        return new vscode.ThemeColor('goCoverage.highCoverage');
    }
  }

  private createTooltip(percentage: number, level: ThresholdLevel): string {
    const progressBar = this.createProgressBar(percentage);
    const levelText = this.getLevelText(level);
    const emoji = this.getLevelEmoji(level);
    return `${emoji} Coverage: ${percentage.toFixed(1)}%\n${progressBar}\nStatus: ${levelText}`;
  }

  private createProgressBar(percentage: number): string {
    const length = 20;
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private getLevelEmoji(level: ThresholdLevel): string {
    switch (level) {
      case 'high': return '🟢';
      case 'medium': return '🟡';
      case 'low': return '🟠';
      case 'none': return '🔴';
    }
  }

  private getLevelText(level: ThresholdLevel): string {
    switch (level) {
      case 'none':
        return 'No coverage';
      case 'low':
        return 'Low coverage';
      case 'medium':
        return 'Medium coverage';
      case 'high':
        return 'Good coverage';
    }
  }

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }
}
