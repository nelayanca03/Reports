import { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
import {
  currentMonthKey,
  downloadTextFile,
  generateDailyFleetCsv,
  generateRecapCsv,
  generateVisitCsv,
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
  const lastSyncedAccountIdRef = useRef<string>('');

  // Sync valid person/outlet/task/day when role config or account changes
  useEffect(() => {
    const personList = getPersonList(activeConfig.outlets);
    const peopleMap = getPeopleMap(activeConfig.outlets);

    if (!accountId) {
      lastSyncedAccountIdRef.current = '';
    }
    const accountChanged = Boolean(accountId && lastSyncedAccountIdRef.current !== accountId);
    if (accountChanged) {
      lastSyncedAccountIdRef.current = accountId;
    }

    if (personList.length > 0) {
      const ownPic = resolveAccountPic(currentAccount, activeConfig.outlets);
      let nextPerson = selectedPerson;
      if (accountChanged || !nextPerson || !personList.includes(nextPerson)) {
        nextPerson =
          ownPic && personList.includes(ownPic)
            ? ownPic
            : personList[0];
        if (nextPerson !== selectedPerson) {
          setSelectedPerson(nextPerson);
        }
      }

      const outletsForPerson = peopleMap[nextPerson] || [];
      if (
        outletsForPerson.length > 0 &&
        (accountChanged || !outletsForPerson.includes(selectedOutlet))
      ) {
        if (outletsForPerson[0] !== selectedOutlet) {
          setSelectedOutlet(outletsForPerson[0]);
        }
      }
    } else {
      if (selectedPerson) setSelectedPerson('');
      if (selectedOutlet) setSelectedOutlet('');
    }
  }, [accountId, activeConfig.outlets, currentAccount, selectedPerson, selectedOutlet]);

  useEffect(() => {
    if (
      activeConfig.tasks.length > 0 &&
      !activeConfig.tasks.some((t) => t.key === selectedTask)
    ) {
      setSelectedTask(activeConfig.tasks[0].key);
    }
  }, [activeConfig.tasks, selectedTask]);

  useEffect(() => {
    if (days.length === 0) return;
    const today = todayIso();
    const curMonth = currentMonthKey(today);
    if (!days.includes(selectedDay)) {
      setSelectedDay(
        activeMonth === curMonth
          ? nearestWorkingDay(days, yesterdayIso())
          : activeMonth < curMonth
            ? days[days.length - 1]
            : days[0]
      );
    }
    if (recapDate.slice(0, 7) !== activeMonth) {
      setRecapDate(
        activeMonth === curMonth
          ? today
          : activeMonth < curMonth
            ? days[days.length - 1]
            : days[0]
      );
    }
    if (rekapRangeFrom.slice(0, 7) !== activeMonth) {
      setRekapRangeFrom(days[0]);
    }
    if (rekapRangeTo.slice(0, 7) !== activeMonth) {
      setRekapRangeTo(
        activeMonth === curMonth
          ? today
          : activeMonth < curMonth
            ? days[days.length - 1]
            : days[0]
      );
    }
  }, [days, selectedDay, activeMonth, recapDate, rekapRangeFrom, rekapRangeTo]);

  // Reset to Kalender when user logs in
  useEffect(() => {
    if (authStatus === 'ready' && accountId) {
      setActiveView('calendar');
    }
  }, [authStatus, accountId]);

  useEffect(() => {
    if (
      currentAccount &&
      currentAccount.role !== 'admin' &&
      (activeView === 'rekap' ||
        activeView === 'export' ||
        activeView === 'admin_tasks' ||
        activeView === 'admin_accounts' ||
        activeView === 'admin_logs')
    ) {
      setActiveView('calendar');
    }
  }, [currentAccount, activeView]);

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
  const peopleMap = getPeopleMap(activeConfig.outlets);

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

  const handleQuickExportCsv = () => {
    if (!isAdmin) return;
    const today = todayIso();
    if (activeView === 'rekap') {
      const upto =
        rekapDateMode === 'range'
          ? rekapRangeTo > today
            ? today
            : rekapRangeTo
          : recapDate;
      const from =
        rekapDateMode === 'range'
          ? rekapRangeFrom > upto
            ? upto
            : rekapRangeFrom
          : undefined;
      const fileSlug = from ? `${from}_sd_${upto}` : upto;
      downloadTextFile(
        `ranking-${activeConfig.roleId}-${selectedTask}-${fileSlug}.csv`,
        generateRecapCsv(store, days, activeConfig, selectedTask, upto, today, from),
        'text/csv;charset=utf-8'
      );
      return;
    }
    if (activeView === 'kunj') {
      downloadTextFile(
        `kunjungan-${activeConfig.roleId}-${today}.csv`,
        generateVisitCsv(store, days, activeConfig),
        'text/csv;charset=utf-8'
      );
      return;
    }
    downloadTextFile(
      `update-${activeConfig.roleId}-${selectedDay}.csv`,
      generateDailyFleetCsv(store, days, activeConfig, selectedDay, today, isAdmin),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        account={currentAccount}
        activeRoleId={activeRoleId}
        onChangeRoleId={(rId) => {
          setActiveRoleId(rId);
          if (activeView === 'admin_tasks' || activeView === 'admin_accounts') {
            setActiveView('input');
          }
        }}
        activeView={activeView}
        onSelectView={setActiveView}
        firebaseStorage={firebaseStorage}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSignOut={signOutUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeView={activeView}
          roleLabel={activeConfig.label}
          isAdmin={isAdmin}
          activeMonth={activeMonth}
          selectableMonths={selectableMonths}
          onChangeMonth={setActiveMonth}
          firebaseStorage={firebaseStorage}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickExportCsv={handleQuickExportCsv}
        />

        <main
          className={
            activeView === 'calendar'
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
            {activeView === 'calendar' && (
              <KalenderView
                account={currentAccount}
                events={calendarEvents}
                onCreateEvent={createCalendarEvent}
                onUpdateEvent={updateCalendarEvent}
                onDeleteEvent={deleteCalendarEvent}
              />
            )}

            {activeView === 'input' && (
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
                selectedPerson={selectedPerson}
                selectedOutlet={selectedOutlet}
                selectedDay={selectedDay}
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

            {activeView === 'rekap' && isAdmin && (
              <RekapRankingView
                config={activeConfig}
                store={store}
                days={days}
                selectedTask={selectedTask}
                recapDate={recapDate}
                recapDateMode={rekapDateMode}
                rangeFrom={rekapRangeFrom}
                rangeTo={rekapRangeTo}
                onChangeTask={setSelectedTask}
                onChangeRecapDate={setRecapDate}
                onChangeRecapDateMode={setRekapDateMode}
                onChangeRangeFrom={setRekapRangeFrom}
                onChangeRangeTo={setRekapRangeTo}
                onJumpToOutlet={handleJumpToInput}
              />
            )}

            {activeView === 'kunj' && (
              <KunjunganView
                account={currentAccount}
                isAdmin={isAdmin}
                config={activeConfig}
                store={store}
                days={days}
                selectedPerson={selectedPerson}
                onSaveVisitDay={saveVisitDay}
                onJumpToInput={handleJumpToInput}
              />
            )}

            {activeView === 'export' && isAdmin && (
              <AdminExportTools
                alwaysExpanded
                config={activeConfig}
                roleConfigs={roleConfigs}
                store={store}
                allWorkspaces={allWorkspaces}
                inputLogs={inputLogs}
                days={days}
                activeMonth={activeMonth}
                selectableMonths={selectableMonths}
                selectedDay={selectedDay}
                onImportStore={importWorkspaceData}
                onResetAllData={resetRoleWorkspace}
                onOpenAdminTasks={() => setActiveView('admin_tasks')}
              />
            )}

            {activeView === 'admin_tasks' && isAdmin && (
              <AdminTasksOutletsView
                roleConfigs={roleConfigs}
                initialRoleId={activeRoleId}
                accounts={managedAccounts}
                onSaveRoleConfig={saveRoleConfig}
                onSaveOpenUntilMonthAllRoles={saveOpenUntilMonthAllRoles}
                onTogglePastMonthAllRoles={togglePastMonthAllRoles}
              />
            )}

            {activeView === 'admin_accounts' && isAdmin && (
              <AdminAccountsView
                accounts={managedAccounts}
                roleConfigs={roleConfigs}
                isPrimaryAdmin={isPrimaryAdmin}
                onSaveAccount={saveAccount}
                onDeleteAccount={deleteAccount}
              />
            )}

            {activeView === 'admin_logs' && isAdmin && (
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
