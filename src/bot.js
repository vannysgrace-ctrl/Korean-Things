import https from 'node:https';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { getConversationTurn, STARTER_MESSAGE } from './claude.js';
import { saveVocabWord, getAllKoreanWords } from './db.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    'Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and fill in your bot token.'
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    'Missing ANTHROPIC_API_KEY. Copy .env.example to .env and fill in your Anthropic API key.'
  );
  process.exit(1);
}

// Conversation history per Telegram chat, kept in memory only — it resets
// whenever the bot restarts (e.g. on every code save, since we run it with
// `node --watch`). Vocab is saved to the database, so that part persists.
const conversations = new Map();

// Force IPv4 for the Telegram connection — reduces ECONNRESET errors on
// unstable connections like a phone hotspot.
const bot = new Telegraf(token, {
  telegram: {
    agent: new https.Agent({ family: 4, keepAlive: true }),
  },
});

async function sendConversationTurn(ctx, chatId, userMessage) {
  const history = conversations.get(chatId) ?? [];

  await ctx.sendChatAction('typing');

  let data;
  try {
    data = await getConversationTurn({
      history,
      userMessage,
      knownWords: getAllKoreanWords(),
    });
  } catch (err) {
    console.error('Claude API error:', err);
    await ctx.reply(
      'Sorry, I had trouble reaching Claude just now. Please try sending that again.'
    );
    return;
  }

  conversations.set(chatId, [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: data.reply_korean },
  ]);

  let outgoing = data.reply_korean;

  if (data.corrections.length > 0) {
    outgoing += '\n\n📝 Corrections:';
    for (const c of data.corrections) {
      outgoing += `\n• ${c.original} → ${c.corrected}\n   (${c.explanation})`;
    }
  }

  // Only mention words that were actually newly saved — guards against the
  // model occasionally re-flagging an already-known word as "new".
  const savedWords = data.new_vocab.filter((v) =>
    saveVocabWord({
      korean: v.korean,
      english: v.english,
      example_sentence: v.example_sentence,
    })
  );
  if (savedWords.length > 0) {
    outgoing += `\n\n📚 New word${savedWords.length > 1 ? 's' : ''} saved to your vocab list:`;
    for (const v of savedWords) {
      outgoing += `\n• ${v.korean} — ${v.english}\n   e.g. ${v.example_sentence}`;
    }
  }

  await ctx.reply(outgoing);
}

bot.start(async (ctx) => {
  conversations.delete(ctx.chat.id);
  await sendConversationTurn(ctx, ctx.chat.id, STARTER_MESSAGE);
});

bot.on('text', async (ctx) => {
  await sendConversationTurn(ctx, ctx.chat.id, ctx.message.text);
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
