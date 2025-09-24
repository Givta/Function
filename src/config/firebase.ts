import * as admin from 'firebase-admin';

// Initialize Firebase Admin
try {
  // Check if app already exists
  admin.app();
} catch (error) {
  // App doesn't exist, initialize it
  try {
    let credential;

    if (process.env.NODE_ENV === 'production') {
      // In production, use application default credentials (from GOOGLE_APPLICATION_CREDENTIALS)
      credential = admin.credential.applicationDefault();
      console.log('Using Firebase application default credentials for production.');
    } else {
      // In development, try to load from JSON file first
      try {
        const serviceAccount = require('../../firebase-service-account.json');
        credential = admin.credential.cert(serviceAccount);
        console.log('Successfully loaded Firebase service account from JSON file.');
      } catch (fileError) {
        // Fallback to environment variables
        console.warn('Could not load firebase-service-account.json, falling back to environment variables. Error: ', fileError);
        const serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID!,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        };
        credential = admin.credential.cert(serviceAccount);
      }
    }

    admin.initializeApp({
      credential: credential,
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (initError) {
    console.error('Failed to initialize Firebase Admin:', initError);
    // In production, we might want to exit or handle differently
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting due to Firebase initialization failure in production.');
      process.exit(1);
    }
  }
}

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = admin.auth();

// Firestore collections references
export const collections = {
  users: db.collection('users'),
  wallets: db.collection('wallets'),
  transactions: db.collection('transactions'),
  tips: db.collection('tips'),
  tipLinks: db.collection('tipLinks'),
  referrals: db.collection('referrals'),
  notifications: db.collection('notifications'),
  kyc: db.collection('kyc'),
  twoFactorSetup: db.collection('twoFactorSetup'),
  twoFactorBackupCodes: db.collection('twoFactorBackupCodes'),
  webhookLogs: db.collection('webhookLogs'),
};
