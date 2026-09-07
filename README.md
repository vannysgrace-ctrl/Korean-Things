# Korean Vocab Telegram Bot

A Telegram bot that helps you practise Korean vocabulary through everyday
conversation. Chats with you in Korean, corrects your mistakes, and saves
new words it teaches you so you can review and quiz yourself later.

This project is being built in stages. **Stage 1 (this stage): basic bot
connection only.** It connects to Telegram and replies to `/start`. No
conversation, corrections, or vocab saving yet — that's Stage 2.

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

---

## Setup steps

1. **Get the code onto your Mac.** In Terminal:
   ```
   git clone https://github.com/vannysgrace-ctrl/korean-things.git
   cd korean-things
   git checkout claude/korean-vocab-telegram-bot-2nx9oq
   ```

2. **Install the project's dependencies.** Still in Terminal, in that same
   folder:
   ```
   npm install
   ```
   This downloads the bits of code the project needs. It only takes a
   minute.

3. **Create your `.env` file.** This is where your secret bot token lives —
   it's never uploaded to GitHub.
   ```
   cp .env.example .env
   ```
   Then open the new `.env` file in any text editor and replace
   `your_telegram_bot_token_here` with the real token BotFather gave you.
   Leave `ANTHROPIC_API_KEY` as-is for now — it's not needed until Stage 2.

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

5. **Test it in Telegram.** Search for your bot by the username BotFather
   gave it, open a chat, and send `/start`. It should reply with a Korean
   greeting.

To stop the bot, go back to Terminal and press `Ctrl + C`.

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
- ⬜ **Stage 2** — Bot chats in Korean, corrects mistakes, saves new vocab
  to a local database automatically.
- ⬜ **Stage 3** — `/myvocab` (review saved words) and `/quiz` (test
  yourself) commands.
- ⬜ **Stage 4** — `/newtopic` command and more conversation variety.

We pause after each stage so you can test it before moving to the next one.
