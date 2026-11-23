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
    homeView();
  }catch(e){
    const cache=LS.get('esmet_cache',null);
    if(cache&&S.code===code){S.me=cache;if(cache.consent_at)return homeView(true)}
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
  const back=()=>homeView();
  const a=S.acc||{state:'none'};
  if(a.state==='ok')return mount(topbar('Il mio accesso',back),h('div',{class:'card'},h('p',null,'Accesso con email attivo ✅'),h('p',{class:'sub small'},a.email||''),h('p',{class:'sub small'},'Per cambiare email o password apri un ticket di assistenza.')),footer());
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
    if(error){err.textContent=/rate|limit/i.test(error.message)?'Troppe richieste in questo momento. Riprova tra qualche minuto o apri un ticket.':'Registrazione non riuscita: '+error.message;btn.disabled=false;return}
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
const ICO={
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
    h('button',{class:'dr-item',onclick:()=>{close();homeView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📚'),'Lezioni'),
    h('button',{class:'dr-item',onclick:()=>{close();registroView()}},h('span',{class:'dr-em','aria-hidden':'true'},'📋'),'Registro'),
    h('button',{class:'dr-item',onclick:()=>{close();lavagneView()}},h('span',{class:'dr-em','aria-hidden':'true'},'🖼️'),'Lavagne'),
    item('user','Il mio accesso',()=>accountView()),
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
  return h('nav',{class:'tabbar'},t('lez','Lezioni','📚',()=>homeView()),t('reg','Registro','📋',()=>registroView()),t('lav','Lavagne','🖼️',()=>lavagneView()));
}
function tabHeader(){
  const c=curCourse();
  return h('div',{class:'thead'},
    h('div',{class:'avatar','aria-hidden':'true'},(S.me.name||'?').trim().charAt(0).toUpperCase()),
    h('div',{class:'tname'},h('strong',null,S.me.name),h('span',{class:'sub small'},c?c.name:'')),
    h('button',{class:'icon-btn',style:'background:var(--sand)','aria-label':'Menu',onclick:drawer},ico('menu')));
}

/* ---------- student: home (lezioni) ---------- */
function homeView(offline){
  const me=S.me;const c=curCourse();
  if(!c){mount(tabHeader(),h('p',{class:'sub'},'Non hai ancora corsi assegnati.'),footer());return}
  const lessons=(c.lessons||[]).slice().sort((a,b)=>b.number-a.number);
  const joinMsg=h('p',{class:'sub small',role:'status'});
  const join=h('button',{class:'banner',onclick:async()=>{
    joinMsg.textContent='Un attimo…';
    const win=window.open('about:blank','_blank');
    const {data,error}=await sb.rpc('student_join_lesson',{p_code:S.code,p_course:c.id});
    if(error||!data){if(win)win.close();joinMsg.textContent=error?'Non riesco a registrare l’ingresso. Riprova.':'Il link della lezione non è ancora disponibile.';return}
    joinMsg.textContent='Presenza registrata. Buona lezione!';
    if(win)win.location.href=data;else location.href=data;
  }},h('span',null,'Accedi alla lezione'),ico('video'));
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
  list=list.filter(r=>!c||r.course_id===c.id);
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
        const n=prompt('Cosa non torna? (facoltativo)','');if(n===null)return;
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
function absenceView(){
  const c=curCourse();
  const today=new Date().toISOString().slice(0,10);
  const motivo=h('select',{class:'txt sel'},['Seleziona un motivo','Malattia','Lavoro','Impegno familiare','Altro'].map((t,i)=>h('option',{value:i?t:''},t)));
  const d=h('input',{type:'date',class:'txt',value:today,min:today});
  const nota=h('textarea',{class:'txt',rows:'3',maxlength:'400'});
  const msg=h('p',{role:'status'});
  const send=h('button',{class:'primary',onclick:async()=>{
    if(!motivo.value){msg.className='err';msg.textContent='Scegli un motivo.';return}
    send.disabled=true;
    const {error}=await sb.rpc('student_notify_absence',{p_code:S.code,p_course:c.id,p_date:d.value,p_reason:motivo.value,p_note:nota.value||null});
    if(error){msg.className='err';msg.textContent='Non sono riuscito a inviare. Controlla la data e riprova.';send.disabled=false}
    else{msg.className='ok';msg.textContent='Assenza comunicata. Grazie!'}
  }},'Salva');
  mount(topbar('Comunica assenza',()=>registroView()),
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
  if(data.session)return teacherHome();
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
    teacherHome();
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
  const out=h('button',{class:'linkbtn',onclick:async()=>{await sb.auth.signOut();teacherLogin()}},'Esci');
  mount(header(out),h('h1',null,'Area docenti'),h('p',{class:'sub'},'Caricamento…'));
  const [cs,en]=await Promise.all([
    sb.from('courses').select('id,school_id,name,level,kind,zoom_url').eq('active',true).order('name'),
    sb.from('enrollments').select('course_id,section,students(id,display_name,code,consent_at)')
  ]);
  if(cs.error||en.error)return mount(header(out),h('p',{class:'err'},'Errore nel caricamento. Il tuo account ha un profilo docente?'),footer());
  const blocks=cs.data.map(c=>{
    const studs=en.data.filter(e=>e.course_id===c.id&&e.students).sort((a,b)=>a.students.display_name.localeCompare(b.students.display_name));
    return h('section',{class:'card'},h('h2',null,c.name),h('p',{class:'sub'},c.level+' · '+studs.length+' studenti'),
      h('div',{class:'rows'},studs.map(e=>h('button',{class:'row-item',onclick:()=>studentSheet(e.students,c)},
        h('span',{class:'ri-l'},e.students.display_name,e.section?h('span',{class:'tag'},e.section==='morning'?'mattina':e.section==='evening'?'sera':e.section):null),
        h('span',{class:'ri-r'},e.students.consent_at?'':h('span',{class:'small'},'consenso mancante'),ico('chev'))))),
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>unlockView(c)},'Sblocca lezioni'),
        h('button',{class:'secondary',onclick:()=>teacherWhiteboards(c)},'Lavagne'),h('button',{class:'secondary',onclick:()=>teacherAttendance(c)},'Presenze del corso')));
  });
  mount(header(out),h('h1',null,'Area docenti'),blocks.length?blocks:h('p',{class:'sub'},'Nessun corso assegnato.'),footer());
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
        if(!confirm('Eliminare questa lavagna? Gli alunni non la vedranno più.'))return;
        await sb.from('whiteboards').delete().eq('id',w.id);await sb.storage.from('lavagne').remove([w.path]);teacherWhiteboards(c)}},'Elimina'))))));
  mount(topbar('Lavagne · '+c.name,back),
    h('div',{class:'card'},h('h3',null,'Carica una lavagna'),h('p',{class:'sub small'},'Foto/screenshot o PDF (max 20 MB). Gli alunni del corso la vedono subito nella sezione Lavagne, sotto il numero di lezione indicato.'),num,ttl,file,up,msg),
    groups.length?groups:h('p',{class:'sub'},'Ancora nessuna lavagna caricata.'),footer());
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
    const {data,error}=await sb.from('attendance').select('status,joined_at,reason,note,lesson_sessions(session_date,course_id)').eq('student_id',st.id);
    if(error)return mount(head,h('p',{class:'err'},'Errore nel caricamento.'));
    const lab={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
    const rows=data.filter(a=>a.lesson_sessions).sort((a,b)=>a.lesson_sessions.session_date<b.lesson_sessions.session_date?1:-1).map(a=>h('tr',null,
      h('td',null,a.lesson_sessions.session_date),h('td',null,h('span',{class:'pill '+(lab[a.status]||['','n'])[1]},(lab[a.status]||[a.status])[0])),
      h('td',null,a.joined_at?new Date(a.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''),h('td',null,[a.reason,a.note].filter(Boolean).join(' · '))));
    const pres=data.filter(a=>a.status==='present').length,abs=data.filter(a=>a.status!=='present').length;
    return mount(head,h('p',null,'Presenze: ',h('strong',null,pres),' · Assenze: ',h('strong',null,abs)),
      rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Data','Stato','Ingresso','Motivo'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessuna presenza registrata.'),footer());
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

async function teacherAttendance(c){
  const back=()=>teacherHome();
  mount(topbar('Presenze · '+c.name,back),h('p',{class:'sub'},'Caricamento…'));
  const {data,error}=await sb.from('attendance').select('status,joined_at,students(display_name),lesson_sessions(session_date,lesson_number,course_id)').order('created_at',{ascending:false}).limit(300);
  if(error)return mount(topbar('Presenze',back),h('p',{class:'err'},'Errore nel caricamento.'));
  const mine=data.filter(a=>a.lesson_sessions&&a.lesson_sessions.course_id===c.id);
  const lab={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
  const rows=mine.map(a=>h('tr',null,h('td',null,a.lesson_sessions.session_date),h('td',null,a.students?a.students.display_name:''),
    h('td',null,h('span',{class:'pill '+(lab[a.status]||['',''])[1]},(lab[a.status]||[a.status])[0])),h('td',null,a.joined_at?new Date(a.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'')));
  mount(topbar('Presenze · '+c.name,back),
    rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Data','Studente','Stato','Ingresso'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessuna presenza registrata.'),footer());
}

/* ---------- boot ---------- */
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();
})();
