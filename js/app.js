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
function mount(...nodes){$app.replaceChildren(...nodes);window.scrollTo(0,0)}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function norm(s){return String(s==null?'':s).toLowerCase().replace(/ß/g,'ss').replace(/[.,;:!?¡¿"“”„'’‘()…\-–—]/g,' ').replace(/\s+/g,' ').trim()}
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
  loginView();
}

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
    h('h1',null,'Benvenuta, benvenuto!'),
    h('p',{class:'sub'},'Inserisci il codice personale che ti ha dato la tua insegnante.'),
    h('div',{class:'card'},inp,btn,err),
    h('p',{class:'sub small'},'Sei un’insegnante? ',h('a',{href:'#docente',onclick:()=>setTimeout(()=>location.reload(),0)},'Accedi qui')),
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
    if(!data.consent_at)return consentView();
    homeView();
  }catch(e){
    const cache=LS.get('esmet_cache',null);
    if(cache&&S.code===code){S.me=cache;if(cache.consent_at)return homeView(true)}
    if(errEl)errEl.textContent='Connessione assente o servizio non raggiungibile. Riprova.';
    else loginView('Connessione assente. Riprova.');
  }
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
      h('p',null,'Questa app registra i tuoi risultati negli esercizi (punteggi, frasi sbagliate, presenza alle lezioni) per permettere alla tua insegnante di seguire i tuoi progressi e aiutarti dove serve.'),
      h('p',null,'Salviamo solo il tuo nome e un codice personale. I dati sono usati esclusivamente da Esmet Academy per la didattica, sono protetti con cifratura in transito e a riposo e non vengono ceduti a terzi.'),
      h('label',{class:'chk',for:'cn'},chk,h('span',null,'Ho letto e accetto il trattamento dei miei dati per queste finalità.')),
      btn,err),
    footer()
  );
}

/* ---------- student: home ---------- */
function homeView(offline){
  const me=S.me;
  const out=h('button',{class:'linkbtn',onclick:()=>{LS.del('esmet_code');LS.del('esmet_cache');S.code=null;S.me=null;loginView()}},'Esci');
  const blocks=me.courses.map(c=>courseBlock(c));
  mount(
    header(out),
    h('h1',null,'Ciao '+me.name+'!'),
    offline?h('p',{class:'sub'},'Sei offline: vedi l’ultima versione scaricata.'):null,
    blocks.length?blocks:h('p',{class:'sub'},'Non hai ancora corsi assegnati.'),
    footer()
  );
}
function courseBlock(c){
  const lessons=(c.lessons||[]).slice().sort((a,b)=>b.number-a.number);
  const joinMsg=h('p',{class:'sub small',role:'status'});
  const join=h('button',{class:'primary',onclick:async()=>{
    joinMsg.textContent='Un attimo…';
    const win=window.open('about:blank','_blank');
    const {data,error}=await sb.rpc('student_join_lesson',{p_code:S.code,p_course:c.id});
    if(error||!data){if(win)win.close();joinMsg.textContent=error?'Non riesco a registrare l’ingresso. Riprova.':'Il link della lezione non è ancora disponibile.';return}
    joinMsg.textContent='Presenza registrata. Buona lezione!';
    if(win)win.location.href=data;else location.href=data;
  }},'Accedi alla lezione');
  const abs=h('button',{class:'secondary',onclick:()=>absenceView(c)},'Avviso assenza');
  return h('section',{class:'card'},
    h('h2',null,c.name),
    h('p',{class:'sub'},[c.level,c.section==='morning'?'mattina':c.section==='evening'?'sera':null].filter(Boolean).join(' · ')),
    h('div',{class:'row'},c.zoom?null:null,join,abs),joinMsg,
    h('h3',null,'Lezioni'),
    lessons.length?h('div',{class:'list'},lessons.map(l=>lessonItem(c,l))):h('p',{class:'sub'},'Nessuna lezione pubblicata.')
  );
}
function lessonItem(c,l){
  const ex=(l.content&&l.content.exercises)||[];
  const res=LS.get('esmet_res_'+l.id,{});
  const done=Object.keys(res).length;
  return h('button',{class:'item',onclick:()=>lessonView(c,l)},
    h('span',null,h('span',{class:'kind'},'Lezione '+l.number),h('br'),l.title),
    h('span',{class:'res'},done+'/'+ex.length));
}
function absenceView(c){
  const d=h('input',{type:'date',class:'txt',value:new Date().toISOString().slice(0,10)});
  const msg=h('p',{role:'status'});
  const send=h('button',{class:'primary',onclick:async()=>{
    send.disabled=true;
    const {error}=await sb.rpc('student_notify_absence',{p_code:S.code,p_course:c.id,p_date:d.value});
    if(error){msg.className='err';msg.textContent='Non sono riuscito a inviare. Riprova.';send.disabled=false}
    else{msg.className='ok';msg.textContent='Avviso inviato. Grazie!'}
  }},'Avvisa che non ci sarò');
  mount(header(h('button',{class:'linkbtn',onclick:()=>homeView()},'← Indietro')),
    h('h1',null,'Avviso assenza'),
    h('div',{class:'card'},h('p',null,c.name),h('label',null,'Giorno della lezione',d),send,msg),footer());
}

