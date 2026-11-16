export type AccountRole = 'admin' | 'stock_accounting' | 'gl' | 'accounting';
export type OperationalRoleId = 'stock_accounting' | 'gl' | 'accounting';
export type FormulaType = 'daily_plus_1' | 'memo_month' | 'ref_task';
export type TaskInputType = 'date' | 'month';

export interface TaskDefinition {
  key: string;
  label: string;
  shortLabel: string;
  defaultDate: string;
  inputType?: TaskInputType;
  formulaType: FormulaType;
  refTaskKey?: string;
  toleranceOffset?: number;
  formulaNote: string;
}

export interface OutletAssignment {
  code: string;
  person: string;
}

export interface RoleConfig {
  roleId: OperationalRoleId;
  label: string;
  start: string;
  ndays: number;
  tasks: TaskDefinition[];
  outlets: OutletAssignment[];
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  picName: string;
  active: boolean;
}

export interface EntryItem {
  d: string;
  n: string;
  ts?: string;
}

export interface VisitItem {
  ok: boolean;
  f: string;
  t: string;
  n: string;
}

export interface OutletStoreState {
  ent: Record<string, Record<string, EntryItem>>;
  visit: Record<string, VisitItem>;
  start: string;
}

export type EntrySource = 'own' | 'inherited' | 'default';

export interface ResolvedEntry {
  d: string;
  n: string;
  ts?: string;
  own: boolean;
  source: EntrySource;
  sourceDay?: string;
}

export interface CalculatedTask extends ResolvedEntry {
  task: string;
  label: string;
  rumus: string;
  pm: number;
  pend: boolean;
}

export interface OutletRecap {
  outlet: string;
  person: string;
  avg: number;
  pend: number;
  latestDate: string;
  latestPm: number;
  latestPend: boolean;
  latestNote: string;
}

export interface VisitPersonStats {
  person: string;
  visitedCount: number;
  elapsedDays: number;
  rate: number;
}

export type AppView =
  | 'input'
  | 'rekap'
  | 'kunj'
  | 'data'
  | 'admin_tasks'
  | 'admin_accounts';
