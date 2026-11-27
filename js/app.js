(function(){
'use strict';
const $app=document.getElementById('app');
const sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true}});
const LS={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const S={code:LS.get('esmet_code',null),me:null,view:'home'};

/* ---------- helpers ---------- */
function h(tag,attrs,...kids){
  const el=document.createElement(tag);
  for(const k in (attrs||{})){
    const v=attrs[k];
    if(v==null||v===false)continue;
    if(k==='class')el.className=v;
    else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);
    else if(k==='text')el.textContent=v;
    else el.setAttribute(k,v===true?'':v);
  }
  for(const c of kids.flat()){if(c==null||c===false)continue;el.append(c.nodeType?c:document.createTextNode(c))}
  return el;
}
function mount(...nodes){$app.replaceChildren(...nodes.flat(Infinity).filter(n=>n!=null&&n!==false));window.scrollTo(0,0)}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function norm(s){return String(s==null?'':s).toLowerCase().replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[.,;:!?¡¿"“”„'’‘()…\-–—]/g,' ').replace(/\s+/g,' ').trim()}
function fmtDate(d){return new Date(d).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function header(right){
  return h('div',{class:'top'},h('img',{src:'icons/logo.png',alt:'Esmet Academy'}),right||null);
}
function footer(){return h('p',{class:'ver'},'Esmet Academy · versione '+CFG.version)}

/* ---------- offline queue ---------- */
function qGet(){return LS.get('esmet_q',[])}
function qSet(q){LS.set('esmet_q',q)}
async function flushQueue(){
  let q=qGet();if(!q.length||!S.code)return;
  const rest=[];
  for(const r of q){
    try{
      const {error}=await sb.rpc('student_submit_result',{p_code:r.code,p_lesson:r.lesson,p_idx:r.idx,p_score:r.score,p_total:r.total,p_details:r.details});
      if(error)rest.push(r);
    }catch(e){rest.push(r)}
  }
  qSet(rest);
}
window.addEventListener('online',flushQueue);
async function submitResult(lesson,idx,res){
  if(S.prev)return;
  const rec={code:S.code,lesson:lesson.id,idx,score:res.score,total:res.total,details:{wrong:res.wrong,title:res.title,type:res.type}};
  const q=qGet();q.push(rec);qSet(q);
  await flushQueue();
  const local=LS.get('esmet_res_'+lesson.id,{});
  const prev=local[idx];
  if(!prev||res.score>=prev.score)local[idx]={score:res.score,total:res.total,at:Date.now()};
  LS.set('esmet_res_'+lesson.id,local);
  const log=LS.get('esmet_log_'+lesson.id,{});
  log[idx]={title:res.title,type:res.type,score:res.score,total:res.total,wrong:res.wrong};
  LS.set('esmet_log_'+lesson.id,log);
}


/* ---------- finestre di dialogo dell'app (al posto di prompt/confirm/alert) ---------- */
function dlg(title,bodyNodes,buttons){
  return new Promise(res=>{
    const close=v=>{ov.remove();res(v)};
    const ov=h('div',{class:'dlg-ov',onclick:e=>{if(e.target===ov)close(null)}},
      h('div',{class:'dlg',role:'dialog','aria-modal':'true','aria-label':title},
        h('h3',null,title),...bodyNodes,
        h('div',{class:'row dlg-btn'},...buttons(close))));
    document.body.append(ov);
    const f=ov.querySelector('input,textarea');if(f)f.focus();
  });
}
function askText(title,label,value,okLabel){
  const inp=h('input',{class:'txt',type:'text',value:value||'','aria-label':label});
  return dlg(title,[label?h('p',{class:'sub small'},label):null,inp].filter(Boolean),close=>[
    h('button',{class:'secondary',onclick:()=>close(null)},'Annulla'),
    h('button',{class:'primary',onclick:()=>close(inp.value)},okLabel||'Ok')]);
}
function askYes(title,text,okLabel){
  return dlg(title,[h('p',{class:'sub'},text)],close=>[
    h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),
    h('button',{class:'primary',onclick:()=>close(true)},okLabel||'Conferma')]).then(v=>v===true);
}
function say(title,text){
  return dlg(title,[h('p',{class:'sub'},text)],close=>[h('button',{class:'primary',onclick:()=>close(true)},'Ok')]);
}

/* ---------- entry ---------- */
async function start(){
  if(location.hash==='#docente'){return teacherEntry()}
  if(S.code){return studentLoad(S.code)}
  try{
    const {data}=await sb.auth.getSession();
    if(data&&data.session){
      const r=await sb.rpc('my_student_code');
      if(r.data){return studentLoad(r.data)}
    }
  }catch(e){}
  loginView();
}
sb.auth.onAuthStateChange((ev)=>{if(ev==='PASSWORD_RECOVERY'&&location.hash!=='#docente')setTimeout(newPasswordView,0)});

/* ---------- student: login ---------- */
function loginView(msg){
  const inp=h('input',{class:'txt code',type:'text',inputmode:'text',autocomplete:'off',autocapitalize:'characters',spellcheck:'false',placeholder:'CODICE','aria-label':'Il tuo codice personale'});
  const err=h('p',{class:'err',role:'alert'},msg||'');
  const go=async()=>{
    const c=inp.value.trim().toLowerCase().replace(/\s+/g,'');
    if(!c){err.textContent='Scrivi il tuo codice.';return}
    btn.disabled=true;err.textContent='';
    await studentLoad(c,true,err);btn.disabled=false;
  };
  const btn=h('button',{class:'primary',onclick:go},'Entra');
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  mount(
    h('img',{class:'logo-big',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('h1',null,'Benvenuto!'),
    h('p',{class:'sub'},'Inserisci il codice personale che ti ha dato la scuola.'),
    h('div',{class:'card'},inp,btn,err),
    h('p',{class:'sub small'},'Hai già creato il tuo accesso? ',h('button',{class:'linkbtn',onclick:()=>emailLoginView()},'Entra con email e password')),
    h('p',{class:'sub small'},'Sei un docente? ',h('a',{href:'#docente',onclick:()=>setTimeout(()=>location.reload(),0)},'Accedi qui')),
    footer()
  );
}
async function studentLoad(code,fromLogin,errEl){
  try{
    const {data,error}=await sb.rpc('student_login',{p_code:code});
    if(error)throw error;
    if(!data){
      if(fromLogin&&errEl){errEl.textContent='Codice non riconosciuto. Controlla e riprova.';return}
      S.code=null;LS.del('esmet_code');return loginView('Codice non riconosciuto.');
    }
    S.code=code;LS.set('esmet_code',code);LS.set('esmet_cache',data);S.me=data;
    flushQueue();
    S.acc=null;
    try{const a=await sb.rpc('student_account_status',{p_code:code});S.acc=a.data||null}catch(e){}
    if(!data.consent_at)return consentView();
    calView();
  }catch(e){
    const cache=LS.get('esmet_cache',null);
    if(cache&&S.code===code){S.me=cache;if(cache.consent_at)return calView(null,true)}
    if(errEl)errEl.textContent='Connessione assente o servizio non raggiungibile. Riprova.';
    else loginView('Connessione assente. Riprova.');
  }
}


/* ---------- accesso con email e password (alunni) ---------- */
function accountBanner(){
  const a=S.acc;if(!a||a.state==='ok')return null;
  return h('button',{class:'notice',onclick:()=>accountView()},
    a.state==='none'?'👤 Crea il tuo accesso con email e password: così entri da telefono e PC senza il codice.'
                    :'✉️ Conferma la tua email: clicca il link che ti abbiamo inviato, altrimenti non potrai entrare con email e password.');
}
function pwField(ph){return h('input',{class:'txt',type:'password',autocomplete:'new-password',placeholder:ph,'aria-label':ph})}
function accountView(){
  const back=()=>calView();
  const a=S.acc||{state:'none'};
  if(a.state==='ok')return mount(topbar('Il mio accesso',back),h('div',{class:'card'},h('p',null,'Accesso con email attivo ✅'),h('p',{class:'sub small'},a.email||''),h('p',{class:'sub small'},'Per cambiare email o password apri un ticket di assistenza.'),h('button',{class:'linkbtn',onclick:()=>ticketView('Accesso e password')},'Apri un ticket')),footer());
  if(a.state==='pending'){
    const m=h('p',{role:'status',class:'sub small'});
    return mount(topbar('Il mio accesso',back),h('div',{class:'card'},
      h('p',null,'Ti abbiamo inviato un’email a ',h('strong',null,a.email||'')),
      h('p',{class:'sub small'},'Apri il messaggio e clicca sul link per confermare. Controlla anche la cartella spam. Finché non confermi, continua a entrare con il codice.'),
      h('button',{class:'secondary',onclick:async()=>{const {error}=await sb.auth.resend({type:'signup',email:a.email,options:{emailRedirectTo:location.origin+location.pathname}});m.textContent=error?'Non riesco a reinviare ora. Riprova tra poco o apri un ticket.':'Email reinviata.'}},'Reinvia l’email'),
      h('button',{class:'linkbtn',onclick:()=>{S.acc={state:'none'};accountView()}},'Ho sbagliato email'),m),footer());
  }
  const em=h('input',{class:'txt',type:'email',autocomplete:'email',placeholder:'La tua email','aria-label':'Email'});
  const p1=pwField('Scegli una password (almeno 8 caratteri)'),p2=pwField('Ripeti la password');
  const err=h('p',{class:'err',role:'alert'});
  const btn=h('button',{class:'primary',onclick:async()=>{
    err.textContent='';
    const e=em.value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){err.textContent='Controlla l’email: non sembra corretta.';return}
    if(p1.value.length<8){err.textContent='La password deve avere almeno 8 caratteri.';return}
    if(p1.value!==p2.value){err.textContent='Le due password non coincidono.';return}
    btn.disabled=true;
    const r=await sb.rpc('student_prepare_account',{p_code:S.code,p_email:e});
    if(r.error){err.textContent='Non posso usare questa email. Provane un’altra o apri un ticket.';btn.disabled=false;return}
    const {error}=await sb.auth.signUp({email:e,password:p1.value,options:{emailRedirectTo:location.origin+location.pathname}});
    if(error){err.textContent=/rate|limit/i.test(error.message)?'Troppe richieste in questo momento. Riprova tra qualche minuto o scrivi all’assistenza dal menu.':'Registrazione non riuscita: '+error.message;btn.disabled=false;return}
    S.acc={state:'pending',email:e};accountView();
  }},'Crea accesso');
  mount(topbar('Crea il tuo accesso',back),
    h('p',{class:'sub'},'Usa un’email che controlli. Ti invieremo un link: dopo averlo cliccato potrai entrare con email e password da qualsiasi dispositivo.'),
    h('div',{class:'card'},em,p1,p2,btn,err),footer());
}
function emailLoginView(msg){
  const em=h('input',{class:'txt',type:'email',autocomplete:'email',placeholder:'Email','aria-label':'Email'});
  const pw=h('input',{class:'txt',type:'password',autocomplete:'current-password',placeholder:'Password','aria-label':'Password'});
  const err=h('p',{class:'err',role:'alert'},msg||'');
  const go=async()=>{
    err.textContent='';btn.disabled=true;
    const {error}=await sb.auth.signInWithPassword({email:em.value.trim().toLowerCase(),password:pw.value});
    if(error){
      err.textContent=/confirm/i.test(error.message)?'Devi prima confermare l’email: clicca il link che ti abbiamo inviato (controlla lo spam). Se hai problemi, apri un ticket di assistenza.':'Email o password non corrette.';
      btn.disabled=false;return}
    const r=await sb.rpc('my_student_code');
    if(!r.data){err.textContent='Questo account non è collegato a un alunno.';await sb.auth.signOut();btn.disabled=false;return}
    studentLoad(r.data);
  };
  const btn=h('button',{class:'primary',onclick:go},'Entra');
  pw.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  const fg=h('button',{class:'linkbtn small',onclick:async()=>{
    const e=em.value.trim().toLowerCase();if(!e){err.textContent='Scrivi prima la tua email.';return}
    await sb.auth.resetPasswordForEmail(e,{redirectTo:location.origin+location.pathname});
    err.className='ok';err.textContent='Se l’email è registrata, ti abbiamo inviato il link per scegliere una nuova password.';
  }},'Password dimenticata?');
  mount(h('img',{class:'logo-big',src:'icons/logo.png',alt:'Esmet Academy'}),h('h1',null,'Entra'),
    h('div',{class:'card'},em,pw,btn,fg,err),
    h('p',{class:'sub small'},h('button',{class:'linkbtn',onclick:()=>loginView()},'Torna al codice')),footer());
}
function newPasswordView(){
  const p1=pwField('Nuova password (almeno 8 caratteri)'),p2=pwField('Ripeti la password');
  const err=h('p',{class:'err',role:'alert'});
  const btn=h('button',{class:'primary',onclick:async()=>{
    if(p1.value.length<8){err.textContent='Almeno 8 caratteri.';return}
    if(p1.value!==p2.value){err.textContent='Le due password non coincidono.';return}
    const {error}=await sb.auth.updateUser({password:p1.value});
    if(error){err.textContent='Non riesco a salvare: '+error.message;return}
    start();
  }},'Salva password');
  mount(h('h1',null,'Nuova password'),h('div',{class:'card'},p1,p2,btn,err),footer());
}

/* ---------- student: consent ---------- */
function consentView(){
  const chk=h('input',{type:'checkbox',id:'cn'});
  const btn=h('button',{class:'primary',disabled:true,onclick:async()=>{
    btn.disabled=true;
    const {error}=await sb.rpc('student_accept_consent',{p_code:S.code,p_version:CFG.consentVersion});
    if(error){err.textContent='Non sono riuscito a salvare. Riprova.';btn.disabled=false;return}
    S.me.consent_at=new Date().toISOString();LS.set('esmet_cache',S.me);homeView();
  }},'Continua');
  const err=h('p',{class:'err',role:'alert'});
  chk.addEventListener('change',()=>{btn.disabled=!chk.checked});
  mount(
    header(),
    h('h1',null,'Ciao '+S.me.name+'!'),
    h('div',{class:'card'},
      h('h2',null,'Prima di iniziare'),
      h('p',null,'Questa app registra i tuoi risultati negli esercizi (punteggi, frasi sbagliate, presenza alle lezioni) per permettere ai tuoi docenti di seguire i tuoi progressi e aiutarti dove serve.'),
      h('p',null,'Salviamo solo il tuo nome e un codice personale. I dati sono usati esclusivamente da Esmet Academy per la didattica, sono protetti con cifratura in transito e a riposo e non vengono ceduti a terzi.'),
      h('label',{class:'chk',for:'cn'},chk,h('span',null,'Ho letto e accetto il trattamento dei miei dati per queste finalità.')),
      btn,err),
    footer()
  );
}

/* ---------- student: shell ---------- */
const ICO={key:'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 11-7.8 7.8 5.5 5.5 0 017.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  menu:'M4 7h16M4 12h16M4 17h16',
  bell:'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4',
  chev:'M9 6l6 6-6 6',
  back:'M15 6l-6 6 6 6',
  book:'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11',
  reg:'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-6 6-6M14 17l2.2 2.2L21 14.5',
  cal:'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M10 13.5l4 4M14 13.5l-4 4',
  video:'M4 7h11v10H4zM15 11l5-3v8l-5-3',
  user:'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  out:'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  flag:'M6 21V4M6 5h11l-2 4 2 4H6'
};
function ico(n,size){
  const ns='http://www.w3.org/2000/svg';
  const sv=document.createElementNS(ns,'svg');
  sv.setAttribute('viewBox','0 0 24 24');sv.setAttribute('width',size||22);sv.setAttribute('height',size||22);
  sv.setAttribute('fill','none');sv.setAttribute('stroke','currentColor');sv.setAttribute('stroke-width','1.9');
  sv.setAttribute('stroke-linecap','round');sv.setAttribute('stroke-linejoin','round');sv.setAttribute('aria-hidden','true');
  const p=document.createElementNS(ns,'path');p.setAttribute('d',ICO[n]);sv.append(p);return sv;
}
function curCourse(){
  const cs=(S.me&&S.me.courses)||[];
  return cs.find(c=>c.id===S.cid)||cs[0]||null;
}
function drawer(){
  const me=S.me;
  const close=()=>ov.remove();
  const item=(icon,label,fn)=>h('button',{class:'dr-item',onclick:()=>{close();fn()}},ico(icon),label);
  const panel=h('div',{class:'dr-panel',role:'dialog','aria-label':'Menu'},
    h('p',{class:'dr-title'},'Esmet Academy'),
    h('button',{class:'dr-item',onclick:()=>{close();calView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📅'),'Calendario'),
    h('button',{class:'dr-item',onclick:()=>{close();homeView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📚'),'Esercizi'),
    h('button',{class:'dr-item',onclick:()=>{close();lavagneView()}},h('span',{class:'dr-em','aria-hidden':'true'},'🖼️'),'Lavagne'),
    h('button',{class:'dr-item',onclick:()=>{close();registroView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📋'),'Registro'),
    h('button',{class:'dr-item',onclick:()=>{close();avvisiView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📢'),'Avvisi'),
    item('user','Il mio profilo',()=>profileView()),
    item('key','Il mio accesso',()=>accountView()),
    h('button',{class:'dr-item',onclick:()=>{close();ticketView()}},h('span',{class:'dr-em','aria-hidden':'true'},'🛟'),'Assistenza'),
    (me.courses.length>1)?item('book','Cambia corso',()=>courseSwitch()):null,
    item('out','Esci',()=>{sb.auth.signOut().catch(()=>{});LS.del('esmet_code');LS.del('esmet_cache');S.code=null;S.me=null;loginView()}),
    h('p',{class:'dr-ver'},'Ver '+CFG.version));
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},panel);
  document.body.append(ov);
}
function courseSwitch(){
  const rows=S.me.courses.map(c=>h('button',{class:'row-item',onclick:()=>{S.cid=c.id;homeView()}},h('span',{class:'ri-l'},ico('book'),h('span',null,c.name+(c.archived?' (archiviato)':''),c.teacher?h('span',{class:'sub small',style:'display:block'},'Docente: '+c.teacher):null)),ico('chev')));
  mount(topbar('Cambia corso',()=>homeView()),h('div',{class:'rows'},rows),footer());
}
function topbar(title,back){
  return h('div',{class:'bar'},
    h('button',{class:'icon-btn','aria-label':'Indietro',onclick:back},ico('back')),
    h('h2',null,title));
}
function tabs(active){
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(active===id?' on':''),onclick:fn,'aria-current':active===id?'page':null},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('cal','Calendario','📅',()=>calView()),t('lez','Esercizi','📚',()=>homeView()),t('lav','Lavagne','🖼️',()=>lavagneView()),t('reg','Registro','📋',()=>registroView()));
}
/* ---------- campanella notifiche ---------- */
async function notifFetch(staff){
  try{const r=staff?await sb.rpc('my_notifications'):await sb.rpc('student_notifications',{p_code:S.code});return Array.isArray(r.data)?r.data:[]}catch(e){return []}
}
function bellBtn(staff,backFn){
  const dot=h('span',{class:'bdot',hidden:'hidden'});
  const b=h('button',{class:'icon-btn bellbtn',style:'background:var(--sand);position:relative','aria-label':'Notifiche',onclick:()=>notifView(staff,backFn)},ico('bell'),dot);
  notifFetch(staff).then(l=>{const n=l.filter(x=>!x.read&&!x.hidden).length;if(n){dot.hidden=false;dot.textContent=n>9?'9+':String(n);b.setAttribute('aria-label','Notifiche, '+n+' da leggere')}});
  return b;
}
const NCAT=[['announcement','Avvisi',['announcement']],['whiteboard','Lavagne',['whiteboard','whiteboard_replaced']],['exercises','Esercizi',['exercises']],['session','Calendario',['session']],['response','Risposte',['response']]];
async function notifView(staff,backFn,cat){
  mount(topbar(cat?'Storico · '+cat[1]:'Notifiche',cat?()=>notifView(staff,backFn):backFn),h('p',{class:'sub'},'Caricamento…'));
  const l=await notifFetch(staff);
  const hide=async id=>{try{await (staff?sb.rpc('my_notifications_hide',{p_id:id}):sb.rpc('student_notifications_hide',{p_code:S.code,p_id:id}))}catch(e){}notifView(staff,backFn)};
  if(cat){
    const L=l.filter(x=>cat[2].includes(x.kind));
    return mount(topbar('Storico · '+cat[1],()=>notifView(staff,backFn)),
      h('p',{class:'sub small'},'Tutte le notifiche di questa categoria degli ultimi 90 giorni, anche quelle nascoste.'),
      L.length?L.map(x=>h('div',{class:'card notif'},h('strong',null,x.title),x.body?h('p',{class:'sub small'},x.body):null,h('span',{class:'sub small'},fmtDate(x.at)+(x.hidden?' · nascosta':'')))):h('p',{class:'sub'},'Nessuna notifica in questa categoria.'),footer());
  }
  const vis=l.filter(x=>!x.hidden);
  const rows=vis.length?vis.map(x=>h('div',{class:'card notif'+(x.read?'':' unread')},
    h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},h('strong',null,x.title),h('button',{class:'xbtn','aria-label':'Nascondi questa notifica',onclick:()=>hide(x.id)},'✕')),
    x.body?h('p',{class:'sub small'},x.body):null,h('span',{class:'sub small'},fmtDate(x.at)))):[h('p',{class:'sub'},'Nessuna notifica da vedere.')];
  const menu=h('div',{class:'notif-menu',hidden:'hidden'},NCAT.map(c=>h('button',{class:'linkbtn',onclick:()=>notifView(staff,backFn,c)},c[1])));
  const bar=h('div',{class:'row',style:'justify-content:space-between;align-items:center'},
    vis.length?h('button',{class:'secondary small',onclick:()=>hide(null)},'Nascondi tutte'):h('span'),
    h('div',{style:'position:relative'},h('button',{class:'secondary small','aria-haspopup':'true',onclick:()=>{menu.hidden=!menu.hidden}},'Storico ▾'),menu));
  mount(topbar('Notifiche',backFn),bar,h('p',{class:'sub small'},'Con ✕ o «Nascondi tutte» le notifiche escono da questa schermata ma restano nello storico per 90 giorni.'),...rows,footer());
  if(vis.some(x=>!x.read)){try{await (staff?sb.rpc('my_notifications_read'):sb.rpc('student_notifications_read',{p_code:S.code}))}catch(e){}}
}
function tabHeader(){
  const c=curCourse();
  return h('div',{class:'thead2'},
    h('div',{class:'thead-top'},
      h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
      h('div',{class:'row',style:'gap:8px'},bellBtn(false,()=>calView()),h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:drawer},ico('menu')))),
    h('div',{class:'thead'},
      h('div',{class:'avatar','aria-hidden':'true'},(S.me.name||'?').trim().charAt(0).toUpperCase()),
      h('div',{class:'tname'},h('strong',null,S.me.name),h('span',{class:'sub small'},c?c.name:''))));
}

function joinBlock(c){
  const joinMsg=h('p',{class:'sub small',role:'status'});
  const join=h('button',{class:'banner',onclick:async()=>{
    joinMsg.textContent='Un attimo…';
    const win=window.open('about:blank','_blank');
    const {data,error}=await sb.rpc('student_join_lesson',{p_code:S.code,p_course:c.id});
    if(error||!data){if(win)win.close();joinMsg.textContent=error?'Non riesco a registrare l’ingresso. Riprova.':'Il link della lezione non è ancora disponibile.';return}
    joinMsg.textContent='Presenza registrata. Buona lezione!';
    if(win)win.location.href=data;else location.href=data;
  }},h('span',null,'Accedi alla lezione'),ico('video'));
  return [join,joinMsg];
}

/* ---------- student: home (lezioni) ---------- */
function homeView(offline){
  const me=S.me;const c=curCourse();
  if(!c){mount(tabHeader(),h('p',{class:'sub'},'Non hai ancora corsi assegnati.'),footer());return}
  const lessons=(c.lessons||[]).slice().sort((a,b)=>b.number-a.number);
  const [join,joinMsg]=joinBlock(c);
  const rows=lessons.map(l=>{
    const ex=(l.content&&l.content.exercises)||[];
    const done=Object.keys(LS.get('esmet_res_'+l.id,{})).length;
    return h('button',{class:'row-item',onclick:()=>lessonView(c,l)},
      h('span',{class:'ri-l'},h('span',null,h('span',{class:'kind'},'Lezione '+l.number),h('br'),l.title)),
      h('span',{class:'ri-r'},h('span',{class:'res'},done+'/'+ex.length),ico('chev')));
  });
  mount(tabHeader(),
    offline?h('p',{class:'sub small'},'Sei offline: vedi l’ultima versione scaricata.'):null,
    c.teacher?h('p',{class:'sub small'},c.name+' · Docente: '+c.teacher+(c.archived?' · Corso archiviato (sola lettura)':'')):(c.archived?h('p',{class:'sub small'},c.name+' · Corso archiviato (sola lettura)'):null),
    join,joinMsg,
    accountBanner(),
    h('h3',{class:'sect'},'Esercizi'),
    rows.length?h('div',{class:'rows'},rows):h('p',{class:'sub'},'Nessun esercizio disponibile.'),
    tabs('lez'),footer());
}


/* ---------- student: calendario settimanale ---------- */
function mondayOf(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
const isoD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
async function calView(weekStart,offline){
  const mon=weekStart?mondayOf(weekStart):mondayOf(new Date());
  const sun=new Date(mon);sun.setDate(sun.getDate()+6);
  const label=mon.getDate()+' '+MESI[mon.getMonth()].slice(0,3).toLowerCase()+' – '+sun.getDate()+' '+MESI[sun.getMonth()].slice(0,3).toLowerCase()+' '+sun.getFullYear();
  const shift=n=>{const d=new Date(mon);d.setDate(d.getDate()+7*n);calView(d)};
  const nav=h('div',{class:'row'},
    h('button',{class:'icon-btn','aria-label':'Settimana precedente',onclick:()=>shift(-1)},ico('back')),
    h('strong',{class:'weeklab'},label),
    h('button',{class:'icon-btn','aria-label':'Settimana successiva',onclick:()=>shift(1),style:'transform:scaleX(-1)'},ico('back')),
    h('button',{class:'linkbtn small',onclick:()=>calView()},'Oggi'));
  mount(tabHeader(),nav,h('p',{class:'sub'},'Caricamento…'),tabs('cal'));
  let list=[];let off=!!offline;
  try{const {data,error}=await sb.rpc('student_calendar',{p_code:S.code,p_from:isoD(mon),p_to:isoD(sun)});if(error)throw error;list=data||[];LS.set('esmet_cal_'+isoD(mon),list)}
  catch(e){list=LS.get('esmet_cal_'+isoD(mon),[]);off=true}
  const c0=curCourse();const [jb,jm]=c0?joinBlock(c0):[null,null];
  let ann=LS.get('esmet_ann',[]),links=LS.get('esmet_links',{});
  try{const [a,l]=await Promise.all([sb.rpc('student_announcements',{p_code:S.code}),sb.rpc('student_course_links',{p_code:S.code})]);
    if(Array.isArray(a.data)){ann=a.data;LS.set('esmet_ann',ann)}if(l.data){links=l.data;LS.set('esmet_links',links)}}catch(e){}
  const chatUrl=c0&&links[c0.id];
  const chatBtn=chatUrl?h('a',{class:'banner banner2',href:chatUrl,target:'_blank',rel:'noopener'},h('span',null,'💬 Chat del corso')):null;
  const annBox=ann.length?h('div',{class:'card'},h('div',{class:'row'},h('h3',null,'📢 Avvisi'),h('button',{class:'linkbtn small',onclick:()=>avvisiView()},'Vedi tutti')),
    ann.slice(0,2).map(a=>h('div',{class:'ann'},h('strong',null,a.title),h('span',{class:'sub small'},' · '+new Date(a.created_at).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})),a.body?h('p',{class:'sub small ann-b'},a.body):null))):null;
  const todayK=isoD(new Date());
  const days=[];for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(d.getDate()+i);days.push(d)}
  const blocks=days.map(d=>{
    const k=isoD(d);const L=list.filter(x=>x.date===k);if(!L.length)return null;
    return h('div',null,
      h('div',{class:'datepill'+(k===todayK?' today':'')},GIORNI[d.getDay()]+', '+d.getDate()+' '+MESI[d.getMonth()]),
      L.map(x=>lessonCard(x)));
  });
  mount(tabHeader(),
    off?h('p',{class:'sub small'},'Sei offline: vedi l’ultimo calendario scaricato.'):null,
    jb,jm,chatBtn,annBox,
    nav,
    accountBanner(),
    blocks.some(Boolean)?blocks:h('p',{class:'sub'},'Nessuna lezione in programma questa settimana.'),
    tabs('cal'),footer());
}
function lessonCard(x){
  const msg=h('p',{class:'sub small',role:'status'});
  const body=h('div',{class:'lc-actions',hidden:'hidden'});
  const past=x.date<isoD(new Date());
  const st=x.attendance==='present'?['Presente','g']:x.attendance==='absent_notified'?['Assenza comunicata','n']:x.attendance==='absent'?['Assente','b']:
    x.response==='move_request'?[x.response_status==='accepted'?'Spostamento accettato':x.response_status==='rejected'?'Spostamento non accettato':'Spostamento richiesto','n']:
    x.response==='confirm'?['Confermata','g']:null;
  const send=async(resp,note)=>{
    const {error}=await sb.rpc('student_respond',{p_code:S.code,p_session:x.id,p_response:resp,p_note:note||null});
    if(error){msg.className='err';msg.textContent='Non sono riuscito a salvare. Riprova.';return}
    calView(new Date(x.date+'T12:00:00'));
  };
  if(!past){
    body.append(...[
      h('button',{class:'primary',onclick:()=>send('confirm')},'Confermo'),
      h('button',{class:'secondary',onclick:()=>absenceView({course_id:x.course_id,date:x.date})},'Sarò assente'),
      x.individual?h('button',{class:'secondary',onclick:async()=>{const n=await askText('Chiedi di spostare','Quando preferiresti spostarla? (giorno e ora)','','Invia richiesta');if(n===null)return;send('move_request',n)}},'Chiedi di spostare'):null].filter(Boolean));
  }
  const head=h('button',{class:'lc-head',onclick:()=>{if(!past)body.hidden=!body.hidden},'aria-expanded':'false'},
    h('span',{class:'lc-time'},x.start+(x.end?'–'+x.end:'')),
    h('span',{class:'lc-main'},h('strong',null,x.course),x.teacher?h('span',{class:'sub small'},'Docente: '+x.teacher):null,x.place?h('span',{class:'sub small'},x.place+(x.section==='morning'?' · mattina':x.section==='evening'?' · sera':'')):(x.section==='morning'?h('span',{class:'sub small'},'mattina'):x.section==='evening'?h('span',{class:'sub small'},'sera'):null)),
    st?h('span',{class:'pill '+st[1]},st[0]):null);
  return h('div',{class:'card lc'},head,body,msg);
}


async function avvisiView(){
  const back=()=>calView();
  mount(topbar('Avvisi',back),h('p',{class:'sub'},'Caricamento…'));
  let list;try{const {data,error}=await sb.rpc('student_announcements',{p_code:S.code});if(error)throw error;list=data||[];LS.set('esmet_ann',list)}catch(e){list=LS.get('esmet_ann',[])}
  mount(topbar('Avvisi',back),list.length?list.map(a=>h('div',{class:'card ann'},h('div',{class:'row'},h('strong',null,a.title),h('span',{class:'sub small'},new Date(a.created_at).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}))),h('p',{class:'sub small'},a.course),a.body?h('p',{class:'ann-b'},a.body):null)):h('p',{class:'sub'},'Nessun avviso.'),footer());
}

/* ---------- profilo ---------- */
async function profileView(){
  const back=()=>calView();
  mount(topbar('Il mio profilo',back),h('p',{class:'sub'},'Caricamento…'));
  const {data}=await sb.rpc('student_get_profile',{p_code:S.code});
  const p=data||{};
  const nm=h('input',{class:'txt',type:'text',autocomplete:'name',value:p.name||S.me.name||'',placeholder:'Nome e cognome',maxlength:'80'});
  const ph=h('input',{class:'txt',type:'tel',autocomplete:'tel',value:p.phone||'',placeholder:'Telefono'});
  const ci=h('input',{class:'txt',type:'text',autocomplete:'address-level2',value:p.city||'',placeholder:'Città'});
  const bd=h('input',{class:'txt',type:'date',value:p.birth_date||''});
  const msg=h('p',{role:'status'});
  const save=h('button',{class:'primary',onclick:async()=>{
    save.disabled=true;
    const {error}=await sb.rpc('student_save_profile',{p_code:S.code,p_name:nm.value,p_phone:ph.value,p_city:ci.value,p_birth:bd.value||null});
    save.disabled=false;
    msg.className=error?'err':'ok';msg.textContent=error?'Non sono riuscito a salvare. Riprova.':'Dati salvati.';
    if(!error&&nm.value.trim()){S.me.name=nm.value.trim();LS.set('esmet_cache',S.me)}
  }},'Salva');
  mount(topbar('Il mio profilo',back),
    h('div',{class:'card'},
      (S.acc&&S.acc.email)?h('p',{class:'sub small'},'Email di accesso: '+S.acc.email):null,
      h('label',null,'Nome e cognome',nm),h('label',null,'Telefono',ph),h('label',null,'Città',ci),h('label',null,'Data di nascita',bd),
      save,msg,
      h('p',{class:'sub small'},'Per cambiare l’email scrivi all’assistenza.'),
      h('button',{class:'linkbtn small',onclick:()=>ticketView('Dati personali')},'Apri un ticket')),
    footer());
}

/* ---------- assistenza (ticket) ---------- */
const SUPPORT='esmet.app.supporto@gmail.com';
function ticketView(cat){
  const back=()=>calView();
  const cats=['Accesso e password','Esercizi','Calendario e lezioni','Presenze e registro','Lavagne','Dati personali','Altro'];
  const sel=h('select',{class:'txt sel','aria-label':'Argomento'},cats.map(c=>h('option',{value:c,selected:c===cat},c)));
  const txt=h('textarea',{class:'txt',rows:'6',maxlength:'1500',placeholder:'Descrivi il problema: cosa stavi facendo e cosa è successo?'});
  const msg=h('p',{role:'status'});
  const build=()=>{
    const course=(curCourse()||{}).name||'';
    const body='Argomento: '+sel.value+'\n\n'+txt.value.trim()+'\n\n---\nAlunno: '+S.me.name+'\nCorso: '+course+'\nVersione app: '+CFG.version+'\nDispositivo: '+navigator.userAgent;
    return {subject:'[Assistenza Esmet] '+sel.value+' – '+S.me.name,body};
  };
  const mail=h('button',{class:'primary',onclick:()=>{
    if(txt.value.trim().length<5){msg.className='err';msg.textContent='Scrivi qualche riga sul problema.';return}
    const t=build();location.href='mailto:'+SUPPORT+'?subject='+encodeURIComponent(t.subject)+'&body='+encodeURIComponent(t.body);
    msg.className='ok';msg.textContent='Si apre la tua app di posta con il messaggio pronto: premi Invia.';
  }},'Prepara il messaggio');
  const copy=h('button',{class:'linkbtn small',onclick:async()=>{
    const t=build();try{await navigator.clipboard.writeText('A: '+SUPPORT+'\nOggetto: '+t.subject+'\n\n'+t.body);msg.className='ok';msg.textContent='Testo copiato: incollalo in un’email a '+SUPPORT}catch(e){msg.className='err';msg.textContent='Scrivi a '+SUPPORT}
  }},'Non si apre la posta? Copia il testo');
  mount(topbar('Assistenza',back),
    h('p',{class:'sub'},'Scrivici: ti rispondiamo il prima possibile.'),
    h('div',{class:'card'},h('label',null,'Argomento',sel),h('label',null,'Messaggio',txt),mail,copy,msg),footer());
}

/* ---------- student: registro ---------- */
const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
async function registroView(filter){
  const now=new Date();
  const f=filter||{m:now.getMonth(),y:now.getFullYear()};
  mount(tabHeader(),h('h3',{class:'sect'},'Registro presenze'),h('p',{class:'sub'},'Caricamento…'),tabs('reg'));
  let list=[];let offline=false;
  try{const {data,error}=await sb.rpc('student_attendance',{p_code:S.code});if(error)throw error;list=data||[];LS.set('esmet_att',list)}
  catch(e){list=LS.get('esmet_att',[]);offline=true}
  const c=curCourse();
  const years=[...new Set(list.map(r=>+r.date.slice(0,4)).concat([now.getFullYear()]))].sort((a,b)=>b-a);
  const selM=h('select',{class:'txt sel','aria-label':'Mese'},MESI.map((n,i)=>h('option',{value:i,selected:i===f.m},n)));
  const selY=h('select',{class:'txt sel','aria-label':'Anno'},years.map(y=>h('option',{value:y,selected:y===f.y},y)));
  const ch=()=>registroView({m:+selM.value,y:+selY.value});
  selM.addEventListener('change',ch);selY.addEventListener('change',ch);
  const mm=String(f.m+1).padStart(2,'0');
  const items=list.filter(r=>r.date.startsWith(f.y+'-'+mm)).sort((a,b)=>a.date<b.date?1:-1);
  const lab={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
  const blocks=items.map(r=>{
    const d=new Date(r.date+'T12:00:00');
    const st=lab[r.status]||['Non registrata','b'];
    const note=h('p',{class:'sub small',role:'status'});
    const rep=r.reported?h('span',{class:'sub small'},'Segnalazione inviata'):
      h('button',{class:'linkbtn small',onclick:async ev=>{
        const n=await askText('Segnala un problema','Cosa non torna? (facoltativo)','','Invia');if(n===null)return;
        const {error}=await sb.rpc('student_report_attendance',{p_code:S.code,p_session:r.session_id,p_note:n});
        if(error)note.textContent='Non sono riuscito a inviare. Riprova.';
        else{ev.target.replaceWith(h('span',{class:'sub small'},'Segnalazione inviata'))}
      }},ico('flag',14),' Non è corretto? Segnala');
    return h('div',null,
      h('div',{class:'datepill'},GIORNI[d.getDay()]+', '+MESI[d.getMonth()]+' '+d.getDate()),
      h('div',{class:'card'},
        h('div',{class:'row'},h('span',{class:'chip'},r.course),h('span',{class:'pill '+st[1]},st[0])),
        r.joined_at?h('p',{class:'sub small'},'Ingresso alle '+new Date(r.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})):null,
        r.reason?h('p',{class:'sub small'},'Motivo: '+r.reason):null,
        rep,note));
  });
  mount(tabHeader(),h('h3',{class:'sect'},'Registro presenze'),
    offline?h('p',{class:'sub small'},'Sei offline: dati dell’ultimo accesso.'):null,
    h('div',{class:'row'},selM,selY),
    blocks.length?blocks:h('p',{class:'sub'},'Nessuna presenza in questo mese.'),
    h('p',{class:'sub small',style:'text-align:center'},'Non puoi venire a una lezione? ',h('button',{class:'linkbtn small',onclick:()=>absenceView()},'Comunica assenza')),
    tabs('reg'),footer());
}
function absenceView(pre){
  const c=(pre&&S.me.courses.find(x=>x.id===pre.course_id))||curCourse();
  const today=new Date().toISOString().slice(0,10);
  const motivo=h('select',{class:'txt sel'},['Seleziona un motivo','Malattia','Lavoro','Impegno familiare','Altro'].map((t,i)=>h('option',{value:i?t:''},t)));
  const d=h('input',{type:'date',class:'txt',value:(pre&&pre.date)||today,min:today});
  const nota=h('textarea',{class:'txt',rows:'3',maxlength:'400'});
  const msg=h('p',{role:'status'});
  const send=h('button',{class:'primary',onclick:async()=>{
    if(!motivo.value){msg.className='err';msg.textContent='Scegli un motivo.';return}
    send.disabled=true;
    const {error}=await sb.rpc('student_notify_absence',{p_code:S.code,p_course:c.id,p_date:d.value,p_reason:motivo.value,p_note:nota.value||null});
    if(error){msg.className='err';msg.textContent='Non sono riuscito a inviare. Controlla la data e riprova.';send.disabled=false}
    else{msg.className='ok';msg.textContent='Assenza comunicata. Grazie!'}
  }},'Salva');
  mount(topbar('Comunica assenza',()=>pre?calView():registroView()),
    h('div',{class:'card'},h('p',{class:'sub'},c.name),
      h('label',null,'Motivo dell’assenza',motivo),h('label',null,'Giorno della lezione',d),h('label',null,'Nota (facoltativa)',nota),send,msg),footer());
}

/* ---------- student: lesson ---------- */
function lessonView(c,l){
  const ex=(l.content&&l.content.exercises)||[];
  const res=LS.get('esmet_res_'+l.id,{});
  const names={flash:'Flash cards',match:'Abbina',quiz:'Quiz',unjumble:'Riordina la frase',cloze:'Completa la frase',group:'Dividi in gruppi',cards:'Carte per parlare',type:'Scrivi la risposta'};
  const rows=ex.map((e,i)=>h('button',{class:'row-item',onclick:()=>exView(c,l,i)},
    h('span',{class:'ri-l'},h('span',null,h('span',{class:'kind'},names[e.type]||e.type,e.hw?h('span',{class:'tag'},'compiti'):null),h('br'),e.title)),
    h('span',{class:'ri-r'},h('span',{class:'res'},res[i]?res[i].score+'/'+res[i].total:''),ico('chev'))));
  mount(topbar('Lezione '+l.number,S.prev?S.prev.back:()=>homeView()),
    S.prev?h('div',{class:'banner'},h('p',null,'Anteprima docente: i risultati non vengono salvati.'),S.prev.fix?h('button',{class:'secondary small',onclick:S.prev.fix},'Correggi testi'):null):null,
    h('p',{class:'sub'},l.title),
    h('div',{class:'rows'},rows),
    footer());
}
function exView(c,l,i){
  const ex=l.content.exercises[i];
  const back=()=>lessonView(c,l);
  const box=h('div',{class:'game'});
  mount(topbar(ex.title,back),S.prev&&S.prev.fix&&S.prev.draft?h('div',{class:'banner'},h('p',null,'Anteprima docente (bozza).'),h('button',{class:'secondary small',onclick:S.prev.fix},'Correggi testi')):null,ex.instr?h('p',{class:'sub'},ex.instr):null,box,footer());
  const eng=ENGINES[ex.type];
  if(!eng){box.append(h('p',null,'Questo tipo di esercizio non è ancora disponibile.'));return}
  eng(ex,box,async r=>{
    r.title=ex.title;r.type=ex.type;
    await submitResult(l,i,r);
    const wr=r.wrong.length?h('div',{class:'why'},h('strong',null,'Da ripassare:'),r.wrong.map(w=>h('p',{class:'small'},
      (w.q||'')+(w.expected?' → ':'')+(w.expected||''),(w.given?h('span',{class:'sub'},'  (tu: '+w.given+')'):null)))):null;
    box.replaceChildren(...[
      h('p',{class:'sum'},r.score+' / '+r.total),
      r.wrong.length?null:h('p',{class:'ok'},'Perfetto!'),
      wr,
      ex.fin?h('p',null,ex.fin):null,
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>exView(c,l,i)},'Rifai'),
        h('button',{class:'secondary',onclick:back},'Torna alla lezione'),
        (i+1<l.content.exercises.length)?h('button',{class:'secondary',onclick:()=>exView(c,l,i+1)},'Prossimo'):null)
    ].filter(Boolean));
  });
}

