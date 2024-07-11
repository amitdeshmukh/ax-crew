import dotenv from 'dotenv';
dotenv.config();

// AI API keys
const ANTHROPIC_API_KEY: string | undefined = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const COHERE_API_KEY: string | undefined = process.env.COHERE_API_KEY;
const GEMINI_API_KEY: string | undefined = process.env.GEMINI_API_KEY;

interface ProviderApiKeys {
  [key: string]: string | undefined;
}

const PROVIDER_API_KEYS: ProviderApiKeys = {
  COHERE_API_KEY,
  GEMINI_API_KEY,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
};

export {
  PROVIDER_API_KEYS,
};