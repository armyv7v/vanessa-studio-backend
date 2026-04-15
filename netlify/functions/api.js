// netlify/functions/api.js

const { google } = require('googleapis');
const { DateTime } = require('luxon');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const QRCode = require('qrcode');
const crypto = require('crypto');

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

// --- Loyalty Card Configuration ---
const LOYALTY_SHEET_NAME = 'TarjetasFidelidad';
const LOYALTY_START_DATE = '2025-12-01'; // Fecha de inicio del programa
const LOYALTY_GOAL = 6; // Número de sellos para recompensa
const LOYALTY_MAX_DAYS = 30; // Días máximos entre citas
const LOYALTY_IDEAL_DAYS = 21; // Ciclo ideal de servicio

// --- QR Validation Configuration ---
// URL del frontend donde está la página de validación
const BASE_URL = process.env.FRONTEND_URL || 'https://vanessa-studiols.pages.dev';

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
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'nailsvanessacl@gmail.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Vanessa Nails Studio';

// --- CORS headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

function extractBrevoErrorDetails(error) {
  const response = error?.response || error?.response?.res || null;
  const status = response?.status || error?.statusCode || error?.status || null;
  const body = response?.text || response?.body || error?.body || error?.message || String(error);

  return {
    status,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    message: error?.message || null,
    stack: error?.stack || null,
  };
}

// --- Loyalty Card Functions ---
const getLoyaltyCard = async (sheets, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${LOYALTY_SHEET_NAME}!A:H`,
  });

  const rows = res.data.values || [];
  const cardRow = rows.find(row => normalizeEmail(row[0]) === normalizedEmail);

  if (!cardRow) {
    return {
      email: normalizedEmail,
      name: '',
      currentStamps: 0,
      lastAppointmentDate: null,
      deadlineDate: null,
      rewardAvailable: false,
      inPenalty: false,
      appointmentHistory: []
    };
  }

  return {
    email: cardRow[0],
    name: cardRow[1] || '',
    currentStamps: parseInt(cardRow[2]) || 0,
    lastAppointmentDate: cardRow[3] || null,
    deadlineDate: cardRow[4] || null,
    rewardAvailable: cardRow[5] === 'SI',
    inPenalty: cardRow[6] === 'SI',
    appointmentHistory: cardRow[7] ? cardRow[7].split(',') : []
  };
};

const updateLoyaltyCard = async (sheets, email, name, appointmentDate, save = true) => {
  const card = await getLoyaltyCard(sheets, email);
  const now = DateTime.fromISO(appointmentDate, { zone: TZ });

  // Validar que la cita sea después de la fecha de inicio del programa
  const programStart = DateTime.fromISO(LOYALTY_START_DATE, { zone: TZ });
  if (now < programStart) {
    return { ...card, action: 'before_program_start' };
  }

  let newStamps = card.currentStamps;
  let action = 'added'; // 'added', 'penalty_applied', 'penalty_served', 'reward_unlocked'
  let daysElapsed = 0;
  let inPenalty = false;

  if (card.lastAppointmentDate) {
    const lastDate = DateTime.fromISO(card.lastAppointmentDate, { zone: TZ });
    daysElapsed = Math.floor(now.diff(lastDate, 'days').days);

    if (card.inPenalty) {
      // Cliente está cumpliendo penalidad - esta cita no suma pero quita la penalidad
      newStamps = card.currentStamps; // Mantiene los sellos
      inPenalty = false; // Quita la penalidad
      action = 'penalty_served';
    } else if (daysElapsed > LOYALTY_MAX_DAYS) {
      // Excedió 30 días - aplicar penalidad (esta cita no suma)
      newStamps = card.currentStamps; // Mantiene los sellos
      inPenalty = true; // Activa penalidad para próxima cita
      action = 'penalty_applied';
    } else {
      // Racha activa - sumar sello
      newStamps = card.currentStamps + 1;
      action = 'added';
    }
  } else {
    // Primera cita
    newStamps = 1;
    action = 'first_stamp';
  }

  // Verificar si alcanzó la meta
  const rewardAvailable = newStamps >= LOYALTY_GOAL;
  if (rewardAvailable && !card.rewardAvailable) {
    action = 'reward_unlocked';
  }

  // Calcular nueva fecha límite
  const newDeadline = now.plus({ days: LOYALTY_MAX_DAYS }).endOf('day');

  // Actualizar historial
  const history = [...card.appointmentHistory, appointmentDate];

  // Preparar datos para actualizar
  const updatedRow = [
    email,
    name,
    newStamps,
    appointmentDate,
    newDeadline.toISO(),
    rewardAvailable ? 'SI' : 'NO',
    inPenalty ? 'SI' : 'NO',
    history.join(',')
  ];

  if (save) {
    // Buscar o crear fila
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${LOYALTY_SHEET_NAME}!A:A`,
    });

    const allEmails = (res.data.values || []).map(row => normalizeEmail(row[0]));
    const rowIndex = allEmails.indexOf(normalizeEmail(email));

    if (rowIndex >= 0) {
      // Actualizar fila existente
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${LOYALTY_SHEET_NAME}!A${rowIndex + 1}:H${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updatedRow] },
      });
    } else {
      // Agregar nueva fila
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${LOYALTY_SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updatedRow] },
      });
    }
  }

  return {
    email,
    name,
    currentStamps: newStamps,
    lastAppointmentDate: appointmentDate,
    deadlineDate: newDeadline.toISO(),
    rewardAvailable,
    inPenalty,
    appointmentHistory: history,
    action,
    daysElapsed,
    progress: Math.round((newStamps / LOYALTY_GOAL) * 100)
  };
};