/* ---------- report ---------- */
function reportText(c,l){
  const log=LS.get('esmet_log_'+l.id,{});
  const ex=l.content.exercises;
  const lines=['Resoconto – '+S.me.name,c.name+' · Lezione '+l.number+': '+l.title,''];
  let any=false;
  ex.forEach((e,i)=>{
    const r=log[i];if(!r)return;any=true;
    lines.push((i+1)+'. '+e.title+': '+r.score+'/'+r.total);
    (r.wrong||[]).forEach(w=>lines.push('   ✗ '+(w.q||w.id)+(w.given?' → '+w.given:'')));
  });
  if(!any)lines.push('Nessun esercizio svolto.');
  return lines.join('\n');
}
function reportView(c,l){
  const txt=reportText(c,l);
  const ta=h('textarea',{class:'txt',rows:'12',readonly:true},txt);
  const msg=h('p',{class:'ok',role:'status'});
  mount(topbar('Resoconto',()=>lessonView(c,l)),ta,
    h('div',{class:'row'},
      h('button',{class:'primary',onclick:async()=>{try{await navigator.clipboard.writeText(txt);msg.textContent='Copiato.'}catch(e){ta.select();msg.textContent='Seleziona e copia il testo.'}}},'Copia'),
      h('a',{class:'secondary',style:'text-decoration:none;display:inline-flex;align-items:center',href:'https://wa.me/?text='+encodeURIComponent(txt),target:'_blank',rel:'noopener'},'WhatsApp'),
      h('a',{class:'secondary',style:'text-decoration:none;display:inline-flex;align-items:center',href:'mailto:?subject='+encodeURIComponent('Resoconto lezione '+l.number)+'&body='+encodeURIComponent(txt)},'Email')),
    msg,footer());
}

/* ---------- exercise engines ---------- */
const ENGINES={};
function stepper(ex,box,done,render){
  const items=ex.items;let i=0,score=0;const wrong=[];
  const prog=h('span',{class:'prog'});
  const body=h('div',{class:'game',style:'border:0;padding:0'});
  box.append(h('div',{class:'gtop'},prog),body);
  const next=()=>{
    if(i>=items.length)return done({score,total:items.length,wrong});
    prog.textContent=(i+1)+' / '+items.length;
    body.replaceChildren();
    render(items[i],body,(ok,info)=>{
      if(ok)score++;else wrong.push(Object.assign({id:items[i].id},info||{}));
    },()=>{i++;next()});
  };
  next();
}
function whyBox(it){return it.e?h('div',{class:'why'},it.e):null}
function nextBtn(go,last){return h('button',{class:'primary',onclick:go},'Avanti')}

ENGINES.quiz=(ex,box,done)=>stepper(ex,box,done,(it,body,rec,next)=>{
  const fb=h('p',{class:'fb',role:'status'});
  const opts=shuffle([it.a].concat(it.w||[]));
  const btns=opts.map(o=>h('button',{class:'opt',onclick:()=>{
    btns.forEach(b=>b.disabled=true);
    const ok=o===it.a;rec(ok,{q:it.q,given:o,expected:it.a});
    btns.forEach(b=>{if(b.textContent===it.a)b.classList.add('good');else if(b.textContent===o)b.classList.add('bad')});
    fb.className='fb '+(ok?'good':'bad');fb.textContent=ok?'Giusto!':'Risposta corretta: '+it.a;
    if(!ok&&it.e)body.append(whyBox(it));
    body.append(nextBtn(next));
  }},o));
  body.append(h('p',{class:'prompt'},it.q),h('div',{class:'opts'},btns),fb);
});

ENGINES.type=(ex,box,done)=>stepper(ex,box,done,(it,body,rec,next)=>{
  const inp=h('input',{class:'txt',type:'text',autocomplete:'off',autocapitalize:'off',spellcheck:'false','aria-label':'Risposta'});
  const fb=h('p',{class:'fb',role:'status'});
  const alts=String(it.a).split(/\s*\/\s*|\s*\|\s*/);
  const check=h('button',{class:'primary',onclick:()=>{
    const v=norm(inp.value);if(!v)return;
    const ok=alts.some(a=>norm(a)===v);
    rec(ok,{q:it.q,given:inp.value,expected:it.a});
    inp.disabled=true;check.remove();
    fb.className='fb '+(ok?'good':'bad');fb.textContent=ok?'Giusto!':'Risposta corretta: '+it.a;
    if(!ok&&it.e)body.append(whyBox(it));
    body.append(nextBtn(next));
  }},'Controlla');
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!inp.disabled)check.click()});
  body.append(h('p',{class:'prompt'},it.q),inp,check,fb);
  inp.focus();
});

ENGINES.cloze=(ex,box,done)=>{
  const bank=[...new Set(ex.items.map(x=>x.ans))];
  stepper(ex,box,done,(it,body,rec,next)=>{
    const others=shuffle(bank.filter(x=>x!==it.ans)).slice(0,3);
    const opts=shuffle([it.ans].concat(others));
    const fb=h('p',{class:'fb',role:'status'});
    const gap=h('strong',null,'_____');
    const btns=opts.map(o=>h('button',{class:'opt',onclick:()=>{
      btns.forEach(b=>b.disabled=true);
      const ok=o===it.ans;rec(ok,{q:(it.pre||'')+'___'+(it.post||''),given:o,expected:it.ans});
      gap.textContent=it.ans;
      btns.forEach(b=>{if(b.textContent===it.ans)b.classList.add('good');else if(b.textContent===o)b.classList.add('bad')});
      fb.className='fb '+(ok?'good':'bad');fb.textContent=ok?'Giusto!':'Risposta corretta: '+it.ans;
      if(!ok&&it.e)body.append(whyBox(it));
      body.append(nextBtn(next));
    }},o));
    body.append(h('p',{class:'prompt'},it.pre||'',gap,it.post||''),h('div',{class:'opts'},btns),fb);
  });
};

ENGINES.unjumble=(ex,box,done)=>stepper(ex,box,done,(it,body,rec,next)=>{
  const target=it.s[0];
  const words=target.split(/\s+/);
  const tiles=shuffle(words.map((w,k)=>({w,k})));
  const picked=[];
  const line=h('div',{class:'tiles line','aria-label':'La tua frase'});
  const pool=h('div',{class:'tiles'});
  const fb=h('p',{class:'fb',role:'status'});
  const draw=()=>{
    line.replaceChildren(...picked.map((t,pi)=>h('button',{class:'tile',onclick:()=>{picked.splice(pi,1);draw()}},t.w)));
    pool.replaceChildren(...tiles.filter(t=>!picked.includes(t)).map(t=>h('button',{class:'tile',onclick:()=>{picked.push(t);draw()}},t.w)));
  };
  const check=h('button',{class:'primary',onclick:()=>{
    const ans=picked.map(t=>t.w).join(' ');
    const ok=it.s.some(s=>norm(s)===norm(ans));
    rec(ok,{q:target,given:ans,expected:target});
    check.remove();pool.remove();
    fb.className='fb '+(ok?'good':'bad');fb.textContent=ok?'Giusto!':'Frase corretta: '+target;
    if(!ok&&it.e)body.append(whyBox(it));
    body.append(nextBtn(next));
  }},'Controlla');
  body.append(h('p',{class:'sub'},'Tocca le parole nell’ordine giusto.'),line,pool,check,fb);
  draw();
});

ENGINES.group=(ex,box,done)=>{
  const groups=ex.groups;
  stepper(ex,box,done,(it,body,rec,next)=>{
    const fb=h('p',{class:'fb',role:'status'});
    const btns=groups.map((g,gi)=>h('button',{class:'opt',onclick:()=>{
      btns.forEach(b=>b.disabled=true);
      const ok=gi===it.g;rec(ok,{q:it.t,given:g,expected:groups[it.g]});
      btns[it.g].classList.add('good');if(!ok)btns[gi].classList.add('bad');
      fb.className='fb '+(ok?'good':'bad');fb.textContent=ok?'Giusto!':'Corretto: '+groups[it.g];
      if(!ok&&it.e)body.append(whyBox(it));
      body.append(nextBtn(next));
    }},g));
    body.append(h('p',{class:'prompt'},it.t),h('div',{class:'row2'},btns),fb);
  });
};

ENGINES.match=(ex,box,done)=>{
  const items=ex.items;let score=0;const wrong=[];const flagged=new Set();let matched=0;
  const left=items.map(it=>h('button',{class:'opt','data-id':it.id},it.l));
  const rights=shuffle(items).map(it=>h('button',{class:'opt','data-id':it.id},it.r));
  let sel=null;const fb=h('p',{class:'fb',role:'status'});
  const prog=h('span',{class:'prog'},'0 / '+items.length);
  left.forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;if(sel)sel.classList.remove('sel');sel=b;b.classList.add('sel')}));
  rights.forEach(b=>b.addEventListener('click',()=>{
    if(b.disabled||!sel)return;
    const id=sel.dataset.id;
    if(id===b.dataset.id){
      sel.classList.remove('sel');sel.classList.add('good');b.classList.add('good');sel.disabled=b.disabled=true;sel=null;matched++;
      if(!flagged.has(id))score++;
      prog.textContent=matched+' / '+items.length;fb.textContent='';
      if(matched===items.length)setTimeout(()=>done({score,total:items.length,wrong}),500);
    }else{
      if(!flagged.has(sel.dataset.id)){flagged.add(sel.dataset.id);const it=items.find(x=>x.id===sel.dataset.id);wrong.push({id:it.id,q:it.l,given:b.textContent,expected:it.r})}
      const w=items.find(x=>x.id===sel.dataset.id);
      b.classList.add('bad','shake');setTimeout(()=>b.classList.remove('bad','shake'),500);
      fb.className='fb bad';fb.textContent='Riprova.';
      const first=items.find(x=>x.id===sel.dataset.id);
      if(first&&first.e)fb.textContent='Riprova. '+first.e;
    }
  }));
  box.append(h('div',{class:'gtop'},prog),h('div',{class:'row2'},h('div',{class:'opts'},left),h('div',{class:'opts'},rights)),fb);
};

ENGINES.flash=(ex,box,done)=>{
  const items=shuffle(ex.items);let i=0,known=0;const wrong=[];let flipped=false;
  const cols=ex.cols||['Fronte','Retro'];
  const prog=h('span',{class:'prog'});
  const body=h('div',{class:'game',style:'border:0;padding:0'});
  box.append(h('div',{class:'gtop'},prog),body);
  const show=()=>{
    if(i>=items.length)return done({score:known,total:items.length,wrong});
    const it=items[i];flipped=false;prog.textContent=(i+1)+' / '+items.length;
    const card=h('button',{class:'fcard','aria-live':'polite'},h('span',{class:'side'},cols[0]),it.f);
    const actions=h('div',{class:'row'});
    card.addEventListener('click',()=>{
      if(flipped)return;flipped=true;
      card.replaceChildren(h('span',{class:'side'},cols[1]),it.b);
      actions.append(
        h('button',{class:'primary',onclick:()=>{known++;i++;show()}},'La sapevo'),
        h('button',{class:'secondary',onclick:()=>{wrong.push({id:it.id,q:it.f,expected:it.b});i++;show()}},'Da ripassare'));
    });
    body.replaceChildren(h('p',{class:'sub'},'Prova a dirlo, poi tocca la carta per girarla.'),card,actions);
  };
  show();
};

ENGINES.cards=(ex,box,done)=>{
  const items=ex.ord?ex.items:shuffle(ex.items);let i=0;
  const prog=h('span',{class:'prog'});
  const body=h('div',{class:'game',style:'border:0;padding:0'});
  box.append(h('div',{class:'gtop'},prog),body);
  const show=()=>{
    if(i>=items.length)return done({score:items.length,total:items.length,wrong:[]});
    prog.textContent=(i+1)+' / '+items.length;
    body.replaceChildren(
      ...(ex.lab?[h('p',{class:'sub'},ex.lab)]:[]),
      h('div',{class:'fcard'},items[i].t),
      h('button',{class:'primary',onclick:()=>{i++;show()}},i+1<items.length?'Prossima':'Fine'));
  };
  show();
};

