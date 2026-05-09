import * as vscode from 'vscode';
import * as path from 'path';
import { CoverageService } from './services/coverage-service';
import { CoverageDecorationProvider } from './providers/coverage-decoration-provider';
import { CoverageTreeProvider } from './providers/coverage-tree-provider';
import { InlineCoverageProvider } from './providers/inline-coverage-provider';
import { CoverageWatcher } from './watchers/coverage-watcher';
import { StatusBarManager } from './ui/status-bar';
import { CoverageCommands } from './commands/coverage-commands';
import { CoverageConfig, CoverageReport, ThresholdConfig } from './models/coverage';

let coverageService: CoverageService;
let decorationProvider: CoverageDecorationProvider;
let treeProvider: CoverageTreeProvider;
let inlineCoverageProvider: InlineCoverageProvider;
let coverageWatcher: CoverageWatcher;
let statusBarManager: StatusBarManager;
let coverageCommands: CoverageCommands;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    registerNoopCommands(context);
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const config = getConfig();
  const thresholds = getThresholds(config);

  coverageService = new CoverageService(workspaceRoot);
  coverageService.setExcludePatterns(config.excludePatterns);

  decorationProvider = new CoverageDecorationProvider(thresholds, config.excludePatterns);
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  treeProvider = new CoverageTreeProvider(thresholds);
  const treeView = vscode.window.createTreeView('goCoverageTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);

  inlineCoverageProvider = new InlineCoverageProvider(config.excludePatterns);
  context.subscriptions.push(inlineCoverageProvider);

  statusBarManager = new StatusBarManager(thresholds);
  context.subscriptions.push(statusBarManager);

  const onCoverageUpdated = (report: CoverageReport | null) => {
    decorationProvider.updateCoverage(report);
    treeProvider.updateCoverage(report);
    inlineCoverageProvider.updateCoverage(report);
    statusBarManager.updateCoverage(report);
    
    vscode.commands.executeCommand(
      'setContext',
      'goCoverage.hasCoverageData',
      report !== null
    );
  };

  coverageCommands = new CoverageCommands(
    context,
    coverageService,
    onCoverageUpdated,
    getConfig
  );
  coverageCommands.registerCommands();

  try {
    await coverageService.initialize();
  } catch (err) {
    console.error('[Go Coverage] Failed to initialize coverage service:', err);
  }

  if (config.autoWatch) {
    coverageWatcher = new CoverageWatcher(
      async (filePath: string) => {
        const result = await coverageService.loadCoverage(filePath);
        if (result.success && result.report) {
          onCoverageUpdated(result.report);
        }
      },
      () => {
        onCoverageUpdated(null);
      }
    );

    coverageWatcher.watch([
      '**/coverage.out',
      '**/coverage.lcov',
      '**/*.lcov'
    ]);

    context.subscriptions.push(coverageWatcher);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration('goCoverage')) {
        const newConfig = getConfig();
        const newThresholds = getThresholds(newConfig);

        // Update patterns and immediately re-filter the already-loaded report.
        // Only fall back to a full disk reload when no report is in memory.
        const refiltered = coverageService.setExcludePatterns(newConfig.excludePatterns);

        decorationProvider.updateThresholds(newThresholds);
        decorationProvider.setEnabled(newConfig.showDecorations);
        decorationProvider.updateExcludePatterns(newConfig.excludePatterns);

        treeProvider.updateThresholds(newThresholds);

        inlineCoverageProvider.setEnabled(newConfig.showInlineHints);
        inlineCoverageProvider.updateExcludePatterns(newConfig.excludePatterns);

        statusBarManager.updateThresholds(newThresholds);

        if (refiltered) {
          onCoverageUpdated(refiltered);
        } else {
          await loadExistingCoverage(workspaceRoot, newConfig, onCoverageUpdated);
        }
      }
    })
  );

  await loadExistingCoverage(workspaceRoot, config, onCoverageUpdated);

  console.log('Go Coverage Tree extension activated');
}

async function loadExistingCoverage(
  workspaceRoot: string,
  config: CoverageConfig,
  onCoverageUpdated: (report: CoverageReport | null) => void
): Promise<void> {
  const coverageFiles = [
    config.coverageFilePath,
    'coverage.out',
    'coverage.lcov'
  ];

  for (const fileName of coverageFiles) {
    const filePath = path.join(workspaceRoot, fileName);
    try {
      const result = await coverageService.loadCoverage(filePath);
      if (result.success && result.report) {
        onCoverageUpdated(result.report);
        return;
      }
    } catch {
      continue;
    }
  }
}

function getConfig(): CoverageConfig {
  const config = vscode.workspace.getConfiguration('goCoverage');
  
  return {
    coverageFilePath: config.get('coverageFilePath', 'coverage.out'),
    autoWatch: config.get('autoWatch', true),
    showDecorations: config.get('showDecorations', true),
    showInlineHints: config.get('showInlineHints', true),
    threshold: {
      low: config.get('threshold.low', 50),
      medium: config.get('threshold.medium', 80)
    },
    testFlags: config.get('testFlags', '-v -race'),
    excludePatterns: config.get('excludePatterns', [
      '**/vendor/**',
      '**/*_test.go',
      '**/mock_*.go',
      '**/mocks/**'
    ])
  };
}

function getThresholds(config: CoverageConfig): ThresholdConfig {
  return {
    low: config.threshold.low,
    medium: config.threshold.medium
  };
}

function registerNoopCommands(context: vscode.ExtensionContext): void {
  const commandIds = [
    'goCoverage.runTests',
    'goCoverage.runPackageTests',
    'goCoverage.loadCoverage',
    'goCoverage.clearCoverage',
    'goCoverage.showReport',
    'goCoverage.refresh',
    'goCoverage.toggleDecorations'
  ];

  for (const commandId of commandIds) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        vscode.window.showWarningMessage('Please open a workspace folder to use Go Coverage.');
      })
    );
  }
}

export function deactivate(): void {
  console.log('Go Coverage Tree extension deactivated');
}
