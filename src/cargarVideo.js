import { guardarVideo } from "./Connect.js";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function subirVideo(archivoVideo, titulo, descripcion, canalId) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Configura VITE_CLOUDINARY_CLOUD_NAME y VITE_CLOUDINARY_UPLOAD_PRESET en .env.");
  }
  if (!archivoVideo || archivoVideo.size === 0 || !ALLOWED_TYPES.has(archivoVideo.type)) {
    throw new Error("Selecciona un archivo MP4, WebM o MOV.");
  }
  if (archivoVideo.size > MAX_FILE_SIZE) {
    throw new Error("El video supera el límite de 100 MB.");
  }
  if (!titulo.trim()) throw new Error("Escribe un título para el video.");
  if (!canalId) throw new Error("Primero crea tu canal.");

  const formData = new FormData();
  formData.append("file", archivoVideo);
  formData.append("upload_preset", UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/video/upload`,
    { method: "POST", body: formData },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error?.message ?? "Cloudinary no pudo subir el video.");
  }
  if (!result?.secure_url || !result.public_id) {
    throw new Error("Cloudinary respondió sin la URL segura del video.");
  }

  const thumbnailUrl = result.thumbnail_url
    ?? result.eager?.[0]?.secure_url
    ?? result.secure_url
      .replace("/video/upload/", "/video/upload/so_0,w_640,h_360,c_fill,q_auto,f_jpg/")
      .replace(/\.(mp4|webm|mov)$/i, ".jpg");

  try {
    return await guardarVideo({
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      videoUrl: result.secure_url,
      thumbnailUrl,
      publicId: result.public_id,
      canalId,
    });
  } catch (error) {
    const saveError = new Error(error.message || "No se pudieron guardar los datos del video.");
    saveError.cloudinaryUploaded = true;
    throw saveError;
  }
}
