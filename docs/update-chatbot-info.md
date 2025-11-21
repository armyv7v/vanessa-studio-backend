# Chatbot de WhatsApp - Guía Rápida de Actualización

## 📝 Actualizar Precios de Servicios

Edita: `vanessa-studio-backend/lib/faqs.js`

Busca el array `SERVICES` (línea 4) y actualiza los precios:

```javascript
const SERVICES = [
  {
    id: 1,
    name: 'Esmaltado Permanente',
    duration: 60,
    price: '15000', // ← ACTUALIZA AQUÍ (sin puntos ni comas, solo números)
    emoji: '💅',
    description: 'Esmaltado de larga duración con acabado profesional'
  },
  // ... más servicios
];
```

## 🏢 Actualizar Información del Negocio

En el mismo archivo, busca `BUSINESS_INFO` (línea 38):

```javascript
const BUSINESS_INFO = {
  name: 'Vanessa Nails Studio',
  phone: '56991744464',
  address: 'Tu dirección completa aquí', // ← ACTUALIZA
  hours: 'Lunes a Viernes: 9:00 - 19:00, Sábados: 10:00 - 18:00', // ← ACTUALIZA
  bookingUrl: 'https://vanessa-studiols.pages.dev',
  instagram: '@vanessanailsstudio', // ← ACTUALIZA si es diferente
  email: 'nailsvanessacl@gmail.com',
};
```

## 💰 Actualizar Políticas de Pago

Busca `POLICIES` (línea 48):

```javascript
const POLICIES = {
  deposit: {
    amount: 5000, // ← ACTUALIZA si cambias el monto del abono
    description: 'Para apartar tu hora debes enviar una reserva de $5.000 pesos...'
  },
  // ...
};
```

## 🚀 Aplicar Cambios

Después de actualizar:

```bash
cd vanessa-studio-backend
git add .
git commit -m "Update chatbot prices and info"
git push
```

Netlify desplegará automáticamente en 1-2 minutos.

## ✅ Verificar

Envía "2" al chatbot de WhatsApp para ver los servicios actualizados.
