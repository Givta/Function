#!/usr/bin/env node

/**
 * Create test users with passwords for Givta App
 */

const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

if (!require('fs').existsSync(serviceAccountPath)) {
  console.error('❌ Firebase service account file not found!');
  console.log('Expected location:', serviceAccountPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: 'givta-94cb8'
});

const db = admin.firestore();

async function createTestUsersWithPasswords() {
  console.log('🔐 Creating test users with passwords...\n');

  const testUsers = [
    {
      id: 'user_john_doe',
      email: 'john.doe@example.com',
      username: 'john_doe',
      password: 'password123',
      displayName: 'John Doe'
    },
    {
      id: 'user_jane_smith',
      email: 'jane.smith@example.com',
      username: 'jane_smith',
      password: 'password123',
      displayName: 'Jane Smith'
    },
    {
      id: 'user_bob_wilson',
      email: 'bob.wilson@example.com',
      username: 'bob_wilson',
      password: 'password123',
      displayName: 'Bob Wilson'
    }
  ];

  try {
    for (const userData of testUsers) {
      // Hash the password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Update the user document with password hash
      await db.collection('users').doc(userData.id).update({
        passwordHash: passwordHash,
        displayName: userData.displayName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Created user: ${userData.username} (${userData.email})`);
      console.log(`   Password: ${userData.password}\n`);
    }

    console.log('🎉 Test users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('Email: john.doe@example.com | Password: password123');
    console.log('Email: jane.smith@example.com | Password: password123');
    console.log('Email: bob.wilson@example.com | Password: password123');
    console.log('\n💡 You can now login with these credentials!');

  } catch (error) {
    console.error('❌ Error creating test users:', error);
  }
}

createTestUsersWithPasswords().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
