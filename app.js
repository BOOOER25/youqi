(() => {
  'use strict';
  const root = document.getElementById('medicine-tool'), images = window.YouqiImages;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const PRESETS = ['药品', '厨房', '日化', '其他'], THRESHOLD = 30, KEY = 'youqi-v1-';
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number), v = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9998 && v.getFullYear() === y && v.getMonth() === m - 1 && v.getDate() === d ? v : null;
  }
  const today = () => parseDate(dateKey(new Date()));
  const ordinal = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const days = s => ordinal(parseDate(s)) - ordinal(today());
  const shift = (d, n) => { const v = new Date(d); v.setDate(v.getDate() + n); return v; };
  const fmt = s => s.replace(/-/g, '.');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let storageAvailable = true;
  function read(key) { try { return JSON.parse(localStorage.getItem(KEY + key) || 'null'); } catch { storageAvailable = false; return null; } }
  function write(key, value) { try { localStorage.setItem(KEY + key, JSON.stringify(value)); return true; } catch { storageAvailable = false; return false; } }
  function normalizeNotes(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 1000) throw new Error('每件物品最多保存 1000 条备注');
    const ids = new Set();
    return value.map(n => {
      if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 100 || ids.has(n.id) || typeof n.text !== 'string' || !n.text.trim() || n.text.length > 1000 || typeof n.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(n.createdAt) || !Number.isFinite(Date.parse(n.createdAt))) throw new Error('备注记录格式不正确');
      if (new Date(n.createdAt).toISOString() !== n.createdAt) throw new Error('备注时间不正确');
      ids.add(n.id);
      return { id: n.id, text: n.text, createdAt: n.createdAt };
    });
  }
  function normalizeItem(x) {
    if (!x || typeof x.id !== 'string' || !x.id.length || x.id.length > 100 || typeof x.name !== 'string' || !x.name.trim() || x.name.length > 80 || !parseDate(x.expiry)) throw new Error('记录的名称或有效期不正确');
    if (!Array.isArray(x.tags) || x.tags.length < 1 || x.tags.length > 8 || !x.tags.every(t => typeof t === 'string' && t.trim().length > 0 && t.length <= 16)) throw new Error('最多填写 8 个标签，每个标签不超过 16 字');
    if (x.identifier != null && typeof x.identifier !== 'string') throw new Error('唯一标识需使用字符串');
    return { id: x.id, name: x.name.trim(), expiry: x.expiry, tags: [...new Set(x.tags.map(t => t.trim()))], location: String(x.location || '').slice(0, 50), note: String(x.note || '').slice(0, 100), notes: normalizeNotes(x.notes), identifier: x.identifier ?? '', imageId: typeof x.imageId === 'string' && x.imageId.length <= 100 ? x.imageId : null, ...(x.sampleImageInitialized === true ? { sampleImageInitialized: true } : {}), archived: x.archived === true, reason: x.reason === 'used' ? 'used' : 'disposed', added: parseDate(x.added) ? x.added : dateKey(today()) };
  }
  function normalizeState(s) {
    if (!s || s.version !== 1 || !Array.isArray(s.items) || s.items.length > 2000) throw new Error('请选择有期导出的 JSON 备份文件');
    const items = s.items.map(normalizeItem);
    if (new Set(items.map(x => x.id)).size !== items.length) throw new Error('备份存在重复的内部记录编号');
    return { version: 1, items };
  }
  function demoState() {
    const demoTime = (offset, hour, minute) => { const d = shift(today(), offset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
    const demoNotes = [{ id: 'sample-note-1', text: '整理药箱，检查包装完整。', createdAt: demoTime(-2, 10, 15) }, { id: 'sample-note-2', text: '放在客厅药箱第二层，方便下次查找。', createdAt: demoTime(-1, 18, 30) }];
    const seed = [['氯雷他定片', -8, '药品', '客厅药箱', '片剂 · 1盒'], ['布洛芬缓释胶囊', 7, '药品', '客厅药箱', '胶囊 · 1盒'], ['维生素 C 片', 25, '药品', '卧室抽屉', '片剂 · 1瓶'], ['碘伏消毒液', 140, '药品', '客厅药箱', '外用 · 1瓶'], ['蒙脱石散', 240, '药品', '客厅药箱', '散剂 · 1盒'], ['医用退热贴', 310, '药品', '儿童用品柜', '护理用品 · 1盒'], ['原味酸奶', 3, '厨房', '冰箱冷藏层', '未开封 · 4杯'], ['意大利面', 95, '厨房', '厨房储物柜', '500克 · 1袋'], ['防晒乳', 20, '日化', '卧室梳妆台', '未开封 · 1支'], ['一次性口罩', 180, '其他', '玄关抽屉', '未开封 · 1盒']];
    return { version: 1, items: seed.map((x, i) => normalizeItem({ id: `sample-${i}`, name: x[0], expiry: dateKey(shift(today(), x[1])), tags: [x[2]], location: x[3], note: x[4], notes: i === 1 ? demoNotes : [] })) };
  }
  function enrichDemo(collection) {
    return { ...collection, items: collection.items.map(item => {
      const match = /^sample-([0-9])$/.exec(item.id);
      if (!match) return item;
      const index = Number(match[1]), next = { ...item, imageId: item.imageId || (item.sampleImageInitialized ? null : `youqi-demo-photo-v1-${index}`), sampleImageInitialized: true };
      if (item.note) {
        // Explicitly fictional timestamps apply only to the built-in demo collection.
        const id = `sample-legacy-note-${index}`, existing = item.notes.find(n => n.id === id);
        const date = new Date(2026, 10, 18 + Math.floor(index / 3), 9 + index % 3, 12 + index * 3);
        if (!existing || existing.text !== item.note) next.notes = [...item.notes, { id: existing ? uid() : id, text: item.note, createdAt: date.toISOString() }];
        next.note = '';
      }
      return next;
    }) };
  }
  // Show examples by default once, while preserving personal data and later explicit choices.
  const savedMode = read('mode'), personal = read('personal'), demoDefaultApplied = read('demo-default-v1') === true;
  const hasPersonalRecords = personal && (!Array.isArray(personal.items) || personal.items.length > 0);
  let mode = savedMode === 'demo' ? 'demo' : hasPersonalRecords || (demoDefaultApplied && savedMode === 'personal') ? 'personal' : 'demo';
  if (!demoDefaultApplied && write('mode', mode)) write('demo-default-v1', true);
  function loadMode() {
    const stored = read(mode);
    try {
      const collection = stored ? normalizeState(stored) : mode === 'demo' ? demoState() : { version: 1, items: [] };
      return mode === 'demo' ? enrichDemo(collection) : collection;
    }
    catch { storageAvailable = false; return { version: 1, items: [] }; }
  }
  let state = loadMode(), selectedTag = '药品', filter = 'all', query = '', toastTimer, previousFocus, dialogCleanup;
  function save(next = state) {
    if (!write(mode, next)) { toast('保存失败：浏览器存储不可用或已满，请先导出备份'); return false; }
    state = next; write('mode', mode); render(); return true;
  }
  async function hydrate() { await Promise.all([...new Set(state.items.map(x => x.imageId).filter(Boolean))].map(id => images.get(id).catch(() => null))); render(); }
  const allTags = () => [...new Set([...PRESETS, ...state.items.flatMap(x => x.tags)])];
  const tagItems = () => state.items.filter(m => selectedTag === '全部' || m.tags.includes(selectedTag));
  const stateOf = m => m.archived ? 'archived' : days(m.expiry) < 0 ? 'expired' : days(m.expiry) <= THRESHOLD ? 'soon' : 'normal';
  function statusLabel(m) {
    const n = days(m.expiry);
    return m.archived ? m.reason === 'used' ? '已用完' : '已处理' : n < 0 ? `已过期 ${-n} 天` : n === 0 ? '今天到期' : n <= THRESHOLD ? `剩余 ${n} 天` : '有效期内';
  }
  function thumbnail(m) {
    const source = images.url(m.imageId);
    return `<span class="mt-drug-icon ${stateOf(m)}" aria-hidden="true">${source ? `<img src="${esc(source)}" alt="">` : m.tags.includes('药品') ? '<span class="mt-pill"></span>' : `<span class="yq-item-letter">${esc(m.tags[0].slice(0, 1))}</span>`}</span>`;
  }
  function render() {
    const active = tagItems().filter(m => !m.archived), soon = active.filter(m => stateOf(m) === 'soon'), expired = active.filter(m => stateOf(m) === 'expired'), count = soon.length + expired.length;
    $('#yq-mode').hidden = mode !== 'demo'; $('#mt-date').textContent = fmt(dateKey(today()));
    $('#yq-list-heading').textContent = selectedTag === '药品' ? '我的药箱' : selectedTag === '全部' ? '我的物品' : `${selectedTag}记录`;
    $('#yq-overview-tag').textContent = selectedTag === '药品' ? '家庭药箱 · 药品优先' : selectedTag === '全部' ? '日常物品 · 一起记好' : `${selectedTag} · 有效期记录`;
    $('#mt-total-count').textContent = active.length; $('#mt-soon-count').textContent = soon.length; $('#mt-expired-count').textContent = expired.length;
    $('#mt-overview-title').textContent = count ? `有 ${count} 件${selectedTag === '药品' ? '药品' : '物品'}需要关注` : active.length ? '有效期都记好了，安心一点' : '记下第一份有效期';
    $('#mt-overview-note').textContent = selectedTag === '药品' ? '定期整理小药箱，给家人多一份安心。' : '从药品到厨房，少一点遗忘，多一点从容。';
    $('#yq-tags').innerHTML = ['全部', ...allTags()].map(t => `<button class="yq-tag${t === selectedTag ? ' is-selected' : ''}" data-tag="${esc(t)}" aria-pressed="${t === selectedTag}">${t === '药品' ? '<span aria-hidden="true">✚</span> ' : ''}${esc(t)}${t === '药品' ? '<small>推荐</small>' : ''}</button>`).join('');
    $$('.mt-tab').forEach(b => { b.classList.toggle('is-active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); if (b.dataset.filter === 'attention') b.hidden = filter !== 'attention'; });
    const visible = tagItems().filter(m => {
      const status = stateOf(m), match = filter === 'all' ? !m.archived : filter === 'attention' ? ['soon', 'expired'].includes(status) : filter === 'archived' ? m.archived : status === filter;
      return match && `${m.name} ${m.identifier} ${m.location} ${m.tags.join(' ')} ${m.note} ${m.notes.map(n => n.text).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    }).sort((a, b) => a.expiry.localeCompare(b.expiry));
    $('#mt-list').innerHTML = visible.length ? visible.map(m => `<article class="mt-medicine-row"><button class="yq-card-open" data-id="${esc(m.id)}" aria-label="查看${esc(m.name)}，${esc(statusLabel(m))}"><span class="yq-card-content">${thumbnail(m)}<span class="mt-drug-main"><span class="mt-drug-name">${esc(m.name)}</span><span class="mt-drug-meta">${esc(m.tags.join(' / '))}${m.location ? ` · ${esc(m.location)}` : ''}</span>${m.identifier ? `<span class="yq-row-identifier">${esc(m.identifier)}</span>` : ''}</span><span class="mt-row-chevron" aria-hidden="true">›</span></span><span class="mt-drug-status"><span class="mt-expiry">有效期至 <b>${fmt(m.expiry)}</b></span><span class="mt-badge ${stateOf(m)}">${esc(statusLabel(m))}</span></span></button>${images.url(m.imageId) ? `<button class="yq-thumbnail-zoom" data-image-id="${esc(m.id)}" aria-label="放大${esc(m.name)}的图片"><span aria-hidden="true">↗</span></button>` : ''}</article>`).join('') : `<div class="mt-empty"><strong>${query ? '没有找到相关物品' : filter === 'archived' ? '还没有归档记录' : '这里暂时没有记录'}</strong>${query ? '试试其他名称、标识或标签' : filter === 'archived' ? '用完或处理后的记录会保存在这里' : '点击新增，把第一份有效期记下来。'}</div>`;
    $('#mt-visible-count').textContent = `共 ${visible.length} 件`;
  }
  function toast(message) { clearTimeout(toastTimer); $('#mt-toast').textContent = message; $('#mt-toast').hidden = false; toastTimer = setTimeout(() => { $('#mt-toast').hidden = true; }, 4000); }
  function openDialog(title, content) {
    dialogCleanup?.(); dialogCleanup = null;
    if ($('#mt-overlay').hidden) previousFocus = document.activeElement;
    $('#mt-dialog').classList.remove('yq-image-dialog');
    $('#mt-dialog-title').textContent = title; $('#mt-dialog-body').innerHTML = content; $('#mt-overlay').hidden = false; $('.mt-app').inert = true; document.body.style.overflow = 'hidden';
    $('#mt-dialog').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    ($('#mt-dialog-body').querySelector('input:not([type="file"]),button,select,textarea') || $('#mt-dialog-close')).focus({ preventScroll: true });
  }
  function closeDialog() {
    dialogCleanup?.(); dialogCleanup = null; $('#mt-overlay').hidden = true; $('#mt-dialog-body').innerHTML = ''; $('.mt-app').inert = false; document.body.style.overflow = '';
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); else $('#mt-add').focus({ preventScroll: true });
  }
  $('#mt-dialog-close').onclick = closeDialog;
  $('#mt-overlay').onclick = e => { if (e.target === $('#mt-overlay')) closeDialog(); };
  root.addEventListener('keydown', e => {
    if ($('#mt-overlay').hidden) return;
    if (e.key === 'Escape') closeDialog();
    if (e.key === 'Tab') {
      const targets = [...$('#mt-dialog').querySelectorAll('button,input,select,textarea,a')].filter(x => !x.disabled && !x.closest('[hidden]') && x.type !== 'file');
      if (e.shiftKey && document.activeElement === targets[0]) { e.preventDefault(); targets.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === targets.at(-1)) { e.preventDefault(); targets[0].focus(); }
    }
  });
  $$('[data-filter]').forEach(b => { b.onclick = () => { filter = b.dataset.filter; render(); }; });
  $('#yq-tags').onclick = e => { const b = e.target.closest('[data-tag]'); if (b) { selectedTag = b.dataset.tag; filter = 'all'; render(); } };
  $('#mt-focus').onclick = () => { filter = 'attention'; render(); $('.mt-list-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); };
  $('#mt-search').oninput = e => { query = e.target.value; render(); };
  $('#mt-list').onclick = e => {
    const photo = e.target.closest('[data-image-id]');
    if (photo) { viewImage(photo.dataset.imageId); return; }
    const b = e.target.closest('[data-id]'); if (b) detail(b.dataset.id);
  };
  function notesTimeline(m) {
    const groups = new Map();
    // Sort a copy: editing other fields must never reorder the saved note history.
    for (const n of [...m.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const date = new Date(n.createdAt), key = dateKey(date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...n, clock: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` });
    }
    const history = [...groups].map(([day, notes]) => `<section class="yq-note-day"><h4><time datetime="${day}">${fmt(day)}</time></h4><ol>${notes.map(n => `<li><time datetime="${n.createdAt}">${n.clock}</time><p>${esc(n.text)}</p></li>`).join('')}</ol></section>`).join('');
    // Legacy notes have no creation timestamp; do not invent a time during migration.
    const legacy = m.note ? `<section class="yq-note-day yq-note-legacy"><h4>原有备注 <small>时间未记录</small></h4><p>${esc(m.note)}</p></section>` : '';
    return history + legacy || '<p class="yq-notes-empty">还没有备注，记下规格、数量或整理情况吧。</p>';
  }
  function viewImage(id) {
    const m = state.items.find(x => x.id === id), photo = m && images.url(m.imageId);
    if (!photo) return;
    openDialog('查看图片', `<div class="yq-image-stage"><img src="${esc(photo)}" alt="${esc(m.name)}"></div><p class="yq-image-caption">${esc(m.name)}</p><div class="mt-form-actions"><button class="mt-button mt-quiet" id="yq-image-back">返回详情</button>${m.archived ? '' : '<button class="mt-button mt-primary" id="yq-image-edit">编辑物品</button>'}</div>`);
    $('#mt-dialog').classList.add('yq-image-dialog');
    $('#yq-image-back').onclick = () => detail(id);
    if (!m.archived) $('#yq-image-edit').onclick = () => edit(m);
  }
  function detail(id) {
    const m = state.items.find(x => x.id === id); if (!m) return;
    const photo = images.url(m.imageId);
    openDialog('物品详情', `${photo ? `<button class="yq-detail-image" id="yq-photo-enlarge" aria-label="放大${esc(m.name)}的图片"><img src="${esc(photo)}" alt="${esc(m.name)}"><span>${esc(images.kind(m.imageId))} · 点击放大图片 ↗</span></button>` : ''}<div class="mt-detail-top">${photo ? '' : thumbnail(m)}<div><div class="mt-detail-name">${esc(m.name)}</div><span class="mt-badge ${stateOf(m)}">${esc(statusLabel(m))}</span></div></div><dl class="mt-detail-fields"><div><dt>标签</dt><dd>${esc(m.tags.join(' / '))}</dd></div><div><dt>有效期至</dt><dd>${fmt(m.expiry)}</dd></div><div><dt>唯一标识</dt><dd class="yq-identifier-value">${m.identifier ? esc(m.identifier) : '未填写'}</dd></div><div><dt>存放位置</dt><dd>${esc(m.location || '未填写')}</dd></div></dl><section class="yq-notes" aria-labelledby="yq-notes-title"><div class="yq-notes-heading"><h3 id="yq-notes-title">备注记录</h3><span>最新在前</span></div><form id="yq-note-form"><label class="mt-field" for="yq-note-text"><span>添加备注</span><textarea id="yq-note-text" rows="3" maxlength="1000" required placeholder="写下规格、数量或这次整理的情况…"></textarea></label><div class="yq-note-submit"><span>保存时自动记录日期和时间</span><button class="mt-button mt-primary" type="submit">添加备注</button></div><p id="yq-note-error" class="mt-error" role="alert" hidden></p></form><div id="yq-note-timeline" class="yq-note-timeline">${notesTimeline(m)}</div></section><div class="mt-detail-actions">${m.archived ? '<button class="mt-button mt-primary" id="yq-restore">恢复记录</button>' : '<button class="mt-button mt-primary" id="yq-edit">编辑记录</button><button class="mt-button mt-secondary" id="yq-used">已用完</button><button class="mt-button mt-secondary" id="yq-disposed">已处理</button>'}</div>`);
    if (photo) $('#yq-photo-enlarge').onclick = () => viewImage(id);
    $('#yq-note-form').onsubmit = e => {
      e.preventDefault();
      const input = $('#yq-note-text'), text = input.value.trim(), current = state.items.find(x => x.id === id);
      if (!text) { input.setCustomValidity('请先填写备注内容'); input.reportValidity(); return; }
      if (!current) return;
      const error = $('#yq-note-error'); error.hidden = true;
      if (current.notes.length >= 1000) { error.textContent = '这件物品已保存 1000 条备注，请先导出备份'; error.hidden = false; return; }
      const nextItem = { ...current, notes: [...current.notes, { id: uid(), text, createdAt: new Date().toISOString() }] };
      if (save({ ...state, items: state.items.map(x => x.id === id ? nextItem : x) })) {
        $('#yq-note-timeline').innerHTML = notesTimeline(nextItem); input.value = ''; input.focus({ preventScroll: true }); toast('备注已添加');
      }
    };
    $('#yq-note-text').oninput = e => e.target.setCustomValidity('');
    if (m.archived) { $('#yq-restore').onclick = () => { if (save({ ...state, items: state.items.map(x => x.id === id ? { ...x, archived: false } : x) })) { closeDialog(); toast('记录已恢复'); } }; return; }
    $('#yq-edit').onclick = () => edit(state.items.find(x => x.id === id));
    for (const [button, reason] of [['#yq-used', 'used'], ['#yq-disposed', 'disposed']]) $(button).onclick = () => { if (save({ ...state, items: state.items.map(x => x.id === id ? { ...x, archived: true, reason } : x) })) { closeDialog(); toast('已移入归档'); } };
  }
  function edit(existing) {
    const primaryTag = existing?.tags[0] || (selectedTag === '全部' ? '药品' : selectedTag);
    const m = existing || { name: '', expiry: '', location: '', note: '', identifier: '', tags: [primaryTag] };
    openDialog(existing ? '编辑物品' : '添加物品', `<form id="yq-item-form">
      <div class="yq-photo-field"><span class="yq-photo-label">物品图片 <small>选填</small></span><div class="yq-photo-layout"><button type="button" class="yq-photo-preview" id="yq-photo-choose" aria-label="上传物品图片"><span class="yq-photo-placeholder"><b>＋</b>上传图片</span><img id="yq-photo-preview-image" alt="物品图片预览" hidden></button><div class="yq-photo-copy"><p>上传后自动抠图</p><small>支持 JPG、PNG、WebP</small><div id="yq-photo-actions" class="yq-photo-actions" hidden><button type="button" class="mt-text-button" id="yq-photo-retry">重新抠图</button><button type="button" class="mt-text-button" id="yq-photo-original">使用原图</button><button type="button" class="mt-text-button yq-remove-photo" id="yq-photo-remove">移除</button></div></div></div><p id="yq-photo-status" class="yq-photo-status" aria-live="polite"></p><input type="file" id="yq-photo-file" accept="image/jpeg,image/png,image/webp" hidden></div>
      <label class="mt-field"><span>物品名称 *</span><input id="yq-name" maxlength="80" required placeholder="如：布洛芬、酸奶、防晒乳" value="${esc(m.name)}"></label>
      <div class="mt-form-row"><label class="mt-field"><span>分类标签 *</span><select id="yq-primary-tag">${allTags().map(t => `<option ${t === primaryTag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="mt-field"><span>更多标签 <small>选填</small></span><input id="yq-extra-tags" maxlength="130" placeholder="如：宝宝、旅行（逗号分隔）" value="${esc(m.tags.slice(1).join('，'))}"></label></div>
      <div class="mt-form-tabs"><button type="button" id="yq-direct" class="is-active" aria-pressed="true">直接填写有效期</button><button type="button" id="yq-calculate" aria-pressed="false">生产日期 ＋ 保质期</button></div>
      <div id="yq-calc-fields" hidden><div class="mt-form-row"><label class="mt-field"><span>生产日期</span><input type="date" id="yq-produced"></label><label class="mt-field"><span>保质期</span><span class="yq-duration"><input type="number" min="1" max="36500" step="1" id="yq-duration" value="24"><select id="yq-unit" aria-label="保质期单位"><option value="months">月</option><option value="days">天</option></select></span></label></div><div class="mt-calculation" id="yq-result" aria-live="polite">填写生产日期后辅助推算，请核对包装</div></div>
      <label class="mt-field"><span>有效期至 *</span><input id="yq-expiry" type="date" min="1900-01-01" max="9998-12-31" required value="${esc(m.expiry)}"><small>请按包装标注填写，推算日期需自行核对。</small></label><label class="mt-check-row" id="yq-confirm-row" hidden><input type="checkbox" id="yq-confirm"><span>我已核对包装，确认上方有效期</span></label>
      <label class="mt-field"><span>唯一标识 <small>选填</small></span><input id="yq-identifier" type="text" placeholder="追溯码、条形码或自定义编号" value="${esc(m.identifier || '')}" autocomplete="off"><small>药品建议填写包装上的追溯码，也可填写条形码或自定义编号。格式不限，按原样保存。</small></label>
      <label class="mt-field"><span>存放位置 <small>选填</small></span><input id="yq-location" maxlength="50" placeholder="如：客厅药箱、冰箱" value="${esc(m.location)}"></label><p class="yq-detail-note">备注可在物品详情页直接添加，并按时间线保存。</p>
      <div id="yq-error" class="mt-error" role="alert" hidden></div><div class="mt-form-actions"><button type="button" class="mt-button mt-quiet" id="yq-cancel">取消</button><button type="submit" class="mt-button mt-primary" id="yq-save">保存记录</button></div></form>`);
    let calculateMode = false, draftAsset = null, photoId = existing?.imageId || null, busy = false, photoVersion = 0, previewURL, disposed = false, saving = false;
    function setPhoto(blob) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = blob ? URL.createObjectURL(blob) : null;
      const preview = $('#yq-photo-preview-image'); preview.hidden = !previewURL;
      if (previewURL) preview.src = previewURL; else preview.removeAttribute('src');
      $('.yq-photo-placeholder').hidden = Boolean(previewURL); $('#yq-photo-actions').hidden = !blob;
    }
    function setBusy(value) { busy = value; $('#yq-save').disabled = busy || saving; $('#yq-photo-retry').disabled = busy; $('#yq-photo-choose').disabled = busy; }
    async function runCutout(asset) {
      const version = ++photoVersion; setBusy(true); $('#yq-photo-status').textContent = '正在自动抠图，首次使用需下载模型…';
      try {
        const blob = await images.remove(asset.original, message => { if (!disposed && version === photoVersion) $('#yq-photo-status').textContent = message; });
        if (disposed || version !== photoVersion) return;
        draftAsset = { ...asset, blob, cutout: true }; photoId = draftAsset.id; setPhoto(blob); $('#yq-photo-status').textContent = '已自动抠图';
      } catch (err) { if (!disposed && version === photoVersion && err.name !== 'AbortError') $('#yq-photo-status').textContent = `${err.message} 原图已保留。`; }
      finally { if (!disposed && version === photoVersion) setBusy(false); }
    }
    dialogCleanup = () => { disposed = true; photoVersion++; images.cancel(); if (previewURL) URL.revokeObjectURL(previewURL); };
    if (photoId) {
      setBusy(true); $('#yq-photo-status').textContent = '正在读取图片…';
      images.get(photoId).then(asset => {
        if (disposed) return;
        if (asset) { draftAsset = asset; setPhoto(asset.blob); $('#yq-photo-status').textContent = asset.cutout ? '已自动抠图' : '当前使用原图'; }
        else $('#yq-photo-status').textContent = '原图片不可用，可重新上传';
      }).catch(() => { if (!disposed) $('#yq-photo-status').textContent = '无法读取已保存图片，可重新上传'; }).finally(() => { if (!disposed) setBusy(false); });
    }
    $('#yq-photo-choose').onclick = () => { $('#yq-photo-file').value = ''; $('#yq-photo-file').click(); };
    $('#yq-photo-file').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const version = ++photoVersion; setBusy(true); $('#yq-photo-status').textContent = '正在读取图片…';
      try {
        const original = await images.prepare(file); if (disposed || version !== photoVersion) return;
        draftAsset = { id: uid(), original, blob: original, cutout: false }; photoId = draftAsset.id; setPhoto(original); setBusy(false); await runCutout(draftAsset);
      } catch (err) { if (!disposed && version === photoVersion) { $('#yq-photo-status').textContent = err.message; setBusy(false); } }
    };
    $('#yq-photo-original').onclick = () => { photoVersion++; images.cancel(); setBusy(false); if (draftAsset) { draftAsset = { ...draftAsset, id: uid(), blob: draftAsset.original, cutout: false }; photoId = draftAsset.id; setPhoto(draftAsset.blob); $('#yq-photo-status').textContent = '当前使用原图'; } };
    $('#yq-photo-retry').onclick = () => { if (draftAsset) { draftAsset = { ...draftAsset, id: uid() }; photoId = draftAsset.id; runCutout(draftAsset); } };
    $('#yq-photo-remove').onclick = () => { photoVersion++; images.cancel(); setBusy(false); draftAsset = null; photoId = null; setPhoto(null); $('#yq-photo-status').textContent = ''; };
    function switchMode(calc) { calculateMode = calc; $('#yq-calc-fields').hidden = !calc; $('#yq-confirm-row').hidden = !calc; $('#yq-confirm').required = calc; for (const [id, on] of [['#yq-direct', !calc], ['#yq-calculate', calc]]) { $(id).classList.toggle('is-active', on); $(id).setAttribute('aria-pressed', String(on)); } }
    $('#yq-direct').onclick = () => switchMode(false); $('#yq-calculate').onclick = () => switchMode(true);
    function calculate() {
      $('#yq-confirm').checked = false;
      const p = parseDate($('#yq-produced').value), n = Number($('#yq-duration').value), months = $('#yq-unit').value === 'months';
      if (!p || !Number.isInteger(n) || n < 1 || n > (months ? 1200 : 36500)) { $('#yq-result').textContent = '请填写有效日期和合理的保质期'; return; }
      let result;
      if (months) { result = new Date(p.getFullYear(), p.getMonth() + n, 1); result.setDate(Math.min(p.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate())); } else result = shift(p, n);
      if (!parseDate(dateKey(result))) { $('#yq-result').textContent = '推算日期超出支持范围'; return; }
      $('#yq-expiry').value = dateKey(result); $('#yq-result').textContent = `推算日期：${fmt(dateKey(result))}，请对照包装确认`;
    }
    for (const id of ['#yq-produced', '#yq-duration', '#yq-unit']) $(id).oninput = calculate;
    $('#yq-expiry').oninput = () => { if (calculateMode) $('#yq-confirm').checked = false; };
    $('#yq-cancel').onclick = existing ? () => detail(existing.id) : closeDialog;
    $('#yq-item-form').onsubmit = async e => {
      e.preventDefault(); if (busy || saving) return; saving = true; $('#yq-save').disabled = true;
      try {
        if (!existing && state.items.length >= 2000) throw new Error('最多支持 2000 条记录，请先导出备份');
        const tags = [...new Set([$('#yq-primary-tag').value, ...$('#yq-extra-tags').value.split(/[,，、]/).map(t => t.trim()).filter(Boolean)])];
        const item = normalizeItem({ ...existing, id: existing?.id || uid(), name: $('#yq-name').value.trim(), expiry: $('#yq-expiry').value, tags, identifier: $('#yq-identifier').value, imageId: photoId, location: $('#yq-location').value.trim(), archived: false });
        // Persist the image first, so records never point at an incomplete image write.
        if (draftAsset && photoId) await images.put(draftAsset);
        if (disposed) return;
        const next = { ...state, items: existing ? state.items.map(x => x.id === item.id ? item : x) : [...state.items, item] };
        if (!save(next)) return;
        selectedTag = item.tags[0]; filter = 'all'; query = ''; $('#mt-search').value = ''; render(); detail(item.id); toast(mode === 'demo' ? '已保存到示例，正式记录可在数据管理中切换' : '记录已保存');
      } catch (err) { if (!disposed) { $('#yq-error').textContent = err.message; $('#yq-error').hidden = false; } }
      finally { saving = false; if (!disposed) $('#yq-save').disabled = busy; }
    };
  }
  $('#mt-add').onclick = () => edit();
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changeMode(nextMode) { mode = nextMode; state = loadMode(); selectedTag = '药品'; filter = 'all'; query = ''; $('#mt-search').value = ''; write('mode', mode); render(); closeDialog(); hydrate(); toast(mode === 'personal' ? '已切换到我的记录' : '示例模式，你的记录仍保留'); }
  $('#yq-data').onclick = () => {
    openDialog('数据管理', `<p class="mt-form-notice">当前为${mode === 'demo' ? '示例模式' : '我的记录'}，共 ${state.items.length} 条记录。文字和图片只保存在此浏览器，请定期备份。</p><div class="yq-data-actions"><button class="mt-button mt-secondary mt-full" id="yq-export">导出 JSON 备份（含图片）</button><button class="mt-button mt-secondary mt-full" id="yq-import">导入备份到我的记录</button><button class="mt-button mt-quiet mt-full" id="yq-switch">${mode === 'demo' ? '切换到我的记录' : '查看示例（保留我的记录）'}</button></div><p class="yq-detail-note">本版仅在页面显示临期、过期状态，不发送通知。${storageAvailable ? '' : '浏览器存储当前不可用，请及时备份。'}</p><p class="yq-detail-note">抠图在本机处理；首次使用下载模型资源。<a href="https://github.com/BOOOER25/youqi" target="_blank" rel="noopener noreferrer">查看开源代码 · AGPL-3.0</a> · <a href="https://github.com/BOOOER25/youqi/blob/main/DEMO-ASSETS.md" target="_blank" rel="noopener noreferrer">示例图片来源</a></p>`);
    $('#yq-export').onclick = async () => {
      const button = $('#yq-export'); button.disabled = true; button.textContent = '正在整理图片备份…';
      const snapshot = structuredClone(state), currentMode = mode;
      try { const assets = await images.exportAssets(snapshot.items.map(x => x.imageId)); download(`youqi-${currentMode}-${dateKey(today())}.json`, JSON.stringify({ ...snapshot, assets, exportedAt: new Date().toISOString() }, null, 2), 'application/json;charset=utf-8'); toast('备份文件已下载，包含物品图片'); }
      catch (err) { toast(err.message); }
      finally { if (button.isConnected) { button.disabled = false; button.textContent = '导出 JSON 备份（含图片）'; } }
    };
    $('#yq-import').onclick = () => { $('#yq-import-file').value = ''; $('#yq-import-file').click(); };
    $('#yq-switch').onclick = () => changeMode(mode === 'demo' ? 'personal' : 'demo');
  };
  $('#yq-import-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('备份文件不能超过 64 MB');
      const raw = JSON.parse(await file.text()), incoming = normalizeState(raw);
      const personal = mode === 'personal' ? state : (() => { const stored = read('personal'); return stored ? normalizeState(stored) : { version: 1, items: [] }; })();
      const ids = new Set(personal.items.map(x => x.id)), additions = incoming.items.filter(x => !ids.has(x.id));
      if (personal.items.length + additions.length > 2000) throw new Error('合并后超过 2000 条记录，无法导入');
      const packed = new Map();
      if (raw.assets != null && (!Array.isArray(raw.assets) || raw.assets.length > 2000)) throw new Error('备份图片格式不正确');
      for (const asset of raw.assets || []) { if (!asset || typeof asset.id !== 'string' || packed.has(asset.id)) throw new Error('备份图片编号不正确'); packed.set(asset.id, asset); }
      for (const item of additions) if (item.imageId && !packed.has(item.imageId)) throw new Error('备份缺少物品图片，无法完整导入');
      openDialog('确认导入备份', `<p class="mt-form-notice">将添加 ${additions.length} 条新记录及其图片，已有相同内部编号的 ${incoming.items.length - additions.length} 条记录保持不变。用户填写的唯一标识按原样保留，不做格式限制或去重。</p><p class="mt-error" id="yq-import-error" role="alert" hidden></p><div class="mt-form-actions"><button class="mt-button mt-quiet" id="yq-cancel-import">取消</button><button class="mt-button mt-primary" id="yq-confirm-import">确认合并</button></div>`);
      $('#yq-cancel-import').onclick = closeDialog;
      $('#yq-confirm-import').onclick = async () => {
        const button = $('#yq-confirm-import'), originalMode = mode, originalState = state, created = [], mapping = new Map(), errorElement = $('#yq-import-error');
        button.disabled = true; $('#yq-cancel-import').disabled = true; $('#mt-dialog-close').disabled = true;
        let committed = false, importing = true; dialogCleanup = () => { importing = false; };
        try {
          for (const id of new Set(additions.map(x => x.imageId).filter(Boolean))) {
            const asset = packed.get(id), blob = images.fromDataUrl(asset.image), original = images.fromDataUrl(asset.original || asset.image), newId = uid();
            const decoded = await createImageBitmap(blob); decoded.close(); const source = await createImageBitmap(original); source.close();
            if (!importing) throw new Error('导入已取消');
            await images.put({ id: newId, blob, original, cutout: asset.cutout === true }); mapping.set(id, newId); created.push(newId);
          }
          if (!importing) throw new Error('导入已取消');
          mode = 'personal';
          const next = { ...personal, items: [...personal.items, ...additions.map(x => ({ ...x, imageId: x.imageId ? mapping.get(x.imageId) : null }))] };
          if (!save(next)) throw new Error('记录保存失败，请检查浏览器存储空间');
          committed = true; selectedTag = '全部'; filter = 'all'; query = ''; $('#mt-search').value = ''; render(); closeDialog(); toast(`已导入 ${additions.length} 条记录`);
        } catch (err) { mode = originalMode; state = originalState; render(); if (errorElement.isConnected) { errorElement.textContent = err.message; errorElement.hidden = false; } }
        finally {
          if (!committed) await Promise.all(created.map(id => images.discard(id).catch(() => {})));
          if (button.isConnected) { button.disabled = false; $('#yq-cancel-import').disabled = false; } $('#mt-dialog-close').disabled = false;
        }
      };
    } catch (err) { toast(err instanceof SyntaxError ? '文件不是有效的 JSON 备份' : err.message); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(() => { if (!document.hidden) render(); }, 60000);
  render(); hydrate();
})();
