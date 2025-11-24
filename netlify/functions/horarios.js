// netlify/functions/horarios.js
const fs = require('fs');
const path = require('path');

const horariosPath = path.join(__dirname, '../../data/horarios.json');

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

// Ensure data directory and file exist
function ensureHorariosFile() {
    const dataDir = path.dirname(horariosPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(horariosPath)) {
        fs.writeFileSync(horariosPath, JSON.stringify(DEFAULT_HORARIOS, null, 2), 'utf8');
    }
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        ensureHorariosFile();

        if (event.httpMethod === 'GET') {
            // Read horarios
            const data = fs.readFileSync(horariosPath, 'utf8');
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: data,
            };
        }

        if (event.httpMethod === 'POST') {
            // Save horarios with backup
            const newData = JSON.parse(event.body || '{}');

            // Create backup
            if (fs.existsSync(horariosPath)) {
                const timestamp = Date.now();
                const backupPath = path.join(path.dirname(horariosPath), `horarios.backup.${timestamp}.json`);
                fs.copyFileSync(horariosPath, backupPath);
            }

            // Write new data
            fs.writeFileSync(horariosPath, JSON.stringify(newData, null, 2), 'utf8');

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
