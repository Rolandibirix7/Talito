# TA'LITO

Sistema web para restaurantes: el cliente pide desde su celular, cocina ve las órdenes, caja cobra y la administración revisa métricas.

**Tecnología:** React (Vite) + Node.js/Express + PostgreSQL. Se despliega como **un solo servicio** (Express sirve la API y el frontend ya compilado).

## Pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| `/menu` | Cliente (sin sesión) | Ve el menú, arma su pedido, indica nombre y mesa, envía a cocina o llama al mesero |
| `/cocina` | Cocina · Admin | Órdenes nuevas y en preparación (se actualiza sola cada 5 s). Botón **Historial** (deshacer/restaurar) y enlace al **Menú** |
| `/caja` | Caja · Admin | Pedidos por mesa (con sección **Listas para servir** para reclamos), edita cantidades e indicaciones, agrega platillos, cobra y atiende llamadas |
| `/admin` | Admin | Métricas de venta con gráficas |
| `/admin/menu` | Admin | Crear categorías; crear, editar y eliminar platillos (con foto) y marcarlos como no disponibles |
| `/admin/usuarios` | Admin | Crear cuentas con rol: cocina, caja o administrador |
| `/login` | — | Inicio de sesión; cada rol entra a su pantalla |

### Roles

| Rol | Puede entrar a |
|---|---|
| `cocina` | `/cocina` |
| `caja` | `/caja` (y puede devolver a cocina un pedido «listo» por un reclamo) |
| `admin` | todo |

El primer administrador sale de `ADMIN_EMAIL` / `ADMIN_PASSWORD`; desde **Usuarios y roles** se crean las cuentas de cocina y caja. En local (no en producción) se crean además `cocina@talito.test` / `cocina1234` y `caja@talito.test` / `caja1234`.

### Fotos e indicaciones

- Las fotos de los platillos se suben desde **Admin → Menú**. El navegador las reduce (máx. 800 px) y se guardan **en la base de datos**, no en archivos (el disco de Render es temporal).
- El cliente puede escribir indicaciones por platillo («Sin cebolla», «Salsa aparte»). Cocina y caja las ven resaltadas en rojo.

## Probarlo en tu computadora

Necesitas **Node.js 20.19 o superior** (recomendado 22). No hace falta instalar ninguna base de datos: sin configuración usa una embebida (PGlite) que se guarda en `.data/`.

```bash
npm run setup          # instala dependencias del servidor y del cliente
npm run build          # compila el frontend
npm start              # abre http://localhost:3000
```

Datos de acceso locales: **admin@talito.test** / **admin1234**

Para desarrollar con recarga automática, usa dos terminales:

```bash
npm run dev:server     # API en http://localhost:3000
npm run dev:client     # interfaz en http://localhost:5173  (usa esta)
```

Para borrar los datos locales y empezar de cero: elimina la carpeta `.data/`.

## Publicarlo gratis en la nube (Neon + Render)

La base de datos va en **Neon** y la aplicación en **Render**. Tiempo estimado: 15 minutos.

### 1. Crear la base de datos en Neon
1. Entra a <https://neon.com> y crea una cuenta (con GitHub o correo).
2. Crea un proyecto (nombre: `talito`; elige la región más cercana, por ejemplo *US East*).
3. En el panel del proyecto pulsa **Connect** y copia la **connection string** completa. Se ve así:
   `postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

No hace falta crear tablas: el servidor las crea solo al arrancar.

### 2. Subir el código a GitHub
```bash
git init
git add .
git commit -m "TA'LITO"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/talito.git
git push -u origin main
```
(Crea antes el repositorio vacío en GitHub. El archivo `.gitignore` ya excluye `node_modules`, `.env` y `.data`.)

### 3. Crear el servicio en Render
1. Entra a <https://render.com> e inicia sesión con GitHub.
2. **New → Blueprint** y elige tu repositorio (usa el archivo `render.yaml`).
   *Alternativa manual:* **New → Web Service**, runtime **Node**, plan **Free**, *Build command* `npm install && npm run build`, *Start command* `npm start`.
3. Completa las variables de entorno:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la connection string de Neon |
| `ADMIN_EMAIL` | tu correo de administrador |
| `ADMIN_PASSWORD` | una contraseña fuerte (mín. 8 caracteres) |
| `JWT_SECRET` | la genera Render (si lo haces manual: una cadena larga aleatoria) |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |

4. Pulsa **Deploy**. Al terminar, Render te da una URL tipo `https://talito.onrender.com`.

### 4. Comprobar
- `https://TU-URL/api/salud` debe responder `{"ok":true,"db":"PostgreSQL"}`.
- `https://TU-URL/menu` muestra el menú; `https://TU-URL/login` te deja entrar con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> La primera vez se cargan un menú de ejemplo y pedidos de demostración (para que las gráficas tengan datos). Para no cargar los pedidos de demostración, añade la variable `SEED_DEMO=false` **antes** del primer arranque.

## Límites del plan gratuito (importante para la demo)

Comprobados en octubre-noviembre de 2026; los planes gratuitos cambian, así que revísalos antes de la presentación.

