# Guía: Contratar WhatsApp Business en Twilio para Producción

## 📋 Resumen

Para usar WhatsApp en producción sin las limitaciones del sandbox, necesitas:
1. Solicitar un número de WhatsApp Business en Twilio
2. Verificar tu negocio con Meta (Facebook)
3. Aprobar plantillas de mensajes
4. Actualizar configuración en Netlify

---

## 💰 Costos Estimados

| Concepto | Costo Aproximado |
|----------|------------------|
| Número de WhatsApp | **Gratis** (incluido en cuenta Twilio) |
| Mensajes salientes | **~$0.005 USD** por mensaje |
| Mensajes entrantes | **Gratis** |
| Costo mensual estimado | **$5-20 USD** (dependiendo de volumen) |

> **Ejemplo:** Si envías 100 recordatorios al mes = ~$0.50 USD

---

## 🚀 Paso 1: Solicitar Número de WhatsApp Business

### 1.1 Acceder a Twilio Console

1. Ve a: https://console.twilio.com
2. Inicia sesión con tu cuenta

### 1.2 Solicitar WhatsApp Sender

1. En el menú lateral, ve a: **Messaging** → **Try it out** → **Send a WhatsApp message**
2. O directo: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
3. Haz clic en **"Request to enable your Twilio number for WhatsApp"**

### 1.3 Completar Solicitud

Twilio te pedirá:
- **Nombre del negocio:** Vanessa Nails Studio
- **Sitio web:** https://vanessastudioback.netlify.app (o tu dominio)
- **Descripción del negocio:** Estudio de uñas profesional
- **Caso de uso:** Recordatorios de citas y notificaciones a clientes
- **Volumen estimado:** Ej: 100-500 mensajes/mes

---

## 📱 Paso 2: Verificar Negocio con Meta (Facebook)

### 2.1 Crear Facebook Business Manager

1. Ve a: https://business.facebook.com
2. Crea una cuenta de negocio si no tienes
3. Completa la información del negocio:
   - Nombre: Vanessa Nails Studio
   - Dirección
   - Teléfono de contacto

### 2.2 Verificar el Negocio

Meta puede pedir:
- **Documento de identidad** del dueño
- **Comprobante de domicilio** del negocio
- **Licencia comercial** (si aplica)

> ⏱️ La verificación puede tomar **1-5 días hábiles**

### 2.3 Conectar con Twilio

1. En Twilio Console, sigue el proceso de conexión con Meta
2. Autoriza a Twilio a usar tu cuenta de Facebook Business
3. Selecciona el número de WhatsApp que quieres usar

---

## ✅ Paso 3: Aprobar Plantillas de Mensajes

WhatsApp requiere que **pre-apruebes** las plantillas de mensajes que enviarás.

### 3.1 Crear Plantilla de Recordatorio Día 20

1. En Twilio Console, ve a: **Messaging** → **Content Templates**
2. Haz clic en **"Create new template"**
3. Completa:

**Nombre de plantilla:** `recordatorio_mantenimiento_20`

**Categoría:** `UTILITY` (para recordatorios)

**Idioma:** `Spanish (es)`

**Contenido:**
```
🤖 Este es un mensaje automático

💅 ¡Hola {{1}}!

Han pasado {{2}} días desde tu última visita. ¡Tus uñas te están esperando! ✨

🎯 Mantenimiento ideal: cada 21 días
⚠️ Máximo: 30 días

{{3}}

📱 Agenda tu cita a nuestro WhatsApp de siempre aquí:
{{4}}

- Vanessa Nails Studio
```

**Variables:**
- `{{1}}` = Nombre del cliente
- `{{2}}` = Días desde última visita
- `{{3}}` = Información de fidelidad (opcional)
- `{{4}}` = Link de WhatsApp

### 3.2 Crear Plantilla de Recordatorio Día 28

**Nombre:** `recordatorio_mantenimiento_28`

**Contenido:**
```
🤖 Este es un mensaje automático

💅 ¡Hola {{1}}!

Ya van {{2}} días desde tu última visita. Nos encantaría volver a verte pronto 💗

⚠️ Después de 30 días debemos retirar y reconstruir para cuidar la salud de tus uñas.

{{3}}

📱 Agenda tu cita a nuestro WhatsApp de siempre aquí:
{{4}}

- Vanessa Nails Studio
```

