import dotenv from 'dotenv';
dotenv.config();

// AI API keys
const ANTHROPIC_API_KEY: string | undefined = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const COHERE_API_KEY: string | undefined = process.env.COHERE_API_KEY;
const GEMINI_API_KEY: string | undefined = process.env.GEMINI_API_KEY;
const GROQ_API_KEY: string | undefined = process.env.GROQ_API_KEY;
const TOGETHER_API_KEY: string | undefined = process.env.TOGETHER_API_KEY;
const MISTRAL_API_KEY: string | undefined = process.env.MISTRAL_API_KEY;
const HUGGINGFACE_API_KEY: string | undefined = process.env.HUGGINGFACE_API_KEY;

interface ProviderApiKeys {
  [key: string]: string | undefined;
}

const PROVIDER_API_KEYS: ProviderApiKeys = {
  COHERE_API_KEY,
  GEMINI_API_KEY,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GROQ_API_KEY,
  TOGETHER_API_KEY,
  MISTRAL_API_KEY,
  HUGGINGFACE_API_KEY
};

export {
  PROVIDER_API_KEYS,
};