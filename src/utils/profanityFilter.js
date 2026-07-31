/**
 * Smart Profanity Filter with Korean Jamo Decomposition and Obfuscation Normalization
 */

// Korean Jamo Initial Consonant Array
const CHOSUNG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * Extract initial consonants from a Hangul string (e.g. "시발" -> "ㅅㅂ")
 */
export const extractChosung = (text) => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i) - 0xAC00;
        if (code >= 0 && code <= 11172) {
            const chosungIndex = Math.floor(code / 588);
            result += CHOSUNG_LIST[chosungIndex];
        } else {
            result += text[i];
        }
    }
    return result;
};

// Base profanity list (words & initial consonants)
const PROFANITY_PATTERNS = [
    // Standard swear words
    /시\s*발/g, /씨\s*발/g, /씨\s*바/g, /시\s*바/g, /시\s*벌/g, /씨\s*벌/g,
    /병\s*신/g, /개\s*새\s*끼/g, /개\s*새/g, /지\s*랄/g, /존\s*나/g, /좆/g,
    /엠\s*창/g, /느\s*금\s*마/g, /닥\s*쳐/g, /미\s*친\s*놈/g, /미\s*친\s*년/g,
    /바\s*보\s*멍\s*청\s*이/g, /새\s*끼/g,

    // Initial consonant patterns (초성 패턴)
    /ㅅ\s*ㅂ/g, /ㅆ\s*ㅂ/g, /ㅂ\s*ㅅ/g, /ㄱ\s*ㅅ\s*ㄲ/g, /ㅈ\s*ㄹ/g, /ㅈ\s*ㄴ/g,
    /ㄷ\s*ㅊ/g, /ㄴ\s*ㄱ\s*ㅁ/g, /ㅁ\s*ㅊ/g
];

/**
 * Normalizes string by stripping special chars, symbols, and numbers used for obfuscation.
 * E.g. "시1발" -> "시발", "ㅅ~ㅂ" -> "ㅅㅂ", "씨...발" -> "씨발"
 */
export const normalizeText = (text) => {
    return text.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`\s]/g, '');
};

/**
 * Main profanity filter function
 * Returns { maskedText: string, hasProfanity: boolean }
 */
export const filterProfanity = (text) => {
    if (!text || typeof text !== 'string') {
        return { maskedText: '', hasProfanity: false };
    }

    let hasProfanity = false;
    let maskedText = text;

    // 1. Direct Pattern Match on Original Text
    for (const pattern of PROFANITY_PATTERNS) {
        if (pattern.test(maskedText)) {
            hasProfanity = true;
            maskedText = maskedText.replace(pattern, '***');
        }
    }

    // 2. Obfuscation check (Remove numbers & special symbols, e.g. "시1발", "ㅅ!ㅂ")
    const normalized = normalizeText(text);
    const chosung = extractChosung(normalized);

    const obfuscatedKeywords = [
        '시발', '씨발', '씨바', '시바', '시벌', '씨벌', '병신', '개새끼', '개새', '지랄',
        '존나', '좆', '엠창', '느금마', '닥쳐', '미친놈', '미친년', '새끼',
        'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㄱㅅㄲ', 'ㅈㄹ', 'ㅈㄴ', 'ㄷㅊ'
    ];

    for (const kw of obfuscatedKeywords) {
        if (normalized.includes(kw) || chosung.includes(kw)) {
            hasProfanity = true;
            // If the normalized version matches but direct match didn't catch full original text,
            // replace offending original words or whole message if heavily obfuscated
            if (maskedText === text) {
                // Try replacing words containing the profanity parts
                const words = text.split(/\s+/);
                maskedText = words.map(w => {
                    const normW = normalizeText(w);
                    const chosungW = extractChosung(normW);
                    if (obfuscatedKeywords.some(k => normW.includes(k) || chosungW.includes(k))) {
                        return '***';
                    }
                    return w;
                }).join(' ');
            }
        }
    }

    return { maskedText, hasProfanity };
};

export default filterProfanity;
