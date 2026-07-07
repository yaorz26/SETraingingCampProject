import path from 'path';
import {
  findWorkspaceRoot,
  isWithinWorkspace,
  resolveWorkspacePath,
} from '../../../src/utils/workspace.js';

describe('findWorkspaceRoot', () => {
  it('should return the current directory if it contains .git', () => {
    // This test uses the actual project directory which has .git
    const root = findWorkspaceRoot(__dirname);
    // Should find the project root (which has .git)
    expect(root).toBeTruthy();
    expect(typeof root).toBe('string');
  });

  it('should walk up to find the nearest .git directory', () => {
    // From a subdirectory, should find the parent with .git
    const root = findWorkspaceRoot(__dirname);
    expect(root).toBeTruthy();
    // The root should be a parent of or equal to the current directory
    expect(__dirname.startsWith(root!)).toBe(true);
  });

  it('should return null when no .git is found', () => {
    // Use a temp directory path that doesn't exist
    const root = findWorkspaceRoot('/tmp/nonexistent/test/dir');
    expect(root).toBeNull();
  });

  it('should stop at filesystem root', () => {
    // On Windows, C:\ should stop
    const root = findWorkspaceRoot('C:\\');
    expect(root).toBeNull();
  });
});

describe('isWithinWorkspace', () => {
  it('should return true for paths within workspace', () => {
    const workspace = '/home/user/project';
    expect(isWithinWorkspace('/home/user/project/src/file.ts', workspace)).toBe(true);
  });

  it('should return false for paths outside workspace', () => {
    const workspace = '/home/user/project';
    expect(isWithinWorkspace('/home/user/other/file.ts', workspace)).toBe(false);
  });

  it('should return true for the workspace root itself', () => {
    const workspace = '/home/user/project';
    expect(isWithinWorkspace('/home/user/project', workspace)).toBe(true);
  });

  it('should handle Windows paths', () => {
    const workspace = 'C:\\Users\\dev\\project';
    expect(isWithinWorkspace('C:\\Users\\dev\\project\\src\\file.ts', workspace)).toBe(true);
    expect(isWithinWorkspace('C:\\Users\\dev\\other\\file.ts', workspace)).toBe(false);
  });

  it('should handle relative paths correctly', () => {
    const workspace = '/home/user/project';
    expect(isWithinWorkspace('./src/file.ts', workspace)).toBe(true);
  });
});

describe('resolveWorkspacePath', () => {
  it('should resolve relative paths against workspace', () => {
    const result = resolveWorkspacePath('src/file.ts', '/home/user/project');
    const expected = path.resolve('/home/user/project', 'src/file.ts');
    expect(result).toBe(expected);
  });

  it('should return absolute paths unchanged if within workspace', () => {
    const absolutePath = path.resolve('/home/user/project/src/file.ts');
    const result = resolveWorkspacePath(absolutePath, '/home/user/project');
    expect(result).toBe(absolutePath);
  });
});
