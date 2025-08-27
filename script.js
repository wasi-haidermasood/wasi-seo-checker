/* FreeSEO — script.js
   Client-side logic for UI, theme toggle, sending analyze requests to backend,
   building metric cards, and exporting a printable PDF via window.print().

   Notes:
   - Backend endpoint: /api/analyze?url=...
   - You can run the backend server in /backend with "npm install" and "node server.js"
*/

// Utility: create element from template
function createMetricCard(title, score, detailsHTML) {
  const template = document.getElementById('metric-card');
  const node = template.content.cloneNode(true);
  node.querySelector('.metric-title').textContent = title;
  node.querySelector('.metric-score').textContent = score;
  node.querySelector('.metric-details').innerHTML = detailsHTML || '';
  // animate progress
  const bar = node.querySelector('.progress-bar');
  setTimeout(()=> { bar.style.width = Math.max(6, Math.min(100, score)) + '%' }, 50);
  return node;
}

const ui = {
  analyzeBtn: document.getElementById('analyze-btn'),
  sampleBtn: document.getElementById('sample-btn'),
  resultsSection: document.getElementById('results'),
  metricsGrid: document.getElementById('metrics'),
  downloadPdf: document.getElementById('download-pdf'),
  rerunBtn: document.getElementById('rerun'),
  themeToggle: document.getElementById('theme-toggle'),
  manualHtml: document.getElementById('manual-html'),
  analyzeHtmlBtn: document.getElementById('analyze-html-btn'),
  htmlInput: document.getElementById('html-input'),
  linksList: document.getElementById('links-list'),
};

function showResults() {
  ui.resultsSection.classList.remove('hidden');
  ui.manualHtml.classList.remove('hidden');
}

async function analyzeURL(url) {
  ui.metricsGrid.innerHTML = '';
  ui.linksList.innerHTML = '';
  showResults();

  // show loading cards
  const loadingTitles = ['Title & Meta','Headings & Keywords','Images & ALT','Mobile & Viewport','Word count & Density','Links','Readability','Page Speed'];
  loadingTitles.forEach(t => {
    const node = createMetricCard(t, 6, '<em>Running...</em>');
    ui.metricsGrid.appendChild(node);
  });

  try {
    const resp = await fetch('/api/analyze?url=' + encodeURIComponent(url));
    if (!resp.ok) throw new Error('Server error: ' + resp.status);
    const data = await resp.json();
    renderResults(data);
  } catch (err) {
    ui.metricsGrid.innerHTML = '';
    ui.metricsGrid.appendChild(createMetricCard('Error', 0, '<strong>' + escapeHtml(err.message) + '</strong>'));
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>'&#'+c.charCodeAt(0)+';'); }

function renderResults(data){
  ui.metricsGrid.innerHTML = '';

  // Title & Meta
  const titleScore = data.title.ok ? 90 : 40;
  ui.metricsGrid.appendChild(createMetricCard('Page Title', titleScore, `
    <div><strong>Title:</strong> ${escapeHtml(data.title.value || '')}</div>
    <div class="metric-details">Length: ${data.title.length} chars — ${data.title.ok ? '<span style="color:green">Good</span>' : '<span style="color:orange">Fix</span>'}</div>
  `));

  // Meta Description
  const metaScore = data.meta.ok ? 90 : 35;
  ui.metricsGrid.appendChild(createMetricCard('Meta Description', metaScore, `
    <div><strong>Description:</strong> ${escapeHtml(data.meta.value || '')}</div>
    <div class="metric-details">Length: ${data.meta.length} chars — ${data.meta.ok ? '<span style="color:green">Good</span>' : '<span style="color:orange">Fix</span>'}</div>
  `));

  // H1 check
  const h1Score = data.h1.count === 1 ? 90 : (data.h1.count>1?60:20);
  ui.metricsGrid.appendChild(createMetricCard('H1 Tag', h1Score, `
    <div class="metric-details">H1 count: ${data.h1.count}</div>
    <div>H1 Text: ${escapeHtml(data.h1.text || '')}</div>
  `));

  // Images
  const imgScore = data.images.missingAlt === 0 ? 90 : Math.max(30, 90 - data.images.missingAlt*10);
  ui.metricsGrid.appendChild(createMetricCard('Images & ALT', imgScore, `<div class="metric-details">${data.images.total} images — ${data.images.missingAlt} missing ALT</div>`));

  // Mobile
  const mobileScore = data.mobile.viewport ? 95 : 20;
  ui.metricsGrid.appendChild(createMetricCard('Mobile / Viewport', mobileScore, `<div class="metric-details">Viewport meta tag: ${data.mobile.viewport ? 'present' : 'missing'}</div>`));

  // Word count & density
  const wcScore = data.words.count > 300 ? 90 : Math.max(25, Math.round((data.words.count/300)*90));
  ui.metricsGrid.appendChild(createMetricCard('Word Count & Density', wcScore, `<div class="metric-details">Words: ${data.words.count}. Top keywords: ${escapeHtml(JSON.stringify(data.words.top || []).slice(0,200))}</div>`));

  // Links
  const linkScore = data.links.total>0 ? Math.max(30, Math.min(90, 90 - data.links.broken*8)) : 40;
  ui.metricsGrid.appendChild(createMetricCard('Links', linkScore, `<div class="metric-details">Total: ${data.links.total} — Internal: ${data.links.internal} — External: ${data.links.external} — Broken: ${data.links.broken}</div>`));

  // Readability
  const readScore = Math.max(10, Math.min(100, 100 - data.readability.score*8));
  ui.metricsGrid.appendChild(createMetricCard('Readability (Flesch–Kincaid grade)', readScore, `<div class="metric-details">Grade level: ${data.readability.score.toFixed(1)}</div>`));

  // Page speed
  const ps = Math.min(100, Math.round(100 - (data.speed.timing/1000)));
  ui.metricsGrid.appendChild(createMetricCard('Page Speed (est.)', ps, `<div class="metric-details">Server RTT: ${data.speed.timing} ms — HTML size: ${data.speed.size} bytes</div>`));

  // Links list
  ui.linksList.innerHTML = '';
  (data.links.list || []).slice(0,30).forEach(l=>{
    const row = document.createElement('div'); row.className='link-row';
    row.innerHTML = `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.href)}</a><div>${l.status||''}</div>`;
    ui.linksList.appendChild(row);
  });

  // store last result for PDF export
  window.lastAudit = data;
}

