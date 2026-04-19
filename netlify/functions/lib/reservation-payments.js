const { DateTime } = require('luxon');

const PAYMENT_STATUS = {
  PENDING: 'PENDIENTE_PAGO',
  CONFIRMED: 'PAGO_CONFIRMADO',
  EXPIRED: 'EXPIRADA',
  CANCELLED: 'CANCELADA',
};

const PAYMENT_CONFIRM_WINDOW_HOURS = 24;
const SHEET_RESERVATIONS_RANGE = 'A:S';

function getPaymentExpirationIso(createdIso, tz) {
  const createdAt = DateTime.fromISO(createdIso, { zone: tz });
  if (!createdAt.isValid) return '';
  return createdAt.plus({ hours: PAYMENT_CONFIRM_WINDOW_HOURS }).toISO();
}

function getReservationPaymentStatus(row = []) {
  if (row[14]) {
    return row[14];
  }

  // Compatibilidad con reservas historicas creadas antes del flujo de pagos.
  return PAYMENT_STATUS.CONFIRMED;
}

function buildReservationRecord(row = [], rowIndex, tz) {
  const paymentStatus = getReservationPaymentStatus(row);
  const paymentExpiresAt = row[16] || '';
  const paymentConfirmedAt = row[15] || '';
  const releasedAt = row[17] || '';
  const releaseReason = row[18] || '';
  const now = DateTime.now().setZone(tz);
  const expiresAt = paymentExpiresAt ? DateTime.fromISO(paymentExpiresAt, { zone: tz }) : null;
  const isExpired = paymentStatus === PAYMENT_STATUS.PENDING && expiresAt?.isValid && expiresAt < now;

  return {
    rowIndex,
    created: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    phone: row[3] || '',
    service: row[4] || '',
    startLocal: row[5] || '',
    endLocal: row[6] || '',
    duration: row[7] || '',
    extraCupo: row[8] || '',
    eventId: row[9] || '',
    htmlLink: row[10] || '',
    validationCode: row[11] || '',
    attended: row[12] || '',
    validatedAt: row[13] || '',
    paymentStatus,
    paymentConfirmedAt,
    paymentExpiresAt,
    releasedAt,
    releaseReason,
    isExpired,
  };
}

async function updateReservationPaymentFields({
  sheets,
  spreadsheetId,
  sheetName,
  reservation,
  paymentStatus,
  paymentConfirmedAt = '',
  paymentExpiresAt = '',
  releasedAt = '',
  releaseReason = '',
}) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!O${reservation.rowIndex}:S${reservation.rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[paymentStatus, paymentConfirmedAt, paymentExpiresAt, releasedAt, releaseReason]],
    },
  });

  return {
    ...reservation,
    paymentStatus,
    paymentConfirmedAt,
    paymentExpiresAt,
    releasedAt,
    releaseReason,
    isExpired: paymentStatus === PAYMENT_STATUS.EXPIRED,
  };
}

async function confirmReservationPayment({ sheets, spreadsheetId, sheetName, reservation, nowIso }) {
  return updateReservationPaymentFields({
    sheets,
    spreadsheetId,
    sheetName,
    reservation,
    paymentStatus: PAYMENT_STATUS.CONFIRMED,
    paymentConfirmedAt: nowIso,
    paymentExpiresAt: reservation.paymentExpiresAt || '',
    releasedAt: '',
    releaseReason: '',
  });
}

async function deleteCalendarEvent(calendar, calendarId, eventId) {
  if (!eventId) return;

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    });
  } catch (error) {
    const status = error?.code || error?.response?.status;
    if (status === 404) {
      return;
    }
    throw error;
  }
}

async function expirePendingReservations({ sheets, calendar, spreadsheetId, sheetName, calendarId, tz, now = DateTime.now().setZone(tz) }) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${SHEET_RESERVATIONS_RANGE}`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    return { expiredCount: 0, expiredReservations: [] };
  }

  const candidates = rows
    .slice(1)
    .map((row, index) => buildReservationRecord(row, index + 2, tz))
    .filter((reservation) => {
      if (reservation.paymentStatus !== PAYMENT_STATUS.PENDING) return false;
      if (!reservation.paymentExpiresAt) return false;

      const expiresAt = DateTime.fromISO(reservation.paymentExpiresAt, { zone: tz });
      return expiresAt.isValid && expiresAt <= now;
    });

  const expiredReservations = [];

  for (const reservation of candidates) {
    await deleteCalendarEvent(calendar, calendarId, reservation.eventId);

    const updatedReservation = await updateReservationPaymentFields({
      sheets,
      spreadsheetId,
      sheetName,
      reservation,
      paymentStatus: PAYMENT_STATUS.EXPIRED,
      paymentConfirmedAt: reservation.paymentConfirmedAt || '',
      paymentExpiresAt: reservation.paymentExpiresAt || '',
      releasedAt: now.toISO(),
      releaseReason: 'NO_PAYMENT_24H',
    });

    expiredReservations.push(updatedReservation);
  }

  return {
    expiredCount: expiredReservations.length,
    expiredReservations,
  };
}

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_CONFIRM_WINDOW_HOURS,
  SHEET_RESERVATIONS_RANGE,
  buildReservationRecord,
  getPaymentExpirationIso,
  confirmReservationPayment,
  expirePendingReservations,
};
