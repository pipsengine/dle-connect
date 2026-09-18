import {
  celebrationEmployeeKey,
  prettyPersonName,
  type CelebrationMoment,
} from '@/lib/celebration-moments';

export type CelebrationFlyerMessage = {
  headline: string;
  colleagueMessage: string;
  honoreeMessage: string;
  ctaColleague: string;
  ctaHonoree: string;
};

export type CelebrationFlyerCopy = {
  source: 'ai' | 'system';
  byKey: Record<string, CelebrationFlyerMessage>;
};

const compact = (value: unknown) => String(value || '').trim();
const AI_TIMEOUT_MS = Math.max(4_000, Number(process.env.DLE_CELEBRATION_AI_TIMEOUT_MS || 12_000));
const AI_MODEL = compact(process.env.DLE_CELEBRATION_AI_MODEL) || 'gemini-2.0-flash';

const BIRTHDAY_COLLEAGUE = [
  (name: string) =>
    `Please join us in celebrating ${name}'s birthday. May this new year of life bring joy, good health and continued excellence.`,
  (name: string) =>
    `Today the Dorman Long family celebrates ${name}. We wish a bright birthday and a year filled with achievement and wellbeing.`,
  (name: string) =>
    `It is a pleasure to mark ${name}'s birthday with the Dorman Long family. Warm wishes for a memorable day and a fulfilling year ahead.`,
];

const BIRTHDAY_HONOREE = [
  (name: string) =>
    `Happy birthday, ${name}. The Dorman Long family is proud to celebrate you today and wishes you joy, good health and continued success.`,
  (name: string) =>
    `${name}, the Dorman Long family celebrates you today. May your birthday be filled with warmth, gratitude and every blessing in the year ahead.`,
  (name: string) =>
    `Wishing you a wonderful birthday, ${name}. Thank you for the professionalism and energy you bring to Dorman Long Engineering.`,
];

const ANNIVERSARY_COLLEAGUE = [
  (name: string, years: number) =>
    `Today we honour ${name} for ${years} year${years === 1 ? '' : 's'} of dedicated service. Thank you for the craftsmanship, reliability and teamwork that strengthen Dorman Long Engineering.`,
  (name: string, years: number) =>
    `Please join us in celebrating ${name}'s ${years}-year work anniversary. We are proud of this journey of commitment with Dorman Long.`,
  (name: string, years: number) =>
    `${name} marks ${years} year${years === 1 ? '' : 's'} with Dorman Long Engineering today. We celebrate the contribution, loyalty and excellence behind this milestone.`,
];

const ANNIVERSARY_HONOREE = [
  (name: string, years: number) =>
    `Thank you, ${name}, for ${years} year${years === 1 ? '' : 's'} of dedicated service. Dorman Long Engineering is proud to celebrate your journey with us.`,
  (name: string, years: number) =>
    `${name}, congratulations on ${years} year${years === 1 ? '' : 's'} with Dorman Long. Your commitment continues to make a lasting difference.`,
  (name: string, years: number) =>
    `Happy work anniversary, ${name}. ${years} year${years === 1 ? '' : 's'} of professionalism and teamwork deserve our warmest congratulations.`,
];

