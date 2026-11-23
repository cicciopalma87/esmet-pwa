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
    h('button',{class:'dr-item',onclick:()=>{close();homeView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📚'),'Lezioni'),
    h('button',{class:'dr-item',onclick:()=>{close();registroView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📋'),'Registro'),
    h('button',{class:'dr-item',onclick:()=>{close();lavagneView()}},h('span',{class:'dr-em','aria-hidden':'true'},'🖼️'),'Lavagne'),
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
  const rows=S.me.courses.map(c=>h('button',{class:'row-item',onclick:()=>{S.cid=c.id;homeView()}},h('span',{class:'ri-l'},ico('book'),c.name),ico('chev')));
  mount(topbar('Cambia corso',()=>homeView()),h('div',{class:'rows'},rows),footer());
}
function topbar(title,back){
  return h('div',{class:'bar'},
    h('button',{class:'icon-btn','aria-label':'Indietro',onclick:back},ico('back')),
    h('h2',null,title));
}
function tabs(active){
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(active===id?' on':''),onclick:fn,'aria-current':active===id?'page':null},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('cal','Calendario','📅',()=>calView()),t('lez','Lezioni','📚',()=>homeView()),t('reg','Registro','📋',()=>registroView()),t('lav','Lavagne','🖼️',()=>lavagneView()));
}
function tabHeader(){
  const c=curCourse();
  return h('div',{class:'thead2'},
    h('div',{class:'thead-top'},
      h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
      h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:drawer},ico('menu'))),
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
    join,joinMsg,
    accountBanner(),
    h('h3',{class:'sect'},'Lezioni'),
    rows.length?h('div',{class:'rows'},rows):h('p',{class:'sub'},'Nessuna lezione pubblicata.'),
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
    h('span',{class:'lc-main'},h('strong',null,x.course),x.place?h('span',{class:'sub small'},x.place+(x.section==='morning'?' · mattina':x.section==='evening'?' · sera':'')):(x.section==='morning'?h('span',{class:'sub small'},'mattina'):x.section==='evening'?h('span',{class:'sub small'},'sera'):null)),
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
  mount(topbar('Lezione '+l.number,()=>homeView()),
    h('p',{class:'sub'},l.title),
    h('div',{class:'rows'},rows),
    footer());
}
function exView(c,l,i){
  const ex=l.content.exercises[i];
  const back=()=>lessonView(c,l);
  const box=h('div',{class:'game'});
  mount(topbar(ex.title,back),ex.instr?h('p',{class:'sub'},ex.instr):null,box,footer());
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
      ex.lab?h('p',{class:'sub'},ex.lab):null,
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
  mount(tHeader(),h('h2',{class:'sect'},'Corsi e alunni'),h('p',{class:'sub'},'Caricamento…'),tTabs('corsi'));
  const [cs,en]=await Promise.all([
    sb.from('courses').select('id,school_id,name,level,kind,zoom_url,chat_url').eq('active',true).order('name'),
    sb.from('enrollments').select('course_id,section,students(id,display_name,code,consent_at)')
  ]);
  if(cs.error||en.error)return mount(tHeader(),h('p',{class:'err'},'Errore nel caricamento. Il tuo account ha un profilo docente?'),tTabs('corsi'),footer());
  const blocks=cs.data.map(c=>{
    const studs=en.data.filter(e=>e.course_id===c.id&&e.students).sort((a,b)=>a.students.display_name.localeCompare(b.students.display_name));
    return h('section',{class:'card'},h('h2',null,c.name),h('p',{class:'sub'},c.level+' · '+studs.length+' studenti'),
      h('div',{class:'rows'},studs.map(e=>h('button',{class:'row-item',onclick:()=>studentSheet(e.students,c)},
        h('span',{class:'ri-l'},e.students.display_name,e.section?h('span',{class:'tag'},e.section==='morning'?'mattina':e.section==='evening'?'sera':e.section):null),
        h('span',{class:'ri-r'},e.students.consent_at?'':h('span',{class:'small'},'consenso mancante'),ico('chev'))))),
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>unlockView(c)},'Sblocca lezioni'),
        h('button',{class:'secondary',onclick:()=>teacherAnnouncements(c)},'Avvisi'),h('button',{class:'secondary',onclick:()=>teacherWhiteboards(c)},'Lavagne'),h('button',{class:'secondary',onclick:async()=>{const v=await askText('Link della chat','Gruppo WhatsApp: incolla il link d’invito. Chat singola: https://wa.me/39… (lascia vuoto per cancellare)',c.chat_url||'','Salva');if(v===null)return;const u=v.trim();if(u&&!/^https:\/\//.test(u)){await say('Link non valido','Il link deve iniziare con https://');return}const {error}=await sb.from('courses').update({chat_url:u||null}).eq('id',c.id);if(error)await say('Non salvato',error.message);teacherHome()}},c.chat_url?'Chat ✓':'Chat'),h('button',{class:'secondary',onclick:async()=>{const v=await askText('Link Zoom del corso','Incolla il link (lascia vuoto per cancellarlo)',c.zoom_url||'','Salva');if(v===null)return;const {error}=await sb.from('courses').update({zoom_url:v.trim()||null}).eq('id',c.id);if(error)await say('Non salvato',error.message);teacherHome()}},c.zoom_url?'Link Zoom ✓':'Link Zoom'),h('button',{class:'secondary',onclick:()=>teacherAttendance(c)},'Presenze del corso')));
  });
  mount(tHeader(),h('h2',{class:'sect'},'Corsi e alunni'),blocks.length?blocks:h('p',{class:'sub'},'Nessun corso assegnato.'),tTabs('corsi'),footer());
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
      h('button',{class:'linkbtn small',onclick:async()=>{
        if(!await askYes('Eliminare la lavagna?','Gli alunni non la vedranno più.','Elimina'))return;
        await sb.from('whiteboards').delete().eq('id',w.id);await sb.storage.from('lavagne').remove([w.path]);teacherWhiteboards(c)}},'Elimina'))))));
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
    h('p',{class:'dr-group'},'Calendario'),it('📅','Calendario e presenze',()=>adminMonth(),1),
    h('p',{class:'dr-group'},'Contabilità'),it('💶','Entrate',()=>adminConto('entrate'),1),it('🧾','Uscite',()=>adminConto('uscite'),1),
    h('hr'),it('🚪','Esci',async()=>{await sb.auth.signOut();teacherLogin()}),
    h('p',{class:'dr-ver'},'Ver '+CFG.version));
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},panel);document.body.append(ov);
}
function aTabs(active){
  const an=['alunni','classi','docenti'].includes(active)?'anag':active;
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(an===id?' on':''),onclick:fn},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('anag','Anagrafiche','🗂️',()=>adminHome('alunni')),t('cal','Calendario','📅',()=>adminMonth()),t('conto','Contabilità','💶',()=>adminConto('entrate')));
}
function aHeader(){
  return h('div',{class:'thead2'},h('div',{class:'thead-top'},
    h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:aDrawer},ico('menu'))));
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
async function adminLoad(){
  const [o,s]=await Promise.all([sb.rpc('admin_overview'),sb.rpc('admin_staff_list')]);
  if(o.error||s.error)throw (o.error||s.error);
  A.ov=o.data;A.staff=s.data;
}
async function adminHome(tab){
  tab=tab||'alunni';
  mount(aHeader(),h('p',{class:'sub'},'Caricamento…'),aTabs(tab));
  try{await adminLoad()}catch(e){mount(aHeader(),h('p',{class:'err'},'Non riesco a caricare i dati: '+(e.message||e)),aTabs(tab));return}
  const body=tab==='classi'?adminClassi():tab==='docenti'?adminDocenti():adminAlunni();
  mount(aHeader(),subNav([['alunni','Alunni',()=>adminHome('alunni')],['classi','Classi',()=>adminHome('classi')],['docenti','Docenti',()=>adminHome('docenti')]],tab),body,aTabs(tab));
}
const courseName=(id,noT)=>{const c=A.ov.courses.find(x=>x.id===id);return c?shortName(c,noT):'?'};
const KL={group:'Gruppo',individual:'Individuale',conversation:'Conversazione'};
const LEVELS=['A1','A2','B1','B2','C1','C2'];
function shortName(c,noT){
  const lg=c.language&&c.language!=='Tedesco'?c.language+' · ':'';
  const t=(!noT&&c.teacher)?' - '+c.teacher:'';
  if(c.kind==='individual'){const m=/individuale\s+(.+)$/i.exec(c.name);return lg+'Ind. '+(m?m[1]:c.name)+t}
  return lg+c.level+(c.kind==='group'?' Gruppo':' Conv.')+t;
}
const fromOpts=ids=>ids.map(i=>{const c=A.ov.courses.find(x=>x.id===i);return [i,c?shortName(c):'?']});
function lab(t){return h('p',{class:'sub small fld'},t)}
/* selezione a cascata: Lingua → Docente → Tipo → Livello */
function classPicker(o){
  o=o||{};
  const kinds=o.noIndividual?['group','conversation']:['group','individual','conversation'];
  const lg=selEl(LANGS.map(x=>[x,x]),'Tedesco','Lingua');
  const dc=selEl([],'','Docente');
  const kd=selEl(kinds.map(k=>[k,KL[k]]),'group','Tipo di corso');
  const lv=selEl(LEVELS.map(x=>[x,x]),'A1','Livello');
  const info=h('p',{class:'sub small',role:'status'});
  const fillT=()=>{
    const all=A.staff.staff.filter(p=>p.role==='teacher'&&!p.blocked);
    let ts=all.filter(p=>(p.languages||[]).includes(lg.value));if(!ts.length)ts=all;
    const cur=dc.value;dc.replaceChildren(...[['','— scegli il docente —'],...ts.map(p=>[p.id,p.name])].map(o=>h('option',{value:o[0]},o[1])));
    dc.value=ts.some(p=>p.id===cur)?cur:'';
  };
  const get=()=>({language:lg.value,teacher:dc.value,kind:kd.value,level:lv.value});
  const upd=()=>{
    fillT();
    const sel=get();
    if(o.getName&&sel.kind==='individual'&&false){}
    lv.disabled=false;
    if(!sel.teacher){info.textContent='';return}
    const nm=o.getName?o.getName():'';
    const ex=findCourse(sel,nm);
    info.className='sub small';info.textContent=ex?'Classe esistente: '+shortName(ex):'Nuova classe: '+courseTitle(sel,nm)+' (verrà creata)';
  };
  [lg,dc,kd,lv].forEach(e=>e.addEventListener('change',upd));
  lg.addEventListener('change',()=>{dc.value=''});
  upd();
  return {node:h('div',{class:'picker'},lab('Lingua'),lg,lab('Docente'),dc,lab('Tipo di corso'),kd,lab('Livello'),lv,info),get,refresh:upd};
}
function courseTitle(sel,nm){
  return sel.kind==='individual'?sel.language+' - corso individuale '+(nm||'…'):sel.kind==='group'?sel.language+' '+sel.level+' - gruppo':sel.language+' '+sel.level+' - conversazione';
}
function findCourse(sel,nm){
  return A.ov.courses.find(c=>c.language===sel.language&&c.teacher_id===sel.teacher&&c.kind===sel.kind&&
    (sel.kind==='individual'?norm(c.name).includes(norm(nm)):c.level===sel.level));
}
async function resolveCourse(sel,nm){
  const ex=findCourse(sel,nm);if(ex)return ex.id;
  const {data,error}=await sb.rpc('admin_create_course',{p_name:courseTitle(sel,nm),p_level:sel.level,p_kind:sel.kind,p_teacher:sel.teacher,p_language:sel.language});
  if(error)throw error;
  A.ov.courses.push({id:data,name:courseTitle(sel,nm),level:sel.level,kind:sel.kind,teacher_id:sel.teacher,language:sel.language,teacher:(A.staff.staff.find(p=>p.id===sel.teacher)||{}).name});
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
        h('br'),s.course_ids.length?s.course_ids.map(i=>h('span',{class:'ctag'},courseName(i))):h('span',{class:'sub small'},'nessuna classe')));
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
      if(use.checked&&!pk.get().teacher){err.textContent='Scegli il docente.';return}
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
    h('button',{class:'primary',onclick:()=>{if(!pk.get().teacher){err.textContent='Scegli il docente.';return}close(true)}},'Conferma')]);
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
      return h('div',{class:'card'},h('h3',null,shortName(c)),
        h('p',{class:'sub small'},KL[c.kind]+' · '+c.level+' · '+c.language+(c.teacher?'':' · docente non assegnato')),
        h('p',{class:'sub small'},stu.length?stu.length+' alunni: '+stu.map(s=>s.name).join(', '):'Nessun alunno'),
        h('button',{class:'secondary',onclick:()=>changeTeacher(c)},'Cambia docente'));
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
  const ok=await dlg('Nuova classe',[pk.node,h('p',{class:'sub small'},'I corsi individuali si creano da soli quando inserisci o sposti un alunno.'),err],close=>[h('button',{class:'secondary',onclick:()=>close(false)},'Annulla'),h('button',{class:'primary',onclick:()=>{if(!pk.get().teacher){err.textContent='Scegli il docente.';return}close(true)}},'Crea')]);
  if(!ok)return;
  try{if(findCourse(pk.get(),''))return say('Già esistente','Questa classe esiste già.');await resolveCourse(pk.get(),'')}catch(e){return say('Errore',e.message||String(e))}
  adminHome('classi');
}
function adminDocenti(){
  const st=A.staff.staff.filter(p=>p.role==='teacher').map(p=>h('div',{class:'card'},h('h3',null,p.name),
    h('p',{class:'sub small'},(p.email||'')+' · '+(p.languages||[]).join(', ')),
    h('p',{class:'sub small'},...(p.courses.length?p.courses.map(c=>h('span',{class:'ctag'},courseName(c.id,true))):['Nessuna classe assegnata'])),
    p.blocked?h('p',{class:'err'},'Accesso bloccato'):null,
    p.role==='teacher'?h('div',{class:'row'},h('button',{class:'secondary',onclick:()=>inviteDlg(p)},'Modifica lingue e classi'),
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
  const em=h('input',{class:'txt',type:'email',placeholder:'Email del docente',value:p?p.email:'',readonly:p?true:null});
  const nm=h('input',{class:'txt',type:'text',placeholder:'Nome e cognome',value:p?p.name:''});
  const lgs=LANGS.map(l=>{const c=h('input',{type:'checkbox'});c.checked=p?(p.languages||[]).includes(l):l==='Tedesco';return [l,c]});
  const mine=p?p.courses.map(c=>c.id):[];
  const crs=A.ov.courses.map(c=>{const c2=h('input',{type:'checkbox'});c2.checked=mine.includes(c.id);return [c.id,shortName(c,true)+(c.teacher&&!mine.includes(c.id)?' (ora: '+c.teacher+')':''),c2]});
  const err=h('p',{class:'err',role:'alert'});
  const v=await dlg(p?'Modifica docente':'Invita docente',[em,nm,h('p',{class:'sub small'},'Lingue insegnate:'),
    ...lgs.map(([l,c])=>h('label',{class:'chk-row'},c,l)),h('p',{class:'sub small'},'Classi assegnate:'),
    ...crs.map(([id,n,c])=>h('label',{class:'chk-row'},c,n)),err],close=>[
    h('button',{class:'secondary',onclick:()=>close(null)},'Annulla'),
    h('button',{class:'primary',onclick:()=>{if(!/.+@.+\..+/.test(em.value)){err.textContent='Inserisci una email valida.';return}close(true)}},'Salva')]);
  if(!v)return;
  const {error}=await sb.rpc('admin_invite_staff',{p_email:em.value,p_full_name:nm.value,p_role:'teacher',p_languages:lgs.filter(x=>x[1].checked).map(x=>x[0]),p_course_ids:crs.filter(x=>x[2].checked).map(x=>x[0])});
  if(error)return say('Errore',error.message);
  if(!p)await inviteMsg(em.value.trim().toLowerCase(),nm.value);
  adminHome('docenti');
}


/* calendario amministratore: mese a quadrati → giorno → presenze */
const WD=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
async function adminCalBase(){
  if(!A.staff){const r=await sb.rpc('admin_staff_list');A.staff=r.data}
  const ts=A.staff.staff.filter(p=>p.role==='teacher');
  const pick=selEl([['','Tutti i docenti'],...ts.map(p=>[p.id,p.name])],A.calT||'','Docente');
  return {ts,pick};
}
async function adminLoadRange(a,b){
  const [cs,ss]=await Promise.all([
    sb.from('courses').select('id,name,kind,level,language,teacher_id').eq('active',true),
    sb.from('lesson_sessions').select('id,course_id,section,session_date,start_time,end_time,place,status,session_responses(student_id,response,status,note,students(display_name))').gte('session_date',isoD(a)).lte('session_date',isoD(b)).order('session_date').order('start_time')]);
  if(cs.error||ss.error)throw (cs.error||ss.error);
  const tn={};A.staff.staff.forEach(p=>tn[p.id]=p.name);
  const cname={};cs.data.filter(c=>!A.calT||c.teacher_id===A.calT).forEach(c=>{c.tname=tn[c.teacher_id]||'';cname[c.id]=c});
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
  mount(aHeader(),h('h2',{class:'sect'},'Calendario'),base.pick,nav,h('div',{class:'mgrid'},cells),exp,aTabs('cal'),footer());
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
  mount(aHeader(),nav,base.pick,data.sessions.length?data.sessions.map(x=>tLessonCard(x,data.cname[x.course_id],data.courses)):h('p',{class:'sub'},'Nessuna lezione in questo giorno.'),aTabs('cal'),footer());
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
    const cn={};cs.data.filter(c=>!A.calT||c.teacher_id===A.calT).forEach(c=>cn[c.id]=c);
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
    it('📅','Calendario',()=>teacherCal()),it('👥','Corsi e alunni',()=>teacherHome()),
    it('🚪','Esci',async()=>{await sb.auth.signOut();teacherLogin()}),
    h('p',{class:'dr-ver'},'Ver '+CFG.version));
  const ov=h('div',{class:'dr-ov',onclick:e=>{if(e.target===ov)close()}},panel);document.body.append(ov);
}
function tHeader(){
  if(isAdm())return aHeader();
  return h('div',{class:'thead2'},h('div',{class:'thead-top'},
    h('img',{class:'logo-sm',src:'icons/logo.png',alt:'Esmet Academy'}),
    h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:tDrawer},ico('menu'))));
}
function tTabs(active){
  if(isAdm())return aTabs('cal');
  const t=(id,label,em,fn)=>h('button',{class:'tab'+(active===id?' on':''),onclick:fn},h('span',{class:'em','aria-hidden':'true'},em),h('span',null,label));
  return h('nav',{class:'tabbar'},t('cal','Calendario','📅',()=>teacherCal()),t('corsi','Corsi','👥',()=>teacherHome()));
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
    h('button',{class:'primary',onclick:()=>teacherAttendance(c,x.id)},'Presenze'),
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
  const tipo=h('select',{class:'txt sel','aria-label':'Tipo di corso'},[['individual','Corso individuale'],['group','Corso di gruppo']].map(([v,t])=>h('option',{value:v},t)));
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


async function teacherAnnouncements(c){
  const back=()=>teacherHome();
  mount(topbar('Avvisi · '+c.name,back),h('p',{class:'sub'},'Caricamento…'));
  const [ls,cs]=await Promise.all([
    sb.from('announcements').select('id,title,body,created_at,course_id').eq('course_id',c.id).order('created_at',{ascending:false}).limit(40),
    sb.from('courses').select('id,school_id,name').eq('active',true)]);
  if(ls.error)return mount(topbar('Avvisi',back),h('p',{class:'err'},'Errore nel caricamento.'),footer());
  const ti=h('input',{class:'txt',type:'text',maxlength:'120',placeholder:'Titolo (es. Lezione di giovedì spostata)'});
  const bo=h('textarea',{class:'txt',rows:'4',maxlength:'1200',placeholder:'Testo (facoltativo)'});
  const scope=h('select',{class:'txt sel','aria-label':'Destinatari'},[['one','Solo questo corso'],['all','Tutti i miei corsi']].map(([v,t])=>h('option',{value:v},t)));
  const msg=h('p',{role:'status'});
  const pub=h('button',{class:'primary',onclick:async()=>{
    if(!ti.value.trim()){msg.className='err';msg.textContent='Scrivi un titolo.';return}
    pub.disabled=true;
    const targets=scope.value==='all'?cs.data:[c];
    const {error}=await sb.from('announcements').insert(targets.map(t=>({school_id:t.school_id||c.school_id,course_id:t.id,title:ti.value.trim(),body:bo.value.trim()||null})));
    pub.disabled=false;
    if(error){msg.className='err';msg.textContent='Non pubblicato: '+error.message;return}
    teacherAnnouncements(c);
  }},'Pubblica');
  mount(topbar('Avvisi · '+c.name,back),
    h('div',{class:'card'},h('h3',null,'Nuovo avviso'),ti,bo,h('label',null,'Destinatari',scope),pub,msg),
    ls.data.map(a=>h('div',{class:'card ann'},h('div',{class:'row'},h('strong',null,a.title),h('span',{class:'sub small'},fmtDate(a.created_at))),a.body?h('p',{class:'ann-b'},a.body):null,
      h('button',{class:'linkbtn small',onclick:async()=>{if(!await askYes('Eliminare l’avviso?','Gli alunni non lo vedranno più.','Elimina'))return;await sb.from('announcements').delete().eq('id',a.id);teacherAnnouncements(c)}},'Elimina'))),
    footer());
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
    const {data,error}=await sb.from('attendance').select('status,joined_at,reason,note,camera_off,mic_off,teacher_note,lesson_sessions(session_date,course_id)').eq('student_id',st.id);
    if(error)return mount(head,h('p',{class:'err'},'Errore nel caricamento.'));
    const lab={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
    const rows=data.filter(a=>a.lesson_sessions).sort((a,b)=>a.lesson_sessions.session_date<b.lesson_sessions.session_date?1:-1).map(a=>h('tr',null,
      h('td',null,a.lesson_sessions.session_date),h('td',null,h('span',{class:'pill '+(lab[a.status]||['','n'])[1]},(lab[a.status]||[a.status])[0])),
      h('td',null,a.joined_at?new Date(a.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''),h('td',null,[a.reason,a.note].filter(Boolean).join(' · ')),h('td',null,[a.camera_off?'cam spenta':'',a.mic_off?'mic spento':'',a.teacher_note].filter(Boolean).join(' · '))));
    const pres=data.filter(a=>a.status==='present').length,abs=data.filter(a=>a.status!=='present').length;
    return mount(head,h('p',null,'Presenze: ',h('strong',null,pres),' · Assenze: ',h('strong',null,abs)),
      rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Data','Stato','Ingresso','Motivo alunno','Note docente'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessuna presenza registrata.'),footer());
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

async function teacherAttendance(c,sid){
  const back=()=>teacherHome();
  mount(topbar('Presenze · '+c.name,back),h('p',{class:'sub'},'Caricamento…'));
  const ss=await sb.from('lesson_sessions').select('id,session_date,start_time,end_time,section,status').eq('course_id',c.id).order('session_date',{ascending:false}).order('start_time',{ascending:false}).limit(80);
  if(ss.error)return mount(topbar('Presenze',back),h('p',{class:'err'},'Errore nel caricamento.'));
  const sessions=ss.data;
  if(!sessions.length)return mount(topbar('Presenze · '+c.name,back),h('p',{class:'sub'},'Non ci sono ancora lezioni in calendario per questo corso.'),footer());
  const todayK=isoD(new Date());
  const def=sid||(sessions.filter(x=>x.session_date<=todayK)[0]||sessions[sessions.length-1]).id;
  const lab=x=>x.session_date.split('-').reverse().join('/')+' '+(x.start_time||'').slice(0,5)+(x.section==='morning'?' · mattina':x.section==='evening'?' · sera':'');
  const sel=h('select',{class:'txt sel','aria-label':'Lezione'},sessions.map(x=>h('option',{value:x.id,selected:x.id===def},lab(x))));
  sel.addEventListener('change',()=>teacherAttendance(c,sel.value));
  const cur=sessions.find(x=>x.id===def);
  const [en,at,rs]=await Promise.all([
    sb.from('enrollments').select('section,students(id,display_name)').eq('course_id',c.id),
    sb.from('attendance').select('student_id,status,camera_off,mic_off,teacher_note').eq('session_id',def),
    sb.from('session_responses').select('student_id,response,status,note').eq('session_id',def)]);
  if(en.error||at.error)return mount(topbar('Presenze',back),h('p',{class:'err'},'Errore nel caricamento.'));
  const roster=en.data.filter(e=>e.students&&(!e.section||!cur.section||e.section===cur.section));
  const A={};at.data.forEach(r=>A[r.student_id]=r);const R={};(rs.data||[]).forEach(r=>R[r.student_id]=r);
  const rank=e=>{const a=A[e.students.id],r=R[e.students.id];return a&&a.status==='present'?0:(r&&r.response==='confirm')?1:a&&a.status?2:3};
  roster.sort((a,b)=>rank(a)-rank(b)||a.students.display_name.localeCompare(b.students.display_name));
  const conf=Object.values(R).filter(r=>r.response==='confirm').length;
  const moves=Object.values(R).filter(r=>r.response==='move_request');
  const ctl={};
  const rows=roster.map(e=>{
    const st=e.students,a=A[st.id]||{};
    const sl=h('select',{class:'txt sel','aria-label':'Stato '+st.display_name},[['','—'],['present','Presente'],['absent','Assente'],['absent_notified','Assente avvisato']].map(([v,t])=>h('option',{value:v,selected:(a.status||'')===v},t)));
    const cam=h('input',{type:'checkbox',checked:!!a.camera_off,'aria-label':'Telecamera spenta'});
    const mic=h('input',{type:'checkbox',checked:!!a.mic_off,'aria-label':'Microfono spento'});
    const nt=h('textarea',{class:'txt att-note',rows:'2',maxlength:'800',placeholder:'Note (solo docenti e amministrazione): es. camera spenta ma seguiva, distratto, non partecipava…','aria-label':'Note su '+st.display_name});
    nt.value=a.teacher_note||'';
    ctl[st.id]={sl,cam,mic,nt};
    const r=R[st.id];
    return h('div',{class:'att-row'},
      h('div',{class:'att-name'},st.display_name,r?h('span',{class:'tag'},r.response==='confirm'?'confermata':'chiede spostamento'):null),
      sl,
      h('label',{class:'att-chk'},cam,'Cam spenta'),h('label',{class:'att-chk'},mic,'Mic spento'),nt);
  });
  const msg=h('p',{role:'status'});
  const save=h('button',{class:'primary',onclick:async()=>{
    const orphan=roster.find(e=>!ctl[e.students.id].sl.value&&(ctl[e.students.id].nt.value.trim()||ctl[e.students.id].cam.checked||ctl[e.students.id].mic.checked));
    if(orphan){msg.className='err';msg.textContent='Imposta lo stato (presente/assente) di '+orphan.students.display_name+' prima di salvare note o cam/mic.';return}
    save.disabled=true;
    const rowsUp=roster.map(e=>e.students.id).filter(id=>ctl[id].sl.value).map(id=>({session_id:def,student_id:id,school_id:c.school_id,status:ctl[id].sl.value,camera_off:ctl[id].cam.checked,mic_off:ctl[id].mic.checked,teacher_note:ctl[id].nt.value.trim()||null}));
    let error=null;
    if(rowsUp.length){({error}=await sb.from('attendance').upsert(rowsUp,{onConflict:'session_id,student_id'}))}
    if(!error)await sb.from('lesson_sessions').update({status:'held'}).eq('id',def);
    save.disabled=false;
    msg.className=error?'err':'ok';msg.textContent=error?'Non sono riuscita a salvare: '+error.message:'Presenze salvate.';
  }},'Salva presenze');
  mount(topbar('Presenze · '+c.name,back),sel,
    h('p',{class:'sub small'},conf+' '+(conf===1?'confermata':'confermate')+' su '+roster.length+(moves.length?' · '+moves.length+' richiesta/e di spostamento'+': '+moves.map(m=>{const e=roster.find(x=>x.students.id===m.student_id);return (e?e.students.display_name:'')+(m.note?' ('+m.note+')':'')}).join(', '):'')),
    h('p',{class:'sub small'},'Cam e mic spenti sono visibili solo ai docenti. L’alunno vede soltanto presente/assente.'),
    h('div',{class:'att-list'},rows),save,msg,footer());
}

/* ---------- boot ---------- */
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();
})();
