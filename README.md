# Korean Vocab Telegram Bot

A Telegram bot that helps you practise Korean vocabulary through everyday
conversation. Chats with you in Korean, corrects your mistakes, and saves
new words it teaches you so you can review and quiz yourself later.

This project is being built in stages. **Stage 2 (this stage): real
conversation practice.** The bot now chats with you in Korean using Claude,
gently corrects mistakes, and automatically saves any new vocab it teaches
you to a local database. `/myvocab`, `/quiz`, and `/newtopic` commands are
not built yet — that's Stages 3 and 4.

---

## Before you start — things you need

1. **Node.js installed on your Mac.** If you're not sure, open Terminal and
   type `node -v`. If you see a version number (like `v20.11.0`), you're
   good. If you see "command not found", install Node from
   https://nodejs.org (choose the LTS version) first.
2. **A Telegram bot token.**
   - Open Telegram, search for **@BotFather**, and start a chat with it.
   - Send `/newbot` and follow the prompts (it'll ask for a name and a
     username for your bot).
   - BotFather will give you a long token that looks like
     `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`. Copy it — you'll need it below.
3. **An Anthropic API key** (new in this stage — this is what lets the bot
   actually talk to you in Korean).
   - Go to https://console.anthropic.com/ and sign up or log in.
   - You'll need to add billing details — this uses a pay-as-you-go API,
     separate from any Claude.ai subscription you might have.
   - Go to "API Keys" and create a new key. Copy it — you'll need it below.
   - **Cost note:** each message you send the bot costs a small fraction of
     a cent. Casual daily practice should cost well under $1/month, but it's
     worth keeping an eye on your usage at console.anthropic.com if you chat
     a lot.

---

## Setup steps

1. **Get the code onto your Mac.** In Terminal:
   ```
   git clone https://github.com/vannysgrace-ctrl/korean-things.git
   cd korean-things
   git checkout claude/korean-vocab-telegram-bot-2nx9oq
   git pull
   ```
   (If you already had the repo from Stage 1, just run `git pull` from
   inside the `korean-things` folder instead of cloning again.)

2. **Install the project's dependencies.** Still in Terminal, in that same
   folder:
   ```
   npm install
   ```
   This downloads the bits of code the project needs. It only takes a
   minute. (This stage adds a database library and the Anthropic library,
   so it's worth re-running this even if you did it for Stage 1.)

3. **Set up your `.env` file.** This is where your secret keys live — it's
   never uploaded to GitHub.
   - If you don't already have one: `cp .env.example .env`
   - Open `.env` in any text editor and fill in **both**:
     - `TELEGRAM_BOT_TOKEN` — from BotFather (Stage 1)
     - `ANTHROPIC_API_KEY` — from console.anthropic.com (see above)

4. **Start the bot:**
   ```
   npm start
   ```
   You should see something like:
   ```
   ✅ Bot connected to Telegram and is now polling for messages.
      Bot username: @your_bot_username
      Send it /start in Telegram to test.
   ```

To stop the bot, go back to Terminal and press `Ctrl + C`.

---

## What to test in Telegram

1. Send `/start`. Within a few seconds, the bot should greet you in Korean
   and bring up an everyday topic (food, weather, daily routine, etc.) —
   not the old "connection test" message from Stage 1.
2. Reply in Korean — even a simple, possibly imperfect sentence. Check that:
   - The bot replies naturally in Korean, continuing the topic.
   - If you made a grammar or word-choice mistake, it shows up under a
     "📝 Corrections" section (your version → the corrected version, with a
     short explanation).
   - If it taught you a new word, it shows up under a "📚 New word(s) saved"
     section.
3. Send a few more messages back and forth — the bot should remember what
   you've already talked about and not repeatedly re-teach the same word.
4. Try replying in English once — you should get a Korean reply back with
   no corrections section (since there was no Korean to correct).

If something goes wrong (e.g. "Sorry, I had trouble reaching Claude"),
double-check your `ANTHROPIC_API_KEY` in `.env`, and check the Terminal
window running the bot for a more detailed error message.

**Note:** conversation memory currently resets whenever the bot restarts
(including automatically, since we run it with `node --watch`, which
restarts on every code change). Saved vocab words are not affected by
this — they live in a database file (`vocab.db`) that persists between
restarts.

---

## ⚠️ If the bot goes silent (very important)

Telegram bots only allow **one running copy at a time**. If you accidentally
start a second copy (e.g. you ran `npm start` in two Terminal windows, or a
previous run didn't fully stop), the bot will go completely silent —
**no reply, no error message, nothing.** It just won't respond.

If your bot stops responding, before doing anything else:

1. Open Terminal and run:
   ```
   ps aux | grep node
   ```
2. Look for lines mentioning `node` and this project. If you see more than
   one, that's your problem — you have duplicate copies running.
3. Kill the extra ones. Each line starts with a number (the process ID).
   Run:
   ```
   kill <the number>
   ```
   for each duplicate, then start the bot fresh with `npm start`.

---

## Project stages

- ✅ **Stage 1** — Basic bot connects to Telegram, responds to `/start`.
- ✅ **Stage 2** — Bot chats in Korean, corrects mistakes, saves new vocab
  to a local database automatically.
- ⬜ **Stage 3** — `/myvocab` (review saved words) and `/quiz` (test
  yourself) commands.
- ⬜ **Stage 4** — `/newtopic` command and more conversation variety.

We pause after each stage so you can test it before moving to the next one.
