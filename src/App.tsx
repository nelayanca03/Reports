import { Suspense, lazy, useState } from 'react';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';

const AdminAccountsView = lazy(() =>
  import('./components/AdminAccountsView').then((m) => ({ default: m.AdminAccountsView }))
);
const AdminExportTools = lazy(() =>
  import('./components/AdminExportTools').then((m) => ({ default: m.AdminExportTools }))
);
const AdminLogsView = lazy(() =>
  import('./components/AdminLogsView').then((m) => ({ default: m.AdminLogsView }))
);
const AdminTasksOutletsView = lazy(() =>
  import('./components/AdminTasksOutletsView').then((m) => ({ default: m.AdminTasksOutletsView }))
);
const InputHarianView = lazy(() =>
  import('./components/InputHarianView').then((m) => ({ default: m.InputHarianView }))
);
const KalenderView = lazy(() =>
  import('./components/KalenderView').then((m) => ({ default: m.KalenderView }))
);
const KunjunganView = lazy(() =>
  import('./components/KunjunganView').then((m) => ({ default: m.KunjunganView }))
);
const RekapRankingView = lazy(() =>
  import('./components/RekapRankingView').then((m) => ({ default: m.RekapRankingView }))
);
import { BOOTSTRAPPED_ADMIN_EMAIL } from './firebase';
import { useAuthAndRoleData } from './hooks/useAuthAndRoleData';
import { AppView } from './types/outlet';
import { downloadXlsxWorkbook } from './utils/exportXlsx';
import {
  buildDailyFleetTable,
  buildRecapTable,
  buildVisitTable,
  currentMonthKey,
  getPeopleMap,
  getPersonList,
  nearestWorkingDay,
  resolveAccountPic,
  todayIso,
  yesterdayIso,
} from './utils/outletLogic';

