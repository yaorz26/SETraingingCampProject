import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileExists } from '../utils/fileops.js';
import { validateConfig, type Config } from './schema.js';

export interface LoadConfigInput {
  workspaceRoot: string;
  cliArgs?: Partial<Config>;
  envVars?: Record<string, string>;
}

export async function loadConfig(input: LoadConfigInput): Promise<Config> {
  // 1. Default config
  const defaultResult = validateConfig({});
  let config: Config = defaultResult.success ? defaultResult.data : ({} as Config);

  // 2. Global config (~/.codeharness/config.yaml)
  const globalPath = path.join(os.homedir(), '.codeharness', 'config.yaml');
  if (await fileExists(globalPath)) {
    try {
      const content = await fs.readFile(globalPath, 'utf-8');
      const yaml = await parseYaml(content);
      const result = validateConfig(yaml);
      if (result.success) {
        config = mergeConfigs(config, result.data);
      }
    } catch {
      // Ignore global config errors
    }
  }

  // 3. Project config (.codeharness.yaml / .codeharness.yml)
  for (const name of ['.codeharness.yaml', '.codeharness.yml']) {
    const projectPath = path.join(input.workspaceRoot, name);
    if (await fileExists(projectPath)) {
      try {
        const content = await fs.readFile(projectPath, 'utf-8');
        const yaml = await parseYaml(content);
        const result = validateConfig(yaml);
        if (result.success) {
          config = mergeConfigs(config, result.data);
        }
      } catch {
        // Ignore project config errors
      }
      break;
    }
  }

  // 4. Environment variables (CODEHARNESS_ prefix)
  const envVars = input.envVars ?? (process.env as Record<string, string>);
  const envConfig = parseEnvVars(envVars);
  if (Object.keys(envConfig).length > 0) {
    const result = validateConfig(envConfig);
    if (result.success) {
      config = mergeConfigs(config, result.data);
    }
  }

  // 5. CLI args (highest priority)
  if (input.cliArgs) {
    const result = validateConfig(input.cliArgs);
    if (result.success) {
      config = mergeConfigs(config, result.data);
    }
  }

  return config;
}

export function mergeConfigs(base: Partial<Config>, override: Partial<Config>): Config {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const merged = deepMerge(base, override);
  // Validate the merged result
  const result = validateConfig(merged);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  return result.success ? result.data : (merged as Config);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
function deepMerge(target: any, source: any): any {
  if (source === undefined || source === null) return target;

  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
      output[key] = [...source[key]];
    } else if (isObject(source[key]) && isObject(output[key])) {
      output[key] = deepMerge(output[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseEnvVars(env: Record<string, string>): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('CODEHARNESS_')) continue;

    const path = key.replace('CODEHARNESS_', '').toLowerCase().split('__');
    if (path.length === 1) {
      config[path[0]] = parseEnvValue(value);
    } else {
      let current: Record<string, unknown> = config;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) {
          current[path[i]] = {};
        }
        current = current[path[i]] as Record<string, unknown>;
      }
      current[path[path.length - 1]] = parseEnvValue(value);
    }
  }

  return config;
}

function parseEnvValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  return value;
}

function parseYaml(content: string): unknown {
  // Simple YAML parser for the config structure
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [
    { obj: result, indent: -1 },
  ];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    // Pop stack to appropriate indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    if (value === '') {
      // Nested object
      const nested: Record<string, unknown> = {};
      current[key] = nested;
      stack.push({ obj: nested, indent });
    } else if (value.startsWith('- ')) {
      // Array item
      const itemValue = value.slice(2).trim();
      if (!Array.isArray(current[key])) {
        current[key] = [];
      }
      (current[key] as unknown[]).push(parseYamlValue(itemValue));
    } else {
      current[key] = parseYamlValue(value);
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  // Remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
