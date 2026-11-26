export const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  const mm = i % 2 === 0 ? '00' : '30';
  return `${hh}:${mm}`;
});

export const VISIT_REASON_OPTIONS = [
  'Stock Opname',
  'Pengecekkan Asset',
  'Pengecekkan Discrepancy',
  'Pengecekkan Inventory',
  'Meeting',
] as const;

export const CUSTOM_REASON_VALUE = '__custom__';

export function parseVisitNote(
  rawNote: string,
  isCustomActive?: boolean
): { category: string; customText: string } {
  if (isCustomActive) {
    return { category: CUSTOM_REASON_VALUE, customText: rawNote };
  }
  if (!rawNote) {
    return { category: '', customText: '' };
  }
  for (const opt of VISIT_REASON_OPTIONS) {
    if (rawNote === opt) {
      return { category: opt, customText: '' };
    }
    if (rawNote.startsWith(`${opt} — `)) {
      return { category: opt, customText: rawNote.slice(opt.length + 3) };
    }
  }
  return { category: CUSTOM_REASON_VALUE, customText: rawNote };
}

export function composeVisitNote(category: string, customText: string): string {
  if (!category || category === CUSTOM_REASON_VALUE) {
    return customText.slice(0, 100);
  }
  if (customText.trim()) {
    return `${category} — ${customText}`.slice(0, 100);
  }
  return category.slice(0, 100);
}

export function makeVisitRowId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
