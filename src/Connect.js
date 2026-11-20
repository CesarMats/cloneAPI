import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.");
  }
  return supabase;
}

export async function obtenerVideos() {
  const { data, error } = await requireSupabase()
    .from("videos")
    .select("id, titulo, descripcion, video_url, thumbnail_url, created_at, canal_id, channels(id, name, handle)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const videos = data ?? [];
  if (videos.length === 0) return [];

  const { data: likes, error: likesError } = await requireSupabase()
    .from("likes")
    .select("video_id, user_id")
    .in("video_id", videos.map((video) => video.id));
  if (likesError) throw likesError;

  const { data: { user }, error: userError } = await requireSupabase().auth.getUser();
  if (userError) throw userError;
  const likesByVideo = new Map();
  for (const like of likes ?? []) {
    const current = likesByVideo.get(like.video_id) ?? { count: 0, liked: false };
    current.count += 1;
    current.liked ||= like.user_id === user?.id;
    likesByVideo.set(like.video_id, current);
  }

  return videos.map((video) => ({
    ...video,
    channel: video.channels,
    likeCount: likesByVideo.get(video.id)?.count ?? 0,
    liked: likesByVideo.get(video.id)?.liked ?? false,
  }));
}

export async function crearCanal({ name, handle, description }) {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Inicia sesión para crear un canal.");

  const { data, error } = await client
    .from("channels")
    .insert({ user_id: user.id, name, handle: handle.toLowerCase(), description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function obtenerCanalUsuario() {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await client
    .from("channels")
    .select("id, name, handle")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function guardarVideo({ titulo, descripcion, videoUrl, thumbnailUrl, publicId, canalId }) {
  const { data, error } = await requireSupabase()
    .from("videos")
    .insert({
      titulo,
      descripcion,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      cloudinary_public_id: publicId,
      canal_id: canalId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function alternarLike(videoId, liked) {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Inicia sesión para dar like.");

  const result = liked
    ? await client.from("likes").delete().eq("video_id", videoId).eq("user_id", user.id)
    : await client.from("likes").insert({ video_id: videoId, user_id: user.id });
  if (result.error) throw result.error;
}

export async function obtenerComentarios(videoId) {
  const { data, error } = await requireSupabase()
    .from("comments")
    .select("id, content, created_at, user_id")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function crearComentario(videoId, content) {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Inicia sesión para comentar.");

  const { data, error } = await client
    .from("comments")
    .insert({ video_id: videoId, user_id: user.id, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}
