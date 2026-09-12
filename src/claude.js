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

const explainBreakdownItemSchema = {
  type: 'object',
  properties: {
    phrase: {
      type: 'string',
      description: 'A word, particle, or verb ending from the sentence, in the order it appears.',
    },
    meaning: {
      type: 'string',
      description:
        'Its meaning. For a particle or verb ending, give a short grammar note instead ' +
        '(e.g. "해도 될까요" -> "polite way to ask permission").',
    },
  },
  required: ['phrase', 'meaning'],
  additionalProperties: false,
};

const mistakeSchema = {
  description:
    'Null if the sentence is grammatically fine and natural. Otherwise, an explanation ' +
    'of the mistake and the corrected sentence.',
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      properties: {
        why_wrong: {
          type: 'string',
          description: 'A short, simple English explanation of what was wrong.',
        },
        corrected: { type: 'string', description: 'The corrected Korean sentence.' },
      },
      required: ['why_wrong', 'corrected'],
      additionalProperties: false,
    },
  ],
};

function buildExplainSchema(checkForMistakes) {
  const properties = {
    translation: {
      type: 'string',
      description: 'The plain English meaning of the whole sentence.',
    },
    breakdown: {
      type: 'array',
      description: 'Ordered word-by-word or particle-by-particle breakdown of the sentence.',
      items: explainBreakdownItemSchema,
    },
  };
  const required = ['translation', 'breakdown'];

  if (checkForMistakes) {
    properties.mistake = mistakeSchema;
    required.push('mistake');
  }

  return { type: 'object', properties, required, additionalProperties: false };
}

// checkForMistakes should only be true for a sentence the learner wrote
// themselves — the bot's own messages are assumed correct, so we don't
// even ask the model to check them (saves a wasted check).
export async function explainSentence({ sentence, checkForMistakes = false }) {
  const system = checkForMistakes
    ? `You help a beginner-to-intermediate English-speaking Korean learner understand a Korean sentence they wrote themselves.
Give the plain English translation, then an ordered word-by-word or particle-by-particle breakdown (for a particle or verb ending, give a short grammar note instead of a literal meaning).
Also check whether the sentence has a grammar or word-choice mistake. If it reads naturally, set "mistake" to null. If there's a mistake, explain what's wrong in short, simple English and give the corrected sentence.`
    : `You help a beginner-to-intermediate English-speaking Korean learner understand a Korean sentence.
Give the plain English translation, then an ordered word-by-word or particle-by-particle breakdown (for a particle or verb ending, give a short grammar note instead of a literal meaning). Keep it short and simple.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: buildExplainSchema(checkForMistakes) },
    },
    messages: [{ role: 'user', content: sentence }],
  });

  const data = JSON.parse(firstText(response));
  if (!checkForMistakes) {
    data.mistake = null;
  }
  return data;
}

const topicVocabSchema = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      description:
        'New Korean words or short phrases related to the given topic. Always return ' +
        'exactly 5 items — no fewer, no more.',
      items: {
        type: 'object',
        properties: {
          korean: { type: 'string' },
          english: { type: 'string' },
          example_sentence: {
            type: 'string',
            description: 'A natural Korean example sentence using the word.',
          },
        },
        required: ['korean', 'english', 'example_sentence'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
};

export async function generateTopicVocab({ topic, knownWords }) {
  const knownList = knownWords.length > 0 ? knownWords.join(', ') : '(none yet)';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You help a beginner-to-intermediate English-speaking Korean learner build vocabulary on a specific topic.
Given a topic, produce exactly 5 useful, everyday Korean words or short phrases related to it, each with an English meaning and a natural Korean example sentence.
Do not include any word already in this learner's known-words list: ${knownList}`,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: topicVocabSchema },
    },
    messages: [{ role: 'user', content: `Topic: ${topic}` }],
  });

  const words = JSON.parse(firstText(response)).words;

  // The schema can no longer enforce "exactly 5" (the API only supports
  // minItems/maxItems of 0 or 1), so trim defensively if the model returns
  // a slightly different count rather than breaking /wordfuel over it.
  return words.slice(0, 5);
}
