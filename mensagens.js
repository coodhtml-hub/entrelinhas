(() => {
  const db = window.entrelinhasSupabase;
  const layout = document.querySelector('.messages-layout');
  const conversationList = document.getElementById('conversationList');
  const conversationEmpty = document.getElementById('conversationEmpty');
  const activeConversation = document.getElementById('activeConversation');
  const messageHistory = document.getElementById('messageHistory');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const conversationNotice = document.getElementById('conversationNotice');
  const toast = document.getElementById('toast');
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let currentUser = null;
  let selectedPeerId = null;
  let selectedPeer = null;
  let messageChannel = null;
  let loadingMessages = false;
  let conversations = [];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function initials(name = 'Leitor') {
    return name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function setIdentity(profile) {
    if (!profile) return;
    const name = profile.full_name || 'Leitor';
    document.getElementById('nameTop').textContent = name;
    document.getElementById('usernameTop').textContent = `@${profile.username || 'leitor'}`;
    document.getElementById('avatarTop').textContent = initials(name);
    document.getElementById('nameBottom').textContent = name;
    document.getElementById('avatarBottom').textContent = initials(name);
  }

  async function start() {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session) {
      location.replace('acesso.html');
      return;
    }
    currentUser = data.session.user;

    const { data: profile } = await db.from('profiles')
      .select('id,username,full_name')
      .eq('id', currentUser.id)
      .maybeSingle();
    setIdentity(profile);

    await loadInbox();
    const requestedPeer = new URLSearchParams(location.search).get('id');
    if (requestedPeer) await openConversation(requestedPeer);

    messageChannel = db.channel(`messages-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${currentUser.id}`
      }, refreshCurrentConversation)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${currentUser.id}`
      }, refreshCurrentConversation)
      .subscribe();

    window.setInterval(async () => {
      await loadInbox();
      if (selectedPeerId && document.visibilityState === 'visible') await loadMessages();
    }, 8000);
  }

  async function loadInbox() {
    const { data, error } = await db.from('messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at')
      .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      conversationList.innerHTML = '<p class="conversation-placeholder">Não consegui carregar suas conversas. Confira se a atualização de mensagens foi executada no Supabase.</p>';
      return;
    }

    const latestByPeer = new Map();
    (data || []).forEach(message => {
      const peerId = message.sender_id === currentUser.id ? message.recipient_id : message.sender_id;
      if (!latestByPeer.has(peerId)) {
        latestByPeer.set(peerId, {
          peerId,
          latest: message,
          unread: message.recipient_id === currentUser.id && !message.read_at ? 1 : 0
        });
      } else if (message.recipient_id === currentUser.id && !message.read_at) {
        latestByPeer.get(peerId).unread += 1;
      }
    });

    const peerIds = [...latestByPeer.keys()];
    const { data: profiles } = peerIds.length
      ? await db.from('profiles').select('id,full_name,username').in('id', peerIds)
      : { data: [] };
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));

    conversations = [...latestByPeer.values()].map(conversation => ({
      ...conversation,
      profile: profileById.get(conversation.peerId) || null
    }));
    renderInbox();
  }

  function renderInbox() {
    if (!conversations.length) {
      conversationList.innerHTML = '<p class="conversation-placeholder">Suas conversas aparecerão aqui. Para começar, abra o perfil de um amigo.</p>';
      return;
    }

    conversationList.innerHTML = conversations.map(conversation => {
      const name = conversation.profile?.full_name || 'Leitor';
      const lastMessage = conversation.latest.body.replace(/\s+/g, ' ').slice(0, 72);
      const unreadBadge = conversation.unread
        ? `<span class="conversation-unread-count" aria-label="${conversation.unread} mensagens não lidas">${conversation.unread > 9 ? '9+' : conversation.unread}</span>`
        : '';
      return `
        <a class="conversation-link ${selectedPeerId === conversation.peerId ? 'active' : ''}" href="mensagens.html?id=${encodeURIComponent(conversation.peerId)}">
          <span class="conversation-peer-avatar">${escapeHtml(initials(name))}</span>
          <span class="conversation-link-copy">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(lastMessage)}</small>
          </span>
          ${unreadBadge}
        </a>`;
    }).join('');
  }

  async function openConversation(peerId) {
    if (!uuidPattern.test(peerId) || peerId === currentUser.id) {
      conversationNotice.textContent = 'Este perfil não está disponível para conversa.';
      return;
    }

    selectedPeerId = peerId;
    const { data: profile, error } = await db.from('profiles')
      .select('id,full_name,username')
      .eq('id', peerId)
      .maybeSingle();
    if (error || !profile) {
      conversationNotice.textContent = 'Não consegui encontrar esse perfil.';
      return;
    }

    selectedPeer = profile;
    const name = profile.full_name || 'Leitor';
    document.getElementById('conversationName').textContent = name;
    document.getElementById('conversationHandle').textContent = `@${profile.username || 'leitor'}`;
    document.getElementById('conversationAvatar').textContent = initials(name);
    conversationEmpty.hidden = true;
    activeConversation.hidden = false;
    layout.classList.add('has-conversation');

    await updateFriendPermission();
    await loadMessages();
    renderInbox();
  }

  async function updateFriendPermission() {
    const [followingResult, followerResult] = await Promise.all([
      db.from('follows').select('follower_id').eq('follower_id', currentUser.id).eq('followed_id', selectedPeerId),
      db.from('follows').select('follower_id').eq('follower_id', selectedPeerId).eq('followed_id', currentUser.id)
    ]);
    const isFriend = Boolean(followingResult.data?.length && followerResult.data?.length);
    messageForm.hidden = !isFriend;
    document.querySelector('.message-hint').hidden = !isFriend;
    conversationNotice.textContent = isFriend
      ? ''
      : 'Para enviar mensagens, vocês precisam se seguir mutuamente. Volte ao perfil e siga essa pessoa.';
  }

  async function loadMessages() {
    if (!selectedPeerId || loadingMessages) return;
    loadingMessages = true;
    try {
      const filter = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${selectedPeerId}),and(sender_id.eq.${selectedPeerId},recipient_id.eq.${currentUser.id})`;
      const { data, error } = await db.from('messages')
        .select('id,sender_id,recipient_id,body,created_at,read_at')
        .or(filter)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) {
        messageHistory.innerHTML = '<p class="message-history-empty">Não consegui carregar esta conversa agora.</p>';
        return;
      }

      renderMessages(data || []);
      const unreadIds = (data || [])
        .filter(message => message.recipient_id === currentUser.id && message.sender_id === selectedPeerId && !message.read_at)
        .map(message => message.id);
      if (unreadIds.length) {
        await db.from('messages').update({ read_at: new Date().toISOString() })
          .in('id', unreadIds)
          .eq('recipient_id', currentUser.id);
      }
    } finally {
      loadingMessages = false;
    }
  }

  function renderMessages(messages) {
    if (!messages.length) {
      messageHistory.innerHTML = '<p class="message-history-empty">Comece a conversa com um oi e uma indicação de leitura.</p>';
      return;
    }

    messageHistory.innerHTML = messages.map(message => {
      const mine = message.sender_id === currentUser.id;
      const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at));
      return `
        <article class="message-bubble ${mine ? 'mine' : ''}">
          ${escapeHtml(message.body)}
          <time class="message-time" datetime="${escapeHtml(message.created_at)}">${time}</time>
        </article>`;
    }).join('');
    messageHistory.scrollTop = messageHistory.scrollHeight;
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = messageInput.value.trim();
    if (!body || !selectedPeerId) return;

    const sendButton = messageForm.querySelector('button[type="submit"]');
    sendButton.disabled = true;
    const { error } = await db.from('messages').insert({
      sender_id: currentUser.id,
      recipient_id: selectedPeerId,
      body
    });

    if (error) {
      conversationNotice.textContent = error.message || 'Não consegui enviar sua mensagem.';
      sendButton.disabled = false;
      return;
    }

    messageInput.value = '';
    conversationNotice.textContent = '';
    await Promise.all([loadMessages(), loadInbox()]);
    sendButton.disabled = false;
    messageInput.focus();
  }

  function refreshCurrentConversation(payload) {
    if (!selectedPeerId) return;
    const message = payload.new || payload.old;
    if (message && [message.sender_id, message.recipient_id].includes(selectedPeerId)) {
      loadMessages();
      loadInbox();
    }
  }

  messageForm.addEventListener('submit', sendMessage);
  document.getElementById('logoutButton').addEventListener('click', async () => {
    await db.auth.signOut();
    location.href = 'acesso.html';
  });

  start();
})();
