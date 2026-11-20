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
let totalVideos = 0;
let videoOffset = 0;
let feedError = "";
let loadingVideos = false;
let videoRequest = 0;

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
  if (Number.isNaN(date.getTime())) return "";
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
    if (like.disabled) return;
    like.disabled = true;
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        openAuth();
        return showToast("Inicia sesión para dar like.");
      }
      await alternarLike(video.id, video.liked);
      video.liked = !video.liked;
      video.likeCount += video.liked ? 1 : -1;
      renderVideos();
    } catch (error) {
      showToast(error.message || "No se pudo actualizar el like.");
    } finally {
      like.disabled = false;
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
    if (feedError) {
      $("#empty-title").textContent = "No pudimos cargar los videos.";
      $("#empty-copy").textContent = feedError;
      $("#empty-action").textContent = "Reintentar";
    } else {
      $("#empty-title").textContent = searchTerm
        ? "No encontramos ese video."
        : isSupabaseConfigured ? "El siguiente video podría ser tuyo." : "Tu comunidad empieza aquí.";
      $("#empty-copy").textContent = searchTerm
        ? "Prueba con otras palabras o explora más tarde."
        : isSupabaseConfigured ? "Inicia sesión y comparte algo con la comunidad." : "Configura Supabase y Cloudinary para publicar y descubrir videos.";
      $("#empty-action").textContent = searchTerm ? "Limpiar búsqueda" : isSupabaseConfigured ? "Comenzar" : "Ver configuración";
    }
    grid.classList.add("hidden");
  } else {
    empty.classList.add("hidden");
    grid.classList.remove("hidden");
    filtered.forEach((video) => grid.append(createVideoCard(video)));
  }
  $("#feed-actions").classList.toggle("hidden", videoOffset >= totalVideos || totalVideos === 0);
}

function reloadVideos() {
  videos = [];
  videoOffset = 0;
  totalVideos = 0;
  feedError = "";
  return loadVideos();
}

async function loadVideos({ append = false } = {}) {
  if (loadingVideos && append) return;
  if (!isSupabaseConfigured) {
    $("#setup-notice").textContent = "Para conectar tu comunidad, configura Supabase y Cloudinary en el archivo .env (consulta README.md).";
    $("#setup-notice").classList.remove("hidden");
    feedError = "";
    $("#loading-state").classList.add("hidden");
    renderVideos();
    return;
  }
  loadingVideos = true;
  const request = ++videoRequest;
  if (!append) {
    $("#loading-state").classList.remove("hidden");
    $("#empty-state").classList.add("hidden");
    grid.replaceChildren();
    $("#feed-actions").classList.add("hidden");
  } else {
    $("#load-more").disabled = true;
    $("#load-more").textContent = "Cargando…";
  }
  try {
    const result = await obtenerVideos(append ? videoOffset : 0, searchTerm);
    if (request !== videoRequest) return;
    videos = append ? [...videos, ...result.videos] : result.videos;
    totalVideos = result.total;
    videoOffset = videos.length;
    feedError = "";
    $("#setup-notice").classList.add("hidden");
    renderVideos();
  } catch (error) {
    if (request !== videoRequest) return;
    feedError = error.message || "Revisa tu conexión a Supabase e inténtalo de nuevo.";
    if (append) showToast(`No se pudieron cargar más videos: ${feedError}`);
    else renderVideos();
  } finally {
    if (request === videoRequest) {
      loadingVideos = false;
      $("#loading-state").classList.add("hidden");
      $("#load-more").disabled = false;
      $("#load-more").textContent = "Cargar más videos";
      renderVideos();
    }
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
  const player = $("#player-video");
  player.src = video.video_url;
  $("#player-title").textContent = video.titulo;
  $("#player-channel").textContent = video.channel?.name ?? "CANAL";
  $("#player-description").textContent = video.descripcion || "Sin descripción.";
  updatePlayerLike();
  $("#comment-list").replaceChildren();
  $("#comment-message").textContent = "";
  playerModal.showModal();
  player.play().catch(() => showToast("Presiona reproducir para iniciar el video."));
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
  reloadVideos();
});
$("#search-input").addEventListener("input", (event) => {
  if (!event.target.value.trim() && searchTerm) {
    searchTerm = "";
    $("#feed-title").firstChild.textContent = "Videos para ti ";
    reloadVideos();
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
$("#load-more").addEventListener("click", () => loadVideos({ append: true }));
$("#channel-open").addEventListener("click", async () => {
  if (!supabase) return showToast("Configura Supabase para crear tu canal.");
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
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
  if (feedError) {
    reloadVideos();
  } else if (searchTerm) {
    searchTerm = "";
    $("#search-input").value = "";
    $("#feed-title").firstChild.textContent = "Videos para ti ";
    reloadVideos();
  } else if (isSupabaseConfigured) beginUpload();
  else showToast("Sigue los pasos de configuración en README.md.");
});

async function openUpload() {
  try {
    if (!channel) channel = await obtenerCanalUsuario();
    if (channel) {
      setMessage($("#upload-message"), "");
      uploadModal.showModal();
      return;
    }
    setMessage($("#channel-message"), "");
    channelModal.showModal();
    showToast("Primero crea tu canal para publicar.");
  } catch (error) {
    showToast(error.message || "No se pudo revisar tu canal.");
  }
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
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    channel = null;
    showToast("Sesión cerrada.");
  } catch (error) {
    showToast(error.message || "No se pudo cerrar la sesión.");
  }
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
    if (!file || file.size === 0) throw new Error("Selecciona un archivo de video válido.");
    if (!channel) channel = await obtenerCanalUsuario();
    if (!channel) throw new Error("Primero crea tu canal.");
    setMessage($("#upload-message"), "Subiendo video directamente a Cloudinary…");
    try {
      await subirVideo(file, values.get("title"), values.get("description"), channel.id);
    } catch (error) {
      if (error.cloudinaryUploaded) {
        throw new Error(`El video llegó a Cloudinary, pero no se pudo registrar en Supabase: ${error.message}`);
      }
      throw error;
    }
    uploadModal.close();
    formElement.reset();
    showToast("¡Video publicado con éxito!");
    await reloadVideos();
  } catch (error) {
    setMessage($("#upload-message"), error.message || "No se pudo subir el video.", true);
  } finally {
    button.disabled = false;
  }
});

