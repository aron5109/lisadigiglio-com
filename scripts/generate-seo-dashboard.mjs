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
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/(_Audit|-audit|^audit-|audits\/.*\.md$)/i.test(path.relative(root, full).replaceAll('\\', '/')) && entry.name.endsWith('.md')) { const real = fs.realpathSync(full); if (!seenAuditFiles.has(real)) { seenAuditFiles.add(real); auditFiles.push(full); } }
  }
}
for (const d of auditDirs) walk(path.join(root, d));
const slug = (s='') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/æ/g,'ae').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const dateFromFrontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return '';
  for (const key of ['date','audited_at','completed_at']) {
    const found = m[1].match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, 'mi'));
    if (found) return found[1].trim();
  }
  return '';
};
const getGitDate = (file) => { try { return execFileSync('git', ['log','-1','--format=%cs','--',file], { encoding:'utf8' }).trim(); } catch { return ''; } };
const headingSection = (text, heading) => {
  const re = new RegExp(`^#{1,3}\\s+${heading}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|\\z)`, 'im');
  return (text.match(re)?.[1] || '').trim();
};
const parseScores = (text) => {
  const scores = {};
  for (const label of ['First 15-second','SEO','UX','Trust','Conversion','Intent match']) {
    const m = text.match(new RegExp(`${label} score:?\\s*([^\\n]+)`, 'i')) || text.match(new RegExp(`${label}[^\\n]*\\nScore:?\\s*([^\\n]+)`, 'i'));
    if (m) scores[label] = m[1].replace(/^[-*]\s*/, '').trim();
  }
  return scores;
};
const audits = auditFiles.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replaceAll('\\','/');
  const frontDate = dateFromFrontmatter(text);
  const gitDate = getGitDate(file);
  const fsDate = fs.statSync(file).mtime.toISOString().slice(0,10);
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s+Audit$/i,'') || path.basename(file, '.md');
  const url = text.match(/^url:\s*([^\n]+)/mi)?.[1]?.trim() || text.match(/Current\/approved URL:?\s*([^\n]+)/i)?.[1]?.trim() || '';
  return { title, url, slug: slug(title.replace(/^LIS\s+/i,'')), file: rel, fileName: path.basename(file), date: frontDate || gitDate || fsDate || '', dateSource: frontDate ? 'frontmatter' : gitDate ? 'git' : fsDate ? 'file system' : 'unavailable', scores: parseScores(text), knownIssues: headingSection(text, 'Priority fixes'), handoffSummary: headingSection(text, 'HANDOFF SUMMARY FOR GPT 3') };
});
const pages = tracker.pages.map((page) => {
  const manual = structuredClone(page);
  const audit = audits.find(a => a.fileName === page.auditFile || (a.url && a.url === page.url) || a.slug.includes(slug(page.title)) || slug(page.title).includes(a.slug));
  if (audit && !['blocked','skipped'].includes(manual.status.audit)) manual.status.audit = 'done';
  if (audit) { manual.auditFile = audit.file; manual.auditDate = audit.date || 'Detected, date unavailable.'; manual.auditDateSource = audit.dateSource; manual.auditDetails = audit; }
  return manual;
});
const generated = { generatedAt: new Date().toISOString(), trackerPath: 'content/seo-overhaul-tracker.json', audits, pages };
fs.mkdirSync(path.join(root,'src/data'), { recursive:true });
fs.writeFileSync(path.join(root,'src/data/seo-overhaul.generated.json'), JSON.stringify(generated,null,2));
fs.mkdirSync(path.join(root,'seo-overhaul-dashboard'), { recursive:true });
fs.writeFileSync(path.join(root,'seo-overhaul-dashboard/data.js'), `window.SEO_OVERHAUL_DATA = ${JSON.stringify(generated,null,2)};\n`);
console.log(`Generated SEO dashboard data for ${pages.length} pages and ${audits.length} audit files.`);
