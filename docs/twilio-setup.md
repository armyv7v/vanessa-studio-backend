# Guía de Configuración: Twilio para WhatsApp Chatbot

## 🎯 Paso 1: Crear Cuenta en Twilio

1. **Ve a Twilio:**
   - URL: https://www.twilio.com/try-twilio

2. **Completa el registro:**
   - **Email**: `nailsvanessacl@gmail.com` ✅ (Gmail funciona perfecto)
   - **Nombre**: Vanessa Morales
   - **Contraseña**: Crea una contraseña segura
   - **Verificación**: Ingresa tu número de teléfono para verificación

3. **Completa el cuestionario inicial:**
   - ¿Qué vas a construir?: "WhatsApp chatbot"
   - ¿Qué lenguaje usas?: "JavaScript"
   - ¿Cómo planeas usar Twilio?: "Automated messages"

4. **Recibe $15 USD de crédito gratis** 🎉

## 🔑 Paso 2: Activar WhatsApp en Twilio

### A. Ir a WhatsApp Sandbox

1. En el dashboard de Twilio, ve a:
   - **Messaging** → **Try it out** → **Send a WhatsApp message**
   
2. O directamente: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

### B. Conectar tu WhatsApp

1. Verás un número de WhatsApp de Twilio (ej: `+1 415 523 8886`)
2. Verás un código único (ej: `join <tu-codigo>`)
3. **Desde tu WhatsApp personal**, envía ese mensaje al número de Twilio
4. Recibirás confirmación: "Joined <nombre>-sandbox"

> ⚠️ **Importante**: Este es el sandbox para pruebas. Para producción necesitarás un número aprobado por Meta.

## 📝 Paso 3: Obtener Credenciales

### A. Account SID y Auth Token

1. En el dashboard principal de Twilio
2. Busca la sección **"Account Info"**
3. Copia:
   - **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token**: Haz clic en "Show" y cópialo

### B. Número de WhatsApp

1. Ve a **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Copia el número que aparece (ej: `+14155238886`)
3. Formato completo: `+14155238886`

## ⚙️ Paso 4: Configurar Variables de Entorno en Netlify

1. **Ve a Netlify:**
   - URL: https://app.netlify.com/
   - Selecciona tu sitio: **vanessastudioback**

2. **Navega a Environment Variables:**
   - Site settings → Environment variables
   - Haz clic en "Add a variable"

3. **Agrega estas 3 variables:**

```
Variable 1:
Key: TWILIO_ACCOUNT_SID
Value: [Tu Account SID de Twilio]

Variable 2:
Key: TWILIO_AUTH_TOKEN
Value: [Tu Auth Token de Twilio]

Variable 3:
Key: TWILIO_WHATSAPP_NUMBER
Value: [Tu número de WhatsApp de Twilio, ej: +14155238886]
```

4. **Guarda los cambios**

## 🔗 Paso 5: Configurar el Webhook en Twilio

### URL del Webhook:
```
https://vanessastudioback.netlify.app/.netlify/functions/whatsapp-webhook
```

### Configuración:

1. **En Twilio Console, ve a:**
   - **Messaging** → **Try it out** → **Send a WhatsApp message**
   - Scroll hasta **"Sandbox Configuration"**

2. **En "WHEN A MESSAGE COMES IN":**
   - Pega la URL del webhook: `https://vanessastudioback.netlify.app/.netlify/functions/whatsapp-webhook`
   - Método: **POST**
   - Haz clic en **Save**

## 🚀 Paso 6: Deploy

1. **Commit y push de los cambios:**

```bash
cd vanessa-studio-backend
git add .
git commit -m "Configure Twilio WhatsApp chatbot"
git push
```

2. **Netlify desplegará automáticamente** (1-2 minutos)

3. **Verifica el deploy:**
   - Ve a Netlify → Deploys
   - Espera a que el deploy esté "Published"

## 🧪 Paso 7: Probar el Chatbot

### Prueba Básica:

1. **Desde tu WhatsApp**, envía un mensaje al número de Twilio:
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

2. **Verifica en Twilio:**
   - Messaging → Logs → Errors
   - Revisa si hay errores de webhook

3. **Verifica las variables de entorno:**
   - Netlify → Environment variables
   - Asegúrate de que las 3 variables estén configuradas

## 💰 Costos con Twilio

### Sandbox (Pruebas):
- **GRATIS** - Ilimitado para pruebas
- Solo funciona con números que se unan al sandbox

### Producción (Cuando estés lista):
- **Conversaciones iniciadas por clientes**: Gratis (primeras 1,000/mes)
- **Mensajes que tú envías**: ~$0.005 USD cada uno
- **Para 200 conversaciones/mes**: ~$1-2 USD/mes

## 🎓 Paso 8: Pasar a Producción (Opcional)

Cuando estés lista para usar un número real:

1. **Solicitar número de WhatsApp Business:**
   - Twilio → Messaging → WhatsApp senders
   - Request to enable WhatsApp

2. **Verificación de Meta:**
   - Necesitarás verificar tu negocio con Meta
   - Proceso toma 1-3 días

3. **Actualizar webhook:**
   - Mismo proceso pero con tu número real

## 📊 Monitoreo

### Ver Mensajes Enviados/Recibidos:

1. **En Twilio Console:**
   - Messaging → Logs → Messages
   - Verás cada mensaje con su estado

2. **En Netlify:**
   - Functions → whatsapp-webhook → Logs
   - Verás cada mensaje procesado

## 🔧 Mantenimiento

### Actualizar Información del Chatbot:

1. Edita `vanessa-studio-backend/lib/faqs.js`
2. Commit y push
3. Netlify despliega automáticamente

## 🆘 Solución de Problemas

### Error: "Missing Twilio credentials"
- Verifica que las 3 variables estén en Netlify
- Redeploy el sitio

### Error: "Twilio API error: 401"
- Verifica que el Account SID y Auth Token sean correctos
- Asegúrate de que no tengan espacios

### El bot no responde:
- Verifica que el webhook esté configurado en Twilio
- Revisa los logs en Netlify Functions
- Asegúrate de haber enviado `join <codigo>` al sandbox

### Error: "Unable to create record"
- Verifica que el número de WhatsApp esté en formato correcto
- Debe incluir el código de país: `+14155238886`

## 📞 Soporte

- **Documentación Twilio**: https://www.twilio.com/docs/whatsapp
- **Soporte Twilio**: https://support.twilio.com/
- **Logs de Netlify**: Para debugging técnico

## ✅ Checklist Final

- [ ] Cuenta creada en Twilio con Gmail
- [ ] WhatsApp conectado al sandbox
- [ ] Credenciales obtenidas (SID, Token, Número)
- [ ] Variables de entorno configuradas en Netlify
- [ ] Webhook configurado en Twilio
- [ ] Cambios desplegados en Netlify
- [ ] Chatbot probado y funcionando

¡Listo! Tu chatbot de WhatsApp está configurado con Twilio. 🎉
