import { fileURLToPath } from 'node:url';

const projectEnvironmentPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

export function loadProjectEnvironmentWhenMissing(variableName: string): void {
  if (process.env[variableName] === undefined) {
    process.loadEnvFile(projectEnvironmentPath);
  }
}
