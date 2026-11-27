export type AccountRole = 'admin' | 'stock_accounting' | 'gl' | 'accounting';
export type OperationalRoleId = 'stock_accounting' | 'gl' | 'accounting';
export type RecordPrefix = 'SA' | 'GL';
export type RecordDepartment = 'stock_accounting' | 'gl';
export type FormulaType = 'daily_plus_1' | 'weekly_plus_1' | 'memo_month' | 'ref_task';
export type TaskInputType = 'date' | 'week' | 'month';
export type InputLogActionType = 'input_harian' | 'kunjungan';
export type InputLogItemAction = 'set' | 'clear' | 'edit';

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

export type DayAdjustmentType =
  | 'off_day'
  | 'cuti_izin'
  | 'cuti_bersama'
  | 'libur_nasional';

export type DayAdjustmentScope = 'person' | 'role' | 'all';

export interface WorkingDayAdjustment {
  id: string;
  type: DayAdjustmentType;
  scope: DayAdjustmentScope;
  pic?: string;
  dateFrom: string;
  dateTo: string;
  note?: string;
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
  outletsByPic?: Record<string, string[]>;
  dayAdjustments?: WorkingDayAdjustment[];
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
  taskKey?: string;
  prevDate?: string;
  newDate?: string;
  prevNote?: string;
  newNote?: string;
  action?: InputLogItemAction;
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
  effectiveDays?: number;
  totalDays?: number;
  adjustedDays?: number;
}

export interface VisitPersonStats {
  person: string;
  visitedCount: number;
  totalVisits: number;
  elapsedDays: number;
  adjustedDays?: number;
  rate: number;
}

export interface FirebaseStorageStats {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usedPercent: number;
  totalDocs: number;
}

export type CalendarRecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  visibleTo: OperationalRoleId[];
  notes: string;
  repeatFreq?: CalendarRecurrenceFreq;
  repeatInterval?: number;
  repeatUntil?: string;
  repeatWeekdays?: number[];
  excludedDates?: string[];
  createdBy: string;
  updatedBy: string;
  createdByEmail: string;
  createdByName: string;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export interface CalendarBannerMedia {
  id: string;
  imageDataUrl: string;
  caption: string;
  fileName: string;
  sortOrder?: number;
  updatedBy: string;
  updatedByName: string;
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

export interface AdminResetSecurityRecord {
  passwordHash: string;
  salt: string;
  iterations: number;
  updatedBy: string;
  updatedAtIso?: string;
}

export interface FullUserResetSummary {
  workspacesCleared: number;
  monthlyDocsDeleted: number;
  savedRecordsDeleted: number;
  countersDeleted: number;
  inputLogsDeleted: number;
}

export type AppView =
  | 'calendar'
  | 'input'
  | 'rekap'
  | 'kunj'
  | 'export'
  | 'admin_tasks'
  | 'admin_accounts'
  | 'admin_logs';
