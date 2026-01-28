import * as vscode from 'vscode';
import { CoverageReport, ThresholdConfig, getThresholdLevel } from '../models/coverage';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private thresholds: ThresholdConfig;

  constructor(thresholds: ThresholdConfig) {
    this.thresholds = thresholds;
    
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'goCoverage.showReport';
    this.statusBarItem.show();
    this.setNoCoverage();
  }

  updateCoverage(report: CoverageReport | null): void {
    if (!report) {
      this.setNoCoverage();
      return;
    }

    const percentage = report.totalCoverage;
    const level = getThresholdLevel(percentage, this.thresholds);
    const icon = this.getIcon(level);
    
    this.statusBarItem.text = `${icon} Coverage: ${percentage.toFixed(1)}%`;
    this.statusBarItem.tooltip = this.createTooltip(report);
    this.statusBarItem.backgroundColor = this.getBackgroundColor(level);
  }

  updateThresholds(thresholds: ThresholdConfig): void {
    this.thresholds = thresholds;
  }

  private setNoCoverage(): void {
    this.statusBarItem.text = '$(graph) No Coverage';
    this.statusBarItem.tooltip = 'Click to run tests with coverage';
    this.statusBarItem.backgroundColor = undefined;
  }

  private getIcon(level: string): string {
    switch (level) {
      case 'high':
        return '$(check)';
      case 'medium':
        return '$(warning)';
      case 'low':
      case 'none':
        return '$(error)';
      default:
        return '$(graph)';
    }
  }

  private getBackgroundColor(level: string): vscode.ThemeColor | undefined {
    switch (level) {
      case 'low':
      case 'none':
        return new vscode.ThemeColor('statusBarItem.errorBackground');
      case 'medium':
        return new vscode.ThemeColor('statusBarItem.warningBackground');
      default:
        return undefined;
    }
  }

  private createTooltip(report: CoverageReport): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;

    const timestamp = report.timestamp.toLocaleString();
    const fileCount = report.files.size;
    
    tooltip.appendMarkdown(`### Go Coverage Report\n\n`);
    tooltip.appendMarkdown(`**Total Coverage:** ${report.totalCoverage.toFixed(1)}%\n\n`);
    tooltip.appendMarkdown(`**Statements:** ${report.coveredStatements}/${report.totalStatements}\n\n`);
    tooltip.appendMarkdown(`**Files:** ${fileCount}\n\n`);
    tooltip.appendMarkdown(`**Last Updated:** ${timestamp}\n\n`);
    tooltip.appendMarkdown(`---\n\n`);
    tooltip.appendMarkdown(`*Click to show full report*`);

    return tooltip;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