### 3.3 Enviar para Aprobación

1. Revisa las plantillas
2. Haz clic en **"Submit for approval"**
3. Meta revisará en **24-48 horas**

---

## 🔧 Paso 4: Actualizar Configuración en Netlify

Una vez aprobado todo:

### 4.1 Obtener Nuevo Número

1. En Twilio Console, ve a **Phone Numbers** → **Manage** → **Active numbers**
2. Copia tu número de WhatsApp Business (ej: `+14155238886`)

### 4.2 Actualizar Variables de Entorno

1. Ve a Netlify: https://app.netlify.com
2. Selecciona tu sitio: **vanessastudioback**
3. Ve a **Site settings** → **Environment variables**
4. Actualiza:

```
TWILIO_WHATSAPP_NUMBER = +14155238886
```

(Reemplaza con tu número real)

### 4.3 Redesplegar

El cambio de variable requiere redespliegue:
1. Ve a **Deploys**
2. Haz clic en **Trigger deploy** → **Clear cache and deploy site**

---

## 📝 Paso 5: Actualizar Código para Usar Plantillas

Necesitarás modificar el backend para usar las plantillas aprobadas en lugar de mensajes dinámicos.

### Cambios en `send-whatsapp-reminder.js`:

En lugar de enviar el mensaje como texto plano, usarás la API de plantillas de Twilio:

```javascript
// En lugar de:
body: new URLSearchParams({
    From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    To: to,
    Body: message
})

// Usarás:
body: new URLSearchParams({
    From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    To: to,
    ContentSid: 'HX...',  // ID de la plantilla aprobada
    ContentVariables: JSON.stringify({
        "1": clientName,
        "2": diffDays.toString(),
        "3": loyaltyInfo,
        "4": whatsappLink
    })
})
```

---

## ✅ Paso 6: Probar en Producción

### 6.1 Prueba Inicial

1. Ejecuta `testWhatsAppReminder20()` en Google Apps Script
2. Verifica que el mensaje llegue con el formato correcto
3. Prueba el link de WhatsApp

### 6.2 Monitorear

1. Revisa logs en Netlify Functions
2. Verifica en Twilio Console: **Monitor** → **Logs** → **Messaging**
3. Confirma que los mensajes se envían correctamente

---

## 🚨 Solución de Problemas

### Error: "Template not approved"

**Causa:** La plantilla aún no está aprobada por Meta

**Solución:** Espera la aprobación (24-48 horas)

### Error: "Business verification pending"

**Causa:** Tu negocio aún no está verificado

**Solución:** Completa el proceso de verificación con Meta

### Mensajes no llegan

**Verifica:**
1. ✅ Plantillas aprobadas
2. ✅ Negocio verificado
3. ✅ Número actualizado en Netlify
4. ✅ Variables de entorno correctas

---

## 💡 Alternativa: Usar Número Propio

Si prefieres usar tu número de WhatsApp actual (+56991744464):

### Opción: WhatsApp Business API

1. Solicita acceso a WhatsApp Business API
2. Conecta tu número existente
3. **Importante:** Una vez conectado a la API, no podrás usar WhatsApp normal en ese número

**Recomendación:** Usa un número nuevo para la API y mantén tu número actual para atención personal.

---

## 📊 Resumen de Tiempos

| Paso | Tiempo Estimado |
|------|-----------------|
| Solicitar número | 5 minutos |
| Verificación de negocio | 1-5 días |
| Crear plantillas | 30 minutos |
| Aprobación de plantillas | 24-48 horas |
| Actualizar código | 1-2 horas |
| **TOTAL** | **3-7 días** |

---

## 🎯 Próximos Pasos

1. **Ahora:** Solicita el número de WhatsApp Business en Twilio
2. **Mientras esperas:** Prepara documentos para verificación de negocio
3. **Cuando esté aprobado:** Crea las plantillas de mensajes
4. **Finalmente:** Actualiza el código y despliega

---

## 📞 Soporte

- **Twilio Support:** https://support.twilio.com
- **WhatsApp Business API Docs:** https://www.twilio.com/docs/whatsapp
- **Meta Business Help:** https://business.facebook.com/help

---

¿Necesitas ayuda con algún paso específico? Puedo guiarte en el proceso.
