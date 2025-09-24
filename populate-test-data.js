const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Firebase service account file not found. Please ensure firebase-service-account.json exists.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://givta-mvp-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

async function populateTestData() {
  try {
    console.log('🚀 Starting test data population...');

    // Create test users with usernames
    const testUsers = [
      {
        id: 'user_1',
        email: 'john.doe@example.com',
        displayName: 'John Doe',
        username: 'john_doe',
        phoneNumber: '2348012345678',
        emailVerified: true,
        isActive: true,
        referralCode: 'JOHN123',
        referredBy: null,
        referralLevel: 0,
        totalReferrals: 0,
        totalEarnings: 0,
        preferences: {
          notifications: true,
          language: 'en',
          currency: 'NGN',
          theme: 'light'
        },
        kycStatus: 'verified',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'user_2',
        email: 'jane.smith@example.com',
        displayName: 'Jane Smith',
        username: 'jane_smith',
        phoneNumber: '2348023456789',
        emailVerified: true,
        isActive: true,
        referralCode: 'JANE456',
        referredBy: 'user_1',
        referralLevel: 1,
        totalReferrals: 0,
        totalEarnings: 100, // Referral bonus
        preferences: {
          notifications: true,
          language: 'en',
          currency: 'NGN',
          theme: 'dark'
        },
        kycStatus: 'pending',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'user_3',
        email: 'bob.wilson@example.com',
        displayName: 'Bob Wilson',
        username: 'bob_wilson',
        phoneNumber: '2348034567890',
        emailVerified: false,
        isActive: true,
        referralCode: 'BOB789',
        referredBy: null,
        referralLevel: 0,
        totalReferrals: 0,
        totalEarnings: 0,
        preferences: {
          notifications: false,
          language: 'en',
          currency: 'NGN',
          theme: 'system'
        },
        kycStatus: 'not_submitted',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      }
    ];

    // Create wallets for users
    const testWallets = [
      {
        id: 'wallet_1',
        userId: 'user_1',
        balance: 5000,
        currency: 'NGN',
        totalDeposits: 6000,
        totalWithdrawals: 1000,
        totalTipsSent: 2000,
        totalTipsReceived: 3000,
        totalReferralEarnings: 0,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        isActive: true,
        lastTransactionAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'wallet_2',
        userId: 'user_2',
        balance: 2500,
        currency: 'NGN',
        totalDeposits: 3000,
        totalWithdrawals: 500,
        totalTipsSent: 1000,
        totalTipsReceived: 1500,
        totalReferralEarnings: 100,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        isActive: true,
        lastTransactionAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'wallet_3',
        userId: 'user_3',
        balance: 1000,
        currency: 'NGN',
        totalDeposits: 1000,
        totalWithdrawals: 0,
        totalTipsSent: 0,
        totalTipsReceived: 0,
        totalReferralEarnings: 0,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        isActive: true,
        lastTransactionAt: admin.firestore.Timestamp.now()
      }
    ];

    // Create some transactions
    const testTransactions = [
      {
        id: 'txn_1',
        userId: 'user_1',
        type: 'deposit',
        amount: 5000,
        description: 'Wallet funding',
        status: 'completed',
        reference: 'DEP_001',
        currency: 'NGN',
        fee: 0,
        netAmount: 5000,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        completedAt: admin.firestore.Timestamp.now(),
        metadata: {
          paystackReference: 'ref_12345'
        }
      },
      {
        id: 'txn_2',
        userId: 'user_1',
        type: 'tip_sent',
        amount: 500,
        description: 'Tip sent to Jane Smith',
        status: 'completed',
        recipientId: 'user_2',
        currency: 'NGN',
        fee: 10,
        netAmount: 490,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        completedAt: admin.firestore.Timestamp.now(),
        metadata: {
          tipDetails: {
            message: 'Great work!',
            isAnonymous: false
          },
          whatsappMessageId: 'msg_123'
        }
      },
      {
        id: 'txn_3',
        userId: 'user_2',
        type: 'tip_received',
        amount: 490,
        description: 'Tip received from John Doe',
        status: 'completed',
        senderId: 'user_1',
        currency: 'NGN',
        fee: 0,
        netAmount: 490,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        completedAt: admin.firestore.Timestamp.now(),
        metadata: {
          tipDetails: {
            message: 'Great work!',
            isAnonymous: false
          }
        }
      }
    ];

    // Create referrals
    const testReferrals = [
      {
        id: 'ref_1',
        referrerId: 'user_1',
        referredId: 'user_2',
        level: 1,
        bonus: 100,
        status: 'completed',
        referralCode: 'JOHN123',
        platform: 'mobile_app',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        completedAt: admin.firestore.Timestamp.now(),
        metadata: {
          referrerName: 'John Doe',
          referredName: 'Jane Smith',
          bonusTransactionId: 'txn_bonus_1'
        }
      }
    ];

    // Clear existing data first
    console.log('🧹 Clearing existing test data...');

    const collections = ['users', 'wallets', 'transactions', 'referrals', 'tips', 'notifications'];
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`✅ Cleared ${collectionName} collection`);
    }

    // Add test data
    console.log('📝 Adding test users...');
    for (const user of testUsers) {
      await db.collection('users').doc(user.id).set(user);
      console.log(`✅ Added user: ${user.displayName} (${user.username})`);
    }

    console.log('💰 Adding test wallets...');
    for (const wallet of testWallets) {
      await db.collection('wallets').doc(wallet.id).set(wallet);
      console.log(`✅ Added wallet for user: ${wallet.userId}`);
    }

    console.log('💸 Adding test transactions...');
    for (const transaction of testTransactions) {
      await db.collection('transactions').doc(transaction.id).set(transaction);
      console.log(`✅ Added transaction: ${transaction.type} - ₦${transaction.amount}`);
    }

    console.log('🔗 Adding test referrals...');
    for (const referral of testReferrals) {
      await db.collection('referrals').doc(referral.id).set(referral);
      console.log(`✅ Added referral: ${referral.referrerId} -> ${referral.referredId}`);
    }

    console.log('🎉 Test data population completed successfully!');
    console.log('\n📋 Test Accounts:');
    console.log('1. John Doe - Username: john_doe, Phone: 2348012345678, Balance: ₦5,000');
    console.log('2. Jane Smith - Username: jane_smith, Phone: 2348023456789, Balance: ₦2,500');
    console.log('3. Bob Wilson - Username: bob_wilson, Phone: 2348034567890, Balance: ₦1,000');
    console.log('\n🔑 Referral Codes:');
    console.log('• JOHN123 (John Doe)');
    console.log('• JANE456 (Jane Smith)');
    console.log('• BOB789 (Bob Wilson)');

  } catch (error) {
    console.error('❌ Error populating test data:', error);
  } finally {
    // Close the Firebase app
    await admin.app().delete();
  }
}

// Run the population script
populateTestData();
