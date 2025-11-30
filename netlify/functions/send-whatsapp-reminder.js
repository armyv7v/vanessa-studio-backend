// vanessa-studio-backend/netlify/functions/send-whatsapp-reminder.js
// Función para enviar recordatorios de mantenimiento por WhatsApp

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Formatea un mensaje de recordatorio para WhatsApp
 * @param {Object} params - Parámetros del recordatorio
 * @returns {string} Mensaje formateado
 */
function formatReminderMessage({ clientName, diffDays, type, loyaltyData }) {
    const isUrgent = type === 'REMINDER28';

    let message = `💅 ¡Hola ${clientName}!\n\n`;

    if (isUrgent) {
        message += `Ya van *${diffDays} días* desde tu última visita. Nos encantaría volver a verte pronto 💗\n\n`;
        message += `⚠️ Después de 30 días debemos retirar y reconstruir para cuidar la salud de tus uñas.\n\n`;
    } else {
        message += `Han pasado *${diffDays} días* desde tu última visita. ¡Tus uñas te están esperando! ✨\n\n`;
        message += `🎯 Mantenimiento ideal: cada *21 días*\n`;
        message += `⚠️ Máximo: *30 días*\n\n`;
    }

    // Agregar información de fidelidad si existe
    if (loyaltyData && loyaltyData.currentStamps > 0) {
        const { currentStamps, daysRemaining, rewardAvailable } = loyaltyData;

        if (rewardAvailable) {
            message += `🎉 *¡Felicitaciones!* Has completado tu tarjeta de fidelidad.\n`;
            message += `Tienes un *25% de descuento* esperándote 💝\n\n`;
        } else if (daysRemaining <= 5) {
            message += `⏰ Solo te quedan *${daysRemaining} días* para mantener tu progreso de *${currentStamps}/6 sellos*\n\n`;
        } else {
            message += `✨ Llevas *${currentStamps} de 6 sellos* completados. ¡Sigue así!\n\n`;
        }
    }

    message += `¿Agendamos tu cita?\n`;
    message += `Responde a este mensaje para reservar 💖\n\n`;
    message += `_- Vanessa Nails Studio_`;

    return message;
}

/**
 * Envía un mensaje de WhatsApp usando Twilio API
 */
async function sendWhatsAppMessage(to, message) {
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
        throw new Error('Missing Twilio credentials');
    }

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
        console.error('Twilio API error:', error);
        throw new Error(`Twilio API error: ${response.status}`);
    }

    return await response.json();
}

exports.handler = async (event) => {
    // Manejar OPTIONS para CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { phone, clientName, diffDays, type, loyaltyData } = body;

        if (!phone || !clientName || !diffDays || !type) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Missing required fields: phone, clientName, diffDays, type' })
            };
        }

        // Formatear número de teléfono para WhatsApp
        // Asegurarse de que tenga el formato whatsapp:+56991234567
        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('whatsapp:')) {
            // Si no tiene el prefijo +, agregarlo
            if (!formattedPhone.startsWith('+')) {
                formattedPhone = '+' + formattedPhone;
            }
            formattedPhone = 'whatsapp:' + formattedPhone;
        }

        // Formatear el mensaje
        const message = formatReminderMessage({ clientName, diffDays, type, loyaltyData });

        // Enviar mensaje
        const result = await sendWhatsAppMessage(formattedPhone, message);

        console.log(`WhatsApp reminder sent to ${phone}:`, result.sid);

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                success: true,
                messageSid: result.sid,
                to: formattedPhone
            })
        };

    } catch (error) {
        console.error('Error sending WhatsApp reminder:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Failed to send WhatsApp reminder',
                message: error.message
            })
        };
    }
};