// PDF export: create a printable HTML and call print()
document.getElementById('download-pdf').addEventListener('click', ()=>{
  const data = window.lastAudit;
  if(!data){ alert('Run an analysis first'); return; }
  const win = window.open('','_blank','width=900,height=700');
  const html = buildPrintableReport(data);
  win.document.write(html);
  win.document.close();
  // Wait then call print - user will choose "Save as PDF" in browser
  setTimeout(()=>{ win.focus(); win.print(); }, 800);
});

function buildPrintableReport(data){
  const rows = [];
  rows.push(`<h1>FreeSEO Audit Report</h1>`);
  rows.push(`<p><strong>URL:</strong> ${escapeHtml(data.url)} — <strong>Date:</strong> ${new Date().toLocaleString()}</p>`);
  rows.push(`<h2>Summary</h2>`);
  rows.push(`<ul>
    <li>Title: ${escapeHtml(data.title.value || '')} (${data.title.length} chars)</li>
    <li>Meta: ${escapeHtml(data.meta.value || '')} (${data.meta.length} chars)</li>
    <li>H1 count: ${data.h1.count}</li>
    <li>Images: ${data.images.total} (${data.images.missingAlt} missing alt)</li>
    <li>Words: ${data.words.count}</li>
    <li>Links: ${data.links.total} (broken: ${data.links.broken})</li>
    <li>Readability grade: ${data.readability.score.toFixed(1)}</li>
  </ul>`);
  rows.push(`<h2>Top Issues & Recommendations</h2>`);
  const recs = [];
  if(!data.title.ok) recs.push('Improve title length (50–60 chars) and include primary keyword near start.');
  if(!data.meta.ok) recs.push('Add or improve meta description (120–160 chars).');
  if(data.h1.count!==1) recs.push('Ensure exactly one H1 per page with relevant keyword.');
  if(data.images.missingAlt>0) recs.push('Add descriptive alt text to images.');
  if(!data.mobile.viewport) recs.push('Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile.');
  if(data.links.broken>0) recs.push('Fix or remove broken links.');
  rows.push('<ol>' + recs.map(r=>`<li>${r}</li>`).join('') + '</ol>');

  // Links
  rows.push('<h2>Links (first 30)</h2><ol>');
  data.links.list.slice(0,30).forEach(l=> rows.push(`<li>${escapeHtml(l.href)} — ${l.status||'OK'}</li>`));
  rows.push('</ol>');

  const css = `<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111} h1{color:#6b46c1}</style>`;
  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${rows.join('')}</body></html>`;
}

// rerun button
ui.rerunBtn && ui.rerunBtn.addEventListener('click', ()=>{
  document.getElementById('target-url').value = '';
  ui.resultsSection.classList.add('hidden');
});

// sample page (small built-in demo)
document.getElementById('sample-btn').addEventListener('click', ()=>{
  analyzeURL('https://example.com');
});

// analyze button
ui.analyzeBtn.addEventListener('click', ()=>{
  const url = document.getElementById('target-url').value.trim();
  if(!url){ alert('Please enter a URL'); return; }
  analyzeURL(url);
});

// manual HTML analyze
ui.analyzeHtmlBtn && ui.analyzeHtmlBtn.addEventListener('click', async ()=>{
  const html = ui.htmlInput.value.trim();
  if(!html){ alert('Paste HTML first'); return; }
  // send to backend analyze-html endpoint
  const resp = await fetch('/api/analyze-html', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({html})});
  const data = await resp.json();
  renderResults(data);
});

// theme toggle
ui.themeToggle.addEventListener('click', ()=>{
  document.body.classList.toggle('dark');
  document.body.classList.toggle('light');
  ui.themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
});

// initial theme
if(window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches){
  document.body.classList.add('dark');
  ui.themeToggle.textContent = '☀️';
}
