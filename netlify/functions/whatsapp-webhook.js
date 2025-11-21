// vanessa-studio-backend/netlify/functions/whatsapp-webhook.js
// Webhook para recibir y procesar mensajes de WhatsApp con Twilio

const { processUserMessage } = require('../../lib/faqs');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Envía un mensaje de WhatsApp usando Twilio API
 * @param {string} to - Número de teléfono del destinatario (formato: whatsapp:+56991234567)
 * @param {string} message - Mensaje a enviar
 */
async function sendWhatsAppMessage(to, message) {
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
        console.error('Missing Twilio credentials');
        return;
    }

    try {
        // Twilio usa autenticación básica
        const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
                    To: to,
                    Body: message
                })
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('Error sending WhatsApp message:', error);
            throw new Error(`Twilio API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('WhatsApp message sent successfully:', data.sid);
        return data;
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        throw error;
    }
}

exports.handler = async (event) => {
    // Manejar OPTIONS para CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    // Procesar mensajes entrantes (POST request)
    if (event.httpMethod === 'POST') {
        try {
            // Twilio envía datos como application/x-www-form-urlencoded
            const params = new URLSearchParams(event.body);
            const body = Object.fromEntries(params);

            console.log('Received webhook:', JSON.stringify(body, null, 2));

            // Extraer información del mensaje de Twilio
            const from = body.From; // Formato: whatsapp:+56991234567
            const messageBody = body.Body;
            const messageSid = body.MessageSid;

            if (!messageBody) {
                // No hay mensaje de texto (puede ser un media message)
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ status: 'ok' })
                };
            }

            console.log(`Message from ${from}: ${messageBody}`);

            // Procesar el mensaje con la lógica del chatbot
            const response = processUserMessage(messageBody);

            // Enviar respuesta
            await sendWhatsAppMessage(from, response.message);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ status: 'ok', sid: messageSid })
            };

        } catch (error) {
            console.error('Error processing webhook:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Internal server error', message: error.message })
            };
        }
    }

    // Método no permitido
    return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
