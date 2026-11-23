# Vidrio

Clon sencillo de una plataforma de videos: catálogo y búsqueda, registro e inicio de sesión, creación de canal, subida directa a Cloudinary, likes y comentarios. Está construido con Vite, JavaScript y Supabase.

## Requisitos

- Node.js 20.19+ o 22.12+
- Proyecto de Supabase
- Cuenta de Cloudinary con un **unsigned upload preset** habilitado para videos

## Instalación

1. Instala las dependencias con `npm install`. Si trabajas desde una memoria/disco que no permite enlaces simbólicos, usa `npm install --no-bin-links`.
2. Copia `.env.example` a `.env` y completa:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: URL y clave pública/anon de Supabase. No uses la `service_role`.
   - `VITE_CLOUDINARY_CLOUD_NAME` y `VITE_CLOUDINARY_UPLOAD_PRESET`: nombre de Cloudinary y unsigned preset.
3. En Supabase, abre **SQL Editor**, ejecuta el contenido de `sql/schema.sql` y habilita Email en **Authentication → Providers**.
4. En Cloudinary, configura el preset unsigned para aceptar únicamente videos, restringe los formatos permitidos y establece el límite de tamaño del lado de Cloudinary (100 MB). La validación del frontend no sustituye los límites del preset.
5. Desde la carpeta del proyecto, inicia la aplicación con `npm run dev` y abre la dirección local que muestra Vite. No abras `index.html` con doble clic ni uses un servidor estático: Vite es quien carga `.env` y resuelve Supabase.

## Flujo de subida

El navegador carga el archivo directamente a `https://api.cloudinary.com/.../video/upload`. Tras recibir la `secure_url`, guarda la URL y los metadatos en Supabase. La clave pública de Supabase es apropiada para el navegador porque las operaciones quedan restringidas por RLS; nunca pongas claves secretas o `service_role` en variables `VITE_*`.

La aplicación requiere las variables de configuración y las tablas anteriores para activar las funciones persistentes. Supabase Auth puede solicitar confirmar el correo según la configuración del proyecto.
