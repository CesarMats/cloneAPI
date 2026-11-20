import {
  crearCanal,
  crearComentario,
  isSupabaseConfigured,
  obtenerCanalUsuario,
  obtenerComentarios,
  obtenerVideos,
  alternarLike,
  supabase,
} from "./Connect.js";
import { subirVideo } from "./cargarVideo.js";

const $ = (selector) => document.querySelector(selector);
const grid = $("#video-grid");
const toast = $("#toast");
const authModal = $("#auth-modal");
const channelModal = $("#channel-modal");
const uploadModal = $("#upload-modal");
const playerModal = $("#player-modal");
let videos = [];
let currentVideo = null;
let channel = null;
let searchTerm = "";
let activeFilter = "all";
let authMode = "login";
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function formatDate(value) {
  const date = new Date(value);
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const days = Math.floor(elapsed / 86400000);
  if (days < 1) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
  return `hace ${Math.floor(days / 365)} años`;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createVideoCard(video) {
  const card = makeElement("article", "video-card");
  const thumbnail = makeElement("button", "thumbnail");
  thumbnail.type = "button";
  thumbnail.setAttribute("aria-label", `Reproducir ${video.titulo}`);
  if (video.thumbnail_url) {
    thumbnail.style.backgroundImage = `linear-gradient(180deg, transparent 48%, rgba(0,0,0,.32)), url("${video.thumbnail_url}")`;
    thumbnail.classList.add("has-thumbnail");
  }
  const play = makeElement("span", "thumbnail-play", "▶");
  const time = makeElement("span", "thumbnail-time", "PLAY");
  thumbnail.append(play, time);
  thumbnail.addEventListener("click", () => openVideo(video));

  const info = makeElement("div", "video-info");
  const channelIcon = makeElement("span", "video-avatar", (video.channel?.name ?? "V").slice(0, 1).toUpperCase());
  const copy = makeElement("div", "video-copy");
  const title = makeElement("button", "video-title", video.titulo);
  title.type = "button";
  title.addEventListener("click", () => openVideo(video));
  const meta = makeElement("p", "video-meta", `${video.channel?.name ?? "Canal"} · ${formatDate(video.created_at)}`);
  const submeta = makeElement("p", "video-submeta", `♡ ${video.likeCount} likes`);
  copy.append(title, meta, submeta);
  const like = makeElement("button", `card-like${video.liked ? " is-liked" : ""}`, video.liked ? "♥" : "♡");
  like.type = "button";
  like.title = "Dar like";
  like.setAttribute("aria-label", "Dar like");
  like.addEventListener("click", async () => {
    if (!supabase) return showToast("Conecta Supabase para dar like.");
    try {
      await alternarLike(video.id, video.liked);
      video.liked = !video.liked;
      video.likeCount += video.liked ? 1 : -1;
      renderVideos();
    } catch (error) {
      showToast(error.message || "No se pudo actualizar el like.");
    }
  });
  info.append(channelIcon, copy, like);
  card.append(thumbnail, info);
  return card;
}

function renderVideos() {
  grid.replaceChildren();
  const filtered = videos.filter((video) => {
    const matchesText = `${video.titulo} ${video.descripcion ?? ""} ${video.channel?.name ?? ""}`
      .toLocaleLowerCase("es").includes(searchTerm.toLocaleLowerCase("es"));
    const matchesRecent = activeFilter !== "recent" || Date.now() - new Date(video.created_at).getTime() < 30 * 86400000;
    return matchesText && matchesRecent;
  });
  $("#result-count").textContent = filtered.length ? `${filtered.length} ${filtered.length === 1 ? "VIDEO" : "VIDEOS"}` : "";
  const empty = $("#empty-state");
  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    $("#empty-title").textContent = searchTerm
      ? "No encontramos ese video."
      : isSupabaseConfigured ? "El siguiente video podría ser tuyo." : "Tu comunidad empieza aquí.";
    $("#empty-copy").textContent = searchTerm
      ? "Prueba con otras palabras o explora más tarde."
      : isSupabaseConfigured ? "Inicia sesión y comparte algo con la comunidad." : "Configura Supabase y Cloudinary para publicar y descubrir videos.";
    $("#empty-action").textContent = searchTerm ? "Limpiar búsqueda" : isSupabaseConfigured ? "Comenzar" : "Ver configuración";
    grid.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.classList.remove("hidden");
  filtered.forEach((video) => grid.append(createVideoCard(video)));
}

async function loadVideos() {
  if (!isSupabaseConfigured) {
    $("#setup-notice").textContent = "Para conectar tu comunidad, configura Supabase y Cloudinary en el archivo .env (consulta README.md).";
    $("#setup-notice").classList.remove("hidden");
    $("#empty-title").textContent = "Tu comunidad empieza aquí.";
    $("#empty-copy").textContent = "Configura Supabase y Cloudinary para publicar y descubrir videos.";
    $("#empty-action").textContent = "Ver configuración";
    $("#empty-action").onclick = () => showToast("Sigue los pasos de configuración en README.md.");
    renderVideos();
    return;
  }
  try {
    videos = await obtenerVideos();
    renderVideos();
  } catch (error) {
    $("#setup-notice").textContent = `No se pudieron cargar los videos: ${error.message}`;
    $("#setup-notice").classList.remove("hidden");
    $("#empty-title").textContent = "No pudimos conectar con Supabase.";
    $("#empty-copy").textContent = "Verifica la configuración y las tablas para volver a cargar el contenido.";
    renderVideos();
  }
}

function updateAuthUI(user) {
  $("#auth-open").classList.toggle("hidden", Boolean(user));
  $("#account-menu").classList.toggle("hidden", !user);
  $("#account-email").textContent = user?.email ?? "";
  $("#account-avatar").textContent = (user?.email?.[0] ?? "V").toUpperCase();
}

function openAuth() {
  setMessage($("#auth-message"), "");
  authModal.showModal();
}

function openVideo(video) {
  currentVideo = video;
  $("#player-video").src = video.video_url;
  $("#player-title").textContent = video.titulo;
  $("#player-channel").textContent = video.channel?.name ?? "CANAL";
  $("#player-description").textContent = video.descripcion || "Sin descripción.";
  updatePlayerLike();
  $("#comment-list").replaceChildren();
  $("#comment-message").textContent = "";
  playerModal.showModal();
  loadComments(video.id);
}

function updatePlayerLike() {
  $("#player-like").classList.toggle("is-liked", Boolean(currentVideo?.liked));
  $("#player-like").innerHTML = `${currentVideo?.liked ? "♥" : "♡"} <span id="player-like-count">${currentVideo?.likeCount ?? 0}</span>`;
}

async function loadComments(videoId) {
  if (!supabase) return;
  try {
    const comments = await obtenerComentarios(videoId);
    $("#comment-count").textContent = `(${comments.length})`;
    const list = $("#comment-list");
    list.replaceChildren();
    if (!comments.length) {
      list.append(makeElement("p", "no-comments", "Todavía no hay comentarios. Inicia la conversación."));
      return;
    }
    comments.forEach((comment) => {
      const item = makeElement("article", "comment");
      item.append(
        makeElement("span", "comment-avatar", "V"),
        makeElement("div", "comment-copy"),
      );
      const copy = item.lastElementChild;
      copy.append(
        makeElement("p", "comment-meta", `Comunidad · ${formatDate(comment.created_at)}`),
        makeElement("p", "comment-text", comment.content),
      );
      list.append(item);
    });
  } catch (error) {
    setMessage($("#comment-message"), error.message || "No se pudieron cargar los comentarios.", true);
  }
}

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  searchTerm = $("#search-input").value.trim();
  $("#feed-title").firstChild.textContent = searchTerm ? "Resultados de búsqueda " : "Videos para ti ";
  renderVideos();
});
$("#search-input").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim();
  if (!searchTerm) {
    $("#feed-title").firstChild.textContent = "Videos para ti ";
    renderVideos();
  }
});
document.querySelectorAll(".nav-link[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".nav-link[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    $("#feed-title").firstChild.textContent = activeFilter === "recent" ? "Lo más reciente " : "Videos para ti ";
    renderVideos();
  });
});
$("#auth-open").addEventListener("click", openAuth);
async function beginUpload() {
  if (!supabase) return showToast("Configura Supabase y Cloudinary para subir videos.");
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!session) return openAuth();
  } catch (error) {
    return showToast(error.message || "No se pudo verificar tu sesión.");
  }
  openUpload();
}
$("#upload-open").addEventListener("click", beginUpload);
$("#welcome-upload").addEventListener("click", beginUpload);
$("#channel-open").addEventListener("click", async () => {
  if (!supabase) return showToast("Configura Supabase para crear tu canal.");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return openAuth();
    channel = await obtenerCanalUsuario();
    if (channel) return showToast(`Tu canal @${channel.handle} ya está listo.`);
    setMessage($("#channel-message"), "");
    channelModal.showModal();
  } catch (error) {
    showToast(error.message || "No se pudo revisar tu canal.");
  }
});
$("#empty-action").addEventListener("click", () => {
  if (searchTerm) {
    searchTerm = "";
    $("#search-input").value = "";
    renderVideos();
  } else if (isSupabaseConfigured) beginUpload();
  else showToast("Sigue los pasos de configuración en README.md.");
});

