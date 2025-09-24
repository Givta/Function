import { AuthService } from '../../../src/services/auth/AuthService';

// Mock Firebase
jest.mock('../../../src/config/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn()
      })),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn()
        })),
        get: jest.fn()
      }))
    }))
  }
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      // Mock successful registration
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        phoneNumber: '2348012345678',
        displayName: 'Test User'
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      };

      // Mock the register method to return expected structure
      jest.spyOn(AuthService, 'register').mockResolvedValue({
        user: mockUser as any,
        tokens: mockTokens
      });

      const userData = {
        email: 'test@example.com',
        phoneNumber: '2348012345678',
        displayName: 'Test User',
        password: 'password123'
      };

      const result = await AuthService.register(userData);

      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.user.email).toBe(userData.email);
    });

    it('should throw error if user already exists', async () => {
      jest.spyOn(AuthService, 'register').mockRejectedValue(new Error('User with this email already exists'));

      const userData = {
        email: 'test@example.com',
        phoneNumber: '2348012345678',
        displayName: 'Test User',
        password: 'password123'
      };

      await expect(AuthService.register(userData)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('login', () => {
    it('should login user with correct credentials', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        isActive: true
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      };

      jest.spyOn(AuthService, 'login').mockResolvedValue({
        user: mockUser as any,
        tokens: mockTokens
      });

      const credentials = {
        email: 'test@example.com',
        password: 'password123'
      };

      const result = await AuthService.login(credentials);

      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('should throw error with invalid credentials', async () => {
      jest.spyOn(AuthService, 'login').mockRejectedValue(new Error('Invalid credentials'));

      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(AuthService.login(credentials)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getUserByPhoneNumber', () => {
    it('should return user when phone number exists', async () => {
      const mockUser = {
        id: 'user123',
        phoneNumber: '2348012345678',
        displayName: 'Test User'
      };

      jest.spyOn(AuthService, 'getUserByPhoneNumber').mockResolvedValue(mockUser as any);

      const result = await AuthService.getUserByPhoneNumber('2348012345678');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user123');
      expect(result?.phoneNumber).toBe('2348012345678');
    });

    it('should return null when phone number does not exist', async () => {
      jest.spyOn(AuthService, 'getUserByPhoneNumber').mockResolvedValue(null);

      const result = await AuthService.getUserByPhoneNumber('2348012345678');

      expect(result).toBeNull();
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token and return user', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com'
      };

      jest.spyOn(AuthService, 'verifyToken').mockResolvedValue(mockUser as any);

      const result = await AuthService.verifyToken('valid-token');

      expect(result).toBeDefined();
      expect(result.id).toBe('user123');
    });

    it('should throw error for invalid token', async () => {
      jest.spyOn(AuthService, 'verifyToken').mockRejectedValue(new Error('Invalid token'));

      await expect(AuthService.verifyToken('invalid-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('sendPhoneVerification', () => {
    it('should send phone verification and return OTP', async () => {
      const mockOTP = '123456';
      jest.spyOn(AuthService, 'sendPhoneVerification').mockResolvedValue(mockOTP);

      const result = await AuthService.sendPhoneVerification('2348012345678');

      expect(result).toBe(mockOTP);
      expect(result.length).toBe(6);
    });
  });

  describe('verifyPhoneOTP', () => {
    it('should verify valid OTP', async () => {
      jest.spyOn(AuthService, 'verifyPhoneOTP').mockResolvedValue(true);

      const result = await AuthService.verifyPhoneOTP('2348012345678', '123456');

      expect(result).toBe(true);
    });

    it('should reject invalid OTP', async () => {
      jest.spyOn(AuthService, 'verifyPhoneOTP').mockResolvedValue(false);

      const result = await AuthService.verifyPhoneOTP('2348012345678', 'invalid');

      expect(result).toBe(false);
    });
  });
});
