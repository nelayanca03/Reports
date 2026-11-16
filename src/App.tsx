import { useEffect, useState } from 'react';
import { AdminAccountsView } from './components/AdminAccountsView';
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
  downloadTextFile,
  generateDailyFleetCsv,
  generateRecapCsv,
  generateVisitCsv,
  getPeopleMap,
  getPersonList,
  nearestWorkingDay,
  todayIso,
} from './utils/outletLogic';

export default function App() {
  const {
    firebaseUser,
    authStatus,
    authError,
    currentAccount,
    activeRoleId,
    setActiveRoleId,
    roleConfigs,
    activeConfig,
    days,
    store,
    managedAccounts,
    theme,
    toggleTheme,
    signInWithGoogle,
    signOutUser,
    updateEntry,
    clearEntryForDay,
    updateVisit,
    saveRoleConfig,
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
    nearestWorkingDay(days, todayIso())
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
        if (currentAccount?.picName && personList.includes(currentAccount.picName)) {
          nextPerson = currentAccount.picName;
        } else {
          nextPerson = personList[0];
        }
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
  }, [activeConfig.outlets, currentAccount?.picName, selectedPerson, selectedOutlet]);

  useEffect(() => {
    if (
      activeConfig.tasks.length > 0 &&
      !activeConfig.tasks.some((t) => t.key === selectedTask)
    ) {
      setSelectedTask(activeConfig.tasks[0].key);
    }
  }, [activeConfig.tasks, selectedTask]);

  useEffect(() => {
    if (!days.includes(selectedDay)) {
      setSelectedDay(nearestWorkingDay(days, todayIso()));
    }
  }, [days, selectedDay]);

  useEffect(() => {
    if (currentAccount && currentAccount.role !== 'admin' && activeView === 'rekap') {
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
    const today = todayIso();
    if (activeView === 'rekap') {
      if (!isAdmin) return;
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
      generateDailyFleetCsv(store, days, activeConfig, selectedDay, today),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
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
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        config={activeConfig}
        store={store}
        days={days}
        selectedDay={selectedDay}
        onSignOut={signOutUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeView={activeView}
          roleLabel={activeConfig.label}
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
              onUpdateEntry={updateEntry}
              onClearEntry={clearEntryForDay}
              onUpdateVisit={updateVisit}
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
              isAdmin={isAdmin}
              onUpdateVisit={updateVisit}
              onJumpToInput={handleJumpToInput}
            />
          )}

          {activeView === 'data' && (
            <DataEksporView
              config={activeConfig}
              store={store}
              days={days}
              isAdmin={isAdmin}
              selectedDay={selectedDay}
              selectedTask={selectedTask}
              recapDate={recapDate}
              onImportStore={importWorkspaceData}
              onResetAllData={resetRoleWorkspace}
            />
          )}

          {activeView === 'admin_tasks' && isAdmin && (
            <AdminTasksOutletsView
              roleConfigs={roleConfigs}
              initialRoleId={activeRoleId}
              onSaveRoleConfig={saveRoleConfig}
            />
          )}

          {activeView === 'admin_accounts' && isAdmin && (
            <AdminAccountsView
              accounts={managedAccounts}
              isPrimaryAdmin={isPrimaryAdmin}
              onSaveAccount={saveAccount}
              onDeleteAccount={deleteAccount}
            />
          )}
        </main>
      </div>
    </div>
  );
}