const pick = <T,>(items: T[], seed: string) =>
  items[[...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % items.length];

const sanitizeMessage = (value: unknown, fallback: string) => {
  const cleaned = compact(value)
    .replace(/[`*_#]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '');
  if (cleaned.length < 40 || cleaned.length > 420) return fallback;
  if (/ignore (previous|all) instructions|you are an? ai/i.test(cleaned)) return fallback;
  return cleaned;
};

const sanitizeHeadline = (value: unknown, fallback: string) => {
  const cleaned = compact(value).replace(/[`*_#]/g, '').replace(/\s+/g, ' ');
  if (cleaned.length < 8 || cleaned.length > 90) return fallback;
  return cleaned;
};

export const fallbackMessageFor = (moment: CelebrationMoment): CelebrationFlyerMessage => {
  const name = prettyPersonName(moment.firstName || moment.fullName) || 'our colleague';
  const years = Math.max(1, Math.round(moment.years || 1));
  const seed = `${moment.kind}:${moment.employeeCode}:${moment.date}`;
  if (moment.kind === 'birthday') {
    return {
      headline: `Happy Birthday, ${name}`,
      colleagueMessage: pick(BIRTHDAY_COLLEAGUE, seed)(name),
      honoreeMessage: pick(BIRTHDAY_HONOREE, `${seed}:self`)(name),
      ctaColleague: 'Send a birthday wish',
      ctaHonoree: 'Open your celebration wall',
    };
  }
  return {
    headline: `${years} Year${years === 1 ? '' : 's'} of Service`,
    colleagueMessage: pick(ANNIVERSARY_COLLEAGUE, seed)(name, years),
    honoreeMessage: pick(ANNIVERSARY_HONOREE, `${seed}:self`)(name, years),
    ctaColleague: 'Send an anniversary wish',
    ctaHonoree: 'Open your celebration wall',
  };
};

export const buildFallbackCelebrationCopy = (moments: CelebrationMoment[]): CelebrationFlyerCopy => ({
  source: 'system',
  byKey: Object.fromEntries(moments.map((moment) => [celebrationEmployeeKey(moment), fallbackMessageFor(moment)])),
});

export const copyForMoment = (copy: CelebrationFlyerCopy | undefined, moment: CelebrationMoment) =>
  copy?.byKey[celebrationEmployeeKey(moment)] || fallbackMessageFor(moment);

const geminiApiKey = () =>
  compact(process.env.GEMINI_API_KEY) || compact(process.env.GOOGLE_API_KEY) || compact(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const withTimeout = async <T,>(promise: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Celebration AI timed out.')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

type AiHonoree = {
  employeeCode?: string;
  kind?: string;
  headline?: string;
  colleagueMessage?: string;
  honoreeMessage?: string;
};

const parseAiHonorees = (raw: string): AiHonoree[] => {
  const jsonText = compact(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  if (!jsonText) return [];
  const parsed = JSON.parse(jsonText) as { honorees?: AiHonoree[] } | AiHonoree[];
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed.honorees) ? parsed.honorees : [];
};

const mergeAiCopy = (moments: CelebrationMoment[], honorees: AiHonoree[]): CelebrationFlyerCopy => {
  const byCode = new Map(
    honorees.map((item) => [
      `${compact(item.kind).toLowerCase()}:${compact(item.employeeCode).toUpperCase()}`,
      item,
    ]),
  );
  const byKey: Record<string, CelebrationFlyerMessage> = {};
  let usedAi = false;
  for (const moment of moments) {
    const fallback = fallbackMessageFor(moment);
    const ai = byCode.get(`${moment.kind}:${compact(moment.employeeCode).toUpperCase()}`);
    const colleagueMessage = sanitizeMessage(ai?.colleagueMessage, fallback.colleagueMessage);
    const honoreeMessage = sanitizeMessage(ai?.honoreeMessage, fallback.honoreeMessage);
    const headline = sanitizeHeadline(ai?.headline, fallback.headline);
    if (ai && (colleagueMessage !== fallback.colleagueMessage || honoreeMessage !== fallback.honoreeMessage || headline !== fallback.headline)) {
      usedAi = true;
    }
    byKey[celebrationEmployeeKey(moment)] = {
      ...fallback,
      headline,
      colleagueMessage,
      honoreeMessage,
    };
  }
  return { source: usedAi ? 'ai' : 'system', byKey };
};

export const generateCelebrationFlyerCopy = async (moments: CelebrationMoment[]): Promise<CelebrationFlyerCopy> => {
  const fallback = buildFallbackCelebrationCopy(moments);
  if (!moments.length) return fallback;
  const apiKey = geminiApiKey();
  if (!apiKey) return fallback;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const payload = moments.map((moment) => ({
      employeeCode: moment.employeeCode,
      kind: moment.kind,
      firstName: moment.firstName,
      fullName: moment.fullName,
      department: moment.department,
      years: moment.kind === 'anniversary' ? moment.years || 1 : undefined,
    }));
    const prompt = `You write professional internal celebration flyers for Dorman Long Engineering (Nigeria; engineering, fabrication and construction).
Return JSON only in this shape: {"honorees":[{"employeeCode":"","kind":"birthday|anniversary","headline":"","colleagueMessage":"","honoreeMessage":""}]}
Rules:
- One object per honoree. Keep employeeCode and kind exactly as given.
- Warm, formal, sincere. No slang, no emojis, no exclamation stacking, no hashtags.
- colleagueMessage: 1-2 sentences for colleagues. Mention the first name. For anniversaries include the years of service.
- honoreeMessage: 1-2 sentences in second person for the person being celebrated.
- headline: short flyer title, title case.
- Do not invent personal facts, nicknames, family details, religion, or job achievements not provided.
- Do not include URLs, markdown, or a signature.

Honorees:
${JSON.stringify(payload)}`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.85,
          responseMimeType: 'application/json',
        },
      }),
      AI_TIMEOUT_MS,
    );
    const merged = mergeAiCopy(moments, parseAiHonorees(compact(response.text)));
    console.info('[celebration-email] Generated flyer copy.', { source: merged.source, honorees: moments.length, model: AI_MODEL });
    return merged;
  } catch (error) {
    console.warn('[celebration-email] AI flyer copy unavailable; using system templates.', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return fallback;
  }
};
