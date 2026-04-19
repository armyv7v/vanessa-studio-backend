const { google } = require('googleapis');
const { expirePendingReservations } = require('./lib/reservation-payments');

const CALENDAR_ID = '64693698ebab23975e6f5d11f9f3b170a6d11b9a19ebb459e1486314ee930ebf@group.calendar.google.com';
const SHEET_ID = '1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM';
const SHEET_NAME = 'Reservas';
const TZ = 'America/Santiago';

function getGoogleClient() {
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
}

exports.handler = async function handler() {
  try {
    const authClient = getGoogleClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const result = await expirePendingReservations({
      sheets,
      calendar,
      spreadsheetId: SHEET_ID,
      sheetName: SHEET_NAME,
      calendarId: CALENDAR_ID,
      tz: TZ,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        expiredCount: result.expiredCount,
      }),
    };
  } catch (error) {
    console.error('Error expiring pending reservations:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