// --- QR Validation Functions ---

/**
 * Genera un código único de validación para una cita
 */
const generateValidationCode = (email, date, time) => {
  const timestamp = Date.now();
  const hash = crypto.createHash('md5')
    .update(`${email}-${date}-${time}-${timestamp}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  const dateStr = date.replace(/\//g, '');
  return `VAL-${dateStr}-${hash}`;
};

/**
 * Genera un QR code como URL de imagen pública (para compatibilidad con emails)
 */
const generateQRCode = async (validationCode) => {
  // Usamos query param (?code=) en lugar de ruta dinámica para evitar 404 en hosting estático
  const url = `${BASE_URL}/validar?code=${validationCode}`;
  // Usamos api.qrserver.com para asegurar que la imagen cargue en clientes de correo
  const encodedUrl = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&color=d63384&data=${encodedUrl}`;
};

/**
 * Busca una reserva por código de validación
 */
/**
 * Busca una reserva por código de validación
 */
const findReservationByCode = async (sheets, validationCode) => {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:N`, // Extend range to N to include ValidatedAt
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return null;


  // Buscar en columna L (índice 11) el código de validación
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][11] === validationCode) {
      return {
        rowIndex: i + 1,
        created: rows[i][0] || '',
        name: rows[i][1] || '',
        email: rows[i][2] || '',
        phone: rows[i][3] || '',
        service: rows[i][4] || '',
        startLocal: rows[i][5] || '',
        endLocal: rows[i][6] || '',
        duration: rows[i][7] || '',
        eventId: rows[i][8] || '',
        htmlLink: rows[i][9] || '',
        // Index 10 is HtmlLink (duplicate in newRow logic but let's stick to the map)
        validationCode: rows[i][11] || '',
        attended: rows[i][12] || '',
        validatedAt: rows[i][13] || ''
      };
    }
  }

  return null;
};

/**
 * Marca una reserva como asistida
 */
const markAsAttended = async (sheets, reservation) => {
  const now = new Date().toISOString();

  // Actualizar columnas M (Asistió) y N (Fecha Validación)
  // M es índice 12, N es índice 13
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!M${reservation.rowIndex}:N${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['SI', now]]
    }
  });

  // Actualizar tarjeta de fidelidad
  const loyaltyUpdate = await updateLoyaltyCard(
    sheets,
    reservation.email,
    reservation.name,
    reservation.startLocal
  );

  return loyaltyUpdate;
};

const listReservationsByRange = async (sheets, startDate, endDate) => {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:N`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const start = DateTime.fromISO(startDate, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(endDate, { zone: TZ }).endOf('day');

  return rows
    .slice(1)
    .map((row, index) => ({
      rowIndex: index + 2,
      created: row[0] || '',
      name: row[1] || '',
      email: row[2] || '',
      phone: row[3] || '',
      service: row[4] || '',
      startLocal: row[5] || '',
      endLocal: row[6] || '',
      duration: row[7] || '',
      eventId: row[8] || '',
      htmlLink: row[9] || '',
      validationCode: row[11] || '',
      attended: row[12] || '',
      validatedAt: row[13] || '',
    }))
    .filter((reservation) => reservation.startLocal && reservation.validationCode)
    .filter((reservation) => {
      const reservationDate = DateTime.fromISO(reservation.startLocal, { zone: TZ });
      return reservationDate.isValid && reservationDate >= start && reservationDate <= end;
    })
    .sort((a, b) => DateTime.fromISO(a.startLocal, { zone: TZ }).toMillis() - DateTime.fromISO(b.startLocal, { zone: TZ }).toMillis());
};


const buildEmailHtml = ({ clientName, fecha, hora, duracion, telefono, serviceName, htmlLink, loyaltyData, qrCodeDataURL, validationCode, isBooking = false }) => {
  const bankList = BANK_LINES.map((line) => `<li>${line}</li>`).join('');
  const whatsLink = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
    `Hola Vanessa, te envio el comprobante de reserva. Mi nombre es ${clientName}`,
  )}`;

  // Construir sección de tarjeta de fidelidad
  let loyaltySection = '';


  if (loyaltyData && loyaltyData.action !== 'before_program_start') {
    const { currentStamps, progress, action, deadlineDate, daysElapsed } = loyaltyData;
    const deadline = DateTime.fromISO(deadlineDate, { zone: TZ });
    const deadlineFormatted = deadline.toFormat('dd/MM/yyyy');

    // Generar círculos de sellos
    const stampCircles = Array.from({ length: LOYALTY_GOAL }, (_, i) => {
      const filled = i < currentStamps;
      const isPending = isBooking && i === currentStamps - 1 && filled; // El último sello es el pendiente si es reserva

      let circleStyle = `width:40px;height:40px;border-radius:50%;display:inline-block;margin:0 4px;position:relative;vertical-align:middle;box-sizing:border-box;text-align:center;line-height:34px;`;
      let content = '';

      if (isPending) {
        // Estilo para sello pendiente (booking)
        circleStyle += `border:3px dashed #d63384;background:#fff5f8;`;
        content = `<span style="color:#d63384;font-size:20px;vertical-align:middle;">⏳</span>`;
      } else if (filled) {
        // Estilo para sello confirmado
        circleStyle += `border:3px solid #d63384;background:#d63384;`;
        content = `<span style="color:white;font-size:20px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">✓</span>`;
      } else {
        // Estilo para sello vacío
        circleStyle += `border:3px solid #ddd;background:white;`;
      }

      return `<div style="${circleStyle}">${content}</div>`;
    }).join('');

    // Mensaje según la acción
    let message = '';
    let emoji = '';

    if (action === 'reward_unlocked') {
      message = `🎉 ¡FELICITACIONES! Al validar esta cita completarás tu tarjeta. Tendrás un <b>25% de descuento</b> disponible.`;
      emoji = '🎉';
    } else if (action === 'penalty_applied') {
      message = `⚠️ Han pasado más de 30 días desde tu última cita (${daysElapsed} días). Esta cita NO suma sello, pero mantiene tu progreso.`;
      emoji = '⚠️';
    } else if (action === 'penalty_served') {
      message = `✅ Estás cumpliendo tu penalidad. Esta cita NO suma sello, pero reactiva tu tarjeta para la próxima.`;
      emoji = '✅';
    } else if (action === 'first_stamp') {
      message = isBooking
        ? `💅 ¡Bienvenida! Esta cita sumará tu <b>primer sello</b> al ser validada.`
        : `💅 ¡Bienvenida al programa de fidelidad! Esta es tu primera cita registrada.`;
      emoji = '✨';
    } else {
      message = isBooking
        ? `💅 ¡Excelente! Con esta cita llegarás a ${currentStamps} de ${LOYALTY_GOAL} sellos.`
        : `💅 ¡Excelente! Llevas ${currentStamps} de ${LOYALTY_GOAL} citas completadas (${progress}%).`;
      emoji = '💪';
    }

    loyaltySection = `
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <div style="background:#fff5f8;padding:16px;border-radius:8px;margin:12px 0">
        <h3 style="margin:0 0 12px;color:#d63384">${emoji} Tu Tarjeta de Fidelidad</h3>
        <p style="margin:8px 0">${message}</p>
        <div style="text-align:center;margin:16px 0;white-space:nowrap;overflow-x:auto">
          ${stampCircles}
        </div>
        <div style="background:#d63384;height:8px;border-radius:4px;overflow:hidden;margin:12px 0">
          <div style="background:#fff;height:100%;width:${100 - progress}%;margin-left:${progress}%"></div>
        </div>
        <p style="font-size:13px;color:#666;margin:8px 0">
          <b>Progreso:</b> ${currentStamps}/${LOYALTY_GOAL} citas (${progress}%)
        </p>
        ${isBooking ? `
          <p style="font-size:12px;color:#d63384;margin:8px 0;text-align:center">
            <i>⏳ El sello se confirmará al escanear el QR en el local</i>
          </p>
        ` : ''}
        ${currentStamps < LOYALTY_GOAL ? `
          <p style="font-size:13px;color:#d63384;margin:8px 0">
            <b>⏰ Importante:</b> Agenda tu próxima cita antes del <b>${deadlineFormatted}</b> para mantener tu progreso.
          </p>
          <p style="font-size:12px;color:#888;margin:4px 0">
            💡 <i>Tip: El ciclo ideal es cada 21 días para mantener tus uñas perfectas.</i>
          </p>
        ` : ''}
      </div>
    `;
  }

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
        
        ${loyaltySection}
        
        ${qrCodeDataURL ? `
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <div style="background:#f8f9fa;padding:20px;border-radius:10px;margin:16px 0;text-align:center">
          <h3 style="color:#d63384;margin:0 0 10px">✨ Tu C\u00f3digo QR de Validaci\u00f3n</h3>
          <p style="margin:0 0 15px;color:#666;font-size:14px">Presenta este c\u00f3digo al llegar a tu cita</p>
          <img src="${qrCodeDataURL}" alt="QR Code" style="width:200px;height:200px;border:3px solid #d63384;border-radius:12px;margin:10px 0"/>
          <p style="margin:15px 0 5px;font-size:13px;color:#999">C\u00f3digo: <b>${validationCode}</b></p>
          <p style="margin:5px 0 0;font-size:12px;color:#888">
            <i>Este c\u00f3digo confirmar\u00e1 tu asistencia y sumar\u00e1 autom\u00e1ticamente tu sello de fidelidad</i>
          </p>
        </div>
        ` : ''}
        
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

