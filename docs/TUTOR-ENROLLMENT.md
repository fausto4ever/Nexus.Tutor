# Nexus.Tutor — Enrolamiento y verificación de tutores

## Objetivo

Permitir que un tutor previamente registrado por la escuela active Nexus.Tutor desde su casa, sin que la escuela tenga que enviar correos, ligas individuales o credenciales manualmente.

La escuela continúa siendo la autoridad que crea la relación **Tutor ↔ Alumno**. Nexus.Tutor no permite que un usuario cree o modifique por sí mismo esa relación durante el enrolamiento.

## Principio de seguridad

El enrolamiento combina dos comprobaciones:

1. **Posesión del teléfono registrado por la escuela**, mediante OTP.
2. **Conocimiento de información escolar de uno de los hijos asociados al tutor**, después de validar el OTP.

Los datos escolares constituyen una validación adicional de la relación familiar; el factor principal de posesión es el OTP enviado exclusivamente al teléfono previamente registrado por la escuela.

## Flujo propuesto

### 1. Alta previa en la escuela

La escuela registra al tutor en su padrón con, al menos:

- Tutor.
- Número celular.
- Relación Tutor ↔ Alumno(s).
- Información escolar vigente de cada alumno: nombre, nivel, grado y grupo.
- Instancia/colegio al que pertenece.

El número celular almacenado por la escuela es la fuente autoritativa. El tutor no puede sustituirlo durante el enrolamiento.

### 2. Inicio de activación

El tutor abre Nexus.Tutor desde la liga pública o instala la PWA y selecciona **Activar mi cuenta**.

Introduce su número celular.

Nexus no debe revelar en este punto nombres de tutores, alumnos ni confirmar públicamente qué relaciones existen.

### 3. OTP al teléfono registrado

Si el número puede participar en un enrolamiento, Nexus genera un OTP de vida corta y lo envía al **mismo teléfono registrado por la escuela**.

Canales previstos:

- `WHATSAPP`
- `SMS`

El canal de transporte no cambia la identidad del factor: la prueba consiste en demostrar posesión del teléfono que la escuela registró.

Las respuestas previas a la validación deben ser genéricas para evitar enumeración de tutores o alumnos.

### 4. Validación del OTP

El tutor introduce el código recibido.

Solo después de validar correctamente el OTP se permite avanzar a la comprobación escolar. Todavía no se debe entregar una sesión Tutor completa ni revelar automáticamente la lista de hijos.

### 5. Comprobación escolar

El tutor proporciona información correspondiente a **uno** de sus hijos:

- **Colegio**, utilizando el nombre común/corto. Ejemplo: `Ausbel`, sin exigir `Instituto Ausbel`.
- **Nombre** del alumno. No se exige necesariamente el nombre completo con todos los apellidos.
- **Nivel**.
- **Grado**.
- **Grupo**.

Ejemplo conceptual:

```text
Colegio: Ausbel
Nombre: Santiago
Nivel: Primaria
Grado: 3
Grupo: A
```

La combinación debe corresponder a un alumno que esté relacionado con el tutor cuyo teléfono acaba de verificarse.

### 6. Normalización

La comparación debe tolerar diferencias razonables de captura sin debilitar la relación que se está verificando. En particular:

- El colegio puede utilizar un nombre corto/canónico (`Ausbel`) aunque administrativamente esté registrado como `Instituto Ausbel`.
- El nombre del alumno no debe obligar al tutor a recordar exactamente todos los apellidos o su formato administrativo.
- Nivel, grado y grupo deben compararse contra los identificadores/catálogos vigentes de la instancia, no contra valores inventados por el cliente.

La estrategia exacta de normalización de nombres se definirá antes de implementar el contrato para evitar coincidencias excesivamente permisivas.

### 7. Enrolamiento exitoso

Si ambas comprobaciones son correctas:

```text
OTP válido
    +
Alumno informado pertenece al tutor verificado
    +
Colegio / nivel / grado / grupo coinciden
    ↓
ENROLLMENT_VERIFIED
```

Nexus puede entonces crear/enrolar el dispositivo o sesión del tutor y recuperar **todos los alumnos autorizados** asociados a ese tutor. No es necesario que el tutor capture los datos de cada hijo.

A partir de este punto la UI sí puede mostrar los hijos y demás información autorizada.

## Reglas de seguridad

- Nunca crear una relación Tutor ↔ Alumno a partir de datos proporcionados por el usuario.
- Nunca enviar el OTP a un número diferente del previamente registrado por la escuela.
- No permitir cambiar el número registrado dentro del flujo de enrolamiento.
- No revelar alumnos asociados antes de completar la verificación.
- No indicar públicamente si falló específicamente el teléfono, el nombre del alumno, el nivel, grado o grupo; utilizar errores genéricos donde corresponda.
- OTP de un solo uso, con expiración y límite de intentos/reenvíos.
- Registrar auditoría de intentos de enrolamiento sin almacenar el OTP en texto plano.
- Un cambio de teléfono debe resolverse mediante un flujo administrativo o de recuperación separado.

## Recuperación y acceso posterior

El proceso descrito corresponde principalmente al **primer enrolamiento** o a una recuperación que requiera volver a comprobar identidad.

Una vez enrolado correctamente un dispositivo, Nexus.Tutor podrá utilizar posteriormente mecanismos más cómodos de acceso (por ejemplo, sesión persistente o passkey/seguridad del dispositivo), que se definirán por separado.

## Fuera de alcance de esta definición

Por ahora no se define:

- Proveedor específico de WhatsApp o SMS.
- Contratos/endpoints del Gateway.
- Persistencia de dispositivos enrolados.
- Passkeys/biometría.
- Recuperación por correo electrónico.
- Política exacta de expiración y rate limiting del OTP.
- Algoritmo definitivo de normalización del nombre del alumno.

Estos puntos deben diseñarse antes de implementar el enrolamiento productivo.
