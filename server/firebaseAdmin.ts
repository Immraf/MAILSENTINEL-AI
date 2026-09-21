import { App, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let firebaseAdminApp: App | null = null;
let adminFirestore: Firestore | null = null;

export function getFirebaseAdmin(): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return firebaseAdminApp;
  }

  // Load project ID from config
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        projectId = config.projectId;
      }
    } catch (e) {
      console.warn('Could not read firebase-applet-config.json:', e);
    }
  }

  if (!projectId) {
    projectId = 'project-fb6003fc-15d3-429a-b8d';
  }

  firebaseAdminApp = initializeApp({
    projectId,
  });

  return firebaseAdminApp;
}

export function getAdminAuth(): Auth {
  const app = getFirebaseAdmin();
  return getAuth(app);
}

export function getAdminFirestore(): Firestore {
  if (adminFirestore) return adminFirestore;
  const app = getFirebaseAdmin();
  let databaseId: string | undefined;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.firestoreDatabaseId) {
        databaseId = config.firestoreDatabaseId;
      }
    }
  } catch (e) {
    console.warn('Could not read firestoreDatabaseId from config:', e);
  }

  adminFirestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  adminFirestore.settings({ ignoreUndefinedProperties: true });
  return adminFirestore;
}
