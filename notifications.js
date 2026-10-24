'use strict';
(() => {
const db = window.entrelinhasSupabase;
const button = document.getElementById('notificationButton');
const panel = document.getElementById('notificationPanel');
const wrap = button?.closest('details.notification-wrap');
const list = document.getElementById('notificationList');
const badge = document.getElementById('notificationBadge');
const markAll = document.getElementById('markAllNotifications');
const closeButton = document.getElementById('notificationClose');
let currentUser = null;
let channel = null;
let items = [];
let loading = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function initials(name = 'Leitor') {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
function relativeTime(value) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(date);
}
function render() {
  const unread = items.filter(item => !item.read_at).length;
  if (badge) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.hidden = unread === 0; }
  if (button) {
    button.setAttribute('aria-label', unread ? `Notificações, ${unread} não lidas` : 'Abrir notificações');
    button.setAttribute('aria-expanded', String(Boolean(wrap && wrap.open)));
  }
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="notification-empty"><span class="material-symbols-outlined">notifications_off</span><p>Você ainda não tem notificações.</p><small>Quando alguém seguir você ou um amigo adicionar um livro, a novidade aparece aqui.</small></div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const name = item.actor?.full_name || 'Uma pessoa';
    const copy = item.kind === 'new_book'
      ? (item.book?.title ? `adicionou “${escapeHtml(item.book.title)}” à estante.` : 'adicionou um livro à estante.')
      : item.kind === 'message' ? 'enviou uma mensagem.' : 'começou a seguir você.';
    const content = `<span class="notification-avatar">${escapeHtml(initials(name))}</span><span class="notification-copy"><span><strong>${escapeHtml(name)}</strong> ${copy}</span><small>${relativeTime(item.created_at)}</small></span>${item.read_at ? '' : '<span class="notification-unread-dot" aria-label="Não lida"></span>'}`;
    if (!item.actor_id) return `<article class="notification-item ${item.read_at ? '' : 'unread'}">${content}</article>`;
    const target = item.kind === 'message' ? `mensagens.html?id=${encodeURIComponent(item.actor_id)}` : `perfil.html?id=${encodeURIComponent(item.actor_id)}${item.kind === 'new_book' && item.book_id ? `#livro-${encodeURIComponent(item.book_id)}` : ''}`;
    return `<a class="notification-item ${item.read_at ? '' : 'unread'}" href="${target}" data-notification="${escapeHtml(item.id)}">${content}</a>`;
  }).join('');
}
function showError(message) {
  if (list) list.innerHTML = `<div class="notification-empty"><span class="material-symbols-outlined">error</span><p>${escapeHtml(message)}</p></div>`;
}
function withTimeout(request, milliseconds = 12000) {
  let timer;
  return Promise.race([
    Promise.resolve(request),
    new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('O Supabase demorou para responder. Confira sua conexão e tente novamente.')), milliseconds); })
  ]).finally(() => window.clearTimeout(timer));
}
async function queryNotifications(includeBookId) {
  const columns = includeBookId ? 'id,actor_id,kind,book_id,created_at,read_at' : 'id,actor_id,kind,created_at,read_at';
  return db.from('notifications').select(columns).eq('recipient_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
}
async function loadNotifications() {
  if (!currentUser || loading) return;
  loading = true;
  try {
    let result = await withTimeout(queryNotifications(true));
    let hasBookId = true;
    if (result.error && /book_id/i.test(result.error.message || '') && /(column|schema cache|does not exist|could not find)/i.test(result.error.message || '')) { result = await withTimeout(queryNotifications(false)); hasBookId = false; }
    if (result.error) { showError(`Não foi possível carregar: ${result.error.message}`); return; }
    const rows = (result.data || []).map(row => hasBookId ? row : { ...row, book_id: null });
    const actorIds = [...new Set(rows.map(item => item.actor_id).filter(Boolean))];
    const bookIds = [...new Set(rows.map(item => item.book_id).filter(Boolean))];
    const [actorsResult, booksResult] = await withTimeout(Promise.all([
      actorIds.length ? db.from('profiles').select('id,full_name,username').in('id', actorIds) : Promise.resolve({ data: [] }),
      bookIds.length ? db.from('books').select('id,title').in('id', bookIds) : Promise.resolve({ data: [] })
    ]));
    const actorsById = new Map((actorsResult.data || []).map(actor => [actor.id, actor]));
    const booksById = new Map((booksResult.data || []).map(book => [book.id, book]));
    items = rows.map(item => ({ ...item, actor: actorsById.get(item.actor_id) || null, book: booksById.get(item.book_id) || null }));
    render();
  } catch (error) {
    showError(`Ocorreu um erro ao carregar: ${error.message || 'falha de conexão'}`);
  } finally { loading = false; }
}
async function markRead(id) {
  const item = items.find(notification => String(notification.id) === String(id));
  if (!item || item.read_at || !currentUser) return;
  const readAt = new Date().toISOString();
  const { error } = await db.from('notifications').update({ read_at: readAt }).eq('id', id).eq('recipient_id', currentUser.id);
  if (!error) { item.read_at = readAt; render(); }
}
async function markAllRead() {
  if (!currentUser || !items.some(item => !item.read_at)) return;
  const readAt = new Date().toISOString();
  const { error } = await db.from('notifications').update({ read_at: readAt }).eq('recipient_id', currentUser.id).is('read_at', null);
  if (!error) { items.forEach(item => { if (!item.read_at) item.read_at = readAt; }); render(); }
}
function closePanel() {
  if (!wrap || !button) return;
  wrap.open = false;
  button.setAttribute('aria-expanded', 'false');
}
if (wrap && button) {
  wrap.addEventListener('toggle', () => {
    button.setAttribute('aria-expanded', String(wrap.open));
    if (wrap.open) loadNotifications();
  });
}
if (closeButton) closeButton.addEventListener('click', closePanel);
if (markAll) markAll.addEventListener('click', markAllRead);
if (list) list.addEventListener('click', async event => {
  const link = event.target.closest('[data-notification]');
  if (!link) return;
  event.preventDefault();
  const destination = link.href;
  await markRead(link.dataset.notification);
  location.href = destination;
});
document.addEventListener('click', event => { if (wrap && !event.target.closest('.notification-wrap')) closePanel(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
(async function initNotifications() {
  if (!db) { showError('A conexão com o Supabase não foi carregada.'); return; }
  const { data, error } = await db.auth.getSession();
  if (error || !data.session) { showError('Não consegui confirmar sua sessão. Saia e entre novamente na conta.'); return; }
  currentUser = data.session.user;
  await loadNotifications();
  window.setInterval(() => { if (document.visibilityState === 'visible') loadNotifications(); }, 20000);
  channel = db.channel(`notifications-${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUser.id}` }, loadNotifications)
    .subscribe();
})();
window.addEventListener('beforeunload', () => { if (channel && db) db.removeChannel(channel); });



})();


