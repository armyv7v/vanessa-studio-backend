// netlify/functions/api.js

const { google } = require('googleapis');
const { DateTime } = require('luxon');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const QRCode = require('qrcode');
const crypto = require('crypto');
const {
  PAYMENT_STATUS,
  SHEET_RESERVATIONS_RANGE,
  buildReservationRecord,
  getPaymentExpirationIso,
  confirmReservationPayment,
  expirePendingReservations,
} = require('./lib/reservation-payments');

// --- Configuration ---
const CALENDAR_ID = '64693698ebab23975e6f5d11f9f3b170a6d11b9a19ebb459e1486314ee930ebf@group.calendar.google.com';
const SHEET_ID = '1aE4dnWZQjEJWAMaDEfDRpACVUDU8_F9-fzd_2mSQQeM';
const SHEET_NAME = 'Reservas';
const TZ = 'America/Santiago';
const OWNER_EMAIL = 'nailsvanessacl@gmail.com';
const WHATSAPP_PHONE = '56991744464';
const DEPOSIT_AMOUNT = 10000;
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
const BASE_URL = process.env.FRONTEND_URL || 'https://vanessa-studio.vercel.app';

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
const DEFAULT_ALLOWED_ORIGINS = [
  'https://vanessa-studio.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const getAllowedOrigins = () => {
  const configured = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    process.env.ADMIN_ALLOWED_ORIGINS,
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]));
};

const isAllowedOrigin = (origin) => !origin || getAllowedOrigins().includes(origin);

const getCorsHeaders = (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
};

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

const isEmailValid = (email) => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isReasonableString = (value, min = 1, max = 200) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

const normalizePhone = (value = '') => String(value).trim().replace(/[^\d+]/g, '');

const isPhoneValid = (phone) => {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
};

const isValidationCodeValid = (code) => (
  typeof code === 'string' &&
  (
    /^[a-f0-9]{8}$/i.test(code.trim()) ||
    /^VAL-[A-Z0-9-]{8,64}$/i.test(code.trim())
  )
);

const isDateOnlyValid = (date) => (
  typeof date === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  DateTime.fromISO(date, { zone: TZ }).isValid
);

const isTimeValid = (time) => (
  typeof time === 'string' &&
  /^\d{2}:\d{2}$/.test(time)
);

const validateBookingPayload = (data = {}) => {
  const client = data.client || {};
  const name = typeof client.name === 'string' ? client.name.trim() : '';
  const email = normalizeEmail(client.email || '');
  const phone = normalizePhone(client.phone || '');
  const serviceName = typeof data.serviceName === 'string' ? data.serviceName.trim() : '';
  const date = typeof data.date === 'string' ? data.date.trim() : '';
  const start = typeof data.start === 'string' ? data.start.trim() : '';
  const durationMin = Number(data.durationMin);

  if (!isReasonableString(name, 2, 100)) return { ok: false, error: 'Nombre invalido.' };
  if (!isEmailValid(email)) return { ok: false, error: 'Email invalido.' };
  if (!isPhoneValid(phone)) return { ok: false, error: 'Telefono invalido.' };
  if (!isReasonableString(serviceName, 2, 120)) return { ok: false, error: 'Servicio invalido.' };
  if (!isDateOnlyValid(date)) return { ok: false, error: 'Fecha invalida.' };
  if (!isTimeValid(start)) return { ok: false, error: 'Hora invalida.' };
  if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 480) {
    return { ok: false, error: 'Duracion invalida.' };
  }

  const startTime = DateTime.fromISO(`${date}T${start}`, { zone: TZ });
  if (!startTime.isValid) return { ok: false, error: 'Fecha u hora invalida.' };

  return {
    ok: true,
    value: {
      client: { name, email, phone },
      date,
      start,
      durationMin,
      serviceName,
      extraCupo: Boolean(data.extraCupo),
    },
  };
};

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
    range: `${SHEET_NAME}!${SHEET_RESERVATIONS_RANGE}`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][11] === validationCode) {
      return buildReservationRecord(rows[i], i + 1, TZ);
    }
  }

  return null;
};

