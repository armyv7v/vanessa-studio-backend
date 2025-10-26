// netlify/functions/api.js

const { google } = require('googleapis');
const SibApiV3Sdk = require('sib-api-v3-sdk');

// --- Configuration ---
const CALENDAR_ID = '64693698ebab23975e6f5d11f9f3b170a6d11b9a19ebb459e1486314ee930ebf@group.calendar.google.com';
const SHEET_ID = '1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM';
const SHEET_NAME = 'Reservas';
const TZ = 'America/Santiago';
const OWNER_EMAIL = 'nailsvanessacl@gmail.com';
const WHATSAPP_PHONE = '56991744464';
const BANK_LINES = [
  'VANESSA MORALES - Cuenta RUT 27774310-8 - Banco Estado',
  'VANESSA MORALES - Cuenta Corriente 12700182876 - Banco Estado',
];

// --- Google OAuth client (user based, not service account) ---
const getGoogleClient = () => {
  const {
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN,
  } = process.env;

  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error(
      'Google OAuth env vars missing. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN.',
    );
  }

  const oauthClient = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauthClient.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
  return oauthClient;
};

// --- Brevo (Sendinblue) client ---
const brevoClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = brevoClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const brevoApi = new SibApiV3Sdk.TransactionalEmailsApi();

// --- CORS headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const buildEmailHtml = ({ clientName, fecha, hora, duracion, telefono, serviceName, htmlLink }) => {
  const bankList = BANK_LINES.map((line) => `<li>${line}</li>`).join('');
  const whatsLink = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
    `Hola Vanessa, te envio el comprobante de reserva. Mi nombre es ${clientName}`,
  )}`;
  return `
  <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
    <div style="max-width:560px;margin:auto;border:1px solid #f2d7e2;border-radius:12px;overflow:hidden">
      <div style="background:#fef0f5;padding:16px 20px">
        <h2 style="margin:0;color:#d63384">Confirmacion de reserva</h2>
      </div>
      <div style="padding:20px">
        <p>Hola <b>${clientName}</b>, tu cita ha sido registrada con exito.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
          <tr><td style="padding:6px 0;width:140px"><b>Servicio:</b></td><td>${serviceName || '-'}</td></tr>
          <tr><td style="padding:6px 0"><b>Fecha:</b></td><td>${fecha}</td></tr>
          <tr><td style="padding:6px 0"><b>Hora:</b></td><td>${hora}</td></tr>
          <tr><td style="padding:6px 0"><b>Duracion:</b></td><td>${duracion} minutos</td></tr>
          <tr><td style="padding:6px 0"><b>Telefono:</b></td><td>${telefono || '-'}</td></tr>
          ${htmlLink ? `<tr><td style="padding:6px 0"><b>Evento:</b></td><td><a href="${htmlLink}">Abrir en Google Calendar</a></td></tr>` : ''}
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <h3 style="margin:10px 0 6px">Condiciones de reserva</h3>
        <p>Para apartar tu hora debes enviar una reserva de <b>$5.000</b> pesos, la cual se descuenta del valor total del servicio.</p>
        <p>Transferir a:</p>
        <ul style="margin:0 0 10px 18px;padding:0">${bankList}</ul>
        <p>Envianos el comprobante por WhatsApp:
          <a href="${whatsLink}" style="color:#d63384;font-weight:bold;text-decoration:none">Enviar comprobante</a>
        </p>
        <p>Si faltas a tu hora, no hay devolucion del abono. Puedes reagendar con el mismo abono avisando minimo 24 horas antes.</p>
        <p style="font-size:12px;color:#666;margin-top:18px">
          Gracias por tu preferencia.<br>Vanessa Nails Studio
        </p>
      </div>
    </div>
  </div>`;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const authClient = getGoogleClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    if (event.httpMethod === 'GET') {
      const { date } = event.queryStringParameters || {};
      if (!date) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing date parameter' }) };
      }

      const dayStartUTC = new Date(date);
      const startOfDay = new Date(dayStartUTC.getTime() - dayStartUTC.getTimezoneOffset() * 60000);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

      const res = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        timeZone: TZ,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const busySlots = res.data.items.map((eventItem) => ({
        start: eventItem.start.dateTime || eventItem.start.date,
        end: eventItem.end.dateTime || eventItem.end.date,
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ busy: busySlots }) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const { client, date, start, durationMin, serviceName, extraCupo } = data;
      if (!client || !date || !start || !durationMin || !serviceName) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing required booking fields.' }) };
      }

      const startTimeStr = `${date}T${start}:00`;
      const startTime = new Date(startTimeStr);
      const endTime = new Date(startTime.getTime() + durationMin * 60000);

      const conflictRes = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone: TZ,
        maxResults: 1,
      });

      if ((conflictRes.data.items || []).length > 0) {
        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'El horario seleccionado ya no esta disponible. Por favor, elige otro.' }),
        };
      }

      const eventTitle = `Cita: ${serviceName} con ${client.name}${extraCupo ? ' (EXTRA)' : ''}`;
      const eventDescription = [
        `Cliente: ${client.name}`,
        `Email: ${client.email}`,
        `Telefono: ${client.phone}`,
        `Servicio: ${serviceName}`,
        `Duracion: ${durationMin} min`,
        `Modalidad: ${extraCupo ? 'Extra Cupo' : 'Normal'}`,
      ].join('\n');

      const newEvent = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        sendUpdates: 'all',
        requestBody: {
          summary: eventTitle,
          description: eventDescription,
          start: { dateTime: startTime.toISOString(), timeZone: TZ },
          end: { dateTime: endTime.toISOString(), timeZone: TZ },
          attendees: [{ email: client.email }],
        },
      });

      const newRow = [
        new Date().toISOString(),
        client.name,
        client.email,
        client.phone,
        serviceName,
        startTime.toISOString(),
        endTime.toISOString(),
        durationMin,
        extraCupo ? 'SI' : 'NO',
        newEvent.data.id,
        newEvent.data.htmlLink,
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });

      const emailHtml = buildEmailHtml({
        clientName: client.name,
        fecha: date,
        hora: start,
        duracion: durationMin,
        telefono: client.phone,
        serviceName,
        htmlLink: newEvent.data.htmlLink,
      });

      const sender = { name: 'Vanessa Nails Studio', email: 'nailsvanessacl@gmail.com' };

      await brevoApi.sendTransacEmail({
        sender,
        to: [{ email: client.email, name: client.name }],
        subject: `Confirmacion de reserva - ${serviceName}`,
        htmlContent: emailHtml,
      });

      if (OWNER_EMAIL) {
        await brevoApi.sendTransacEmail({
          sender,
          to: [{ email: OWNER_EMAIL, name: 'Vanessa Nails Studio' }],
          subject: `Nueva cita - ${serviceName} (${client.name})`,
          htmlContent: emailHtml,
        });
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, eventId: newEvent.data.id }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }),
    };
  }
};