/* ---------- teacher ---------- */
async function teacherEntry(){
  const {data}=await sb.auth.getSession();
  if(data.session)return routeStaff();
  teacherLogin();
}
function teacherLogin(msg,mode){
  mode=mode||'login';
  const em=h('input',{class:'txt',type:'email',autocomplete:'username',placeholder:'Email'});
  const pw=h('input',{class:'txt',type:'password',autocomplete:mode==='login'?'current-password':'new-password',placeholder:mode==='login'?'Password':'Scegli una password (almeno 8 caratteri)'});
  const pw2=h('input',{class:'txt',type:'password',autocomplete:'new-password',placeholder:'Ripeti la password'});
  const err=h('p',{class:'err',role:'alert'},msg||'');
  const ok=h('p',{class:'ok',role:'status'});
  const goLogin=async()=>{
    const {error}=await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
    if(error){err.textContent=/confirm/i.test(error.message)?'Devi prima confermare l’email: controlla la posta.':'Email o password non corretti.';return}
    routeStaff();
  };
  const goSignup=async()=>{
    err.textContent='';ok.textContent='';
    if(pw.value.length<8){err.textContent='La password deve avere almeno 8 caratteri.';return}
    if(pw.value!==pw2.value){err.textContent='Le due password non coincidono.';return}
    const {error}=await sb.auth.signUp({email:em.value.trim(),password:pw.value,options:{emailRedirectTo:location.origin+location.pathname+'#docente'}});
    if(error){err.textContent=/abilitata|Database error/i.test(error.message)?'Questa email non è abilitata. Contatta la scuola.':'Non è stato possibile completare: '+error.message;return}
    ok.textContent='Fatto! Ti abbiamo inviato una email: apri il link di conferma, poi accedi con la tua password.';
  };
  const go=mode==='login'?goLogin:goSignup;
  (mode==='login'?pw:pw2).addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  mount(h('img',{class:'logo-big',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('h1',null,mode==='login'?'Area docenti':'Primo accesso'),
    mode==='signup'?h('p',{class:'sub'},'Usa l’email che hai comunicato alla scuola e scegli la tua password.'):null,
    h('div',{class:'card'},em,pw,mode==='signup'?pw2:null,h('button',{class:'primary',onclick:go},mode==='login'?'Accedi':'Crea password'),err,ok),
    h('p',{class:'sub small'},mode==='login'?h('button',{class:'linkbtn small',onclick:()=>teacherLogin('','signup')},'Primo accesso? Crea la tua password'):h('button',{class:'linkbtn small',onclick:()=>teacherLogin()},'Hai già una password? Accedi')),
    h('p',{class:'sub small'},h('a',{href:'./',onclick:()=>{location.hash='';setTimeout(()=>location.reload(),0)}},'← Area studenti')),footer());
}
async function teacherHome(){
  S.prev=null;
  mount(tHeader(),h('h2',{class:'sect'},'Corsi e alunni'),h('p',{class:'sub'},'Caricamento…'),tTabs('corsi'));
  const [cs,en]=await Promise.all([
    sb.from('courses').select('id,school_id,name,level,kind,language,start_date,zoom_url,chat_url').eq('active',true).order('name'),
    sb.from('enrollments').select('course_id,section,students(id,display_name,code,consent_at)')
  ]);
  if(cs.error||en.error)return mount(tHeader(),h('p',{class:'err'},'Errore nel caricamento. Il tuo account ha un profilo docente?'),tTabs('corsi'),footer());
  const csSorted=sortCourses(cs.data);
  const homeC=csSorted.find(x=>x.id===S.homeC)||csSorted[0];
  const casc=csSorted.length>1?courseCascade(csSorted,homeC&&homeC.id,n=>{S.homeC=n.id;teacherHome()}):null;
  const blocks=csSorted.filter(c=>!casc||c.id===homeC.id).map(c=>{
    const studs=en.data.filter(e=>e.course_id===c.id&&e.students).sort((a,b)=>a.students.display_name.localeCompare(b.students.display_name));
    return h('section',{class:'card'},h('h2',null,c.name),h('p',{class:'sub'},(c.level?c.level+' · ':'')+studs.length+' studenti'),
      h('div',{class:'rows'},studs.map(e=>h('button',{class:'row-item',onclick:()=>studentSheet(e.students,c)},
        h('span',{class:'ri-l'},e.students.display_name,e.section?h('span',{class:'tag'},e.section==='morning'?'mattina':e.section==='evening'?'sera':e.section):null),
        h('span',{class:'ri-r'},e.students.consent_at?'':h('span',{class:'small'},'consenso mancante'),ico('chev'))))),
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>teacherLessons(c,csSorted)},'Lezioni ed esercizi'),h('button',{class:'secondary',onclick:()=>unlockView(c)},'Sblocca lezioni'),
        h('button',{class:'secondary',onclick:()=>teacherAnnouncements(c)},'Avvisi'),h('button',{class:'secondary',onclick:()=>teacherWhiteboards(c)},'Lavagne'),h('button',{class:'secondary',onclick:async()=>{const v=await askText('Link della chat','Gruppo WhatsApp: incolla il link d’invito. Chat singola: https://wa.me/39… (lascia vuoto per cancellare)',c.chat_url||'','Salva');if(v===null)return;const u=v.trim();if(u&&!/^https:\/\//.test(u)){await say('Link non valido','Il link deve iniziare con https://');return}const {error}=await sb.from('courses').update({chat_url:u||null}).eq('id',c.id);if(error)await say('Non salvato',error.message);teacherHome()}},c.chat_url?'Chat ✓':'Chat'),c.chat_url?h('a',{class:'secondary btnlink',href:c.chat_url,target:'_blank',rel:'noopener'},'Apri chat'):null,h('button',{class:'secondary',onclick:async()=>{const v=await askText('Link Zoom del corso','Incolla il link (lascia vuoto per cancellarlo)',c.zoom_url||'','Salva');if(v===null)return;const {error}=await sb.from('courses').update({zoom_url:v.trim()||null}).eq('id',c.id);if(error)await say('Non salvato',error.message);teacherHome()}},c.zoom_url?'Link Zoom ✓':'Link Zoom'),h('button',{class:'secondary',onclick:()=>teacherAttendance(c)},'Presenze del corso'),h('button',{class:'secondary',onclick:()=>courseHistoryView(c)},'Storico classe')));
  });
  mount(tHeader(),h('h2',{class:'sect'},'Corsi e alunni'),casc,blocks.length?blocks:h('p',{class:'sub'},'Nessun corso assegnato.'),tTabs('corsi'),footer());
}


/* ---------- lavagne ---------- */
const wbUrl=p=>CFG.url+'/storage/v1/object/public/lavagne/'+p;
const isImg=w=>(w.mime||'').startsWith('image/');
function wbThumb(w,onclick){
  return h('button',{class:'wb-th',onclick,'aria-label':'Apri '+(w.title||'lavagna')},
    isImg(w)?h('img',{src:wbUrl(w.path),alt:'',loading:'lazy'}):h('span',{class:'wb-pdf'},'📄'),
    h('span',{class:'wb-t'},w.title||'Lavagna'));
}
async function wbDownload(w){
  try{const r=await fetch(wbUrl(w.path));const b=await r.blob();const u=URL.createObjectURL(b);
    const ext=(w.path.split('.').pop()||'bin');
    const a=h('a',{href:u,download:'Lavagna_L'+w.lesson+'_'+(w.title||'').replace(/[^\w]+/g,'_')+'.'+ext});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
  catch(e){window.open(wbUrl(w.path),'_blank')}
}
function wbPreview(w){
  const close=()=>ov.remove();
  const body=isImg(w)?h('img',{src:wbUrl(w.path),alt:w.title||'Lavagna',class:'wb-big'}):h('iframe',{src:wbUrl(w.path),class:'wb-frame',title:w.title||'Lavagna'});
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},
    h('div',{class:'wb-modal',role:'dialog'},
      h('p',null,h('strong',null,'Lezione '+w.lesson+(w.title?' · '+w.title:''))),
      body,
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>wbDownload(w)},'Scarica'),
        h('a',{class:'secondary btnlink',href:wbUrl(w.path),target:'_blank',rel:'noopener'},'Apri'),
        h('button',{class:'secondary',onclick:close},'Chiudi'))));
  document.body.append(ov);
}
async function lavagneView(sel){
  mount(tabHeader(),h('h3',{class:'sect'},'Lavagne'),h('p',{class:'sub'},'Caricamento…'),tabs('lav'));
  let list=[];let off=false;
  try{const {data,error}=await sb.rpc('student_whiteboards',{p_code:S.code});if(error)throw error;list=data||[];LS.set('esmet_wb',list)}
  catch(e){list=LS.get('esmet_wb',[]);off=true}
  const c=curCourse();
  list=list.filter(w=>!c||w.course_id===c.id);
  const nums=[...new Set(list.map(w=>w.lesson))].sort((a,b)=>b-a);
  if(!nums.length)return mount(tabHeader(),h('h3',{class:'sect'},'Lavagne'),h('p',{class:'sub'},'Nessuna lavagna disponibile per ora.'),tabs('lav'),footer());
  const cur=sel&&nums.includes(sel)?sel:nums[0];
  const selL=h('select',{class:'txt sel','aria-label':'Lezione'},nums.map(n=>h('option',{value:n,selected:n===cur},'Lezione '+n)));
  selL.addEventListener('change',()=>lavagneView(+selL.value));
  const items=list.filter(w=>w.lesson===cur);
  mount(tabHeader(),h('h3',{class:'sect'},'Lavagne'),
    off?h('p',{class:'sub small'},'Sei offline: elenco dell’ultimo accesso.'):null,
    h('div',{class:'row'},h('span',{class:'chip'},c?c.name:''),selL),
    h('div',{class:'wb-grid'},items.map(w=>wbThumb(w,()=>wbPreview(w)))),
    tabs('lav'),footer());
}

/* docente: carica e gestisci lavagne di un corso */
async function teacherWhiteboards(c){
  const back=()=>teacherHome();
  mount(topbar('Lavagne · '+c.name,back),h('p',{class:'sub'},'Caricamento…'));
  const {data,error}=await sb.from('whiteboards').select('id,course_id,lesson_number,title,path,mime').eq('course_id',c.id).order('lesson_number',{ascending:false});
  if(error)return mount(topbar('Lavagne',back),h('p',{class:'err'},'Errore nel caricamento.'));
  const list=data.map(w=>({...w,lesson:w.lesson_number}));
  const num=h('input',{class:'txt',type:'number',min:'1',max:'200',placeholder:'N. lezione','aria-label':'Numero lezione'});
  const ttl=h('input',{class:'txt',type:'text',placeholder:'Titolo (facoltativo)','aria-label':'Titolo'});
  const file=h('input',{type:'file',accept:'image/*,application/pdf',multiple:'multiple'});
  const msg=h('p',{role:'status'});
  const up=h('button',{class:'primary',onclick:async()=>{
    const n=parseInt(num.value,10);const fs=[...file.files];
    if(!n||n<1){msg.className='err';msg.textContent='Scrivi il numero della lezione.';return}
    if(!fs.length){msg.className='err';msg.textContent='Scegli almeno un file (foto o PDF).';return}
    up.disabled=true;msg.className='sub';msg.textContent='Caricamento…';
    let ok=0;
    for(const f of fs){
      const ext=((f.name.split('.').pop()||'bin')+'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=c.id+'/'+crypto.randomUUID()+'.'+ext;
      const u=await sb.storage.from('lavagne').upload(path,f,{contentType:f.type||undefined});
      if(u.error){msg.className='err';msg.textContent='Caricamento non riuscito: '+u.error.message;up.disabled=false;return}
      const t=ttl.value.trim()||(fs.length>1?f.name.replace(/\.[^.]+$/,''):'');
      const r=await sb.from('whiteboards').insert({school_id:c.school_id,course_id:c.id,lesson_number:n,title:t||null,path,mime:f.type||null});
      if(r.error){await sb.storage.from('lavagne').remove([path]);msg.className='err';msg.textContent='Salvataggio non riuscito: '+r.error.message;up.disabled=false;return}
      ok++;
    }
    teacherWhiteboards(c);
  }},'Carica');
  const byN={};list.forEach(w=>(byN[w.lesson]=byN[w.lesson]||[]).push(w));
  const groups=Object.keys(byN).sort((a,b)=>b-a).map(n=>h('div',{class:'card'},h('h3',null,'Lezione '+n),
    h('div',{class:'wb-grid'},byN[n].map(w=>h('div',{class:'wb-cell'},wbThumb(w,()=>wbPreview(w)),
      h('div',{class:'row wb-act'},
        h('button',{class:'secondary small',onclick:async()=>{
          const fi=h('input',{type:'file',accept:'image/*,application/pdf'});
          const note=h('textarea',{class:'txt',rows:'2',placeholder:'Perché la sostituisci? (facoltativo, lo vedono gli alunni)','aria-label':'Motivo della sostituzione'});
          const err=h('p',{class:'err'});
          const ok=await dlg('Sostituisci la lavagna · lezione '+w.lesson,[h('p',{class:'sub small'},'Scegli il nuovo file. Gli alunni del corso riceveranno una notifica per riscaricarla.'),fi,note,err],close=>[
            h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),
            h('button',{class:'primary',onclick:async e=>{
              const f=fi.files[0];if(!f){err.textContent='Scegli un file.';return}
              e.target.disabled=true;err.textContent='';
              const ext=((f.name.split('.').pop()||'bin')+'').toLowerCase().replace(/[^a-z0-9]/g,'');
              const path=c.id+'/'+crypto.randomUUID()+'.'+ext;
              const u=await sb.storage.from('lavagne').upload(path,f,{contentType:f.type||undefined});
              if(u.error){err.textContent='Caricamento non riuscito: '+u.error.message;e.target.disabled=false;return}
              const r=await sb.rpc('teacher_replace_whiteboard',{p_id:w.id,p_path:path,p_mime:f.type||null,p_note:note.value.trim()||null});
              if(r.error){await sb.storage.from('lavagne').remove([path]);err.textContent='Sostituzione non riuscita: '+r.error.message;e.target.disabled=false;return}
              if(r.data)await sb.storage.from('lavagne').remove([r.data]);
              close(true)}},'Sostituisci')]);
          if(ok)teacherWhiteboards(c)}},'Sostituisci'),
        h('button',{class:'secondary small',onclick:async()=>{
          if(!await askYes('Eliminare la lavagna?','Gli alunni non la vedranno più. L’operazione non si può annullare.','Elimina'))return;
          const d=await sb.from('whiteboards').delete().eq('id',w.id);
          if(d.error){await say('Non eliminata',d.error.message);return}
          await sb.storage.from('lavagne').remove([w.path]);teacherWhiteboards(c)}},'Elimina')))))));
  mount(topbar('Lavagne · '+c.name,back),
    h('div',{class:'card'},h('h3',null,'Carica una lavagna'),h('p',{class:'sub small'},'Foto/screenshot o PDF (max 20 MB). Gli alunni del corso la vedono subito nella sezione Lavagne, sotto il numero di lezione indicato.'),num,ttl,file,up,msg),
    groups.length?groups:h('p',{class:'sub'},'Ancora nessuna lavagna caricata.'),footer());
}


/* ---------- amministratore (Emanuela) ---------- */
const APPURL='https://cicciopalma87.github.io/esmet-pwa/';
const LANGS=['Tedesco','Inglese','Francese','Spagnolo','Italiano'];
const isAdm=()=>S.role==='admin'||S.role==='secretary';
const A={ov:null,staff:null,sel:new Set(),q:''};
async function routeStaff(){
  const {data}=await sb.auth.getSession();
  const uid=data.session&&data.session.user&&data.session.user.id;
  let role=null;
  if(uid){const r=await sb.from('profiles').select('role,blocked').eq('id',uid).maybeSingle();role=r.data&&r.data.role;
    if(r.data&&r.data.blocked){await sb.auth.signOut();teacherLogin('Accesso sospeso dalla scuola. Contatta l’amministrazione.');return}}
  S.role=role;
  if(role==='admin'||role==='secretary')return adminHome('alunni');
  return teacherCal();
}
function aDrawer(){
  const close=()=>ov.remove();
  const it=(em,l,fn,sub)=>h('button',{class:'dr-item'+(sub?' dr-sub':''),onclick:()=>{close();fn()}},h('span',{class:'dr-em','aria-hidden':'true'},em),l);
  const panel=h('div',{class:'dr-panel',role:'dialog','aria-label':'Menu'},
    h('p',{class:'dr-title'},'Esmet Academy · amministrazione'),
    h('p',{class:'dr-group'},'Anagrafiche'),
    it('🧑‍🎓','Alunni',()=>adminHome('alunni'),1),it('🏫','Classi',()=>adminHome('classi'),1),it('👩‍🏫','Docenti',()=>adminHome('docenti'),1),
    h('p',{class:'dr-group'},'Comunicazioni'),it('📢','Avvisi',()=>adminAnnouncements(),1),
    h('p',{class:'dr-group'},'Report'),it('📊','Report ed esportazioni',()=>adminReports(),1),
    h('p',{class:'dr-group'},'Calendario'),it('📅','Calendario e presenze',()=>adminMonth(),1),
    h('p',{class:'dr-group'},'Contabilità'),it('💶','Entrate',()=>adminConto('entrate'),1),it('🧾','Uscite',()=>adminConto('uscite'),1),
    h('hr'),it('🚪','Esci',async()=>{await sb.auth.signOut();teacherLogin()}),
    h('p',{class:'dr-ver'},'Ver '+CFG.version));
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},panel);document.body.append(ov);
}
function aTabs(active){
  const an=['alunni','classi','docenti'].includes(active)?'anag':active;
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(an===id?' on':''),onclick:fn},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('anag','Anagrafiche','🗂️',()=>adminHome('alunni')),t('cal','Calendario','📅',()=>adminMonth()),t('rep','Report','📊',()=>adminReports()),t('conto','Contabilità','💶',()=>adminConto('entrate')));
}
function aHeader(){
  return h('div',{class:'thead2'},h('div',{class:'thead-top'},
    h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('div',{class:'row',style:'gap:8px'},bellBtn(true,()=>adminHome()),h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:aDrawer},ico('menu')))));
}
function subNav(items,active){
  return h('div',{class:'subnav'},items.map(([id,l,fn])=>h('button',{class:'seg'+(id===active?' on':''),onclick:fn},l)));
}
function adminConto(sub){
  const info=sub==='entrate'?['Entrate','Qui registrerai gli abbonamenti pagati dagli alunni (importo, data, periodo coperto) e vedrai chi è in ritardo per il corso successivo, con un avviso da inviare.']:['Uscite','Qui registrerai i pagamenti in uscita e calcolerai il compenso di ogni docente in base ai corsi svolti (anche più corsi in contemporanea).'];
  mount(aHeader(),h('h2',{class:'sect'},'Contabilità'),subNav([['entrate','Entrate',()=>adminConto('entrate')],['uscite','Uscite',()=>adminConto('uscite')]],sub),
    h('div',{class:'card'},h('h3',null,info[0]),h('p',{class:'sub'},info[1]),h('p',{class:'sub small'},'In preparazione: sezione non ancora attiva.')),aTabs('conto'),footer());
}
function selEl(opts,val,label){
  const s=h('select',{class:'txt','aria-label':label||''},...opts.map(o=>h('option',{value:o[0]},o[1])));
  s.value=val==null?'':val;return s;
}
/* ordine di visualizzazione dei corsi: prima i gruppi, poi le conversazioni, poi gli individuali */
const KORD={group:0,conversation:1,individual:2};
function sortCourses(list){
  return (list||[]).slice().sort((a,b)=>(KORD[a.kind]??9)-(KORD[b.kind]??9)||(LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level))||String(a.name).localeCompare(String(b.name)));
}
/* etichetta breve nel menù «Corso»: individuali = solo il nome dell'alunno; gruppi e conversazioni = nome + data di inizio */
function courseLabel(c){
  if(c.kind==='individual'){const m=/individuale\s+(.+)$/i.exec(c.name);return m?m[1]:c.name}
  const d=c.start_date?new Date(c.start_date+'T12:00:00'):null;
  return c.name+(d?' - del '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(2):'');
}
/* tre menù a cascata: Lingua → Tipologia → Livello (e, solo se restano più corsi, il corso) */
function courseCascade(list,curId,onPick,opts){
  opts=opts||{};
  const all=sortCourses(list);
  const cur=all.find(x=>x.id===curId)||all[0];
  const wrap=h('div',{class:'casc'});
  const st={lang:cur&&(cur.language||'Tedesco'),kind:cur&&cur.kind,level:cur&&cur.level,id:cur&&cur.id};
  const draw=()=>{
    const langs=[...new Set(all.map(x=>x.language||'Tedesco'))];
    if(!langs.includes(st.lang))st.lang=langs[0];
    const inL=all.filter(x=>(x.language||'Tedesco')===st.lang);
    const kinds=[...new Set(inL.map(x=>x.kind))].sort((a,b)=>(KORD[a]??9)-(KORD[b]??9));
    if(!kinds.includes(st.kind))st.kind=kinds[0];
    const inK=inL.filter(x=>x.kind===st.kind);
    const noLv=st.kind==='individual';
    const levels=noLv?[]:[...new Set(inK.map(x=>x.level))].sort((a,b)=>LEVELS.indexOf(a)-LEVELS.indexOf(b));
    if(noLv)st.level=null;else if(!levels.includes(st.level))st.level=levels[0];
    const match=noLv?inK:inK.filter(x=>x.level===st.level);
    if(!match.find(x=>x.id===st.id))st.id=match[0]&&match[0].id;
    const mk=(label,vals,val,txt,fn)=>{const e=selEl(vals.map(v=>[v,txt(v)]),val,label);e.disabled=vals.length<2;e.onchange=()=>fn(e.value);return h('label',{class:'small'},label,e)};
    const parts=[
      mk('Lingua',langs,st.lang,v=>v,v=>{st.lang=v;st.kind=null;st.level=null;st.id=null;draw();fire()}),
      mk('Tipologia',kinds,st.kind,v=>KL[v]||v,v=>{st.kind=v;st.level=null;st.id=null;draw();fire()}),
      ...(noLv?[]:[mk('Livello',levels,st.level,v=>v,v=>{st.level=v;st.id=null;draw();fire()})])];
    if(match.length>1)parts.push(mk('Corso',match.map(x=>x.id),st.id,v=>{const x=match.find(y=>y.id===v);return opts.label?opts.label(x):courseLabel(x)},v=>{st.id=v;fire()}));
    wrap.replaceChildren(...parts);
  };
  let first=true;
  const fire=()=>{const c=all.find(x=>x.id===st.id);if(c&&onPick)onPick(c)};
  draw();
  return wrap;
}
async function adminLoad(){
  const [o,s]=await Promise.all([sb.rpc('admin_overview'),sb.rpc('admin_staff_list')]);
  if(o.error||s.error)throw (o.error||s.error);
  A.ov=o.data;A.staff=s.data;
  A.ov.courses=sortCourses(A.ov.courses||[]);
  try{const sd=await sb.from('courses').select('id,start_date');const m={};(sd.data||[]).forEach(x=>m[x.id]=x.start_date);(A.ov.courses||[]).forEach(c=>{c.start_date=m[c.id]||c.start_date||null})}catch(e){}
}
async function adminHome(tab){
  tab=tab||'alunni';
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs(tab));
  try{await adminLoad()}catch(e){mount(aHeader(),h('p',{class:'err'},'Non riesco a caricare i dati: '+(e.message||e)),aTabs(tab));return}
  const body=tab==='classi'?adminClassi():tab==='docenti'?adminDocenti():adminAlunni();
  mount(aHeader(),subNav([['alunni','Alunni',()=>adminHome('alunni')],['classi','Classi',()=>adminHome('classi')],['docenti','Docenti',()=>adminHome('docenti')]],tab),body,aTabs(tab));
}
/* ordina una lista di corsi (o di id) come nell'elenco classi: gruppi, conversazioni, individuali */
const cOrd=id=>{const i=A.ov.courses.findIndex(x=>x.id===id);return i<0?9999:i};
const byCOrd=(l,get)=>(l||[]).slice().sort((a,b)=>cOrd(get?get(a):a)-cOrd(get?get(b):b));
const courseName=(id,noT)=>{const c=A.ov.courses.find(x=>x.id===id);return c?shortName(c,noT):'?'};
const KL={group:'Gruppo',conversation:'Conversazione',individual:'Individuale'};
const LEVELS=['A1','A2','B1','B2','C1','C2'];
function shortName(c,noT){
  const lg=c.language&&c.language!=='Tedesco'?c.language+' · ':'';
  const t=noT?'':' - '+(c.teacher||'Nessun docente');
  if(c.kind==='individual'){const m=/individuale\s+(.+)$/i.exec(c.name);return lg+'Ind. '+(m?m[1]:c.name)+t}
  return lg+c.level+(c.kind==='group'?' Gruppo':' Conv.')+t;
}
const fromOpts=ids=>ids.map(i=>{const c=A.ov.courses.find(x=>x.id===i);return [i,c?shortName(c):'?']});
function lab(t){return h('p',{class:'sub small fld'},t)}
/* selezione a cascata: Lingua → Docente → Tipo → Livello */
function classPicker(o){
  o=o||{};
  const kinds=o.noIndividual?['group','conversation']:['group','conversation','individual'];
  const lg=selEl(LANGS.map(x=>[x,x]),'Tedesco','Lingua');
  const dc=selEl([],'__','Docente');
  const kd=selEl(kinds.map(k=>[k,KL[k]]),'group','Tipo di corso');
  const lv=selEl(LEVELS.map(x=>[x,x]),'A1','Livello');
  const lvW=h('div',null,lab('Livello'),lv);
  const LV=()=>kd.value==='individual'?null:lv.value;
  const info=h('p',{class:'sub small',role:'status'});
  const fillT=()=>{
    const all=A.staff.staff.filter(p=>p.role==='teacher'&&!p.blocked);
    let ts=all.filter(p=>(p.languages||[]).includes(lg.value));if(!ts.length)ts=all;
    const cur=dc.value;dc.replaceChildren(...[['__','— scegli il docente —'],['','Nessun docente (per ora)'],...ts.map(p=>[p.id,p.name])].map(o=>h('option',{value:o[0]},o[1])));
    dc.value=(cur===''||ts.some(p=>p.id===cur))?cur:'__';
  };
  const cl=selEl([],'','Classe');const clW=h('div',{hidden:'hidden'},lab('Classe'),cl);
  const sd=h('input',{class:'txt',type:'date',value:isoD(new Date()),'aria-label':'Data di inizio corso'});const sdW=h('div',{hidden:'hidden'},lab('Data di inizio corso'),sd);
  const matchesOf=sel=>sel.kind==='individual'?[]:A.ov.courses.filter(c=>c.active!==false&&c.language===sel.language&&(c.teacher_id||null)===sel.teacher&&c.kind===sel.kind&&c.level===sel.level);
  const get=()=>{
    const sel={language:lg.value,teacher:dc.value==='__'?undefined:(dc.value||null),kind:kd.value,level:LV()};
    if(sel.kind!=='individual'&&sel.teacher!==undefined){
      const m=matchesOf(sel);
      if(o.noIndividual||!m.length||cl.value==='__new'||!cl.value){sel.start=sd.value||isoD(new Date());sel.courseId=null;if(!o.noIndividual&&m.some(c=>c.start_date===sel.start))sel.dup=true}
      else sel.courseId=cl.value;
    }
    return sel;
  };
  const upd=()=>{
    fillT();
    const sel0={language:lg.value,teacher:dc.value==='__'?undefined:(dc.value||null),kind:kd.value,level:LV()};
    lv.disabled=false;lvW.hidden=kd.value==='individual';
    clW.hidden=true;sdW.hidden=true;
    if(sel0.teacher===undefined){info.textContent='';return}
    const nm=o.getName?o.getName():'';
    if(sel0.kind!=='individual'){
      const m=matchesOf(sel0);
      if(m.length&&!o.noIndividual){
        const prev=cl.value;
        cl.replaceChildren(...[...m.map(c=>[c.id,courseLabel(c)]),['__new','Nuova classe (altra data di inizio)']].map(x=>h('option',{value:x[0]},x[1])));
        cl.value=[...cl.options].some(x=>x.value===prev)?prev:(m.length===1?m[0].id:'');
        if(!cl.value){cl.value=m[0].id}
        clW.hidden=false;
      }
      const g=get();
      sdW.hidden=!(g.courseId==null);
      if(g.courseId==null){
        const dup=m.find(c=>c.start_date===g.start);
        info.className=dup?'err small':'sub small';
        info.textContent=dup?'Esiste già questa classe ('+courseLabel(dup)+'): verifica i dati inseriti.':'Nuova classe: '+courseTitle(sel0,nm)+' del '+(g.start||'').split('-').reverse().join('/')+' (verrà creata)';
      }else{info.className='sub small';info.textContent='Classe esistente: '+shortName(A.ov.courses.find(c=>c.id===g.courseId))}
      return;
    }
    const ex=findCourse(sel0,nm);
    info.className='sub small';info.textContent=ex?'Classe esistente: '+shortName(ex):'Nuova classe: '+courseTitle(sel0,nm)+' (verrà creata)';
  };
  [lg,dc,kd,lv,cl,sd].forEach(e=>e.addEventListener('change',upd));
  lg.addEventListener('change',()=>{dc.value='__'});
  upd();
  return {node:h('div',{class:'picker'},lab('Lingua'),lg,lab('Docente'),dc,lab('Tipo di corso'),kd,lvW,clW,sdW,info),get,refresh:upd};
}
function courseTitle(sel,nm){
  return sel.kind==='individual'?sel.language+' - corso individuale '+(nm||'…'):sel.kind==='group'?sel.language+' '+sel.level+' - gruppo':sel.language+' '+sel.level+' - conversazione';
}
function findCourse(sel,nm){
  if(sel.courseId)return A.ov.courses.find(c=>c.id===sel.courseId);
  const base=A.ov.courses.filter(c=>c.language===sel.language&&(c.teacher_id||null)===sel.teacher&&c.kind===sel.kind&&
    (sel.kind==='individual'?norm(c.name).includes(norm(nm)):c.level===sel.level));
  if(sel.kind!=='individual'&&sel.start)return base.find(c=>c.start_date===sel.start);
  return base[0];
}
async function resolveCourse(sel,nm){
  const ex=findCourse(sel,nm);if(ex)return ex.id;
  const {data,error}=await sb.rpc('admin_create_course',{p_name:courseTitle(sel,nm),p_level:sel.kind==='individual'?null:sel.level,p_kind:sel.kind,p_teacher:sel.teacher||null,p_language:sel.language,p_start:sel.start||null});
  if(error)throw error;
  A.ov.courses.push({id:data,name:courseTitle(sel,nm),level:sel.level,kind:sel.kind,teacher_id:sel.teacher,language:sel.language,start_date:sel.start||isoD(new Date()),teacher:(A.staff.staff.find(p=>p.id===sel.teacher)||{}).name||null});
  return data;
}
function inviteText(name,code){
  return 'Ciao '+name+', ecco il tuo codice per entrare in Esmet Academy: '+code+'\nApri '+APPURL+' e inseriscilo al primo accesso: poi potrai scegliere email e password.';
}
async function showCode(r){
  const txt=inviteText(r.name,r.code);const msg=h('p',{class:'sub small',role:'status'});
  await dlg('Alunno creato',[h('p',{class:'sub'},r.name+' · codice:'),h('p',{class:'code-big',style:'font-size:28px;letter-spacing:4px;font-weight:700;text-align:center'},r.code),
    h('textarea',{class:'txt',rows:'4',readonly:true},txt),msg],close=>[
    h('button',{class:'secondary',onclick:()=>close(true)},'Chiudi'),
    h('button',{class:'primary',onclick:async()=>{try{await navigator.clipboard.writeText(txt);msg.textContent='Copiato: incollalo su WhatsApp o email.'}catch(e){msg.textContent='Seleziona e copia il testo.'}}},'Copia messaggio')]);
}
function adminAlunni(){
  const list=h('div',{class:'rows'});const bar=h('div',{class:'bar-row'});
  const cf=selEl([['','Tutte le classi'],['none','Senza classe'],...A.ov.courses.map(c=>[c.id,shortName(c)])],A.cfs||'','Filtra per classe');
  cf.addEventListener('change',()=>{A.cfs=cf.value;draw()});
  const draw=()=>{
    const q=norm(A.q);
    list.replaceChildren(...A.ov.students.filter(s=>(!q||norm(s.name).includes(q)||norm(s.code).includes(q))&&(!A.cfs||(A.cfs==='none'?!s.course_ids.length:s.course_ids.includes(A.cfs)))).map(s=>{
      const cb=h('input',{type:'checkbox','aria-label':'Seleziona '+s.name});cb.checked=A.sel.has(s.id);
      cb.addEventListener('change',()=>{cb.checked?A.sel.add(s.id):A.sel.delete(s.id);drawBar()});
      return h('label',{class:'chk-row'},cb,h('span',{style:'flex:1'},h('strong',null,s.name),' ',h('span',{class:'sub small'},s.code+(s.has_account?' · account email':'')),
        h('br'),s.course_ids.length?byCOrd(s.course_ids).map(i=>h('span',{class:'ctag'},courseName(i))):h('span',{class:'sub small'},'nessuna classe')),
        s.active===false?h('span',{class:'tag'},'non attivo'):null,h('button',{class:'secondary sm',onclick:e=>{e.preventDefault();studentDetail(s.id)}},'Modifica'));
    }));
    if(!list.children.length)list.append(h('p',{class:'sub'},'Nessun alunno.'));
  };
  const drawBar=()=>{
    const n=A.sel.size;
    bar.replaceChildren(h('span',{class:'sub small'},n+' selezionati'),
      h('button',{class:'secondary',disabled:n?null:true,onclick:()=>assignDlg('assign')},'Assegna a classe'),
      h('button',{class:'secondary',disabled:n?null:true,onclick:()=>assignDlg('move')},'Sposta'));
  };
  const q=h('input',{class:'txt',type:'search',placeholder:'Cerca nome o codice',value:A.q});
  q.addEventListener('input',()=>{A.q=q.value;draw()});
  draw();drawBar();
  return h('div',null,h('h2',{class:'sect'},'Alunni'),
    h('button',{class:'primary',onclick:newStudent},'+ Nuovo alunno'),q,cf,bar,list);
}
async function newStudent(){
  const nm=h('input',{class:'txt',type:'text',placeholder:'Nome e cognome'});
  const pk=classPicker({getName:()=>nm.value.trim()});
  nm.addEventListener('input',pk.refresh);
  const use=h('input',{type:'checkbox'});use.checked=true;
  const box=h('div',null,pk.node);
  use.addEventListener('change',()=>{box.hidden=!use.checked});
  const err=h('p',{class:'err',role:'alert'});
  const v=await dlg('Nuovo alunno',[nm,h('label',{class:'chk-row'},use,'Inseriscilo subito in una classe'),box,h('p',{class:'sub small'},'Il codice viene generato automaticamente.'),err],close=>[
    h('button',{class:'secondary',onclick:()=>close(null)},'Annulla'),
    h('button',{class:'primary',onclick:()=>{
      if(!nm.value.trim()){err.textContent='Inserisci nome e cognome.';return}
      if(use.checked&&pk.get().teacher===undefined){err.textContent='Scegli il docente (o "Nessun docente").';return}
      if(use.checked&&pk.get().dup){err.textContent='Esiste già una classe con questa data di inizio: verifica i dati inseriti.';return}
      close({n:nm.value.trim(),use:use.checked,sel:pk.get()})}},'Crea')]);
  if(!v)return;
  try{
    const cid=v.use?await resolveCourse(v.sel,v.n):null;
    const {data,error}=await sb.rpc('admin_create_student',{p_name:v.n,p_course:cid});
    if(error)throw error;
    await showCode(data);
  }catch(e){return say('Errore',e.message||String(e))}
  adminHome('alunni');
}
async function assignDlg(mode){
  const ids=[...A.sel];
  const studs=A.ov.students.filter(s=>A.sel.has(s.id));
  const fromIds=[...new Set(studs.flatMap(s=>s.course_ids))];
  const from=selEl(fromOpts(fromIds),fromIds[0]||'','Dalla classe');
  const pk=classPicker({getName:()=>studs.length===1?studs[0].name:''});
  const err=h('p',{class:'err',role:'alert'});
  const nodes=mode==='move'?[lab('Dalla classe'),from,h('hr'),h('p',{class:'sub small'},'Nella nuova classe:'),pk.node,err]:[h('p',{class:'sub small'},studs.length+' alunni da aggiungere a:'),pk.node,err];
  const ok=await dlg(mode==='move'?'Sposta alunni':'Assegna a una classe',nodes,close=>[
    h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),
    h('button',{class:'primary',onclick:()=>{if(pk.get().teacher===undefined){err.textContent='Scegli il docente (o "Nessun docente").';return}if(pk.get().dup){err.textContent='Esiste già una classe con questa data di inizio: verifica i dati inseriti.';return}close(true)}},'Conferma')]);
  if(!ok)return;
  const sel=pk.get();
  try{
    if(sel.kind==='individual'){
      for(const s of studs){const to=await resolveCourse(sel,s.name);
        const r=mode==='move'?await sb.rpc('admin_move_students',{p_students:[s.id],p_from:from.value,p_to:to}):await sb.rpc('admin_assign_students',{p_students:[s.id],p_course:to});if(r.error)throw r.error}
    }else{
      const to=await resolveCourse(sel,'');
      const r=mode==='move'?await sb.rpc('admin_move_students',{p_students:ids,p_from:from.value,p_to:to}):await sb.rpc('admin_assign_students',{p_students:ids,p_course:to});if(r.error)throw r.error;
    }
  }catch(e){return say('Errore',e.message||String(e))}
  A.sel.clear();adminHome('alunni');
}
function adminClassi(){
  const F=A.cf||(A.cf={kind:'',teacher:''});
  const kd=selEl([['','Tutti i tipi'],...Object.entries(KL)],F.kind,'Tipo');
  const dc=selEl([['','Tutti i docenti'],...A.staff.staff.filter(p=>p.role==='teacher').map(p=>[p.id,p.name])],F.teacher,'Docente');
  const box=h('div');
  const draw=()=>{
    F.kind=kd.value;F.teacher=dc.value;
    const L=A.ov.courses.filter(c=>(!F.kind||c.kind===F.kind)&&(!F.teacher||c.teacher_id===F.teacher));
    box.replaceChildren(...(L.length?L:[null]).map(c=>{
      if(!c)return h('p',{class:'sub'},'Nessuna classe con questi filtri.');
      const stu=A.ov.students.filter(s=>s.course_ids.includes(c.id));
      return h('div',{class:'card'},h('h3',null,shortName(c),c.active===false?h('span',{class:'tag'},'non attiva'):null),
        h('p',{class:'sub small'},KL[c.kind]+' · '+(c.level?c.level+' · ':'')+c.language+(c.teacher?'':' · docente non assegnato')),
        h('p',{class:'sub small'},stu.length?stu.length+' alunni: '+stu.map(s=>s.name).join(', '):'Nessun alunno'),
        h('div',{class:'row'},h('button',{class:'secondary',onclick:()=>courseDetail(c.id)},'Modifica'),h('button',{class:'secondary',onclick:()=>changeTeacher(c)},'Cambia docente')));
    }));
  };
  kd.addEventListener('change',draw);dc.addEventListener('change',draw);draw();
  return h('div',null,h('h2',{class:'sect'},'Classi'),h('button',{class:'primary',onclick:newClass},'+ Nuova classe'),lab('Tipo di corso'),kd,lab('Docente'),dc,box);
}
const teacherOpts=()=>[['','— nessun docente —'],...A.staff.staff.filter(p=>p.role==='teacher').map(p=>[p.id,p.name])];
async function changeTeacher(c){
  const t=selEl(teacherOpts(),c.teacher_id||'','Docente');
  const ok=await dlg('Docente · '+shortName(c),[t],close=>[h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),h('button',{class:'primary',onclick:()=>close(true)},'Salva')]);
  if(!ok)return;
  const {error}=await sb.rpc('admin_set_course_teacher',{p_course:c.id,p_teacher:t.value||null});
  if(error)return say('Errore',error.message);adminHome('classi');
}
async function newClass(){
  const pk=classPicker({noIndividual:true});
  const err=h('p',{class:'err',role:'alert'});
  const ok=await dlg('Nuova classe',[pk.node,h('p',{class:'sub small'},'I corsi individuali si creano da soli quando inserisci o sposti un alunno.'),err],close=>[h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),h('button',{class:'primary',onclick:()=>{if(pk.get().teacher===undefined){err.textContent='Scegli il docente (o "Nessun docente").';return}if(pk.get().dup){err.textContent='Esiste già una classe con questa data di inizio: verifica i dati inseriti.';return}close(true)}},'Crea')]);
  if(!ok)return;
  try{if(findCourse(pk.get(),''))return say('Classe già presente','Esiste già una classe con la stessa lingua, tipologia, livello, docente e data di inizio: verifica i dati inseriti.');await resolveCourse(pk.get(),'')}catch(e){return say('Errore',e.message||String(e))}
  adminHome('classi');
}
function adminDocenti(){
  const st=A.staff.staff.filter(p=>p.role==='teacher').map(p=>h('div',{class:'card'},h('h3',null,p.name),
    h('p',{class:'sub small'},(p.email||'')+' · '+(p.languages||[]).join(', ')),
    h('p',{class:'sub small'},...(p.courses.length?byCOrd(p.courses,c=>c.id).map(c=>h('span',{class:'ctag'},courseName(c.id,true))):['Nessuna classe assegnata'])),
    p.blocked?h('p',{class:'err'},'Accesso bloccato'):null,
    p.role==='teacher'?h('div',{class:'row'},h('button',{class:'secondary',onclick:()=>staffDetail(p.id)},'Modifica'),
      h('button',{class:'secondary',onclick:async()=>{
        if(!await askYes(p.blocked?'Sblocca accesso':'Blocca accesso',p.blocked?p.name+' potrà di nuovo entrare nell’app.':p.name+' non potrà più entrare né vedere corsi e alunni. Le sue classi e i dati restano. Puoi sbloccarlo quando vuoi.',p.blocked?'Sblocca':'Blocca'))return;
        const {error}=await sb.rpc('admin_set_staff_blocked',{p_id:p.id,p_blocked:!p.blocked});
        if(error)return say('Errore',error.message);adminHome('docenti')}},p.blocked?'Sblocca accesso':'Blocca accesso')):null));
  const pe=A.staff.pending.map(i=>h('div',{class:'card'},h('h3',null,i.name||i.email),
    h('p',{class:'sub small'},i.email+' · invitato, non ancora registrato · '+(i.languages||[]).join(', ')),
    h('div',{class:'row'},h('button',{class:'secondary',onclick:()=>inviteMsg(i.email,i.name)},'Messaggio di invito'),
      h('button',{class:'secondary',onclick:async()=>{if(await askYes('Annullare invito',i.email,'Annulla invito')){await sb.rpc('admin_remove_invite',{p_email:i.email});adminHome('docenti')}}},'Annulla invito'))));
  return h('div',null,h('h2',{class:'sect'},'Docenti'),h('button',{class:'primary',onclick:()=>inviteDlg(null)},'+ Invita docente'),
    ...st,pe.length?h('h3',null,'Inviti in attesa'):null,...pe);
}
async function inviteMsg(email,name){
  const txt='Ciao'+(name?' '+name:'')+', sei stato abilitato come docente su Esmet Academy.\nApri '+APPURL+'#docente , scegli "Primo accesso" e registrati con questa email ('+email+'), poi conferma il link che ti arriva per posta.';
  const msg=h('p',{class:'sub small',role:'status'});
  await dlg('Messaggio di invito',[h('textarea',{class:'txt',rows:'5',readonly:true},txt),msg],close=>[
    h('button',{class:'secondary',onclick:()=>close(true)},'Chiudi'),
    h('button',{class:'primary',onclick:async()=>{try{await navigator.clipboard.writeText(txt);msg.textContent='Copiato.'}catch(e){msg.textContent='Seleziona e copia il testo.'}}},'Copia')]);
}
async function inviteDlg(p){
  const edit=!!p;
  const em=h('input',{class:'txt',type:'email',placeholder:'Email del docente',value:p?p.email:'',readonly:p?true:null});
  const nm=h('input',{class:'txt',type:'text',placeholder:'Nome e cognome',value:p?p.name:''});
  const lgs=LANGS.map(l=>{const c=h('input',{type:'checkbox'});c.checked=p?(p.languages||[]).includes(l):l==='Tedesco';return [l,c]});
  const keep=new Set(p?p.courses.map(c=>c.id):[]);
  const before=new Set(keep);
  const kd=selEl(['group','conversation','individual'].map(k=>[k,KL[k]]),'group','Tipo di corso');
  const lv=selEl(LEVELS.map(x=>[x,x]),'A1','Livello');
  const lvW=h('div',null,lab('Livello'),lv);
  const mineBox=h('div');const listBox=h('div',{class:'opts'});const warn=h('p',{class:'err',role:'alert'});const err=h('p',{class:'err',role:'alert'});
  const btnWrap=h('div',{class:'row',style:'flex-wrap:wrap;gap:8px;justify-content:flex-end'});
  let chosen=null,closeFn=null;
  const langs=()=>lgs.filter(x=>x[1].checked).map(x=>x[0]);
  const drawMine=()=>{
    mineBox.replaceChildren(...(edit?[lab('Classi attuali'),...(keep.size?byCOrd([...keep]).map(id=>h('span',{class:'ctag'},courseName(id,true),' ',h('button',{class:'xbtn','aria-label':'Togli classe',onclick:()=>{keep.delete(id);drawMine()}},'✕'))):[h('p',{class:'sub small'},'Nessuna classe assegnata')])]:[]));
  };
  const drawList=()=>{
    lvW.hidden=kd.value==='individual';
    const L=A.ov.courses.filter(c=>langs().includes(c.language)&&c.kind===kd.value&&(c.kind==='individual'||c.level===lv.value)&&!keep.has(c.id));
    if(chosen&&!L.some(c=>c.id===chosen.id))chosen=null;
    listBox.replaceChildren(...(L.length?L.map(c=>h('button',{class:'opt'+(chosen&&chosen.id===c.id?' on':''),onclick:()=>{chosen=(chosen&&chosen.id===c.id)?null:c;drawList()}},shortName(c))):[h('p',{class:'sub small'},'Nessuna classe di questo tipo e livello.')]));
    warn.textContent=chosen&&chosen.teacher_id&&chosen.teacher_id!==(p&&p.id)?'Attenzione: questo corso è già assegnato a '+chosen.teacher+'.':'';
    drawBtns();
  };
  const drawBtns=()=>{
    const b=(t,cls,fn,dis)=>h('button',{class:cls,disabled:dis?true:null,onclick:fn},t);
    btnWrap.replaceChildren(
      b('Annulla','secondary',()=>closeFn(null)),
      b(edit?'Salva':'Crea docente','primary',()=>go('plain')),
      chosen?b(edit?'Salva e assegna questo corso':'Crea docente ed assegna questo corso','primary',()=>go('assign'))
            :b(edit?'Salva e nuova classe':'Crea docente e nuova classe','primary',()=>go('new'),kd.value==='individual'));
  };
  const go=async mode=>{
    err.textContent='';
    if(!/.+@.+\..+/.test(em.value)){err.textContent='Inserisci una email valida.';return}
    if(!nm.value.trim()){err.textContent='Inserisci nome e cognome.';return}
    if(!langs().length){err.textContent='Scegli almeno una lingua.';return}
    if(mode==='assign'&&chosen.teacher_id&&chosen.teacher_id!==(p&&p.id)){
      const ok=await dlg('Corso già assegnato',[h('p',{class:'sub'},'Il corso è già assegnato a '+chosen.teacher+'. Vuoi procedere comunque?')],close=>[h('button',{class:'secondary',onclick:()=>close(false)},'No'),h('button',{class:'primary',onclick:()=>close(true)},'Sì')]);
      if(!ok)return;
    }
    closeFn({mode});
  };
  [kd,lv].forEach(e=>e.addEventListener('change',drawList));
  lgs.forEach(([l,c])=>c.addEventListener('change',drawList));
  drawMine();drawList();
  const v=await dlg(edit?'Modifica docente':'Invita docente',[em,nm,lab('Lingue insegnate'),...lgs.map(([l,c])=>h('label',{class:'chk-row'},c,l)),
    mineBox,h('hr'),lab('Assegna una classe (facoltativo)'),kd,lvW,lab('Classi già presenti'),listBox,warn,err],close=>{closeFn=close;return [btnWrap]});
  if(!v)return;
  try{
    const ids=new Set(keep);
    if(v.mode==='assign')ids.add(chosen.id);
    if(v.mode==='new'){
      const lg0=langs()[0];
      ids.add(await resolveCourse({language:lg0,teacher:null,kind:kd.value,level:kd.value==='individual'?null:lv.value},''));
    }
    const {error}=await sb.rpc('admin_invite_staff',{p_email:em.value,p_full_name:nm.value,p_role:'teacher',p_languages:langs(),p_course_ids:[...ids]});
    if(error)throw error;
    if(edit)for(const id of before)if(!ids.has(id)){const r=await sb.rpc('admin_set_course_teacher',{p_course:id,p_teacher:null});if(r.error)throw r.error}
  }catch(e){return say('Errore',e.message||String(e))}
  if(!edit)await inviteMsg(em.value.trim().toLowerCase(),nm.value);
  adminHome('docenti');
}

