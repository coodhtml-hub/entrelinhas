const db = window.entrelinhasSupabase;
const elements = {
  ownProfile: document.getElementById('ownProfile'),
  friendProfile: document.getElementById('friendProfile'),
  friendActions: document.getElementById('friendActions'),
  followButton: document.getElementById('followButton'),
  followIcon: document.getElementById('followIcon'),
  followLabel: document.getElementById('followLabel'),
  messageButton: document.getElementById('messageButton'),
  actionNote: document.getElementById('friendActionNote'),
  friendBooks: document.getElementById('friendBooks'),
  toast: document.getElementById('toast'),
  profilePhotoInput: document.getElementById('profilePhotoInput'),
  photoCropFrame: document.getElementById('photoCropFrame'),
  photoCropPreview: document.getElementById('photoCropPreview'),
  photoPlaceholder: document.getElementById('photoPlaceholder'),
  cropControls: document.getElementById('cropControls'),
  cropZoom: document.getElementById('cropZoom'),
  cropHorizontal: document.getElementById('cropHorizontal'),
  cropVertical: document.getElementById('cropVertical'),
  removeProfilePhoto: document.getElementById('removeProfilePhoto'),
  photoMessage: document.getElementById('photoMessage')
};

let currentUser = null;
let viewerProfile = null;
let viewedProfile = null;
let viewedId = null;
let followsViewed = false;
let viewedFollowsViewer = false;
let croppedSourceImage = null;
let croppedSourceUrl = '';
let photoChanged = false;
let removePhoto = false;
let savedPhotoPath = null;

function initials(name = 'Leitor') {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function setAvatar(element, name, imageUrl = '') {
  if (!element) return;
  element.replaceChildren();
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'avatar-photo';
    image.src = imageUrl;
    image.alt = '';
    image.onerror = () => setAvatar(element, name);
    element.append(image);
    return;
  }
  element.textContent = initials(name);
}

async function signedPhotoUrl(path) {
  if (!path) return '';
  const { data, error } = await db.storage.from('profile-photos').createSignedUrl(path, 3600);
  return error ? '' : (data?.signedUrl || '');
}

function setViewerIdentity(profile, imageUrl = '') {
  if (!profile) return;
  const name = profile.full_name || 'Leitor';
  const handle = `@${profile.username || 'leitor'}`;
  document.getElementById('nameTop').textContent = name;
  document.getElementById('usernameTop').textContent = handle;
  setAvatar(document.getElementById('avatarTop'), name, imageUrl);
  document.getElementById('nameBottom').textContent = name;
  setAvatar(document.getElementById('avatarBottom'), name, imageUrl);
}

async function loadProfile() {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError || !sessionData.session) {
    location.replace('acesso.html');
    return;
  }

  currentUser = sessionData.session.user;
  viewedId = new URLSearchParams(location.search).get('id') || currentUser.id;
  const isOwnProfile = viewedId === currentUser.id;
  const selection = 'id,username,full_name,bio,profile_photo_path';
  const [viewerResult, viewedResult] = await Promise.all([
    db.from('profiles').select(selection).eq('id', currentUser.id).maybeSingle(),
    isOwnProfile
      ? Promise.resolve({ data: null, error: null })
      : db.from('profiles').select(selection).eq('id', viewedId).maybeSingle()
  ]);

  viewerProfile = viewerResult.data;
  viewedProfile = isOwnProfile ? viewerProfile : viewedResult.data;
  const viewerPhotoUrl = await signedPhotoUrl(viewerProfile?.profile_photo_path);
  setViewerIdentity(viewerProfile, viewerPhotoUrl);
  elements.ownProfile.hidden = !isOwnProfile;
  elements.friendProfile.hidden = isOwnProfile;
  elements.friendActions.hidden = isOwnProfile;

  if (viewerResult.error || (!isOwnProfile && viewedResult.error) || !viewedProfile) {
    document.getElementById('profileHeading').textContent = 'Perfil indisponível';
    document.getElementById('profileEyebrow').textContent = 'PERFIL DA COMUNIDADE';
    return;
  }

  const viewedPhotoUrl = isOwnProfile ? viewerPhotoUrl : await signedPhotoUrl(viewedProfile.profile_photo_path);
  renderProfile(viewedProfile, isOwnProfile, viewedPhotoUrl);
  if (isOwnProfile) {
    fillOwnProfile(viewedProfile, viewedPhotoUrl);
    return;
  }

  await loadFollowState();
}

