import { Request, Response, NextFunction } from 'express';

export class SecurityMiddleware {
  /**
   * Sanitize input data to prevent XSS attacks
   */
  static sanitizeInput(req: Request, res: Response, next: NextFunction) {
    // Sanitize body parameters (basic sanitization)
    if (req.body && typeof req.body === 'object') {
      this.sanitizeObject(req.body);
    }

    next();
  }

  /**
   * Validate and sanitize object recursively
   */
  private static sanitizeObject(obj: any): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Basic sanitization - remove potentially dangerous characters
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        obj[key] = obj[key].replace(/javascript:/gi, '');
        obj[key] = obj[key].replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  /**
   * Validate email format
   */
  static validateEmail(req: Request, res: Response, next: NextFunction) {
    const { email } = req.body;

    if (email) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    next();
  }

  /**
   * Validate phone number format
   */
  static validatePhoneNumber(req: Request, res: Response, next: NextFunction) {
    const { phoneNumber } = req.body;

    if (phoneNumber) {
      // Remove all non-digit characters except +
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');

      // Check if it matches international format
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format. Use international format (e.g., +2348012345678)'
        });
      }

      // Store cleaned phone number
      req.body.phoneNumber = cleanPhone;
    }

    next();
  }

  /**
   * Validate password strength
   */
  static validatePassword(req: Request, res: Response, next: NextFunction) {
    const { password } = req.body;

    if (password) {
      if (typeof password !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Password must be a string'
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }

      // Check for common weak passwords
      const weakPasswords = ['password', '12345678', 'qwerty', 'abc123', 'password123'];
      if (weakPasswords.includes(password.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Password is too weak. Please choose a stronger password'
        });
      }

      // Check for basic complexity
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
        return res.status(400).json({
          success: false,
          message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        });
      }
    }

    next();
  }

  /**
   * Validate amount for financial operations
   */
  static validateAmount(req: Request, res: Response, next: NextFunction) {
    const { amount } = req.body;

    if (amount !== undefined) {
      const numAmount = parseFloat(amount);

      if (isNaN(numAmount)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount format'
        });
      }

      if (numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than zero'
        });
      }

      if (numAmount > 2000000) { // 2 million naira limit
        return res.status(400).json({
          success: false,
          message: 'Amount exceeds maximum allowed limit'
        });
      }

      // Store parsed amount
      req.body.amount = numAmount;
    }

    next();
  }

  /**
   * Check for suspicious request patterns
   */
  static detectSuspiciousActivity(req: Request, res: Response, next: NextFunction) {
    const suspiciousPatterns = [
      /\bunion\b.*\bselect\b/i,
      /\bscript\b/i,
      /\beval\b/i,
      /\bexec\b/i,
      /\bdrop\b.*\btable\b/i,
      /\bdelete\b.*\bfrom\b/i
    ];

    const checkString = JSON.stringify(req.body) + JSON.stringify(req.query);

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(checkString)) {
        console.warn(`Suspicious activity detected from IP: ${req.ip}`);
        return res.status(403).json({
          success: false,
          message: 'Request blocked due to suspicious content'
        });
      }
    }

    next();
  }

  /**
   * Add security headers
   */
  static securityHeaders(req: Request, res: Response, next: NextFunction) {
    // Remove X-Powered-By header
    res.removeHeader('X-Powered-By');

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Content Security Policy (basic)
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self'; " +
      "connect-src 'self'"
    );

    next();
  }

  /**
   * Log security events
   */
  static logSecurityEvent(req: Request, res: Response, next: NextFunction) {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const method = req.method;
    const url = req.originalUrl;

    console.log(`[${timestamp}] ${method} ${url} - IP: ${ip} - UA: ${userAgent.substring(0, 100)}`);

    // Log suspicious activities
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      console.log(`[${timestamp}] Request Body:`, JSON.stringify(req.body).substring(0, 500));
    }

    next();
  }

  /**
   * Validate file uploads
   */
  static validateFileUpload(req: Request, res: Response, next: NextFunction) {
    const reqWithFiles = req as any;
    if (!reqWithFiles.file && !reqWithFiles.files) {
      return next();
    }

    const files = reqWithFiles.files;
    const file = reqWithFiles.file || (files && files[0]);

    if (file) {
      // Check file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB'
        });
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, and PDF files are allowed'
        });
      }

      // Check file name for suspicious characters
      const suspiciousChars = /[<>:"\/\\|?*\x00-\x1f]/;
      if (suspiciousChars.test(file.originalname)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file name'
        });
      }
    }

    next();
  }

  /**
   * Rate limit based on user behavior
   */
  static adaptiveRateLimit(req: Request, res: Response, next: NextFunction) {
    // This could be enhanced to track user behavior patterns
    // For now, just pass through
    next();
  }

  /**
   * Validate API key for external requests (if needed)
   */
  static validateApiKey(req: Request, res: Response, next: NextFunction) {
    // Skip for internal routes
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/health')) {
      return next();
    }

    // Check for API key in header (optional)
    const apiKey = req.get('X-API-Key');
    if (apiKey) {
      // Validate API key (implement your logic here)
      const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
      if (!validApiKeys.includes(apiKey)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key'
        });
      }
    }

    next();
  }
}
