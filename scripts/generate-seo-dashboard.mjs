import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const trackerPath = path.join(root, 'content/seo-overhaul-tracker.json');
const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const auditDirs = ['', 'audits', 'seo-audits', 'content/audits', 'docs/audits'];
const auditFiles = [];
const seenAuditFiles = new Set();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'node_modules', 'public'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/(_Audit|-audit|^audit-|audits\/.*\.md$)/i.test(path.relative(root, full).replaceAll('\\', '/')) && entry.name.endsWith('.md')) {
      const real = fs.realpathSync(full);
      if (!seenAuditFiles.has(real)) {
        seenAuditFiles.add(real);
        auditFiles.push(full);
      }
    }
  }
}

for (const d of auditDirs) walk(path.join(root, d));

const slug = (s = '') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dateFromFrontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return '';
  for (const key of ['date', 'audited_at', 'completed_at']) {
    const found = m[1].match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, 'mi'));
    if (found) return found[1].trim();
  }
  return '';
};
const getGitDate = (file) => { try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const headingSection = (text, heading) => {
  const re = new RegExp(`^#{1,3}\\s+${heading}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|\\z)`, 'im');
  return (text.match(re)?.[1] || '').trim();
};
const parseScores = (text) => {
  const scores = {};
  for (const label of ['First 15-second', 'SEO', 'UX', 'Trust', 'Conversion', 'Intent match']) {
    const m = text.match(new RegExp(`${label} score:?\\s*([^\\n]+)`, 'i')) || text.match(new RegExp(`${label}[^\\n]*\\nScore:?\\s*([^\\n]+)`, 'i'));
    if (m) scores[label] = m[1].replace(/^[-*]\s*/, '').trim();
  }
  return scores;
};

const audits = auditFiles.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const frontDate = dateFromFrontmatter(text);
  const gitDate = getGitDate(file);
  const fsDate = fs.statSync(file).mtime.toISOString().slice(0, 10);
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s+Audit$/i, '') || path.basename(file, '.md');
  const url = text.match(/^url:\s*([^\n]+)/mi)?.[1]?.trim() || text.match(/Current\/approved URL:?\s*([^\n]+)/i)?.[1]?.trim() || '';
  return { title, url, slug: slug(title.replace(/^LIS\s+/i, '')), file: rel, fileName: path.basename(file), date: frontDate || gitDate || fsDate || '', dateSource: frontDate ? 'frontmatter' : gitDate ? 'git' : fsDate ? 'file system' : 'unavailable', scores: parseScores(text), knownIssues: headingSection(text, 'Priority fixes'), handoffSummary: headingSection(text, 'HANDOFF SUMMARY FOR GPT 3') };
});

const pages = tracker.pages.map((page) => {
  const manual = structuredClone(page);
  const audit = audits.find(a => a.fileName === page.auditFile || (a.url && a.url === page.url) || a.slug.includes(slug(page.title)) || slug(page.title).includes(a.slug));
  if (audit && !['blocked', 'skipped'].includes(manual.status.audit)) manual.status.audit = 'done';
  if (audit) {
    manual.auditFile = audit.file;
    manual.auditDate = audit.date || 'Detected, date unavailable.';
    manual.auditDateSource = audit.dateSource;
    manual.auditDetails = audit;
  }
  return manual;
});

const generated = { generatedAt: new Date().toISOString(), trackerPath: 'content/seo-overhaul-tracker.json', audits, pages };
const dataJs = `window.SEO_OVERHAUL_DATA = ${JSON.stringify(generated, null, 2)};\n`;

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SEO Overhaul Dashboard</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#243028;background:#f6f3ef}body{margin:0}.wrap{max-width:1400px;margin:auto;padding:32px}h1{margin:0 0 8px;font-size:clamp(2rem,4vw,4rem)}a{color:#2e6743}.note,.card,.panel{background:#fff;border:1px solid #ded8cf;border-radius:16px;box-shadow:0 1px 3px #0001}.note{padding:14px 16px;margin:20px 0}.grid{display:grid;gap:14px}.cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:22px 0}.card{padding:18px}.num{font-size:2rem;font-weight:800}.label{color:#6d756d;font-size:.9rem}.bars{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:22px}.bar{height:10px;background:#e7e2da;border-radius:99px;overflow:hidden;margin-top:8px}.fill{height:100%;background:#587d5a}.panel{padding:20px;margin:22px 0;overflow:auto}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.controls input,.controls button{border:1px solid #cfc7bd;border-radius:999px;padding:10px 14px;background:#fff}.controls button.active{background:#243028;color:#fff}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;border-bottom:1px solid #e7e2da;padding:10px;vertical-align:top}th{position:sticky;top:0;background:#fff}tbody tr.page-row{cursor:pointer}tbody tr.page-row:hover{background:#faf8f5}.badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:.75rem;font-weight:700;margin:2px}.done{background:#dcefdc;color:#20612b}.in_progress{background:#dcecff;color:#174d7a}.blocked{background:#ffe0dc;color:#9f2619}.not_started{background:#ece9e4;color:#686868}.skipped{background:#eee;color:#777}.priority-high{color:#9f2619;font-weight:800}.tree ul{list-style:none;border-left:1px solid #ddd;margin-left:12px;padding-left:16px}.tree li{margin:10px 0}.tree-title{font-weight:800}.detail{background:#f9f6f2;border-radius:12px;padding:14px;margin:8px 0;display:none}.detail.open{display:block}.small{font-size:.85rem;color:#626b62}code{background:#eee6dc;padding:2px 5px;border-radius:5px}pre{white-space:pre-wrap}
  </style>
