# Guía de Configuración: Recordatorios por WhatsApp

## 🎯 ¿Qué hace esto?

Envía recordatorios de mantenimiento automáticos por **WhatsApp Y Email** a tus clientes cuando han pasado 20 o 28 días desde su última visita.

---

## ✅ Paso 1: Desplegar el Backend

### 1.1 Desplegar a Netlify

```powershell
cd vanessa-studio-backend
git add .
git commit -m "feat: add WhatsApp reminders function"
git push
```

Netlify desplegará automáticamente la nueva función `send-whatsapp-reminder`.

### 1.2 Verificar Despliegue

Ve a: https://vanessastudioback.netlify.app/.netlify/functions/send-whatsapp-reminder

Deberías ver un error 405 (Method not allowed) - esto es correcto, significa que la función está activa.

---

## 📱 Paso 2: Activar el Sandbox de Twilio

### 2.1 Obtener el Código de Activación

1. Ve a tu [Twilio Console](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
2. Verás un número de WhatsApp (ej: `+1 415 523 8886`)
3. Y un código de activación (ej: `join [código]`)

### 2.2 Activar tu Número

Desde tu WhatsApp personal:
1. Agrega el número de Twilio a tus contactos
2. Envía el mensaje: `join [código]` (usa el código que te dio Twilio)
3. Recibirás una confirmación de Twilio

> **Importante:** Solo los números que hayan enviado este código podrán recibir mensajes.

---

## 🧪 Paso 3: Probar el Sistema

### 3.1 Actualizar Google Apps Script

1. Abre tu [Google Apps Script](https://script.google.com)
2. Abre el proyecto de Vanessa Nails Studio
3. **Copia y pega** el contenido actualizado de `Code.gs`
4. Guarda el proyecto (Ctrl+S)

### 3.2 Ejecutar Prueba de WhatsApp

1. En Google Apps Script, busca la función `testWhatsAppReminder20`
2. **Cambia el número de teléfono** a tu número (línea 554):
   ```javascript
   const testPhone = "+56991744464"; // ⚠️ CAMBIA ESTO
   ```
3. Ejecuta la función
4. Revisa los logs (Ver → Registros)
5. Deberías recibir un WhatsApp en unos segundos

### 3.3 Funciones de Prueba Disponibles

- `testWhatsAppReminder20()` - Recordatorio día 20
- `testWhatsAppReminder28()` - Recordatorio día 28 (urgente)
- `testWhatsAppWithReward()` - Con recompensa disponible
- `testWhatsAppWithoutLoyalty()` - Sin datos de fidelidad

---

## 🚀 Paso 4: Activar Recordatorios Automáticos

Una vez que las pruebas funcionen:

### 4.1 Verificar Datos en Hoja de Cálculo

Tu hoja "Reservas" debe tener estas columnas:
- **Columna A:** ID
- **Columna B:** Nombre
- **Columna C:** Email
- **Columna D:** Teléfono (formato: +56991234567)
- **Columna E:** Servicio
- **Columna F:** Fecha Inicio
- **Columna G:** Fecha Fin

### 4.2 Configurar Trigger Automático

1. En Google Apps Script, ve a **Activadores** (ícono de reloj ⏰)
2. Haz clic en **+ Agregar activador**
3. Configura:
   - Función: `sendMaintenanceReminders`
   - Tipo de evento: **Controlado por tiempo**
   - Tipo de activador: **Temporizador diario**
   - Hora: **9:00 AM - 10:00 AM** (o tu preferencia)
4. Guarda

---

## 📊 Cómo Funciona

### Flujo de Recordatorios

1. **Cada día** (a la hora configurada):
   - El script revisa todas las reservas
   - Identifica clientes con última visita hace 20+ o 28+ días
   - Envía recordatorio por **Email** primero
   - Luego intenta enviar por **WhatsApp** (si hay teléfono)

2. **Si el cliente tiene teléfono:**
   - ✅ Recibe Email + WhatsApp
   
3. **Si el cliente NO tiene teléfono:**
   - ✅ Recibe solo Email

4. **Si el WhatsApp falla:**
   - ✅ El Email ya fue enviado (no se pierde el recordatorio)

### Formato del Mensaje WhatsApp

```
💅 ¡Hola María!

Han pasado 20 días desde tu última visita. ¡Tus uñas te están esperando! ✨

🎯 Mantenimiento ideal: cada 21 días
⚠️ Máximo: 30 días

✨ Llevas 3 de 6 sellos completados. ¡Sigue así!

¿Agendamos tu cita?
Responde a este mensaje para reservar 💖

- Vanessa Nails Studio
```

---

## ⚠️ Limitaciones del Sandbox

- Solo funciona con números que activaron el sandbox
- Los mensajes incluyen un prefijo del sandbox
- Límite de ~100 mensajes por día

### Para Producción (Sin Limitaciones)

1. Solicitar número de WhatsApp Business en Twilio (~$1-2 USD/mes)
2. Verificar negocio con Meta/Facebook
3. Aprobar plantillas de mensajes
4. Actualizar `TWILIO_WHATSAPP_NUMBER` en Netlify

---

## 🔍 Solución de Problemas

### Error: "Missing Twilio credentials"

Verifica que en Netlify tengas configuradas:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`

### No recibo WhatsApp

1. ¿Activaste el sandbox? (enviaste el código `join`)
2. ¿El número está en formato correcto? (+56991234567)
3. Revisa los logs en Google Apps Script
4. Revisa los logs en Netlify Functions

### Recibo Email pero no WhatsApp

Esto es normal si:
- El cliente no tiene teléfono en la hoja
- El número no activó el sandbox
- Hay un error en el formato del número

El sistema está diseñado para que **siempre se envíe el email**, incluso si WhatsApp falla.

---

## 📝 Logs y Monitoreo

### Ver Logs en Google Apps Script

1. Ejecuta `sendMaintenanceReminders()`
2. Ve a **Ver → Registros**
3. Verás:
   - ✅ Email enviado a [email]
   - ✅ WhatsApp enviado a [phone]
   - ⚠️ No se pudo enviar WhatsApp (si falla)
   - ℹ️ No hay teléfono (si no tiene)

### Ver Logs en Netlify

1. Ve a [Netlify Functions](https://app.netlify.com)
2. Selecciona tu sitio
3. Functions → send-whatsapp-reminder
4. Revisa los logs de ejecución

---

## 🎉 ¡Listo!

Ahora tus clientes recibirán recordatorios automáticos por WhatsApp y Email. El sistema es robusto y seguirá funcionando incluso si algunos clientes no tienen WhatsApp activado.