/* ---------- schede anagrafiche: modifica / elimina ---------- */
function fld(label,el){return h('div',{class:'fld2'},h('label',{class:'sub small'},label),el)}
function formPage(title,tab,backFn,blocks,onSave,onDelete){
  const err=h('p',{class:'err',role:'alert'});
  const save=h('button',{class:'primary',onclick:async()=>{err.textContent='';save.disabled=true;try{await onSave()}catch(e){err.textContent=e.message||String(e);save.disabled=false}}},'Salva');
  const bar=h('div',{class:'formbar'},
    onDelete?h('button',{class:'danger',onclick:onDelete},'Elimina'):h('span'),
    h('span',{style:'flex:1'}),h('button',{class:'secondary',onclick:backFn},'Annulla'),save);
  mount(aHeader(),h('div',{class:'row'},h('button',{class:'icon-btn','aria-label':'Indietro',onclick:backFn},ico('back')),h('h2',{class:'sect',style:'margin:0'},title)),...blocks,err,bar,aTabs(tab),footer());
}
async function confirmDelete(what,detail){
  return askYes('Eliminare '+what+'?','Sei sicuro? Questa azione è irreversibile. '+detail,'Elimina definitivamente');
}
async function studentDetail(id){
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs('alunni'));
  const r=await sb.rpc('admin_student_detail',{p_id:id});
  if(r.error)return say('Errore',r.error.message).then(()=>adminHome('alunni'));
  const s=r.data;
  const nm=h('input',{class:'txt',type:'text',value:s.name});
  const ph=h('input',{class:'txt',type:'tel',value:s.phone||'',placeholder:'Telefono'});
  const ci=h('input',{class:'txt',type:'text',value:s.city||''});
  const bd=h('input',{class:'txt',type:'date',value:s.birth||''});
  const ac=selEl([['1','Attivo'],['0','Non attivo (non può più entrare, lo storico resta)']],s.active?'1':'0','Stato');
  const nt=h('textarea',{class:'txt',rows:'4',maxlength:'2000',placeholder:'Note interne (visibili solo all’amministrazione)'});nt.value=s.notes||'';
  const starts=[];
  const storico=s.courses.length?byCOrd(s.courses,c=>c.course_id).map(c=>{
    const sd=h('input',{class:'txt',type:'date',value:c.start_date||'','aria-label':'In classe dal'});starts.push({course:c.course_id,el:sd,old:c.start_date||''});
    return h('div',{class:'card'},h('strong',null,courseName(c.course_id)),
      h('p',{class:'sub small'},'Presenze '+c.present+' · assenze '+c.absent+(c.takes_exam?'':' · non sostiene l’esame')),
      fld('Compare nell’elenco presenze dal giorno',sd),
      h('p',{class:'sub small'},'Lascia vuoto per mostrarlo anche nei giorni passati.'))}):[h('p',{class:'sub small'},'Nessuna classe.')];
  const acc=h('div',{class:'card'},h('p',{class:'sub small'},'Codice alunno: ',h('strong',null,s.code)),
    h('p',{class:'sub small'},s.has_account?'Accesso con email: '+(s.email||''):'Non ha ancora creato email e password.'),
    h('p',{class:'sub small'},s.consent_at?'Informativa accettata il '+fmtDate(s.consent_at).slice(0,10):'Informativa non ancora accettata.'),
    h('button',{class:'secondary',onclick:()=>showCode({name:s.name,code:s.code})},'Messaggio con il codice'));
  formPage(s.name,'alunni',()=>adminHome('alunni'),[
    fld('Nome e cognome',nm),fld('Telefono',ph),fld('Città',ci),fld('Data di nascita',bd),fld('Stato',ac),fld('Note',nt),
    h('h3',null,'Accesso'),acc,h('h3',null,'Storico corsi'),...storico,
    h('h3',null,'Storico presenze'),await studentHistoryBox(id),
    h('h3',null,'Esami'),h('p',{class:'sub small'},'Lo storico degli esami comparirà qui. Esercizi svolti finora: '+s.results+'.')],
    async()=>{const x=await sb.rpc('admin_update_student',{p_id:id,p_name:nm.value,p_phone:ph.value,p_city:ci.value,p_birth:bd.value||null,p_notes:nt.value,p_active:ac.value==='1'});if(x.error)throw x.error;for(const t of starts){if(t.el.value!==t.old){const y=await sb.rpc('admin_set_enrollment_start',{p_student:id,p_course:t.course,p_date:t.el.value||null});if(y.error)throw y.error}}adminHome('alunni')},
    async()=>{if(!await confirmDelete(s.name,'Si cancellano anche presenze, risultati degli esercizi e accesso. Se vuoi solo che non entri più, imposta “Non attivo”: lo storico resta.'))return;
      const x=await sb.rpc('admin_delete_student',{p_id:id});if(x.error)return say('Errore',x.error.message);adminHome('alunni')});
}
async function staffDetail(id){
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs('docenti'));
  const r=await sb.rpc('admin_staff_detail',{p_id:id});
  if(r.error)return say('Errore',r.error.message).then(()=>adminHome('docenti'));
  const p=r.data;
  const nm=h('input',{class:'txt',type:'text',value:p.name});
  const em=h('input',{class:'txt',type:'text',value:p.email||'',readonly:true});
  const ph=h('input',{class:'txt',type:'tel',value:p.phone||''});
  const nt=h('textarea',{class:'txt',rows:'4',maxlength:'2000',placeholder:'Note interne'});nt.value=p.notes||'';
  const lgs=LANGS.map(l=>{const c=h('input',{type:'checkbox'});c.checked=(p.languages||[]).includes(l);return [l,c]});
  const cls=p.courses.length?byCOrd(p.courses,c=>c.id).map(c=>h('span',{class:'ctag'},courseName(c.id,true)+' · '+c.students+' alunni')):[h('p',{class:'sub small'},'Nessuna classe assegnata.')];
  const sp=A.staff.staff.find(x=>x.id===id);
  formPage(p.name,'docenti',()=>adminHome('docenti'),[
    fld('Nome e cognome',nm),fld('Email (accesso)',em),fld('Telefono',ph),h('p',{class:'sub small fld'},'Lingue insegnate'),...lgs.map(([l,c])=>h('label',{class:'chk-row'},c,l)),fld('Note',nt),
    h('h3',null,'Classi'),h('div',null,...cls),sp?h('button',{class:'secondary',onclick:()=>inviteDlg(sp)},'Gestisci classi'):null,
    p.blocked?h('p',{class:'err'},'Accesso bloccato. Si sblocca dall’elenco docenti.'):null],
    async()=>{const x=await sb.rpc('admin_update_teacher',{p_id:id,p_name:nm.value,p_phone:ph.value,p_notes:nt.value,p_languages:lgs.filter(y=>y[1].checked).map(y=>y[0])});if(x.error)throw x.error;adminHome('docenti')},
    async()=>{if(!await confirmDelete(p.name,'Il docente perde l’accesso. Le sue '+p.courses.length+' classi restano, senza docente, con alunni e lezioni. Per sospenderlo senza eliminarlo usa “Blocca accesso”.'))return;
      const x=await sb.rpc('admin_delete_teacher',{p_id:id});if(x.error)return say('Errore',x.error.message);adminHome('docenti')});
}

