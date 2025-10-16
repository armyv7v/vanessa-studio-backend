// netlify/functions/api.js

const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

// --- CONFIGURATION ---
const CALENDAR_ID = "64693698ebab23975e6f5d11f9f3b170a6d11b9a19ebb459e1486314ee930ebf@group.calendar.google.com";
const SHEET_ID = "1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM";
const SHEET_NAME = "Reservas";
const TZ = "America/Santiago";

// --- AUTHENTICATION ---
const getGoogleClient = () => {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!credentialsBase64) {
    throw new Error("GOOGLE_CREDENTIALS_BASE64 environment variable not set.");
  }

  const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
  const credentials = JSON.parse(credentialsJson);

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  return auth.getClient();
};

// --- CORS HEADERS ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins for now
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// --- NETLIFY FUNCTION HANDLER ---
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const auth = await getGoogleClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    if (event.httpMethod === 'GET') {
      const { date, serviceId } = event.queryStringParameters;

      if (!date || !serviceId) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders },
          body: JSON.stringify({ error: 'Missing date or serviceId parameter' }),
        };
      }

      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);

      const res = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const busySlots = res.data.items.map(event => ({
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
      }));

      return {
        statusCode: 200,
        headers: { ...corsHeaders },
        body: JSON.stringify({ busy: busySlots }),
      };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      const { client, date, start, durationMin, serviceName, extraCupo } = data;

      if (!client || !date || !start || !durationMin || !serviceName) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders },
          body: JSON.stringify({ error: 'Missing required booking fields.' }),
        };
      }
      
      const startTime = new Date(`${date}T${start}`);
      const endTime = new Date(startTime.getTime() + durationMin * 60000);

      const conflictRes = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        maxResults: 1,
      });

      if (conflictRes.data.items.length > 0) {
        return {
          statusCode: 409, // Conflict
          headers: { ...corsHeaders },
          body: JSON.stringify({ error: 'El horario seleccionado ya no está disponible. Por favor, elige otro.' }),
        };
      }

      const eventTitle = `Cita: ${serviceName} con ${client.name}` + (extraCupo ? " (EXTRA)" : "");
      const eventDescription = `Cliente: ${client.name}\nEmail: ${client.email}\nTeléfono: ${client.phone}\nServicio: ${serviceName}\nDuración: ${durationMin} min\nModalidad: ${extraCupo ? 'Extra Cupo' : 'Normal'}`;
      
      const newEvent = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          summary: eventTitle,
          description: eventDescription,
          start: { dateTime: startTime.toISOString(), timeZone: TZ },
          end: { dateTime: endTime.toISOString(), timeZone: TZ },
          attendees: [{ email: client.email }],
          sendNotifications: true,
        },
      });

      const newRow = [
        new Date().toISOString(),
        client.name,
        client.email,
        client.phone,
        serviceName,
        startTime.toLocaleString('sv-SE', { timeZone: TZ }),
        endTime.toLocaleString('sv-SE', { timeZone: TZ }),
        durationMin,
        extraCupo ? "SI" : "NO",
        newEvent.data.id,
        newEvent.data.htmlLink,
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [newRow],
        },
      });
      
      return {
        statusCode: 200,
        headers: { ...corsHeaders },
        body: JSON.stringify({ success: true, eventId: newEvent.data.id }),
      };
    }

    return {
      statusCode: 405,
      headers: { ...corsHeaders },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders },
      body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }),
    };
  }
};
