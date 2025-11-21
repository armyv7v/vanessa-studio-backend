// vanessa-studio-backend/lib/faqs.js
// Base de conocimiento de FAQs para el chatbot de WhatsApp

const SERVICES = [
    {
        id: 1,
        name: 'Retoque (Mantenimiento)',
        duration: 120,
        price: 'A Consultar',
        emoji: '🔧',
        description: 'Mantenimiento y retoque de uñas acrílicas o polygel'
    },
    {
        id: 2,
        name: 'Reconstrucción Uñas Mordidas (Onicofagía)',
        duration: 180,
        price: 'A Consultar',
        emoji: '🩹',
        description: 'Reconstrucción especializada para uñas mordidas'
    },
    {
        id: 3,
        name: 'Uñas Acrílicas',
        duration: 180,
        price: 'A Consultar',
        emoji: '💅',
        description: 'Aplicación completa de uñas acrílicas con diseño'
    },
    {
        id: 4,
        name: 'Uñas Polygel',
        duration: 180,
        price: 'A Consultar',
        emoji: '✨',
        description: 'Uñas con sistema Polygel, más ligero y flexible'
    },
    {
        id: 5,
        name: 'Uñas Softgel',
        duration: 180,
        price: 'A Consultar',
        emoji: '🌸',
        description: 'Uñas con sistema Softgel, acabado natural'
    },
    {
        id: 6,
        name: 'Kapping o Baño Polygel/Acrílico',
        duration: 150,
        price: 'A Consultar',
        emoji: '💎',
        description: 'Baño de Polygel o Acrílico sobre uña natural'
    },
    {
        id: 7,
        name: 'Reforzamiento Nivelación Rubber',
        duration: 150,
        price: 'A Consultar',
        emoji: '🛡️',
        description: 'Reforzamiento y nivelación con sistema Rubber'
    },
    {
        id: 8,
        name: 'Esmaltado Permanente',
        duration: 90,
        price: 'A Consultar',
        emoji: '💅',
        description: 'Esmaltado de larga duración con acabado profesional'
    },
];

const BUSINESS_INFO = {
    name: 'Vanessa Nails Studio',
    phone: '56991744464',
    address: 'Pasaje Ricardo Videla Pineda 691, Coquimbo',
    hours: 'Lunes a Viernes: 10:00 - 18:00\nExtra Cupo (con costo adicional): 18:00 - 20:00',
    bookingUrl: 'https://vanessa-studiols.pages.dev',
    instagram: '@vanessanailsstudio',
    email: 'nailsvanessacl@gmail.com',
};

const POLICIES = {
    deposit: {
        amount: 5000,
        description: 'Para apartar tu hora debes enviar una reserva de $5.000 pesos, la cual se descuenta del valor total del servicio.'
    },
    payment: {
        methods: ['Transferencia', 'Efectivo'],
        accounts: [
            'VANESSA MORALES - Cuenta RUT 27774310-8 - Banco Estado',
            'VANESSA MORALES - Cuenta Corriente 12700182876 - Banco Estado'
        ]
    },
    cancellation: {
        notice: '24 horas',
        policy: 'Si faltas a tu hora, no hay devolución del abono. Puedes reagendar con el mismo abono avisando mínimo 24 horas antes.'
    },
    extraSlot: {
        description: 'Horario Extra Cupo (18:00 - 20:00) disponible con costo adicional. Consulta disponibilidad y precio.'
    }
};

