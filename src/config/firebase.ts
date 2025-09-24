import * as admin from 'firebase-admin';

// Initialize Firebase Admin
let serviceAccount;

try {
  // Try to load from JSON file first
  serviceAccount = require('../../firebase-service-account.json');
  console.log('Successfully loaded Firebase service account from JSON file.');
} catch (error) {
  // Fallback to environment variables
  console.warn('Could not load firebase-service-account.json, falling back to environment variables. Error: ', error);
  serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID!,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID!,
    private_key: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL!,
    client_id: process.env.FIREBASE_CLIENT_ID!,
    auth_uri: process.env.FIREBASE_AUTH_URI!,
    token_uri: process.env.FIREBASE_TOKEN_URI!,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL!,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL!,
  };
}

try {
  // Check if app already exists
  admin.app();
} catch (error) {
  // App doesn't exist, initialize it
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
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