const isDeletedCalendarResourceError = (error) => {
  const status = error?.code || error?.status || error?.response?.status;
  const message = String(error?.message || error?.response?.data?.error?.message || '').toLowerCase();
  return status === 404 || status === 410 || message.includes('resource has been deleted') || message.includes('deleted');
};

const buildCalendarEventPayload = ({ name, email, phone, service, duration, extraCupo, validationCode, startTime, endTime, note = '' }) => ({
  summary: `Cita: ${service} con ${name}${extraCupo === 'SI' ? ' (EXTRA)' : ''}`,
  description: [
    `Cliente: ${name}`,
    `Email: ${email}`,
    `Telefono: ${phone}`,
    `Servicio: ${service}`,
    `Duracion: ${duration} min`,
    `Modalidad: ${extraCupo === 'SI' ? 'Extra Cupo' : 'Normal'}`,
    validationCode ? `C?digo de validaci?n: ${validationCode}` : '',
    note,
  ].filter(Boolean).join('\n'),
  start: { dateTime: startTime.toISO(), timeZone: TZ },
  end: { dateTime: endTime.toISO(), timeZone: TZ },
  attendees: email ? [{ email }] : [],
});

const ensureEditableReservation = (reservation) => {
  if (!reservation) return 'Reserva no encontrada';
  if (reservation.attended === 'SI') return 'No se puede editar una cita que ya fue validada como asistida.';
  if (reservation.paymentStatus === PAYMENT_STATUS.CANCELLED) return 'La cita ya est? cancelada.';
  return '';
};

const updateReservationClientFields = async ({ sheets, reservation, name, email, phone, service }) => {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!B${reservation.rowIndex}:E${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[name, email, phone, service]] },
  });

  return { ...reservation, name, email, phone, service };
};

const updateReservationScheduleFields = async ({ sheets, reservation, startTime, endTime, durationMin }) => {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!F${reservation.rowIndex}:H${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[startTime.toISO(), endTime.toISO(), durationMin]] },
  });

  return { ...reservation, startLocal: startTime.toISO(), endLocal: endTime.toISO(), duration: String(durationMin) };
};

const updateReservationCalendarEvent = async ({ calendar, reservation, updates, note }) => {
  const startTime = DateTime.fromISO(updates.startLocal || reservation.startLocal, { zone: TZ });
  const endTime = DateTime.fromISO(updates.endLocal || reservation.endLocal, { zone: TZ });
  if (!startTime.isValid || !endTime.isValid) return { eventId: reservation.eventId || '', htmlLink: reservation.htmlLink || '' };

  const eventPayload = buildCalendarEventPayload({
    name: updates.name || reservation.name,
    email: updates.email || reservation.email,
    phone: updates.phone || reservation.phone,
    service: updates.service || reservation.service,
    duration: updates.duration || reservation.duration,
    extraCupo: reservation.extraCupo,
    validationCode: reservation.validationCode,
    startTime,
    endTime,
    note,
  });

  const createReplacementEvent = async () => {
    const inserted = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: 'all',
      requestBody: eventPayload,
    });
    return {
      eventId: inserted.data.id || '',
      htmlLink: inserted.data.htmlLink || '',
    };
  };

  if (!reservation.eventId) {
    return createReplacementEvent();
  }

  try {
    const updated = await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: reservation.eventId,
      sendUpdates: 'all',
      requestBody: eventPayload,
    });
    return { eventId: updated.data.id || reservation.eventId, htmlLink: updated.data.htmlLink || reservation.htmlLink || '' };
  } catch (error) {
    if (isDeletedCalendarResourceError(error)) {
      return createReplacementEvent();
    }
    throw error;
  }
};

