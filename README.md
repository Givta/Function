# Givta Backend - WhatsApp Tipping & Wallet System

A comprehensive Node.js/TypeScript backend system for WhatsApp tipping and wallet functionality.

## Features

- 🤖 **WhatsApp Bot Integration** - Baileys-powered WhatsApp bot
- 💰 **Wallet System** - Secure digital wallet with balance management
- 🎯 **Tipping Functionality** - Send tips between users with 2% fee
- 🔗 **Referral System** - Earn bonuses for referring new users
- 💳 **Paystack Integration** - Payment processing for deposits and withdrawals
- 🔥 **Firebase Integration** - Firestore database and authentication
- 📱 **REST API** - Complete API for mobile app integration

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Firebase Firestore
- **WhatsApp**: Baileys
- **Payments**: Paystack
- **Security**: Helmet, CORS

## Project Structure

```
Backend/
├── src/
│   ├── config.ts          # Environment & Firebase configuration
│   ├── types.ts           # TypeScript interfaces
│   ├── services.ts        # Business logic (Paystack, Wallet, Referral)
│   ├── routes.ts          # API endpoints
│   └── index.ts           # Main application entry point
├── .env                   # Environment variables
├── .gitignore            # Git ignore rules
├── firebase-service-account.json  # Firebase credentials
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd Backend
npm install
```

### 2. Environment Configuration

Update the `.env` file with your actual credentials:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project-id.iam.gserviceaccount.com

# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_test_your-paystack-secret-key
PAYSTACK_PUBLIC_KEY=pk_test_your-paystack-public-key

# Server Configuration
PORT=3000
NODE_ENV=development

# WhatsApp Bot Configuration
BOT_PHONE_NUMBER=your-bot-phone-number
```

### 3. Firebase Setup

**Step-by-step Firebase Configuration:**

1. **Create Firebase Project:**
   - Go to https://console.firebase.google.com/
   - Click "Create a project" or select existing project
   - Enable Google Analytics if desired

2. **Enable Firestore Database:**
   - In Firebase Console, go to "Firestore Database"
   - Click "Create database"
   - Choose "Start in test mode" for development
   - Select a location for your database

3. **Create Service Account:**
   - Go to Project Settings (gear icon)
   - Click "Service accounts" tab
   - Click "Generate new private key"
   - Download the JSON file

4. **Configure Backend:**
   - Replace `Backend/firebase-service-account.json` with your downloaded JSON file
   - The file should contain your actual Firebase credentials

**Alternative: Environment Variables**
If you prefer using environment variables instead of the JSON file:
- Copy the values from your downloaded JSON file
- Update the `.env` file with the actual values
- The system will automatically use the JSON file if available, otherwise fall back to environment variables

### 4. Paystack Setup

1. Create a Paystack account at https://paystack.com/
2. Get your API keys from the dashboard
3. Update the `.env` file with your keys

### 5. Build and Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## WhatsApp Bot Commands

The bot supports the following commands:

- `/register [Name] [ReferralCode]` - Register a new user account
- `/balance` - Check wallet balance
- `/tip [Amount] [Phone]` - Send tip to another user
- `/referral` - View referral statistics
- `/withdraw [Amount]` - Request withdrawal
- `/help` - Show available commands

## API Endpoints

### User Management
- `GET /api/users/:userId` - Get user details
- `POST /api/users` - Create new user

### Wallet Operations
- `GET /api/wallet/:userId/balance` - Get wallet balance
- `POST /api/wallet/:userId/deposit` - Initialize deposit
- `POST /api/wallet/:userId/withdraw` - Process withdrawal

### Tipping
- `POST /api/tip` - Send tip to another user

### Referrals
- `GET /api/referrals/:userId/stats` - Get referral statistics

### Transactions
- `GET /api/transactions/:userId` - Get user transactions

### Webhooks
- `POST /api/webhooks/paystack` - Paystack webhook handler

## Business Logic

### Fees
- **Tipping Fee**: 2% of tip amount
- **Withdrawal Fee**: 4% of withdrawal amount
- **Referral Bonus**: $1 per successful referral

### Security Features
- Input validation
- Error handling
- Secure environment variable management
- Firebase security rules (to be implemented)

## Development

### Available Scripts

```bash
npm run build    # Compile TypeScript
npm run start    # Run production server
npm run dev      # Run development server with hot reload
```

### Testing the Bot

1. Start the server: `npm run dev`
2. Scan the QR code displayed in the terminal with WhatsApp
3. Send commands to the bot number

### API Testing

Use tools like Postman or curl to test the API endpoints:

```bash
# Health check
curl http://localhost:3000/health

# Create user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"phone": "1234567890", "name": "John Doe"}'
```

## Deployment

### Environment Variables for Production

Ensure all environment variables are properly set in your production environment:

- Set `NODE_ENV=production`
- Use production Firebase and Paystack credentials
- Configure proper CORS origins
- Set up SSL/TLS certificates

### Docker Support (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Follow TypeScript best practices
2. Add proper error handling
3. Write clear commit messages
4. Test thoroughly before deploying

## License

ISC License
