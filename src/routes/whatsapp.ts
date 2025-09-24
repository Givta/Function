import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp/WhatsAppService';

const router = Router();

// QR Code display endpoint for WhatsApp bot setup
router.get('/qr', async (req, res) => {
  try {
    const qrCodeDataURL = await WhatsAppService.generateQRCodeDataURL();

    if (!qrCodeDataURL) {
      return res.status(503).json({
        success: false,
        message: 'QR code not available. Bot may not be initialized yet.'
      });
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Givta WhatsApp Bot - QR Code</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
          }
          h1 {
            color: #4B0082;
            margin-bottom: 10px;
            font-size: 28px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .qr-container {
            background: #f8f9fa;
            border: 2px solid #4B0082;
            border-radius: 15px;
            padding: 20px;
            margin: 30px 0;
            display: inline-block;
          }
          .qr-code {
            width: 256px;
            height: 256px;
            border-radius: 10px;
          }
          .instructions {
            background: #f0f8ff;
            border-left: 4px solid #4B0082;
            padding: 20px;
            margin-top: 30px;
            text-align: left;
          }
          .instructions h3 {
            color: #4B0082;
            margin-top: 0;
            margin-bottom: 15px;
          }
          .instructions ol {
            margin: 0;
            padding-left: 20px;
          }
          .instructions li {
            margin-bottom: 8px;
            color: #555;
          }
          .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 14px;
          }
          .status.waiting {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
          }
          .status.connected {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }
          .status.connecting {
            background: #cce7ff;
            color: #004085;
            border: 1px solid #99d6ff;
          }
          .refresh-btn {
            background: #4B0082;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
          }
          .refresh-btn:hover {
            background: #3a0066;
          }
          .bot-info {
            background: #f8f9ff;
            border: 1px solid #4B0082;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            text-align: left;
          }
          .bot-info h4 {
            color: #4B0082;
            margin-top: 0;
            margin-bottom: 10px;
          }
          .bot-info p {
            margin: 5px 0;
            color: #555;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 Givta WhatsApp Bot</h1>
          <p class="subtitle">Connect your WhatsApp account to start the bot</p>

          <div class="qr-container">
            <img src="${qrCodeDataURL}" alt="WhatsApp QR Code" class="qr-code">
          </div>

          <div class="instructions">
            <h3>📱 How to Connect:</h3>
            <ol>
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Linked Devices</li>
              <li>Tap "Link a Device"</li>
              <li>Scan the QR code above with your phone's camera</li>
              <li>Wait for connection confirmation</li>
            </ol>
          </div>

          <div class="bot-info">
            <h4>🤖 Bot Information</h4>
            <p><strong>Status:</strong> <span id="status">Checking...</span></p>
            <p><strong>Commands:</strong> Type /help after connecting</p>
            <p><strong>Support:</strong> Available 24/7 for transactions</p>
          </div>

          <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Page</button>
        </div>

        <script>
          // Auto-refresh every 30 seconds
          setTimeout(() => {
            location.reload();
          }, 30000);

          // Check connection status
          async function checkStatus() {
            try {
              const response = await fetch('/api/whatsapp/status');
              const data = await response.json();

              const statusEl = document.getElementById('status');
              if (data.connected) {
                statusEl.textContent = '🟢 Connected';
                statusEl.style.color = '#28a745';
              } else {
                statusEl.textContent = '🔴 Disconnected';
                statusEl.style.color = '#dc3545';
              }
            } catch (error) {
              document.getElementById('status').textContent = '⚪ Unknown';
            }
          }

          // Check status on load
          checkStatus();

          // Check status every 5 seconds
          setInterval(checkStatus, 5000);
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error('QR code generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code'
    });
  }
});

// Get WhatsApp bot status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    connected: WhatsAppService.isBotConnected(),
    qrAvailable: !!WhatsAppService.getQRCode()
  });
});

// Send test message (for development)
router.post('/test-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    // Format phone number for WhatsApp
    const formattedNumber = phoneNumber.startsWith('+')
      ? phoneNumber + '@s.whatsapp.net'
      : '+' + phoneNumber + '@s.whatsapp.net';

    await WhatsAppService.sendMessage(formattedNumber, { text: message });

    res.json({
      success: true,
      message: 'Test message sent successfully'
    });
  } catch (error: any) {
    console.error('Test message error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test message'
    });
  }
});

export default router;
