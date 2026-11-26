import rawAppConfig from '../../app.config.json';

export interface AppConfig {
  ownerEmail: string;
  defaultStartDate: string;
  defaultWorkingDays: number;
  minWorkspaceMonth: string;
}

function readEnvVar(key: string): string | undefined {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (metaEnv && typeof metaEnv[key] === 'string' && metaEnv[key]!.trim()) {
    return metaEnv[key]!.trim();
  }
  if (
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env[key] === 'string' &&
    process.env[key]!.trim()
  ) {
    return process.env[key]!.trim();
  }
  return undefined;
}

function resolveEmail(fallback: string): string {
  const override = readEnvVar('VITE_OWNER_EMAIL');
  if (override && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(override)) {
    return override.toLowerCase();
  }
  return fallback.trim().toLowerCase();
}

function resolveIsoDate(key: string, fallback: string): string {
  const override = readEnvVar(key);
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return override;
  }
  return fallback;
}

function resolveMonthKey(key: string, fallback: string): string {
  const override = readEnvVar(key);
  if (override && /^\d{4}-\d{2}$/.test(override)) {
    return override;
  }
  return fallback;
}

function resolveWorkingDays(key: string, fallback: number): number {
  const override = readEnvVar(key);
  if (override) {
    const parsed = Number(override);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 60) {
      return parsed;
    }
  }
  return fallback;
}

export const APP_CONFIG: Readonly<AppConfig> = Object.freeze({
  ownerEmail: resolveEmail(rawAppConfig.ownerEmail),
  defaultStartDate: resolveIsoDate('VITE_DEFAULT_START_DATE', rawAppConfig.defaultStartDate),
  defaultWorkingDays: resolveWorkingDays(
    'VITE_DEFAULT_WORKING_DAYS',
    rawAppConfig.defaultWorkingDays
  ),
  minWorkspaceMonth: resolveMonthKey('VITE_MIN_WORKSPACE_MONTH', rawAppConfig.minWorkspaceMonth),
});
