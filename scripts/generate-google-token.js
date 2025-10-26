#!/usr/bin/env node

/**
 * Helper script to generate an OAuth refresh token for Google APIs.
 *
 * Usage:
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... GOOGLE_OAUTH_REDIRECT_URI=... node scripts/generate-google-token.js
 *
 * The script prints the consent URL. Open it in your browser, authorize the app,
 * copy the ?code= value from the redirect, and paste it back when prompted.
 * The script outputs the refresh token you must store in Netlify.
 */

const readline = require('readline');
const { google } = require('googleapis');

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const redirectUri =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  process.env.GOOGLE_REDIRECT_URI ||
  'http://localhost';

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET env vars.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
];

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: scopes,
});

console.log('\nAuthorize this app by visiting:\n');
console.log(url);
console.log('\nAfter approving, you will be redirected to the redirect URI with ?code=...\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the authorization code: ', async (code) => {
  rl.close();

  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\nAccess Token:', tokens.access_token || '(received during refresh)');
    console.log('Refresh Token:', tokens.refresh_token || '(not returned, ensure you used prompt=consent)');
    console.log('Scopes:', tokens.scope);
    console.log('\nStore the refresh token in Netlify as GOOGLE_OAUTH_REFRESH_TOKEN.');
  } catch (err) {
    console.error('Failed to exchange code:', err.message || err);
    process.exit(1);
  }
});
