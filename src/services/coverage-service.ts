import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import { GoCoverageParser } from '../parsers/go-coverage-parser';
import { LcovParser } from '../parsers/lcov-parser';
import { PathResolver } from '../utils/path-resolver';
import { CoverageReport, CoverageConfig, ParseResult } from '../models/coverage';

export class CoverageService {
  private goCoverageParser: GoCoverageParser;
  private lcovParser: LcovParser;
  private pathResolver: PathResolver;
  private currentReport: CoverageReport | null = null;
  private workspaceRoot: string;
  private goPath: string | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.pathResolver = new PathResolver(workspaceRoot);
    this.goCoverageParser = new GoCoverageParser(this.pathResolver);
    this.lcovParser = new LcovParser(this.pathResolver);
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
      this.currentReport = result.report;
    }

    return result;
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