function openUpload() {
  if (!channel) {
    obtenerCanalUsuario().then((userChannel) => {
      channel = userChannel;
      if (channel) uploadModal.showModal();
      else {
        setMessage($("#channel-message"), "");
        channelModal.showModal();
        showToast("Primero crea tu canal para publicar.");
      }
    }).catch((error) => showToast(error.message || "No se pudo revisar tu canal."));
    return;
  }
  uploadModal.showModal();
}

$("#auth-switch").addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  $("#auth-title").textContent = authMode === "login" ? "Qué bueno verte." : "Encuentra tu lugar.";
  $("#auth-copy").textContent = authMode === "login" ? "Inicia sesión para compartir y descubrir." : "Crea una cuenta para empezar a compartir.";
  $("#auth-submit").textContent = authMode === "login" ? "Iniciar sesión" : "Crear cuenta";
  $("#auth-switch").innerHTML = authMode === "login"
    ? "¿No tienes cuenta? <strong>Regístrate</strong>"
    : "¿Ya tienes cuenta? <strong>Inicia sesión</strong>";
  $("#auth-form").elements.password.autocomplete = authMode === "login" ? "current-password" : "new-password";
  setMessage($("#auth-message"), "");
});

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return setMessage($("#auth-message"), "Configura Supabase en .env para continuar.", true);
  const button = $("#auth-submit");
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  button.disabled = true;
  setMessage($("#auth-message"), authMode === "login" ? "Iniciando sesión…" : "Creando cuenta…");
  try {
    const credentials = { email: form.get("email"), password: form.get("password") };
    const response = authMode === "login"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    if (response.error) throw response.error;
    if (authMode === "signup" && !response.data.session) {
      setMessage($("#auth-message"), "Cuenta creada. Revisa tu correo para confirmar el registro.");
    } else {
      authModal.close();
      formElement.reset();
      showToast(authMode === "login" ? "Sesión iniciada. ¡Qué bueno verte!" : "Tu cuenta está lista.");
    }
  } catch (error) {
    setMessage($("#auth-message"), error.message || "No se pudo completar la autenticación.", true);
  } finally {
    button.disabled = false;
  }
});