</head>
<body>
<main class="wrap">
  <h1>SEO Overhaul Progress Dashboard</h1>
  <p class="small">Internal tracker for the 4-GPT SEO/UX/content overhaul workflow.</p>
  <div class="note">To update status permanently, edit <code>content/seo-overhaul-tracker.json</code>, add audit Markdown files to <code>docs/audits/</code>, run <code>npm run build</code>, and commit the change.</div>
  <section id="summary" class="grid cards"></section>
  <section id="progress" class="grid bars"></section>
  <section class="panel"><h2>Website tree</h2><div id="tree" class="tree"></div></section>
  <section class="panel"><h2>Pages</h2><div class="controls"><input id="search" placeholder="Search page, URL, keyword, or notes" size="42"><span id="filters"></span></div><table><thead><tr><th>Page</th><th>URL</th><th>Section</th><th>Primary keyword</th><th>Priority</th><th>Audit</th><th>Rewrite</th><th>QA</th><th>Links</th><th>Published</th><th>Audit file</th><th>Last updated</th><th>Next action</th><th>Notes</th></tr></thead><tbody id="rows"></tbody></table></section>
</main>
<script src="data.js"></script>
<script>
const data=window.SEO_OVERHAUL_DATA||{pages:[]}, pages=data.pages, steps=['audit','rewrite','qa','internalLinks','published']; let filter='all', query='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nice=s=>({not_started:'Not started',in_progress:'In progress',done:'Done',blocked:'Blocked',skipped:'Skipped'}[s]||s); const badge=(s,t)=>'<span class="badge '+esc(s)+'">'+esc(t||nice(s))+'</span>';
function pct(n,d){return d?Math.round(n/d*100):0} function done(p,k){return p.status?.[k]==='done'} function blocked(p){return steps.some(k=>p.status?.[k]==='blocked')} function auditHref(p){return p.auditFile?'/'+p.auditFile:''}
function summary(){const total=pages.length, cards=[['Total pages',total],['Audits done',pages.filter(p=>done(p,'audit')).length],['Rewrites done',pages.filter(p=>done(p,'rewrite')).length],['QA done',pages.filter(p=>done(p,'qa')).length],['Internal links done',pages.filter(p=>done(p,'internalLinks')).length],['Published/implemented',pages.filter(p=>done(p,'published')).length],['Blocked pages',pages.filter(blocked).length]]; document.getElementById('summary').innerHTML=cards.map(c=>'<div class="card"><div class="num">'+c[1]+'</div><div class="label">'+c[0]+'</div></div>').join(''); const bars=[['Overall completion',pages.reduce((a,p)=>a+steps.filter(k=>done(p,k)).length,0),total*steps.length],['Audit completion',pages.filter(p=>done(p,'audit')).length,total],['Rewrite completion',pages.filter(p=>done(p,'rewrite')).length,total],['QA completion',pages.filter(p=>done(p,'qa')).length,total],['Publishing completion',pages.filter(p=>done(p,'published')).length,total]]; document.getElementById('progress').innerHTML=bars.map(b=>'<div class="card"><strong>'+b[0]+'</strong><div class="bar"><div class="fill" style="width:'+pct(b[1],b[2])+'%"></div></div><div class="small">'+pct(b[1],b[2])+'% ('+b[1]+'/'+b[2]+')</div></div>').join('')}
function treeFor(parent){const children=pages.filter(p=>(p.parent||null)===parent); return children.length?'<ul>'+children.map(p=>'<li><span class="tree-title">'+esc(p.title)+'</span> <span class="small">'+esc(p.url)+'</span> '+badge(p.status.audit,'Audit')+badge(p.status.rewrite,'Rewrite')+badge(p.status.qa,'QA')+badge(p.status.internalLinks,'Links')+badge(p.status.published,'Published')+treeFor(p.title)+'</li>').join('')+'</ul>':''}
function pass(p){const hay=[p.title,p.url,p.section,p.primaryKeyword,p.notes,p.nextAction].join(' ').toLowerCase(); if(query&&!hay.includes(query))return false; return filter==='all'||(filter==='needs_audit'&&!done(p,'audit')&&!['blocked','skipped'].includes(p.status.audit))||(filter==='needs_rewrite'&&!done(p,'rewrite'))||(filter==='needs_qa'&&!done(p,'qa'))||(filter==='needs_links'&&!done(p,'internalLinks'))||(filter==='needs_publishing'&&!done(p,'published'))||(filter==='done'&&steps.every(k=>done(p,k)))||(filter==='blocked'&&blocked(p))||(filter==='high'&&p.priority==='high')}
function detail(p){const a=p.auditDetails||{}, href=auditHref(p); return '<tr class="detail-row"><td colspan="14"><div class="detail"><strong>'+esc(p.title)+' details</strong><p><b>URL:</b> '+esc(p.url)+' · <b>Parent:</b> '+esc(p.parent||'None')+' · <b>Keyword:</b> '+esc(p.primaryKeyword)+'</p><p>'+steps.map(k=>badge(p.status[k],k==='internalLinks'?'Internal links':k)).join(' ')+'</p><p><b>Audit file:</b> '+(href?'<a href="'+esc(href)+'">'+esc(p.auditFile)+'</a>':'None detected')+' · <b>Audit date:</b> '+esc(p.auditDate||'—')+'</p><p><b>Next action:</b> '+esc(p.nextAction||'—')+'</p><p><b>Notes:</b> '+esc(p.notes||'—')+'</p>'+(a.knownIssues?'<p><b>Known issues:</b></p><pre>'+esc(a.knownIssues)+'</pre>':'')+(a.scores&&Object.keys(a.scores).length?'<p><b>Scores:</b> '+Object.entries(a.scores).map(([k,v])=>esc(k)+': '+esc(v)).join(' · ')+'</p>':'')+(a.handoffSummary?'<p><b>GPT 3 handoff:</b></p><pre>'+esc(a.handoffSummary)+'</pre>':'')+'</div></td></tr>'}
function render(){document.getElementById('tree').innerHTML=treeFor(null); const visible=pages.filter(pass); document.getElementById('rows').innerHTML=visible.map(p=>'<tr class="page-row"><td><b>'+esc(p.title)+'</b></td><td>'+esc(p.url)+'</td><td>'+esc(p.section)+'</td><td>'+esc(p.primaryKeyword)+'</td><td class="priority-'+esc(p.priority)+'">'+esc(p.priority)+'</td><td>'+badge(p.status.audit)+'</td><td>'+badge(p.status.rewrite)+'</td><td>'+badge(p.status.qa)+'</td><td>'+badge(p.status.internalLinks)+'</td><td>'+badge(p.status.published)+'</td><td>'+(auditHref(p)?'<a href="'+esc(auditHref(p))+'">'+esc(p.auditFile.split('/').pop())+'</a>':'—')+'</td><td>'+esc(p.auditDate||'—')+'</td><td>'+esc(p.nextAction||'—')+'</td><td>'+esc(p.notes||'—')+'</td></tr>'+detail(p)).join(''); document.querySelectorAll('tr.page-row').forEach(tr=>tr.addEventListener('click',()=>tr.nextElementSibling.querySelector('.detail').classList.toggle('open')))}
const filters=[['all','All'],['needs_audit','Needs audit'],['needs_rewrite','Needs rewrite'],['needs_qa','Needs QA'],['needs_links','Needs internal links'],['needs_publishing','Needs publishing'],['done','Done'],['blocked','Blocked'],['high','High priority']]; document.getElementById('filters').innerHTML=filters.map(f=>'<button data-f="'+f[0]+'" class="'+(f[0]==='all'?'active':'')+'">'+f[1]+'</button>').join(''); document.getElementById('filters').addEventListener('click',e=>{if(e.target.dataset.f){filter=e.target.dataset.f; document.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.f===filter)); render()}}); document.getElementById('search').addEventListener('input',e=>{query=e.target.value.toLowerCase(); render()}); summary(); render();
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/data/seo-overhaul.generated.json'), JSON.stringify(generated, null, 2));
fs.mkdirSync(path.join(root, 'seo-overhaul-dashboard'), { recursive: true });
fs.writeFileSync(path.join(root, 'seo-overhaul-dashboard/data.js'), dataJs);
fs.writeFileSync(path.join(root, 'seo-overhaul-dashboard/index.html'), dashboardHtml);

fs.rmSync(path.join(root, 'public'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'public/seo-overhaul-dashboard'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/data.js'), dataJs);
fs.writeFileSync(path.join(root, 'public/index.html'), dashboardHtml);
fs.writeFileSync(path.join(root, 'public/seo-overhaul-dashboard/index.html'), dashboardHtml);
fs.copyFileSync(path.join(root, 'public/data.js'), path.join(root, 'public/seo-overhaul-dashboard/data.js'));

const sourceAudits = path.join(root, 'docs/audits');
const publicAudits = path.join(root, 'public/docs/audits');
if (fs.existsSync(sourceAudits)) {
  fs.mkdirSync(publicAudits, { recursive: true });
  fs.cpSync(sourceAudits, publicAudits, { recursive: true });
}

console.log(`Generated SEO dashboard data for ${pages.length} pages and ${audits.length} audit files.`);
console.log('Wrote deployable static dashboard to public/.');