const getLatestCustomerByEmail = async (sheets, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:K`,
  });

  const rows = res.data.values || [];
  if (!rows.length) return null;

  const matches = rows
    .map((row) => ({
      created: row[0] || '',
      name: row[1] || '',
      email: normalizeEmail(row[2]),
      rawEmail: row[2] || '',
      phone: row[3] || '',
    }))
    .filter((row) => row.email === normalizedEmail);

  if (!matches.length) return null;

  matches.sort((a, b) => {
    const aTime = Date.parse(a.created) || 0;
    const bTime = Date.parse(b.created) || 0;
    return bTime - aTime;
  });

  const latest = matches[0];
  return {
    name: latest.name,
    email: latest.rawEmail || email.trim(),
    phone: latest.phone,
  };
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const authClient = getGoogleClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const path = event.path || '';

    if (event.httpMethod === 'GET') {
      const { date, email, startDate, endDate } = event.queryStringParameters || {};

      if (path.includes('/validate-attendance-list')) {
        if (!startDate || !endDate) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'startDate y endDate son requeridos' })
          };
        }

        const reservations = await listReservationsByRange(sheets, startDate, endDate);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            reservations: reservations.map((reservation) => {
              const startLocal = DateTime.fromISO(reservation.startLocal, { zone: TZ });
              return {
                code: reservation.validationCode,
                name: reservation.name,
                email: reservation.email,
                phone: reservation.phone,
                service: reservation.service,
                startLocal: reservation.startLocal,
                dateLabel: startLocal.isValid ? startLocal.toFormat('dd/MM/yyyy') : '',
                timeLabel: startLocal.isValid ? startLocal.toFormat('HH:mm') : '',
                attended: reservation.attended === 'SI',
                validatedAt: reservation.validatedAt || '',
                htmlLink: reservation.htmlLink,
              };
            })
          })
        };
      }

      // GET /api/validate-attendance/:code - Obtener detalles de la reserva
      if (path.includes('/validate-attendance/')) {
        const code = path.split('/').pop();

        if (!code) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Código requerido' }) };
        }

        const reservation = await findReservationByCode(sheets, code);

        if (!reservation) {
          return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Reserva no encontrada' }) };
        }

        // Obtener tarjeta de fidelidad del cliente
        const loyaltyCard = await getLoyaltyCard(sheets, reservation.email);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            ...reservation,
            clientName: reservation.name, // Alias para frontend
            loyaltyCard: loyaltyCard
          })
        };
      }

      if (email) {
        const customer = await getLatestCustomerByEmail(sheets, email);
        if (!customer) {
          return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Cliente no encontrado' }) };
        }
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ customer }) };
      }

      // Endpoint para obtener tarjeta de fidelidad
      if (event.path && event.path.includes('/loyalty')) {
        const { email: loyaltyEmail } = event.queryStringParameters || {};
        if (!loyaltyEmail) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email requerido' }) };
        }

        const card = await getLoyaltyCard(sheets, loyaltyEmail);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ card }) };
      }

      let timeMin, timeMax;

      if (startDate && endDate) {
        timeMin = DateTime.fromISO(startDate, { zone: TZ }).startOf('day').toISO();
        timeMax = DateTime.fromISO(endDate, { zone: TZ }).endOf('day').toISO();
      } else if (date) {
        const startOfDay = DateTime.fromISO(date, { zone: TZ }).startOf('day');
        timeMin = startOfDay.toISO();
        timeMax = startOfDay.plus({ days: 1 }).toISO();
      } else {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing date or startDate/endDate parameters' }) };
      }

      const res = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: timeMin,
        timeMax: timeMax,
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

    // POST /api/validate-attendance - Confirmar asistencia
    if (event.httpMethod === 'POST' && path.includes('/validate-attendance')) {
      const { code, adminPin } = JSON.parse(event.body || '{}');

      if (!code) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'C\u00f3digo de validaci\u00f3n requerido' })
        };
      }

      // Validar PIN de admin
      const ADMIN_PIN = process.env.ADMIN_VALIDATION_PIN || '1234';
      if (!adminPin || adminPin !== ADMIN_PIN) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'PIN de administrador incorrecto' })
        };
      }

      const reservation = await findReservationByCode(sheets, code);

      if (!reservation) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'C\u00f3digo de validaci\u00f3n no encontrado' })
        };
      }

      if (reservation.attended === 'SI') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Esta cita ya fue validada',
            validatedAt: reservation.validatedAt
          })
        };
      }

      // Marcar como asistida y actualizar fidelidad
      const loyaltyUpdate = await markAsAttended(sheets, reservation);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Asistencia confirmada exitosamente',
          loyalty: {
            currentStamps: loyaltyUpdate.currentStamps,
            progress: loyaltyUpdate.progress,
            rewardAvailable: loyaltyUpdate.rewardAvailable,
            action: loyaltyUpdate.action
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const { client, date, start, durationMin, serviceName, extraCupo } = data;
      if (!client || !date || !start || !durationMin || !serviceName) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing required booking fields.' }) };
      }

      const startTime = DateTime.fromISO(`${date}T${start}`, { zone: TZ });
      const endTime = startTime.plus({ minutes: durationMin });

      const conflictRes = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startTime.toISO(),
        timeMax: endTime.toISO(),
        timeZone: TZ,
        maxResults: 1,
      });

      if ((conflictRes.data.items || []).length > 0) {
        // Log detailed conflict information for debugging
        const conflictDetails = conflictRes.data.items.map(item =>
          `"${item.summary || 'Sin título'}" (${item.start.dateTime || item.start.date} - ${item.end.dateTime || item.end.date})`
        ).join(', ');

        console.error(`[BOOKING_CONFLICT] Intento de reserva: ${startTime.toISO()} - ${endTime.toISO()}`);
        console.error(`[BOOKING_CONFLICT] Eventos conflictivos encontrados: ${conflictDetails}`);

        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            error: `El horario seleccionado ya no esta disponible. Conflicto con: ${conflictDetails}. Por favor, elige otro.`,
            conflicts: conflictRes.data.items // Return full details if client wants to use them
          }),
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
          start: { dateTime: startTime.toISO(), timeZone: TZ },
          end: { dateTime: endTime.toISO(), timeZone: TZ },
          attendees: [{ email: client.email }],
        },
      });

      // Generar código de validación y QR
      let validationCode = '';
      let qrCodeDataURL = '';

      try {
        validationCode = generateValidationCode(client.email, date, start);
        qrCodeDataURL = await generateQRCode(validationCode);
      } catch (qrError) {
        console.error('Error generando QR:', qrError);
        // Fallback si falla el QR: generar solo código sin imagen
        validationCode = `VAL-${Date.now()}`;
      }

      const newRow = [
        new Date().toISOString(),
        client.name,
        client.email,
        client.phone,
        serviceName,
        startTime.toISO(),
        endTime.toISO(),
        durationMin,
        extraCupo ? 'SI' : 'NO',
        newEvent.data.id,
        newEvent.data.htmlLink,
        validationCode, // Columna L
        '', // Columna M - Asistió (vacío inicialmente)
        '', // Columna N - Fecha Validación (vacío inicialmente)
      ];

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [newRow] },
        });
      } catch (sheetError) {
        console.error('Error guardando en Sheets:', sheetError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Error guardando la reserva en la base de datos: ' + sheetError.message })
        };
      }

      // Actualizar tarjeta de fidelidad
      let loyaltyUpdate = null;
      try {
        loyaltyUpdate = await updateLoyaltyCard(
          sheets,
          client.email,
          client.name,
          startTime.toISO(),
          false // No guardar cambios en la hoja (solo simular para el email)
        );
      } catch (loyaltyError) {
        console.error('Error actualizando fidelidad:', loyaltyError);
        // No fallamos la reserva si falla la fidelidad, solo lo logueamos
      }

      try {
        const emailHtml = buildEmailHtml({
          clientName: client.name,
          fecha: date,
          hora: start,
          duracion: durationMin,
          telefono: client.phone,
          serviceName,
          htmlLink: newEvent.data.htmlLink,
          loyaltyData: loyaltyUpdate,
          qrCodeDataURL,
          validationCode,
          isBooking: true
        });

        const sender = { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL };

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
      } catch (emailError) {
        const brevoError = extractBrevoErrorDetails(emailError);
        console.error('Error enviando emails con Brevo:', {
          sender: BREVO_SENDER_EMAIL,
          ownerEmail: OWNER_EMAIL,
          clientEmail: client.email,
          serviceName,
          brevoError,
        });
        // No retornamos error al cliente si falla el email, pero lo registramos
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, eventId: newEvent.data.id }) };
    }

    // GET /api/validate-attendance/:code - Obtener info de la cita
    if (event.httpMethod === 'GET' && path.includes('/validate-attendance/')) {
      const code = path.split('/validate-attendance/')[1];

      const reservation = await findReservationByCode(sheets, code);

      if (!reservation) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'C\u00f3digo de validaci\u00f3n no encontrado' })
        };
      }

      // Parsear fecha para mostrar
      const startDate = DateTime.fromISO(reservation.startLocal, { zone: TZ });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          name: reservation.name,
          email: reservation.email,
          service: reservation.service,
          date: startDate.toFormat('dd/MM/yyyy'),
          time: startDate.toFormat('HH:mm'),
          duration: reservation.duration,
          attended: reservation.attended === 'SI',
          validatedAt: reservation.validatedAt
        })
      };
    }



    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  } catch (error) {
    console.error('Error en la función:', error);

    // Comprueba si el error es de tipo 'invalid_grant' de Google OAuth.
    // Esto sucede cuando el token de actualización es inválido o ha sido revocado.
    const isInvalidGrant = (error.response && error.response.data && error.response.data.error === 'invalid_grant') ||
      (error.message && error.message.includes('invalid_grant'));

    if (isInvalidGrant) {
      console.error("El token de OAuth es inválido. Se requiere re-autenticación.");
      return {
        statusCode: 401, // Unauthorized
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'reauthorization_required',
          message: 'La sesión con Google ha expirado. Por favor, vuelve a conectar la cuenta.'
        }),
      };
    }

    // Para todos los demás errores, devuelve un error 500 genérico.
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }) };
  }
};
