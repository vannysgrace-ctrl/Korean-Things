import https from 'node:https';
import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { getConversationTurn, explainSentence, generateTopicVocab, STARTER_MESSAGE } from './claude.js';
import {
  saveVocabWord,
  getAllKoreanWords,
  getAllVocab,
  getRandomVocabWord,
  getRandomDistractors,
  recordCorrectAnswer,
} from './db.js';

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

// Pending /quiz state per chat: { stage: 'typed' | 'buttons', wordId, korean,
// english, options? }. 'options' (the shuffled multiple-choice list) is only
// present once the quiz has moved to the 'buttons' stage.
const pendingQuiz = new Map();

// Chats waiting to send a topic for /wordfuel after running it with no
// topic attached.
const pendingWordfuelTopic = new Set();

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

async function congratulateAndRecord(ctx, chatId, wordId) {
  const updated = recordCorrectAnswer(wordId);
  pendingQuiz.delete(chatId);

  let message = `🎉 Correct! "${updated.korean}" means "${updated.english}".`;
  if (updated.status === 'Learnt' && updated.correct_count === 3) {
    message += '\n\n🏆 Nice work — this word is now marked as "Learnt"!';
  }
  await ctx.reply(message);
}

async function handleQuizTypedAnswer(ctx, chatId, quiz, text) {
  if (text.trim() === quiz.korean.trim()) {
    await congratulateAndRecord(ctx, chatId, quiz.wordId);
    return;
  }

  // Wrong on the first try — don't reveal the answer, offer multiple choice.
  const distractors = getRandomDistractors({ excludeId: quiz.wordId, limit: 3 });
  const options = shuffle([
    { korean: quiz.korean, english: quiz.english },
    ...distractors.map((d) => ({ korean: d.korean, english: d.english })),
  ]);

  pendingQuiz.set(chatId, { ...quiz, stage: 'buttons', options });

  const buttons = options.map((opt, i) => Markup.button.callback(opt.korean, `quiz_choice:${i}`));
  await ctx.reply(
    "Not quite — here's a hint. Pick the right one:",
    Markup.inlineKeyboard(buttons, { columns: 2 })
  );
}

async function runWordfuel(ctx, topic) {
  await ctx.sendChatAction('typing');

  let words;
  try {
    words = await generateTopicVocab({ topic, knownWords: getAllKoreanWords() });
  } catch (err) {
    console.error('Claude API error (wordfuel):', err);
    await ctx.reply('Sorry, I had trouble reaching Claude just now. Please try /wordfuel again.');
    return;
  }

  const savedWords = words.filter((v) =>
    saveVocabWord({
      korean: v.korean,
      english: v.english,
      example_sentence: v.example_sentence,
    })
  );

  if (savedWords.length === 0) {
    await ctx.reply(
      `Hmm, I couldn't come up with any new words for "${topic}" that you don't already know. Try another topic!`
    );
    return;
  }

  let outgoing = `📚 New word${savedWords.length > 1 ? 's' : ''} saved to your vocab list (topic: ${topic}):`;
  for (const v of savedWords) {
    outgoing += `\n• ${v.korean} — ${v.english}\n   e.g. ${v.example_sentence}`;
  }
  await ctx.reply(outgoing);
}

bot.start(async (ctx) => {
  conversations.delete(ctx.chat.id);
  await sendConversationTurn(ctx, ctx.chat.id, STARTER_MESSAGE);
});

bot.command('myvocab', async (ctx) => {
  const allVocab = getAllVocab();
  const learnt = allVocab.filter((w) => w.status === 'Learnt');
  const learning = allVocab.filter((w) => w.status === 'Learning');
  const formatList = (words) => words.map((w) => `${w.korean} — ${w.english}`).join('\n');
  const emptyNote = 'Nothing here yet — keep chatting or try /wordfuel!';

  const message =
    `📗 Learnt:\n${learnt.length > 0 ? formatList(learnt) : emptyNote}\n\n` +
    `📖 Learning:\n${learning.length > 0 ? formatList(learning) : emptyNote}`;

  await ctx.reply(message);
});

bot.command('quiz', async (ctx) => {
  const chatId = ctx.chat.id;
  const word = getRandomVocabWord();

  if (!word) {
    await ctx.reply(
      "You don't have any saved vocab yet — chat with me a bit or try /wordfuel <topic> to add some!"
    );
    return;
  }

  pendingQuiz.set(chatId, {
    stage: 'typed',
    wordId: word.id,
    korean: word.korean,
    english: word.english,
  });

  await ctx.reply(`❓ How do you say "${word.english}" in Korean?`);
});

bot.command('explain', async (ctx) => {
  const chatId = ctx.chat.id;
  const history = conversations.get(chatId) ?? [];
  const lastBotMessage = [...history].reverse().find((m) => m.role === 'assistant');

  if (!lastBotMessage) {
    await ctx.reply(
      "I haven't said anything in Korean yet — send /start or chat with me a bit first!"
    );
    return;
  }

  await ctx.sendChatAction('typing');
  try {
    const explanation = await explainSentence({ sentence: lastBotMessage.content });
    await ctx.reply(explanation);
  } catch (err) {
    console.error('Claude API error (explain):', err);
    await ctx.reply('Sorry, I had trouble reaching Claude just now. Please try /explain again.');
  }
});

bot.command('wordfuel', async (ctx) => {
  const topic = ctx.payload.trim();

  if (!topic) {
    pendingWordfuelTopic.add(ctx.chat.id);
    await ctx.reply('Sure — what topic would you like new words for? (e.g. "travel")');
    return;
  }

  await runWordfuel(ctx, topic);
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data || !data.startsWith('quiz_choice:')) {
    await ctx.answerCbQuery();
    return;
  }

  const chatId = ctx.chat.id;
  const quiz = pendingQuiz.get(chatId);
  if (!quiz || quiz.stage !== 'buttons') {
    await ctx.answerCbQuery('This quiz has expired — try /quiz again.');
    return;
  }

  const selected = quiz.options[Number(data.split(':')[1])];
  await ctx.answerCbQuery();
  if (!selected) {
    return;
  }

  pendingQuiz.delete(chatId);

  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // Message may already be edited or gone — safe to ignore.
  }

  if (selected.korean === quiz.korean) {
    // congratulateAndRecord also deletes pendingQuiz — harmless, already gone.
    await congratulateAndRecord(ctx, chatId, quiz.wordId);
  } else {
    await ctx.reply(`❌ Not quite. The correct answer was "${quiz.korean}" (${quiz.english}).`);
  }
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;

  const quiz = pendingQuiz.get(chatId);
  if (quiz && quiz.stage === 'typed') {
    await handleQuizTypedAnswer(ctx, chatId, quiz, text);
    return;
  }

  if (pendingWordfuelTopic.has(chatId)) {
    pendingWordfuelTopic.delete(chatId);
    await runWordfuel(ctx, text.trim());
    return;
  }

  await sendConversationTurn(ctx, chatId, text);
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