const FAQS = {
    // Servicios y Precios
    servicios: () => {
        let message = '💅 *Nuestros Servicios:*\n\n';
        SERVICES.forEach(service => {
            message += `${service.emoji} *${service.name}*\n`;
            message += `   ⏱️ ${service.duration} min | 💰 ${service.price}\n`;
            message += `   ${service.description}\n\n`;
        });
        message += `\n📝 *Nota Importante:*\n`;
        message += `Los precios pueden variar según:\n`;
        message += `• Complejidad del trabajo\n`;
        message += `• Estructuras para reconstrucción\n`;
        message += `• Onicofagia (uñas mordidas)\n`;
        message += `• Mantenimientos con uñas faltantes\n`;
        message += `• Largo de uñas deseado\n\n`;
        message += `💬 Contáctanos para una cotización personalizada\n\n`;
        message += `📅 *Agenda tu cita:*\n${BUSINESS_INFO.bookingUrl}`;
        return message;
    },

    // Ubicación y Horarios
    ubicacion: () => {
        return `📍 *Ubicación:*\n${BUSINESS_INFO.address}\n\n` +
            `🕐 *Horarios de Atención:*\n${BUSINESS_INFO.hours}\n\n` +
            `📱 *Contáctanos:*\n` +
            `WhatsApp: +${BUSINESS_INFO.phone}\n` +
            `Instagram: ${BUSINESS_INFO.instagram}`;
    },

    // Política de Reservas
    politicas: () => {
        return `📋 *Políticas de Reserva:*\n\n` +
            `💰 *Abono:*\n${POLICIES.deposit.description}\n\n` +
            `💳 *Métodos de Pago:*\n${POLICIES.payment.methods.join(', ')}\n\n` +
            `🏦 *Cuentas para Transferencia:*\n` +
            POLICIES.payment.accounts.map(acc => `• ${acc}`).join('\n') + '\n\n' +
            `📅 *Cancelaciones:*\n${POLICIES.cancellation.policy}\n\n` +
            `⏰ *Extra Cupo:*\n${POLICIES.extraSlot.description}`;
    },

    // Cómo Agendar
    agendar: () => {
        return `📅 *¿Cómo Agendar tu Cita?*\n\n` +
            `1️⃣ Visita nuestro sistema de reservas:\n${BUSINESS_INFO.bookingUrl}\n\n` +
            `2️⃣ Selecciona tu servicio favorito\n\n` +
            `3️⃣ Elige fecha y hora disponible\n\n` +
            `4️⃣ Completa tus datos\n\n` +
            `5️⃣ Envía el abono de $${POLICIES.deposit.amount} a una de nuestras cuentas\n\n` +
            `6️⃣ Envíanos el comprobante por WhatsApp\n\n` +
            `✅ ¡Listo! Tu cita está confirmada`;
    },

    // Contacto
    contacto: () => {
        return `💬 *¡Gracias por contactarnos!*\n\n` +
            `📝 Hemos recibido tu mensaje y te responderemos en breve.\n\n` +
            `⏰ *Por favor ten en cuenta:*\n` +
            `En este momento podríamos estar atendiendo a otros clientes, pero te responderemos lo antes posible.\n\n` +
            `📱 WhatsApp: +${BUSINESS_INFO.phone}\n` +
            `📧 Email: ${BUSINESS_INFO.email}\n` +
            `📸 Instagram: ${BUSINESS_INFO.instagram}\n\n` +
            `Mientras tanto, puedes agendar tu cita directamente en:\n${BUSINESS_INFO.bookingUrl}\n\n` +
            `¡Gracias por tu paciencia! 😊`;
    },
};

// Función para obtener el menú principal
const getMainMenu = () => {
    return `¡Hola! 👋 Bienvenida a *${BUSINESS_INFO.name}* 💅\n\n` +
        `¿En qué puedo ayudarte?\n\n` +
        `1️⃣ Agendar una cita\n` +
        `2️⃣ Ver servicios y precios\n` +
        `3️⃣ Ubicación y horarios\n` +
        `4️⃣ Políticas de reserva\n` +
        `5️⃣ Hablar con una persona\n\n` +
        `_Escribe el número de la opción que necesites_ 😊`;
};

// Función para procesar la respuesta del usuario
const processUserMessage = (message) => {
    const msg = message.toLowerCase().trim();

    // Saludos
    if (msg.match(/^(hola|hi|hello|buenos días|buenas tardes|buenas noches|hey)$/)) {
        return { type: 'menu', message: getMainMenu() };
    }

    // Opciones del menú
    if (msg === '1' || msg.includes('agendar') || msg.includes('cita') || msg.includes('reserva')) {
        return { type: 'booking', message: FAQS.agendar() };
    }

    if (msg === '2' || msg.includes('servicio') || msg.includes('precio')) {
        return { type: 'services', message: FAQS.servicios() };
    }

    if (msg === '3' || msg.includes('ubicación') || msg.includes('ubicacion') || msg.includes('dirección') || msg.includes('horario')) {
        return { type: 'location', message: FAQS.ubicacion() };
    }

    if (msg === '4' || msg.includes('política') || msg.includes('politica') || msg.includes('abono') || msg.includes('cancelar')) {
        return { type: 'policies', message: FAQS.politicas() };
    }

    if (msg === '5' || msg.includes('persona') || msg.includes('hablar') || msg.includes('vanessa')) {
        return { type: 'human', message: FAQS.contacto() };
    }

    // Preguntas específicas
    if (msg.includes('cuánto cuesta') || msg.includes('cuanto cuesta') || msg.includes('valor')) {
        return { type: 'services', message: FAQS.servicios() };
    }

    if (msg.includes('dónde') || msg.includes('donde') || msg.includes('cómo llegar')) {
        return { type: 'location', message: FAQS.ubicacion() };
    }

    // Mensaje no reconocido
    return {
        type: 'unknown',
        message: `No estoy segura de entender tu mensaje 🤔\n\n` +
            `Aquí están las opciones disponibles:\n\n` +
            getMainMenu()
    };
};

module.exports = {
    SERVICES,
    BUSINESS_INFO,
    POLICIES,
    FAQS,
    getMainMenu,
    processUserMessage,
};
