const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('fr-CA',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const number = n => new Intl.NumberFormat('fr-CA').format(Math.round(n));
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let windows=[];
let records=[], period='month', page='overview', openCard='';
let engineStatus='unavailable';
const priceInput=$('#price');
if(localStorage.getItem('tokenflex-price')!==null) priceInput.value=localStorage.getItem('tokenflex-price');
priceInput.addEventListener('input',()=>{localStorage.setItem('tokenflex-price',priceInput.value);render()});
const rate = id => Math.max(0,Number($('#'+id).value)||0);
function cost(row) { return Number.isFinite(row.costUSD) ? row.costUSD : 0; }
const incomplete = rows => rows.some(r=>!Number.isFinite(r.costUSD) || (r.coverage?.unpriced||0)>0);
function showToday() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate()-1);
    const onDay = day => records.filter(row => dayKey(new Date(row.time)) === dayKey(day));
    const rows = onDay(today);
    const sum = fn => rows.reduce((acc, row) => acc+fn(row), 0);
    const total = sum(cost);
    $('#today-total').textContent = records.length ? money(total) : '—';
    $('#today-date').textContent = today.toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long'}) + ' · depuis minuit';
    const cached = sum(row => row.cached);
    const metrics = [
        ['Entrée hors cache', sum(row => Math.max(0,row.input-row.cached))],
        ['Entrée en cache', cached],
        ['Sortie', sum(row => row.output)]
    ];
    $('#today-detail').innerHTML = metrics.map(([label,n]) =>
        '<div><small>'+label+'</small><b>'+number(n)+'</b><small>tokens</small></div>'
    ).join('') + '<p>Hier · '+money(onDay(yesterday).reduce((v,r)=>v+cost(r),0))+
        ' &nbsp; / &nbsp; Raisonnement inclus dans la sortie · '+number(sum(r=>r.reasoning))+' tokens</p>';
    if (incomplete(rows)) $('#today-total').textContent='Coût incomplet';
    if (!records.length) $('#today-detail').textContent='En attente de compteurs locaux.';
}
function bounds(){const now=new Date(), end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1), start=new Date(now.getFullYear(),now.getMonth(),now.getDate()); if(period==='week') start.setDate(start.getDate()-6); if(period==='rolling30') start.setDate(start.getDate()-29); if(period==='month') start.setDate(1); if(period==='previous'){start.setMonth(start.getMonth()-1,1);end.setMonth(end.getMonth(),1)} if(period==='all' && records.length){const earliest=Math.min(...records.map(r=>r.time));const d=new Date(earliest); start.setFullYear(d.getFullYear(),d.getMonth(),d.getDate())} return [start,end];}
function esc(s){const el=document.createElement('div');el.textContent=s;return el.innerHTML}
function card(label,value,hint,color,detail,id){return `<button class="card" data-card="${id}" aria-expanded="${openCard===id}"><div class="label">${label}</div><div class="value ${color}">${value}</div><div class="hint">${hint}</div>${openCard===id?`<div class="detail">${detail}</div>`:''}</button>`}
function plot(data,kind,threshold=0){if(!data.length)return '<div class="empty-chart">Aucune activité enregistrée.</div>';let width=800,height=210,pad=24, max=Math.max(1,...data.map(d=>kind==='line'?d.count:d.cost),threshold), maxCost=Math.max(.001,...data.map(d=>d.cost));const x=i=>pad+(width-2*pad)*(data.length===1?.5:i/(data.length-1)),y=v=>height-25-(height-50)*v/max; let lines=[0,.5,1].map(v=>`<line class="gridline" x1="${pad}" x2="${width-pad}" y1="${y(max*v)}" y2="${y(max*v)}"/>`).join('');let marks='';if(kind==='line'){let p=data.map((d,i)=>`${x(i)},${y(d.count)}`).join(' ');let q=data.map((d,i)=>`${x(i)},${height-25-(height-50)*d.cost/maxCost}`).join(' ');marks=`<polyline class="line-a" points="${p}"/><polyline class="line-b" points="${q}"/>`+(data.length===1?`<circle cx="${x(0)}" cy="${y(data[0].count)}" r="3" fill="#315e8f"/>`:'');}else{const w=Math.max(2,Math.min(35,(width-48)/data.length*.6));marks=data.map((d,i)=>`<rect x="${x(i)-w/2}" y="${y(d.cost)}" width="${w}" height="${height-25-y(d.cost)}" rx="2" fill="${d.cost>=threshold?'#c28b34':'#aab3bc'}"><title>${esc(d.date)} : ${money(d.cost)}</title></rect>`).join('')+`<line x1="${pad}" x2="${width-pad}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#646d75" stroke-dasharray="5 5"/>`;} return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${kind==='line'?'Évolution des tokens et du coût estimé, chacun à son échelle':'Coût API estimé par jour'}">${lines}${marks}<text x="${pad}" y="${height-2}">${esc(data[0].date)}</text><text x="${width-pad}" y="${height-2}" text-anchor="end">${esc(data.at(-1).date)}</text></svg>`}
function render(){
showToday();
const now=Date.now()/1000;
const latest=new Map();
for(const w of windows.slice().sort((a,b)=>a.time-b.time)) latest.set(w.minutes,w);
const active=[...latest.values()].filter(w=>w.reset>now).sort((a,b)=>a.minutes-b.minutes);
const dateLabel=t=>new Date(t*1000).toLocaleString('fr-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const describe=w=>number(w.minutes/60)+' h · '+number(w.used)+' %';
$('#limits').textContent=active.map(w=>describe(w)+' · Fin '+dateLabel(w.reset)).join('  |  ') || 'Aucun relevé valide pour la fenêtre actuelle.';
$('#resets').textContent=windows.filter(w=>w.reset<=now).sort((a,b)=>b.reset-a.reset).slice(0,3).map(w=>dateLabel(w.reset)+' · '+describe(w)).join('  |  ') || 'Aucune fenêtre terminée enregistrée.';
const [start,end]=bounds(); const selected=records.filter(r=>r.time>=start.getTime()&&r.time<end.getTime());const input=selected.reduce((a,r)=>a+r.input,0), output=selected.reduce((a,r)=>a+r.output,0), total=selected.reduce((a,r)=>a+cost(r),0);const days=Math.max(1,Math.round((end-start)/86400000));let sub=0;for(let d=new Date(start);d<end;d.setDate(d.getDate()+1))sub+=rate('price')/new Date(d.getFullYear(),d.getMonth()+1,0).getDate();const diff=total-sub;const daily=new Map(); for(const r of selected){let key=dayKey(new Date(r.time));let d=daily.get(key)||{date:key,count:0,cost:0};d.count+=r.input+r.output;d.cost+=cost(r);daily.set(key,d)} let graph=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));if(days<=100){graph=[];for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){const key=dayKey(d);graph.push(daily.get(key)||{date:key,count:0,cost:0})}} if(!records.length)graph=[];
$('#cards').innerHTML=card('Quota utilisé',active.length?number(active[0].used)+' %':'—','Dernier relevé · fenêtre courte','blue','La période sélectionnée concerne les tokens et les coûts.', 'quota')+card('Équivalent API moyen / jour',records.length&&!incomplete(selected)?money(total/days):'—','Moyenne sur la période','gold','Estimation API calculée par CodexBar, en USD. Ce montant ne correspond pas à une facture ni à un quota en dollars.','cost')+card('Tokens enregistrés',records.length?number(input+output):'—','Entrée / sortie','',`Entrée : ${number(input)} · Sortie : ${number(output)}.`, 'tokens')+card('Écart vs abonnement',records.length&&!incomplete(selected)?money(diff):'—','Coût API moins abonnement au prorata',diff>=0?'green':'',`Abonnement au prorata : ${money(sub)}. Un écart positif suggère une économie théorique.`, 'saving');
$('#cost-cards').innerHTML=card('Abonnement',money(rate('price'))+' / mois','Montant réglable ci-dessous','','Le montant est réparti sur les jours de chaque mois.','subscription')+card('Équivalent API',records.length&&!incomplete(selected)?money(total):'—','Estimation sur la période','gold','Coût transmis par CodexBar. Les modèles sans tarif restent non chiffrés ; aucun tarif de repli inventé.','api')+card('Ratio',records.length&&!incomplete(selected)&&sub>0?(total/sub).toFixed(2).replace('.',',')+'×':'—','API estimée / abonnement au prorata','green','Compare les deux montants pour la période sélectionnée.','ratio');
$('#line-chart').innerHTML=plot(graph,'line');const threshold=days?sub/days:0;$('#bar-chart').innerHTML=plot(graph,'bar',threshold);
const models=new Map();
for(const row of selected) for(const model of row.models||[]) {
    const entry=models.get(model.modelName)||{tokens:0,cost:0,unpriced:false};
    entry.tokens+=model.totalTokens||0;
    if(Number.isFinite(model.cost)) entry.cost+=model.cost; else entry.unpriced=true;
    models.set(model.modelName,entry);
}
const modelTotal=[...models.values()].reduce((a,b)=>a+b.tokens,0);
$('#models').innerHTML=modelTotal?[...models].sort((a,b)=>b[1].tokens-a[1].tokens).map(([name,m],i)=>
    `<div class="model"><div class="model-head"><span>${esc(name)}</span><strong>${m.unpriced?'Non chiffré':money(m.cost)} · ${Math.round(m.tokens/modelTotal*100)} %</strong></div><div class="track"><i style="width:${m.tokens/modelTotal*100}%;background:${['#315e8f','#80a0c3','#aab3bc','#c6974b'][i%4]}"></i></div></div>`).join(''):'Aucun modèle sur la période.';
