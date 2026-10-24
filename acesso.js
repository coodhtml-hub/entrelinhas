const db = window.entrelinhasSupabase;
const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const message = document.getElementById('authMessage');
function showMessage(text, error=false){message.textContent=text;message.classList.toggle('error',error)}
function switchMode(mode){const signup=mode==='signup';signupForm.hidden=!signup;loginForm.hidden=signup;document.getElementById('showSignup').classList.toggle('active',signup);document.getElementById('showLogin').classList.toggle('active',!signup);document.getElementById('formTitle').textContent=signup?'Abra sua estante.':'Que bom ter você de volta.';document.getElementById('formIntro').textContent=signup?'Crie sua conta para guardar livros, acompanhar leituras e voltar às histórias que marcaram você.':'Entre com seu e-mail e senha para continuar sua jornada de leitura.';showMessage('')}
document.getElementById('showSignup').addEventListener('click',()=>switchMode('signup'));
document.getElementById('showLogin').addEventListener('click',()=>switchMode('login'));
signupForm.addEventListener('submit',async event=>{event.preventDefault();showMessage('Criando sua conta…');const username=document.getElementById('username').value.trim().toLowerCase();const fullName=document.getElementById('fullName').value.trim();const email=document.getElementById('signupEmail').value.trim();const password=document.getElementById('signupPassword').value;const {data,error}=await db.auth.signUp({email,password,options:{data:{username,full_name:fullName},emailRedirectTo:`${location.origin}${location.pathname.replace(/acesso\.html?$/, 'acesso.html')}`}});if(error){showMessage(error.message,error);return}if(data.session){location.href='minha estante protótipo 1.html'}else{switchMode('login');showMessage('Conta criada! Confira seu e-mail para confirmar o cadastro e depois entre por aqui.')}});
loginForm.addEventListener('submit',async event=>{event.preventDefault();showMessage('Entrando…');const {error}=await db.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});if(error){showMessage(error.message,true);return}location.href='minha estante protótipo 1.html'});
db.auth.getSession().then(({data})=>{if(data.session)location.href='minha estante protótipo 1.html'});