function renderProfile(profile, isOwnProfile, photoUrl = '') {
  const name = profile.full_name || 'Leitor';
  document.title = `${name} — Entrelinhas`;
  document.getElementById('profileHeading').textContent = name;
  document.getElementById('profileHandle').textContent = `@${profile.username || 'leitor'}`;
  document.getElementById('breadcrumbName').textContent = isOwnProfile ? 'Meu perfil' : name;
  setAvatar(document.getElementById('profileAvatar'), name, photoUrl);
  document.getElementById('profileEyebrow').textContent = isOwnProfile ? 'SEU CANTINHO' : 'PERFIL DA COMUNIDADE';
  elements.removeProfilePhoto.hidden = !isOwnProfile || !profile.profile_photo_path;
}

function fillOwnProfile(profile, photoUrl = "") {
  document.getElementById('fullName').value = profile.full_name || '';
  document.getElementById('username').value = profile.username || '';
  document.getElementById('bio').value = profile.bio || '';
  savedPhotoPath = profile.profile_photo_path || null;
  if (photoUrl) {
    elements.photoCropPreview.src = photoUrl;
    elements.photoCropPreview.style.width = '100%';
    elements.photoCropPreview.style.height = '100%';
    elements.photoCropPreview.style.left = '0';
    elements.photoCropPreview.style.top = '0';
    elements.photoCropPreview.style.objectFit = 'cover';
    elements.photoCropPreview.hidden = false;
    elements.photoPlaceholder.hidden = true;
  }
  elements.photoMessage.textContent = savedPhotoPath
    ? 'Foto salva. Para trocar o enquadramento, escolha a imagem novamente.'
    : 'A foto aparece no seu perfil e na navegação da sua conta.';
}

function updateCropPreview() {
  if (!croppedSourceImage) return;
  const frameWidth = elements.photoCropFrame.clientWidth;
  const frameHeight = elements.photoCropFrame.clientHeight;
  const zoom = Number(elements.cropZoom.value) / 100;
  const scale = Math.max(frameWidth / croppedSourceImage.naturalWidth, frameHeight / croppedSourceImage.naturalHeight) * zoom;
  const width = croppedSourceImage.naturalWidth * scale;
  const height = croppedSourceImage.naturalHeight * scale;
  const x = Number(elements.cropHorizontal.value) / 100;
  const y = Number(elements.cropVertical.value) / 100;
  elements.photoCropPreview.style.width = `${width}px`;
  elements.photoCropPreview.style.height = `${height}px`;
  elements.photoCropPreview.style.left = `${-(width - frameWidth) * x}px`;
  elements.photoCropPreview.style.top = `${-(height - frameHeight) * y}px`;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const outputScale = Math.max(512 / croppedSourceImage.naturalWidth, 512 / croppedSourceImage.naturalHeight) * zoom;
  const outputWidth = croppedSourceImage.naturalWidth * outputScale;
  const outputHeight = croppedSourceImage.naturalHeight * outputScale;
  context.drawImage(
    croppedSourceImage,
    -(outputWidth - 512) * x,
    -(outputHeight - 512) * y,
    outputWidth,
    outputHeight
  );
  setAvatar(document.getElementById('profileAvatar'), document.getElementById('fullName').value || 'Leitor', canvas.toDataURL('image/jpeg', 0.88));
}

function loadPhotoFile(file) {
  if (!file) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    elements.photoMessage.textContent = 'Escolha uma foto JPG, PNG ou WebP.';
    elements.photoMessage.classList.add('error');
    elements.profilePhotoInput.value = '';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    elements.photoMessage.textContent = 'A imagem precisa ter até 8 MB.';
    elements.photoMessage.classList.add('error');
    elements.profilePhotoInput.value = '';
    return;
  }

  if (croppedSourceUrl) URL.revokeObjectURL(croppedSourceUrl);
  croppedSourceUrl = URL.createObjectURL(file);
  croppedSourceImage = new Image();
  croppedSourceImage.onload = () => {
    photoChanged = true;
    removePhoto = false;
    elements.photoCropPreview.style.width = '';
    elements.photoCropPreview.style.height = '';
    elements.photoCropPreview.style.left = '';
    elements.photoCropPreview.style.top = '';
    elements.photoCropPreview.style.objectFit = '';
    elements.photoCropPreview.src = croppedSourceUrl;
    elements.photoCropPreview.hidden = false;
    elements.photoPlaceholder.hidden = true;
    elements.cropControls.hidden = false;
    elements.removeProfilePhoto.hidden = false;
    elements.cropZoom.value = '100';
    elements.cropHorizontal.value = '50';
    elements.cropVertical.value = '50';
    elements.photoMessage.classList.remove('error');
    elements.photoMessage.textContent = 'Ajuste o zoom e arraste os controles para enquadrar a foto.';
    updateCropPreview();
  };
  croppedSourceImage.onerror = () => {
    elements.photoMessage.textContent = 'Não consegui abrir essa imagem. Tente outra foto.';
    elements.photoMessage.classList.add('error');
  };
  croppedSourceImage.src = croppedSourceUrl;
}

