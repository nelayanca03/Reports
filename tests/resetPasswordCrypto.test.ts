import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RESET_PASSWORD_ITERATIONS,
  createResetPasswordRecord,
  verifyResetPassword,
} from '../src/utils/resetPasswordCrypto';

describe('resetPasswordCrypto: PBKDF2-SHA256 hashing & verification', () => {
  it('generates salted PBKDF2 hash and verifies matching vs non-matching passwords', async () => {
    const rec1 = await createResetPasswordRecord('RahasiaReset2026!');
    const rec2 = await createResetPasswordRecord('RahasiaReset2026!');

    assert.equal(rec1.iterations, RESET_PASSWORD_ITERATIONS);
    assert.match(rec1.salt, /^[0-9a-f]{32}$/);
    assert.match(rec1.passwordHash, /^[0-9a-f]{64}$/);
    assert.notEqual(rec1.salt, rec2.salt);
    assert.notEqual(rec1.passwordHash, rec2.passwordHash);

    assert.equal(await verifyResetPassword('RahasiaReset2026!', rec1), true);
    assert.equal(await verifyResetPassword('  RahasiaReset2026!  ', rec1), true);
    assert.equal(await verifyResetPassword('rahasiareset2026!', rec1), false);
    assert.equal(await verifyResetPassword('WrongPass123', rec1), false);
    assert.equal(await verifyResetPassword('', rec1), false);
  });

  it('rejects passwords shorter than minimum length', async () => {
    await assert.rejects(
      () => createResetPasswordRecord('12345'),
      /minimal 6 karakter/
    );
  });
});
