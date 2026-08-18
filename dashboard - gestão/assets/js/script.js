/* ======================= SCRIPT PRINCIPAL ======================= */
/* Carrega data.json de forma assíncrona e, em seguida, inicializa
   toda a lógica do dashboard. */

(async function () {
  const res = await fetch('json/data.json');
  const DATA = await res.json();
  const { LS_KEY, defaultState, CHEGADA_FIELDS, SAIDA_FIELDS, MAP_SEGMENTOS, MAP_STATUS } = DATA;


  /* ======================= STATE ======================= */

  let state;
  try{
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    state = saved ? Object.assign({}, defaultState, saved) : JSON.parse(JSON.stringify(defaultState));
    if(!state.brackets || state.brackets.length!==6) state.brackets = defaultState.brackets;
  }catch(e){
    state = JSON.parse(JSON.stringify(defaultState));
  }
  // migração: registros antigos guardavam "cliente" como "Código | Nome" combinados
  if(Array.isArray(state.fbClients)){
    state.fbClients.forEach(c=>{
      if(c.codigo===undefined || c.nome===undefined){
        const parts = String(c.cliente||'').split('|');
        c.codigo = (parts[0]||'').trim();
        c.nome = (parts[1]||'').trim();
        delete c.cliente;
      }
      if(c.lastContact===undefined) c.lastContact = '';
    });
  }

  function currentMonthKey(){
    const d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthLabel(key){
    const [y,m] = key.split('-');
    const names=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return names[Number(m)-1]+'/'+y;
  }
  function nextMonthKey(key){
    let [y,m] = key.split('-').map(Number);
    m++; if(m>12){m=1;y++;}
    return y+'-'+String(m).padStart(2,'0');
  }

  // migração / dados de exemplo iniciais
  if(!state.tier3Months || Object.keys(state.tier3Months).length===0){
    const key = currentMonthKey();
    state.tier3MonthKey = key;
    state.tier3Months = {};
    state.tier3Months[key] = [
      {id:uid(), nome:'Rodolfo Pietre', sdr:false, agendamento:56, reunioes:6, conta:6},
      {id:uid(), nome:'Pedro Conde', sdr:false, agendamento:31, reunioes:15, conta:4},
      {id:uid(), nome:'Pedro Kauan', sdr:false, agendamento:29, reunioes:18, conta:15},
      {id:uid(), nome:'Giovanna', sdr:true, agendamento:52, reunioes:7, conta:3},
      {id:uid(), nome:'André', sdr:false, agendamento:45, reunioes:12, conta:6},
      {id:uid(), nome:'Victor Faria', sdr:false, agendamento:50, reunioes:17, conta:15},
      {id:uid(), nome:'Miguel', sdr:false, agendamento:73, reunioes:19, conta:13},
      {id:uid(), nome:'Yago', sdr:false, agendamento:13, reunioes:5, conta:5},
      {id:uid(), nome:'Cauã Vieira', sdr:false, agendamento:18, reunioes:6, conta:2},
      {id:uid(), nome:'Davi Pessoa', sdr:true, agendamento:64, reunioes:28, conta:22},
      {id:uid(), nome:'Gustavo', sdr:false, agendamento:0, reunioes:0, conta:2},
    ];
  }
  if(!state.tier3MonthKey || !state.tier3Months[state.tier3MonthKey]){
    state.tier3MonthKey = Object.keys(state.tier3Months).sort().slice(-1)[0];
  }

  // migração / dados de pontualidade (Gestão Tier 2) por mês
  if(!state.attMonths || Object.keys(state.attMonths).length===0){
    const key = currentMonthKey();
    state.attMonthKey = key;
    state.attMonths = {};
    // migração: versões antigas guardavam os registros em state.attRows (sem separação por mês)
    state.attMonths[key] = Array.isArray(state.attRows) ? state.attRows : [];
  }
  delete state.attRows;
  if(!state.attMonthKey || !state.attMonths[state.attMonthKey]){
    state.attMonthKey = Object.keys(state.attMonths).sort().slice(-1)[0];
  }

  function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtBRL(v){ v = Number(v)||0; return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function fmtPct(v){ return (Number(v)||0).toFixed(1).replace('.',',') + '%'; }

  /* ======================= NAV / TABS ======================= */
  /* Enter finaliza o campo (dispara 'change'/recalculo) em vez de recarregar ou perder o foco */
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && e.target.tagName==='INPUT' && e.target.type!=='checkbox'){
      e.preventDefault();
      e.target.blur();
    }
  });
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
      document.getElementById('sec-'+item.dataset.section).classList.add('active');
    });
  });
  document.querySelectorAll('.tabbtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const bar = btn.parentElement;
      bar.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const panelWrap = bar.parentElement;
      panelWrap.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    });
  });

  /* ======================= ADVISOR SHARED LIST (Tier2) ======================= */
  function registerAdvisor(str){
    if(!str) return;
    str = str.trim();
    if(!str) return;
    if(!state.advisors.includes(str)){
      state.advisors.push(str);
      save();
      renderAdvisorDatalist();
    }
  }
  function renderAdvisorDatalist(){
    const dl = document.getElementById('advisorList');
    dl.innerHTML = state.advisors.map(a=>`<option value="${escapeHtml(a)}">`).join('');
  }
  function escapeHtml(s){
    return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ======================= DONUT HELPER ======================= */
  const tooltipEl = document.getElementById('tooltip');

  function renderDonut(elId, segments, centerBuilder){
    const el = document.getElementById(elId);
    const total = segments.reduce((a,s)=>a+s.value,0);
    let gradient, legendSegs = segments;
    if(total<=0){
      gradient = `conic-gradient(#26365c 0deg 360deg)`;
    }else{
      let acc = 0;
      const parts = segments.map(s=>{
        const start = acc/total*360;
        acc += s.value;
        const end = acc/total*360;
        return `${s.color} ${start}deg ${end}deg`;
      });
      gradient = `conic-gradient(${parts.join(',')})`;
    }
    el.style.background = gradient;
    el.innerHTML = `<div class="donut-center">${centerBuilder(total)}</div>`;

    el.onmousemove = (e)=>{
      tooltipEl.style.display='block';
      tooltipEl.style.left = (e.clientX+14)+'px';
      tooltipEl.style.top = (e.clientY+14)+'px';
      let html = `<div class="tt-title">Detalhamento</div>`;
      legendSegs.forEach(s=>{
        const pct = total>0 ? (s.value/total*100) : 0;
        html += `<div class="tt-row"><span class="sw" style="background:${s.color}"></span>${s.label} <b>${s.value} (${pct.toFixed(1)}%)</b></div>`;
      });
      tooltipEl.innerHTML = html;
    };
    el.onmouseleave = ()=>{ tooltipEl.style.display='none'; };
  }

  /* ======================= TIER 2 — GESTÃO (PONTUALIDADE) ======================= */

  function renderAttMonthSelect(){
    const sel = document.getElementById('attMonthSelect');
    const keys = Object.keys(state.attMonths).sort();
    sel.innerHTML = keys.map(k=>`<option value="${k}" ${k===state.attMonthKey?'selected':''}>${monthLabel(k)}</option>`).join('');
  }
  document.getElementById('attMonthSelect').addEventListener('change', e=>{
    state.attMonthKey = e.target.value; save(); renderAttSection();
  });
  document.getElementById('btnNewMonthAtt').addEventListener('click', ()=>{
    const newKey = nextMonthKey(state.attMonthKey);
    if(state.attMonths[newKey]){
      if(!confirm('Esse mês já existe. Deseja apenas ir para ele?')) return;
      state.attMonthKey = newKey; save(); renderAttSection();
      return;
    }
    const prevRows = state.attMonths[state.attMonthKey] || [];
    state.attMonths[newKey] = prevRows.map(r=>({id:uid(), advisor:r.advisor, antes9:0, ate930:0, depois930:0, depoisAlmoco:0, faltantes:0, antes18:0, depois18:0}));
    state.attMonthKey = newKey;
    save(); renderAttSection();
  });

  function renderAttSection(){
    renderAttMonthSelect();
    const rows = state.attMonths[state.attMonthKey] || [];
    // rows
    const wrap = document.getElementById('attRows');
    wrap.innerHTML = '';
    rows.forEach(row=>{
      const div = document.createElement('div');
      div.className = 'att-row';
      div.innerHTML = `
        <div class="att-top">
          <div class="field" style="max-width:280px;flex:1;">
            <label class="f-label">Código | Nome do Assessor</label>
            <input type="text" list="advisorList" value="${escapeHtml(row.advisor)}" data-role="advisor" placeholder="Ex: 014 | Rodolfo Pietre">
          </div>
        </div>
        <div class="att-groups">
          <div>
            <div class="att-group-title">Chegada</div>
            <div class="att-fields">
              ${CHEGADA_FIELDS.map(f=>`
                <div class="field">
                  <label class="f-label">${f.label}</label>
                  <input type="number" min="0" value="${row[f.key]||0}" data-role="${f.key}">
                </div>`).join('')}
            </div>
          </div>
          <div>
            <div class="att-group-title">Saída</div>
            <div class="att-fields">
              ${SAIDA_FIELDS.map(f=>`
                <div class="field">
                  <label class="f-label">${f.label}</label>
                  <input type="number" min="0" value="${row[f.key]||0}" data-role="${f.key}">
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="row-actions"><button class="btn btn-danger btn-sm" data-action="del">Remover</button></div>
      `;
      div.querySelector('[data-role=advisor]').addEventListener('change', e=>{
        row.advisor = e.target.value; registerAdvisor(row.advisor); save();
      });
      [...CHEGADA_FIELDS,...SAIDA_FIELDS].forEach(f=>{
        div.querySelector(`[data-role=${f.key}]`).addEventListener('input', e=>{
          row[f.key] = Number(e.target.value)||0; save(); renderAttDonuts();
        });
      });
      div.querySelector('[data-action=del]').addEventListener('click', ()=>{
        state.attMonths[state.attMonthKey] = rows.filter(r=>r.id!==row.id); save(); renderAttSection();
      });
      wrap.appendChild(div);
    });

    renderAttDonuts();
  }

  function renderAttDonuts(){
    const rows = state.attMonths[state.attMonthKey] || [];
    const sumsChegada = {}; CHEGADA_FIELDS.forEach(f=>sumsChegada[f.key]=0);
    const sumsSaida = {}; SAIDA_FIELDS.forEach(f=>sumsSaida[f.key]=0);
    rows.forEach(r=>{
      CHEGADA_FIELDS.forEach(f=>sumsChegada[f.key]+=Number(r[f.key])||0);
      SAIDA_FIELDS.forEach(f=>sumsSaida[f.key]+=Number(r[f.key])||0);
    });

    const chegadaSegs = CHEGADA_FIELDS.map(f=>({label:f.label,value:sumsChegada[f.key],color:f.color}));
    const onTime = sumsChegada.antes9 + sumsChegada.ate930;
    const late = sumsChegada.depois930 + sumsChegada.depoisAlmoco + sumsChegada.faltantes;
    const totalC = onTime+late;
    renderDonut('donutChegada', chegadaSegs, (total)=>{
      if(total===0) return `<div class="dstatus">Sem dados</div>`;
      const isOnTime = onTime >= late;
      const pct = (isOnTime ? onTime : late)/total*100;
      return `<div class="dstatus" style="color:${isOnTime?'#7cf3c9':'#ff97ab'}">${isOnTime?'NO HORÁRIO':'ATRASADO'}</div>
              <div class="dval">${pct.toFixed(0)}%</div>
              <div class="dsub">média do mês</div>`;
    });

    const saidaSegs = SAIDA_FIELDS.map(f=>({label:f.label,value:sumsSaida[f.key],color:f.color}));
    const totalS = sumsSaida.antes18+sumsSaida.depois18;
    renderDonut('donutSaida', saidaSegs, (total)=>{
      if(total===0) return `<div class="dstatus">Sem dados</div>`;
      const isOnTime = sumsSaida.depois18 >= sumsSaida.antes18;
      const pct = (isOnTime? sumsSaida.depois18 : sumsSaida.antes18)/total*100;
      return `<div class="dstatus" style="color:${isOnTime?'#7cf3c9':'#8fd6ff'}">${isOnTime?'NO HORÁRIO':'ANTES DO HORÁRIO'}</div>
              <div class="dval">${pct.toFixed(0)}%</div>
              <div class="dsub">média do mês</div>`;
    });

    const legend = document.getElementById('attLegend');
    legend.innerHTML = [...chegadaSegs,...saidaSegs].map(s=>`
      <div class="legend-item"><span class="sw" style="background:${s.color}"></span>${s.label}<b>${s.value}</b></div>
    `).join('');
  }

  document.getElementById('btnAddAtt').addEventListener('click', ()=>{
    const rows = state.attMonths[state.attMonthKey] || (state.attMonths[state.attMonthKey]=[]);
    rows.push({id:uid(), advisor:'', antes9:0, ate930:0, depois930:0, depoisAlmoco:0, faltantes:0, antes18:0, depois18:0});
    save(); renderAttSection();
  });

  /* ======================= TIER 2 — METAS ======================= */
  function renderMetas(){
    const wrap = document.getElementById('metaRows');
    wrap.innerHTML = '';
    state.metaRows.forEach(row=>{
      const tempo = Number(row.tempo)||0;
      const contas = Number(row.contas)||0;
      const captacao = Number(row.captacao)||0;
      const seguro = Number(row.seguro)||0;
      const consorcio = Number(row.consorcio)||0;
      const aberturaMedia = tempo>0 ? contas/tempo : 0;
      const captacaoMedia = tempo>0 ? captacao/tempo : 0;
      const paMedio = tempo>0 ? seguro/tempo : 0;
      const consorcioMedio = tempo>0 ? consorcio/tempo : 0;

      const div = document.createElement('div');
      div.className = 'meta-card';
      div.innerHTML = `
        <div class="meta-card-head">
          <div class="field">
            <input type="text" list="advisorList" value="${escapeHtml(row.advisor)}" data-role="advisor" placeholder="Código | Nome do Assessor">
          </div>
          <button class="trash-btn" data-action="del" title="Remover">🗑</button>
        </div>
        <div class="meta-grid5">
          <div class="field"><label class="f-label">Tempo (Meses)</label>
            <input type="number" min="0" value="${tempo}" data-role="tempo"></div>
          <div class="field"><label class="f-label">Contas (Qtd)</label>
            <input type="number" min="0" value="${contas}" data-role="contas"></div>
          <div class="field"><label class="f-label">Captação (R$)</label>
            <input type="number" min="0" value="${captacao}" data-role="captacao"></div>
          <div class="field"><label class="f-label">Seguro Total (R$)</label>
            <input type="number" min="0" value="${seguro}" data-role="seguro"></div>
          <div class="field"><label class="f-label">Consórcio Total (R$)</label>
            <input type="number" min="0" value="${consorcio}" data-role="consorcio"></div>
        </div>
        <div class="meta-grid2">
          <div class="stat-pill"><div class="k">Abertura média</div><div class="v accent">${aberturaMedia.toFixed(1)}<span class="unit">/mês</span></div></div>
          <div class="stat-pill"><div class="k">Captação média</div><div class="v accent">${fmtBRL(captacaoMedia)}</div></div>
          <div class="stat-pill"><div class="k">PA médio (seguro)</div><div class="v accent">${fmtBRL(paMedio)}</div></div>
          <div class="stat-pill"><div class="k">Consórcio médio</div><div class="v accent">${fmtBRL(consorcioMedio)}</div></div>
        </div>
        <div class="field">
          <label class="f-label">Foco do mês</label>
          <textarea class="foco" data-role="foco" placeholder="Escreva aqui o foco do mês para este assessor...">${escapeHtml(row.foco||'')}</textarea>
        </div>
      `;
      div.querySelector('[data-role=advisor]').addEventListener('change', e=>{
        row.advisor = e.target.value; registerAdvisor(row.advisor); save();
      });
      div.querySelector('[data-role=foco]').addEventListener('input', e=>{
        row.foco = e.target.value; save();
      });
      ['tempo','contas','captacao','seguro','consorcio'].forEach(k=>{
        const inp = div.querySelector(`[data-role=${k}]`);
        inp.addEventListener('input', e=>{
          row[k] = Number(e.target.value)||0; save();
        });
        inp.addEventListener('change', ()=>{ renderMetas(); });
      });
      div.querySelector('[data-action=del]').addEventListener('click', ()=>{
        state.metaRows = state.metaRows.filter(r=>r.id!==row.id); save(); renderMetas();
      });
      wrap.appendChild(div);
    });
  }
  document.getElementById('btnAddMeta').addEventListener('click', ()=>{
    state.metaRows.push({id:uid(), advisor:'', tempo:0, contas:0, captacao:0, seguro:0, consorcio:0, foco:''});
    save(); renderMetas();
  });
  document.getElementById('btnAdvanceMonth').addEventListener('click', ()=>{
    if(!confirm('Adicionar +1 mês ao tempo de assessoria de todos os assessores?')) return;
    state.metaRows.forEach(r=> r.tempo = (Number(r.tempo)||0)+1 );
    save(); renderMetas();
  });

  /* ======================= TIER 3 ======================= */
  function renderTier3Profiles(){
    const wrap = document.getElementById('profileRows3');
    wrap.innerHTML = '';
    state.tier3Profiles.forEach(row=>{
      const tempo = Number(row.tempo)||0;
      const contas = Number(row.contas)||0;
      const captacao = Number(row.captacao)||0;
      const seguro = Number(row.seguro)||0;
      const consorcio = Number(row.consorcio)||0;
      const aberturaMedia = tempo>0 ? contas/tempo : 0;
      const captacaoMedia = tempo>0 ? captacao/tempo : 0;
      const paMedio = tempo>0 ? seguro/tempo : 0;
      const consorcioMedio = tempo>0 ? consorcio/tempo : 0;

      const div = document.createElement('div');
      div.className = 'meta-card';
      div.innerHTML = `
        <div class="meta-card-head">
          <div class="field">
            <input type="text" value="${escapeHtml(row.advisor)}" data-role="advisor" placeholder="Código | Nome do Assessor">
          </div>
          <button class="trash-btn" data-action="del" title="Remover">🗑</button>
        </div>
        <div class="meta-grid5">
          <div class="field"><label class="f-label">Tempo (Meses)</label>
            <input type="number" min="0" value="${tempo}" data-role="tempo"></div>
          <div class="field"><label class="f-label">Contas (Qtd)</label>
            <input type="number" min="0" value="${contas}" data-role="contas"></div>
          <div class="field"><label class="f-label">Captação (R$)</label>
            <input type="number" min="0" value="${captacao}" data-role="captacao"></div>
          <div class="field"><label class="f-label">Seguro Total (R$)</label>
            <input type="number" min="0" value="${seguro}" data-role="seguro"></div>
          <div class="field"><label class="f-label">Consórcio Total (R$)</label>
            <input type="number" min="0" value="${consorcio}" data-role="consorcio"></div>
        </div>
        <div class="meta-grid2">
          <div class="stat-pill"><div class="k">Abertura média</div><div class="v accent">${aberturaMedia.toFixed(1)}<span class="unit">/mês</span></div></div>
          <div class="stat-pill"><div class="k">Captação média</div><div class="v accent">${fmtBRL(captacaoMedia)}</div></div>
          <div class="stat-pill"><div class="k">PA médio (seguro)</div><div class="v accent">${fmtBRL(paMedio)}</div></div>
          <div class="stat-pill"><div class="k">Consórcio médio</div><div class="v accent">${fmtBRL(consorcioMedio)}</div></div>
        </div>
        <div class="field">
          <label class="f-label">Dificuldade da semana</label>
          <textarea class="foco" data-role="dificuldade" placeholder="Descreva a principal dificuldade do assessor nesta semana...">${escapeHtml(row.dificuldade||'')}</textarea>
        </div>
      `;
      div.querySelector('[data-role=advisor]').addEventListener('change', e=>{
        row.advisor = e.target.value; save();
      });
      ['tempo','contas','captacao','seguro','consorcio'].forEach(k=>{
        const inp = div.querySelector(`[data-role=${k}]`);
        inp.addEventListener('input', e=>{
          row[k] = Number(e.target.value)||0; save();
        });
        inp.addEventListener('change', ()=>{ renderTier3Profiles(); });
      });
      div.querySelector('[data-role=dificuldade]').addEventListener('input', e=>{
        row.dificuldade = e.target.value; save();
      });
      div.querySelector('[data-action=del]').addEventListener('click', ()=>{
        state.tier3Profiles = state.tier3Profiles.filter(r=>r.id!==row.id); save(); renderTier3Profiles();
      });
      wrap.appendChild(div);
    });
  }
  document.getElementById('btnAddProfile3').addEventListener('click', ()=>{
    state.tier3Profiles.push({id:uid(), advisor:'', tempo:0, contas:0, captacao:0, seguro:0, consorcio:0, dificuldade:''});
    save(); renderTier3Profiles();
  });
  document.getElementById('btnAdvanceMonth3').addEventListener('click', ()=>{
    if(!confirm('Adicionar +1 mês ao tempo de assessoria de todos os assessores do Tier 3?')) return;
    state.tier3Profiles.forEach(r=> r.tempo = (Number(r.tempo)||0)+1 );
    save(); renderTier3Profiles();
  });

  /* ---- Funil (por mês) ---- */
  function renderMonthSelect(){
    const sel = document.getElementById('tier3MonthSelect');
    const keys = Object.keys(state.tier3Months).sort();
    sel.innerHTML = keys.map(k=>`<option value="${k}" ${k===state.tier3MonthKey?'selected':''}>${monthLabel(k)}</option>`).join('');
  }
  document.getElementById('tier3MonthSelect').addEventListener('change', e=>{
    state.tier3MonthKey = e.target.value; save(); renderTier3Table();
  });
  document.getElementById('btnNewMonth3').addEventListener('click', ()=>{
    const newKey = nextMonthKey(state.tier3MonthKey);
    if(state.tier3Months[newKey]){
      if(!confirm('Esse mês já existe. Deseja apenas ir para ele?')) return;
      state.tier3MonthKey = newKey; save(); renderMonthSelect(); renderTier3Table();
      return;
    }
    const prevRows = state.tier3Months[state.tier3MonthKey] || [];
    state.tier3Months[newKey] = prevRows.map(r=>({id:uid(), nome:r.nome, sdr:r.sdr, agendamento:0, reunioes:0, conta:0}));
    state.tier3MonthKey = newKey;
    save(); renderMonthSelect(); renderTier3Table();
  });

  function renderTier3Table(){
    renderMonthSelect();
    const rows = state.tier3Months[state.tier3MonthKey] || [];
    const tbody = document.getElementById('tier3Tbody');
    tbody.innerHTML = '';
    let totAg=0, totReu=0, totConta=0;
    rows.forEach(row=>{
      const ag = Number(row.agendamento)||0;
      const reu = Number(row.reunioes)||0;
      const conta = Number(row.conta)||0;
      totAg+=ag; totReu+=reu; totConta+=conta;
      const pctComp = ag>0 ? (reu/ag*100) : null;
      const pctAbert = reu>0 ? (conta/reu*100) : null;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(row.nome)}" data-role="nome" style="min-width:140px;"></td>
        <td style="text-align:center;"><input type="checkbox" ${row.sdr?'checked':''} data-role="sdr" style="width:16px;height:16px;"></td>
        <td><input type="number" min="0" value="${ag}" data-role="agendamento" style="width:90px;"></td>
        <td><input type="number" min="0" value="${reu}" data-role="reunioes" style="width:90px;"></td>
        <td>${pctComp===null?'<span class="pct-neutral">—</span>':`<span class="${pctComp>=33?'pct-green':'pct-red'}">${pctComp.toFixed(2).replace('.',',')}%</span>`}</td>
        <td><input type="number" min="0" value="${conta}" data-role="conta" style="width:90px;"></td>
        <td>${pctAbert===null?'<span class="pct-neutral">—</span>':`<span class="${pctAbert>=33?'pct-green':'pct-red'}">${pctAbert.toFixed(2).replace('.',',')}%</span>`}</td>
        <td><button class="mini-x" data-action="del">✕</button></td>
      `;
      ['nome','agendamento','reunioes','conta'].forEach(k=>{
        const inp = tr.querySelector(`[data-role=${k}]`);
        inp.addEventListener('input', e=>{
          row[k] = (k==='nome') ? e.target.value : (Number(e.target.value)||0);
          save();
        });
        inp.addEventListener('change', ()=>{ renderTier3Table(); });
      });
      tr.querySelector('[data-role=sdr]').addEventListener('change', e=>{
        row.sdr = e.target.checked; save();
      });
      tr.querySelector('[data-action=del]').addEventListener('click', ()=>{
        const arr = state.tier3Months[state.tier3MonthKey];
        const idx = arr.indexOf(row);
        if(idx>-1) arr.splice(idx,1);
        save(); renderTier3Table();
      });
      tbody.appendChild(tr);
    });

    const tfoot = document.getElementById('tier3Tfoot');
    const pctCompTotal = totAg>0 ? (totReu/totAg*100) : 0;
    const pctAbertTotal = totReu>0 ? (totConta/totReu*100) : 0;
    tfoot.innerHTML = `
      <tr class="tfoot-row">
        <td>Total</td><td></td><td>${totAg}</td><td>${totReu}</td>
        <td><span class="${pctCompTotal>=33?'pct-green':'pct-red'}">${pctCompTotal.toFixed(2).replace('.',',')}%</span></td>
        <td>${totConta}</td>
        <td><span class="${pctAbertTotal>=33?'pct-green':'pct-red'}">${pctAbertTotal.toFixed(2).replace('.',',')}%</span></td>
        <td></td>
      </tr>
    `;
  }
  document.getElementById('btnAddRow3').addEventListener('click', ()=>{
    if(!state.tier3Months[state.tier3MonthKey]) state.tier3Months[state.tier3MonthKey] = [];
    state.tier3Months[state.tier3MonthKey].push({id:uid(), nome:'', sdr:false, agendamento:0, reunioes:0, conta:0});
    save(); renderTier3Table();
  });

  /* ======================= FEE-BASED ======================= */
  function getBracketPct(patrimonio){
    const p = Number(patrimonio)||0;
    const b = state.brackets;
    if(p<=100000) return b[0].pct;
    if(p<=200000) return b[1].pct;
    if(p<=300000) return b[2].pct;
    if(p<=500000) return b[3].pct;
    if(p<=1000000) return b[4].pct;
    return b[5].pct;
  }

  function renderBrackets(){
    const strip = document.getElementById('bracketStrip');
    strip.innerHTML = `<b>Tabela de Porcentagens Automáticas:</b> ` + state.brackets.map((b,i)=>`
      <span class="bs-item">${b.label}: <input type="number" step="0.1" value="${b.pct}" data-bidx="${i}">%</span>
    `).join('<span class="bs-sep">|</span>');
    strip.querySelectorAll('input').forEach(inp=>{
      inp.addEventListener('input', e=>{
        const i = Number(e.target.dataset.bidx);
        state.brackets[i].pct = Number(e.target.value)||0;
        save(); renderFeeConsolidated();
      });
    });
  }

  function renderFeeConsolidated(){
    const wrap = document.getElementById('fbConsolidatedRows');
    wrap.innerHTML = '';
    state.fbClients.forEach(row=>{
      const patrimonio = Number(row.patrimonio)||0;
      const pct = getBracketPct(patrimonio);
      const feeValue = patrimonio*pct/100;
      const advLabel = row.advisor==='luiz' ? 'Luiz' : 'Guilherme';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="client-code">${escapeHtml(row.codigo)}</span> | ${escapeHtml(row.nome)}
          <span class="advisor-tag ${row.advisor}">${advLabel}</span>
        </td>
        <td>${fmtBRL(patrimonio)}</td>
        <td>${fmtPct(pct)}</td>
        <td><b style="color:var(--teal);">${fmtBRL(feeValue)}</b></td>
        <td><input type="date" class="last-contact-input" value="${escapeHtml(row.lastContact||'')}" data-role="lastContact"></td>
      `;
      tr.querySelector('[data-role="lastContact"]').addEventListener('change', e=>{
        row.lastContact = e.target.value; save();
      });
      wrap.appendChild(tr);
    });
  }

  function renderFeeClients(){
    ['luiz','guilherme'].forEach(adv=>{
      const wrap = document.getElementById(adv==='luiz' ? 'fbRowsLuiz' : 'fbRowsGuilherme');
      wrap.innerHTML = '';
      state.fbClients.filter(r=>r.advisor===adv).forEach(row=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${escapeHtml(row.codigo)}" data-role="codigo" style="width:80px;"></td>
          <td><input type="text" value="${escapeHtml(row.nome)}" data-role="nome" style="min-width:140px;"></td>
          <td><input type="number" min="0" value="${Number(row.patrimonio)||0}" data-role="patrimonio" style="width:110px;"></td>
          <td>
            <select data-role="status">
              <option value="aprovado" ${row.status==='aprovado'?'selected':''}>Aprovado</option>
              <option value="pendente" ${row.status==='pendente'?'selected':''}>Pendente</option>
            </select>
          </td>
          <td><button class="trash-btn" data-action="del" title="Remover" style="width:32px;height:32px;font-size:13px;">🗑</button></td>
        `;
        tr.querySelector('[data-role=codigo]').addEventListener('input', e=>{ row.codigo=e.target.value; save(); renderFeeConsolidated(); });
        tr.querySelector('[data-role=nome]').addEventListener('input', e=>{ row.nome=e.target.value; save(); renderFeeConsolidated(); });
        tr.querySelector('[data-role=patrimonio]').addEventListener('input', e=>{ row.patrimonio=Number(e.target.value)||0; save(); renderFeeConsolidated(); renderFeeDonuts(); });
        tr.querySelector('[data-role=status]').addEventListener('change', e=>{ row.status=e.target.value; save(); renderFeeConsolidated(); renderFeeDonuts(); });
        tr.querySelector('[data-action=del]').addEventListener('click', ()=>{
          state.fbClients = state.fbClients.filter(r=>r.id!==row.id); save(); renderFeeClients(); renderFeeConsolidated(); renderFeeDonuts();
        });
        wrap.appendChild(tr);
      });
    });
  }

  function renderFeeDonuts(){
    const colors = {
      luiz: {aprovado:'#5b6ff0', pendente:'#ec4faa'},
      guilherme: {aprovado:'#2dd4c8', pendente:'#f5a623'},
    };
    ['luiz','guilherme'].forEach(adv=>{
      const clients = state.fbClients.filter(c=>c.advisor===adv);
      const aprovado = clients.filter(c=>c.status==='aprovado').reduce((a,c)=>a+(Number(c.patrimonio)||0),0);
      const pendente = clients.filter(c=>c.status==='pendente').reduce((a,c)=>a+(Number(c.patrimonio)||0),0);
      const segs = [{label:'Aprovado', value:aprovado, color:colors[adv].aprovado},{label:'Pendente', value:pendente, color:colors[adv].pendente}];
      renderDonut('donut'+adv.charAt(0).toUpperCase()+adv.slice(1), segs,
        (total)=>{
          if(total===0) return `<div class="dstatus">Sem dados</div>`;
          return `<div class="dsub">Patrimônio Aprovado</div><div class="dval">${fmtBRL(aprovado)}</div>`;
        });
      const legendEl = document.getElementById('legend'+adv.charAt(0).toUpperCase()+adv.slice(1));
      legendEl.innerHTML = segs.map(s=>`<div class="legend-item"><span class="sw" style="background:${s.color}"></span>${s.label}</div>`).join('');
    });
  }

  document.querySelectorAll('[data-action="addClient"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const adv = btn.dataset.advisor;
      state.fbClients.push({id:uid(), codigo:'', nome:'', patrimonio:0, advisor:adv, status:'pendente', lastContact:''});
      save(); renderFeeClients(); renderFeeConsolidated(); renderFeeDonuts();
    });
  });

  /* ======================= MAPEAMENTO ======================= */

  let openSegRowId = null; // controla qual dropdown de segmento está aberto
  let openStatusRowId = null; // controla qual dropdown de status (observação) está aberto

  document.addEventListener('click', (e)=>{
    let changed = false;
    if(openSegRowId!==null && !e.target.closest('.seg-select-wrap')){
      openSegRowId = null; changed = true;
    }
    if(openStatusRowId!==null && !e.target.closest('.status-select-wrap')){
      openStatusRowId = null; changed = true;
    }
    if(changed) renderMapeamentos();
  });

  function renderMapeamentos(){
    const tbody = document.getElementById('mapTbody');
    tbody.innerHTML = '';
    state.mapeamentos.forEach(row=>{
      // migração leve: garante os novos campos em registros antigos
      if(!Array.isArray(row.perfil)){ row.perfil = row.perfil ? [row.perfil] : []; }
      if(row.codigo===undefined) row.codigo = '';
      if(row.pin===undefined) row.pin = null;
      if(row.status===undefined) row.status = null;

      const isOpen = openSegRowId===row.id;
      const isStatusOpen = openStatusRowId===row.id;
      const statusObj = MAP_STATUS.find(x=>x.key===row.status);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <input type="text" value="${escapeHtml(row.codigo)}" data-role="codigo" placeholder="Código" style="width:64px;flex-shrink:0;">
            <input type="text" value="${escapeHtml(row.nome)}" data-role="nome" placeholder="Nome" style="min-width:110px;flex:1;">
            <div class="pin-group">
              <button type="button" class="pin-btn luiz ${row.pin==='luiz'?'active':''}" data-pin="luiz">Luiz</button>
              <button type="button" class="pin-btn guilherme ${row.pin==='guilherme'?'active':''}" data-pin="guilherme">Guilherme</button>
            </div>
          </div>
        </td>
        <td>
          <div class="seg-select-wrap">
            <div class="seg-field ${isOpen?'open':''}" data-action="toggle-seg">
              ${row.perfil.length
                ? row.perfil.map(k=>{
                    const s = MAP_SEGMENTOS.find(x=>x.key===k);
                    return s ? `<span class="seg-chip ${s.key} active" style="pointer-events:none;">${s.label}</span>` : '';
                  }).join('')
                : '<span class="seg-placeholder">Selecionar...</span>'}
            </div>
            ${isOpen ? `
              <div class="seg-dropdown">
                <div class="seg-dropdown-title">Selecionar opção</div>
                ${MAP_SEGMENTOS.map(s=>`
                  <div class="seg-option" data-seg="${s.key}">
                    <span class="seg-chip ${s.key} ${row.perfil.includes(s.key)?'active':''}" style="pointer-events:none;">${s.label}</span>
                    ${row.perfil.includes(s.key) ? '<span class="seg-check">✓</span>' : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:200px;">
            <div class="status-select-wrap">
              <div class="seg-field ${isStatusOpen?'open':''}" data-action="toggle-status" style="min-width:150px;max-width:220px;">
                ${statusObj
                  ? `<span class="status-chip ${statusObj.key} active" style="pointer-events:none;">${statusObj.label}</span>`
                  : '<span class="seg-placeholder">Selecionar status...</span>'}
              </div>
              ${isStatusOpen ? `
                <div class="seg-dropdown">
                  <div class="seg-dropdown-title">Status do mapeamento</div>
                  ${MAP_STATUS.map(s=>`
                    <div class="seg-option" data-status="${s.key}">
                      <span class="status-chip ${s.key} ${row.status===s.key?'active':''}" style="pointer-events:none;">${s.label}</span>
                      ${row.status===s.key ? '<span class="seg-check">✓</span>' : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            <input type="text" value="${escapeHtml(row.obs)}" data-role="obs" placeholder="Observação">
          </div>
        </td>
        <td><button class="mini-x" data-action="del">✕</button></td>
      `;
      ['codigo','nome','obs'].forEach(k=>{
        tr.querySelector(`[data-role=${k}]`).addEventListener('input', e=>{
          row[k] = e.target.value; save(); renderMapSummary();
        });
      });
      tr.querySelector('[data-action="toggle-seg"]').addEventListener('click', (e)=>{
        e.stopPropagation();
        openSegRowId = isOpen ? null : row.id;
        renderMapeamentos();
      });
      if(isOpen){
        tr.querySelector('.seg-select-wrap').querySelectorAll('.seg-option').forEach(opt=>{
          opt.addEventListener('click', (e)=>{
            e.stopPropagation();
            const seg = opt.dataset.seg;
            if(row.perfil.includes(seg)){
              row.perfil = row.perfil.filter(s=>s!==seg);
            } else {
              row.perfil.push(seg);
            }
            save(); renderMapeamentos();
          });
        });
      }
      tr.querySelector('[data-action="toggle-status"]').addEventListener('click', (e)=>{
        e.stopPropagation();
        openStatusRowId = isStatusOpen ? null : row.id;
        renderMapeamentos();
      });
      if(isStatusOpen){
        tr.querySelector('.status-select-wrap').querySelectorAll('.seg-option').forEach(opt=>{
          opt.addEventListener('click', (e)=>{
            e.stopPropagation();
            const st = opt.dataset.status;
            row.status = (row.status===st) ? null : st;
            save(); renderMapeamentos();
          });
        });
      }
      tr.querySelectorAll('[data-pin]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const pin = btn.dataset.pin;
          row.pin = (row.pin === pin) ? null : pin;
          save(); renderMapeamentos();
        });
      });
      tr.querySelector('[data-action=del]').addEventListener('click', ()=>{
        state.mapeamentos = state.mapeamentos.filter(r=>r.id!==row.id); save(); renderMapeamentos();
      });
      tbody.appendChild(tr);
    });
    renderMapSummary();
  }
  document.getElementById('btnAddMap').addEventListener('click', ()=>{
    state.mapeamentos.push({id:uid(), codigo:'', nome:'', perfil:[], obs:'', pin:null, status:null});
    save(); renderMapeamentos();
  });

  /* ---- resumo visual (donuts + legenda) acima da tabela de mapeamento ---- */
  function renderMapSummary(){
    const rows = state.mapeamentos;
    const total = rows.length;

    document.getElementById('mapSegHint').textContent = total + (total===1?' registro':' registros');
    const luizCount = rows.filter(r=>r.pin==='luiz').length;
    const guiCount = rows.filter(r=>r.pin==='guilherme').length;
    const semPinCount = total - luizCount - guiCount;
    document.getElementById('mapPinHint').textContent = total + (total===1?' registro':' registros');

    // donut por segmento
    const segSegs = MAP_SEGMENTOS.map(s=>({
      label: s.label,
      value: rows.filter(r=>r.perfil.includes(s.key)).length,
      color: s.color,
    }));
    renderDonut('donutMapSeg', segSegs, (t)=>{
      if(t===0) return `<div class="dstatus">Sem dados</div>`;
      return `<div class="dstatus">SEGMENTOS</div>
              <div class="dval">${t}</div>
              <div class="dsub">marcações no total</div>`;
    });

    // donut por assessor fixado
    const pinSegs = [
      {label:'Luiz', value:luizCount, color:'#2dd4c8'},
      {label:'Guilherme', value:guiCount, color:'#8b5cf6'},
      {label:'Sem responsável', value:semPinCount, color:'#26365c'},
    ];
    renderDonut('donutMapPin', pinSegs, (t)=>{
      if(t===0) return `<div class="dstatus">Sem dados</div>`;
      return `<div class="dstatus">FIXADOS</div>
              <div class="dval">${luizCount+guiCount}/${t}</div>
              <div class="dsub">com assessor</div>`;
    });

    // donut por status
    const semStatusCount = rows.filter(r=>!r.status).length;
    const statusSegs = [
      ...MAP_STATUS.map(s=>({label:s.label, value:rows.filter(r=>r.status===s.key).length, color:s.color})),
      {label:'Sem status', value:semStatusCount, color:'#26365c'},
    ];
    document.getElementById('mapStatusHint').textContent = total + (total===1?' registro':' registros');
    renderDonut('donutMapStatus', statusSegs, (t)=>{
      if(t===0) return `<div class="dstatus">Sem dados</div>`;
      const concluidoCount = rows.filter(r=>r.status==='concluido').length;
      return `<div class="dstatus">CONCLUÍDOS</div>
              <div class="dval">${concluidoCount}/${t}</div>
              <div class="dsub">do total</div>`;
    });
  }

  /* ======================= BACKUP: EXPORTAR / IMPORTAR ======================= */
  document.getElementById('btnExportData').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = now.toISOString().slice(0,10);
    a.href = url;
    a.download = `backup-dashboard-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('btnImportData').addEventListener('click', ()=>{
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const imported = JSON.parse(ev.target.result);
        if(!confirm('Importar este backup vai substituir todos os dados atuais deste dashboard. Continuar?')) return;
        state = Object.assign({}, defaultState, imported);
        save();
        initAll();
        alert('Backup importado com sucesso!');
      }catch(err){
        alert('Não foi possível ler este arquivo. Verifique se é um backup válido (.json) exportado por este dashboard.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  /* ======================= INIT ======================= */
  function initAll(){
    renderAdvisorDatalist();
    renderAttSection();
    renderMetas();
    renderTier3Profiles();
    renderTier3Table();
    renderBrackets();
    renderFeeClients();
    renderFeeConsolidated();
    renderFeeDonuts();
    renderMapeamentos();
  }
  initAll();

})();
