const admin = require('firebase-admin');
const bcrypt = require('bcrypt');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json'); // You'll need to add this file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.firestore();

async function createAdminUser(email, password, displayName, userType = 'admin') {
  try {
    console.log(`Creating admin user: ${email}`);

    // Check if user already exists
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) {
      console.log('User already exists in Firebase Auth. Updating Firestore...');

      // Update Firestore user document
      const userRef = db.collection('users').doc(existingUser.uid);
      await userRef.update({
        userType: userType,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Admin user updated successfully: ${email}`);
      return existingUser.uid;
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create Firebase Auth user
    const firebaseUser = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      emailVerified: true,
    });

    console.log('Firebase Auth user created:', firebaseUser.uid);

    // Generate referral code
    const referralCode = displayName.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() +
                        Math.random().toString(36).substring(2, 6).toUpperCase();

    // Create user document in Firestore
    const userData = {
      id: firebaseUser.uid,
      email: email,
      username: email.split('@')[0], // Use email prefix as username
      displayName: displayName,
      passwordHash: passwordHash,
      firebaseUid: firebaseUser.uid,
      userType: userType,
      isActive: true,
      emailVerified: true,
      phoneVerified: false,
      referralCode: referralCode,
      referredBy: null,
      referralLevel: 0,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null,
      preferences: {
        notifications: true,
        language: 'en',
        currency: 'NGN',
        theme: 'system'
      },
      kycStatus: 'verified', // Admin users are pre-verified
      deviceTokens: [],
    };

    await db.collection('users').doc(firebaseUser.uid).set(userData);

    // Create wallet for admin user
    const walletData = {
      userId: firebaseUser.uid,
      balance: 0,
      currency: 'NGN',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('wallets').doc(firebaseUser.uid).set(walletData);

    console.log(`✅ Admin user created successfully: ${email}`);
    console.log(`User ID: ${firebaseUser.uid}`);
    console.log(`Referral Code: ${referralCode}`);

    return firebaseUser.uid;

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  }
}

async function setupDefaultAdminUsers() {
  try {
    console.log('🚀 Setting up default admin users...\n');

    // Create super admin
    await createAdminUser(
      'superadmin@givta.com',
      'SuperAdmin@2024!',
      'Super Administrator',
      'super_admin'
    );

    console.log('');

    // Create regular admin
    await createAdminUser(
      'admin@givta.com',
      'Admin@2024!',
      'Platform Administrator',
      'admin'
    );

    console.log('');
    console.log('🎉 All admin users created successfully!');
    console.log('\n📋 Admin Login Credentials:');
    console.log('Super Admin: superadmin@givta.com / SuperAdmin@2024!');
    console.log('Admin: admin@givta.com / Admin@2024!');
    console.log('\n🔐 Please change these passwords after first login!');

  } catch (error) {
    console.error('❌ Failed to setup admin users:', error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  setupDefaultAdminUsers()
    .then(() => {
      console.log('\n✅ Admin user setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Admin user setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createAdminUser, setupDefaultAdminUsers };
