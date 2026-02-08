import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import { minimatch } from 'minimatch';
import { GoCoverageParser } from '../parsers/go-coverage-parser';
import { LcovParser } from '../parsers/lcov-parser';
import { PathResolver } from '../utils/path-resolver';
import { CoverageReport, CoverageConfig, ParseResult, FileCoverage, DirectoryCoverage } from '../models/coverage';

export class CoverageService {
  private goCoverageParser: GoCoverageParser;
  private lcovParser: LcovParser;
  private pathResolver: PathResolver;
  private currentReport: CoverageReport | null = null;
  private workspaceRoot: string;
  private goPath: string | null = null;
  private excludePatterns: string[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.pathResolver = new PathResolver(workspaceRoot);
    this.goCoverageParser = new GoCoverageParser(this.pathResolver);
    this.lcovParser = new LcovParser(this.pathResolver);
  }

  setExcludePatterns(patterns: string[]): void {
    this.excludePatterns = patterns;
  }

  async initialize(): Promise<void> {
    await this.pathResolver.initialize();
    await this.findGoPath();
  }

  private async findGoPath(): Promise<void> {
    const goConfig = vscode.workspace.getConfiguration('go');
    const configuredGoRoot = goConfig.get<string>('goroot');
    
    if (configuredGoRoot) {
      this.goPath = path.join(configuredGoRoot, 'bin', 'go');
      return;
    }

    const commonPaths = [
      '/usr/local/go/bin/go',
      '/usr/bin/go',
      '/opt/homebrew/bin/go',
      path.join(os.homedir(), 'go', 'bin', 'go'),
      path.join(os.homedir(), 'sdk', 'go', 'bin', 'go'),
    ];

    const goVersionDirs = [
      path.join(os.homedir(), 'go'),
      path.join(os.homedir(), 'sdk'),
      '/usr/local'
    ];

    for (const baseDir of goVersionDirs) {
      try {
        const fs = await import('fs');
        const entries = await fs.promises.readdir(baseDir);
        for (const entry of entries) {
          if (entry.startsWith('go1.')) {
            const goPath = path.join(baseDir, entry, 'bin', 'go');
            try {
              await fs.promises.access(goPath);
              commonPaths.unshift(goPath);
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }

    for (const goPath of commonPaths) {
      try {
        const fs = await import('fs');
        await fs.promises.access(goPath);
        this.goPath = goPath;
        return;
      } catch {
        continue;
      }
    }

    this.goPath = 'go';
  }

  private getEnvWithPath(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    
    const additionalPaths = [
      '/usr/local/go/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(os.homedir(), 'go', 'bin'),
      path.join(os.homedir(), '.local', 'bin'),
    ];

    if (this.goPath && this.goPath !== 'go') {
      additionalPaths.unshift(path.dirname(this.goPath));
    }

    const currentPath = env.PATH || '';
    env.PATH = [...additionalPaths, currentPath].join(path.delimiter);
    env.CGO_ENABLED = '0';
    
    return env;
  }

  async loadCoverage(coverageFilePath: string): Promise<ParseResult> {
    const absolutePath = path.isAbsolute(coverageFilePath)
      ? coverageFilePath
      : path.join(this.workspaceRoot, coverageFilePath);

    const parser = this.selectParser(absolutePath);
    const result = await parser.parse(absolutePath, this.workspaceRoot);

    if (result.success && result.report) {
      // Apply exclude patterns to filter out unwanted files
      this.filterReport(result.report);
      this.currentReport = result.report;
    }

    return result;
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

  private filterReport(report: CoverageReport): void {
    // Filter out excluded files
    const filesToDelete: string[] = [];
    
    for (const [absolutePath, file] of report.files) {
      const relativePath = path.relative(this.workspaceRoot, absolutePath).replace(/\\/g, '/');
      
      if (this.isExcluded(relativePath) || this.isExcluded(file.filePath)) {
        filesToDelete.push(absolutePath);
      }
    }

    for (const filePath of filesToDelete) {
      report.files.delete(filePath);
    }

    // Rebuild directory tree after filtering
    this.rebuildDirectoryTree(report);

    // Recalculate total coverage
    let totalStatements = 0;
    let coveredStatements = 0;
    
    for (const file of report.files.values()) {
      totalStatements += file.totalStatements;
      coveredStatements += file.coveredStatements;
    }

    report.totalStatements = totalStatements;
    report.coveredStatements = coveredStatements;
    report.totalCoverage = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;
  }

  private rebuildDirectoryTree(report: CoverageReport): void {
    const directories = new Map<string, DirectoryCoverage>();

    // Build directory structure from remaining files
    for (const file of report.files.values()) {
      const relativePath = path.relative(this.workspaceRoot, file.absolutePath).replace(/\\/g, '/');
      const parts = relativePath.split('/').filter(p => p.length > 0);
      
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (!directories.has(currentPath)) {
          directories.set(currentPath, {
            path: currentPath,
            name: part,
            files: [],
            subdirectories: [],
            coveredStatements: 0,
            totalStatements: 0,
            percentage: 0
          });
        }
      }
    }

    // Assign files to directories
    for (const file of report.files.values()) {
      const relativePath = path.relative(this.workspaceRoot, file.absolutePath).replace(/\\/g, '/');
      const dirPath = path.dirname(relativePath).replace(/\\/g, '/');
      
      if (dirPath && dirPath !== '.' && directories.has(dirPath)) {
        const dir = directories.get(dirPath)!;
        dir.files.push(file);
      }
    }

    // Build parent-child relationships
    for (const [dirPath, dir] of directories) {
      const parentPath = path.dirname(dirPath).replace(/\\/g, '/');
      if (parentPath && parentPath !== '.' && directories.has(parentPath)) {
        const parent = directories.get(parentPath)!;
        if (!parent.subdirectories.find(d => d.path === dirPath)) {
          parent.subdirectories.push(dir);
        }
      }
    }

    // Calculate directory coverages (bottom-up)
    const sortedDirs = Array.from(directories.entries())
      .sort((a, b) => b[0].split('/').length - a[0].split('/').length);

    for (const [, dir] of sortedDirs) {
      let totalStatements = 0;
      let coveredStatements = 0;

      for (const file of dir.files) {
        totalStatements += file.totalStatements;
        coveredStatements += file.coveredStatements;
      }

      for (const subdir of dir.subdirectories) {
        totalStatements += subdir.totalStatements;
        coveredStatements += subdir.coveredStatements;
      }

      dir.totalStatements = totalStatements;
      dir.coveredStatements = coveredStatements;
      dir.percentage = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;
    }

    report.directories = directories;
  }

  async runTestsWithCoverage(config: CoverageConfig, packagePath?: string): Promise<ParseResult> {
    const outputChannel = vscode.window.createOutputChannel('Go Coverage');
    outputChannel.show();

    const coverageFilePath = path.join(this.workspaceRoot, config.coverageFilePath);
    const testPath = packagePath || './...';
    
    const args = [
      'test',
      `-coverprofile=${coverageFilePath}`,
      ...config.testFlags.split(' ').filter(f => f.length > 0),
      testPath
    ];

    const goCommand = this.goPath || 'go';
    outputChannel.appendLine(`$ ${goCommand} ${args.join(' ')}`);
    outputChannel.appendLine('');

    return new Promise((resolve) => {
      const childProcess = cp.spawn(goCommand, args, {
        cwd: this.workspaceRoot,
        env: this.getEnvWithPath(),
        shell: true
      });

      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChannel.append(text);
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        outputChannel.append(text);
      });

      childProcess.on('close', async (code: number) => {
        outputChannel.appendLine('');
        
        if (code === 0) {
          outputChannel.appendLine('✅ Tests completed successfully');
          const result = await this.loadCoverage(coverageFilePath);
          
          if (result.success && result.report) {
            outputChannel.appendLine(`📊 Coverage: ${result.report.totalCoverage.toFixed(1)}%`);
            outputChannel.appendLine(`📁 Files: ${result.report.files.size}`);
          }
          
          resolve(result);
        } else {
          outputChannel.appendLine(`❌ Tests failed with exit code ${code}`);
          resolve({
            success: false,
            error: `Tests failed with exit code ${code}\n${stderr}`
          });
        }
      });

      childProcess.on('error', (err: Error) => {
        outputChannel.appendLine(`❌ Error: ${err.message}`);
        resolve({
          success: false,
          error: err.message
        });
      });
    });
  }

  getCurrentReport(): CoverageReport | null {
    return this.currentReport;
  }

  clearCoverage(): void {
    this.currentReport = null;
  }

  private selectParser(filePath: string): GoCoverageParser | LcovParser {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.lcov' || filePath.endsWith('.lcov')) {
      return this.lcovParser;
    }
    
    return this.goCoverageParser;
  }
}
