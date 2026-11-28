import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const configPath = path.join(rootDir, 'app.config.json');
const appletConfigPath = path.join(rootDir, 'firebase-applet-config.json');
const firebaseJsonPath = path.join(rootDir, 'firebase.json');
const rulesPath = path.join(rootDir, 'firestore.rules');
const specPath = path.join(rootDir, 'security_spec.md');

const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const envOwnerEmail = String(process.env.VITE_OWNER_EMAIL || '')
  .trim()
  .toLowerCase();
const ownerEmail = (envOwnerEmail || String(appConfig.ownerEmail || ''))
  .trim()
  .toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  console.error(`Invalid ownerEmail: "${ownerEmail}"`);
  process.exit(1);
}

if (appConfig.ownerEmail !== ownerEmail) {
  appConfig.ownerEmail = ownerEmail;
  fs.writeFileSync(configPath, `${JSON.stringify(appConfig, null, 2)}\n`, 'utf8');
  console.log(`Updated app.config.json ownerEmail -> ${ownerEmail}`);
}

if (fs.existsSync(appletConfigPath)) {
  const appletConfig = JSON.parse(fs.readFileSync(appletConfigPath, 'utf8'));
  const dbId = String(appletConfig.firestoreDatabaseId || '').trim();
  if (dbId && dbId !== '(default)') {
    const desiredFirebaseJson = `${JSON.stringify(
      {
        firestore: [
          {
            database: '(default)',
            rules: 'firestore.rules',
          },
          {
            database: dbId,
            rules: 'firestore.rules',
          },
        ],
      },
      null,
      2
    )}\n`;
    const currentFirebaseJson = fs.existsSync(firebaseJsonPath)
      ? fs.readFileSync(firebaseJsonPath, 'utf8')
      : '';
    if (currentFirebaseJson !== desiredFirebaseJson) {
      fs.writeFileSync(firebaseJsonPath, desiredFirebaseJson, 'utf8');
      console.log(`Updated firebase.json database target -> ${dbId}`);
    }
  }
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
