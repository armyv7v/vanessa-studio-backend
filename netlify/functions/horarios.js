// netlify/functions/horarios.js
const { getStore } = require('@netlify/blobs');

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

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        // Get the blob store
        const store = getStore('horarios');

        if (event.httpMethod === 'GET') {
            // Try to read from blob store
            let horarios = DEFAULT_HORARIOS;

            try {
                const storedData = await store.get('current', { type: 'json' });
                if (storedData) {
                    horarios = storedData;
                }
            } catch (e) {
                console.log('No stored horarios found, using defaults:', e.message);
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(horarios),
            };
        }

        if (event.httpMethod === 'POST') {
            // Save horarios to blob store
            const newData = JSON.parse(event.body || '{}');

            // Create backup with timestamp
            const timestamp = Date.now();
            try {
                const currentData = await store.get('current', { type: 'json' });
                if (currentData) {
                    await store.set(`backup-${timestamp}`, JSON.stringify(currentData));
                }
            } catch (e) {
                console.log('No previous data to backup:', e.message);
            }

            // Save new data
            await store.set('current', JSON.stringify(newData));

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true }),
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
