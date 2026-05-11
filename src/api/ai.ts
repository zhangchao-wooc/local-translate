import axios from './axios';

export type AIConfig = {
    apiUrl: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
};

export type AIResult = {
    ok: boolean;
    text: string;
    json?: Record<string, unknown>;
    raw: unknown;
};

type ChatCompletionLike = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
        text?: string;
    }>;
};

type ResponsesLike = {
    output_text?: string;
    output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
    }>;
};

const extractTextFromContent = (content: unknown): string => {
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        const text = content
            .map((item) => (item && typeof item === 'object' ? (item as { text?: string }).text : ''))
            .filter(Boolean)
            .join('\n')
            .trim();
        return text;
    }
    return '';
};

const extractModelText = (data: unknown): string => {
    const response = data as ChatCompletionLike & ResponsesLike;

    if (typeof response.output_text === 'string' && response.output_text.trim()) {
        return response.output_text.trim();
    }

    if (Array.isArray(response.output)) {
        const aggregated = response.output
            .flatMap((item) => item.content || [])
            .map((item) => item.text || '')
            .filter(Boolean)
            .join('\n')
            .trim();
        if (aggregated) return aggregated;
    }

    if (Array.isArray(response.choices) && response.choices.length > 0) {
        const choice = response.choices[0];
        const messageText = extractTextFromContent(choice.message?.content);
        if (messageText) return messageText;
        if (choice.text && choice.text.trim()) return choice.text.trim();
    }

    return '';
};

const tryParseJSON = (text: string): Record<string, unknown> | undefined => {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return undefined;
    }
    return undefined;
};

export const AIApi = async (prompt: string, config?: AIConfig): Promise<AIResult> => {
    if (!config?.apiUrl) {
        throw new Error('apiUrl is required');
    }

    const payload = {
        model: config.model || 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'You are a professional translator. Always respond with valid JSON only.',
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
        response_format: { type: 'json_object' },
        temperature: config.temperature,
        max_tokens: config.max_tokens || 4000,
    };

    const response = await axios.post(config.apiUrl, payload, {
        headers: {
            Authorization: config.apiKey ? `Bearer ${config.apiKey}` : undefined,
            'Content-Type': 'application/json',
        },
    });

    const text = extractModelText(response.data);
    if (!text) {
        if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
            const json = response.data as Record<string, unknown>;
            return {
                ok: true,
                text: JSON.stringify(json),
                json,
                raw: response.data,
            };
        }
        throw new Error('Model response text is empty or unsupported structure');
    }

    return {
        ok: true,
        text,
        json: tryParseJSON(text),
        raw: response.data,
    };
};