/* --- storico docenti / classe / presenze alunno --- */
const dIt=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(2,4):'';
async function courseHistoryBlock(courseId){
  const box=h('div',null,h('p',{class:'sub small'},'Caricamento…'));
  const r=await sb.rpc('course_history',{p_course:courseId});
  if(r.error){box.replaceChildren(h('p',{class:'err'},'Storico non disponibile.'));return box}
  const t=(r.data&&r.data.teachers)||[],ev=(r.data&&r.data.events)||[];
  box.replaceChildren(
    h('p',{class:'sub small'},'Docenti della classe'),
    ...(t.length?t.map(x=>h('p',{class:'sub small'},h('strong',null,x.name),' · '+(x.from?'dal '+dIt(x.from):'dall’inizio')+(x.to?' al '+dIt(x.to):' · attuale'))):[h('p',{class:'sub small'},'Nessun docente assegnato.')]),
    h('p',{class:'sub small',style:'margin-top:10px'},'Cambiamenti'),
    ...(ev.length?ev.map(x=>h('p',{class:'sub small'},dIt(x.date)+' · '+x.text)):[h('p',{class:'sub small'},'Nessun cambiamento registrato.')]));
  return box;
}
async function courseHistoryView(c){
  const back=()=>teacherHome();
  mount(topbar('Storico classe',back),h('p',{class:'sub small'},c.name),await courseHistoryBlock(c.id),footer());
}
const ST_L={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
function studentHistoryEls(d,withTeacher){
  d=d||{};const per=d.periods||[],rows=d.rows||[];
  const pEls=per.length?per.map(x=>h('p',{class:'sub small'},h('strong',null,x.course),(x.teacher?' · '+x.teacher:'')+' · '+(x.from?'dal '+dIt(x.from):'dall’inizio')+(x.to?' al '+dIt(x.to)+(x.moved_to?' (spostato in '+x.moved_to+')':''):' · in corso'))):[h('p',{class:'sub small'},'Nessuna classe.')];
  const pres=rows.filter(a=>a.status==='present').length,abs=rows.length-pres;
  const tb=rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Data','Classe','Docente','Stato','Ingresso','Motivo alunno','Note docente'].map(t=>h('th',null,t)))),
    h('tbody',null,rows.map(a=>h('tr',null,h('td',null,dIt(a.date)),h('td',null,a.course),h('td',null,a.teacher||''),h('td',null,h('span',{class:'pill '+(ST_L[a.status]||['','n'])[1]},(ST_L[a.status]||[a.status])[0])),
      h('td',null,a.joined_at?new Date(a.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''),h('td',null,[a.reason,a.note].filter(Boolean).join(' · ')),
      h('td',null,[a.camera_off?'cam spenta':'',a.mic_off?'mic spento':'',a.teacher_note].filter(Boolean).join(' · '))))))):h('p',{class:'sub'},'Nessuna presenza registrata.');
  return [h('h3',null,'Classi e docenti'),...pEls,h('h3',null,'Presenze di tutti i corsi'),h('p',null,'Presenze: ',h('strong',null,String(pres)),' · Assenze: ',h('strong',null,String(abs))),tb];
}
async function studentHistoryBox(studentId){
  const box=h('div',null,h('p',{class:'sub small'},'Caricamento…'));
  const r=await sb.rpc('student_history',{p_student:studentId});
  if(r.error)box.replaceChildren(h('p',{class:'err'},'Storico non disponibile.'));else box.replaceChildren(...studentHistoryEls(r.data));
  return box;
}
async function courseDetail(id){
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs('classi'));
  const c=A.ov.courses.find(x=>x.id===id);
  const r=await sb.rpc('admin_course_stats',{p_id:id});
  if(!c||r.error)return say('Errore',r.error?r.error.message:'Classe non trovata').then(()=>adminHome('classi'));
  const st=r.data;
  const nm=h('input',{class:'txt',type:'text',value:c.name});
  const lv=selEl(LEVELS.map(x=>[x,x]),c.level||'A1','Livello');
  const lg=selEl(LANGS.map(x=>[x,x]),c.language||'Tedesco','Lingua');
  const dc=selEl(teacherOpts(),c.teacher_id||'','Docente');
  const ac=selEl([['1','Attiva'],['0','Archiviata']],c.active===false?'0':'1','Stato');if(c.active===false)ac.disabled=true;
  const sdr=await sb.from('courses').select('start_date').eq('id',id).maybeSingle();
  const sd=h('input',{class:'txt',type:'date',value:(sdr.data&&sdr.data.start_date)||'','aria-label':'Data di inizio corso'});
  const stu=A.ov.students.filter(s=>s.course_ids.includes(id));
  formPage(shortName(c),'classi',()=>adminHome('classi'),[
    fld('Nome',nm),fld('Tipo',h('input',{class:'txt',type:'text',value:KL[c.kind],readonly:true})),...(c.kind==='individual'?[]:[fld('Livello',lv)]),fld('Lingua',lg),fld('Data di inizio corso',sd),fld('Docente',dc),fld('Stato',ac),
    h('h3',null,'Contenuti'),h('p',{class:'sub small'},st.students+' alunni · '+st.lessons+' lezioni caricate · '+st.sessions+' lezioni in calendario · '+st.whiteboards+' lavagne · '+st.announcements+' avvisi'),
    h('h3',null,'Alunni'),h('div',null,...(stu.length?stu.map(s=>h('span',{class:'ctag'},s.name)):[h('p',{class:'sub small'},'Nessun alunno.')])),
    h('h3',null,'Storico classe'),await courseHistoryBlock(id)],
    async()=>{const x=await sb.rpc('admin_update_course',{p_id:id,p_name:nm.value,p_level:c.kind==='individual'?null:lv.value,p_language:lg.value,p_teacher:dc.value||null,p_active:ac.value==='1',p_start:sd.value||null});if(x.error)throw x.error;adminHome('classi')},
    async()=>{
      const hasData=(st.attendance||0)>0||(st.results||0)>0||st.lessons>0||st.whiteboards>0||st.announcements>0;
      const arch=async()=>{const x=await sb.rpc('admin_update_course',{p_id:id,p_name:nm.value,p_level:c.kind==='individual'?null:lv.value,p_language:lg.value,p_teacher:dc.value||null,p_active:false,p_start:sd.value||null});if(x.error)return say('Errore',x.error.message);adminHome('classi')};
      const del=async(force)=>{const x=await sb.rpc('admin_delete_course',{p_id:id,p_force:!!force});if(x.error)return say('Errore',x.error.message);adminHome('classi')};
      if(!hasData){
        if(!await confirmDelete('la classe '+shortName(c,true),'La classe ha solo alunni e lezioni in calendario ('+st.sessions+'); gli '+st.students+' alunni restano ma escono dalla classe.'))return;
        return del(false);
      }
      const ov=h('div',{class:'dlg-ov'},h('div',{class:'dlg'},
        h('h3',null,'Archiviare la classe?'),
        h('p',{class:'sub small'},'La classe contiene dati ('+(st.attendance||0)+' presenze, '+(st.results||0)+' risultati esercizi, '+st.lessons+' lezioni caricate, '+st.whiteboards+' lavagne, '+st.announcements+' avvisi). Archiviandola resta consultabile in sola lettura (gli alunni vedono lo storico) ma nessuno può più modificarla o riattivarla dall’app.'),
        h('div',{class:'formbar'},
          h('button',{class:'danger',onclick:async()=>{ov.remove();if(!await askYes('Eliminare DEFINITIVAMENTE?','Si perdono per sempre presenze, risultati, lezioni, lavagne e avvisi della classe. Non si può annullare.','Elimina definitivamente'))return;del(true)}},'Elimina definitivamente'),
          h('span',{style:'flex:1'}),
          h('button',{class:'secondary',onclick:()=>ov.remove()},'Annulla'),
          h('button',{class:'primary',onclick:()=>{ov.remove();arch()}},'Archivia'))));
      document.body.append(ov);
    });
}

/* calendario amministratore: mese a quadrati → giorno → presenze */
const WD=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
async function adminCalBase(){
  if(!A.staff){const r=await sb.rpc('admin_staff_list');A.staff=r.data}
  const ts=A.staff.staff.filter(p=>p.role==='teacher');
  const pick=selEl([['','Tutti i docenti'],['__none','Senza docente'],...ts.map(p=>[p.id,p.name])],A.calT||'','Docente');
  return {ts,pick};
}
const calOk=c=>!A.calT||(A.calT==='__none'?!c.teacher_id:c.teacher_id===A.calT);
async function adminLoadRange(a,b){
  const [cs,ss]=await Promise.all([
    sb.from('courses').select('id,name,kind,level,language,teacher_id').eq('active',true),
    sb.from('lesson_sessions').select('id,course_id,section,session_date,start_time,end_time,place,status,session_responses(student_id,response,status,note,students(display_name))').gte('session_date',isoD(a)).lte('session_date',isoD(b)).order('session_date').order('start_time')]);
  if(cs.error||ss.error)throw (cs.error||ss.error);
  const tn={};A.staff.staff.forEach(p=>tn[p.id]=p.name);
  const cname={};cs.data.filter(calOk).forEach(c=>{c.tname=tn[c.teacher_id]||'';cname[c.id]=c});
  return {cname,sessions:ss.data.filter(x=>cname[x.course_id]),courses:Object.values(cname)};
}
const tiny=c=>c.kind==='individual'?'Ind. '+((/individuale\s+(\S+)/i.exec(c.name)||[])[1]||''):c.level+(c.kind==='group'?' Gr':' Cv');
async function adminMonth(m){
  m=m?new Date(m):new Date();const first=new Date(m.getFullYear(),m.getMonth(),1,12),last=new Date(m.getFullYear(),m.getMonth()+1,0,12);
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs('cal'));
  let base,data;
  try{base=await adminCalBase();data=await adminLoadRange(first,last)}catch(e){return mount(aHeader(),h('p',{class:'err'},'Errore nel caricamento del calendario.'),aTabs('cal'))}
  base.pick.addEventListener('change',()=>{A.calT=base.pick.value;adminMonth(first)});
  const shift=n=>adminMonth(new Date(first.getFullYear(),first.getMonth()+n,1,12));
  const nav=h('div',{class:'row'},
    h('button',{class:'icon-btn','aria-label':'Mese precedente',onclick:()=>shift(-1)},ico('back')),
    h('strong',{class:'weeklab'},MESI[first.getMonth()]+' '+first.getFullYear()),
    h('button',{class:'icon-btn','aria-label':'Mese successivo',onclick:()=>shift(1),style:'transform:scaleX(-1)'},ico('back')),
    h('button',{class:'linkbtn small',onclick:()=>adminMonth()},'Oggi'));
  const todayK=isoD(new Date());
  const cells=WD.map(w=>h('div',{class:'mwd'},w));
  const lead=(first.getDay()+6)%7;for(let i=0;i<lead;i++)cells.push(h('div'));
  for(let d=1;d<=last.getDate();d++){
    const dt=new Date(first.getFullYear(),first.getMonth(),d,12),k=isoD(dt);
    const L=data.sessions.filter(x=>x.session_date===k);
    cells.push(h('button',{class:'mcell'+(k===todayK?' today':''),'aria-label':d+' '+MESI[dt.getMonth()]+', '+L.length+' lezioni',onclick:()=>adminDay(dt)},
      h('span',{class:'mnum'},String(d)),
      ...L.slice(0,3).map(x=>h('span',{class:'mline'},(x.start_time||'').slice(0,5)+' '+tiny(data.cname[x.course_id]))),
      L.length>3?h('span',{class:'mmore'},'+'+(L.length-3)):null));
  }
  const exp=h('button',{class:'secondary',onclick:()=>exportMonth(first,last)},'⬇ Esporta mese con presenze (CSV)');
  const add=h('button',{class:'primary',onclick:()=>adminAddLesson(isoD(new Date()),()=>adminMonth(first))},'+ Aggiungi lezione');
  mount(aHeader(),h('h2',{class:'sect'},'Calendario'),base.pick,add,nav,h('div',{class:'mgrid'},cells),exp,aTabs('cal'),footer());
}
async function adminAddLesson(dateStr,back){
  const cs=(A.ov.courses||[]).filter(c=>c.active!==false&&!c.archived).slice().sort((p,q)=>shortName(p).localeCompare(shortName(q)));
  const csS=sortCourses(cs);
  const cls=selEl(csS.map(c=>[c.id,shortName(c)]),csS[0]&&csS[0].id,'Classe');
  const parse0=q=>{const p=q.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
  const date=h('input',{class:'txt',type:'date',value:dateStr});
  const st=h('input',{class:'txt',type:'time'}),en=h('input',{class:'txt',type:'time'});
  const sec=h('select',{class:'txt sel','aria-label':'Turno'},[['','Nessun turno'],['morning','Mattina'],['evening','Sera']].map(([v,t])=>h('option',{value:v},t)));
  const place=h('input',{class:'txt',type:'text',value:'Online',maxlength:'80'});
  const weeks=h('input',{class:'txt',type:'number',min:'1',max:'52',value:'1'});
  const dn=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const dchk=dn.map((n,i)=>{const cb=h('input',{type:'checkbox'});return {cb,i,el:h('label',{class:'att-chk'},cb,n)}});
  const sync=()=>{const wd=(parse0(date.value||dateStr).getDay()+6)%7;dchk.forEach(d=>d.cb.checked=(d.i===wd))};
  date.addEventListener('change',sync);sync();
  const err=h('p',{class:'err',role:'alert'});
  const save=h('button',{class:'primary',onclick:async()=>{
    err.textContent='';
    if(!cls.value){err.textContent='Scegli la classe.';return}
    if(!date.value||!st.value){err.textContent='Inserisci data e ora di inizio.';return}
    if(en.value&&en.value<=st.value){err.textContent='La fine deve essere dopo l’inizio.';return}
    save.disabled=true;
    const cr=await sb.from('courses').select('school_id').eq('id',cls.value).maybeSingle();
    if(!cr.data){err.textContent='Classe non trovata.';save.disabled=false;return}
    const m=q=>parseInt(q.slice(0,2))*60+parseInt(q.slice(3));
    const base={start_time:st.value,end_time:en.value||null,place:place.value.trim()||null,duration_min:en.value?m(en.value)-m(st.value):60,section:sec.value};
    const n=Math.max(1,Math.min(52,parseInt(weeks.value,10)||1));
    const d0=parse0(date.value);const mon0=new Date(d0);mon0.setDate(mon0.getDate()-((mon0.getDay()+6)%7));
    const rows=[];
    for(let w=0;w<n;w++)dchk.filter(d=>d.cb.checked).forEach(d=>{const dd=new Date(mon0);dd.setDate(dd.getDate()+7*w+d.i);if(dd>=d0)rows.push({...base,school_id:cr.data.school_id,course_id:cls.value,session_date:isoD(dd),kind:'regular',status:'scheduled'})});
    if(!rows.length){err.textContent='Scegli almeno un giorno.';save.disabled=false;return}
    const {error}=await sb.from('lesson_sessions').upsert(rows,{onConflict:'course_id,section,session_date,kind',ignoreDuplicates:true});
    if(error){err.textContent='Non salvato: '+error.message;save.disabled=false;return}
    back();
  }},'Salva');
  mount(topbar('Aggiungi lezione',back),h('div',{class:'card'},
    h('p',{class:'sub small'},'Puoi programmare la lezione anche se alla classe non è ancora stato assegnato un docente.'),
    h('label',null,'Classe',cls),h('label',null,'Data',date),
    h('div',{class:'row'},h('label',null,'Inizio',st),h('label',null,'Fine',en)),
    h('label',null,'Turno (solo per i corsi di gruppo)',sec),h('label',null,'Dove',place),
    h('div',null,h('p',{class:'sub small'},'Ripeti nei giorni (a partire dalla data scelta):'),h('div',{class:'row'},dchk.map(d=>d.el)),h('label',null,'Per quante settimane (compresa la prima)',weeks)),
    save,err),footer());
}
async function adminDay(d){
  d=new Date(d);d.setHours(12,0,0,0);
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs('cal'));
  let base,data;
  try{base=await adminCalBase();data=await adminLoadRange(d,d)}catch(e){return mount(aHeader(),h('p',{class:'err'},'Errore nel caricamento.'),aTabs('cal'))}
  const step=n=>{const x=new Date(d);x.setDate(x.getDate()+n);adminDay(x)};
  const nav=h('div',{class:'row'},
    h('button',{class:'icon-btn','aria-label':'Torna al mese',onclick:()=>adminMonth(d)},ico('back')),
    h('button',{class:'linkbtn small',onclick:()=>step(-1)},'‹ Giorno prima'),
    h('strong',{class:'weeklab'},GIORNI[d.getDay()]+' '+d.getDate()+' '+MESI[d.getMonth()]),
    h('button',{class:'linkbtn small',onclick:()=>step(1)},'Giorno dopo ›'));
  base.pick.addEventListener('change',()=>{A.calT=base.pick.value;adminDay(d)});
  const addD=h('button',{class:'primary',onclick:()=>adminAddLesson(isoD(d),()=>adminDay(d))},'+ Aggiungi lezione');
  mount(aHeader(),nav,base.pick,addD,data.sessions.length?data.sessions.map(x=>tLessonCard(x,data.cname[x.course_id],data.courses)):h('p',{class:'sub'},'Nessuna lezione in questo giorno.'),aTabs('cal'),footer());
}
async function exportMonth(first,last){
  const wait=h('p',{class:'sub'},'Preparo il file…');
  const ov=h('div',{class:'dlg-ov'},h('div',{class:'dlg'},wait));document.body.append(ov);
  try{
    const tn={};A.staff.staff.forEach(p=>tn[p.id]=p.name);
    const [cs,ss]=await Promise.all([
      sb.from('courses').select('id,name,teacher_id'),
      sb.from('lesson_sessions').select('id,course_id,session_date,start_time,end_time,status,attendance(status,camera_off,mic_off,teacher_note,students(display_name))').gte('session_date',isoD(first)).lte('session_date',isoD(last)).order('session_date').order('start_time')]);
    if(cs.error||ss.error)throw (cs.error||ss.error);
    const cn={};cs.data.filter(calOk).forEach(c=>cn[c.id]=c);
    const ST={present:'Presente',absent:'Assente',absent_notified:'Assente avvisato'};
    const q=v=>{v=v==null?'':String(v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
    const rows=[['Data','Inizio','Fine','Corso','Docente','Alunno','Presenza','Camera spenta','Mic spento','Nota docente']];
    ss.data.filter(x=>cn[x.course_id]).forEach(x=>{
      const c=cn[x.course_id],base=[x.session_date.split('-').reverse().join('/'),(x.start_time||'').slice(0,5),(x.end_time||'').slice(0,5),c.name,tn[c.teacher_id]||''];
      const at=x.attendance||[];
      if(!at.length)rows.push([...base,'','','','','']);
      at.forEach(a=>rows.push([...base,a.students?a.students.display_name:'',ST[a.status]||a.status||'',a.camera_off?'sì':'',a.mic_off?'sì':'',a.teacher_note||'']));
    });
    const csv='\ufeff'+rows.map(r=>r.map(q).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=h('a',{href:url,download:'presenze-'+first.getFullYear()+'-'+String(first.getMonth()+1).padStart(2,'0')+'.csv'});document.body.append(a);a.click();a.remove();
    ov.remove();await say('File pronto',(rows.length-1)+' righe esportate (apribile con Excel).');
  }catch(e){ov.remove();say('Errore',e.message||String(e))}
}

/* ---------- docente: shell, calendario ---------- */
function tDrawer(){
  const close=()=>ov.remove();
  const it=(em,l,fn)=>h('button',{class:'dr-item',onclick:()=>{close();fn()}},h('span',{class:'dr-em','aria-hidden':'true'},em),l);
  const panel=h('div',{class:'dr-panel',role:'dialog','aria-label':'Menu'},
    h('p',{class:'dr-title'},'Esmet Academy · docenti'),
    it('📅','Calendario',()=>teacherCal()),it('📋','Registro presenze',()=>teacherRegistro()),it('👥','Corsi e alunni',()=>teacherHome()),
    it('🚪','Esci',async()=>{await sb.auth.signOut();teacherLogin()}),
    h('p',{class:'dr-ver'},'Ver '+CFG.version));
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},panel);document.body.append(ov);
}
function tHeader(){
  if(isAdm())return aHeader();
  return h('div',{class:'thead2'},h('div',{class:'thead-top'},
    h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('div',{class:'row',style:'gap:8px'},bellBtn(true,()=>teacherHome()),h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:tDrawer},ico('menu')))));
}
function tTabs(active){
  if(isAdm())return aTabs('cal');
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(active===id?' on':''),onclick:fn},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('cal','Calendario','📅',()=>teacherCal()),t('reg','Registro','📋',()=>teacherRegistro()),t('corsi','Corsi','👥',()=>teacherHome()));
}
const turnoL=s=>s==='morning'?' · mattina':s==='evening'?' · sera':'';
async function teacherCal(weekStart){
  if(isAdm())return weekStart?adminDay(weekStart):adminMonth();
  const mon=weekStart?mondayOf(weekStart):mondayOf(new Date());
  const sun=new Date(mon);sun.setDate(sun.getDate()+6);
  const label=mon.getDate()+' '+MESI[mon.getMonth()].slice(0,3).toLowerCase()+' – '+sun.getDate()+' '+MESI[sun.getMonth()].slice(0,3).toLowerCase()+' '+sun.getFullYear();
  const shift=n=>{const d=new Date(mon);d.setDate(d.getDate()+7*n);teacherCal(d)};
  const nav=h('div',{class:'row'},
    h('button',{class:'icon-btn','aria-label':'Settimana precedente',onclick:()=>shift(-1)},ico('back')),
    h('strong',{class:'weeklab'},label),
    h('button',{class:'icon-btn','aria-label':'Settimana successiva',onclick:()=>shift(1),style:'transform:scaleX(-1)'},ico('back')),
    h('button',{class:'linkbtn small',onclick:()=>teacherCal()},'Oggi'));
  let pick=null;
  if(isAdm()){
    if(!A.staff){const r=await sb.rpc('admin_staff_list');A.staff=r.data}
    pick=selEl([['','— scegli il docente —'],...A.staff.staff.filter(p=>p.role==='teacher').map(p=>[p.id,p.name])],A.calT||'','Docente');
    pick.addEventListener('change',()=>{A.calT=pick.value;teacherCal(mon)});
    if(!A.calT)return mount(tHeader(),h('h2',{class:'sect'},'Calendario'),h('p',{class:'sub small'},'Scegli un docente per vedere il suo calendario.'),pick,tTabs('cal'),footer());
  }
  mount(tHeader(),pick,nav,h('p',{class:'sub'},'Caricamento…'),tTabs('cal'));
  const [cs0,ss]=await Promise.all([
    sb.from('courses').select('id,school_id,name,kind,level,language,teacher_id').eq('active',true).order('name'),
    sb.from('lesson_sessions').select('id,course_id,section,session_date,start_time,end_time,place,status,session_responses(student_id,response,status,note,students(display_name))').gte('session_date',isoD(mon)).lte('session_date',isoD(sun)).order('session_date').order('start_time')]);
  if(cs0.error||ss.error)return mount(tHeader(),h('p',{class:'err'},'Errore nel caricamento del calendario.'),tTabs('cal'),footer());
  const cs={data:isAdm()?cs0.data.filter(c=>c.teacher_id===A.calT):cs0.data};
  const cname={};cs.data.forEach(c=>cname[c.id]=c);
  const addBtn=isAdm()?null:h('button',{class:'primary',onclick:()=>sessionForm(cs.data,null,mon)},'+ Aggiungi lezione');
  const todayK=isoD(new Date());
  const days=[];for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(d.getDate()+i);days.push(d)}
  const blocks=days.map(d=>{
    const k=isoD(d);const L=ss.data.filter(x=>x.session_date===k&&cname[x.course_id]);if(!L.length)return null;
    return h('div',null,h('div',{class:'datepill'+(k===todayK?' today':'')},GIORNI[d.getDay()]+', '+d.getDate()+' '+MESI[d.getMonth()]),
      L.map(x=>tLessonCard(x,cname[x.course_id],cs.data)));
  });
  mount(tHeader(),pick,nav,addBtn,blocks.some(Boolean)?blocks:h('p',{class:'sub'},'Nessuna lezione questa settimana.'),tTabs('cal'),footer());
}
function tLessonCard(x,c,courses){
  const R=x.session_responses||[];
  const conf=R.filter(r=>r.response==='confirm').length;
  const mv=R.filter(r=>r.response==='move_request'&&r.status==='open');
  const body=h('div',{class:'lc-actions',hidden:'hidden'});
  const msg=h('p',{class:'sub small',role:'status'});
  body.append(
    h('button',{class:'primary',onclick:()=>teacherAttendance(c,x.session_date)},'Presenze'),
    h('button',{class:'secondary',onclick:()=>sessionForm(courses,x)},'Modifica'),
    h('button',{class:'secondary',onclick:async()=>{
      if(!await askYes('Eliminare la lezione?','Si cancellano anche presenze e risposte collegate.','Elimina'))return;
      const {error}=await sb.from('lesson_sessions').delete().eq('id',x.id);
      if(error){msg.className='err';msg.textContent='Non eliminata: '+error.message;return}
      teacherCal(new Date(x.session_date+'T12:00:00'));
    }},'Elimina'));
  mv.forEach(r=>{
    const who=r.students?r.students.display_name:'Alunno';
    body.append(h('div',{class:'mv'},h('p',{class:'small'},h('strong',null,who+' chiede di spostare'),r.note?': '+r.note:''),
      h('button',{class:'primary',onclick:()=>sessionForm(courses,x,null,r.student_id)},'Accetta: imposta nuovo orario'),
      h('button',{class:'secondary',onclick:async()=>{await sb.from('session_responses').update({status:'rejected'}).eq('session_id',x.id).eq('student_id',r.student_id);teacherCal(new Date(x.session_date+'T12:00:00'))}},'Non posso')));
  });
  const head=h('button',{class:'lc-head',onclick:()=>{body.hidden=!body.hidden}},
    h('span',{class:'lc-time'},(x.start_time||'').slice(0,5)+(x.end_time?'–'+x.end_time.slice(0,5):'')),
    h('span',{class:'lc-main'},h('strong',null,c.name+(isAdm()&&c.tname?' · '+c.tname:'')),h('span',{class:'sub small'},[x.place,turnoL(x.section).replace(' · ','')].filter(Boolean).join(' · '))),
    conf?h('span',{class:'pill g'},conf+' conferm'+(conf===1?'ata':'ate')):null,
    mv.length?h('span',{class:'pill n'},'spostamento'):null);
  return h('div',{class:'card lc'},head,body,msg);
}
async function sessionForm(courses,x,weekMon,acceptStudent){
  const back=()=>teacherCal(x?new Date(x.session_date+'T12:00:00'):weekMon);
  const edit=!!x;
  const parse0=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
  let langs=['Tedesco'],indiv=[];
  if(!edit){
    mount(topbar('Nuova lezione',back),h('p',{class:'sub'},'Caricamento…'));
    const u=(await sb.auth.getUser()).data.user;
    const [pr,en]=await Promise.all([
      sb.from('profiles').select('languages').eq('id',u.id).maybeSingle(),
      sb.from('enrollments').select('course_id,students(id,display_name)')]);
    if(pr.data&&pr.data.languages&&pr.data.languages.length)langs=pr.data.languages;
    const seen={};(en.data||[]).forEach(e=>{if(e.students)seen[e.students.id]=e.students.display_name});
    indiv=Object.entries(seen).map(([id,name])=>({id,name}));
  }
  const lang=h('select',{class:'txt sel','aria-label':'Lingua'},langs.map(l=>h('option',{value:l},l)));
  const tipo=h('select',{class:'txt sel','aria-label':'Tipo di corso'},[['group','Corso di gruppo'],['individual','Corso individuale']].map(([v,t])=>h('option',{value:v},t)));
  const sub=h('select',{class:'txt sel','aria-label':'Alunno o livello'});
  const grp=h('select',{class:'txt sel','aria-label':'Gruppo'});
  const grpWrap=h('label',{hidden:'hidden'},'Gruppo',grp);
  const LIV=['A1','A2','B1','B2','C1','C2'];
  const fill=()=>{
    const L=lang.value;
    sub.replaceChildren();
    if(tipo.value==='individual'){
      const list=indiv.slice().sort((p,q)=>p.name.localeCompare(q.name));
      if(!list.length)sub.append(h('option',{value:''},'Nessun alunno assegnato'));
      list.forEach(c=>sub.append(h('option',{value:c.id},c.name)));
      grpWrap.hidden=true;
    }else{
      LIV.forEach(v=>sub.append(h('option',{value:v},v)));
      fillGrp();
    }
  };
  const groupsOf=()=>courses.filter(c=>c.kind==='group'&&(c.language||'Tedesco')===lang.value&&c.level===sub.value);
  const fillGrp=()=>{
    const g=groupsOf();grp.replaceChildren(...g.map(c=>h('option',{value:c.id},c.name)));
    grpWrap.hidden=g.length<2;
  };
  const resolveCourse=async()=>{
    if(edit)return courses.find(k=>k.id===x.course_id);
    if(tipo.value==='individual'){
      if(!sub.value)return null;
      const r=await sb.rpc('teacher_ensure_individual_course',{p_student:sub.value,p_language:lang.value});
      return r.error?null:r.data;
    }
    const g=groupsOf();
    if(g.length)return g[grp.selectedIndex>=0?grp.selectedIndex:0];
    const r=await sb.rpc('teacher_ensure_group_course',{p_language:lang.value,p_level:sub.value});
    return r.error?null:r.data;
  };
  lang.addEventListener('change',fill);tipo.addEventListener('change',fill);sub.addEventListener('change',()=>{if(tipo.value==='group')fillGrp()});
  if(!edit)fill();
  const date=h('input',{class:'txt',type:'date',value:x?x.session_date:isoD(new Date())});
  const st=h('input',{class:'txt',type:'time',value:x&&x.start_time?x.start_time.slice(0,5):''});
  const en2=h('input',{class:'txt',type:'time',value:x&&x.end_time?x.end_time.slice(0,5):''});
  const sec=h('select',{class:'txt sel','aria-label':'Turno'},[['','Nessun turno'],['morning','Mattina'],['evening','Sera']].map(([v,t])=>h('option',{value:v,selected:(x&&x.section||'')===v},t)));
  const place=h('input',{class:'txt',type:'text',placeholder:'Dove (es. Online)',value:x?(x.place||''):'Online',maxlength:'80'});
  const weeks=h('input',{class:'txt',type:'number',min:'1',max:'52',value:'1'});
  const dayNames=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const dchk=dayNames.map((n,i)=>{const cb=h('input',{type:'checkbox'});return {cb,i,el:h('label',{class:'att-chk'},cb,n)}});
  const syncDay=()=>{const wd=(parse0(date.value).getDay()+6)%7;dchk.forEach(d=>d.cb.checked=(d.i===wd))};
  date.addEventListener('change',syncDay);syncDay();
  const err=h('p',{class:'err',role:'alert'});
  const save=h('button',{class:'primary',onclick:async()=>{
    err.textContent='';
    if(tipo.value==='individual'&&!edit&&!sub.value){err.textContent='Scegli l’alunno.';return}
    if(!date.value||!st.value){err.textContent='Inserisci data e ora di inizio.';return}
    if(en2.value&&en2.value<=st.value){err.textContent='La fine deve essere dopo l’inizio.';return}
    save.disabled=true;
    const c=await resolveCourse();
    if(!c){err.textContent='Non riesco a preparare il corso. Riprova o scrivi all’assistenza.';save.disabled=false;return}
    const cid=c.id;
    const dur=en2.value?(parseInt(en2.value.slice(0,2))*60+parseInt(en2.value.slice(3))-(parseInt(st.value.slice(0,2))*60+parseInt(st.value.slice(3)))):60;
    const base={start_time:st.value,end_time:en2.value||null,place:place.value.trim()||null,duration_min:dur,section:sec.value};
    let error=null;
    if(edit){
      ({error}=await sb.from('lesson_sessions').update({...base,session_date:date.value}).eq('id',x.id));
      if(!error&&acceptStudent)await sb.from('session_responses').update({status:'accepted'}).eq('session_id',x.id).eq('student_id',acceptStudent);
    }else{
      const n=Math.max(1,Math.min(52,parseInt(weeks.value,10)||1));
      const d0=parse0(date.value);const mon0=new Date(d0);mon0.setDate(mon0.getDate()-((mon0.getDay()+6)%7));
      const rows=[];
      for(let w=0;w<n;w++)dchk.filter(d=>d.cb.checked).forEach(d=>{const dd=new Date(mon0);dd.setDate(dd.getDate()+7*w+d.i);if(dd>=d0)rows.push({...base,school_id:c.school_id,course_id:cid,session_date:isoD(dd),kind:'regular',status:'scheduled'})});
      if(!rows.length){err.textContent='Scegli almeno un giorno.';save.disabled=false;return}
      ({error}=await sb.from('lesson_sessions').upsert(rows,{onConflict:'course_id,section,session_date,kind',ignoreDuplicates:true}));
    }
    if(error){err.textContent='Non salvato: '+error.message;save.disabled=false;return}
    teacherCal(parse0(date.value));
  }},edit?'Salva modifiche':'Salva');
  const cname=edit?((courses.find(k=>k.id===x.course_id)||{}).name||''):null;
  mount(topbar(edit?'Modifica lezione':'Nuova lezione',back),
    h('div',{class:'card'},
      acceptStudent?h('p',{class:'sub small'},'Imposta il nuovo orario: salvando, la richiesta risulta accettata.'):null,
      edit?h('p',null,h('strong',null,cname)):[
        langs.length>1?h('label',null,'Lingua',lang):null,
        h('label',null,'Tipo di corso',tipo),
        h('label',null,'Alunno / livello',sub),
        grpWrap],
      h('label',null,'Data',date),
      h('div',{class:'row'},h('label',null,'Inizio',st),h('label',null,'Fine',en2)),
      h('label',null,'Turno (solo per i corsi di gruppo)',sec),h('label',null,'Dove',place),
      edit?null:h('div',null,h('p',{class:'sub small'},'Ripeti nei giorni (a partire dalla data scelta):'),h('div',{class:'row'},dchk.map(d=>d.el)),h('label',null,'Per quante settimane (compresa la prima)',weeks)),
      save,err),footer());
}


