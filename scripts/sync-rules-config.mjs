import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const configPath = path.join(rootDir, 'app.config.json');
const rulesPath = path.join(rootDir, 'firestore.rules');
const specPath = path.join(rootDir, 'security_spec.md');

const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const ownerEmail = String(appConfig.ownerEmail || '')
  .trim()
  .toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  console.error(`Invalid ownerEmail in app.config.json: "${ownerEmail}"`);
  process.exit(1);
}

const rulesOriginal = fs.readFileSync(rulesPath, 'utf8');
const rulesUpdated = rulesOriginal
  .replace(
    /return isVerifiedUser\(\) && request\.auth\.token\.email\.lower\(\) == '[^']+';/,
    `return isVerifiedUser() && request.auth.token.email.lower() == '${ownerEmail}';`
  )
  .replace(
    /\(existing\(\)\.email != '[^']+' \|\| \(isBootstrappedAdmin\(\) && incoming\(\)\.role == 'admin' && incoming\(\)\.active == true\)\)/,
    `(existing().email != '${ownerEmail}' || (isBootstrappedAdmin() && incoming().role == 'admin' && incoming().active == true))`
  )
  .replace(
    /&& existing\(\)\.email != '[^']+'/,
    `&& existing().email != '${ownerEmail}'`
  );

if (rulesUpdated !== rulesOriginal) {
  fs.writeFileSync(rulesPath, rulesUpdated, 'utf8');
  console.log(`Updated firestore.rules ownerEmail -> ${ownerEmail}`);
} else {
  console.log(`firestore.rules already matches ownerEmail -> ${ownerEmail}`);
}

const specOriginal = fs.readFileSync(specPath, 'utf8');
const specUpdated = specOriginal
  .replace(
    /\(bootstrapped owner `[^`]+` or active account/,
    `(bootstrapped owner \`${ownerEmail}\` or active account`
  )
  .replace(
    /and `email: '[^']+'` attempts `get` on/,
    `and \`email: '${ownerEmail}'\` attempts \`get\` on`
  );

if (specUpdated !== specOriginal) {
  fs.writeFileSync(specPath, specUpdated, 'utf8');
  console.log(`Updated security_spec.md ownerEmail -> ${ownerEmail}`);
} else {
  console.log(`security_spec.md already matches ownerEmail -> ${ownerEmail}`);
}