- **Render se duerme** tras 15 minutos sin visitas y tarda cerca de **un minuto** en despertar. **Abre la página 2 o 3 minutos antes de presentar.** Un servicio de monitoreo que visite `/api/salud` cada 5-10 minutos puede mantenerlo despierto; el plan incluye 750 horas al mes por cuenta, suficiente para un servicio encendido todo el mes.
- **Neon suspende** el cómputo tras 5 minutos sin uso y despierta en la siguiente consulta (la primera petición puede tardar unos segundos más). Tiene 1 GB de almacenamiento y no vence.
- El sistema de archivos de Render es temporal: por eso **nada se guarda en archivos**, todo está en la base de datos.
- No uses la base de datos gratuita de Render: se elimina a los 30 días.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | En la nube | Conexión a PostgreSQL. Vacía = base embebida local |
| `JWT_SECRET` | En producción | Firma las sesiones |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | En producción (primer arranque) | Primer administrador. Solo se usan si aún no hay usuarios |
| `SEED_DEMO` | No | `false` = no cargar pedidos de demostración |
| `AUTO_INIT` | No | `false` = no crear tablas ni datos al arrancar |
| `PORT` | No | Render lo define solo |

En local puedes guardarlas en un archivo `.env` (hay un modelo en `.env.example`).

## Modelo de datos

![Modelo de datos](docs/modelo-de-datos.png)

- `detalle_pedido` guarda el **nombre y el precio del momento**: si luego cambian el menú, el historial y las métricas no se alteran.
- Estados de un pedido: `nueva → preparando → lista → cobrada`. Cocina puede **restaurar** una orden `lista` a `preparando`; una `cobrada` ya no se restaura.
- `detalle_pedido.nota` guarda la indicación del platillo; `pedidos.listo_en` alimenta el historial de cocina (24 h); `platillos.foto` guarda la imagen.
- El código fuente del diagrama está en `docs/modelo-de-datos.mmd` y el esquema SQL en `server/schema.sql`.

## Estructura

```
server/
  index.js        arranque: base de datos, tablas, datos iniciales, servidor
  app.js          configuración de Express y seguridad
  db.js           PostgreSQL (pg) o PGlite según DATABASE_URL
  schema.sql      tablas
  seed.js         datos iniciales
  auth.js         login con cookie de sesión (JWT)
  routes/         publico.js · operacion.js (cocina y caja) · admin.js
client/
  src/pages/      una pantalla por archivo
  src/styles.css  estilos
render.yaml       configuración para Render
```

## API

| Método y ruta | Sesión | Función |
|---|---|---|
| `GET /api/menu` · `GET /api/platillos/:id/foto` | No | Menú disponible por categoría (con URL de foto) y la foto |
| `POST /api/pedidos` | No | Crea un pedido (los precios los toma el servidor) |
| `POST /api/llamadas` | No | Llama al mesero |
| `POST /api/auth/login` · `/logout` · `GET /api/auth/me` | — | Sesión |
| `GET /api/cocina/pedidos` · `GET /api/cocina/historial` | Cocina · Admin | Órdenes y historial de 24 h |
| `PATCH /api/pedidos/:id/estado` | Cocina · Caja · Admin | Cambia el estado; caja solo puede devolver a cocina un pedido listo |
| `GET /api/caja` · `PUT\|POST /api/pedidos/:id/items` · `POST /api/pedidos/:id/cobrar` · `PATCH /api/llamadas/:id` | Caja · Admin | Caja |
| `GET /api/admin/metricas` · `/platillos` · `/categorias` · `/usuarios` y su `POST`/`PUT` (platillos también `DELETE`); `PUT\|DELETE /api/admin/platillos/:id/foto` | Admin | Administración |

## Seguridad incluida

- Contraseñas con **bcrypt**; sesión en cookie `httpOnly` (no accesible desde JavaScript), `secure` en producción, caducidad de 12 h.
- Límite de intentos de inicio de sesión y de pedidos por minuto.
- El **precio siempre se calcula en el servidor**, nunca se confía en el navegador.
- Consultas parametrizadas (sin inyección SQL), validación de todos los datos de entrada y cabeceras de seguridad (Helmet, CSP).
- Las rutas que modifican datos solo aceptan JSON (protección básica contra CSRF).
- En producción el servidor **se niega a crear un administrador con contraseña conocida**.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El sitio tarda un minuto en abrir | Render estaba dormido; es normal en el plan gratuito |
| El *deploy* falla con «Define la variable ADMIN_PASSWORD» | Falta `ADMIN_EMAIL` / `ADMIN_PASSWORD` en las variables de Render |
| «No se pudo preparar la base de datos» | Revisa `DATABASE_URL`: copia la cadena completa de Neon. Si el error menciona SSL o *channel binding*, borra `&channel_binding=require` del final |
| Entras al login pero vuelve a pedirlo | La cookie solo viaja por HTTPS en producción: usa la URL `https://` de Render |
| Cambié `ADMIN_PASSWORD` pero no entra | Solo se usa al crear el primer administrador. Para cambiarla, entra con el administrador existente y crea otro en *Administradores* |
| Quiero reiniciar los datos en la nube | En Neon: *SQL Editor* → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` y reinicia el servicio en Render |