document.querySelectorAll('[data-card]').forEach(el=>el.onclick=()=>{openCard=openCard===el.dataset.card?'':el.dataset.card;render()}); }
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x===b));render()});document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));$('#overview').hidden=page!=='overview';$('#cost').hidden=page!=='cost';$('#title').textContent=page==='overview'?'Vue d’ensemble':'Coût API vs abonnement';$('#page-label').textContent=page==='overview'?'VUE D’ENSEMBLE':'COÛT API VS ABONNEMENT';$('#subtitle').textContent=page==='overview'?'Une vue claire de ton utilisation de Codex.':'Ce que ton utilisation pourrait coûter en API.';render()});

async function refresh(){
    try {
        const response=await fetch('/stats',{cache:'no-store'});
        if(!response.ok) throw Error();
        const stats=await response.json();
        records=stats.records;
        engineStatus=stats.status;
        if (records.length) {
            const days = new Set(records.map(r => dayKey(new Date(r.time))));
            const first = [...days].sort()[0];
            $('#source').textContent = 'CodexBar · USD · depuis le '+first+' · '+days.size+' jours d’activité · filtre « Tout »';
        }
        windows=stats.windows;
        render();
        $('.sync-status').textContent=stats.status==='ok' ? 'CodexBar · relevé '+(stats.updatedAt ? new Date(stats.updatedAt).toLocaleString('fr-CA') : 'local') : stats.message+' Dernier relevé conservé.';
    } catch {
        $('.sync-status').textContent='Synchronisation interrompue';
    } finally {
        setTimeout(refresh,60000);
    }
}
render();
refresh();
