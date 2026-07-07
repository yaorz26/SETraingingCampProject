import semver from 'semver';

export function checkNodeVersion(requiredVersion = '18.0.0'): void {
  const current = process.versions.node;
  if (!semver.satisfies(current, `>=${requiredVersion}`)) {
    process.stderr.write(
      `Error: Node.js ${requiredVersion}+ is required. Current version: ${current}\n`,
    );
    process.exit(10);
  }
}

export function checkVersion(current: string, latest: string): boolean {
  try {
    return semver.gt(latest, current);
  } catch {
    return false;
  }
}
