import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(() => ({}))
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve())
      })),
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
        limit: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
        })),
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            offset: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
            })),
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
          }))
        }))
      })),
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          offset: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
          })),
          get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
        })),
        get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
      })),
      limit: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
      })),
      get: jest.fn(() => Promise.resolve({ empty: true, docs: [] }))
    }))
  })),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'test-user' }))
  }))
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(() => Promise.resolve(true))
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid')
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,test'))
}));

// Global test utilities
global.testUtils = {
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    phoneNumber: '+2348012345678',
    passwordHash: 'hashed-password',
    emailVerified: true,
    isActive: true,
    referralCode: 'TEST123',
    referredBy: null,
    referralLevel: 0,
    totalReferrals: 0,
    totalEarnings: 0,
    preferences: {
      notifications: true,
      language: 'en',
      currency: 'NGN',
      theme: 'light' as const
    },
    kycStatus: 'not_submitted' as const,
    whatsappId: null,
    deviceTokens: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createMockWallet: (overrides = {}) => ({
    id: 'test-wallet-id',
    userId: 'test-user-id',
    balance: 1000,
    currency: 'NGN',
    isActive: true,
    totalDeposits: 1000,
    totalWithdrawals: 0,
    totalTipsSent: 0,
    totalTipsReceived: 0,
    totalReferralEarnings: 0,
    lastTransactionAt: new Date(),
    encryptedPin: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createMockTransaction: (overrides = {}) => ({
    id: 'test-transaction-id',
    userId: 'test-user-id',
    type: 'deposit' as const,
    amount: 1000,
    description: 'Test deposit',
    status: 'completed' as const,
    currency: 'NGN',
    fee: 0,
    netAmount: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: new Date(),
    ...overrides
  })
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(async () => {
  // Add any cleanup logic here
});
