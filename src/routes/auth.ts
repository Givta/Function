import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';

const router = Router();

// Public routes (no authentication required)
router.post('/register', AuthController.register);
router.post('/login', (req, res) => {
  console.log('Auth login endpoint called with:', req.body);
  return AuthController.login(req, res);
});
router.post('/refresh-token', AuthController.refreshToken);
router.post('/send-phone-verification', AuthController.sendPhoneVerification);
router.post('/verify-phone-otp', AuthController.verifyPhoneOTP);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

// Protected routes (authentication required)
router.use(AuthMiddleware.authenticate); // All routes below require authentication

router.get('/profile', AuthController.getProfile);
router.post('/logout', AuthController.logout);
router.post('/send-email-verification', AuthController.sendEmailVerification);
router.post('/verify-email-token', AuthController.verifyEmailToken);
router.post('/register-device', AuthController.registerDevice);

// User verification endpoints
router.post('/resend-email-verification', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.email) {
      return res.status(400).json({
        success: false,
        message: 'User email not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    const token = await AuthController.sendEmailVerification(req, res);
    // The controller handles the response, so we don't send another one
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend verification email'
    });
  }
});

router.post('/resend-phone-verification', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'User phone number not found'
      });
    }

    // TODO: Check if phone is already verified
    // For now, allow resending

    const otp = await AuthController.sendPhoneVerification(req, res);
    // The controller handles the response
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend phone verification'
    });
  }
});

export default router;