function createCroppedPhotoBlob() {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const zoom = Number(elements.cropZoom.value) / 100;
    const scale = Math.max(512 / croppedSourceImage.naturalWidth, 512 / croppedSourceImage.naturalHeight) * zoom;
    const width = croppedSourceImage.naturalWidth * scale;
    const height = croppedSourceImage.naturalHeight * scale;
    const x = Number(elements.cropHorizontal.value) / 100;
    const y = Number(elements.cropVertical.value) / 100;
    context.drawImage(croppedSourceImage, -(width - 512) * x, -(height - 512) * y, width, height);
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não consegui preparar a foto.')), 'image/jpeg', 0.88);
  });
}

async function uploadCroppedPhoto() {
  if (!photoChanged || !croppedSourceImage) return savedPhotoPath;
  const blob = await createCroppedPhotoBlob();
  const path = `${currentUser.id}/avatar.jpg`;
  const { error } = await db.storage.from('profile-photos').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600'
  });
  if (error) throw error;
  return path;
}

async function loadFollowState() {
  const [followingResult, followerResult] = await Promise.all([
    db.from('follows').select('follower_id').eq('follower_id', currentUser.id).eq('followed_id', viewedId),
    db.from('follows').select('follower_id').eq('follower_id', viewedId).eq('followed_id', currentUser.id)
  ]);
  if (followingResult.error || followerResult.error) {
    elements.actionNote.textContent = 'Não consegui verificar o seguimento agora.';
    return;
  }
  followsViewed = Boolean(followingResult.data?.length);
  viewedFollowsViewer = Boolean(followerResult.data?.length);
  renderFriendActions();
  await loadFriendBooks();
}

function renderFriendActions() {
  const areFriends = followsViewed && viewedFollowsViewer;
  elements.followButton.disabled = areFriends || followsViewed;
  elements.followIcon.textContent = areFriends ? 'check' : followsViewed ? 'person_check' : 'person_add';
  elements.followLabel.textContent = areFriends ? 'Amigos' : followsViewed ? 'Seguindo' : viewedFollowsViewer ? 'Seguir de volta' : 'Seguir';
  elements.followButton.classList.toggle('is-complete', areFriends);
  elements.messageButton.hidden = !areFriends;
  elements.messageButton.href = `mensagens.html?id=${encodeURIComponent(viewedId)}`;
  elements.actionNote.textContent = areFriends
    ? 'Vocês se seguem. A conversa está liberada.'
    : viewedFollowsViewer ? 'Siga de volta para compartilhar estantes e conversar.' : '';
}

async function followBack() {
  if (followsViewed) return;
  elements.followButton.disabled = true;
  elements.followLabel.textContent = 'Seguindo…';
  const { error } = await db.from('follows').insert({ follower_id: currentUser.id, followed_id: viewedId });
  if (error) {
    elements.followButton.disabled = false;
    elements.followLabel.textContent = viewedFollowsViewer ? 'Seguir de volta' : 'Seguir';
    showToast(error.message || 'Não consegui seguir essa pessoa agora.');
    return;
  }
  followsViewed = true;
  renderFriendActions();
  showToast('Agora vocês são amigos!');
  await loadFriendBooks();
}

