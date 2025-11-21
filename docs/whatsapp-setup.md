# Guía de Configuración: Chatbot de WhatsApp

## 📋 Requisitos Previos

- Cuenta de Netlify (ya la tienes)
- Número de teléfono para WhatsApp Business
- Cuenta en 360dialog o Twilio

## 🚀 Paso 1: Crear Cuenta en 360dialog (Recomendado)

### Opción A: 360dialog (Más Económico)

1. Ve a [360dialog Partner Hub](https://hub.360dialog.com/)
2. Crea una cuenta gratuita
3. Completa el proceso de verificación
4. Agrega tu número de WhatsApp Business

### Opción B: Twilio (Más Fácil)

1. Ve a [Twilio Console](https://www.twilio.com/console)
2. Crea una cuenta (incluye créditos gratis)
3. Ve a "Messaging" → "Try it Out" → "Send a WhatsApp message"
4. Sigue las instrucciones para conectar WhatsApp

## 🔑 Paso 2: Obtener Credenciales de API

### Para 360dialog:

1. En el Partner Hub, ve a "API Keys"
2. Crea una nueva API Key
3. Guarda estos valores:
   - `API Key` (D360-API-KEY)
   - `Phone Number ID`
   - `Webhook URL` (la configuraremos después)

### Para Twilio:

1. En Twilio Console, ve a "Account" → "API Keys & Tokens"
2. Crea una nueva API Key
3. Guarda estos valores:
   - `Account SID`
   - `Auth Token`
   - `WhatsApp Number` (ej: whatsapp:+14155238886)

## ⚙️ Paso 3: Configurar Variables de Entorno en Netlify

1. Ve a [Netlify](https://app.netlify.com/)
2. Selecciona tu sitio: **vanessastudioback**
3. Ve a **Site settings** → **Environment variables**
4. Agrega las siguientes variables:

### Para 360dialog:

```
WHATSAPP_API_URL=https://waba.360dialog.io
WHATSAPP_API_KEY=tu_api_key_de_360dialog
WHATSAPP_PHONE_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=vanessa_nails_studio_2024
```

### Para Twilio:

```
WHATSAPP_API_URL=https://api.twilio.com/2010-04-01/Accounts/TU_ACCOUNT_SID
WHATSAPP_API_KEY=tu_auth_token
WHATSAPP_PHONE_ID=tu_numero_de_whatsapp
WHATSAPP_VERIFY_TOKEN=vanessa_nails_studio_2024
```

## 🔗 Paso 4: Configurar el Webhook

1. **Obtén la URL del webhook:**
   ```
   https://vanessastudioback.netlify.app/.netlify/functions/whatsapp-webhook
   ```

2. **Configura en 360dialog:**
   - Ve a "Webhooks" en el Partner Hub
   - Agrega la URL del webhook
   - Selecciona los eventos: `messages`
   - Guarda la configuración

3. **Configura en Twilio:**
   - Ve a "Messaging" → "Settings" → "WhatsApp Sandbox Settings"
   - En "When a message comes in", pega la URL del webhook
   - Método: `POST`
   - Guarda

## 📝 Paso 5: Actualizar Información del Negocio

Edita el archivo `vanessa-studio-backend/lib/faqs.js` y actualiza:

1. **Precios de servicios** (líneas 7-35):
   ```javascript
   price: '15000', // Cambia 'PRECIO_POR_DEFINIR' por el precio real
   ```

2. **Información del negocio** (líneas 38-46):
   ```javascript
   address: 'Tu dirección completa',
   hours: 'Lunes a Viernes: 9:00 - 19:00',
   instagram: '@tu_instagram',
   ```

## 🧪 Paso 6: Probar el Chatbot

1. **Escanea el código QR** (si usas 360dialog) o **envía un mensaje** al número de WhatsApp configurado

2. **Prueba estos mensajes:**
   - `Hola` → Debe mostrar el menú principal
   - `1` → Debe mostrar cómo agendar
   - `2` → Debe mostrar servicios y precios
   - `3` → Debe mostrar ubicación

3. **Verifica los logs en Netlify:**
   - Ve a "Functions" → "whatsapp-webhook"
   - Revisa los logs para ver si hay errores

## 🚀 Paso 7: Deploy

1. **Commit y push de los cambios:**
   ```bash
   cd vanessa-studio-backend
   git add .
   git commit -m "Add WhatsApp chatbot integration"
   git push
   ```

2. **Netlify desplegará automáticamente** los cambios

3. **Verifica que el webhook esté activo:**
   - Envía "Hola" al número de WhatsApp
   - Deberías recibir el menú automáticamente

## 📊 Monitoreo y Mantenimiento

### Ver Logs de Mensajes:

1. Ve a Netlify → Functions → whatsapp-webhook
2. Revisa los logs en tiempo real

### Actualizar Respuestas:

1. Edita `vanessa-studio-backend/lib/faqs.js`
2. Commit y push
3. Netlify desplegará automáticamente

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

### El bot no responde:

1. Verifica que las variables de entorno estén configuradas
2. Revisa los logs en Netlify Functions
3. Verifica que el webhook esté configurado correctamente

### Error 401 o 403:

1. Verifica que el API Key sea correcto
2. Verifica que el número de teléfono esté verificado

### Mensajes no llegan:

1. Verifica que el webhook URL sea correcto
2. Verifica que los eventos estén configurados (`messages`)
3. Revisa los logs de 360dialog o Twilio

## 💡 Próximos Pasos (Opcional)

1. **Integrar con el sistema de reservas:**
   - Enviar confirmaciones automáticas por WhatsApp
   - Enviar recordatorios de citas

2. **Agregar botones interactivos:**
   - Descomentar el código de botones en `whatsapp-webhook.js`

3. **Agregar soporte para imágenes:**
   - Enviar fotos de trabajos realizados
   - Catálogo de diseños

## 📞 Soporte

Si tienes problemas, revisa:
- [Documentación de 360dialog](https://docs.360dialog.com/)
- [Documentación de Twilio WhatsApp](https://www.twilio.com/docs/whatsapp)
- Logs de Netlify Functions