export default function App() {
  const {
    firebaseUser,
    authStatus,
    authError,
    currentAccount,
    activeRoleId,
    setActiveRoleId,
    activeMonth,
    setActiveMonth,
    selectableMonths,
    roleConfigs,
    activeConfig,
    days,
    store,
    allWorkspaces,
    managedAccounts,
    inputLogs,
    calendarEvents,
    savedRecords,
    firebaseStorage,
    theme,
    toggleTheme,
    signInWithGoogle,
    signOutUser,
    saveOutletDayEntries,
    saveVisitDay,
    saveRoleConfig,
    saveOpenUntilMonthAllRoles,
    togglePastMonthAllRoles,
    saveDayAdjustmentAllRoles,
    deleteDayAdjustmentAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  } = useAuthAndRoleData();

  const [activeView, setActiveView] = useState<AppView>('calendar');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const [selectedOutlet, setSelectedOutlet] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    nearestWorkingDay(days, yesterdayIso())
  );

  const [selectedTask, setSelectedTask] = useState<string>('memo');
  const [recapDate, setRecapDate] = useState<string>(() => todayIso());
  const [rekapDateMode, setRekapDateMode] = useState<'single' | 'range'>('single');
  const [rekapRangeFrom, setRekapRangeFrom] = useState<string>(() => days[0] || todayIso());
  const [rekapRangeTo, setRekapRangeTo] = useState<string>(() => todayIso());
  const [dailyModalJumpTrigger, setDailyModalJumpTrigger] = useState<number>(0);

  const accountId = currentAccount?.id || '';
  const [prevAccountId, setPrevAccountId] = useState<string>('');
  const [prevActiveMonth, setPrevActiveMonth] = useState<string>(activeMonth);

  const personList = getPersonList(activeConfig.outlets);
  const peopleMap = getPeopleMap(activeConfig.outlets);

  if (prevAccountId !== accountId) {
    setPrevAccountId(accountId);
    if (accountId) {
      setActiveView('calendar');
      if (personList.length > 0) {
        const ownPic = resolveAccountPic(currentAccount, activeConfig.outlets);
        const nextPerson =
          ownPic && personList.includes(ownPic) ? ownPic : personList[0];
        setSelectedPerson(nextPerson);
        setSelectedOutlet((peopleMap[nextPerson] || [])[0] || '');
      } else {
        setSelectedPerson('');
        setSelectedOutlet('');
      }
    } else {
      setSelectedPerson('');
      setSelectedOutlet('');
    }
  }

  if (prevActiveMonth !== activeMonth && days.length > 0) {
    setPrevActiveMonth(activeMonth);
    const today = todayIso();
    const curMonth = currentMonthKey(today);
    setSelectedDay(
      activeMonth === curMonth
        ? nearestWorkingDay(days, yesterdayIso())
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0]
    );
    setRecapDate(
      activeMonth === curMonth
        ? today
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0]
    );
    setRekapRangeFrom(days[0]);
    setRekapRangeTo(
      activeMonth === curMonth
        ? today
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0]
    );
  }

  const effectiveSelectedPerson =
    personList.length === 0
      ? ''
      : personList.includes(selectedPerson)
        ? selectedPerson
        : (() => {
            const ownPic = resolveAccountPic(currentAccount, activeConfig.outlets);
            return ownPic && personList.includes(ownPic) ? ownPic : personList[0];
          })();

  const outletsForEffectivePerson = peopleMap[effectiveSelectedPerson] || [];
  const effectiveSelectedOutlet =
    outletsForEffectivePerson.length === 0
      ? ''
      : outletsForEffectivePerson.includes(selectedOutlet)
        ? selectedOutlet
        : outletsForEffectivePerson[0];

  const effectiveSelectedTask =
    activeConfig.tasks.length > 0 &&
    !activeConfig.tasks.some((t) => t.key === selectedTask)
      ? activeConfig.tasks[0].key
      : selectedTask;

  const today = todayIso();
  const curMonth = currentMonthKey(today);
  const effectiveSelectedDay =
    days.length === 0 || days.includes(selectedDay)
      ? selectedDay
      : activeMonth === curMonth
        ? nearestWorkingDay(days, yesterdayIso())
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0];

  const effectiveRecapDate =
    days.length === 0 || recapDate.slice(0, 7) === activeMonth
      ? recapDate
      : activeMonth === curMonth
        ? today
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0];

  const effectiveRekapRangeFrom =
    days.length === 0 || rekapRangeFrom.slice(0, 7) === activeMonth
      ? rekapRangeFrom
      : days[0];

  const effectiveRekapRangeTo =
    days.length === 0 || rekapRangeTo.slice(0, 7) === activeMonth
      ? rekapRangeTo
      : activeMonth === curMonth
        ? today
        : activeMonth < curMonth
          ? days[days.length - 1]
          : days[0];

  const safeActiveView: AppView =
    currentAccount &&
    currentAccount.role !== 'admin' &&
    (activeView === 'rekap' ||
      activeView === 'export' ||
      activeView === 'admin_tasks' ||
      activeView === 'admin_accounts' ||
      activeView === 'admin_logs')
      ? 'calendar'
      : activeView;

  // Gate entry on login & account authorization
  if (authStatus !== 'ready' || !currentAccount) {
    return (
      <LoginView
        authStatus={authStatus}
        userEmail={firebaseUser?.email || null}
        authError={authError}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignIn={signInWithGoogle}
        onSignOut={signOutUser}
      />
    );
  }

  const isAdmin = currentAccount.role === 'admin';
  const isPrimaryAdmin = currentAccount.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  const handleChangePerson = (person: string) => {
    setSelectedPerson(person);
    const firstOutlet = (peopleMap[person] || [])[0] || '';
    setSelectedOutlet(firstOutlet);
  };

  const handleJumpToInput = (person: string, outlet: string, day: string) => {
    setSelectedPerson(person);
    setSelectedOutlet(outlet);
    setSelectedDay(days.includes(day) ? day : nearestWorkingDay(days, day));
    setDailyModalJumpTrigger((n) => n + 1);
    setActiveView('input');
  };

  const handleQuickExportXlsx = () => {
    if (!isAdmin) return;
    const exportToday = todayIso();
    if (safeActiveView === 'rekap') {
      const upto =
        rekapDateMode === 'range'
          ? effectiveRekapRangeTo > exportToday
            ? exportToday
            : effectiveRekapRangeTo
          : effectiveRecapDate;
      const from =
        rekapDateMode === 'range'
          ? effectiveRekapRangeFrom > upto
            ? upto
            : effectiveRekapRangeFrom
          : undefined;
      const fileSlug = from ? `${from}_sd_${upto}` : upto;
      const table = buildRecapTable(
        store,
        days,
        activeConfig,
        effectiveSelectedTask,
        upto,
        exportToday,
        from
      );
      downloadXlsxWorkbook(
        `ranking-${activeConfig.roleId}-${effectiveSelectedTask}-${fileSlug}.xlsx`,
        [{ name: 'Ranking', columns: table.columns, rows: table.rows }]
      );
      return;
    }
    if (safeActiveView === 'kunj') {
      const table = buildVisitTable(store, days, activeConfig);
      downloadXlsxWorkbook(`kunjungan-${activeConfig.roleId}-${exportToday}.xlsx`, [
        { name: 'Kunjungan', columns: table.columns, rows: table.rows },
      ]);
      return;
    }
    const table = buildDailyFleetTable(
      store,
      days,
      activeConfig,
      effectiveSelectedDay,
      exportToday,
      isAdmin
    );
    downloadXlsxWorkbook(`update-${activeConfig.roleId}-${effectiveSelectedDay}.xlsx`, [
      { name: 'Update Harian', columns: table.columns, rows: table.rows },
    ]);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        account={currentAccount}
        activeRoleId={activeRoleId}
        onChangeRoleId={(rId) => {
          setActiveRoleId(rId);
          if (safeActiveView === 'admin_tasks' || safeActiveView === 'admin_accounts') {
            setActiveView('input');
          }
        }}
        activeView={safeActiveView}
        onSelectView={setActiveView}
        firebaseStorage={firebaseStorage}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSignOut={signOutUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeView={safeActiveView}
          roleLabel={activeConfig.label}
          isAdmin={isAdmin}
          activeMonth={activeMonth}
          selectableMonths={selectableMonths}
          onChangeMonth={setActiveMonth}
          firebaseStorage={firebaseStorage}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickExportXlsx={handleQuickExportXlsx}
        />

        <main
          className={
            safeActiveView === 'calendar'
              ? 'flex w-full flex-1 flex-col p-3 sm:p-4'
              : 'mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6'
          }
        >
          <Suspense
            fallback={
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Memuat tampilan...
              </div>
            }
          >
            {safeActiveView === 'calendar' && (
              <KalenderView
                account={currentAccount}
                events={calendarEvents}
                onCreateEvent={createCalendarEvent}
                onUpdateEvent={updateCalendarEvent}
                onDeleteEvent={deleteCalendarEvent}
              />
            )}

            {safeActiveView === 'input' && (
              <InputHarianView
                account={currentAccount}
                currentUserUid={firebaseUser?.uid || ''}
                activeRoleId={activeRoleId}
                config={activeConfig}
                roleConfigs={roleConfigs}
                store={store}
                savedRecords={savedRecords}
                days={days}
                isAdmin={isAdmin}
                selectedPerson={effectiveSelectedPerson}
                selectedOutlet={effectiveSelectedOutlet}
                selectedDay={effectiveSelectedDay}
                jumpTrigger={dailyModalJumpTrigger}
                onChangePerson={handleChangePerson}
                onChangeOutlet={setSelectedOutlet}
                onChangeDay={setSelectedDay}
                onSaveOutletDay={saveOutletDayEntries}
                onCreateSavedRecord={createSavedRecord}
                onUpdateSavedRecord={updateSavedRecord}
                onDeleteSavedRecord={deleteSavedRecord}
                onOpenAdminConfig={() => setActiveView('admin_tasks')}
              />
            )}

            {safeActiveView === 'rekap' && isAdmin && (
              <RekapRankingView
                config={activeConfig}
                store={store}
                days={days}
                selectedTask={effectiveSelectedTask}
                recapDate={effectiveRecapDate}
                recapDateMode={rekapDateMode}
                rangeFrom={effectiveRekapRangeFrom}
                rangeTo={effectiveRekapRangeTo}
                onChangeTask={setSelectedTask}
                onChangeRecapDate={setRecapDate}
                onChangeRecapDateMode={setRekapDateMode}
                onChangeRangeFrom={setRekapRangeFrom}
                onChangeRangeTo={setRekapRangeTo}
                onJumpToOutlet={handleJumpToInput}
              />
            )}

            {safeActiveView === 'kunj' && (
              <KunjunganView
                account={currentAccount}
                isAdmin={isAdmin}
                config={activeConfig}
                store={store}
                days={days}
                selectedPerson={effectiveSelectedPerson}
                onSaveVisitDay={saveVisitDay}
                onJumpToInput={handleJumpToInput}
              />
            )}

            {safeActiveView === 'export' && isAdmin && (
              <AdminExportTools
                alwaysExpanded
                config={activeConfig}
                roleConfigs={roleConfigs}
                store={store}
                allWorkspaces={allWorkspaces}
                inputLogs={inputLogs}
                savedRecords={savedRecords}
                calendarEvents={calendarEvents}
                managedAccounts={managedAccounts}
                days={days}
                activeMonth={activeMonth}
                selectableMonths={selectableMonths}
                selectedDay={effectiveSelectedDay}
                onImportStore={importWorkspaceData}
                onResetAllData={resetRoleWorkspace}
                onOpenAdminTasks={() => setActiveView('admin_tasks')}
              />
            )}

            {safeActiveView === 'admin_tasks' && isAdmin && (
              <AdminTasksOutletsView
                roleConfigs={roleConfigs}
                initialRoleId={activeRoleId}
                activeMonth={activeMonth}
                accounts={managedAccounts}
                onSaveRoleConfig={saveRoleConfig}
                onSaveOpenUntilMonthAllRoles={saveOpenUntilMonthAllRoles}
                onTogglePastMonthAllRoles={togglePastMonthAllRoles}
                onSaveDayAdjustmentAllRoles={saveDayAdjustmentAllRoles}
                onDeleteDayAdjustmentAllRoles={deleteDayAdjustmentAllRoles}
              />
            )}

            {safeActiveView === 'admin_accounts' && isAdmin && (
              <AdminAccountsView
                accounts={managedAccounts}
                roleConfigs={roleConfigs}
                isPrimaryAdmin={isPrimaryAdmin}
                onSaveAccount={saveAccount}
                onDeleteAccount={deleteAccount}
              />
            )}

            {safeActiveView === 'admin_logs' && isAdmin && (
              <AdminLogsView
                logs={inputLogs}
                accounts={managedAccounts}
                roleConfigs={roleConfigs}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
