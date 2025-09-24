import { Router } from 'express';
import { TwoFactorService } from '../services/TwoFactorService';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Generate 2FA setup
 * GET /api/twofactor/setup
 */
router.get('/setup', async (req, res) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email || '';

    const result = await TwoFactorService.generateSetup(userId, userEmail);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.setup
    });

  } catch (error: any) {
    console.error('Generate 2FA setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate 2FA setup'
    });
  }
});

/**
 * Verify and enable 2FA
 * POST /api/twofactor/enable
 */
router.post('/enable', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token, secret } = req.body;

    if (!token || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Token and secret are required'
      });
    }

    const result = await TwoFactorService.verifyAndEnable(userId, token, secret);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: '2FA has been enabled successfully'
    });

  } catch (error: any) {
    console.error('Enable 2FA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable 2FA'
    });
  }
});

/**
 * Verify 2FA token (for login)
 * POST /api/twofactor/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const result = await TwoFactorService.verifyToken(userId, token);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      verified: result.verified
    });

  } catch (error: any) {
    console.error('Verify 2FA token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify 2FA token'
    });
  }
});

/**
 * Disable 2FA
 * POST /api/twofactor/disable
 */
router.post('/disable', async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await TwoFactorService.disableTwoFactor(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: '2FA has been disabled successfully'
    });

  } catch (error: any) {
    console.error('Disable 2FA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable 2FA'
    });
  }
});

/**
 * Regenerate backup codes
 * POST /api/twofactor/backup-codes
 */
router.post('/backup-codes', async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await TwoFactorService.regenerateBackupCodes(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.setup?.backupCodes,
      message: 'Backup codes regenerated successfully'
    });

  } catch (error: any) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate backup codes'
    });
  }
});

/**
 * Check 2FA status
 * GET /api/twofactor/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user!.id;
    const isEnabled = await TwoFactorService.isTwoFactorEnabled(userId);

    res.json({
      success: true,
      enabled: isEnabled
    });

  } catch (error: any) {
    console.error('Check 2FA status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check 2FA status'
    });
  }
});

export default router;
