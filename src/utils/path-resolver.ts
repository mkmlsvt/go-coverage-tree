import * as path from 'path';
import * as fs from 'fs';

export class PathResolver {
  private moduleName: string | null = null;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async initialize(): Promise<void> {
    await this.detectGoModule();
  }

  private async detectGoModule(): Promise<void> {
    const goModPath = path.join(this.workspaceRoot, 'go.mod');
    
    try {
      const content = await fs.promises.readFile(goModPath, 'utf-8');
      const match = content.match(/^module\s+(.+)$/m);
      if (match) {
        this.moduleName = match[1].trim();
        console.log(`[Go Coverage] Detected module: ${this.moduleName}`);
      }
    } catch {
      console.log('[Go Coverage] No go.mod found in workspace root');
    }
  }

  resolveToAbsolute(coveragePath: string): string {
    if (this.moduleName && coveragePath.startsWith(this.moduleName + '/')) {
      const relativePath = coveragePath.substring(this.moduleName.length + 1);
      return path.join(this.workspaceRoot, relativePath);
    }

    if (this.moduleName && coveragePath.startsWith(this.moduleName)) {
      const relativePath = coveragePath.substring(this.moduleName.length);
      if (relativePath.startsWith('/')) {
        return path.join(this.workspaceRoot, relativePath.substring(1));
      }
      if (relativePath === '') {
        return this.workspaceRoot;
      }
      return path.join(this.workspaceRoot, relativePath);
    }

    const workspaceFolderName = path.basename(this.workspaceRoot);
    if (coveragePath.startsWith(workspaceFolderName + '/')) {
      const relativePath = coveragePath.substring(workspaceFolderName.length + 1);
      return path.join(this.workspaceRoot, relativePath);
    }

    if (path.isAbsolute(coveragePath)) {
      return coveragePath;
    }

    return path.join(this.workspaceRoot, coveragePath);
  }

  resolveToRelative(absolutePath: string): string {
    return path.relative(this.workspaceRoot, absolutePath);
  }

  getDirectory(filePath: string): string {
    return path.dirname(filePath);
  }

  getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  normalizePath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
  }

  joinPath(...parts: string[]): string {
    return path.join(...parts);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
