// public/assets/js/vaers-tables.js
// Build ONE wide table (Manufacturer / Sex / Age) from /data/vaers-summary.json
(function () {
  function onReady(fn){ if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  function fmt(n){ try{return Number(n).toLocaleString();}catch(e){return String(n??'');} }
  function td(txt){ const el=document.createElement('td'); el.textContent=txt; return el; }
  function th(txt, colspan){ const el=document.createElement('th'); el.textContent=txt; if(colspan>1) el.colSpan=colspan; return el; }

  function buildWideTable(root, d){
    const manu = (d?.covid_deaths_breakdowns?.manufacturer)||[];
    const sex  = (d?.covid_deaths_breakdowns?.sex)||[];
    const age  = (d?.covid_deaths_breakdowns?.age_bins)||[];
    const rows = Math.max(manu.length, sex.length, age.length);

    // table element
    const table = document.createElement('table');
    table.className = 'vaers-single-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.background = '#fff';
    table.style.border = '1px solid var(--line)';
    table.style.fontSize = '14px';

    // header
    const thead = document.createElement('thead');
    const tr1 = document.createElement('tr');
    tr1.appendChild(th('Manufacturer',2));
    tr1.appendChild(th('Sex',2));
    tr1.appendChild(th('Age',2));
    thead.appendChild(tr1);

    const tr2 = document.createElement('tr');
    ['Label','Cases','Label','Cases','Label','Cases'].forEach(h=>{
      const hcell = document.createElement('th');
      hcell.textContent = h;
      hcell.style.textAlign = h==='Cases' ? 'right':'left';
      hcell.style.padding = '8px 10px';
      hcell.style.borderBottom = '1px solid var(--line)';
      hcell.style.background = '#fff';
      hcell.style.fontWeight = '600';
      tr2.appendChild(hcell);
    });
    thead.appendChild(tr2);
    table.appendChild(thead);

    // body
    const tbody = document.createElement('tbody');
    for(let i=0;i<rows;i++){
      const tr=document.createElement('tr');
      const m = manu[i]||{};
      const s = sex[i]||{};
      const a = age[i]||{};
      [m.label??'', fmt(m.cases??''), s.label??'', fmt(s.cases??''), a.label??'', fmt(a.cases??'')].forEach((val, idx)=>{
        const cell = td(val);
        cell.style.padding = '8px 10px';
        cell.style.borderTop = '1px solid rgba(0,0,0,0.05)';
        if ((idx%2)===1){ cell.style.textAlign='right'; cell.style.whiteSpace='nowrap'; }
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // responsive collapse for small viewports
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 860px){
        table.vaers-single-table thead tr:first-child{display:none;}
        table.vaers-single-table thead tr:nth-child(2) th {position:sticky; top:0; background:#fff;}
        table.vaers-single-table tr { display:grid; grid-template-columns: 1fr auto; }
        table.vaers-single-table td:nth-child(odd){ font-weight:600; }
        table.vaers-single-table td:nth-child(even){ text-align:right; }
      }
    `;
    root.innerHTML='';
    root.classList.remove('vaers-wide-table');
    root.appendChild(style);
    root.appendChild(table);
  }

  async function load(){
    const root = document.getElementById('vaers-breakdowns');
    if(!root) return;
    try{
      const res = await fetch('/data/vaers-summary.json', { cache:'no-cache' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const d = await res.json();
      buildWideTable(root, d);
    }catch(e){
      console.error('VAERS table failed', e);
    }
  }

  onReady(load);
})();