const cancelReservation = async ({ sheets, calendar, reservation, nowIso }) => {
  const shouldTouchCalendar = Boolean(
    reservation.eventId
    && reservation.paymentStatus !== PAYMENT_STATUS.EXPIRED
    && reservation.paymentStatus !== PAYMENT_STATUS.CANCELLED
    && !reservation.isExpired
  );

  if (shouldTouchCalendar) {
    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId: reservation.eventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      if (!isDeletedCalendarResourceError(error)) throw error;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!J${reservation.rowIndex}:K${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['', '']] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!O${reservation.rowIndex}:S${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[PAYMENT_STATUS.CANCELLED, reservation.paymentConfirmedAt || '', reservation.paymentExpiresAt || '', nowIso, 'ADMIN_CANCELLED']] },
  });

  return {
    ...reservation,
    eventId: '',
    htmlLink: '',
    paymentStatus: PAYMENT_STATUS.CANCELLED,
    releasedAt: nowIso,
    releaseReason: 'ADMIN_CANCELLED',
    isExpired: false,
  };
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
    range: `${SHEET_NAME}!${SHEET_RESERVATIONS_RANGE}`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const start = DateTime.fromISO(startDate, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(endDate, { zone: TZ }).endOf('day');

  return rows
    .slice(1)
    .map((row, index) => buildReservationRecord(row, index + 2, TZ))
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
    `Hola Vanessa, te envio el comprobante de reserva. Mi nombre es ${clientName}. Codigo de reserva: ${validationCode}`,
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
        <p>Para apartar tu hora debes enviar una reserva de <b>$${DEPOSIT_AMOUNT.toLocaleString('es-CL')}</b> pesos, la cual se descuenta del valor total del servicio.</p>
        <p>Transferir a:</p>
        <ul style="margin:0 0 10px 18px;padding:0">${bankList}</ul>
        <p>Envianos el comprobante por WhatsApp:
          <a href="${whatsLink}" style="color:#d63384;font-weight:bold;text-decoration:none">Enviar comprobante</a>
        </p>
        <p>Codigo de reserva para tu comprobante: <b>${validationCode}</b></p>
        <p>Si el pago no se confirma dentro de las proximas <b>24 horas</b>, la hora se liberara automaticamente.</p>
        <p>Si faltas a tu hora, no hay devolucion del abono. Puedes reagendar con el mismo abono avisando minimo 24 horas antes.</p>
        <p style="font-size:12px;color:#666;margin-top:18px">
          Gracias por tu preferencia.<br>Vanessa Nails Studio
        </p>
      </div>
    </div>
  </div>`;
};

const buildPaymentConfirmedEmailHtml = ({ clientName, fecha, hora, serviceName, htmlLink, validationCode }) => {
  return `
  <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
    <div style="max-width:560px;margin:auto;border:1px solid #f2d7e2;border-radius:12px;overflow:hidden">
      <div style="background:#fef0f5;padding:16px 20px">
        <h2 style="margin:0;color:#d63384">¡Pago Confirmado!</h2>
      </div>
      <div style="padding:20px">
        <p>Hola <b>${clientName}</b>,</p>
        <p>Tu abono de reserva ha sido validado correctamente. Tu cita está <b>confirmada y asegurada</b>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
          <tr><td style="padding:6px 0;width:140px"><b>Servicio:</b></td><td>${serviceName || '-'}</td></tr>
          <tr><td style="padding:6px 0"><b>Fecha:</b></td><td>${fecha}</td></tr>
          <tr><td style="padding:6px 0"><b>Hora:</b></td><td>${hora}</td></tr>
          ${htmlLink ? `<tr><td style="padding:6px 0"><b>Evento:</b></td><td><a href="${htmlLink}">Abrir en Google Calendar</a></td></tr>` : ''}
        </table>
        <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:16px 0;text-align:center">
          <p style="margin:0;font-size:13px;color:#999">Código de reserva: <b>${validationCode}</b></p>
        </div>
        <p>Recordá llegar a la hora de tu cita. Si necesitás reagendar, recordá hacerlo con al menos 24 horas de anticipación.</p>
        <p style="font-size:12px;color:#666;margin-top:18px">
          Gracias por tu preferencia.<br>Vanessa Nails Studio
        </p>
      </div>
    </div>
  </div>`;
};

const getEnvVar = (name) => {
  return process.env[name];
};

const getAdminValidationPin = () => {
  const pin = getEnvVar('ADMIN_VALIDATION_PIN');
  return (pin && String(pin).trim()) || '2308';
};

const isAdminPinValid = (adminPin) => {
  if (!adminPin) return false;
  return String(adminPin).trim() === getAdminValidationPin();
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
  const corsHeaders = getCorsHeaders(event);
  const origin = event?.headers?.origin || event?.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: isAllowedOrigin(origin) ? 204 : 403,
      headers: corsHeaders,
      body: '',
    };
  }

  if (!isAllowedOrigin(origin)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden origin' }) };
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
                paymentStatus: reservation.paymentStatus,
                paymentConfirmedAt: reservation.paymentConfirmedAt || '',
                paymentExpiresAt: reservation.paymentExpiresAt || '',
                releasedAt: reservation.releasedAt || '',
                releaseReason: reservation.releaseReason || '',
                isExpired: reservation.isExpired,
                htmlLink: reservation.htmlLink,
              };
            })
          })
        };
      }

      if (path.includes('/payment-reservations')) {
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
          body: JSON.stringify({ reservations })
        };
      }

      // GET /api/validate-attendance/:code - Obtener detalles de la reserva
      if (path.includes('/validate-attendance/')) {
        const code = path.split('/').pop();

        if (!isValidationCodeValid(code)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Codigo invalido' }) };
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
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ customer: null }) };
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

      if (!isValidationCodeValid(code)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Codigo de validacion invalido' })
        };
      }

      if (!isAdminPinValid(adminPin)) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Unauthorized' })
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

      if (reservation.paymentStatus !== PAYMENT_STATUS.CONFIRMED) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'No se puede validar asistencia mientras el pago del abono no este confirmado.' })
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

    if (event.httpMethod === 'POST' && path.includes('/confirm-payment')) {
      const { code, adminPin } = JSON.parse(event.body || '{}');

      if (!isValidationCodeValid(code)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Codigo de reserva invalido' })
        };
      }

      if (!isAdminPinValid(adminPin)) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }

      const reservation = await findReservationByCode(sheets, code);

      if (!reservation) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Reserva no encontrada' })
        };
      }

      if (reservation.paymentStatus === PAYMENT_STATUS.CONFIRMED) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Esta reserva ya tiene el pago confirmado', paymentConfirmedAt: reservation.paymentConfirmedAt || '' })
        };
      }

      // Si estaba expirada, recreamos el evento en Google Calendar
      const wasExpired = reservation.paymentStatus === PAYMENT_STATUS.EXPIRED || reservation.paymentStatus === PAYMENT_STATUS.CANCELLED || reservation.isExpired;
      let eventId = null;
      let htmlLink = null;

      if (wasExpired) {
        const startTime = DateTime.fromISO(reservation.startLocal, { zone: TZ });
        const endTime = DateTime.fromISO(reservation.endLocal, { zone: TZ });

        // Insertar en calendario
        const eventTitle = `Cita (Restaurada): ${reservation.service} con ${reservation.name}${reservation.extraCupo === 'SI' ? ' (EXTRA)' : ''}`;
        const eventDescription = [
          `Cliente: ${reservation.name}`,
          `Email: ${reservation.email}`,
          `Telefono: ${reservation.phone}`,
          `Servicio: ${reservation.service}`,
          `Duracion: ${reservation.duration} min`,
          `Modalidad: ${reservation.extraCupo === 'SI' ? 'Extra Cupo' : 'Normal'}`,
          `Código de validación: ${reservation.validationCode}`,
          `Restaurada por administrador el ${DateTime.now().setZone(TZ).toFormat('dd/MM/yyyy HH:mm')}`,
        ].join('\n');

        const newEvent = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          sendUpdates: 'all', // Enviar correo con invitación
          requestBody: {
            summary: eventTitle,
            description: eventDescription,
            start: { dateTime: startTime.toISO(), timeZone: TZ },
            end: { dateTime: endTime.toISO(), timeZone: TZ },
            attendees: [{ email: reservation.email }],
          },
        });

        eventId = newEvent.data.id;
        htmlLink = newEvent.data.htmlLink;
      }

      const nowIso = DateTime.now().setZone(TZ).toISO();
      const updatedReservation = await confirmReservationPayment({
        sheets,
        spreadsheetId: SHEET_ID,
        sheetName: SHEET_NAME,
        reservation,
        nowIso,
        eventId,
        htmlLink,
      });

      // Enviar correo de confirmación de pago
      try {
        const emailHtml = buildPaymentConfirmedEmailHtml({
          clientName: reservation.name,
          fecha: DateTime.fromISO(reservation.startLocal, { zone: TZ }).toFormat('dd/MM/yyyy'),
          hora: DateTime.fromISO(reservation.startLocal, { zone: TZ }).toFormat('HH:mm'),
          serviceName: reservation.service,
          htmlLink: htmlLink || reservation.htmlLink,
          validationCode: reservation.validationCode,
        });

        const sender = { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL };

        await brevoApi.sendTransacEmail({
          sender,
          to: [{ email: reservation.email, name: reservation.name }],
          subject: `Pago Confirmado - Tu cita está asegurada - ${reservation.service}`,
          htmlContent: emailHtml,
        });
      } catch (emailError) {
        console.error('Error enviando email de confirmación de pago:', emailError);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: wasExpired ? 'Pago confirmado y cita restaurada correctamente' : 'Pago confirmado correctamente',
          reservation: updatedReservation,
        })
      };
    }


    if (event.httpMethod === 'POST' && path.includes('/reservation-update')) {
      const { code, adminPin, client = {}, service } = JSON.parse(event.body || '{}');

      if (!isValidationCodeValid(code)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Codigo de reserva invalido' }) };
      }
      if (!isAdminPinValid(adminPin)) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const name = typeof client.name === 'string' ? client.name.trim() : '';
      const email = normalizeEmail(client.email || '');
      const phone = normalizePhone(client.phone || '');
      const serviceName = typeof service === 'string' ? service.trim() : '';

      if (!isReasonableString(name, 2, 100)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Nombre invalido.' }) };
      if (!isEmailValid(email)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email invalido.' }) };
      if (!isPhoneValid(phone)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Telefono invalido.' }) };
      if (!isReasonableString(serviceName, 2, 120)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Servicio invalido.' }) };

      const reservation = await findReservationByCode(sheets, code);
      const editError = ensureEditableReservation(reservation);
      if (editError) return { statusCode: reservation ? 400 : 404, headers: corsHeaders, body: JSON.stringify({ error: editError }) };

      const calendarResult = await updateReservationCalendarEvent({
        calendar,
        reservation,
        updates: { name, email, phone, service: serviceName },
        note: `Datos actualizados por administrador el ${DateTime.now().setZone(TZ).toFormat('dd/MM/yyyy HH:mm')}`,
      });

      const updatedReservation = await updateReservationClientFields({ sheets, reservation, name, email, phone, service: serviceName });
      if (calendarResult.eventId !== reservation.eventId || calendarResult.htmlLink !== reservation.htmlLink) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!J${reservation.rowIndex}:K${reservation.rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[calendarResult.eventId, calendarResult.htmlLink]] },
        });
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Datos de la cita actualizados correctamente',
          reservation: { ...updatedReservation, eventId: calendarResult.eventId, htmlLink: calendarResult.htmlLink },
        }),
      };
    }

    if (event.httpMethod === 'POST' && path.includes('/reservation-reschedule')) {
      const { code, adminPin, date, start, durationMin } = JSON.parse(event.body || '{}');

      if (!isValidationCodeValid(code)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Codigo de reserva invalido' }) };
      }
      if (!isAdminPinValid(adminPin)) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (!isDateOnlyValid(date)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Fecha invalida.' }) };
      if (!isTimeValid(start)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Hora invalida.' }) };

      const reservation = await findReservationByCode(sheets, code);
      const editError = ensureEditableReservation(reservation);
      if (editError) return { statusCode: reservation ? 400 : 404, headers: corsHeaders, body: JSON.stringify({ error: editError }) };
      if (reservation.paymentStatus === PAYMENT_STATUS.EXPIRED || reservation.isExpired) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No se puede reagendar una cita expirada. Primero confirm?/reactiv? el pago.' }) };
      }

      const parsedDuration = Number(durationMin || reservation.duration);
      if (!Number.isFinite(parsedDuration) || parsedDuration < 15 || parsedDuration > 480) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Duracion invalida.' }) };
      }

      const startTime = DateTime.fromISO(`${date}T${start}`, { zone: TZ });
      const endTime = startTime.plus({ minutes: parsedDuration });
      if (!startTime.isValid || !endTime.isValid) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Fecha u hora invalida.' }) };
      }

      const conflictRes = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startTime.toISO(),
        timeMax: endTime.toISO(),
        timeZone: TZ,
        singleEvents: true,
        maxResults: 10,
      });
      const conflicts = (conflictRes.data.items || []).filter((item) => item.id !== reservation.eventId);
      if (conflicts.length > 0) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'El nuevo horario ya tiene una cita o bloqueo en Google Calendar.' }) };
      }

      const calendarResult = await updateReservationCalendarEvent({
        calendar,
        reservation,
        updates: { startLocal: startTime.toISO(), endLocal: endTime.toISO(), duration: parsedDuration },
        note: `Reagendada por administrador el ${DateTime.now().setZone(TZ).toFormat('dd/MM/yyyy HH:mm')}`,
      });

      if (!calendarResult.eventId) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'No se encontr? el evento de Calendar para reagendar. Revis? la cita antes de continuar.' }) };
      }

      const updatedReservation = await updateReservationScheduleFields({ sheets, reservation, startTime, endTime, durationMin: parsedDuration });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!J${reservation.rowIndex}:K${reservation.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[calendarResult.eventId, calendarResult.htmlLink]] },
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Cita reagendada correctamente',
          reservation: { ...updatedReservation, eventId: calendarResult.eventId, htmlLink: calendarResult.htmlLink },
        }),
      };
    }

    if (event.httpMethod === 'POST' && path.includes('/reservation-cancel')) {
      const { code, adminPin } = JSON.parse(event.body || '{}');

      if (!isValidationCodeValid(code)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Codigo de reserva invalido' }) };
      }
      if (!isAdminPinValid(adminPin)) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const reservation = await findReservationByCode(sheets, code);
      if (!reservation) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Reserva no encontrada' }) };
      if (reservation.attended === 'SI') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No se puede eliminar una cita que ya fue validada como asistida.' }) };
      if (reservation.paymentStatus === PAYMENT_STATUS.CANCELLED) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'La cita ya est? cancelada.' }) };

      const updatedReservation = await cancelReservation({
        sheets,
        calendar,
        reservation,
        nowIso: DateTime.now().setZone(TZ).toISO(),
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Hora eliminada y liberada correctamente', reservation: updatedReservation }),
      };
    }
    if (event.httpMethod === 'POST' && path.includes('/expire-pending-payments')) {
      const { adminPin } = JSON.parse(event.body || '{}');
      if (!isAdminPinValid(adminPin)) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }

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
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: result.expiredCount > 0
            ? `Se liberaron ${result.expiredCount} reservas vencidas.`
            : 'No habia reservas pendientes vencidas para liberar.',
          expiredCount: result.expiredCount,
          reservations: result.expiredReservations,
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const bookingValidation = validateBookingPayload(data);
      if (!bookingValidation.ok) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: bookingValidation.error }) };
      }
      const { client, date, start, durationMin, serviceName, extraCupo } = bookingValidation.value;

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

      const createdAtIso = DateTime.now().setZone(TZ).toISO();
      const paymentExpiresAt = getPaymentExpirationIso(createdAtIso, TZ);

      const newRow = [
        createdAtIso,
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
        PAYMENT_STATUS.PENDING, // Columna O - Estado de pago
        '', // Columna P - Fecha de confirmacion de pago
        paymentExpiresAt, // Columna Q - Fecha limite de pago
        '', // Columna R - Fecha de liberacion
        '', // Columna S - Motivo de liberacion
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

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          eventId: newEvent.data.id,
          validationCode,
          paymentStatus: PAYMENT_STATUS.PENDING,
          paymentExpiresAt,
        })
      };
    }

    // GET /api/validate-attendance/:code - Obtener info de la cita
    if (event.httpMethod === 'GET' && path.includes('/validate-attendance/')) {
      const code = path.split('/validate-attendance/')[1];

      if (!isValidationCodeValid(code)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Codigo de validacion invalido' })
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

    // POST/GET /api/clientes - Obtener y agrupar la lista de clientes desde Google Sheets
    if (path.includes('/clientes')) {
      const body = JSON.parse(event.body || '{}');
      if (body.adminPin && !isAdminPinValid(body.adminPin)) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const resReservas = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:N`,
      });
      const rowsReservas = resReservas.data.values || [];

      let rowsFidelidad = [];
      try {
        const resFidelidad = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${LOYALTY_SHEET_NAME}!A:H`,
        });
        rowsFidelidad = resFidelidad.data.values || [];
      } catch (e) {
        console.warn('No se pudo leer TarjetasFidelidad en /clientes:', e.message);
      }

      const loyaltyMap = new Map();
      for (let i = 1; i < rowsFidelidad.length; i++) {
        const row = rowsFidelidad[i];
        const email = normalizeEmail(row[0]);
        if (email) {
          loyaltyMap.set(email, {
            stamps: parseInt(row[2]) || 0,
            lastDate: row[3] || null,
            deadline: row[4] || null,
            rewardAvailable: row[5] === 'SI',
            inPenalty: row[6] === 'SI',
          });
        }
      }

      const clientsMap = new Map();
      for (let i = 1; i < rowsReservas.length; i++) {
        const row = rowsReservas[i];
        const rawEmail = row[2];
        const email = normalizeEmail(rawEmail);
        if (!email) continue;

        const name = (row[1] || '').trim();
        const phone = (row[3] || '').trim();
        const service = (row[4] || '').trim();
        const startDate = row[5] || '';
        const duration = parseInt(row[7]) || 0;
        const attended = (row[12] || '').trim().toUpperCase() === 'SI';
        const validationCode = row[11] || '';

        if (!clientsMap.has(email)) {
          clientsMap.set(email, {
            email,
            name: name || 'Cliente Sin Nombre',
            phone: phone || '',
            totalReservations: 0,
            attendedCount: 0,
            firstAppointmentDate: startDate,
            lastAppointmentDate: startDate,
            serviceCounts: {},
            appointments: [],
            loyalty: loyaltyMap.get(email) || { stamps: 0, rewardAvailable: false, inPenalty: false },
          });
        }

        const client = clientsMap.get(email);
        if (name && (client.name === 'Cliente Sin Nombre' || !client.name)) client.name = name;
        if (phone) client.phone = phone;

        client.totalReservations += 1;
        if (attended) client.attendedCount += 1;

        if (startDate) {
          if (!client.firstAppointmentDate || startDate < client.firstAppointmentDate) {
            client.firstAppointmentDate = startDate;
          }
          if (!client.lastAppointmentDate || startDate > client.lastAppointmentDate) {
            client.lastAppointmentDate = startDate;
          }
        }

        if (service) {
          client.serviceCounts[service] = (client.serviceCounts[service] || 0) + 1;
        }

        client.appointments.push({
          date: startDate,
          service: service || 'Servicio General',
          duration,
          attended,
          validationCode,
        });
      }

      const clients = Array.from(clientsMap.values()).map(c => {
        c.appointments.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        const favoriteServices = Object.entries(c.serviceCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([svc]) => svc);

        return {
          email: c.email,
          name: c.name,
          phone: c.phone,
          totalReservations: c.totalReservations,
          attendedCount: c.attendedCount,
          firstAppointmentDate: c.firstAppointmentDate,
          lastAppointmentDate: c.lastAppointmentDate,
          favoriteServices,
          loyalty: c.loyalty,
          appointments: c.appointments,
        };
      });

      clients.sort((a, b) => String(b.lastAppointmentDate || '').localeCompare(String(a.lastAppointmentDate || '')));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, clients }),
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
