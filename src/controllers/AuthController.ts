import { Request, Response } from 'express';
import { AuthService, RegisterData, LoginCredentials } from '../services/auth/AuthService';
import { IUser } from '../models';

export class AuthController {
  /**
   * Register a new user
   */
  static async register(req: Request, res: Response) {
    try {
      const data: RegisterData = req.body;

      // Validate required fields
      if (!data.username || !data.password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      // Validate password strength
      if (data.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await AuthService.register(data);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.user,
          tokens: result.tokens
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Registration failed'
      });
    }
  }

  /**
   * Login user
   */
  static async login(req: Request, res: Response) {
    try {
      const credentials: LoginCredentials = req.body;

      if ((!credentials.email && !credentials.phoneNumber) || !credentials.password) {
        return res.status(400).json({
          success: false,
          message: 'Email/phone and password are required'
        });
      }

      const result = await AuthService.login(credentials);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          tokens: result.tokens
        }
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      const tokens = await AuthService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: { tokens }
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        message: error.message || 'Token refresh failed'
      });
    }
  }

  /**
   * Send phone verification OTP
   */
  static async sendPhoneVerification(req: Request, res: Response) {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      // Validate phone number format
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format'
        });
      }

      const otp = await AuthService.sendPhoneVerification(phoneNumber);

      res.json({
        success: true,
        message: 'OTP sent successfully',
        data: { otp } // Remove in production - only for testing
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send OTP'
      });
    }
  }

  /**
   * Verify phone OTP
   */
  static async verifyPhoneOTP(req: Request, res: Response) {
    try {
      const { phoneNumber, otp } = req.body;

      if (!phoneNumber || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and OTP are required'
        });
      }

      const isValid = await AuthService.verifyPhoneOTP(phoneNumber, otp);

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP'
        });
      }

      res.json({
        success: true,
        message: 'Phone number verified successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'OTP verification failed'
      });
    }
  }

  /**
   * Send email verification
   */
  static async sendEmailVerification(req: Request, res: Response) {
    try {
      const user = req.user as IUser;

      if (!user.email) {
        return res.status(400).json({
          success: false,
          message: 'User has no email address'
        });
      }

      const token = await AuthService.sendEmailVerification(user.email);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
        data: { token } // Remove in production - only for testing
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send verification email'
      });
    }
  }

  /**
   * Verify email token
   */
  static async verifyEmailToken(req: Request, res: Response) {
    try {
      const { token } = req.body;
      const user = req.user as IUser;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Verification token is required'
        });
      }

      const isValid = await AuthService.verifyEmailToken(token);

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      }

      // Update user email verification status
      // TODO: Update user in database

      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Email verification failed'
      });
    }
  }

  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response) {
    try {
      const user = req.user as IUser;

      res.json({
        success: true,
        data: { user }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get profile'
      });
    }
  }

  /**
   * Logout user (client-side token removal)
   */
  static async logout(req: Request, res: Response) {
    try {
      // In a stateless JWT system, logout is handled client-side
      // Optionally, you could implement token blacklisting here

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Logout failed'
      });
    }
  }

  /**
   * Forgot password - send reset link
   */
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // TODO: Implement password reset logic
      // Generate reset token, save to database, send email

      res.json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send reset email'
      });
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Reset token and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }

      // TODO: Implement password reset logic
      // Verify token, update password, invalidate token

      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Password reset failed'
      });
    }
  }

  /**
   * Register device token for push notifications
   */
  static async registerDevice(req: Request, res: Response) {
    try {
      const user = req.user as IUser;
      const { deviceToken, platform } = req.body;

      if (!deviceToken) {
        return res.status(400).json({
          success: false,
          message: 'Device token is required'
        });
      }

      // Store device token in user record or separate device collection
      // For now, we'll store it in the user's document
      const { db } = await import('../config/firebase');

      await db.collection('users').doc(user.id).update({
        deviceToken,
        platform: platform || 'mobile',
        deviceRegisteredAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`📱 Device token registered for user ${user.username}: ${deviceToken}`);

      res.json({
        success: true,
        message: 'Device registered successfully'
      });
    } catch (error: any) {
      console.error('Device registration error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to register device'
      });
    }
  }
}
