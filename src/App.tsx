import { useEffect, useState } from 'react';
import { AdminAccountsView } from './components/AdminAccountsView';
import { AdminLogsView } from './components/AdminLogsView';
import { AdminTasksOutletsView } from './components/AdminTasksOutletsView';
import { DataEksporView } from './components/DataEksporView';
import { InputHarianView } from './components/InputHarianView';
import { KunjunganView } from './components/KunjunganView';
import { LoginView } from './components/LoginView';
import { RekapRankingView } from './components/RekapRankingView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
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
  } = useAuthAndRoleData();

  const [activeView, setActiveView] = useState<AppView>('input');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const [selectedOutlet, setSelectedOutlet] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    nearestWorkingDay(days, yesterdayIso())
  );

  const [selectedTask, setSelectedTask] = useState<string>('memo');
  const [recapDate, setRecapDate] = useState<string>(() => todayIso());

  // Sync valid person/outlet/task/day when role config or account changes
  useEffect(() => {
    const personList = getPersonList(activeConfig.outlets);
    const peopleMap = getPeopleMap(activeConfig.outlets);

    if (personList.length > 0) {
      let nextPerson = selectedPerson;
      if (!nextPerson || !personList.includes(nextPerson)) {
        const matchedByPic = currentAccount?.picName
          ? personList.find(
              (p) => p.toUpperCase() === currentAccount.picName.trim().toUpperCase()
            )
          : undefined;
        const matchedByName = currentAccount?.name
          ? personList.find(
              (p) => p.toUpperCase() === currentAccount.name.trim().toUpperCase()
            )
          : undefined;
        nextPerson = matchedByPic || matchedByName || personList[0];
        setSelectedPerson(nextPerson);
      }

      const outletsForPerson = peopleMap[nextPerson] || [];
      if (outletsForPerson.length > 0 && !outletsForPerson.includes(selectedOutlet)) {
        setSelectedOutlet(outletsForPerson[0]);
      }
    } else {
      setSelectedPerson('');
      setSelectedOutlet('');
    }
  }, [activeConfig.outlets, currentAccount?.name, currentAccount?.picName, selectedPerson, selectedOutlet]);

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
  }, [days, selectedDay, activeMonth, recapDate]);

  useEffect(() => {
    if (
      currentAccount &&
      currentAccount.role !== 'admin' &&
      (activeView === 'rekap' ||
        activeView === 'data' ||
        activeView === 'admin_tasks' ||
        activeView === 'admin_accounts' ||
        activeView === 'admin_logs')
    ) {
      setActiveView('input');
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
    setActiveView('input');
  };

  const handleQuickExportCsv = () => {
    if (!isAdmin) return;
    const today = todayIso();
    if (activeView === 'rekap') {
      downloadTextFile(
        `ranking-${activeConfig.roleId}-${selectedTask}-${recapDate}.csv`,
        generateRecapCsv(store, days, activeConfig, selectedTask, recapDate, today),
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

        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6">
          {activeView === 'input' && (
            <InputHarianView
              config={activeConfig}
              store={store}
              days={days}
              isAdmin={isAdmin}
              selectedPerson={selectedPerson}
              selectedOutlet={selectedOutlet}
              selectedDay={selectedDay}
              onChangePerson={handleChangePerson}
              onChangeOutlet={setSelectedOutlet}
              onChangeDay={setSelectedDay}
              onSaveOutletDay={saveOutletDayEntries}
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
              onChangeTask={setSelectedTask}
              onChangeRecapDate={setRecapDate}
              onJumpToOutlet={handleJumpToInput}
            />
          )}

          {activeView === 'kunj' && (
            <KunjunganView
              config={activeConfig}
              store={store}
              days={days}
              selectedPerson={selectedPerson}
              onSaveVisitDay={saveVisitDay}
              onJumpToInput={handleJumpToInput}
            />
          )}

          {activeView === 'data' && isAdmin && (
            <DataEksporView
              config={activeConfig}
              roleConfigs={roleConfigs}
              store={store}
              allWorkspaces={allWorkspaces}
              inputLogs={inputLogs}
              days={days}
              activeMonth={activeMonth}
              selectableMonths={selectableMonths}
              isAdmin={isAdmin}
              selectedDay={selectedDay}
              onImportStore={importWorkspaceData}
              onResetAllData={resetRoleWorkspace}
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
        </main>
      </div>
    </div>
  );
}
