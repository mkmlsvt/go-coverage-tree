import * as fs from 'fs';
import * as readline from 'readline';
import {
  CoverageReport,
  FileCoverage,
  CoverageBlock,
  CoverageMode,
  DirectoryCoverage,
  ParseResult
} from '../models/coverage';
import { PathResolver } from '../utils/path-resolver';

export class GoCoverageParser {
  private readonly MODE_REGEX = /^mode:\s*(set|count|atomic)$/;
  private readonly LINE_REGEX = /^(.+):(\d+)\.(\d+),(\d+)\.(\d+)\s+(\d+)\s+(\d+)$/;
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(coverageFilePath: string, workspaceRoot: string): Promise<ParseResult> {
    try {
      const exists = await this.pathResolver.exists(coverageFilePath);
      if (!exists) {
        return {
          success: false,
          error: `Coverage file not found: ${coverageFilePath}`
        };
      }

      const report = await this.parseFile(coverageFilePath, workspaceRoot);
      this.buildDirectoryTree(report);
      
      return {
        success: true,
        report
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async parseFile(coverageFilePath: string, workspaceRoot: string): Promise<CoverageReport> {
    const fileStream = fs.createReadStream(coverageFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const files = new Map<string, FileCoverage>();
    let mode: CoverageMode = 'set';

    for await (const line of rl) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) {
        continue;
      }

      const modeMatch = trimmedLine.match(this.MODE_REGEX);
      if (modeMatch) {
        mode = modeMatch[1] as CoverageMode;
        continue;
      }

      const lineMatch = trimmedLine.match(this.LINE_REGEX);
      if (lineMatch) {
        this.processLine(lineMatch, files);
      }
    }

    this.calculateFileCoverages(files);

    const totalStatements = Array.from(files.values())
      .reduce((sum, f) => sum + f.totalStatements, 0);
    const coveredStatements = Array.from(files.values())
      .reduce((sum, f) => sum + f.coveredStatements, 0);

    return {
      timestamp: new Date(),
      mode,
      files,
      directories: new Map(),
      totalCoverage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      coveredStatements,
      totalStatements,
      workspaceRoot
    };
  }

  private processLine(match: RegExpMatchArray, files: Map<string, FileCoverage>): void {
    const [, filePath, startLineStr, startColStr, endLineStr, endColStr, statementsStr, countStr] = match;
    
    const startLine = parseInt(startLineStr, 10);
    const startCol = parseInt(startColStr, 10);
    const endLine = parseInt(endLineStr, 10);
    const endCol = parseInt(endColStr, 10);
    const statements = parseInt(statementsStr, 10);
    const count = parseInt(countStr, 10);

    const absolutePath = this.pathResolver.resolveToAbsolute(filePath);

    if (!files.has(absolutePath)) {
      files.set(absolutePath, {
        filePath,
        absolutePath,
        blocks: [],
        lines: new Map(),
        coveredStatements: 0,
        totalStatements: 0,
        coveredLines: 0,
        totalLines: 0,
        percentage: 0
      });
    }

    const file = files.get(absolutePath)!;

    const block: CoverageBlock = {
      startLine,
      startCol,
      endLine,
      endCol,
      statements,
      count
    };
    file.blocks.push(block);

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const existing = file.lines.get(lineNum);
      if (existing) {
        existing.hitCount = Math.max(existing.hitCount, count);
        existing.covered = existing.covered || count > 0;
      } else {
        file.lines.set(lineNum, {
          lineNumber: lineNum,
          covered: count > 0,
          hitCount: count
        });
      }
    }

    file.totalStatements += statements;
    if (count > 0) {
      file.coveredStatements += statements;
    }
  }

  private calculateFileCoverages(files: Map<string, FileCoverage>): void {
    for (const file of files.values()) {
      file.totalLines = file.lines.size;
      file.coveredLines = Array.from(file.lines.values()).filter(l => l.covered).length;
      file.percentage = file.totalStatements > 0
        ? (file.coveredStatements / file.totalStatements) * 100
        : 0;
    }
  }

  private buildDirectoryTree(report: CoverageReport): void {
    const directories = new Map<string, DirectoryCoverage>();

    for (const file of report.files.values()) {
      const relativePath = this.pathResolver.resolveToRelative(file.absolutePath).replace(/\\/g, '/');
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

    for (const file of report.files.values()) {
      const relativePath = this.pathResolver.resolveToRelative(file.absolutePath).replace(/\\/g, '/');
      const dirPath = this.pathResolver.getDirectory(relativePath).replace(/\\/g, '/');
      
      if (dirPath && dirPath !== '.' && directories.has(dirPath)) {
        const dir = directories.get(dirPath)!;
        dir.files.push(file);
      }
    }

    for (const [dirPath, dir] of directories) {
      const parentPath = this.pathResolver.getDirectory(dirPath).replace(/\\/g, '/');
      if (parentPath && parentPath !== '.' && directories.has(parentPath)) {
        const parent = directories.get(parentPath)!;
        if (!parent.subdirectories.find(d => d.path === dirPath)) {
          parent.subdirectories.push(dir);
        }
      }
    }

    this.calculateDirectoryCoverages(directories);
    report.directories = directories;
  }

  private calculateDirectoryCoverages(directories: Map<string, DirectoryCoverage>): void {
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
  }
}
