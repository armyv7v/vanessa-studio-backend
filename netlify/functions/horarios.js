// netlify/functions/horarios.js
// NOTE: Netlify Functions don't have persistent filesystem access.
// This version uses environment variables or returns defaults.

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
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            // Try to read from environment variable, fallback to defaults
            let horarios = DEFAULT_HORARIOS;

            if (process.env.HORARIOS_JSON) {
                try {
                    horarios = JSON.parse(process.env.HORARIOS_JSON);
                } catch (e) {
                    console.error('Failed to parse HORARIOS_JSON env var:', e);
                }
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(horarios),
            };
        }

        if (event.httpMethod === 'POST') {
            // For now, just acknowledge the POST but explain it can't persist
            // In the future, this should update via Netlify API or use a database
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    warning: 'Changes are not persisted. Please configure a database or use Netlify environment variables.'
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
