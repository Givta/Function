const admin = require('firebase-admin');

// Initialize Firebase Admin
let serviceAccount;

try {
  serviceAccount = require('./firebase-service-account.json');
} catch (error) {
  console.warn('Could not load firebase-service-account.json, falling back to environment variables.');
  serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  };
}

try {
  admin.app();
} catch (error) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function createFirebaseUserForExistingUsers() {
  try {
    console.log('🔍 Finding users without Firebase Auth accounts...');

    // Get all users from Firestore
    const usersSnapshot = await db.collection('users').get();
    const users = [];

    usersSnapshot.forEach(doc => {
      const userData = { id: doc.id, ...doc.data() };
      users.push(userData);
    });

    console.log(`📊 Found ${users.length} users in Firestore`);

    for (const user of users) {
      // Check if user already has Firebase UID
      if (user.firebaseUid) {
        console.log(`✅ User ${user.username} (${user.id}) already has Firebase Auth account: ${user.firebaseUid}`);
        continue;
      }

      // Create Firebase Auth user
      let firebaseEmail = user.email;
      if (!firebaseEmail && user.phoneNumber) {
        firebaseEmail = `${user.phoneNumber}@whatsapp.givta.local`;
      }

      if (!firebaseEmail) {
        console.log(`❌ User ${user.username} (${user.id}) has no email or phone number, skipping`);
        continue;
      }

      try {
        console.log(`🔄 Creating Firebase Auth user for ${user.username} with email: ${firebaseEmail}`);

        // Note: We can't set the password for existing users since we don't know it
        // We'll need to ask the user to reset their password or use a temporary one
        const tempPassword = `TempPass123!_${user.id.substring(0, 8)}`;

        const firebaseUserRecord = await auth.createUser({
          email: firebaseEmail,
          password: tempPassword,
          displayName: user.username,
          emailVerified: false,
        });

        console.log(`✅ Created Firebase Auth user: ${firebaseUserRecord.uid}`);

        // Update user document with Firebase UID
        await db.collection('users').doc(user.id).update({
          firebaseUid: firebaseUserRecord.uid,
          updatedAt: new Date()
        });

        console.log(`📝 Updated Firestore document for user ${user.username}`);
        console.log(`⚠️  TEMPORARY PASSWORD SET: ${tempPassword}`);
        console.log(`🔑 User should change password after first login`);

      } catch (error) {
        console.error(`❌ Failed to create Firebase Auth user for ${user.username}:`, error.message);

        // If email already exists, try with a different approach
        if (error.code === 'auth/email-already-exists') {
          console.log(`📧 Email ${firebaseEmail} already exists in Firebase Auth`);

          // Try to find existing Firebase user by email
          try {
            const existingUser = await auth.getUserByEmail(firebaseEmail);
            console.log(`🔗 Linking existing Firebase user ${existingUser.uid} to Firestore user ${user.username}`);

            // Update Firestore with existing Firebase UID
            await db.collection('users').doc(user.id).update({
              firebaseUid: existingUser.uid,
              updatedAt: new Date()
            });

            console.log(`✅ Successfully linked existing Firebase Auth user`);
          } catch (linkError) {
            console.error(`❌ Failed to link existing Firebase user:`, linkError.message);
          }
        }
      }
    }

    console.log('🎉 Finished processing all users');

  } catch (error) {
    console.error('💥 Error in createFirebaseUserForExistingUsers:', error);
  }
}

// Run the script
createFirebaseUserForExistingUsers()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
