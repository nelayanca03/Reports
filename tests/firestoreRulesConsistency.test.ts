import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { APP_CONFIG } from '../src/config/appConfig';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const rulesText = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
const specText = fs.readFileSync(path.join(ROOT_DIR, 'security_spec.md'), 'utf8');
const appConfigJson = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'app.config.json'), 'utf8')
) as {
  ownerEmail: string;
  defaultStartDate: string;
  defaultWorkingDays: number;
  minWorkspaceMonth: string;
};
const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf8')
) as {
  entities: Record<string, { required?: string[]; properties: Record<string, unknown> }>;
};

function clientEmailToAccountId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_-]/g, '_');
}

function rulesEmailDocId(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_-]/g, '_');
}

describe('firestore.rules structural invariants & blueprint sync', () => {
  it('enforces global default-deny and disables list on non-listable collections', () => {
    assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
    for (const col of [
      'accounts',
      'adminRegistry',
      'roleConfigs',
      'roleWorkspaces',
      'roleMonthlyWorkspaces',
    ]) {
      const blockRegex = new RegExp(`match \\/${col}\\/\\{[^}]+\\}[\\s\\S]*?allow list: if false;`);
      assert.match(rulesText, blockRegex, `Expected allow list: if false in /${col}`);
    }
    assert.match(
      rulesText,
      /match \/calendarMedia\/\{mediaId\}[\s\S]*?allow list: if isVerifiedUser\(\) && hasActiveAccount\(\);[\s\S]*?allow delete: if isVerifiedUser\(\) && isValidId\(mediaId\) && isAdmin\(\);/
    );
    assert.match(
      rulesText,
      /match \/recordCounters\/\{counterId\}[\s\S]*?allow list: if false;[\s\S]*?allow delete: if isVerifiedUser\(\) && isValidCounterId\(counterId\) && isAdmin\(\);/
    );
  });

  it('uses consolidated single-read account guards and valid WIB hour offsets', () => {
    assert.match(rulesText, /function canAccountWriteWorkspace\(/);
    assert.match(rulesText, /function canAccountViewSavedRecord\(/);
    assert.match(rulesText, /function canAccountViewCalendarEvent\(/);
    assert.match(rulesText, /duration\.value\(17, 'h'\)/);
    assert.match(rulesText, /duration\.value\(31, 'h'\)/);
  });

  it('keeps app.config.json synchronized with APP_CONFIG, firestore.rules, and security_spec.md', () => {
    const expectedOwner = appConfigJson.ownerEmail.trim().toLowerCase();
    assert.equal(APP_CONFIG.ownerEmail, expectedOwner);
    assert.equal(APP_CONFIG.defaultStartDate, appConfigJson.defaultStartDate);
    assert.equal(APP_CONFIG.defaultWorkingDays, appConfigJson.defaultWorkingDays);
    assert.equal(APP_CONFIG.minWorkspaceMonth, appConfigJson.minWorkspaceMonth);
    assert.match(
      rulesText,
      new RegExp(`request\\.auth\\.token\\.email\\.lower\\(\\) == '${expectedOwner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)
    );
    assert.ok(specText.includes(expectedOwner), 'security_spec.md should reference ownerEmail from app.config.json');
  });

  it('keeps client emailToAccountId identical to firestore.rules emailDocId', () => {
    const samples = [
      'peter@company.com',
      'Peter.Tan@Company.co.id',
      'user+tag@gmail.com',
      'gl-staff_1@example.org',
    ];
    for (const email of samples) {
      assert.equal(clientEmailToAccountId(email), rulesEmailDocId(email));
    }
  });

  it('keeps required schema fields synchronized with firebase-blueprint.json', () => {
    const checks: Array<[string, string]> = [
      ['isValidAccount', 'Account'],
      ['isValidAdminDirectory', 'AdminAccountDirectory'],
      ['isValidAdminResetSecurity', 'AdminResetSecurity'],
      ['isValidRoleConfig', 'RoleConfig'],
      ['isValidRoleWorkspace', 'RoleWorkspace'],
      ['isValidRoleMonthlyWorkspace', 'RoleMonthlyWorkspace'],
      ['isValidInputLog', 'InputLog'],
      ['isValidCalendarEvent', 'CalendarEvent'],
      ['isValidRecordCounter', 'RecordCounter'],
      ['isValidSavedRecord', 'SavedRecord'],
      ['isValidCalendarMedia', 'CalendarMedia'],
    ];

    for (const [fnName, entityName] of checks) {
      const entity = blueprint.entities[entityName];
      assert.ok(entity, `Missing entity ${entityName} in firebase-blueprint.json`);
      const fnIdx = rulesText.indexOf(`function ${fnName}(`);
      assert.ok(fnIdx >= 0, `Missing function ${fnName} in firestore.rules`);
      const slice = rulesText.slice(fnIdx, fnIdx + 1200);
      for (const reqKey of entity.required || []) {
        assert.ok(
          slice.includes(`'${reqKey}'`),
          `${fnName} in firestore.rules should reference required key '${reqKey}'`
        );
      }
    }
  });
});

