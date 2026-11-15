const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes, createHash } = require('node:crypto');
const requireServer = createRequire('/workspace/Drop-Share/server/package.json');
requireServer('dotenv').config({ path: '/workspace/Drop-Share/server/.env', quiet: true });
const { PrismaClient } = requireServer('@prisma/client');
const AdmZip = requireServer('adm-zip');
const dbUrl = new URL(process.env.DATABASE_URL);
assert.equal(dbUrl.hostname, '127.0.0.1');
assert.equal(dbUrl.port, '3307');
assert.equal(dbUrl.pathname, '/drop_share_dev');
assert.equal(dbUrl.username, 'drop_dev');
assert.equal(process.env.AUTH_PROVIDER, 'legacy');
const base = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
assert.equal(base.port, '4000');
const root = path.resolve('/workspace/Drop-Share/server', process.env.UPLOAD_ROOT);
assert.equal(root, '/workspace/Drop-Share/server/storage');
const prisma = new PrismaClient();
const marker = `smoke_${randomBytes(6).toString('hex')}`;
const ids = new Set();
const directories = new Set();
let userId, spaceId;
let checks = 0;
function passed(label) { checks++; console.log(`PASS ${label}`); }
async function request(route, options = {}, status = 200) {
  const res = await fetch(new URL(route, base), { ...options, signal: AbortSignal.timeout(15000) });
  assert.equal(res.status, status, `${options.method || 'GET'} ${route}: ${res.status}`);
  return res;
}
function json(data, token) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) };
}
function upload(files, fields = {}, token) {
  const body = new FormData();
  for (const [name, content] of files) {
    body.append('files', new Blob([content]), path.basename(name));
    body.append('paths', name);
  }
  for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
  return { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} };
}
async function record(id, expected = {}) {
  ids.add(id);
  const row = await prisma.deployment.findUniqueOrThrow({ where: { id } });
  for (const field of ['rootPath', 'previousRootPath']) if (row[field]) {
    const relative = path.relative(root, row[field]);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    directories.add(row[field]);
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value);
  return row;
}
async function preview(row, expected, asset = '') {
  const res = await request(`/p/${row.publicSlug}/${asset}?preview=1`);
  assert.equal(await res.text(), expected);
  assert.equal(await fs.readFile(path.join(row.rootPath, asset || 'index.html'), 'utf8'), expected);
}
async function main() {
  assert.deepEqual(await (await request('/api/health')).json(), { ok: true });
  passed('real backend health');
  const html = `<!doctype html><html><body><h1>${marker}</h1></body></html>`;
  const anon = await (await request('/api/deployments/anonymous', upload([['demo.html', html]], { title: marker }), 201)).json();
  const anonymous = await record(anon.id, { ownerUserId: null, spaceId: null });
  assert.equal(anon.url, `${base.origin}/p/${anonymous.publicSlug}`);
  await preview(anonymous, html);
  assert.ok(Math.abs(new Date(anonymous.expiresAt) - Date.now() - 86400000) < 30000);
  passed('anonymous HTML upload, MySQL record, disk contents, preview and 1-day retention');
  await request('/api/deployments', upload([['demo.html', html]], { durationDays: 1 }), 401);
  passed('authenticated upload rejects anonymous requests');
  const password = randomBytes(20).toString('hex');
  const account = await (await request('/api/auth/register', json({ username: marker, password }), 201)).json();
  userId = account.user.id;
  const login = await (await request('/api/auth/login', json({ username: marker, password }))).json();
  const token = login.token;
  assert.equal(login.user.id, userId);
  passed('development account registration and password login');
  const css = 'body { color: rgb(30, 60, 90); }';
  const folderHtml = `<!doctype html><html><head><link rel="stylesheet" href="assets/site.css"></head><body><h1>${marker} folder</h1></body></html>`;
  const personal = await (await request('/api/deployments', upload([['index.html', folderHtml], ['assets/site.css', css]], { title: marker, durationDays: 2 }, token), 201)).json();
  let work = await record(personal.id, { ownerUserId: userId, spaceId: null });
  await preview(work, folderHtml);
  await preview(work, css, 'assets/site.css');
  assert.ok(Math.abs(new Date(work.expiresAt) - Date.now() - 2 * 86400000) < 30000);
  const list = await (await request('/api/deployments', { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.ok(list.some(item => item.id === work.id));
  passed('authenticated folder upload, nested assets, dashboard listing and 2-day retention');
  const archive = await request(`/api/deployments/${work.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  const zip = new AdmZip(Buffer.from(await archive.arrayBuffer()));
  assert.equal(zip.readAsText('index.html'), folderHtml);
  assert.equal(zip.readAsText('assets/site.css'), css);
  passed('download ZIP preserves HTML and nested asset bytes');
  const updated = `<!doctype html><html><body>${marker} updated</body></html>`;
  await request(`/api/deployments/${work.id}/files`, upload([['updated.html', updated]], {}, token));
  const version = await record(work.id);
  assert.equal(version.publicSlug, work.publicSlug);
  assert.equal(version.previousRootPath, work.rootPath);
  await preview(version, updated);
  await request(`/api/deployments/${work.id}/rollback`, json({}, token));
  work = await record(work.id);
  assert.equal(work.rootPath, version.previousRootPath);
  await preview(work, folderHtml);
  passed('real MySQL transactional file replacement and rollback preserve the public URL');
  const space = await (await request('/api/spaces', json({ name: marker, durationDays: 7 }, token), 201)).json();
  spaceId = space.id;
  const inSpace = await (await request('/api/deployments', upload([['index.html', html]], { title: marker, spaceId }, token), 201)).json();
  const spaceWork = await record(inSpace.id, { ownerUserId: userId, spaceId });
  assert.equal(spaceWork.expiresAt.toISOString(), space.expiresAt);
  await preview(spaceWork, html);
  const entry = await (await request(`/api/spaces/entry/${space.slug}`)).json();
  assert.ok(JSON.stringify(entry).includes(spaceWork.id));
  passed('space upload, inherited expiry and public space listing');
  const visitor = await (await request(`/api/spaces/${spaceId}/deployments`, upload([['visitor.html', html]], { title: `${marker}_visitor` }), 201)).json();
  const visitorWork = await record(visitor.id, { ownerUserId: null, spaceId });
  await preview(visitorWork, html);
  passed('visitor upload to public space persists without a personal owner');
  const batch = await (await request(`/api/spaces/${spaceId}/deployments/batch-upload`, upload([
    ['first/index.html', html], ['first/assets/site.css', css], ['second/index.html', folderHtml],
  ], {}, token), 201)).json();
  for (const item of batch.deployments) ids.add(item.id);
  assert.deepEqual(batch.failures, []);
  assert.equal(batch.count, 2);
  const batchWorks = [];
  for (const item of batch.deployments) {
    const row = await record(item.id, { ownerUserId: userId, spaceId });
    batchWorks.push(row);
    await preview(row, item.title === 'first' ? html : folderHtml);
    if (item.title === 'first') await preview(row, css, 'assets/site.css');
  }
  passed('space batch upload groups two projects with nested files');
  for (const row of [anonymous, work, spaceWork, visitorWork, ...batchWorks]) {
    let thumbnail;
    for (let attempt = 0; attempt < 35; attempt++) {
      const response = await fetch(new URL(`/api/previews/${row.publicSlug}/thumbnail`, base), { signal: AbortSignal.timeout(15000) });
      thumbnail = await response.json();
      if (response.status === 200 && thumbnail.status === 'ready') break;
      assert.equal(response.status, 202, `thumbnail ${row.id}: ${response.status} ${JSON.stringify(thumbnail)}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(thumbnail.status, 'ready');
    const picture = await request(`/api/previews/${row.publicSlug}/thumbnail/image?version=${thumbnail.version}`);
    assert.match(picture.headers.get('content-type'), /image\/webp/);
    assert.ok((await picture.arrayBuffer()).byteLength > 100);
  }
  passed('generated Chromium/WebP thumbnails available for all upload types');
  await request(`/api/deployments/${work.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const deleted = await record(work.id);
  assert.ok(deleted.deletedAt);
  await request(`/p/${work.publicSlug}/`, {}, 404);
  passed('deletion hides the public preview');
}
async function cleanup() {
  // Only fixture IDs created by this run are eligible for cleanup.
  if (ids.size) await prisma.deployment.deleteMany({ where: { id: { in: [...ids] } } });
  if (spaceId) await prisma.space.delete({ where: { id: spaceId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  for (const dir of directories) await fs.rm(dir, { recursive: true, force: true });
  for (const id of ids) await fs.rm(path.join(root, '.thumbnails', createHash('sha256').update(id).digest('hex')), { recursive: true, force: true });
  assert.equal(await prisma.deployment.count({ where: { id: { in: [...ids] } } }), 0);
}
(async () => {
  try { await main(); }
  finally { try { await cleanup(); } finally { await prisma.$disconnect(); } }
  console.log(`Upload verification complete: ${checks} checks passed; fixture records and files cleaned.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
