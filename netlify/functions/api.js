// netlify/functions/api.js

const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { Resend } = require('resend');

// --- CONFIGURATION ---
const CALENDAR_ID = "64693698ebab23975e6f5d11f9f3b170a6d11b9a19ebb459e1486314ee930ebf@group.calendar.google.com";
const SHEET_ID = "1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM";
const SHEET_NAME = "Reservas";
const TZ = "America/Santiago";
const OWNER_EMAIL = "nailsvanessacl@gmail.com";
const WHATSAPP_PHONE = "56991744464";
const BANK_LINES = [
  "VANESSA MORALES — Cuenta RUT 27774310-8 — Banco Estado",
  "VANESSA MORALES — Cuenta Corriente 12700182876 — Banco Estado"
];

// --- CLIENTS ---
const getGoogleClient = () => {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!credentialsBase64) throw new Error("GOOGLE_CREDENTIALS_BASE64 is not set.");
  const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
  const credentials = JSON.parse(credentialsJson);
  return new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/spreadsheets'] }).getClient();
};

const resend = new Resend(process.env.RESEND_API_KEY);

// --- CORS HEADERS ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// --- EMAIL TEMPLATE ---
function buildEmailHtml({ clientName, fecha, hora, duracion, telefono, serviceName, htmlLink }) {
  const bankList = BANK_LINES.map(l => `<li>${l}</li>`).join("");
  const whatsLink = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent("Hola Vanessa, te envío el comprobante de reserva. Mi nombre es " + clientName)}`;
  return `
  <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
    <div style="max-width:560px;margin:auto;border:1px solid #f2d7e2;border-radius:12px;overflow:hidden">
      <div style="background:#fef0f5;padding:16px 20px">
        <h2 style="margin:0;color:#d63384">✨ Confirmación de Reserva</h2>
      </div>
      <div style="padding:20px">
        <p>Hola <b>${clientName}</b>, tu cita ha sido registrada con éxito 💅🏻</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
          <tr><td style="padding:6px 0;width:140px"><b>Servicio:</b></td><td>${serviceName || "-"}</td></tr>
          <tr><td style="padding:6px 0"><b>Fecha:</b></td><td>${fecha}</td></tr>
          <tr><td style="padding:6px 0"><b>Hora:</b></td><td>${hora}</td></tr>
          <tr><td style="padding:6px 0"><b>Duración:</b></td><td>${duracion} minutos</td></tr>
          <tr><td style="padding:6px 0"><b>Teléfono:</b></td><td>${telefono || "-"}</td></tr>
          ${htmlLink ? `<tr><td style="padding:6px 0"><b>Evento:</b></td><td><a href="${htmlLink}">Abrir en Google Calendar</a></td></tr>` : ""}
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <h3 style="margin:10px 0 6px">💖 Condiciones de Reserva</h3>
        <p>Para apartar tu horita debes enviar una reserva de <b>$5.000</b> pesos, la cual se descuenta del valor total del servicio.</p>
        <p>🏦 Transferir a:</p>
        <ul style="margin:0 0 10px 18px;padding:0">${bankList}</ul>
        <p>💖 Por favor, envía el comprobante por WhatsApp:
          <a href="${whatsLink}" style="color:#d63384;font-weight:bold;text-decoration:none">Enviar comprobante</a>
        </p>
        <p>🚫 Si faltas a tu hora, no se realiza devolución de la reserva.<br>
           👉 Puedes reagendar con el mismo abono notificando como mínimo <b>24 horas antes</b>.</p>
        <p style="font-size:12px;color:#666;margin-top:18px">
          Gracias por tu preferencia 💅🏻<br>Vanessa Nails Studio
        </p>
      </div>
    </div>
  </div>`;
}

// --- NETLIFY FUNCTION HANDLER ---
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const auth = await getGoogleClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // --- GET: Fetch available slots ---
    if (event.httpMethod === 'GET') {
      const { date } = event.queryStringParameters;
      if (!date) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing date parameter' }) };

      // Construct date objects correctly in the target timezone
      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);

      const res = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        timeZone: TZ, // Tell Google Calendar the timezone for the request
        singleEvents: true,
        orderBy: 'startTime',
      });

      const busySlots = res.data.items.map(e => ({ start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date }));
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ busy: busySlots }) };
    }

    // --- POST: Create a new booking ---
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      const { client, date, start, durationMin, serviceName, extraCupo } = data;
      if (!client || !date || !start || !durationMin || !serviceName) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing required booking fields.' }) };
      }
      
      // --- TIMEZONE FIX ---
      // Create date objects by explicitly telling it's in the target timezone
      const startTimeStr = `${date}T${start}:00`;
      const startTime = new Date(startTimeStr);

      // Google Calendar API is smart enough to use the timeZone property from the event body
      const endTime = new Date(startTime.getTime() + durationMin * 60000);

      const conflictRes = await calendar.events.list({ calendarId: CALENDAR_ID, timeMin: startTime.toISOString(), timeMax: endTime.toISOString(), timeZone: TZ, maxResults: 1 });
      if (conflictRes.data.items.length > 0) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'El horario seleccionado ya no está disponible. Por favor, elige otro.' }) };
      }

      const eventTitle = `Cita: ${serviceName} con ${client.name}` + (extraCupo ? " (EXTRA)" : "");
      const eventDescription = `Cliente: ${client.name}\nEmail: ${client.email}\nTeléfono: ${client.phone}\nServicio: ${serviceName}\nDuración: ${durationMin} min\nModalidad: ${extraCupo ? 'Extra Cupo' : 'Normal'}`;
      
      const newEvent = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        sendNotifications: false,
        requestBody: {
          summary: eventTitle,
          description: eventDescription,
          start: { dateTime: startTime.toISOString(), timeZone: TZ },
          end: { dateTime: endTime.toISOString(), timeZone: TZ },
        },
      });

      // For Sheets, format the date explicitly for the correct timezone
      const localeOptions = { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
      const formattedStart = new Intl.DateTimeFormat('sv-SE', localeOptions).format(startTime);
      const formattedEnd = new Intl.DateTimeFormat('sv-SE', localeOptions).format(endTime);

      const newRow = [
        new Date().toISOString(), client.name, client.email, client.phone, serviceName,
        formattedStart, formattedEnd,
        durationMin, extraCupo ? "SI" : "NO", newEvent.data.id, newEvent.data.htmlLink,
      ];

      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [newRow] } });
      
      const emailHtml = buildEmailHtml({ clientName: client.name, fecha: date, hora: start, duracion: durationMin, telefono: client.phone, serviceName, htmlLink: newEvent.data.htmlLink });
      
      await resend.emails.send({ from: 'onboarding@resend.dev', to: client.email, subject: `✅ Confirmación de Reserva — ${serviceName}`, html: emailHtml });
      if (OWNER_EMAIL) {
        await resend.emails.send({ from: 'onboarding@resend.dev', to: OWNER_EMAIL, subject: `Nueva Cita — ${serviceName} (${client.name})`, html: emailHtml });
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, eventId: newEvent.data.id }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }) };
  }
};