$("#logout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) return showToast(error.message);
  channel = null;
  showToast("Sesión cerrada.");
});

$("#channel-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const button = formElement.querySelector('button[type="submit"]');
  const values = new FormData(formElement);
  button.disabled = true;
  setMessage($("#channel-message"), "Creando tu canal…");
  try {
    channel = await crearCanal({
      name: values.get("name").trim(),
      handle: values.get("handle").trim(),
      description: values.get("description").trim(),
    });
    channelModal.close();
    formElement.reset();
    showToast(`¡Canal @${channel.handle} creado!`);
  } catch (error) {
    setMessage($("#channel-message"), error.message || "No se pudo crear el canal.", true);
  } finally {
    button.disabled = false;
  }
});

$("#upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const button = formElement.querySelector('button[type="submit"]');
  const values = new FormData(formElement);
  const file = values.get("video");
  button.disabled = true;
  setMessage($("#upload-message"), "Preparando la subida…");
  try {
    if (!channel) channel = await obtenerCanalUsuario();
    if (!channel) throw new Error("Primero crea tu canal.");
    setMessage($("#upload-message"), "Subiendo video directamente a Cloudinary…");
    await subirVideo(file, values.get("title"), values.get("description"), channel.id);
    uploadModal.close();
    formElement.reset();
    showToast("¡Video publicado con éxito!");
    await loadVideos();
  } catch (error) {
    setMessage($("#upload-message"), error.message || "No se pudo subir el video.", true);
  } finally {
    button.disabled = false;
  }
});

$("#player-like").addEventListener("click", async () => {
  if (!currentVideo || !supabase) return showToast("Conecta Supabase para dar like.");
  try {
    await alternarLike(currentVideo.id, currentVideo.liked);
    currentVideo.liked = !currentVideo.liked;
    currentVideo.likeCount += currentVideo.liked ? 1 : -1;
    updatePlayerLike();
    renderVideos();
  } catch (error) {
    showToast(error.message || "No se pudo actualizar el like.");
  }
});

$("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentVideo || !supabase) return showToast("Conecta Supabase para comentar.");
  const input = event.currentTarget.elements.content;
  try {
    await crearComentario(currentVideo.id, input.value.trim());
    input.value = "";
    setMessage($("#comment-message"), "");
    await loadComments(currentVideo.id);
  } catch (error) {
    setMessage($("#comment-message"), error.message || "No se pudo publicar el comentario.", true);
  }
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelectorAll("dialog.modal").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});
playerModal.addEventListener("close", () => {
  $("#player-video").pause();
  $("#player-video").removeAttribute("src");
});

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session?.user ?? null);
    setTimeout(() => {
      loadVideos();
      if (session?.user) {
        obtenerCanalUsuario().then((userChannel) => { channel = userChannel; })
          .catch((error) => showToast(error.message || "No se pudo cargar tu canal."));
      } else channel = null;
    }, 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) showToast(error.message);
    updateAuthUI(data.session?.user ?? null);
    if (data.session?.user) {
      obtenerCanalUsuario().then((userChannel) => { channel = userChannel; })
        .catch((loadError) => showToast(loadError.message || "No se pudo cargar tu canal."));
    }
  });
} else {
  $("#setup-notice").classList.remove("hidden");
  $("#setup-notice").textContent = "Agrega las variables de Supabase y Cloudinary indicadas en .env.example para activar las funciones.";
}

loadVideos();
