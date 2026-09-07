import https from 'node:https';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    'Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and fill in your bot token.'
  );
  process.exit(1);
}

// Force IPv4 for the Telegram connection — reduces ECONNRESET errors on
// unstable connections like a phone hotspot.
const bot = new Telegraf(token, {
  telegram: {
    agent: new https.Agent({ family: 4, keepAlive: true }),
  },
});

bot.start((ctx) => {
  ctx.reply(
    '안녕하세요! 👋 (Hello!)\n\n' +
      "I'm your Korean conversation practice bot. This is just the basic " +
      "connection test — conversation practice, corrections, and vocab " +
      'saving are coming in the next stage.'
  );
});

bot.catch((err, ctx) => {
  console.error(`Bot error while handling update ${ctx.updateType}:`, err);
});

// A dropped connection during polling can surface as an unhandled promise
// rejection rather than something bot.catch sees. Log it instead of letting
// the process crash — Telegraf's own polling loop will keep retrying.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (bot process is still running):', reason);
});

async function launchWithRetry(maxAttempts = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // bot.launch() resolves once polling stops, so don't await it here —
      // just let it start, then confirm via bot.telegram.getMe().
      bot.launch();
      const me = await bot.telegram.getMe();
      console.log('✅ Bot connected to Telegram and is now polling for messages.');
      console.log(`   Bot username: @${me.username}`);
      console.log('   Send it /start in Telegram to test.');
      return;
    } catch (err) {
      console.error(`Launch attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt === maxAttempts) {
        console.error(
          'All launch attempts failed. Check your internet connection and TELEGRAM_BOT_TOKEN, then try again.'
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

launchWithRetry();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
