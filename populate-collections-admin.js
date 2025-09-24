#!/usr/bin/env node

/**
 * Upload Test Data Script for Givta App using Firebase Admin SDK
 *
 * This script uploads test data to Firestore using Firebase Admin SDK.
 * Run this from the Backend directory.
 *
 * Usage:
 * cd Backend && node populate-collections-admin.js
 */

const admin = require('firebase-admin');
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

console.log('🔥 Uploading Givta Test Data using Admin SDK...\n');

// Sample data for testing
const sampleData = {
  users: {
    user_john_doe: {
      email: 'john.doe@example.com',
      username: 'john_doe',
      phoneNumber: '2348012345678',
      photoURL: null,
      emailVerified: true,
      phoneVerified: true,
      isActive: true,
      referralCode: 'JOHN123',
      referredBy: null,
      userType: 'user',
      isVerified: true,
      kycStatus: 'verified',
      totalReferrals: 1,
      totalEarnings: 100,
      preferences: {
        notifications: true,
        language: 'en',
        currency: 'NGN',
        theme: 'light'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
    },
    user_jane_smith: {
      email: 'jane.smith@example.com',
      username: 'jane_smith',
      phoneNumber: '2348023456789',
      photoURL: null,
      emailVerified: true,
      phoneVerified: true,
      isActive: true,
      referralCode: 'JANE456',
      referredBy: 'user_john_doe',
      userType: 'user',
      isVerified: false,
      kycStatus: 'pending',
      totalReferrals: 0,
      totalEarnings: 100,
      preferences: {
        notifications: true,
        language: 'en',
        currency: 'NGN',
        theme: 'dark'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
    },
    user_bob_wilson: {
      email: 'bob.wilson@example.com',
      username: 'bob_wilson',
      phoneNumber: '2348034567890',
      photoURL: null,
      emailVerified: false,
      phoneVerified: false,
      isActive: true,
      referralCode: 'BOB789',
      referredBy: null,
      userType: 'user',
      isVerified: false,
      kycStatus: 'not_submitted',
      totalReferrals: 0,
      totalEarnings: 0,
      preferences: {
        notifications: false,
        language: 'en',
        currency: 'NGN',
        theme: 'system'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null
    }
  },

  wallets: {
    wallet_john: {
      userId: 'user_john_doe',
      balance: 5000,
      currency: 'NGN',
      isActive: true,
      totalDeposits: 6000,
      totalWithdrawals: 1000,
      totalTipsSent: 2000,
      totalTipsReceived: 3000,
      totalReferralEarnings: 100,
      lastTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    wallet_jane: {
      userId: 'user_jane_smith',
      balance: 2500,
      currency: 'NGN',
      isActive: true,
      totalDeposits: 3000,
      totalWithdrawals: 500,
      totalTipsSent: 1000,
      totalTipsReceived: 1500,
      totalReferralEarnings: 100,
      lastTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    wallet_bob: {
      userId: 'user_bob_wilson',
      balance: 1000,
      currency: 'NGN',
      isActive: true,
      totalDeposits: 1000,
      totalWithdrawals: 0,
      totalTipsSent: 0,
      totalTipsReceived: 0,
      totalReferralEarnings: 0,
      lastTransactionAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  },

  transactions: {
    txn_deposit_1: {
      userId: 'user_john_doe',
      type: 'deposit',
      amount: 5000,
      netAmount: 5000,
      fee: 0,
      description: 'Wallet funding via Paystack',
      status: 'completed',
      reference: 'DEP_001',
      recipientId: null,
      senderId: null,
      paymentMethod: 'paystack',
      currency: 'NGN',
      metadata: {
        paystackReference: 'ref_12345'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    txn_tip_1: {
      userId: 'user_john_doe',
      type: 'tip_sent',
      amount: 500,
      netAmount: 490,
      fee: 10,
      description: 'Tip sent to Jane Smith',
      status: 'completed',
      reference: 'TIP_001',
      recipientId: 'user_jane_smith',
      senderId: 'user_john_doe',
      paymentMethod: null,
      currency: 'NGN',
      metadata: {
        message: 'Great work!',
        isAnonymous: false,
        whatsappMessageId: 'msg_123'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    txn_tip_received_1: {
      userId: 'user_jane_smith',
      type: 'tip_received',
      amount: 490,
      netAmount: 490,
      fee: 0,
      description: 'Tip received from John Doe',
      status: 'completed',
      reference: 'TIP_001',
      recipientId: 'user_jane_smith',
      senderId: 'user_john_doe',
      paymentMethod: null,
      currency: 'NGN',
      metadata: {
        message: 'Great work!',
        isAnonymous: false
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  },

  referrals: {
    ref_john_jane: {
      referrerId: 'user_john_doe',
      referredId: 'user_jane_smith',
      level: 1,
      bonus: 100,
      status: 'completed',
      bonusPaid: true,
      referralType: 'registration',
      referralCode: 'JOHN123',
      metadata: {
        referrerName: 'John Doe',
        referredName: 'Jane Smith',
        bonusTransactionId: 'txn_bonus_1'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      bonusPaidAt: admin.firestore.FieldValue.serverTimestamp()
    }
  },

  tips: {
    tip_john_jane: {
      senderId: 'user_john_doe',
      recipientId: 'user_jane_smith',
      amount: 500,
      netAmount: 490,
      fee: 10,
      message: 'Great work on the project!',
      isAnonymous: false,
      status: 'completed',
      platform: 'whatsapp',
      paymentMethod: null,
      reference: 'TIP_001',
      currency: 'NGN',
      metadata: {
        senderName: 'John Doe',
        recipientName: 'Jane Smith',
        whatsappMessageId: 'msg_123'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  },

  notifications: {
    notif_welcome_john: {
      userId: 'user_john_doe',
      title: 'Welcome to Givta!',
      message: 'Your account has been successfully created. Start exploring our features!',
      type: 'system',
      isRead: false,
      data: {
        actionUrl: '/profile',
        deepLink: 'givta://profile'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null
    },
    notif_tip_jane: {
      userId: 'user_jane_smith',
      title: 'You received a tip!',
      message: 'John Doe sent you ₦490. Check your balance!',
      type: 'transaction',
      isRead: false,
      data: {
        transactionId: 'txn_tip_received_1',
        amount: 490,
        actionUrl: '/wallet'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null
    }
  },

  kyc: {
    kyc_john: {
      userId: 'user_john_doe',
      status: 'approved',
      documentType: 'national_id',
      documentNumber: '12345678901',
      documentFrontURL: 'https://storage.googleapis.com/givta-kyc/id_john.jpg',
      documentBackURL: null,
      selfieURL: 'https://storage.googleapis.com/givta-kyc/selfie_john.jpg',
      fullName: 'John Doe',
      dateOfBirth: '1990-01-01',
      address: '123 Main St, Lagos, Nigeria',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: 'admin_system',
      rejectionReason: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    kyc_jane: {
      userId: 'user_jane_smith',
      status: 'under_review',
      documentType: 'drivers_license',
      documentNumber: '98765432109',
      documentFrontURL: 'https://storage.googleapis.com/givta-kyc/id_jane.jpg',
      documentBackURL: null,
      selfieURL: 'https://storage.googleapis.com/givta-kyc/selfie_jane.jpg',
      fullName: 'Jane Smith',
      dateOfBirth: '1992-05-15',
      address: '456 Oak Ave, Abuja, Nigeria',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }
};

async function clearCollection(collectionName) {
  console.log(`🧹 Clearing ${collectionName} collection...`);

  try {
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();

    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`✅ Cleared ${collectionName} collection (${snapshot.size} documents)`);
    } else {
      console.log(`ℹ️ ${collectionName} collection is already empty`);
    }
  } catch (error) {
    console.error(`❌ Error clearing ${collectionName} collection:`, error.message);
  }
}

async function uploadCollection(collectionName, data) {
  console.log(`📝 Uploading ${collectionName} collection...`);

  try {
    const batch = db.batch();

    for (const [docId, docData] of Object.entries(data)) {
      const docRef = db.collection(collectionName).doc(docId);
      batch.set(docRef, docData);
      console.log(`   ✅ Prepared ${docId} for upload`);
    }

    await batch.commit();
    console.log(`✅ ${collectionName} collection uploaded successfully\n`);
  } catch (error) {
    console.error(`❌ Error uploading ${collectionName} collection:`, error.message);
    console.log('');
  }
}

async function runUpload() {
  console.log('🚀 Starting Givta collections population...\n');

  try {
    // Clear existing data first
    console.log('🧹 Clearing existing data...\n');
    await clearCollection('users');
    await clearCollection('wallets');
    await clearCollection('transactions');
    await clearCollection('referrals');
    await clearCollection('tips');
    await clearCollection('notifications');
    await clearCollection('kyc');

    console.log('📝 Populating collections with test data...\n');

    // Upload each collection
    await uploadCollection('users', sampleData.users);
    await uploadCollection('wallets', sampleData.wallets);
    await uploadCollection('transactions', sampleData.transactions);
    await uploadCollection('referrals', sampleData.referrals);
    await uploadCollection('tips', sampleData.tips);
    await uploadCollection('notifications', sampleData.notifications);
    await uploadCollection('kyc', sampleData.kyc);

    console.log('🎉 All collections populated successfully!');
    console.log('\n📋 Test Accounts Ready:');
    console.log('1. John Doe - Username: john_doe, Phone: 2348012345678, Balance: ₦5,000');
    console.log('2. Jane Smith - Username: jane_smith, Phone: 2348023456789, Balance: ₦2,500');
    console.log('3. Bob Wilson - Username: bob_wilson, Phone: 2348034567890, Balance: ₦1,000');
    console.log('\n🔑 Referral Codes:');
    console.log('• JOHN123 (John Doe)');
    console.log('• JANE456 (Jane Smith)');
    console.log('• BOB789 (Bob Wilson)');
    console.log('\n📱 WhatsApp Testing:');
    console.log('Use phone number 2348012345678 for John Doe account');
    console.log('Commands: /balance, /tip, /referral, /profile, etc.');
    console.log('\n🔗 API Testing:');
    console.log('Backend server should be running on http://localhost:3000');
    console.log('Use the test accounts above for API testing');

  } catch (error) {
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }
}

runUpload().then(() => {
  console.log('\n✅ Givta collections population completed!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Population failed:', error);
  process.exit(1);
});