$("#player-like").addEventListener("click", async () => {
  if (!currentVideo || !supabase) return showToast("Conecta Supabase para dar like.");
  const button = $("#player-like");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      openAuth();
      return showToast("Inicia sesión para dar like.");
    }
    await alternarLike(currentVideo.id, currentVideo.liked);
    currentVideo.liked = !currentVideo.liked;
    currentVideo.likeCount += currentVideo.liked ? 1 : -1;
    updatePlayerLike();
    renderVideos();
  } catch (error) {
    showToast(error.message || "No se pudo actualizar el like.");
  } finally {
    button.disabled = false;
  }
});

$("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentVideo || !supabase) return showToast("Conecta Supabase para comentar.");
  const formElement = event.currentTarget;
  const input = formElement.elements.content;
  const button = formElement.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      openAuth();
      return showToast("Inicia sesión para comentar.");
    }
    await crearComentario(currentVideo.id, input.value.trim());
    input.value = "";
    setMessage($("#comment-message"), "");
    await loadComments(currentVideo.id);
  } catch (error) {
    setMessage($("#comment-message"), error.message || "No se pudo publicar el comentario.", true);
  } finally {
    button.disabled = false;
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

let activeUserId;
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session?.user ?? null);
    if (event === "INITIAL_SESSION") {
      activeUserId = session?.user?.id ?? null;
      return;
    }
    const userId = session?.user?.id ?? null;
    if (userId === activeUserId) return;
    activeUserId = userId;
    setTimeout(() => {
      reloadVideos();
      if (session?.user) {
        obtenerCanalUsuario().then((userChannel) => { channel = userChannel; })
          .catch((error) => showToast(error.message || "No se pudo cargar tu canal."));
      } else channel = null;
    }, 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      showToast(error.message || "No se pudo restaurar la sesión.");
      return;
    }
    updateAuthUI(data.session?.user ?? null);
    activeUserId = data.session?.user?.id ?? null;
    if (data.session?.user) {
      obtenerCanalUsuario().then((userChannel) => { channel = userChannel; })
        .catch((loadError) => showToast(loadError.message || "No se pudo cargar tu canal."));
    }
  }).catch((error) => showToast(error.message || "No se pudo restaurar la sesión."));
} else {
  $("#setup-notice").classList.remove("hidden");
  $("#setup-notice").textContent = "Agrega las variables de Supabase y Cloudinary indicadas en .env.example para activar las funciones.";
}

void loadVideos();