/* ---------- amministratore: report ed esportazioni CSV ---------- */
const REPORTS={
  presenze:{t:'Presenze',d:'Presenze, assenze e percentuale per alunno e corso (solo lezioni tenute con presenza segnata).',f:['period','kind','level','course','teacher','student','state']},
  alunni_corsi:{t:'Corsi frequentati dagli alunni',d:'Per ogni alunno i corsi frequentati, con docente, date e stato.',f:['period','kind','level','course','teacher','student','state']},
  corsi:{t:'Corsi per livello',d:'Corsi attivi e conclusi con quanti e quali alunni (attuali e totali nello storico).',f:['period','kind','level','course','teacher','student','state']},
  docenti:{t:'Docenti e classi',d:'Classi assegnate a ogni docente (anche passate), lezioni tenute, blocchi da 10 per le individuali (senza livello) e corso completo per i gruppi (A1-A2 20, B1-B2 60, C1-C2 80 lezioni).',f:['period','kind','level','course','teacher','student','state']},
  percorsi:{t:'Percorsi di livello',d:'Alunni che sono passati ai livelli successivi (A1, A2, B1…) con il docente di ogni livello. Cercando un docente: i suoi alunni e dove hanno continuato.',f:['kind','teacher','student','continued']}
};
function csvDownload(name,cols,rows){
  const q=v=>{v=v==null?'':String(v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv='﻿'+[cols,...rows].map(r=>r.map(q).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=h('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function adminReports(pre){
  if(!A.ov||!A.staff){try{await adminLoad()}catch(e){return mount(aHeader(),h('p',{class:'err'},'Non riesco a caricare i dati.'),aTabs('rep'),footer())}}
  const R=pre||A.rep||{type:'presenze',v:{}};A.rep=R;
  const hist=LS.get('esmet_rep_hist',[]);
  const type=selEl(Object.entries(REPORTS).map(([k,r])=>[k,r.t]),R.type,'Report');
  const desc=h('p',{class:'sub small'});
  const f={};
  const mkSel=(label,opts,val)=>{const e=selEl(opts,val||'',label);return e};
  f.kind=mkSel('Tipologia',[['','Tutte'],...Object.entries(KL)],R.v.kind);
  f.level=mkSel('Livello',[['','Tutti'],...LEVELS.map(x=>[x,x])],R.v.level);
  f.course=mkSel('Corso',[['','Tutti'],...sortCourses(A.ov.courses).map(c=>[c.id,shortName(c)+(c.kind!=='individual'&&c.start_date?' · '+courseLabel(c).split(' - del ')[1]:'')+(c.active===false?' (concluso)':'')])],R.v.course);
  f.teacher=mkSel('Docente',[['','Tutti'],...A.staff.staff.filter(p=>p.role==='teacher').map(p=>[p.id,p.name])],R.v.teacher);
  f.state=mkSel('Stato corso',[['all','Attivi e conclusi'],['active','Solo attivi'],['ended','Solo conclusi']],R.v.state||'all');
  f.continued=mkSel('Alunni',[['','Tutti'],['yes','Solo chi è passato a un livello successivo']],R.v.continued);
  f.from=h('input',{class:'txt',type:'date',value:R.v.from||'','aria-label':'Dal'});f.to=h('input',{class:'txt',type:'date',value:R.v.to||'','aria-label':'Al'});
  const dl=h('datalist',{id:'rep-stu'},A.ov.students.map(s=>h('option',{value:s.name})));
  f.student=h('input',{class:'txt',type:'text',list:'rep-stu',placeholder:'Cerca per nome (vuoto = tutti)','aria-label':'Alunno',value:R.v.studentName||''});
  const wrap=(label,el,key)=>h('label',{class:'small','data-f':key},label,el);
  const fields=[wrap('Alunno',f.student,'student'),wrap('Tipologia',f.kind,'kind'),wrap('Livello',f.level,'level'),wrap('Corso',f.course,'course'),wrap('Docente',f.teacher,'teacher'),wrap('Stato corso',f.state,'state'),wrap('Passaggio di livello',f.continued,'continued'),
    h('div',{class:'row','data-f':'period'},h('label',{class:'small'},'Dal',f.from),h('label',{class:'small'},'Al',f.to)),dl];
  const out=h('div');const err=h('p',{class:'err',role:'alert'});
  const syncF=()=>{const r=REPORTS[type.value];desc.textContent=r.d;fields.forEach(x=>{if(x.dataset&&x.dataset.f)x.hidden=!r.f.includes(x.dataset.f)})};
  type.addEventListener('change',()=>{R.type=type.value;syncF();out.replaceChildren()});syncF();
  const collect=()=>{
    const v={kind:f.kind.value,level:f.level.value,course:f.course.value,teacher:f.teacher.value,state:f.state.value,continued:f.continued.value,from:f.from.value,to:f.to.value};
    const nm=f.student.value.trim();let sid='';
    if(nm){const m=A.ov.students.filter(s=>norm(s.name)===norm(nm));if(m.length!==1)return {error:m.length?'Ci sono più alunni con questo nome: scrivi il nome completo.':'Alunno non trovato: scegli un nome dall’elenco.'};sid=m[0].id;v.studentName=m[0].name}
    v.student=sid;return {v};
  };
  const run=async(vIn)=>{
    err.textContent='';
    const c=vIn?{v:vIn}:collect();if(c.error){err.textContent=c.error;return}
    const v=c.v;if(v.from&&v.to&&v.to<v.from){err.textContent='La data «al» è prima di «dal».';return}
    const t=type.value;R.v=v;
    const used=REPORTS[t].f;const par={};Object.entries(v).forEach(([k,x])=>{if(x&&(k==='period'||used.includes(k)||k==='from'||k==='to'&&used.includes('period')))par[k]=x});
    if(!used.includes('period')){delete par.from;delete par.to}
    out.replaceChildren(h('p',{class:'sub'},'Calcolo…'));
    const r=await sb.rpc('admin_report',{p_type:t,p_params:par});
    if(r.error||!r.data){out.replaceChildren(h('p',{class:'err'},'Report non riuscito: '+((r.error&&r.error.message)||'errore')));return}
    // storico dei report usati
    try{const key=JSON.stringify([t,par]);let hs=LS.get('esmet_rep_hist',[]);const e=hs.find(x=>x.key===key);if(e){e.n++;e.at=Date.now()}else hs.push({key,type:t,v,n:1,at:Date.now()});hs.sort((a,b)=>b.n-a.n||b.at-a.at);LS.set('esmet_rep_hist',hs.slice(0,12))}catch(e){}
    const {cols,rows}=r.data;
    const tbl=h('table',{class:'rep-tbl'},h('thead',null,h('tr',null,cols.map(x=>h('th',null,x)))),h('tbody',null,rows.map(row=>h('tr',null,row.map(x=>h('td',null,x==null?'':String(x)))))));
    out.replaceChildren(
      h('div',{class:'row',style:'justify-content:space-between;align-items:center'},h('p',{class:'sub small'},rows.length+(rows.length===1?' riga':' righe')),
        rows.length?h('button',{class:'primary small',onclick:()=>csvDownload('report-'+t+'-'+isoD(new Date())+'.csv',cols,rows)},'⬇ Esporta CSV'):null),
      rows.length?h('div',{class:'rep-wrap'},tbl):h('p',{class:'sub'},'Nessun risultato con questi filtri.'));
  };
  const go=h('button',{class:'primary',onclick:()=>run()},'Cerca');
  const recent=hist.length?h('div',{class:'card'},h('p',{class:'sub small'},'Report usati più spesso'),h('div',null,hist.slice(0,5).map(x=>h('button',{class:'ctag',style:'border:0;cursor:pointer',onclick:()=>adminReports({type:x.type,v:x.v}).then(()=>{})},REPORTS[x.type]?REPORTS[x.type].t+(x.v.studentName?' · '+x.v.studentName:'')+(x.n>1?' ('+x.n+')':''):x.type)))):null;
  mount(aHeader(),h('h2',{class:'sect'},'Report'),recent,
    h('div',{class:'card'},h('label',{class:'small'},'Che report vuoi?',type),desc,...fields,go,err),out,aTabs('rep'),footer());
  if(pre)run(pre.v);
}

/* amministratore: avvisi alla scuola (alunni, docenti o tutti) */
const AUD={students:'Tutti gli alunni',teachers:'Tutti i docenti',all:'Alunni e docenti'};
async function adminAnnouncements(){
  const back=()=>adminHome('alunni');
  mount(aHeader(),h('h2',{class:'sect'},'Avvisi'),h('p',{class:'sub'},'Caricamento…'),aTabs('anag'),footer());
  const {data:sd}=await sb.auth.getSession();const uid=sd.session&&sd.session.user&&sd.session.user.id;
  const pr=await sb.from('profiles').select('school_id').eq('id',uid).maybeSingle();
  const school=pr.data&&pr.data.school_id;
  const ls=await sb.from('announcements').select('id,title,body,created_at,show_from,show_until,audience').is('course_id',null).order('created_at',{ascending:false}).limit(60);
  if(ls.error||!school)return mount(aHeader(),h('h2',{class:'sect'},'Avvisi'),h('p',{class:'err'},'Errore nel caricamento.'),aTabs('anag'),footer());
  const au=h('select',{class:'txt sel','aria-label':'Destinatari'},Object.entries(AUD).map(([v,t])=>h('option',{value:v},t)));
  const ti=h('input',{class:'txt',type:'text',maxlength:'120',placeholder:'Titolo'});
  const bo=h('textarea',{class:'txt',rows:'4',maxlength:'1200',placeholder:'Testo (facoltativo)'});
  const dFrom=h('input',{class:'txt',type:'date',value:isoD(new Date()),'aria-label':'Visibile dal'});
  const dTo=h('input',{class:'txt',type:'date','aria-label':'Visibile fino al'});
  const msg=h('p',{role:'status'});
  const pub=h('button',{class:'primary',onclick:async()=>{
    if(!ti.value.trim()){msg.className='err';msg.textContent='Scrivi un titolo.';return}
    if(dTo.value&&dFrom.value&&dTo.value<dFrom.value){msg.className='err';msg.textContent='La data «fino al» è prima di «dal».';return}
    pub.disabled=true;
    const {error}=await sb.from('announcements').insert({school_id:school,course_id:null,audience:au.value,title:ti.value.trim(),body:bo.value.trim()||null,show_from:dFrom.value||null,show_until:dTo.value||null});
    pub.disabled=false;
    if(error){msg.className='err';msg.textContent='Non pubblicato: '+error.message;return}
    adminAnnouncements();
  }},'Pubblica');
  const today=isoD(new Date());
  mount(aHeader(),h('h2',{class:'sect'},'Avvisi'),
    h('div',{class:'card'},h('h3',null,'Nuovo avviso alla scuola'),
      h('p',{class:'sub small'},'Per una singola classe chiedi al docente di scrivere l’avviso: qui si comunica a tutti gli alunni, a tutti i docenti o a entrambi.'),
      h('label',null,'Destinatari',au),ti,bo,h('label',null,'Visibile dal',dFrom),h('label',null,'Fino al (facoltativo: senza data resta finché non lo elimini)',dTo),
      h('p',{class:'sub small'},'Una sola notifica, quando l’avviso diventa visibile. Se lo correggi dopo, nessuna nuova notifica.'),pub,msg),
    ls.data.length?ls.data.map(a=>{const st=a.show_until&&a.show_until<today?'scaduto':(a.show_from&&a.show_from>today?'programmato':'visibile');
      return h('div',{class:'card ann'},h('div',{class:'row'},h('strong',null,a.title),h('span',{class:'sub small'},fmtDate(a.created_at))),
        h('p',{class:'sub small'},'A: '+(AUD[a.audience]||a.audience)),a.body?h('p',{class:'ann-b'},a.body):null,
        h('p',{class:'sub small'},h('span',{class:'pill '+(st==='visibile'?'g':'n')},st),' '+(a.show_from?'dal '+fmtDate(a.show_from):'')+(a.show_until?' fino al '+fmtDate(a.show_until):' senza scadenza')),
        h('button',{class:'linkbtn small',onclick:async()=>{
          const t2=h('input',{class:'txt',type:'text',maxlength:'120',value:a.title,'aria-label':'Titolo'});
          const b2=h('textarea',{class:'txt',rows:'4',maxlength:'1200','aria-label':'Testo'});b2.value=a.body||'';
          const f2=h('input',{class:'txt',type:'date',value:a.show_from||'','aria-label':'Visibile dal'});
          const u2=h('input',{class:'txt',type:'date',value:a.show_until||'','aria-label':'Visibile fino al'});
          const er=h('p',{class:'err'});
          const ok=await dlg('Modifica avviso',[h('p',{class:'sub small'},'Destinatari: '+(AUD[a.audience]||a.audience)+'. Nessuna nuova notifica.'),t2,b2,h('label',{class:'small'},'Visibile dal',f2),h('label',{class:'small'},'Fino al (vuoto = nessuna scadenza)',u2),er],close=>[
            h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),
            h('button',{class:'primary',onclick:async()=>{
              if(!t2.value.trim()){er.textContent='Scrivi un titolo.';return}
              if(u2.value&&f2.value&&u2.value<f2.value){er.textContent='La data «fino al» è prima di «dal».';return}
              const x=await sb.from('announcements').update({title:t2.value.trim(),body:b2.value.trim()||null,show_from:f2.value||null,show_until:u2.value||null,updated_at:new Date().toISOString()}).eq('id',a.id);
              if(x.error){er.textContent='Non salvato: '+x.error.message;return}
              close(true)}},'Salva')]);
          if(ok)adminAnnouncements()}},'Modifica'),
        h('button',{class:'linkbtn small',onclick:async()=>{if(!await askYes('Eliminare l’avviso?','Sparisce per tutti i destinatari, notifiche comprese.','Elimina'))return;await sb.from('announcements').delete().eq('id',a.id);adminAnnouncements()}},'Elimina'))}):h('p',{class:'sub'},'Nessun avviso alla scuola.'),
    aTabs('anag'),footer());
}

async function teacherAnnouncements(c){
  const back=()=>teacherHome();
  mount(topbar('Avvisi · '+c.name,back),h('p',{class:'sub'},'Caricamento…'));
  const [ls,cs,adm]=await Promise.all([
    sb.from('announcements').select('id,title,body,created_at,course_id,show_from,show_until,created_by').eq('course_id',c.id).order('created_at',{ascending:false}).limit(40),
    sb.from('courses').select('id,school_id,name').eq('active',true),
    sb.rpc('my_staff_announcements')]);
  const fromAdm=(adm&&Array.isArray(adm.data))?adm.data:[];
  if(ls.error)return mount(topbar('Avvisi',back),h('p',{class:'err'},'Errore nel caricamento.'),footer());
  const ti=h('input',{class:'txt',type:'text',maxlength:'120',placeholder:'Titolo (es. Lezione di giovedì spostata)'});
  const bo=h('textarea',{class:'txt',rows:'4',maxlength:'1200',placeholder:'Testo (facoltativo)'});
  const scope=h('select',{class:'txt sel','aria-label':'Destinatari'},[['one','Solo questo corso'],['all','Tutti i miei corsi']].map(([v,t])=>h('option',{value:v},t)));
  const dFrom=h('input',{class:'txt',type:'date',value:isoD(new Date()),'aria-label':'Visibile dal'});
  const dTo=h('input',{class:'txt',type:'date','aria-label':'Visibile fino al'});
  const msg=h('p',{role:'status'});
  const pub=h('button',{class:'primary',onclick:async()=>{
    if(!ti.value.trim()){msg.className='err';msg.textContent='Scrivi un titolo.';return}
    if(dTo.value&&dFrom.value&&dTo.value<dFrom.value){msg.className='err';msg.textContent='La data «fino al» è prima di «dal».';return}
    pub.disabled=true;
    const targets=scope.value==='all'?cs.data:[c];
    const {error}=await sb.from('announcements').insert(targets.map(t=>({school_id:t.school_id||c.school_id,course_id:t.id,title:ti.value.trim(),body:bo.value.trim()||null,show_from:dFrom.value||null,show_until:dTo.value||null})));
    pub.disabled=false;
    if(error){msg.className='err';msg.textContent='Non pubblicato: '+error.message;return}
    teacherAnnouncements(c);
  }},'Pubblica');
  mount(topbar('Avvisi · '+c.name,back),
    fromAdm.length?h('div',{class:'card'},h('h3',null,'Dall’amministrazione'),fromAdm.map(x=>h('div',null,h('strong',null,x.title),x.body?h('p',{class:'ann-b'},x.body):null,h('span',{class:'sub small'},fmtDate(x.created_at)+(x.show_until?' · fino al '+fmtDate(x.show_until):''))))):null,
    h('div',{class:'card'},h('h3',null,'Nuovo avviso'),ti,bo,h('label',null,'Destinatari',scope),h('label',null,'Visibile dal',dFrom),h('label',null,'Fino al (facoltativo: senza data resta finché non lo elimini)',dTo),h('p',{class:'sub small'},'Gli alunni ricevono una sola notifica alla pubblicazione. Poi puoi correggere l’avviso o cambiarne le date senza altre notifiche.'),pub,msg),
    ls.data.map(a=>{const today=isoD(new Date());const st=a.show_until&&a.show_until<today?'scaduto':(a.show_from&&a.show_from>today?'programmato':'visibile');
      return h('div',{class:'card ann'},h('div',{class:'row'},h('strong',null,a.title),h('span',{class:'sub small'},fmtDate(a.created_at))),a.body?h('p',{class:'ann-b'},a.body):null,
      h('p',{class:'sub small'},h('span',{class:'pill '+(st==='visibile'?'g':'n')},st),' '+(a.show_from?'dal '+fmtDate(a.show_from):'')+(a.show_until?' fino al '+fmtDate(a.show_until):' senza scadenza')),
      h('button',{class:'linkbtn small',onclick:async()=>{
        const t2=h('input',{class:'txt',type:'text',maxlength:'120',value:a.title,'aria-label':'Titolo'});
        const b2=h('textarea',{class:'txt',rows:'4',maxlength:'1200','aria-label':'Testo'});b2.value=a.body||'';
        const f2=h('input',{class:'txt',type:'date',value:a.show_from||'','aria-label':'Visibile dal'});
        const u2=h('input',{class:'txt',type:'date',value:a.show_until||'','aria-label':'Visibile fino al'});
        const er=h('p',{class:'err'});
        const ok=await dlg('Modifica avviso',[h('p',{class:'sub small'},'Gli alunni non ricevono una nuova notifica: vedono l’avviso aggiornato.'),t2,b2,h('label',{class:'small'},'Visibile dal',f2),h('label',{class:'small'},'Fino al (vuoto = nessuna scadenza)',u2),er],close=>[
          h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),
          h('button',{class:'primary',onclick:async()=>{
            if(!t2.value.trim()){er.textContent='Scrivi un titolo.';return}
            if(u2.value&&f2.value&&u2.value<f2.value){er.textContent='La data «fino al» è prima di «dal».';return}
            const x=await sb.from('announcements').update({title:t2.value.trim(),body:b2.value.trim()||null,show_from:f2.value||null,show_until:u2.value||null,updated_at:new Date().toISOString()}).eq('id',a.id);
            if(x.error){er.textContent='Non salvato: '+x.error.message;return}
            close(true)}},'Salva')]);
        if(ok)teacherAnnouncements(c)}},'Modifica'),
      h('button',{class:'linkbtn small',onclick:async()=>{if(!await askYes('Eliminare l’avviso?','Gli alunni non lo vedranno più.','Elimina'))return;await sb.from('announcements').delete().eq('id',a.id);teacherAnnouncements(c)}},'Elimina'))}),
    footer());
}

/* ---------- lezioni ed esercizi: importazione da file, bozze, anteprima ---------- */
function jsLit(src,pos,env){
  let i=pos;
  const bad=m=>{const e=new Error(m);e.at=i;throw e};
  const ws=()=>{for(;;){const c=src[i];
    if(c===' '||c==='\n'||c==='\t'||c==='\r'||c===' '||c==='﻿'){i++;continue}
    if(c==='/'&&src[i+1]==='/'){while(i<src.length&&src[i]!=='\n')i++;continue}
    if(c==='/'&&src[i+1]==='*'){const e=src.indexOf('*/',i+2);if(e<0)bad('commento non chiuso');i=e+2;continue}
    break}};
  const str=()=>{const q=src[i++];let o='';
    while(i<src.length){const c=src[i++];
      if(c===q)return o;
      if(c==='\\'){const n=src[i++];
        if(n==='n')o+='\n';else if(n==='t')o+='\t';else if(n==='r')o+='\r';
        else if(n==='u'){o+=String.fromCharCode(parseInt(src.substr(i,4),16));i+=4}
        else if(n!=='\n')o+=n}
      else if(c==='\n')bad('testo non chiuso (manca una virgoletta)');
      else o+=c}
    bad('testo non chiuso (manca una virgoletta)')};
  const val=()=>{
    ws();const c=src[i];
    if(c===undefined)bad('il file finisce a metà');
    if(c==='['){i++;const a=[];for(;;){ws();if(src[i]===']'){i++;return a}a.push(val());ws();
      if(src[i]===','){i++;continue}if(src[i]===']'){i++;return a}bad('manca una virgola o la parentesi chiusa ]')}}
    if(c==='{'){i++;const o={};for(;;){ws();if(src[i]==='}'){i++;return o}
      let k;if(src[i]==='"'||src[i]==="'")k=str();else{const m=/^[A-Za-z_$0-9][\w$]*/.exec(src.slice(i,i+80));if(!m)bad('nome di campo non valido');i+=m[0].length;k=m[0]}
      ws();if(src[i]!==':')bad('manca “:” dopo «'+k+'»');i++;o[k]=val();ws();
      if(src[i]===','){i++;continue}if(src[i]==='}'){i++;return o}bad('manca una virgola o la parentesi chiusa }')}}
    if(c==='"'||c==="'")return str();
    if(c==='`')bad('i testi tra apici inversi non sono supportati');
    if(c==='-'||(c>='0'&&c<='9')){const m=/^-?\d+(\.\d+)?/.exec(src.slice(i,i+30));if(!m)bad('numero non valido');i+=m[0].length;return Number(m[0])}
    const m=/^[A-Za-z_$][\w$]*/.exec(src.slice(i,i+80));if(!m)bad('carattere inatteso «'+c+'»');i+=m[0].length;const name=m[0];
    if(name==='true')return true;if(name==='false')return false;if(name==='null'||name==='undefined')return null;
    ws();
    if(src[i]==='('){
      if(name!=='mk')bad('la funzione «'+name+'» non è prevista');
      i++;const args=[];for(;;){ws();if(src[i]===')'){i++;break}args.push(val());ws();
        if(src[i]===','){i++;continue}if(src[i]===')'){i++;break}bad('manca una virgola o la parentesi chiusa )')}
      return Object.assign({t:args[0],h:args[1],c:args[2],r:args[3]},args[4]||{});
    }
    if(Object.prototype.hasOwnProperty.call(env,name))return env[name];
    bad('«'+name+'» non è un dato noto');
  };
  const v=val();return {v,end:i};
}
const LKIND={'Flash cards':'flash','Match up':'match','Matching pairs':'match','Find the match':'match','Quiz':'quiz','Unjumble':'unjumble','Complete the sentence':'cloze','Group sort':'group','Spin the wheel':'cards','Open the box':'cards','Speaking cards':'cards'};
const LALIAS={'flash':'Flash cards','abbina':'Match up','quiz':'Quiz','riordina':'Unjumble','completa':'Complete the sentence','gruppi':'Group sort','carte':'Speaking cards'};
const LNAME={type:'Scrivi la risposta',flash:'Flash cards',match:'Abbina',quiz:'Quiz',unjumble:'Riordina la frase',cloze:'Completa la frase',group:'Dividi in gruppi',cards:'Carte per parlare'};
const KMAP={quiz:'quiz',match:'match',unjumble:'unjumble',type:'type',group:'group',cards:'cards',flash:'flash',cloze:'cloze'};
const MATCH_T=['Match up','Matching pairs','Find the match'];
const WW_INSTR=/wordwall|double sided|crea (tre|due|quattro) gruppi|domanda, risposta corretta|per ogni riga|parentesi quadre|a due a due come un memory|editor/i;
function lineOf(text,pos){let n=1;for(let k=0;k<pos&&k<text.length;k++)if(text.charCodeAt(k)===10)n++;return n}
function mergeLessons(L,ADD){
  return L.map(l0=>{
    const l={n:l0.n,t:l0.t,ex:(l0.ex||[]).slice()};
    ((ADD&&ADD[l.n])||[]).forEach(a=>l.ex.push(a));
    const fl=l.ex.filter(x=>x.t==='Flash cards');l.ex=l.ex.filter(x=>x.t!=='Flash cards');
    fl.forEach(f=>{f.extra=1});
    if(!fl.length){const m=l.ex.find(x=>MATCH_T.includes(x.t)&&!x.nf&&Array.isArray(x.c)&&x.c[0]!=='Domanda'&&Array.isArray(x.r));
      if(m)fl.push({t:'Flash cards',h:'Flash card: '+m.h,c:m.c,r:m.r,extra:1})}
    fl.forEach(f=>l.ex.push(f));
    l.ex.sort((a,b)=>(a.extra?1:0)-(b.extra?1:0));
    return l});
}
/* legge il file HTML di Francesca (const L e const ADD) senza eseguirlo */
function readLessonHtml(text){
  const env={},warn=[];
  const declRe=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;let m;
  while((m=declRe.exec(text))){
    const nm=m[1];if(nm==='L'||nm==='ADD')continue;
    try{let r=jsLit(text,m.index+m[0].length,env);env[nm]=r.v;let j=r.end;
      for(;;){const mm=/^\s*,\s*([A-Za-z_$][\w$]*)\s*=\s*/.exec(text.slice(j,j+200));if(!mm)break;
        const r2=jsLit(text,j+mm[0].length,env);env[mm[1]]=r2.v;j=r2.end}
    }catch(e){}
  }
  const get=(name,must)=>{
    const mm=new RegExp('\\bconst\\s+'+name+'\\s*=\\s*').exec(text);
    if(!mm){if(must)throw new Error('Non trovo l’elenco delle lezioni (const '+name+' = […]) nel file. È il file degli esercizi di Francesca?');return null}
    try{return jsLit(text,mm.index+mm[0].length,env).v}
    catch(e){throw new Error('Errore nel file alla riga '+lineOf(text,e.at||mm.index)+': '+e.message)}
  };
  const L=get('L',true),ADD=get('ADD',false);
  if(!Array.isArray(L))throw new Error('L’elenco delle lezioni nel file non è nel formato atteso.');
  const patched=new Set();let pm;const pr=/\bL\[(\d+)\]\.ex/g;while((pm=pr.exec(text)))patched.add(+pm[1]+1);
  const present=new Set(L.map(x=>x.n));
  /* aggiunte "a parte" in coda al file: L[i].ex.find(x => x.t === 'Match up') … .r.push([..],[..]) */
  const patches=[];const pf=/\bL\[(\d+)\]\.ex\.find\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.t\s*===\s*(['"])(.*?)\2\s*\)/g;let fm;
  while((fm=pf.exec(text))){
    const rest=text.slice(fm.index,fm.index+600),pp=/\.r\.push\(\s*/.exec(rest);if(!pp)continue;
    try{let at=fm.index+pp.index+pp[0].length;const rows=[];
      for(;;){const r=jsLit(text,at,env);if(!Array.isArray(r.v))break;rows.push(r.v);at=r.end;
        const mm=/^\s*,\s*/.exec(text.slice(at,at+40));if(!mm)break;at+=mm[0].length}
      if(rows.length)patches.push({n:+fm[1]+1,t:fm[3],rows});
    }catch(e){}
  }
  const patchedN=new Set(patches.map(x=>x.n));
  patched.forEach(n=>present.has(n)&&!patchedN.has(n)&&warn.push('La lezione '+n+' ha correzioni scritte direttamente nel codice del file: l’app non le legge. Controlla l’anteprima di quella lezione.'));
  return {lessons:mergeLessons(L,ADD||{}),warnings:warn,patches:patches.filter(x=>present.has(x.n))};
}
function readLessonJson(text){
  let d;try{d=JSON.parse(text)}catch(e){throw new Error('Il file non è un JSON valido: '+e.message)}
  const arr=Array.isArray(d)?d:(d.lezioni||[d]);
  const lessons=arr.map(x=>({n:x.numero,t:x.titolo,ex:(x.esercizi||[]).map(e=>({
    t:LALIAS[String(e.tipo||'').toLowerCase()]||e.tipo,h:e.titolo,s:e.istruzioni||'',hw:!!e.compiti,nf:!!e.senza_flash,c:e.colonne||[],r:e.righe}))}));
  return {lessons:mergeLessons(lessons,{}),warnings:[]};
}
function readLessonFile(text){
  text=String(text||'').replace(/^﻿/,'');
  return /^\s*[\[{]/.test(text)?readLessonJson(text):readLessonHtml(text);
}
/* trasforma una lezione del file nel formato dell’app e controlla gli errori */
function mapLesson(l){
  const probs=[],exs=[];
  if(!Number.isInteger(l.n)||l.n<1||l.n>200)probs.push('Una lezione ha un numero non valido ('+l.n+').');
  if(!l.t||!String(l.t).trim())probs.push('Lezione '+l.n+': manca il titolo.');
  if(!Array.isArray(l.ex)||!l.ex.length)probs.push('Lezione '+l.n+': non ha esercizi.');
  (l.ex||[]).forEach((x,i)=>{
    const P=(row,msg)=>probs.push('Lezione '+l.n+' · esercizio '+(i+1)+(x&&x.h?' «'+x.h+'»':'')+(row?', riga '+row:'')+': '+msg);
    /* due formati di file: «t» = tipo Wordwall (Francesca), «k» = tipo delle pagine di esercizi autonome (con spiegazioni «e») */
    const dk=x&&x.t===undefined&&x.k!==undefined;
    const type=dk?KMAP[x.k]:LKIND[x.t];
    if(!type)return P(0,'il tipo «'+(dk?x.k:x.t)+'» non è riconosciuto'+(dk?' (tipi ammessi: '+Object.keys(KMAP).join(', ')+').':' (tipi ammessi: '+Object.keys(LKIND).join(', ')+').'));
    if(!x.h||!String(x.h).trim())P(0,'manca il titolo.');
    if(!Array.isArray(x.r)||!x.r.length)return P(0,'non ci sono righe.');
    const o={id:'e'+(i+1),type,title:String(x.h||'').trim(),instr:(x.s&&!WW_INSTR.test(x.s))?String(x.s).trim():''};
    if(x.hw)o.hw=true;
    const items=[],groups=[];const expl=(x.e&&typeof x.e==='object'&&!Array.isArray(x.e))?x.e:null;
    x.r.forEach((row,k)=>{
      const n0=items.length;
      const n=k+1;
      if(!Array.isArray(row))return P(n,'la riga non è un elenco di celle.');
      const r=row.map(c=>String(c==null?'':c).trim());
      if(!r.some(Boolean))return P(n,'riga vuota.');
      const id=o.id+'.'+(items.length+1);
      if(type==='quiz'){
        const w=r.slice(2).filter(Boolean);
        if(!r[0]||!r[1])return P(n,'servono la domanda e la risposta corretta.');
        if(!w.length)return P(n,'serve almeno una risposta errata.');
        if(w.includes(r[1]))P(n,'una risposta errata è uguale a quella corretta.');
        items.push({id,q:r[0],a:r[1],w});
      }else if(type==='match'){
        if(!r[0]||!r[1])return P(n,'servono due celle: sinistra e destra.');
        items.push({id,l:r[0],r:r[1]});
      }else if(type==='cloze'){
        const found=r[0].match(/\[[^\[\]]*\]/g)||[];
        if(!found.length)return P(n,'manca la parola da indovinare tra parentesi quadre [ ].');
        if(found.length>1)return P(n,'c’è più di una parola tra parentesi quadre: ne serve una sola per riga.');
        const at=r[0].indexOf(found[0]),ans=found[0].slice(1,-1).trim();
        if(!ans)return P(n,'le parentesi quadre sono vuote.');
        items.push({id,pre:r[0].slice(0,at),ans,post:r[0].slice(at+found[0].length)});
      }else if(type==='unjumble'){
        if(!r[0])return P(n,'manca la frase.');
        if(r[0].split(/\s+/).length<2)P(n,'la frase ha una sola parola.');
        items.push({id,s:dk?r.filter(Boolean):[r[0]]});
      }else if(type==='cards'){
        if(!r[0])return P(n,'manca il testo della carta.');
        items.push({id,t:r[0]});
      }else if(type==='group'){
        const el=r.slice(1).filter(Boolean);
        if(!r[0]||!el.length)return P(n,'servono il nome del gruppo e almeno un elemento.');
        const g=groups.length;groups.push(r[0]);
        el.forEach(t=>items.push({id:o.id+'.'+(items.length+1),g,t}));
      }else if(type==='flash'){
        if(!r[0]||!r[1])return P(n,'servono due celle: fronte e retro.');
        items.push({id,f:r[0],b:r[1]});
      }else if(type==='type'){
        if(!r[0]||!r[1])return P(n,'servono la frase con ___ e la risposta.');
        if(!r[0].includes('___'))P(n,'nella frase manca il segno ___ dove va scritta la risposta.');
        items.push({id,q:r[0],a:r[1]});
      }
      if(expl&&type!=='group'&&items.length>n0&&expl[row[0]]!=null&&String(expl[row[0]]).trim())items[items.length-1].e=String(expl[row[0]]).trim();
    });
    if(type==='match'&&items.length<2)P(0,'servono almeno due coppie.');
    if(type==='group'&&groups.length<2)P(0,'servono almeno due gruppi.');
    if(!items.length)return P(0,'nessuna riga utilizzabile.');
    if(type==='group')o.groups=groups;
    if(type==='flash'){if(Array.isArray(x.c))o.cols=x.c.slice(0,2);o.extra=true}
    o.items=items;exs.push(o);
  });
  return {number:l.n,title:String(l.t||'').trim(),content:{exercises:exs},problems:probs};
}
function canon(v){
  if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
const errIt=e=>String((e&&e.message)||e||'Errore').replace(/^ESERCIZI_BLOCCATI:\s*/,'');
function exSummary(content){
  return (content.exercises||[]).map((e,i)=>(i+1)+'. '+(LNAME[e.type]||e.type)+' · '+e.title+' ('+e.items.length+')').join('\n');
}
/* ---- schermata del docente: elenco lezioni ---- */
async function teacherLessons(c,all){
  all=all||[c];S.prev=null;
  const back=()=>teacherHome();
  mount(topbar('Lezioni ed esercizi',back),h('p',{class:'sub'},'Caricamento…'));
  const r=await sb.rpc('teacher_lessons_overview',{p_course:c.id});
  if(r.error)return mount(topbar('Lezioni ed esercizi',back),h('p',{class:'err'},'Errore nel caricamento.'),footer());
  const ls=r.data||[];
  const pick=all.length>1?courseCascade(all,c.id,n=>teacherLessons(n,all)):null;
  const redo=()=>teacherLessons(c,all);
  const fileIn=h('input',{type:'file',accept:'.html,.htm,.json,.txt,text/html,application/json,text/plain',style:'display:none',onchange:async()=>{
    const f=fileIn.files&&fileIn.files[0];if(!f)return;
    let txt;try{txt=await f.text()}catch(e){return say('File non leggibile','Non riesco a leggere il file. Riprova.')}
    lessonImportPreview(c,all,ls,txt,f.name)}});
  const others=c.kind==='individual'?[]:all.filter(x=>x.id!==c.id&&x.level===c.level&&x.kind===c.kind);
  const copyBtn=others.length?h('button',{class:'secondary',onclick:async()=>{
    const sel=selEl(others.map(x=>[x.id,x.name]),others[0].id,'Classe da cui copiare');
    const list=h('div',{class:'rows'});let boxes=[];
    const load=async()=>{
      list.replaceChildren(h('p',{class:'sub small',style:'padding:8px'},'Caricamento…'));
      const r=await sb.rpc('teacher_lessons_overview',{p_course:sel.value});
      const src=(r.data||[]);
      boxes=src.map(l=>{const cb=h('input',{type:'checkbox'});const mine=ls.find(x=>x.number===l.number);
        return {l,cb,el:h('label',{class:'row-item chk-row'},h('span',{class:'ri-l'},cb,' Lezione '+l.number+' · '+l.title),
          h('span',{class:'sub small'},l.n_ex+' esercizi'+(mine?(mine.has_results?' · già svolta qui: salta':' · esiste già: verrà sostituita'):'')))}});
      list.replaceChildren(...(boxes.length?boxes.map(b=>b.el):[h('p',{class:'sub small',style:'padding:8px'},'Questa classe non ha lezioni.')]));
    };
    sel.addEventListener('change',load);
    const all=h('button',{class:'linkbtn small',onclick:()=>{const v=boxes.some(b=>!b.cb.checked);boxes.forEach(b=>b.cb.checked=v)}},'Seleziona / deseleziona tutte');
    const pr=dlg('Copia lezioni da un’altra classe',[
      h('p',{class:'sub small'},'Scegli le lezioni da copiare in «'+c.name+'»: arrivano come bozze, che potrai provare e modificare. Una lezione che esiste già qui viene sostituita (la versione attuale resta ripristinabile), salvo quelle con esercizi già svolti. Le due classi poi vanno avanti ciascuna per conto suo.'),sel,all,list],
      close=>[h('button',{class:'secondary',onclick:()=>close(null)},'Annulla'),h('button',{class:'primary',onclick:()=>close({from:sel.value,nums:boxes.filter(b=>b.cb.checked).map(b=>b.l.number)})},'Copia le selezionate')]);
    load();const v=await pr;
    if(!v)return;if(!v.nums.length)return say('Niente da copiare','Non hai selezionato nessuna lezione.');
    const x=await sb.rpc('teacher_copy_lessons',{p_from:v.from,p_to:c.id,p_numbers:v.nums});
    if(x.error)return say('Non copiate',errIt(x.error));
    const d=x.data||{};
    await say('Fatto','Nuove bozze: '+(d.created||0)+' · sostituite: '+(d.replaced||0)+((d.skipped&&d.skipped.length)?' · saltate perché già svolte: '+d.skipped.join(', '):'')+'.');redo();
  }},'Copia lezioni da un’altra classe'):null;
  const card=l=>{
    const act=[];
    const openPrev=cur=>{S.prev={draft:!cur.published,back:()=>{S.prev=null;redo()},fix:()=>lessonTextFix(c,all,cur,nc=>{cur.content=nc;l.content=nc;openPrev(cur)})};lessonView(c,{id:cur.id,number:cur.number,title:cur.title,content:cur.content})};
    act.push(h('button',{class:'secondary',onclick:()=>openPrev(l)},'Anteprima'));
    act.push(h('button',{class:'secondary',onclick:()=>lessonTextFix(c,all,l,null)},'Correggi testi'));
    act.push(h('button',{class:l.published?'secondary':'primary',onclick:async()=>{
      if(l.published&&l.n_access&&!await askYes('Rimettere in bozza?','La lezione è sbloccata per '+l.n_access+' alunni: non la vedranno più finché non la ripubblichi.','Rimetti in bozza'))return;
      const x=await sb.rpc('teacher_set_lesson_published',{p_lesson:l.id,p_pub:!l.published});
      if(x.error)return say('Non riuscito',errIt(x.error));
      if(!l.published)await say('Pubblicata','La lezione è pronta. Per farla vedere agli alunni usa «Sblocca lezioni».');
      redo()}},l.published?'Rimetti in bozza':'Pubblica'));
    act.push(h('button',{class:'secondary',onclick:async()=>{
      const v=await askText('Titolo della lezione '+l.number,'Cambia il titolo come preferisci.',l.title,'Salva');
      if(v==null)return;const t=v.trim();if(!t||t===l.title)return;
      const x=await sb.from('lessons').update({title:t}).eq('id',l.id);
      if(x.error)return say('Non salvato',errIt(x.error));redo()}},'Rinomina'));
    if(l.n_backups>0)act.push(h('button',{class:'linkbtn small',onclick:async()=>{
      if(!await askYes('Tornare alla versione precedente?','La lezione '+l.number+' torna a com’era prima dell’ultima sostituzione. La versione attuale diventa a sua volta la «precedente», quindi puoi tornare indietro.','Ripristina'))return;
      const x=await sb.rpc('teacher_restore_lesson',{p_lesson:l.id});
      if(x.error)return say('Non ripristinata',errIt(x.error));redo()}},'Ripristina versione precedente'));
    return h('div',{class:'card'},
      h('strong',null,'Lezione '+l.number+' · '+l.title),
      h('p',{class:'sub small'},h('span',{class:'pill '+(l.published?'g':'n')},l.published?'Pubblicata':'Bozza'),' '+l.n_ex+' esercizi'+(l.has_results?' · 🔒 con esercizi già svolti dagli alunni':'')),
      h('div',{class:'row'},act));
  };
  mount(topbar('Lezioni ed esercizi',back),
    pick,
    h('p',{class:'sub'},c.name),
    h('div',{class:'row'},h('button',{class:'primary',onclick:()=>fileIn.click()},'Carica lezioni da file'),copyBtn),fileIn,
    others.length?h('p',{class:'sub small'},'«Copia lezioni» propone solo classi dello stesso livello ('+c.level+') e della stessa tipologia ('+(c.kind==='group'?'di gruppo':'individuali')+') e dello stesso docente.'):null,
    h('p',{class:'sub small'},'Le lezioni caricate restano in bozza finché non le pubblichi: provale con «Anteprima», cambia i titoli e poi pubblica. Quando gli alunni hanno già svolto degli esercizi, quelli non si possono più cambiare: puoi solo rinominare la lezione o aggiungere esercizi in fondo.'),
    ls.length?ls.map(card):h('p',{class:'sub'},'Nessuna lezione in questa classe.'),
    footer());
}
/* ---- anteprima dell’importazione ---- */
/* correzione rapida dei testi di una lezione in bozza (refusi); le modifiche strutturali verranno con l'editor a blocchi */
function lessonTextFix(c,all,l,onSaved){
  const back=()=>teacherLessons(c,all);
  const ret=()=>onSaved?onSaved(content):back();
  const content=JSON.parse(JSON.stringify(l.content||{exercises:[]}));
  const LAB={title:'Titolo',instr:'Istruzioni',lab:'Etichetta',t:'Testo',l:'Sinistra',r:'Destra',q:'Domanda',a:'Risposta corretta',w:'Risposta sbagliata',pre:'Prima',ans:'Parola',post:'Dopo',s:'Frase',f:'Fronte',b:'Retro',cols:'Colonna',groups:'Gruppo',e:'Spiegazione'};
  const KEEP=new Set(['pre','post']);
  const fields=[];
  const mk=(obj,key,idx,label,long)=>{
    const val=idx==null?obj[key]:obj[key][idx];
    const inp=h(long?'textarea':'input',long?{class:'txt',rows:'2','aria-label':label}:{class:'txt',type:'text','aria-label':label});
    inp.value=val;fields.push({obj,key,idx,inp,orig:val,label});
    return h('label',{class:'small'},label,inp);
  };
  const SK=new Set(['id','type','hw','extra','ord','g']);
  const blocks=(content.exercises||[]).map((ex,i)=>{
    const kids=[h('strong',null,'Esercizio '+(i+1)),mk(ex,'title',null,'Titolo esercizio')];
    if(typeof ex.instr==='string')kids.push(mk(ex,'instr',null,'Istruzioni',true));
    if(typeof ex.lab==='string'&&ex.lab)kids.push(mk(ex,'lab',null,'Etichetta'));
    ['cols','groups'].forEach(k=>Array.isArray(ex[k])&&ex[k].forEach((v,j)=>typeof v==='string'&&kids.push(mk(ex,k,j,LAB[k]+' '+(j+1)))));
    (ex.items||[]).forEach((it,j)=>{
      const row=[h('span',{class:'sub small'},'Riga '+(j+1))];
      Object.keys(it).forEach(k=>{
        if(SK.has(k))return;const v=it[k];
        if(typeof v==='string')row.push(mk(it,k,null,LAB[k]||k,v.length>60));
        else if(Array.isArray(v))v.forEach((x,m)=>typeof x==='string'&&row.push(mk(it,k,m,(LAB[k]||k)+(v.length>1?' '+(m+1):''),x.length>60)));
      });
      kids.push(h('div',{class:'tf-row'},row));
    });
    return h('div',{class:'card'},kids);
  });
  const err=h('p',{class:'err',role:'alert'});
  const save=async()=>{
    err.textContent='';let n=0;
    for(const f of fields){
      const v=KEEP.has(f.key)?f.inp.value:f.inp.value.trim();
      if(v===f.orig)continue;
      if(!v.trim()&&f.orig.trim()){err.textContent='«'+f.label+'» non può restare vuoto.';f.inp.focus();return}
      if(f.idx==null)f.obj[f.key]=v;else f.obj[f.key][f.idx]=v;n++;
    }
    if(!n)return ret();
    const x=await sb.from('lessons').update({content}).eq('id',l.id);
    if(x.error){err.textContent='Non salvato: '+errIt(x.error);return}
    await say('Salvato',n+(n===1?' testo corretto.':' testi corretti.')+' La versione precedente resta ripristinabile.');ret();
  };
  mount(topbar('Correggi testi · lezione '+l.number,ret),
    h('p',{class:'sub small'},'Correggi refusi nel titolo e nei testi degli esercizi, anche se la lezione è già pubblicata o svolta dagli alunni (i loro risultati restano). Qui non si aggiungono né si tolgono righe e non si cambia il tipo: per quello ci sarà l’editor a blocchi.'+(l.has_results?' Gli alunni hanno già svolto alcuni esercizi: cambia solo i testi sbagliati.':'')),
    blocks,err,h('div',{class:'row'},h('button',{class:'primary',onclick:save},'Salva correzioni'),h('button',{class:'secondary',onclick:ret},'Annulla')),footer());
}

function lessonImportPreview(c,all,existing,text,fname,withPatch){
  const back=()=>teacherLessons(c,all);
  let parsed;
  try{parsed=readLessonFile(text)}catch(e){return say('File non letto',e.message)}
  if(!parsed.lessons.length)return say('File vuoto','Nel file non ci sono lezioni.');
  const patchInfo=[];
  (parsed.patches||[]).forEach(pt=>{
    const l=parsed.lessons.find(x=>x.n===pt.n);const ex=l&&l.ex.find(x=>x.t===pt.t);if(!ex||!Array.isArray(ex.r))return;
    const have=new Set(ex.r.map(r=>JSON.stringify(r)));const add=pt.rows.filter(r=>!have.has(JSON.stringify(r)));
    if(!add.length)return;
    patchInfo.push({n:pt.n,h:ex.h,k:add.length});
    if(withPatch)ex.r=ex.r.concat(add);
  });
  const seen={};parsed.lessons.forEach(l=>{seen[l.n]=(seen[l.n]||0)+1});
  const rows=parsed.lessons.map(l=>{
    const m=mapLesson(l);const ex=existing.find(e=>e.number===m.number);
    let state='new',note='Nuova lezione: verrà creata come bozza.';
    if(seen[m.number]>1)m.problems.push('Lezione '+m.number+': nel file compare più di una volta.');
    if(ex){
      const oldEx=(ex.content&&ex.content.exercises)||[];
      if(ex.has_results){
        const same=oldEx.every((e,i)=>m.content.exercises[i]&&canon(m.content.exercises[i])===canon(e));
        if(!same)m.problems.push('Lezione '+m.number+': gli alunni hanno già svolto esercizi di questa lezione e nel file i primi '+oldEx.length+' sono diversi da quelli già presenti: non si possono sostituire.');
        else if(m.content.exercises.length===oldEx.length){state='same';note='Identica a quella già presente: niente da fare.'}
        else{state='append';note='Ha esercizi già svolti: verranno solo aggiunti '+(m.content.exercises.length-oldEx.length)+' esercizi in fondo'+(ex.published?' e gli alunni riceveranno una notifica.':'.')}
      }else if(canon(ex.content)===canon(m.content)){state='same';note='Identica a quella già presente: niente da fare.'}
      else{state='replace';note='Sostituisce la lezione già presente'+(ex.published?' (ora pubblicata: tornerà in bozza; la versione attuale resta ripristinabile).':' (è già una bozza; la versione attuale resta ripristinabile).')}
    }
    if(m.problems.length)note=ex?'Lezione già presente in questa classe.':'';
    return {m,ex,state,note};
  });
  const ok=r=>!r.m.problems.length&&r.state!=='same';
  const boxes=[];
  const cards=rows.map(r=>{
    const cb=h('input',{type:'checkbox',id:'imp'+r.m.number});cb.checked=ok(r);cb.disabled=!ok(r);
    const ti=h('input',{class:'txt',type:'text',value:r.m.title,maxlength:'160','aria-label':'Titolo lezione '+r.m.number});
    if(r.state==='append'||r.state==='same')ti.disabled=true;
    boxes.push({r,cb,ti});
    return h('div',{class:'card'},
      h('label',{for:'imp'+r.m.number,class:'chk-row'},cb,h('strong',null,' Lezione '+r.m.number)),
      h('label',null,'Titolo',ti),
      r.ex&&r.ex.title!==r.m.title?h('p',{class:'sub small'},'Titolo attuale: '+r.ex.title):null,
      h('p',{class:'sub small'},r.note),
      r.m.problems.length?h('div',{class:'err',role:'alert'},r.m.problems.map(p=>h('p',{class:'small'},p))):null,
      !r.m.problems.length?h('pre',{class:'small',style:'white-space:pre-wrap;margin:0;font-family:inherit'},exSummary(r.m.content)):null);
  });
  const nothing=!rows.some(ok);
  const setAll=v=>boxes.forEach(b=>{if(!b.cb.disabled)b.cb.checked=v});
  const selBar=()=>h('div',{class:'row'},h('button',{class:'secondary small',onclick:()=>setAll(true)},'Seleziona tutte'),h('button',{class:'secondary small',onclick:()=>setAll(false)},'Deseleziona tutte'));
  const go=h('button',{class:'primary',disabled:nothing,onclick:async()=>{
    const sel=boxes.filter(b=>b.cb.checked);
    if(!sel.length)return say('Niente da importare','Seleziona almeno una lezione.');
    go.disabled=true;const out=[];
    for(const b of sel){
      const title=b.ti.value.trim()||b.r.m.title;
      const x=await sb.rpc('teacher_import_lesson',{p_course:c.id,p_number:b.r.m.number,p_title:title,p_content:b.r.m.content});
      out.push('Lezione '+b.r.m.number+': '+(x.error?'NON importata — '+errIt(x.error):({created:'creata come bozza',replaced:'sostituita, ora è una bozza',appended:'esercizi aggiunti in fondo'})[x.data&&x.data.status]||'ok'));
    }
    await say('Importazione terminata',out.join('\n'));
    back();
  }},'Importa come bozza');
  mount(topbar('Carica lezioni',back),
    h('p',{class:'sub'},'File: '+fname+' · '+rows.length+' lezioni trovate. Scegli quali importare: le lezioni nuove o cambiate sono già selezionate; non si possono selezionare quelle identiche a quelle già presenti o con errori (il motivo è scritto sotto ogni lezione).'),
    parsed.warnings.length?h('div',{class:'card'},parsed.warnings.map(w=>h('p',{class:'small'},'⚠ '+w))):null,
    patchInfo.length?h('div',{class:'card'},
      h('p',null,'Trovate delle aggiunte scritte a parte in fondo al file (una correzione successiva, non nell’elenco delle lezioni):'),
      patchInfo.map(q=>h('p',{class:'small'},'• Lezione '+q.n+', esercizio «'+q.h+'»: '+q.k+(q.k===1?' voce in più':' voci in più'))),
      h('label',{class:'chk-row'},(()=>{const cb=h('input',{type:'checkbox'});cb.checked=!!withPatch;cb.addEventListener('change',()=>lessonImportPreview(c,all,existing,text,fname,cb.checked));return cb})(),h('strong',null,' Vuoi aggiungerle come voci?'))):null,
    h('p',{class:'sub small'},'Le istruzioni pensate per creare gli esercizi su Wordwall non vengono mostrate agli alunni.'),
    selBar(),
    cards,
    selBar(),
    h('div',{class:'row'},go,h('button',{class:'secondary',onclick:back},'Annulla')),footer());
}

/* --- sblocco lezioni per gruppo di alunni --- */
async function unlockView(c){
  const back=()=>teacherHome();
  mount(topbar('Sblocca lezioni',back),h('p',{class:'sub'},'Caricamento…'));
  const [ls,en]=await Promise.all([
    sb.from('lessons').select('id,number,title').eq('course_id',c.id).order('number'),
    sb.from('enrollments').select('section,students(id,display_name)').eq('course_id',c.id)
  ]);
  if(ls.error||en.error)return mount(topbar('Sblocca lezioni',back),h('p',{class:'err'},'Errore nel caricamento.'));
  const studs=en.data.filter(e=>e.students).sort((a,b)=>a.students.display_name.localeCompare(b.students.display_name));
  const sel=h('select',{class:'txt sel','aria-label':'Lezione'},ls.data.map(l=>h('option',{value:l.id},'Lezione '+l.number+': '+l.title)));
  const list=h('div',{class:'rows'});const msg=h('p',{role:'status'});
  let access=new Set();const checks={};
  const draw=async()=>{
    list.replaceChildren(h('p',{class:'sub small',style:'padding:12px'},'…'));
    const {data}=await sb.from('lesson_access').select('student_id').eq('lesson_id',sel.value);
    access=new Set((data||[]).map(r=>r.student_id));
    list.replaceChildren(...studs.map(e=>{
      const st=e.students;const cb=h('input',{type:'checkbox',id:'u'+st.id});checks[st.id]=cb;
      return h('label',{class:'row-item chk-row',for:'u'+st.id},
        h('span',{class:'ri-l'},cb,st.display_name,e.section?h('span',{class:'tag'},e.section==='morning'?'mattina':'sera'):null),
        h('span',{class:'pill '+(access.has(st.id)?'g':'n')},access.has(st.id)?'Sbloccata':'Bloccata'));
    }));
  };
  sel.addEventListener('change',draw);
  const act=(unlock)=>async()=>{
    const ids=studs.map(e=>e.students.id).filter(id=>checks[id]&&checks[id].checked);
    if(!ids.length){msg.className='err';msg.textContent='Seleziona almeno un alunno.';return}
    const lessonId=sel.value;let error;
    if(unlock){const me=(await sb.auth.getUser()).data.user;({error}=await sb.from('lesson_access').upsert(ids.map(id=>({student_id:id,lesson_id:lessonId,school_id:c.school_id,unlocked_by:me&&me.id})),{onConflict:'student_id,lesson_id',ignoreDuplicates:true}))}
    else{({error}=await sb.from('lesson_access').delete().eq('lesson_id',lessonId).in('student_id',ids))}
    if(error){msg.className='err';msg.textContent='Operazione non riuscita: '+error.message;return}
    msg.className='ok';msg.textContent=(unlock?'Sbloccata':'Bloccata')+' per '+ids.length+' alunni.';draw();
  };
  const all=h('button',{class:'linkbtn small',onclick:()=>{const v=Object.values(checks).some(c=>!c.checked);Object.values(checks).forEach(c=>c.checked=v)}},'Seleziona / deseleziona tutti');
  mount(topbar('Sblocca lezioni · '+c.name,back),
    h('p',{class:'sub'},'Scegli la lezione, seleziona gli alunni e premi Sblocca: da quel momento la vedono nell’app. Prima non la vedono.'),
    sel,all,list,
    h('div',{class:'row'},h('button',{class:'primary',onclick:act(true)},'Sblocca per i selezionati'),h('button',{class:'secondary',onclick:act(false)},'Blocca')),
    msg,footer());
  draw();
}

/* --- scheda alunno: esercizi, presenze, progressi --- */
async function studentSheet(st,c,tab){
  tab=tab||'ex';
  const back=()=>teacherHome();
  const tb=(id,l)=>h('button',{class:'tab'+(tab===id?' on':''),onclick:()=>studentSheet(st,c,id)},h('span',null,l));
  const head=[topbar(st.display_name,back),h('p',{class:'sub small'},c.name+' · codice ',h('strong',null,String(st.code||'').toUpperCase())),h('div',{class:'row'},tb('ex','Esercizi'),tb('pres','Presenze'),tb('prog','Progressi'))];
  mount(head,h('p',{class:'sub'},'Caricamento…'));
  if(tab==='pres'){
    const r=await sb.rpc('student_history',{p_student:st.id});
    if(r.error)return mount(head,h('p',{class:'err'},'Errore nel caricamento.'));
    return mount(head,...studentHistoryEls(r.data),footer());
  }
  const {data,error}=await sb.from('exercise_results').select('lesson_id,exercise_idx,score,total,details,created_at,lessons(number,title)').eq('student_id',st.id).order('created_at',{ascending:false}).limit(1000);
  if(error)return mount(head,h('p',{class:'err'},'Errore nel caricamento.'));
  if(tab==='ex'){
    const rows=data.slice(0,200).map(r=>{
      const pct=r.total?Math.round(100*r.score/r.total):0;const w=(r.details&&r.details.wrong)||[];
      return h('tr',null,h('td',null,fmtDate(r.created_at)),h('td',null,'L'+(r.lessons?r.lessons.number:'?')+' · '+((r.details&&r.details.title)||('Es. '+(r.exercise_idx+1)))),
        h('td',null,h('span',{class:'pill '+(pct>=80?'g':pct>=50?'n':'b')},r.score+'/'+r.total)),
        h('td',null,w.map(x=>(x.q||x.id)+(x.expected?' → '+x.expected:'')+(x.given?' (risposta: '+x.given+')':'')).join(' · ')));
    });
    return mount(head,rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Quando','Esercizio','Punteggio','Errori'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessun risultato ancora.'),footer());
  }
  // progressi: ultimo tentativo per ogni esercizio
  const last={};data.forEach(r=>{const k=r.lesson_id+':'+r.exercise_idx;if(!last[k])last[k]=r});
  const L=Object.values(last);
  const pct=(a)=>{const t=a.reduce((s,r)=>s+r.total,0);return t?Math.round(100*a.reduce((s,r)=>s+r.score,0)/t):0};
  const bar=(label,p,extra)=>h('div',{class:'bar-row'},h('span',{class:'bar-l'},label),h('div',{class:'bar-t'},h('div',{class:'bar-f '+(p>=80?'g':p>=50?'n':'b'),style:'width:'+p+'%'})),h('span',{class:'bar-v'},p+'%'+(extra||'')));
  if(!L.length)return mount(head,h('p',{class:'sub'},'Non ci sono ancora risultati da mostrare.'),footer());
  const byLesson={};L.forEach(r=>{const n=r.lessons?r.lessons.number:0;(byLesson[n]=byLesson[n]||[]).push(r)});
  const byType={};L.forEach(r=>{const t=(r.details&&r.details.type)||'altro';(byType[t]=byType[t]||[]).push(r)});
  const tn={flash:'Flash cards',match:'Abbina',quiz:'Quiz',unjumble:'Riordina la frase',cloze:'Completa la frase',group:'Dividi in gruppi',cards:'Carte per parlare',type:'Scrivi la risposta',altro:'Altro'};
  const freq={};L.forEach(r=>((r.details&&r.details.wrong)||[]).forEach(w=>{const k=(w.q||w.id)+(w.expected?' → '+w.expected:'');freq[k]=(freq[k]||0)+1}));
  const worst=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8);
  mount(head,
    h('div',{class:'card'},h('p',{class:'sub small'},'Media complessiva (ultimo tentativo di ogni esercizio)'),h('p',{class:'sum'},pct(L)+'%'),h('p',{class:'sub small'},L.length+' esercizi svolti · '+data.length+' tentativi in totale')),
    h('div',{class:'card'},h('h3',null,'Per lezione'),Object.keys(byLesson).sort((a,b)=>a-b).map(n=>bar('L'+n,pct(byLesson[n]),' ('+byLesson[n].length+' es.)'))),
    h('div',{class:'card'},h('h3',null,'Per tipo di esercizio'),Object.keys(byType).map(t=>bar(tn[t]||t,pct(byType[t])))),
    worst.length?h('div',{class:'card'},h('h3',null,'Errori più frequenti'),h('ul',{class:'small'},worst.map(([k,n])=>h('li',null,k+(n>1?' (×'+n+')':''))))):null,
    footer());
}

/* ---------- presenze: settimana/mese → giorno (compatto, con Modifica) ---------- */
const STL={present:['Presente','g','st-present'],absent:['Assente','b','st-absent'],absent_notified:['Assente avvisato','n','st-notified']};
const d12=k=>new Date(k+'T12:00:00');
const secL=x=>x.section==='morning'?'Mattina':x.section==='evening'?'Sera':(x.start_time||'').slice(0,5);
function attShell(c,title,backFn,...rest){
  let pick=null;
  if(!isAdm()&&A.tCourses&&A.tCourses.length>1){
    pick=courseCascade(A.tCourses,c.id,n=>{A.regC=n.id;teacherAttendance(n)});
  }
  return mount(isAdm()?aHeader():topbar(title,backFn),isAdm()?h('div',{class:'row'},h('button',{class:'icon-btn','aria-label':'Indietro',onclick:backFn},ico('back')),h('strong',null,title)):pick,...rest,isAdm()?aTabs('cal'):tTabs('reg'),footer());
}
async function loadTCourses(){
  const r=await sb.from('courses').select('id,school_id,name,level,kind,language,start_date,zoom_url,chat_url').eq('active',true).order('name');
  A.tCourses=sortCourses(r.data||[]);return r.error?null:A.tCourses;
}
async function teacherRegistro(){
  if(isAdm())return adminMonth();
  mount(tHeader(),h('h2',{class:'sect'},'Registro presenze'),h('p',{class:'sub'},'Caricamento…'),tTabs('reg'));
  const cs=await loadTCourses();
  if(!cs)return mount(tHeader(),h('p',{class:'err'},'Errore nel caricamento.'),tTabs('reg'),footer());
  if(!cs.length)return mount(tHeader(),h('h2',{class:'sect'},'Registro presenze'),h('p',{class:'sub'},'Nessun corso assegnato.'),tTabs('reg'),footer());
  const c=cs.find(x=>x.id===A.regC)||cs[0];A.regC=c.id;
  return teacherAttendance(c);
}
async function teacherAttendance(c,arg){
  // arg: data (YYYY-MM-DD) per aprire direttamente un giorno; sessione non più usata
  if(!isAdm()&&!A.tCourses)await loadTCourses();
  const k=typeof arg==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(arg)?arg:null;
  if(k)return attDay(c,k);
  return attWeek(c,new Date(),A.attView||'week');
}
async function attWeek(c,ref,view){
  A.attView=view;
  const back=()=>isAdm()?adminMonth():teacherHome();
  ref=new Date(ref);ref.setHours(12,0,0,0);
  let a,b;
  if(view==='month'){a=new Date(ref.getFullYear(),ref.getMonth(),1,12);b=new Date(ref.getFullYear(),ref.getMonth()+1,0,12)}
  else{a=mondayOf(ref);b=new Date(a);b.setDate(b.getDate()+6)}
  attShell(c,'Presenze · '+shortName(c,true),back,h('p',{class:'sub'},'Caricamento…'));
  const r=await sb.from('lesson_sessions').select('id,session_date,start_time,section,status,attendance(id)').eq('course_id',c.id).gte('session_date',isoD(a)).lte('session_date',isoD(b)).order('start_time');
  if(r.error)return attShell(c,'Presenze',back,h('p',{class:'err'},'Errore nel caricamento.'));
  const by={};r.data.forEach(x=>(by[x.session_date]=by[x.session_date]||[]).push(x));
  const shift=n=>{const d=new Date(a);if(view==='month')d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+7*n);attWeek(c,d,view)};
  const label=view==='month'?MESI[a.getMonth()]+' '+a.getFullYear():a.getDate()+' '+MESI[a.getMonth()].slice(0,3).toLowerCase()+' – '+b.getDate()+' '+MESI[b.getMonth()].slice(0,3).toLowerCase()+' '+b.getFullYear();
  const nav=h('div',{class:'row'},
    h('button',{class:'icon-btn','aria-label':'Precedente',onclick:()=>shift(-1)},ico('back')),h('strong',{class:'weeklab'},label),
    h('button',{class:'icon-btn','aria-label':'Successivo',onclick:()=>shift(1),style:'transform:scaleX(-1)'},ico('back')),
    h('button',{class:'linkbtn small',onclick:()=>attWeek(c,new Date(),view)},'Oggi'));
  const seg=h('div',{class:'subnav'},[['week','Settimana'],['month','Mese']].map(([id,l])=>h('button',{class:'seg'+(view===id?' on':''),onclick:()=>attWeek(c,ref,id)},l)));
  const todayK=isoD(new Date());
  const cells=WD.map(w=>h('div',{class:'mwd'},w));
  const lead=view==='month'?(a.getDay()+6)%7:0;for(let i=0;i<lead;i++)cells.push(h('div'));
  for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
    const k2=isoD(d),L=by[k2]||[];
    const marked=L.length&&L.every(x=>(x.attendance||[]).length||0)?'done':L.some(x=>(x.attendance||[]).length)?'part':L.length?'todo':'';
    cells.push(h('button',{class:'mcell'+(k2===todayK?' today':'')+(view==='week'?' wk':'')+(L.length?'':' empty'),disabled:L.length?null:true,'aria-label':d.getDate()+' '+MESI[d.getMonth()],onclick:()=>attDay(c,k2)},
      h('span',{class:'mnum'},String(d.getDate())),
      ...L.map(x=>h('span',{class:'mline'},(x.start_time||'').slice(0,5)+(x.section?' '+secL(x).slice(0,3):''))),
      marked?h('span',{class:'mdot '+marked},marked==='done'?'✓ segnate':marked==='part'?'parziali':'da segnare'):null));
  }
  attShell(c,'Presenze · '+shortName(c,true),back,seg,nav,h('div',{class:'mgrid'},cells),h('p',{class:'sub small'},'Tocca un giorno con lezione per vedere o segnare le presenze.'));
}
async function attDay(c,k,edit){
  const back=()=>attWeek(c,d12(k),A.attView||'week');
  const topRow=(prev,next)=>h('div',null,
    h('button',{class:'linkbtn small',onclick:back},'← '+((A.attView==='month')?'Vista mensile':'Vista settimanale')),
    h('div',{class:'row'},
      h('button',{class:'icon-btn','aria-label':'Giorno precedente',disabled:prev?null:true,onclick:()=>prev&&attDay(c,prev)},ico('back')),
      h('strong',{class:'weeklab'},GIORNI[d12(k).getDay()]+' '+d12(k).getDate()+' '+MESI[d12(k).getMonth()]+' '+d12(k).getFullYear()),
      h('button',{class:'icon-btn','aria-label':'Giorno successivo',disabled:next?null:true,onclick:()=>next&&attDay(c,next),style:'transform:scaleX(-1)'},ico('back'))));
  attShell(c,'Presenze · '+shortName(c,true),back,h('p',{class:'sub'},'Caricamento…'));
  const [ss,pv,nx]=await Promise.all([
    sb.from('lesson_sessions').select('id,session_date,start_time,end_time,section,status').eq('course_id',c.id).eq('session_date',k).order('start_time'),
    sb.from('lesson_sessions').select('session_date').eq('course_id',c.id).lt('session_date',k).order('session_date',{ascending:false}).limit(1),
    sb.from('lesson_sessions').select('session_date').eq('course_id',c.id).gt('session_date',k).order('session_date').limit(1)]);
  if(ss.error)return attShell(c,'Presenze',back,h('p',{class:'err'},'Errore nel caricamento.'));
  const sessions=ss.data;const prevK=pv.data&&pv.data[0]&&pv.data[0].session_date,nextK=nx.data&&nx.data[0]&&nx.data[0].session_date;
  const head=topRow(prevK,nextK);
  if(!sessions.length)return attShell(c,'Presenze · '+shortName(c,true),back,head,h('p',{class:'sub'},'Nessuna lezione in questo giorno.'));
  const ids=sessions.map(x=>x.id);
  const [en,at,rs]=await Promise.all([
    sb.from('enrollments').select('section,start_date,students(id,display_name)').eq('course_id',c.id),
    sb.from('attendance').select('session_id,student_id,status,camera_off,mic_off,teacher_note').in('session_id',ids),
    sb.from('session_responses').select('session_id,student_id,response,status,note').in('session_id',ids)]);
  if(en.error||at.error)return attShell(c,'Presenze',back,head,h('p',{class:'err'},'Errore nel caricamento.'));
  const roster=en.data.filter(e=>e.students&&(!e.section||sessions.some(s=>!s.section||s.section===e.section))&&(!e.start_date||e.start_date<=k||at.data.some(r=>r.student_id===e.students.id)));
  const multi=sessions.length>1;
  const byS={};at.data.forEach(r=>(byS[r.student_id]=byS[r.student_id]||[]).push(r));
  const R={};(rs.data||[]).forEach(r=>{if(!R[r.student_id]||r.response==='confirm')R[r.student_id]=r});
  const sd=roster.map(e=>{
    const rows=byS[e.students.id]||[];
    const status=rows.some(r=>r.status==='present')?'present':rows.some(r=>r.status==='absent_notified')?'absent_notified':rows.some(r=>r.status==='absent')?'absent':'';
    const turn=rows.length===0?'':rows.length>1?'both':rows[0].session_id;
    const f=rows[0]||{};
    return {st:e.students,status,turn,cam:rows.some(r=>r.camera_off),mic:rows.some(r=>r.mic_off),note:(rows.find(r=>r.teacher_note)||{}).teacher_note||'',resp:R[e.students.id]};
  }).sort((p,q)=>p.st.display_name.localeCompare(q.st.display_name));
  const turnTxt=t=>!multi||!t?'':t==='both'?'Entrambi':secL(sessions.find(s=>s.id===t)||{});
  const conf=sd.filter(x=>x.resp&&x.resp.response==='confirm').length;
  const counts=h('p',{class:'sub small'},sessions.map(s=>(s.start_time||'').slice(0,5)+(s.end_time?'–'+s.end_time.slice(0,5):'')+(multi?' '+secL(s):'')).join(' · ')+' · '+sd.filter(x=>x.status==='present').length+' presenti su '+sd.length+(conf?' · '+conf+' confermate':''));
  if(!edit){
    const rows=sd.map(x=>{const L=STL[x.status];
      return h('div',{class:'att-row '+(L?L[2]:'')},
        h('div',{class:'att-name'},x.st.display_name,h('span',{class:'att-badge'},L?L[0]:'Da segnare'),multi&&x.turn?h('span',{class:'tag'},turnTxt(x.turn)):null,x.cam?h('span',{class:'tag'},'cam spenta'):null,x.mic?h('span',{class:'tag'},'mic spento'):null),
        x.note?h('p',{class:'sub small'},x.note):null)});
    return attShell(c,'Presenze · '+shortName(c,true),back,head,counts,h('button',{class:'primary',onclick:()=>attDay(c,k,true)},'Modifica'),h('div',{class:'att-list'},rows));
  }
  // modifica
  const nowMin=new Date().getHours()*60+new Date().getMinutes();
  const near=sessions.slice().sort((p,q)=>{const m=s=>{const t=(s.start_time||'00:00').split(':');return Math.abs(+t[0]*60+ +t[1]-nowMin)};return m(p)-m(q)})[0];
  const ctl={};const msg=h('p',{role:'status'});
  const rowsEl=sd.map(x=>{
    const st=x.st;
    const sl=h('select',{class:'txt sel','aria-label':'Stato '+st.display_name},[['','—'],['present','Presente'],['absent','Assente'],['absent_notified','Assente avvisato']].map(([v,t])=>h('option',{value:v,selected:x.status===v},t)));
    const tn=multi?h('select',{class:'txt sel','aria-label':'Turno di '+st.display_name},[...sessions.map(s=>[s.id,secL(s)]),['both','Entrambi']].map(([v,t])=>h('option',{value:v,selected:(x.turn||near.id)===v},t))):null;
    const cam=h('input',{type:'checkbox',checked:x.cam,'aria-label':'Telecamera spenta'});
    const mic=h('input',{type:'checkbox',checked:x.mic,'aria-label':'Microfono spento'});
    const nt=h('textarea',{class:'txt att-note',rows:'2',maxlength:'800',placeholder:'Note (solo docenti e amministrazione)','aria-label':'Note su '+st.display_name});nt.value=x.note;
    ctl[st.id]={sl,tn,cam,mic,nt,had:x.turn};
    const row=h('div',{class:'att-row'},h('div',{class:'att-name'},st.display_name,x.resp?h('span',{class:'tag'},x.resp.response==='confirm'?'confermata':'chiede spostamento'):null),
      sl,tn,h('label',{class:'att-chk'},cam,'Cam spenta'),h('label',{class:'att-chk'},mic,'Mic spento'),nt);
    const paint=()=>{row.classList.remove('st-present','st-absent','st-notified');const L=STL[sl.value];if(L)row.classList.add(L[2]);const o=row.querySelector('.att-badge');if(o)o.remove();if(L)row.querySelector('.att-name').append(h('span',{class:'att-badge'},L[0]))};
    sl.addEventListener('change',()=>{paint();msg.textContent=''});paint();return row;
  });
  const save=h('button',{class:'primary',onclick:async()=>{
    const orphan=sd.find(x=>{const q=ctl[x.st.id];return !q.sl.value&&(q.nt.value.trim()||q.cam.checked||q.mic.checked)});
    if(orphan){msg.className='err';msg.textContent='Imposta lo stato di '+orphan.st.display_name+' prima di salvare note o cam/mic.';return}
    save.disabled=true;
    const up=[],del=[];
    sd.forEach(x=>{const q=ctl[x.st.id];
      const want=q.sl.value?(multi?(q.tn.value==='both'?ids:[q.tn.value]):ids):[];
      want.forEach(sid=>up.push({session_id:sid,student_id:x.st.id,school_id:c.school_id,status:q.sl.value,camera_off:q.cam.checked,mic_off:q.mic.checked,teacher_note:q.nt.value.trim()||null}));
      ids.filter(i=>!want.includes(i)).forEach(sid=>del.push([sid,x.st.id]));
    });
    let error=null;
    if(up.length)({error}=await sb.from('attendance').upsert(up,{onConflict:'session_id,student_id'}));
    if(!error)for(const [sid,stid] of del){const r=await sb.from('attendance').delete().eq('session_id',sid).eq('student_id',stid);if(r.error){error=r.error;break}}
    if(!error){const used=[...new Set(up.map(r=>r.session_id))];if(used.length)await sb.from('lesson_sessions').update({status:'held'}).in('id',used)}
    save.disabled=false;
    if(error){msg.className='err';msg.textContent='Non sono riuscito a salvare: '+error.message;return}
    attDay(c,k);
  }},'Salva presenze');
  attShell(c,'Presenze · '+shortName(c,true),back,head,counts,h('p',{class:'sub small'},'Cam e mic spenti sono visibili solo a docenti e amministrazione. L’alunno vede soltanto presente/assente. “Entrambi” è solo informativo.'),
    h('div',{class:'att-list'},rowsEl),h('div',{class:'row'},h('button',{class:'secondary',onclick:()=>attDay(c,k)},'Annulla'),save),msg);
}

/* ---------- boot ---------- */
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();
})();
