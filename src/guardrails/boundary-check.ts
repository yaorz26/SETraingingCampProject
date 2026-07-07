import path from 'path';
import { isWithinWorkspace } from '../utils/workspace.js';

export interface PathCheckResult {
  passed: boolean;
  isWithinWorkspace: boolean;
  resolvedPath: string;
  isSensitive: boolean;
  reason?: string;
}

const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /\.key$/i,
  /secret/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /authorized_keys/i,
  /known_hosts/i,
  /\/\.ssh\//i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
];

export function checkPath(targetPath: string, workspaceRoot: string): PathCheckResult {
  const resolvedPath = path.resolve(workspaceRoot, targetPath);

  const withinWorkspace = isWithinWorkspace(resolvedPath, workspaceRoot);

  if (!withinWorkspace) {
    return {
      passed: false,
      isWithinWorkspace: false,
      resolvedPath,
      isSensitive: true,
      reason: `Path '${targetPath}' is outside the workspace '${workspaceRoot}'`,
    };
  }

  const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(resolvedPath));
  if (isSensitive) {
    return {
      passed: false,
      isWithinWorkspace: true,
      resolvedPath,
      isSensitive: true,
      reason: `Path '${targetPath}' is a sensitive file (blocked for security)`,
    };
  }

  return {
    passed: true,
    isWithinWorkspace: true,
    resolvedPath,
    isSensitive: false,
  };
}
