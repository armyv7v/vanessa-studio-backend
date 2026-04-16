// netlify/functions/horarios.js

const { getStore } = require('@netlify/blobs');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_HORARIOS = {
    horarioAtencion: {
        lunes: ['09:00', '18:00'],
        martes: ['09:00', '18:00'],
        miércoles: ['09:00', '18:00'],
        jueves: ['09:00', '18:00'],
        viernes: ['09:00', '18:00'],
        sábado: ['10:00', '14:00'],
        domingo: [],
    },
    disabledDays: [],
    disabledDates: [],
    blackoutRanges: [],
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const LOCAL_DATA_FILE = path.join(process.cwd(), 'data', 'horarios.json');
const BLOB_KEY = 'horarios/config.json';

function isValidTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function sanitizeHorarioAtencion(input) {
    const source = input && typeof input === 'object' ? input : {};
    const result = {};

    for (const dia of Object.keys(DEFAULT_HORARIOS.horarioAtencion)) {
        const rango = Array.isArray(source[dia]) ? source[dia] : DEFAULT_HORARIOS.horarioAtencion[dia];

        if (rango.length === 0) {
            result[dia] = [];
            continue;
        }

        if (rango.length !== 2 || !isValidTime(rango[0]) || !isValidTime(rango[1]) || rango[0] >= rango[1]) {
            throw new Error(`Horario inválido para ${dia}`);
        }

        result[dia] = [rango[0], rango[1]];
    }

    return result;
}

function sanitizeDisabledDays(input) {
    const allowed = new Set([
        'SAT1', 'SAT2', 'SAT3', 'SAT4', 'SAT5',
        'SUN1', 'SUN2', 'SUN3', 'SUN4', 'SUN5',
    ]);

    if (!Array.isArray(input)) {
        return [];
    }

    return Array.from(new Set(input.filter((value) => typeof value === 'string' && allowed.has(value)))).sort();
}

function isValidIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeDisabledDates(input) {
    if (!Array.isArray(input)) {
        return [];
    }

    return Array.from(new Set(input.filter((value) => isValidIsoDate(value)))).sort();
}

function sanitizeBlackoutRanges(input) {
    if (!Array.isArray(input)) {
        return [];
    }

    return input
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const start = typeof item.start === 'string' ? item.start : '';
            const end = typeof item.end === 'string' ? item.end : '';
            const label = typeof item.label === 'string' ? item.label.trim() : '';

            if (!isValidIsoDate(start) || !isValidIsoDate(end) || start > end) {
                throw new Error('Rango de bloqueo inválido');
            }

            return { start, end, label };
        })
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function sanitizeConfig(payload) {
    return {
        horarioAtencion: sanitizeHorarioAtencion(payload?.horarioAtencion),
        disabledDays: sanitizeDisabledDays(payload?.disabledDays),
        disabledDates: sanitizeDisabledDates(payload?.disabledDates),
        blackoutRanges: sanitizeBlackoutRanges(payload?.blackoutRanges),
    };
}

async function readLocalConfig() {
    try {
        const raw = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch {
        return DEFAULT_HORARIOS;
    }
}

async function writeLocalConfig(data) {
    try {
        await fs.mkdir(path.dirname(LOCAL_DATA_FILE), { recursive: true });
        await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return { localError: null };
    } catch (error) {
        console.warn('Failed writing horarios locally:', error.message);
        return { localError: error };
    }
}

async function readConfig() {
    try {
        const store = getStore({ name: 'vanessa-studio-config' });
        const raw = await store.get(BLOB_KEY, { type: 'text' });
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (error) {
        console.warn('Falling back to local horarios config:', error.message);
    }

    return readLocalConfig();
}

async function writeConfig(data) {
    let blobError = null;

    try {
        const store = getStore({ name: 'vanessa-studio-config' });
        await store.set(BLOB_KEY, JSON.stringify(data, null, 2));
    } catch (error) {
        blobError = error;
        console.warn('Failed writing horarios to Netlify Blobs, saving locally instead:', error.message);
    }

    const { localError } = await writeLocalConfig(data);
    return { blobError, localError };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            const data = await readConfig();
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(data || DEFAULT_HORARIOS),
            };
        }

        if (event.httpMethod === 'POST') {
            const payload = event.body ? JSON.parse(event.body) : {};
            const sanitized = sanitizeConfig(payload);
            const { blobError, localError } = await writeConfig(sanitized);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    data: sanitized,
                    persistedToBlobs: !blobError,
                    warning: blobError
                        ? 'Saved without Netlify Blobs persistence.'
                        : localError
                            ? 'Persisted remotely, but local fallback write was skipped in this environment.'
                            : null,
                }),
            };
        }

        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    } catch (error) {
        console.error('Error in horarios function:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }),
        };
    }
};
