export interface CoverageBlock {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  statements: number;
  count: number;
}

export interface LineCoverage {
  lineNumber: number;
  covered: boolean;
  hitCount: number;
}

export interface FileCoverage {
  filePath: string;
  absolutePath: string;
  blocks: CoverageBlock[];
  lines: Map<number, LineCoverage>;
  coveredStatements: number;
  totalStatements: number;
  coveredLines: number;
  totalLines: number;
  percentage: number;
}

export interface DirectoryCoverage {
  path: string;
  name: string;
  files: FileCoverage[];
  subdirectories: DirectoryCoverage[];
  coveredStatements: number;
  totalStatements: number;
  percentage: number;
}

export interface CoverageReport {
  timestamp: Date;
  mode: CoverageMode;
  files: Map<string, FileCoverage>;
  directories: Map<string, DirectoryCoverage>;
  totalCoverage: number;
  coveredStatements: number;
  totalStatements: number;
  workspaceRoot: string;
}

export type CoverageMode = 'set' | 'count' | 'atomic';

export type ThresholdLevel = 'none' | 'low' | 'medium' | 'high';

export interface ThresholdConfig {
  low: number;
  medium: number;
}

export interface CoverageConfig {
  coverageFilePath: string;
  autoWatch: boolean;
  showDecorations: boolean;
  showInlineHints: boolean;
  threshold: ThresholdConfig;
  testFlags: string;
  excludePatterns: string[];
}

export interface CoverageTreeItem {
  type: 'file' | 'directory' | 'root';
  name: string;
  path: string;
  coverage: number;
  coveredStatements: number;
  totalStatements: number;
  children?: CoverageTreeItem[];
}

export interface ParseResult {
  success: boolean;
  report?: CoverageReport;
  error?: string;
}

export function getThresholdLevel(percentage: number, config: ThresholdConfig): ThresholdLevel {
  if (percentage === 0) {
    return 'none';
  }
  if (percentage < config.low) {
    return 'low';
  }
  if (percentage < config.medium) {
    return 'medium';
  }
  return 'high';
}

export function formatPercentage(percentage: number): string {
  if (percentage === 100) {
    return '100%';
  }
  if (percentage === 0) {
    return '0%';
  }
  return `${Math.round(percentage)}%`;
}

export function formatBadge(percentage: number): string {
  const rounded = Math.round(percentage);
  if (rounded === 100) {
    return '💯';
  }
  return `${rounded}`;
}

export function createEmptyReport(workspaceRoot: string): CoverageReport {
  return {
    timestamp: new Date(),
    mode: 'set',
    files: new Map(),
    directories: new Map(),
    totalCoverage: 0,
    coveredStatements: 0,
    totalStatements: 0,
    workspaceRoot
  };
}
