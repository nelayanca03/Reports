import {
  DocumentData,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  AccountRole,
  InputLogEntry,
  InputLogItemAction,
  OperationalRoleId,
} from '../types/outlet';

const PAGE_SIZE = 500;
const MAX_FETCH_DOCS = 20_000;

export interface FetchAllInputLogsResult {
  logs: InputLogEntry[];
  truncated: boolean;
}

function mapLogDoc(docSnap: QueryDocumentSnapshot<DocumentData>): InputLogEntry {
  const d = docSnap.data();
  const action: InputLogItemAction | undefined =
    d.action === 'set' || d.action === 'clear' || d.action === 'edit'
      ? d.action
      : undefined;
  return {
    id: docSnap.id,
    uid: String(d.uid || ''),
    userEmail: String(d.userEmail || ''),
    userName: String(d.userName || ''),
    userRole: (d.userRole as AccountRole) || 'stock_accounting',
    roleId: (d.roleId as OperationalRoleId) || 'stock_accounting',
    roleLabel: String(d.roleLabel || ''),
    actionType: d.actionType === 'kunjungan' ? 'kunjungan' : 'input_harian',
    pic: String(d.pic || ''),
    outlet: String(d.outlet || ''),
    day: String(d.day || ''),
    details: String(d.details || ''),
    itemCount: Number(d.itemCount || 1),
    clientTs: String(d.clientTs || ''),
    ...(typeof d.taskKey === 'string' && d.taskKey ? { taskKey: d.taskKey } : {}),
    ...(typeof d.prevDate === 'string' ? { prevDate: d.prevDate } : {}),
    ...(typeof d.newDate === 'string' ? { newDate: d.newDate } : {}),
    ...(typeof d.prevNote === 'string' ? { prevNote: d.prevNote } : {}),
    ...(typeof d.newNote === 'string' ? { newNote: d.newNote } : {}),
    ...(action ? { action } : {}),
  };
}

export async function fetchAllInputLogs(
  onProgress?: (loadedCount: number) => void
): Promise<FetchAllInputLogsResult> {
  const logs: InputLogEntry[] = [];
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let truncated = false;

  while (logs.length < MAX_FETCH_DOCS) {
    const remaining = MAX_FETCH_DOCS - logs.length;
    const batchLimit = Math.min(PAGE_SIZE, remaining);
    const q: Query<DocumentData> = lastDoc
      ? query(
          collection(db, 'inputLogs'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(batchLimit)
        )
      : query(
          collection(db, 'inputLogs'),
          orderBy('createdAt', 'desc'),
          limit(batchLimit)
        );

    const snap: QuerySnapshot<DocumentData> = await getDocs(q);
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      logs.push(mapLogDoc(docSnap));
    }
    onProgress?.(logs.length);

    if (snap.docs.length < batchLimit) {
      break;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (logs.length >= MAX_FETCH_DOCS) {
      truncated = true;
      break;
    }
  }

  return { logs, truncated };
}
