# Guía de Configuración: 360dialog para WhatsApp Chatbot

## 🎯 Paso 1: Crear Cuenta en 360dialog

1. **Ve a 360dialog Partner Hub:**
   - URL: https://hub.360dialog.com/
   - Haz clic en "Sign Up" o "Get Started"

2. **Completa el registro:**
   - Ingresa tu email y crea una contraseña
   - Verifica tu email
   - Completa tu perfil de negocio

3. **Conecta tu número de WhatsApp Business:**
   - Necesitas un número de teléfono que NO esté registrado en WhatsApp
   - Puede ser un número nuevo o uno que no uses en WhatsApp actualmente
   - **Importante**: Una vez conectado, ese número solo funcionará con la API (no podrás usarlo en la app de WhatsApp)

## 🔑 Paso 2: Obtener las Credenciales

### A. Obtener el API Key

1. En el Partner Hub, ve a la sección **"API Keys"**
2. Haz clic en **"Create API Key"**
3. Dale un nombre (ej: "Vanessa Nails Chatbot")
4. **Copia y guarda el API Key** - Lo necesitarás después
   - Formato: `D360-API-KEY-xxxxxxxxxxxxxxxx`

### B. Obtener el Client ID (opcional para webhooks)

1. Ve a **"Clients"** en el menú
2. Selecciona tu cliente o crea uno nuevo
3. Copia el **Client ID**

## ⚙️ Paso 3: Configurar Variables de Entorno en Netlify

1. **Ve a Netlify:**
   - URL: https://app.netlify.com/
   - Selecciona tu sitio: **vanessastudioback**

2. **Navega a Environment Variables:**
   - Site settings → Environment variables
   - Haz clic en "Add a variable"

3. **Agrega estas variables:**

```
Variable 1:
Key: WHATSAPP_360_API_KEY
Value: [Tu API Key de 360dialog]

Variable 2:
Key: WHATSAPP_VERIFY_TOKEN
Value: vanessa_nails_studio_2024

```

4. **Guarda los cambios**

## 🔗 Paso 4: Configurar el Webhook en 360dialog

### URL del Webhook:
```
https://vanessastudioback.netlify.app/.netlify/functions/whatsapp-webhook
```

### Configuración en 360dialog:

1. **En el Partner Hub, ve a "Webhooks"**

2. **Haz clic en "Add Webhook" o "Configure Webhook"**

3. **Completa los campos:**
   - **Webhook URL**: `https://vanessastudioback.netlify.app/.netlify/functions/whatsapp-webhook`
   - **Verify Token**: `vanessa_nails_studio_2024`

4. **Selecciona los eventos a recibir:**
   - ✅ `messages` (mensajes entrantes)
   - ✅ `message_status` (estado de mensajes - opcional)

5. **Guarda la configuración**

6. **360dialog verificará el webhook automáticamente**
   - Debería mostrar "Verified" o un check verde
   - Si falla, verifica que:
     - La URL sea correcta
     - El verify token coincida
     - Netlify haya desplegado los cambios

## 📝 Paso 5: Actualizar Información del Chatbot

Edita el archivo: `vanessa-studio-backend/lib/faqs.js`

### Actualizar Servicios y Precios (líneas 6-35):

```javascript
const SERVICES = [
  {
    id: 1,
    name: 'Esmaltado Permanente',
    duration: 60,
    price: '15000', // ← ACTUALIZA CON TU PRECIO REAL
    emoji: '💅',
    description: 'Esmaltado de larga duración con acabado profesional'
  },
  // ... más servicios
];
```

### Actualizar Información del Negocio (líneas 38-46):

```javascript
const BUSINESS_INFO = {
  name: 'Vanessa Nails Studio',
  phone: '56991744464',
  address: 'TU DIRECCIÓN COMPLETA AQUÍ', // ← ACTUALIZA
  hours: 'Lunes a Viernes: 9:00 - 19:00, Sábados: 10:00 - 18:00', // ← ACTUALIZA
  bookingUrl: 'https://vanessa-studiols.pages.dev',
  instagram: '@vanessanailsstudio', // ← ACTUALIZA SI ES DIFERENTE
  email: 'nailsvanessacl@gmail.com',
};
```

