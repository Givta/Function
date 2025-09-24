import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode';
import { collections } from '../../config/firebase';
import { AuthService } from '../auth/AuthService';
import { WalletService } from '../WalletService';
import { ReferralService } from '../ReferralService';
import { NotificationService } from '../NotificationService';
import { PaystackService } from '../PaystackService';

export interface WhatsAppCommand {
  command: string;
  description: string;
  usage: string;
  handler: (sock: any, sender: string, phone: string, parts: string[]) => Promise<void>;
  requiresAuth?: boolean;
}

export class WhatsAppService {
  private static sock: any = null;
  private static qrCode: string = '';
  private static isConnected: boolean = false;
  private static commands: Map<string, WhatsAppCommand> = new Map();
  private static userSessions: Map<string, any> = new Map(); // Store user conversation state (in-memory cache)

  /**
   * Initialize WhatsApp bot
   */
  static async initialize(): Promise<void> {
    try {
      console.log('🤖 Initializing WhatsApp bot...');

      // Ensure auth directory exists
      const authDir = path.join(process.cwd(), 'auth_info_baileys');
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      this.sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        generateHighQualityLinkPreview: true
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        console.log('🔄 WhatsApp Connection Update:', {
          connection,
          hasQR: !!qr,
          lastDisconnect: lastDisconnect?.error?.message
        });

        if (qr) {
          this.qrCode = qr;
          console.log('\n🎯 WHATSAPP QR CODE GENERATED!');
          console.log('========================================');
          console.log(qr);
          console.log('========================================');
          console.log('📲 INSTRUCTIONS:');
          console.log('1. Open WhatsApp on your phone');
          console.log('2. Go to Settings → Linked Devices');
          console.log('3. Tap "Link a Device"');
          console.log('4. Scan the QR code above');
          console.log('========================================\n');
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('❌ Connection closed due to:', lastDisconnect?.error?.message);
          console.log('🔄 Should reconnect:', shouldReconnect);

          this.isConnected = false;

          if (shouldReconnect) {
            console.log('⏳ Reconnecting in 5 seconds...');
            setTimeout(() => {
              console.log('🔄 Attempting to reconnect WhatsApp bot...');
              this.initialize();
            }, 5000);
          } else {
            console.log('🛑 Not reconnecting (user logged out)');
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp Bot connected successfully!');
          console.log('🤖 Bot is ready to receive commands');
          this.isConnected = true;
        } else if (connection === 'connecting') {
          console.log('🔗 Connecting to WhatsApp...');
        }
      });

      // Handle credentials update
      this.sock.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      this.sock.ev.on('messages.upsert', async (m: any) => {
        await this.handleIncomingMessage(m);
      });

      // Register commands
      this.registerCommands();

    } catch (error) {
      console.error('Failed to initialize WhatsApp bot:', error);
      throw error;
    }
  }

  /**
   * Register available commands
   */
  private static registerCommands(): void {
    // Import command handlers
    const commands = [
      this.createRegisterCommand(),
      this.createBalanceCommand(),
      this.createTipCommand(),
      this.createDepositCommand(),
      this.createWithdrawCommand(),
      this.createReferralCommand(),
      this.createMyLinkCommand(),
      this.createProfileCommand(),
      this.createEditProfileCommand(),
      this.createHelpCommand(),
      this.createSupportCommand()
    ];

    commands.forEach(cmd => {
      this.commands.set(cmd.command, cmd);
      // Also register without the / prefix for flexibility
      if (cmd.command.startsWith('/')) {
        const commandWithoutSlash = cmd.command.substring(1);
        const cmdWithoutSlash = { ...cmd, command: commandWithoutSlash };
        this.commands.set(commandWithoutSlash, cmdWithoutSlash);
      }
    });

    console.log(`📋 Registered ${this.commands.size} WhatsApp commands`);
  }

  /**
   * Handle incoming messages
   */
  private static async handleIncomingMessage(m: any): Promise<void> {
    try {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        const sender = msg.key.remoteJid!;
        const message = msg.message?.conversation ||
                       msg.message?.extendedTextMessage?.text ||
                       '';

        const phone = sender.split('@')[0];

        // Check if user is in a conversation flow
        const sessionKey = `${phone}_register`;
        const passwordSessionKey = Object.keys(this.userSessions).find(key =>
          key.startsWith(`${phone}_`) && key.includes('_tip_')
        );
        const session = this.userSessions.get(sessionKey);
        const passwordSession = passwordSessionKey ? this.userSessions.get(passwordSessionKey) : null;

        if (session) {
          // Handle registration conversation response
          await this.handleConversationResponse(sender, phone, message.trim(), session);
        } else if (passwordSession) {
          // Handle password confirmation for transactions
          if (passwordSession.step === 'password_confirm') {
            if (message.toLowerCase() === 'cancel') {
              this.userSessions.delete(passwordSessionKey!);
              await this.sendMessage(sender, {
                text: '❌ Transaction cancelled.'
              });
            } else {
              await this.handlePasswordConfirmation(sender, phone, message.trim(), passwordSession);
              this.userSessions.delete(passwordSessionKey!);
            }
          }
        } else if (message.startsWith('/')) {
          // Handle command
          await this.processCommand(sender, phone, message);
        }
        // Ignore non-command messages when not in conversation
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle conversation responses for registration
   */
  private static async handleConversationResponse(sender: string, phone: string, message: string, session: any): Promise<void> {
    try {
      const sessionKey = `${phone}_register`;

      switch (session.step) {
        case 'username':
          // Validate username
          if (message.length < 3 || message.length > 20) {
            await this.sendMessage(sender, {
              text: '❌ Username must be 3-20 characters long.'
            });
            return;
          }

          if (!/^[a-zA-Z0-9_]+$/.test(message)) {
            await this.sendMessage(sender, {
              text: '❌ Username can only contain letters, numbers, and underscores.'
            });
            return;
          }

          // Check if username is already taken
          const existingUser = await AuthService.getUserByUsername(message);
          if (existingUser) {
            await this.sendMessage(sender, {
              text: '❌ This username is already taken. Please choose another one.'
            });
            return;
          }

          session.data.username = message;
          session.step = 'password';
          this.userSessions.set(sessionKey, session);

          await this.sendMessage(sender, {
            text: `*Step 2:* Create a password (minimum 6 characters)\n(Reply with your password, e.g., "mypassword123")`
          });
          break;

        case 'password':
          // Validate password
          if (message.length < 6) {
            await this.sendMessage(sender, {
              text: '❌ Password must be at least 6 characters long.'
            });
            return;
          }

          session.data.password = message;
          session.step = 'email';
          this.userSessions.set(sessionKey, session);

          await this.sendMessage(sender, {
            text: `*Step 3:* What's your email address?\n(Reply with your email, e.g., "john@example.com")`
          });
          break;

        case 'email':
          // Validate email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(message)) {
            await this.sendMessage(sender, {
              text: '❌ Please enter a valid email address.'
            });
            return;
          }

          // Check if email is already taken
          const existingEmailUser = await AuthService.getUserByEmail(message);
          if (existingEmailUser) {
            await this.sendMessage(sender, {
              text: '❌ This email is already registered.'
            });
            return;
          }

          session.data.email = message;
          session.step = 'referral';
          this.userSessions.set(sessionKey, session);

          await this.sendMessage(sender, {
            text: `*Step 4:* Do you have a referral code? (Optional)\n(Reply with the code or type "none" to skip)`
          });
          break;

        case 'referral':
          // Handle referral code
          let referralCode: string | undefined;
          if (message.toLowerCase() !== 'none' && message.trim()) {
            const code = message.trim().toUpperCase();

            // Validate referral code exists
            const referrer = await AuthService.getUserByReferralCode(code);
            if (referrer) {
              referralCode = code;
              await this.sendMessage(sender, {
                text: `✅ Valid referral code from @${referrer.username}`
              });
            } else {
              await this.sendMessage(sender, {
                text: '❌ Invalid referral code. Please check and try again, or type "none" to skip.'
              });
              return;
            }
          } else {
            await this.sendMessage(sender, {
              text: 'ℹ️ No referral code provided. Continuing without referral bonus.'
            });
          }

          session.data.referralCode = referralCode;
          session.step = 'confirm';
          this.userSessions.set(sessionKey, session);

          const confirmMessage = `*Step 5:* Please confirm your details:

👤 *Username:* ${session.data.username}
🔐 *Password:* ${'*'.repeat(session.data.password.length)}
📧 *Email:* ${session.data.email}
📱 *Phone:* ${session.data.phoneNumber}
${referralCode ? `🔗 *Referral Code:* ${referralCode}` : '🔗 *Referral:* None'}

Reply with "yes" to complete registration or "cancel" to start over.`;

          await this.sendMessage(sender, { text: confirmMessage });
          break;

        case 'confirm':
          if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
            await this.completeRegistration(sender, phone, session.data);
          } else if (message.toLowerCase() === 'cancel' || message.toLowerCase() === 'c') {
            this.userSessions.delete(sessionKey);
            await this.sendMessage(sender, {
              text: '❌ Registration cancelled. Type /register to start again.'
            });
          } else {
            await this.sendMessage(sender, {
              text: 'Please reply with "yes" to confirm or "cancel" to start over.'
            });
          }
          break;
      }
    } catch (error: any) {
      console.error('Conversation response error:', error);
      await this.sendMessage(sender, {
        text: '❌ An error occurred. Please try again later.'
      });
    }
  }

  /**
   * Complete user registration
   */
  private static async completeRegistration(sender: string, phone: string, data: any): Promise<void> {
    try {
      // Create user account with provided username and password
      const result = await AuthService.register({
        email: data.email,
        phoneNumber: phone,
        username: data.username,
        password: data.password, // Use provided password
        referralCode: data.referralCode
      });

      // Clear session
      const sessionKey = `${phone}_register`;
      this.userSessions.delete(sessionKey);

      // Send success message
      const successMessage = `🎉 *Registration Successful!*

Welcome to Givta, @${data.username}!

✅ Your account has been created
👤 Username: @${data.username}
📧 Email: ${data.email}
🔐 Password: ${'*'.repeat(data.password.length)} (keep this safe!)
💰 Wallet balance: ₦0.00

*Next Steps:*
1. Use /balance to view your account
2. Use /deposit to fund your wallet
3. Use /tip to send tips to friends
4. Use /profile to view your profile

*Security Note:*
• Keep your password safe
• You'll need it for financial transactions
• You can change it later with /editprofile

Type /help for all available commands.`;

      await this.sendMessage(sender, { text: successMessage });

      // Send welcome notification
      await NotificationService.createNotification(
        result.user.id,
        'Welcome to Givta!',
        'Your account has been successfully created. Start exploring our features!',
        'system',
        'medium',
        'all'
      );

    } catch (error: any) {
      console.error('Complete registration error:', error);
      await this.sendMessage(sender, {
        text: `❌ Registration failed: ${error.message}. Please try again.`
      });
    }
  }

  /**
   * Process WhatsApp commands
   */
  private static async processCommand(sender: string, phone: string, message: string): Promise<void> {
    try {
      const parts = message.split(' ');
      const command = parts[0].toLowerCase();

      const cmd = this.commands.get(command);
      if (!cmd) {
        await this.sendMessage(sender, {
          text: '❌ Unknown command. Type /help for available commands.'
        });
        return;
      }

      // Rate limiting check
      if (!await this.checkRateLimit(phone, command)) {
        await this.sendMessage(sender, {
          text: '⏰ Too many requests. Please wait a moment before trying again.'
        });
        return;
      }

      // Execute command
      await cmd.handler(this.sock, sender, phone, parts);

    } catch (error: any) {
      console.error('Command processing error:', error);
      await this.sendMessage(sender, {
        text: `❌ An error occurred: ${error.message || 'Please try again later.'}`
      });
    }
  }

  /**
   * Send message to user
   */
  static async sendMessage(to: string, content: any): Promise<void> {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp bot is not connected');
    }

    try {
      await this.sock.sendMessage(to, content);
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Send rich formatted message
   */
  static async sendRichMessage(to: string, title: string, content: string[]): Promise<void> {
    const message = `*${title}*\n\n${content.join('\n')}`;
    await this.sendMessage(to, { text: message });
  }

  /**
   * Get QR code for authentication
   */
  static getQRCode(): string {
    return this.qrCode;
  }

  /**
   * Check if bot is connected
   */
  static isBotConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Rate limiting check
   */
  private static async checkRateLimit(phone: string, command: string): Promise<boolean> {
    // TODO: Implement Redis-based rate limiting
    // For now, allow all requests
    return true;
  }

  /**
   * Generate QR code as data URL
   */
  static async generateQRCodeDataURL(): Promise<string | null> {
    if (!this.qrCode) return null;

    try {
      return await qrcode.toDataURL(this.qrCode);
    } catch (error) {
      console.error('Failed to generate QR code data URL:', error);
      return null;
    }
  }

  // Command definitions
  private static createRegisterCommand(): WhatsAppCommand {
    return {
      command: '/register',
      description: 'Register your account',
      usage: '/register [Name] [ReferralCode]',
      handler: async (sock, sender, phone, parts) => {
        await this.handleRegistration(sender, phone, parts);
      }
    };
  }

  private static createProfileCommand(): WhatsAppCommand {
    return {
      command: '/profile',
      description: 'View your profile information',
      usage: '/profile',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleProfileView(sender, phone);
      }
    };
  }

  private static createEditProfileCommand(): WhatsAppCommand {
    return {
      command: '/editprofile',
      description: 'Edit your profile information',
      usage: '/editprofile',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleEditProfile(sender, phone, parts);
      }
    };
  }

  /**
   * Handle profile view command
   */
  private static async handleProfileView(sender: string, phone: string): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      const profileMessage = `👤 *YOUR PROFILE*

📋 *Basic Information:*
• Username: @${user.username}
• Email: ${user.email || 'Not set'}
• Phone: ${user.phoneNumber}

🔗 *Referral Code:* ${user.referralCode}

📊 *Account Status:*
• Active: ${user.isActive ? '✅ Yes' : '❌ No'}
• Email Verified: ${user.emailVerified ? '✅ Yes' : '❌ No'}
• KYC Status: ${user.kycStatus.toUpperCase()}

💰 *Financial Info:*
• Total Earnings: ₦${user.totalEarnings.toLocaleString()}
• Total Referrals: ${user.totalReferrals}

⚙️ *Preferences:*
• Notifications: ${user.preferences.notifications ? '✅ On' : '❌ Off'}
• Language: ${user.preferences.language}
• Currency: ${user.preferences.currency}
• Theme: ${user.preferences.theme}

📅 *Account Created:* ${user.createdAt ? (user.createdAt instanceof Date ? user.createdAt.toLocaleDateString() : new Date((user.createdAt as any).seconds * 1000).toLocaleDateString()) : 'Unknown'}
🔄 *Last Login:* ${user.lastLoginAt ? (user.lastLoginAt instanceof Date ? user.lastLoginAt.toLocaleDateString() : new Date((user.lastLoginAt as any).seconds * 1000).toLocaleDateString()) : 'Never'}

*To edit your profile, use /editprofile*`;

      await this.sendMessage(sender, { text: profileMessage });

    } catch (error: any) {
      console.error('Profile view error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to retrieve profile. Please try again later.'
      });
    }
  }

  /**
   * Handle edit profile command
   */
  private static async handleEditProfile(sender: string, phone: string, parts: string[]): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Parse command arguments
      if (parts.length < 3) {
        const editHelp = `👤 *EDIT PROFILE*

*Available Options:*

1. *Username:* /editprofile username [new_username]
   Example: /editprofile username john_doe

2. *Display Name:* /editprofile name [new_name]
   Example: /editprofile name "John Doe"

3. *Email:* /editprofile email [new_email]
   Example: /editprofile email john@example.com

*Notes:*
• Username must be unique and 3-20 characters
• Display name 2-50 characters
• Email must be valid format
• Changes take effect immediately`;

        await this.sendMessage(sender, { text: editHelp });
        return;
      }

      const field = parts[1].toLowerCase();
      const value = parts.slice(2).join(' ').trim();

      let updateData: any = {};
      let successMessage = '';

      switch (field) {
        case 'username':
          // Validate username
          if (value.length < 3 || value.length > 20) {
            await this.sendMessage(sender, {
              text: '❌ Username must be 3-20 characters long.'
            });
            return;
          }

          if (!/^[a-zA-Z0-9_]+$/.test(value)) {
            await this.sendMessage(sender, {
              text: '❌ Username can only contain letters, numbers, and underscores.'
            });
            return;
          }

          // Check if username is already taken
          const existingUser = await AuthService.getUserByUsername(value);
          if (existingUser && existingUser.id !== user.id) {
            await this.sendMessage(sender, {
              text: '❌ This username is already taken. Please choose another one.'
            });
            return;
          }

          updateData.username = value;
          successMessage = `✅ Username updated to: ${value}`;
          break;

        case 'name':
          // Validate display name
          if (value.length < 2 || value.length > 50) {
            await this.sendMessage(sender, {
              text: '❌ Display name must be 2-50 characters long.'
            });
            return;
          }

          updateData.displayName = value;
          successMessage = `✅ Display name updated to: ${value}`;
          break;

        case 'email':
          // Validate email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            await this.sendMessage(sender, {
              text: '❌ Please enter a valid email address.'
            });
            return;
          }

          // Check if email is already taken
          const existingEmailUser = await AuthService.getUserByEmail(value);
          if (existingEmailUser && existingEmailUser.id !== user.id) {
            await this.sendMessage(sender, {
              text: '❌ This email is already registered.'
            });
            return;
          }

          updateData.email = value;
          updateData.emailVerified = false; // Require re-verification
          successMessage = `✅ Email updated to: ${value}\n⚠️ Please verify your new email address.`;
          break;

        default:
          await this.sendMessage(sender, {
            text: '❌ Invalid field. Use /editprofile to see available options.'
          });
          return;
      }

      // Update user in database
      const { db } = await import('../../config/firebase');
      await db.collection('users').doc(user.id).update({
        ...updateData,
        updatedAt: new Date()
      });

      await this.sendMessage(sender, { text: successMessage });

    } catch (error: any) {
      console.error('Edit profile error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to update profile. Please try again later.'
      });
    }
  }

  /**
   * Handle user registration with conversation flow
   */
  private static async handleRegistration(sender: string, phone: string, parts: string[]): Promise<void> {
    try {
      // Check if user already exists
      const existingUser = await AuthService.getUserByPhoneNumber(phone);
      if (existingUser) {
        await this.sendMessage(sender, {
          text: '✅ You are already registered! Use /balance to check your account.'
        });
        return;
      }

      // Start registration conversation
      const sessionKey = `${phone}_register`;
      this.userSessions.set(sessionKey, {
        step: 'username',
        data: { phoneNumber: phone }
      });

      const welcomeMessage = `🎉 *Welcome to Givta!*

Let's get you registered. I'll need some information from you.

*Step 1:* Choose a unique username (3-20 characters)
(Reply with your username, e.g., "john_doe")`;

      await this.sendMessage(sender, { text: welcomeMessage });

    } catch (error: any) {
      console.error('Registration error:', error);
      await this.sendMessage(sender, {
        text: '❌ Registration failed. Please try again later.'
      });
    }
  }

  private static createBalanceCommand(): WhatsAppCommand {
    return {
      command: '/balance',
      description: 'Check your wallet balance',
      usage: '/balance',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleBalanceCheck(sender, phone);
      }
    };
  }

  /**
   * Handle balance check
   */
  private static async handleBalanceCheck(sender: string, phone: string): Promise<void> {
    try {
      // Get user by phone number
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Ensure wallet exists for the user
      await WalletService.ensureWalletExists(user.id);

      // Get wallet balance
      const balance = await WalletService.getWalletBalance(user.id);

      // If balance is still 0, check if there are any pending transactions that need manual verification
      if (balance.balance === 0) {
        const transactions = await WalletService.getTransactionHistory(user.id, 5);
        const pendingDeposits = transactions.filter(t => t.type === 'deposit' && t.status === 'pending');

        if (pendingDeposits.length > 0) {
          const pendingTransaction = pendingDeposits[0];
          await this.sendMessage(sender, {
            text: `💰 *PENDING PAYMENT DETECTED*\n\nYou have a pending deposit of ₦${pendingTransaction.amount.toLocaleString()}.\nReference: ${pendingTransaction.reference}\n\nTo complete this payment, please use the manual verification endpoint or contact support.`
          });
        }
      }

      // Get recent transactions (last 5)
      const transactions = await WalletService.getTransactionHistory(user.id, 5);

      const balanceMessage = `💰 *GIVTA WALLET BALANCE*

👤 *Username:* @${user.username}
📱 *Phone:* ${user.phoneNumber}
💵 *Balance:* ₦${balance.balance.toLocaleString()}
🎁 *Referral Earnings:* ₦${balance.totalReferralEarnings.toLocaleString()}

📊 *Recent Activity:*
${transactions.length > 0
  ? transactions.slice(0, 3).map((tx, i) =>
      `${i + 1}. ${tx.type.replace('_', ' ').toUpperCase()} - ₦${Math.abs(tx.amount).toLocaleString()}`
    ).join('\n')
  : 'No recent transactions'
}

💡 *Commands:*
• /deposit [amount] - Fund your wallet
• /tip [amount] [username] - Send tip
• /referral - View referral stats`;

      await this.sendMessage(sender, { text: balanceMessage });

    } catch (error: any) {
      console.error('Balance check error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to retrieve balance. Please try again later.'
      });
    }
  }

  private static createTipCommand(): WhatsAppCommand {
    return {
      command: '/tip',
      description: 'Send tip to another user',
      usage: '/tip [Amount] [Username/Phone]',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleTipCommand(sender, phone, parts);
      }
    };
  }

  /**
   * Handle tip command (supports both username and phone number)
   */
  private static async handleTipCommand(sender: string, phone: string, parts: string[]): Promise<void> {
    try {
      // Get sender user
      const senderUser = await AuthService.getUserByPhoneNumber(phone);
      if (!senderUser) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Parse command arguments
      if (parts.length < 3) {
        await this.sendMessage(sender, {
          text: '❌ Invalid format. Usage: /tip [Amount] [Username or Phone]\nExamples:\n• /tip 500 john_doe\n• /tip 500 2348012345678'
        });
        return;
      }

      const amount = parseInt(parts[1]);
      const recipientIdentifier = parts[2];

      // Validate amount
      if (isNaN(amount) || amount < 10) {
        await this.sendMessage(sender, {
          text: '❌ Minimum tip amount is ₦10.'
        });
        return;
      }

      if (amount > 50000) {
        await this.sendMessage(sender, {
          text: '❌ Maximum tip amount is ₦50,000.'
        });
        return;
      }

      // Try to find recipient by username first, then by phone number
      let recipientUser = await AuthService.getUserByUsername(recipientIdentifier);

      // If not found by username, try phone number
      if (!recipientUser) {
        const cleanPhone = recipientIdentifier.replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 10) {
          recipientUser = await AuthService.getUserByPhoneNumber(cleanPhone);
        }
      }

      if (!recipientUser) {
        await this.sendMessage(sender, {
          text: `❌ User "${recipientIdentifier}" not found. Please check the username or phone number.`
        });
        return;
      }

      if (recipientUser.id === senderUser.id) {
        await this.sendMessage(sender, {
          text: '❌ You cannot tip yourself.'
        });
        return;
      }

      // Start password authentication session for transaction
      const sessionKey = `${phone}_tip_${Date.now()}`;
      this.userSessions.set(sessionKey, {
        step: 'password_confirm',
        data: {
          phoneNumber: phone,
          amount: amount,
          recipientId: recipientUser.id,
          recipientName: `@${recipientUser.username}`,
          recipientIdentifier: recipientIdentifier
        },
        expiresAt: Date.now() + 300000 // 5 minutes
      });

      // Request password confirmation
      const confirmMessage = `🔐 *PASSWORD REQUIRED*

You're about to send ₦${amount.toLocaleString()} to @${recipientUser.username}.

💰 *Transaction Details:*
• Amount: ₦${amount.toLocaleString()}
• Recipient: @${recipientUser.username}
• Fee: ₦${Math.round(amount * 0.02).toLocaleString()} (2%)
• Net Amount: ₦${(amount - Math.round(amount * 0.02)).toLocaleString()}

🔒 *For security, please enter your account password to confirm this transaction.*

Reply with your password or type "cancel" to abort.`;

      await this.sendMessage(sender, { text: confirmMessage });

    } catch (error: any) {
      console.error('Tip command error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to process tip. Please try again later.'
      });
    }
  }

  /**
   * Handle password confirmation for transactions
   */
  private static async handlePasswordConfirmation(sender: string, phone: string, password: string, session: any): Promise<void> {
    try {
      // Get user and verify password
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user || !user.passwordHash) {
        await this.sendMessage(sender, {
          text: '❌ Account verification failed. Please try again.'
        });
        return;
      }

      // Verify password
      const isValidPassword = await AuthService.comparePassword(password, user.passwordHash);
      if (!isValidPassword) {
        await this.sendMessage(sender, {
          text: '❌ Incorrect password. Transaction cancelled for security.'
        });
        return;
      }

      // Password verified, process the transaction
      const { amount, recipientId, recipientName, recipientIdentifier } = session.data;

      // Process tip
      const result = await WalletService.processTip(
        user.id,
        recipientId,
        amount,
        'whatsapp',
        `Tip from ${user.username}`,
        false
      );

      if (result.success) {
        // Send confirmation to sender
        const senderMessage = `✅ *TIP SENT SUCCESSFULLY*

💸 Amount: ₦${amount.toLocaleString()}
👤 To: ${recipientName}
💰 Platform Fee: ₦${Math.round(amount * 0.02).toLocaleString()} (2%)
📱 Net Amount: ₦${(amount - Math.round(amount * 0.02)).toLocaleString()}

🧾 Transaction ID: ${result.transactionId}
⏰ Time: ${new Date().toLocaleString()}

Your new balance: ₦${result.newBalance?.toLocaleString()}`;

        await this.sendMessage(sender, { text: senderMessage });

        // Send notification to recipient
        let recipientChatId = null;
        const recipientUser = await AuthService.getUserById(recipientId);
        if (recipientUser && recipientUser.phoneNumber) {
          recipientChatId = `${recipientUser.phoneNumber}@s.whatsapp.net`;
        }

        if (recipientChatId) {
          const recipientMessage = `🎁 *YOU RECEIVED A TIP!*

💸 Amount: ₦${(amount - Math.round(amount * 0.02)).toLocaleString()}
👤 From: ${user.username}
📱 Time: ${new Date().toLocaleString()}

💰 Your wallet has been credited automatically.

Use /balance to check your account!`;

          try {
            await this.sendMessage(recipientChatId, { text: recipientMessage });
          } catch (error) {
            console.log('Could not send WhatsApp notification to recipient');
          }
        }

        // Send notifications
        await NotificationService.sendTipNotification(
          recipientId,
          user.username || 'Anonymous',
          amount - Math.round(amount * 0.02),
          'NGN'
        );

      } else {
        await this.sendMessage(sender, {
          text: `❌ Tip failed: ${result.error}`
        });
      }

    } catch (error: any) {
      console.error('Password confirmation error:', error);
      await this.sendMessage(sender, {
        text: '❌ Transaction failed. Please try again later.'
      });
    }
  }

  private static createDepositCommand(): WhatsAppCommand {
    return {
      command: '/deposit',
      description: 'Generate payment link for wallet funding',
      usage: '/deposit [Amount]',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleDepositCommand(sender, phone, parts);
      }
    };
  }

  /**
   * Handle deposit command
   */
  private static async handleDepositCommand(sender: string, phone: string, parts: string[]): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Parse amount
      if (parts.length < 2) {
        await this.sendMessage(sender, {
          text: '❌ Invalid format. Usage: /deposit [Amount]\nExample: /deposit 1000'
        });
        return;
      }

      const amount = parseInt(parts[1]);

      // Validate amount
      if (isNaN(amount) || amount < 100) {
        await this.sendMessage(sender, {
          text: '❌ Minimum deposit amount is ₦100.'
        });
        return;
      }

      if (amount > 2000000) {
        await this.sendMessage(sender, {
          text: '❌ Maximum deposit amount is ₦2,000,000.'
        });
        return;
      }

      // Create payment link
      const paymentResult = await PaystackService.createPaymentLink(user.id, amount);

      if (!paymentResult.success) {
        await this.sendMessage(sender, {
          text: `❌ Failed to create payment link: ${paymentResult.error}`
        });
        return;
      }

      // Send payment link
      const depositMessage = `💳 *WALLET FUNDING*

💵 Amount: ₦${amount.toLocaleString()}
🔗 Payment Link: ${paymentResult.paymentUrl}

⚠️ *Important Notes:*
• Link expires in 30 minutes
• Complete payment to credit wallet
• You'll receive confirmation message

*Click the link above to proceed with payment*

🧾 Reference: ${paymentResult.reference}`;

      await this.sendMessage(sender, { text: depositMessage });

    } catch (error: any) {
      console.error('Deposit command error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to generate payment link. Please try again later.'
      });
    }
  }

  private static createWithdrawCommand(): WhatsAppCommand {
    return {
      command: '/withdraw',
      description: 'Request withdrawal to bank account',
      usage: '/withdraw [Amount] [AccountDetails]',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleWithdrawCommand(sender, phone);
      }
    };
  }

  /**
   * Handle withdraw command - direct to app
   */
  private static async handleWithdrawCommand(sender: string, phone: string): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      const withdrawMessage = `💸 *WITHDRAWAL REQUEST*

For security reasons, withdrawals must be processed through the Givta mobile app.

📱 *Please use the app to:*
1. Open the Givta app
2. Go to Wallet section
3. Tap "Withdraw"
4. Enter withdrawal details
5. Complete verification

*Security Features:*
• Bank account verification required
• 2.3% processing fee
• Minimum: ₦100 | Maximum: ₦500,000 daily
• Instant processing for verified accounts

🔒 *Why app-only?*
• Enhanced security for financial transactions
• Real-time verification
• Secure bank account management

Download/update the Givta app if you haven't already!`;

      await this.sendMessage(sender, { text: withdrawMessage });

    } catch (error: any) {
      console.error('Withdraw command error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to process withdrawal request. Please try again later.'
      });
    }
  }

  private static createReferralCommand(): WhatsAppCommand {
    return {
      command: '/referral',
      description: 'View referral statistics',
      usage: '/referral',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleReferralCommand(sender, phone);
      }
    };
  }

  /**
   * Handle referral command
   */
  private static async handleReferralCommand(sender: string, phone: string): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Get referral stats
      const referralStats = await ReferralService.getReferralStats(user.id);

      const referralMessage = `🔗 *REFERRAL STATISTICS*

👤 *Your Info:*
• Username: @${user.username}
• Referral Code: *${referralStats.referralCode}*

📊 *Your Performance:*
• Total Referrals: ${referralStats.totalReferrals}
• Total Bonus Earned: ₦${referralStats.totalEarnings.toLocaleString()}

🏆 *Referral Breakdown:*
• Level 1 (Direct): ${referralStats.levelStats.find(l => l.level === 1)?.count || 0} referrals
• Level 2: ${referralStats.levelStats.find(l => l.level === 2)?.count || 0} referrals
• Level 3: ${referralStats.levelStats.find(l => l.level === 3)?.count || 0} referrals

💰 *Bonus Structure:*
• Level 1: ₦100 per referral
• Level 2: ₦50 per referral
• Level 3: ₦25 per referral (30+ days active)

📈 *Recent Referrals:*
${referralStats.levelStats.length > 0
  ? referralStats.levelStats.map((level, i) =>
      `${i + 1}. Level ${level.level} - ${level.count} referrals - ₦${level.earnings} earned`
    ).join('\n')
  : 'No referral data'
}

🔗 *Share your code:* ${referralStats.referralCode}

*Invite friends and earn bonuses when they sign up!*`;

      await this.sendMessage(sender, { text: referralMessage });

    } catch (error: any) {
      console.error('Referral command error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to retrieve referral statistics. Please try again later.'
      });
    }
  }

  private static createHelpCommand(): WhatsAppCommand {
    return {
      command: '/help',
      description: 'Display all available commands',
      usage: '/help',
      handler: async (sock, sender, phone, parts) => {
        const helpText = `🤖 *GIVTA WHATSAPP BOT*

*Available Commands:*

📝 /register - Start guided account registration
💰 /balance - Check your wallet balance & recent activity
🎯 /tip [Amount] [Username/Phone] - Send tip to another user (2% fee)
💳 /deposit [Amount] - Generate Paystack payment link
💸 /withdraw - Request withdrawal (app only, 2.3% fee)
🔗 /referral - View referral statistics & earnings
� /mylink - Get your referral and tipping links
�👤 /profile - View your complete profile information
✏️ /editprofile - Edit your profile (username, name, email)
🆘 /support - Get help and contact support
❓ /help - Show this help message

*Tipping Examples:*
• /tip 500 john_doe (by username)
• /tip 1000 2348012345678 (by phone number)

*Profile Examples:*
• /profile - View your profile
• /editprofile username john_doe
• /editprofile name "John Doe"
• /editprofile email john@example.com

*Security & Limits:*
• All financial operations require password confirmation
• Tipping fee: 2% | Withdrawal fee: 2.3%
• Minimum tip: ₦10 | Maximum tip: ₦50,000
• Minimum deposit: ₦100 | Maximum deposit: ₦2,000,000
• Login with email OR phone number

*Registration Process:*
1. Type /register to start
2. Follow the guided steps (username → password → email → referral)
3. Confirm your details
4. Start using all features!

_Type any command to get started!_`;

        await this.sendMessage(sender, { text: helpText });
      }
    };
  }



  private static createMyLinkCommand(): WhatsAppCommand {
    return {
      command: '/mylink',
      description: 'Get your referral and tipping links',
      usage: '/mylink',
      requiresAuth: true,
      handler: async (sock, sender, phone, parts) => {
        await this.handleMyLinkCommand(sender, phone);
      }
    };
  }

  /**
   * Handle mylink command - shows referral and tipping links
   */
  private static async handleMyLinkCommand(sender: string, phone: string): Promise<void> {
    try {
      // Get user
      const user = await AuthService.getUserByPhoneNumber(phone);
      if (!user) {
        await this.sendMessage(sender, {
          text: '❌ You are not registered. Please use /register to create an account.'
        });
        return;
      }

      // Generate referral link (assuming frontend URL)
      const frontendUrl = process.env.FRONTEND_URL || 'https://givta.com';
      const referralLink = `${frontendUrl}/register?ref=${user.referralCode}`;

      // Generate tipping link
      const tippingLink = `${frontendUrl}/tip?user=${user.username}`;

      const myLinkMessage = `🔗 *YOUR GIVTA LINKS*

👤 *Your Profile:*
• Username: @${user.username}
• Referral Code: *${user.referralCode}*

📎 *Shareable Links:*

🔗 *Referral Link:*
${referralLink}

🎯 *Tipping Link:*
${tippingLink}

💡 *How to Use:*

*Referral Link:*
• Share with friends to earn bonuses
• They get ₦100 bonus when they sign up
• You earn ₦100 for each direct referral
• Multi-level bonuses available

*Tipping Link:*
• Anyone can tip you instantly
• No registration required for tipper
• Funds go directly to your wallet
• Share on social media, bio, etc.

📱 *Quick Share Commands:*
• Copy and share these links
• Use /referral to see your stats
• Use /balance to check earnings

*Start earning today! 🚀*`;

      await this.sendMessage(sender, { text: myLinkMessage });

    } catch (error: any) {
      console.error('My link command error:', error);
      await this.sendMessage(sender, {
        text: '❌ Failed to generate your links. Please try again later.'
      });
    }
  }

  private static createSupportCommand(): WhatsAppCommand {
    return {
      command: '/support',
      description: 'Create support ticket or contact help',
      usage: '/support',
      handler: async (sock, sender, phone, parts) => {
        const supportText = `🆘 *GIVTA SUPPORT*

Need help? Here's how to reach us:

📧 *Email:* support@givta.com
📱 *WhatsApp:* +234 XXX XXX XXXX
🌐 *Website:* https://givta.com/support

*Common Issues:*
• Account verification problems
• Payment issues
• Technical difficulties
• Feature requests

Please include your phone number and describe your issue clearly.

_We'll respond within 24 hours!_`;

        await this.sendMessage(sender, { text: supportText });
      }
    };
  }
}
