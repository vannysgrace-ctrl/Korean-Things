import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-5';

// The message we send internally to kick off a brand-new conversation.
// The learner never sees this — it's just to satisfy the API's rule that
// the first message in a conversation must be from the "user".
export const STARTER_MESSAGE =
  "Let's start. Greet me and begin a conversation about an everyday topic in Korean.";

const responseSchema = {
  type: 'object',
  properties: {
    reply_korean: {
      type: 'string',
      description: "The bot's next message to the learner, written in Korean.",
    },
    corrections: {
      type: 'array',
      description:
        "Corrections for mistakes in the learner's last message. Empty array if there " +
        'was nothing to correct (e.g. the learner wrote in English, or made no mistakes). ' +
        'Never invent a mistake that was not actually there.',
      items: {
        type: 'object',
        properties: {
          original: {
            type: 'string',
            description: "The learner's original Korean sentence or phrase.",
          },
          corrected: { type: 'string', description: 'The corrected version.' },
          explanation: {
            type: 'string',
            description: 'A short, simple explanation in English of what was wrong.',
          },
        },
        required: ['original', 'corrected', 'explanation'],
        additionalProperties: false,
      },
    },
    new_vocab: {
      type: 'array',
      description:
        '1-2 new Korean words naturally woven into reply_korean this turn. Empty array ' +
        'if no genuinely new word was introduced. Never repeat a word already in the ' +
        'known-words list given in the system prompt.',
      items: {
        type: 'object',
        properties: {
          korean: { type: 'string' },
          english: { type: 'string' },
          example_sentence: {
            type: 'string',
            description:
              'A Korean example sentence using the word — can be the sentence from ' +
              'reply_korean that it appeared in.',
          },
        },
        required: ['korean', 'english', 'example_sentence'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply_korean', 'corrections', 'new_vocab'],
  additionalProperties: false,
};

function buildSystemPrompt(knownWords) {
  const knownList = knownWords.length > 0 ? knownWords.join(', ') : '(none yet)';
  return `You are a friendly Korean conversation partner helping a beginner-to-intermediate
English-speaking learner practice everyday Korean over chat.

Rules:
- Always write your reply in Korean (reply_korean), at a beginner-to-intermediate level.
  Keep it short and natural — 1 to 3 sentences.
- Talk about everyday topics: ordering food, daily routine, weather, hobbies, shopping,
  weekend plans, etc. If there's no conversation history yet, open with a friendly
  greeting and pick one topic yourself.
- If the learner's last message contains Korean with a grammar or word-choice mistake,
  list it in "corrections": their original text, the corrected version, and a short,
  simple explanation in English. If they wrote in English, or made no mistakes, return
  an empty corrections array.
- Naturally weave 1-2 new, useful Korean words into your reply_korean (not a list dump).
  List each one in "new_vocab" with its English meaning and an example sentence. Only
  include a word if it's genuinely new for this learner — never more than 2 per turn.
- Words already taught to this learner (don't reintroduce these as "new", but you can
  reuse them naturally in sentences): ${knownList}`;
}

function firstText(response) {
  const block = response.content.find((b) => b.type === 'text');
  if (!block) {
    throw new Error('Claude response had no text block');
  }
  return block.text;
}

export async function getConversationTurn({ history, userMessage, knownWords }) {
  const messages = [...history, { role: 'user', content: userMessage }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(knownWords),
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: responseSchema },
    },
    messages,
  });

  return JSON.parse(firstText(response));
}
