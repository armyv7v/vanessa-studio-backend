const { google } = require('googleapis');
const { DateTime } = require('luxon');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const SHEET_ID = '1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM';
const LOYALTY_SHEET_NAME = 'TarjetasFidelidad';
const TZ = 'America/Santiago';
const LOYALTY_GOAL = 6;
const LOYALTY_MAX_DAYS = 30;
const LOYALTY_IDEAL_DAYS = 21;
const BOOKING_URL = 'https://vanessastudioback.netlify.app';

const getGoogleClient = () => {
    const {
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
        GOOGLE_OAUTH_REFRESH_TOKEN,
    } = process.env;

    const oauthClient = new google.auth.OAuth2(
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauthClient.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
    return oauthClient;
};

const brevoClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = brevoClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const brevoApi = new SibApiV3Sdk.TransactionalEmailsApi();

const buildReminderEmailHtml = ({ clientName, daysRemaining, currentStamps, deadlineDate, type }) => {
    const deadline = DateTime.fromISO(deadlineDate, { zone: TZ });
    const deadlineFormatted = deadline.toFormat('dd/MM/yyyy');
    const progress = Math.round((currentStamps / LOYALTY_GOAL) * 100);

    let title = '';
    let message = '';
    let urgency = '';

    if (type === 'day_20') {
        title = '💅 ¡Es hora de renovar tus uñas!';
        message = `Han pasado 20 días desde tu última visita. Tus uñas ya deben estar listas para un cambio de look.`;
        urgency = `Además, tienes <b>${daysRemaining} días</b> para agendar y mantener tu progreso de fidelidad (${currentStamps}/${LOYALTY_GOAL} sellos).`;
    } else if (type === 'day_25') {
        title = '⚠️ ¡Tu progreso está por expirar!';
        message = `¡Cuidado! Solo te quedan <b>${daysRemaining} días</b> para agendar tu próxima cita.`;
        urgency = `Si no agendas antes del <b>${deadlineFormatted}</b>, tu siguiente cita NO sumará sello (penalidad de 1 turno). Mantienes tu progreso actual de ${currentStamps}/${LOYALTY_GOAL} sellos.`;
    }

    return `
  <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
    <div style="max-width:560px;margin:auto;border:1px solid #f2d7e2;border-radius:12px;overflow:hidden">
      <div style="background:#fef0f5;padding:16px 20px">
        <h2 style="margin:0;color:#d63384">${title}</h2>
      </div>
      <div style="padding:20px">
        <p>Hola <b>${clientName}</b>,</p>
        <p>${message}</p>
        <div style="background:#fff5f8;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #d63384">
          <p style="margin:0;font-size:15px">${urgency}</p>
        </div>
        <p style="text-align:center;margin:20px 0">
          <a href="${BOOKING_URL}" style="display:inline-block;background:#d63384;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
            Agendar Ahora
          </a>
        </p>
        <p style="font-size:13px;color:#666;margin-top:16px">
          💡 <i>Recuerda: El ciclo ideal es cada 21 días para mantener tus uñas perfectas.</i>
        </p>
        <p style="font-size:12px;color:#666;margin-top:18px">
          Gracias por tu preferencia.<br>Vanessa Nails Studio
        </p>
      </div>
    </div>
  </div>`;
};

exports.handler = async (event) => {
    try {
        const authClient = getGoogleClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${LOYALTY_SHEET_NAME}!A:H`,
        });

        const rows = res.data.values || [];
        const now = DateTime.now().setZone(TZ);
        let remindersSent = 0;

        for (const row of rows.slice(1)) { // Skip header
            const email = row[0];
            const name = row[1];
            const currentStamps = parseInt(row[2]) || 0;
            const lastAppointmentDate = row[3];
            const deadlineDate = row[4];
            const rewardAvailable = row[5] === 'SI';
            const inPenalty = row[6] === 'SI';

            // Skip if already has reward or is in penalty
            if (rewardAvailable || currentStamps >= LOYALTY_GOAL || inPenalty) continue;

            const lastDate = DateTime.fromISO(lastAppointmentDate, { zone: TZ });
            const deadline = DateTime.fromISO(deadlineDate, { zone: TZ });
            const daysElapsed = Math.floor(now.diff(lastDate, 'days').days);
            const daysRemaining = Math.floor(deadline.diff(now, 'days').days);

            let shouldSend = false;
            let reminderType = '';

            // Recordatorio día 20 (ciclo ideal)
            if (daysElapsed === LOYALTY_IDEAL_DAYS - 1) {
                shouldSend = true;
                reminderType = 'day_20';
            }

            // Recordatorio día 25 (alerta de expiración)
            if (daysRemaining === 5) {
                shouldSend = true;
                reminderType = 'day_25';
            }

            if (shouldSend) {
                const emailHtml = buildReminderEmailHtml({
                    clientName: name,
                    daysRemaining,
                    currentStamps,
                    deadlineDate,
                    type: reminderType
                });

                await brevoApi.sendTransacEmail({
                    sender: { name: 'Vanessa Nails Studio', email: 'nailsvanessacl@gmail.com' },
                    to: [{ email, name }],
                    subject: reminderType === 'day_20'
                        ? '💅 ¡Es hora de renovar tus uñas!'
                        : '⚠️ Tu progreso de fidelidad está por expirar',
                    htmlContent: emailHtml,
                });

                console.log(`Reminder sent to ${email} (${reminderType})`);
                remindersSent++;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: `Reminders processed. ${remindersSent} emails sent.`
            })
        };
    } catch (error) {
        console.error('Error in loyalty reminders:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
