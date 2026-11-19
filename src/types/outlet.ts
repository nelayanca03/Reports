export type AccountRole = 'admin' | 'stock_accounting' | 'gl' | 'accounting';
export type OperationalRoleId = 'stock_accounting' | 'gl' | 'accounting';
export type RecordPrefix = 'SA' | 'GL';
export type RecordDepartment = 'stock_accounting' | 'gl';
export type FormulaType = 'daily_plus_1' | 'memo_month' | 'ref_task';
export type TaskInputType = 'date' | 'month';
export type InputLogActionType = 'input_harian' | 'kunjungan';

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
  openUntilMonth?: string;
  unlockedPastMonths?: string[];
  tasks: TaskDefinition[];
  outlets: OutletAssignment[];
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  picName: string;
  refPrefix?: RecordPrefix;
  active: boolean;
}

export interface EntryItem {
  d: string;
  n: string;
  ts?: string;
  byAdmin?: boolean;
}

export interface VisitEntry {
  id: string;
  outlet: string;
  f: string;
  t: string;
  n: string;
}

export interface VisitItem {
  ok: boolean;
  outlet?: string;
  f: string;
  t: string;
  n: string;
  entries?: VisitEntry[];
}

export interface InputLogEntry {
  id: string;
  uid: string;
  userEmail: string;
  userName: string;
  userRole: AccountRole;
  roleId: OperationalRoleId;
  roleLabel: string;
  actionType: InputLogActionType;
  pic: string;
  outlet: string;
  day: string;
  details: string;
  itemCount: number;
  clientTs: string;
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
  byAdmin?: boolean;
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
  backfillDays?: number;
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
  hasAnyInput: boolean;
  backfillCount: number;
}

export interface VisitPersonStats {
  person: string;
  visitedCount: number;
  totalVisits: number;
  elapsedDays: number;
  rate: number;
}

export interface FirebaseStorageStats {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usedPercent: number;
  totalDocs: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  visibleTo: OperationalRoleId[];
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdByEmail: string;
  createdByName: string;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export interface SavedRecord {
  id: string;
  refCode: string;
  prefix: RecordPrefix;
  yymm: string;
  department: RecordDepartment;
  date: string;
  pic: string;
  outlet: string;
  summary: string;
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdByEmail: string;
  createdByName: string;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export type AppView =
  | 'calendar'
  | 'input'
  | 'rekap'
  | 'kunj'
  | 'data'
  | 'admin_tasks'
  | 'admin_accounts'
  | 'admin_logs';
