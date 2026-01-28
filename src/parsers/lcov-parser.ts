import * as fs from 'fs';
import {
  CoverageReport,
  FileCoverage,
  DirectoryCoverage,
  ParseResult,
  LineCoverage
} from '../models/coverage';
import { PathResolver } from '../utils/path-resolver';

export class LcovParser {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(lcovFilePath: string, workspaceRoot: string): Promise<ParseResult> {
    try {
      const exists = await this.pathResolver.exists(lcovFilePath);
      if (!exists) {
        return {
          success: false,
          error: `LCOV file not found: ${lcovFilePath}`
        };
      }

      const content = await fs.promises.readFile(lcovFilePath, 'utf-8');
      const report = this.parseContent(content, workspaceRoot);
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

  private parseContent(content: string, workspaceRoot: string): CoverageReport {
    const files = new Map<string, FileCoverage>();
    const records = content.split('end_of_record');

    for (const record of records) {
      const trimmedRecord = record.trim();
      if (!trimmedRecord) {
        continue;
      }

      const file = this.parseRecord(trimmedRecord);
      if (file) {
        files.set(file.absolutePath, file);
      }
    }

    const totalStatements = Array.from(files.values())
      .reduce((sum, f) => sum + f.totalStatements, 0);
    const coveredStatements = Array.from(files.values())
      .reduce((sum, f) => sum + f.coveredStatements, 0);

    return {
      timestamp: new Date(),
      mode: 'count',
      files,
      directories: new Map(),
      totalCoverage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      coveredStatements,
      totalStatements,
      workspaceRoot
    };
  }

  private parseRecord(record: string): FileCoverage | null {
    const lines = record.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let filePath = '';
    let absolutePath = '';
    const lineData = new Map<number, LineCoverage>();
    let linesFound = 0;
    let linesHit = 0;

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        filePath = line.substring(3);
        absolutePath = this.pathResolver.resolveToAbsolute(filePath);
      } else if (line.startsWith('DA:')) {
        const [lineNumStr, hitCountStr] = line.substring(3).split(',');
        const lineNum = parseInt(lineNumStr, 10);
        const hitCount = parseInt(hitCountStr, 10);
        
        lineData.set(lineNum, {
          lineNumber: lineNum,
          covered: hitCount > 0,
          hitCount
        });
      } else if (line.startsWith('LF:')) {
        linesFound = parseInt(line.substring(3), 10);
      } else if (line.startsWith('LH:')) {
        linesHit = parseInt(line.substring(3), 10);
      }
    }

    if (!filePath) {
      return null;
    }

    const totalStatements = linesFound || lineData.size;
    const coveredStatements = linesHit || Array.from(lineData.values()).filter(l => l.covered).length;

    return {
      filePath,
      absolutePath,
      blocks: [],
      lines: lineData,
      coveredStatements,
      totalStatements,
      coveredLines: coveredStatements,
      totalLines: totalStatements,
      percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
    };
  }

  private buildDirectoryTree(report: CoverageReport): void {
    const directories = new Map<string, DirectoryCoverage>();

    for (const file of report.files.values()) {
      const relativePath = this.pathResolver.resolveToRelative(file.absolutePath);
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
      const relativePath = this.pathResolver.resolveToRelative(file.absolutePath);
      const dirPath = this.pathResolver.getDirectory(relativePath);
      
      if (dirPath && directories.has(dirPath)) {
        const dir = directories.get(dirPath)!;
        dir.files.push(file);
      }
    }

    for (const [dirPath, dir] of directories) {
      const parentPath = this.pathResolver.getDirectory(dirPath);
      if (parentPath && directories.has(parentPath)) {
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