async function loadFriendBooks() {
  const host = elements.friendBooks;
  const areFriends = followsViewed && viewedFollowsViewer;
  if (!areFriends) {
    host.innerHTML = '<div class="profile-private">Os livros e comentários aparecem quando vocês se seguem mutuamente.</div>';
    return;
  }
  const { data, error } = await db.from('books')
    .select('id,title,author,status,format,total_pages,current_page,rating,comment,has_spoiler')
    .eq('owner_id', viewedId).order('created_at', { ascending: false });
  if (error) {
    host.innerHTML = '<div class="profile-private">Não consegui carregar os livros desta pessoa agora.</div>';
    return;
  }
  if (!data?.length) {
    host.innerHTML = '<div class="profile-private">Esta pessoa ainda não adicionou livros à estante.</div>';
    return;
  }
  const statusLabels = { reading: 'Lendo agora', read: 'Já li', want: 'Quero ler' };
  host.innerHTML = data.map(book => {
    const progress = book.total_pages ? Math.min(100, Math.round((Number(book.current_page) || 0) / book.total_pages * 100)) : 0;
    const progressLabel = book.status === 'reading' && book.total_pages ? `<span class="friend-book-status">${progress}% da leitura</span>` : '';
    const ratingLabel = book.rating ? `<span class="friend-book-status">Nota ${book.rating}/5</span>` : '';
    const comment = book.comment ? `<p>${book.has_spoiler ? '<strong>Comentário com spoiler: </strong>' : ''}“${escapeHtml(book.comment)}”</p>` : '';
    const format = book.format === 'digital' ? 'Digital / e-book' : 'Físico';
    return `<article class="friend-book-card" id="livro-${escapeHtml(book.id)}"><h3>${escapeHtml(book.title)}</h3><small>${escapeHtml(book.author)} · ${format}</small><div class="friend-book-meta"><span class="friend-book-status">${statusLabels[book.status] || 'Na estante'}</span>${progressLabel}${ratingLabel}</div>${comment}</article>`;
  }).join('');
  if (location.hash.startsWith('#livro-')) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    window.setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }
}

elements.profilePhotoInput.addEventListener('change', event => loadPhotoFile(event.target.files?.[0]));
[elements.cropZoom, elements.cropHorizontal, elements.cropVertical].forEach(control => control.addEventListener('input', () => {
  if (croppedSourceImage) updateCropPreview();
}));
elements.removeProfilePhoto.addEventListener('click', () => {
  removePhoto = true;
  photoChanged = false;
  croppedSourceImage = null;
  if (croppedSourceUrl) URL.revokeObjectURL(croppedSourceUrl);
  croppedSourceUrl = '';
  elements.photoCropPreview.removeAttribute('src');
  elements.photoCropPreview.hidden = true;
  elements.photoPlaceholder.hidden = false;
  elements.cropControls.hidden = true;
  elements.removeProfilePhoto.hidden = true;
  elements.photoMessage.classList.remove('error');
  elements.photoMessage.textContent = 'A foto será removida quando você salvar o perfil.';
  setAvatar(document.getElementById('profileAvatar'), document.getElementById('fullName').value || 'Leitor');
});
elements.followButton.addEventListener('click', followBack);

document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.getElementById('profileMessage');
  message.classList.remove('error');
  message.textContent = 'Salvando…';
  const photoMessage = elements.photoMessage;
  const update = {
    full_name: document.getElementById('fullName').value.trim(),
    username: document.getElementById('username').value.trim().toLowerCase(),
    bio: document.getElementById('bio').value.trim(),
    profile_photo_path: removePhoto ? null : savedPhotoPath
  };

  try {
    if (!removePhoto && photoChanged) {
      photoMessage.classList.remove('error');
      photoMessage.textContent = 'Preparando sua foto…';
      update.profile_photo_path = await uploadCroppedPhoto();
    }
    const { error } = await db.from('profiles').update(update).eq('id', currentUser.id);
    if (error) throw error;

    savedPhotoPath = update.profile_photo_path;
    photoChanged = false;
    removePhoto = false;
    viewerProfile = { ...viewerProfile, ...update };
    const imageUrl = await signedPhotoUrl(savedPhotoPath);
    setViewerIdentity(viewerProfile, imageUrl);
    renderProfile(viewerProfile, true, imageUrl);
    elements.removeProfilePhoto.hidden = !savedPhotoPath;
    photoMessage.textContent = savedPhotoPath
      ? 'Foto salva. Para trocar o enquadramento, escolha a imagem novamente.'
      : 'A foto aparece no seu perfil e na navegação da sua conta.';
    message.textContent = 'Perfil atualizado.';
    showToast('Seu perfil foi atualizado.');
  } catch (error) {
    message.textContent = error.message || 'Não consegui salvar seu perfil.';
    message.classList.add('error');
    photoMessage.classList.add('error');
    photoMessage.textContent = 'Não consegui salvar a foto. Confira a configuração de armazenamento no Supabase.';
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await db.auth.signOut();
  location.href = 'acesso.html';
});

loadProfile();