## 🚀 Paso 6: Deploy

1. **Commit y push de los cambios:**

```bash
cd vanessa-studio-backend
git add .
git commit -m "Configure 360dialog WhatsApp chatbot"
git push
```

2. **Netlify desplegará automáticamente** (1-2 minutos)

3. **Verifica el deploy:**
   - Ve a Netlify → Deploys
   - Espera a que el deploy esté "Published"

## 🧪 Paso 7: Probar el Chatbot

### Prueba Básica:

1. **Envía un mensaje de WhatsApp al número configurado:**
   - Mensaje: `Hola`

2. **Deberías recibir el menú automáticamente:**
   ```
   ¡Hola! 👋 Bienvenida a Vanessa Nails Studio 💅

   ¿En qué puedo ayudarte?
   1️⃣ Agendar una cita
   2️⃣ Ver servicios y precios
   3️⃣ Ubicación y horarios
   4️⃣ Políticas de reserva
   5️⃣ Hablar con una persona
   ```

3. **Prueba las opciones:**
   - Envía `1` → Debe mostrar cómo agendar
   - Envía `2` → Debe mostrar servicios y precios
   - Envía `3` → Debe mostrar ubicación

### Si no funciona:

1. **Verifica los logs en Netlify:**
   - Functions → whatsapp-webhook → Logs
   - Busca errores

2. **Verifica en 360dialog:**
   - Webhooks → Debe mostrar "Verified"
   - Logs → Revisa si hay errores

3. **Verifica las variables de entorno:**
   - Netlify → Environment variables
   - Asegúrate de que `WHATSAPP_360_API_KEY` esté configurada

## 📊 Paso 8: Monitoreo

### Ver Mensajes Enviados/Recibidos:

1. **En 360dialog Partner Hub:**
   - Dashboard → Verás estadísticas de mensajes
   - Analytics → Métricas detalladas

2. **En Netlify:**
   - Functions → whatsapp-webhook → Logs
   - Verás cada mensaje procesado

### Costos:

- **Conversaciones iniciadas por clientes**: Gratis (primeras 1,000/mes)
- **Mensajes que tú envías**: ~$0.0047 cada uno
- **Facturación**: Mensual, solo pagas lo que usas

## 🔧 Mantenimiento

### Actualizar Precios o Información:

1. Edita `vanessa-studio-backend/lib/faqs.js`
2. Commit y push
3. Netlify despliega automáticamente

### Agregar Nuevos Servicios:

```javascript
{
  id: 6,
  name: 'Nuevo Servicio',
  duration: 60,
  price: '20000',
  emoji: '✨',
  description: 'Descripción del servicio'
}
```

## 🆘 Solución de Problemas

### Error: "Missing 360dialog API key"
- Verifica que `WHATSAPP_360_API_KEY` esté en Netlify
- Redeploy el sitio

### Error: "Webhook verification failed"
- Verifica que el `WHATSAPP_VERIFY_TOKEN` coincida
- Debe ser: `vanessa_nails_studio_2024`

### El bot no responde:
- Verifica que el webhook esté "Verified" en 360dialog
- Revisa los logs en Netlify Functions
- Verifica que el número esté correctamente conectado

### Error 401 o 403:
- Verifica que el API Key sea correcto
- Asegúrate de que no tenga espacios al inicio o final

## 📞 Soporte

- **Documentación 360dialog**: https://docs.360dialog.com/
- **Soporte 360dialog**: support@360dialog.com
- **Logs de Netlify**: Para debugging técnico

## ✅ Checklist Final

- [ ] Cuenta creada en 360dialog
- [ ] Número de WhatsApp conectado
- [ ] API Key obtenido
- [ ] Variables de entorno configuradas en Netlify
- [ ] Webhook configurado y verificado
- [ ] Información del negocio actualizada en `faqs.js`
- [ ] Precios actualizados
- [ ] Cambios desplegados en Netlify
- [ ] Chatbot probado y funcionando

¡Listo! Tu chatbot de WhatsApp está configurado y funcionando con 360dialog. 🎉