/* ---------- student: lesson ---------- */
function lessonView(c,l){
  const ex=(l.content&&l.content.exercises)||[];
  const res=LS.get('esmet_res_'+l.id,{});
  const names={flash:'Flash cards',match:'Abbina',quiz:'Quiz',unjumble:'Riordina la frase',cloze:'Completa la frase',group:'Dividi in gruppi',cards:'Carte per parlare',type:'Scrivi la risposta'};
  const list=ex.map((e,i)=>h('button',{class:'item',onclick:()=>exView(c,l,i)},
    h('span',null,h('span',{class:'kind'},names[e.type]||e.type,e.hw?h('span',{class:'tag'},'compiti'):null),h('br'),e.title),
    h('span',{class:'res'},res[i]?res[i].score+'/'+res[i].total:'')));
  mount(header(h('button',{class:'linkbtn',onclick:()=>homeView()},'← Indietro')),
    h('h1',null,'Lezione '+l.number+': '+l.title),
    h('div',{class:'list'},list),
    h('button',{class:'secondary',onclick:()=>reportView(c,l)},'Invia resoconto alla docente'),
    footer());
}
function exView(c,l,i){
  const ex=l.content.exercises[i];
  const back=()=>lessonView(c,l);
  const box=h('div',{class:'game'});
  mount(header(h('button',{class:'linkbtn',onclick:back},'← Indietro')),
    h('h2',null,ex.title),ex.instr?h('p',{class:'sub'},ex.instr):null,box,footer());
  const eng=ENGINES[ex.type];
  if(!eng){box.append(h('p',null,'Questo tipo di esercizio non è ancora disponibile.'));return}
  eng(ex,box,async r=>{
    r.title=ex.title;r.type=ex.type;
    await submitResult(l,i,r);
    box.replaceChildren(
      h('p',{class:'sum'},r.score+' / '+r.total),
      h('p',{class:'sub'},r.wrong.length?'Da ripassare: '+r.wrong.length+' ':'Perfetto!'),
      ex.fin?h('p',null,ex.fin):null,
      h('div',{class:'row'},
        h('button',{class:'primary',onclick:()=>exView(c,l,i)},'Rifai'),
        h('button',{class:'secondary',onclick:back},'Torna alla lezione'),
        (i+1<l.content.exercises.length)?h('button',{class:'secondary',onclick:()=>exView(c,l,i+1)},'Prossimo'):null));
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
  mount(header(h('button',{class:'linkbtn',onclick:()=>lessonView(c,l)},'← Indietro')),
    h('h1',null,'Resoconto'),ta,
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
function teacherLogin(msg){
  const em=h('input',{class:'txt',type:'email',autocomplete:'username',placeholder:'Email'});
  const pw=h('input',{class:'txt',type:'password',autocomplete:'current-password',placeholder:'Password'});
  const err=h('p',{class:'err',role:'alert'},msg||'');
  const go=async()=>{
    const {error}=await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
    if(error){err.textContent='Email o password non corretti.';return}
    teacherHome();
  };
  pw.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  mount(h('img',{class:'logo-big',src:'icons/logo.png',alt:'Esmet Academy'}),h('h1',null,'Area docenti'),
    h('div',{class:'card'},em,pw,h('button',{class:'primary',onclick:go},'Accedi'),err),
    h('p',{class:'sub small'},h('a',{href:'./',onclick:()=>{location.hash='';setTimeout(()=>location.reload(),0)}},'← Area studenti')),footer());
}
async function teacherHome(){
  const out=h('button',{class:'linkbtn',onclick:async()=>{await sb.auth.signOut();teacherLogin()}},'Esci');
  mount(header(out),h('h1',null,'Area docenti'),h('p',{class:'sub'},'Caricamento…'));
  const [cs,en]=await Promise.all([
    sb.from('courses').select('id,name,level,kind,zoom_url').eq('active',true).order('name'),
    sb.from('enrollments').select('course_id,section,students(id,display_name,code,consent_at)')
  ]);
  if(cs.error||en.error)return mount(header(out),h('p',{class:'err'},'Errore nel caricamento. Sei sicuro di avere un profilo docente?'),footer());
  const blocks=cs.data.map(c=>{
    const studs=en.data.filter(e=>e.course_id===c.id&&e.students);
    return h('section',{class:'card'},h('h2',null,c.name),h('p',{class:'sub'},c.level+' · '+studs.length+' studenti'),
      h('div',{class:'list'},studs.map(e=>h('button',{class:'item',onclick:()=>teacherStudent(e.students,c)},
        h('span',null,e.students.display_name,e.section?h('span',{class:'tag'},e.section==='morning'?'mattina':e.section==='evening'?'sera':e.section):null),
        h('span',{class:'res'},e.students.consent_at?'':'consenso mancante')))),
      h('button',{class:'secondary',onclick:()=>teacherAttendance(c)},'Presenze'));
  });
  mount(header(out),h('h1',null,'Area docenti'),blocks.length?blocks:h('p',{class:'sub'},'Nessun corso assegnato.'),footer());
}
async function teacherStudent(st,c){
  const back=h('button',{class:'linkbtn',onclick:teacherHome},'← Indietro');
  mount(header(back),h('h1',null,st.display_name),h('p',{class:'sub'},'Caricamento…'));
  const {data,error}=await sb.from('exercise_results').select('exercise_idx,score,total,details,created_at,lessons(number,title)').eq('student_id',st.id).order('created_at',{ascending:false}).limit(200);
  if(error)return mount(header(back),h('p',{class:'err'},'Errore nel caricamento.'),footer());
  const rows=data.map(r=>{
    const pct=r.total?Math.round(100*r.score/r.total):0;
    const w=(r.details&&r.details.wrong)||[];
    return h('tr',null,
      h('td',null,fmtDate(r.created_at)),
      h('td',null,'L'+(r.lessons?r.lessons.number:'?')+' · '+((r.details&&r.details.title)||('Es. '+(r.exercise_idx+1)))),
      h('td',null,h('span',{class:'pill '+(pct>=80?'g':pct>=50?'n':'b')},r.score+'/'+r.total)),
      h('td',null,w.map(x=>(x.q||x.id)+(x.given?' → '+x.given:'')).join(' · ')));
  });
  mount(header(back),h('h1',null,st.display_name),
    h('p',{class:'sub'},'Codice: ',h('strong',null,String(st.code||'').toUpperCase())),
    rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Quando','Esercizio','Punteggio','Errori'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessun risultato ancora.'),
    footer());
}
async function teacherAttendance(c){
  const back=h('button',{class:'linkbtn',onclick:teacherHome},'← Indietro');
  mount(header(back),h('h1',null,'Presenze · '+c.name),h('p',{class:'sub'},'Caricamento…'));
  const {data,error}=await sb.from('attendance').select('status,joined_at,students(display_name),lesson_sessions(session_date,lesson_number,course_id)').order('created_at',{ascending:false}).limit(300);
  if(error)return mount(header(back),h('p',{class:'err'},'Errore nel caricamento.'),footer());
  const mine=data.filter(a=>a.lesson_sessions&&a.lesson_sessions.course_id===c.id);
  const lab={present:['Presente','g'],absent:['Assente','b'],absent_notified:['Assente avvisato','n']};
  const rows=mine.map(a=>h('tr',null,h('td',null,a.lesson_sessions.session_date),h('td',null,a.students?a.students.display_name:''),
    h('td',null,h('span',{class:'pill '+(lab[a.status]||['',''])[1]},(lab[a.status]||[a.status])[0])),h('td',null,a.joined_at?new Date(a.joined_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'')));
  mount(header(back),h('h1',null,'Presenze · '+c.name),
    rows.length?h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,['Data','Studente','Stato','Ingresso'].map(t=>h('th',null,t)))),h('tbody',null,rows))):h('p',{class:'sub'},'Nessuna presenza registrata.'),footer());
}

/* ---------- boot ---------- */
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();
})();
