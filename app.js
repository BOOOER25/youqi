(() => {
  'use strict';
  const root = document.getElementById('medicine-tool');
  const $ = s => root.querySelector(s);
  const $$ = s => [...root.querySelectorAll(s)];
  const PRESETS = ['药品', '厨房', '日化', '其他'];
  const DEFAULTS = { enabled: true, threshold: 30, seven: false, onDay: true, time: '09:00' };
  const KEY = 'youqi-v1-';
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => parseDate(dateKey(new Date()));
  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number), v = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9998 && v.getFullYear() === y && v.getMonth() === m - 1 && v.getDate() === d ? v : null;
  }
  const ordinal = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const days = s => ordinal(parseDate(s)) - ordinal(today());
  const shift = (d, n) => { const v = new Date(d); v.setDate(v.getDate() + n); return v; };
  const fmt = s => s.replace(/-/g, '.');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let storageAvailable = true;
  function read(key) { try { return JSON.parse(localStorage.getItem(KEY + key) || 'null'); } catch { storageAvailable = false; return null; } }
  function write(key, value) { try { localStorage.setItem(KEY + key, JSON.stringify(value)); } catch { storageAvailable = false; } }
  function settingsFrom(s = {}) {
    return {
      enabled: typeof s?.enabled === 'boolean' ? s.enabled : true,
      threshold: [7, 30, 60, 90].includes(Number(s?.threshold)) ? Number(s.threshold) : 30,
      seven: s?.seven === true, onDay: s?.onDay !== false,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s?.time || '') ? s.time : '09:00'
    };
  }
  function normalizeItem(x) {
    if (!x || typeof x.id !== 'string' || !x.id.length || x.id.length > 100 || typeof x.name !== 'string' || !x.name.trim() || x.name.length > 80 || !parseDate(x.expiry)) throw new Error('备份中存在无效物品记录');
    if (!Array.isArray(x.tags) || x.tags.length < 1 || x.tags.length > 8 || !x.tags.every(t => typeof t === 'string' && t.trim().length > 0 && t.length <= 16)) throw new Error('备份中的标签格式不正确');
    return { id: x.id, name: x.name.trim(), expiry: x.expiry, tags: [...new Set(x.tags.map(t => t.trim()))], location: String(x.location || '').slice(0, 50), note: String(x.note || '').slice(0, 100), remind: x.remind !== false, archived: x.archived === true, reason: x.reason === 'used' ? 'used' : 'disposed', added: parseDate(x.added) ? x.added : dateKey(today()), snooze: parseDate(x.snooze) ? x.snooze : null };
  }
  function normalizeState(s) {
    if (!s || s.version !== 1 || !Array.isArray(s.items) || s.items.length > 2000) throw new Error('请选择有期导出的 JSON 备份文件');
    const items = s.items.map(normalizeItem);
    if (new Set(items.map(x => x.id)).size !== items.length) throw new Error('备份存在重复的记录编号');
    return { version: 1, items, settings: settingsFrom(s.settings) };
  }
  function demoState() {
    const seed = [
      ['氯雷他定片', -8, '药品', '客厅药箱', '片剂 · 1盒'],
      ['布洛芬缓释胶囊', 7, '药品', '客厅药箱', '胶囊 · 1盒'],
      ['维生素 C 片', 25, '药品', '卧室抽屉', '片剂 · 1瓶'],
      ['碘伏消毒液', 140, '药品', '客厅药箱', '外用 · 1瓶'],
      ['蒙脱石散', 240, '药品', '客厅药箱', '散剂 · 1盒'],
      ['医用退热贴', 310, '药品', '儿童用品柜', '护理用品 · 1盒'],
      ['原味酸奶', 3, '厨房', '冰箱冷藏层', '未开封 · 4杯'],
      ['意大利面', 95, '厨房', '厨房储物柜', '500克 · 1袋'],
      ['防晒乳', 20, '日化', '卧室梳妆台', '未开封 · 1支'],
      ['一次性口罩', 180, '其他', '玄关抽屉', '未开封 · 1盒']
    ];
    return { version: 1, settings: { ...DEFAULTS }, items: seed.map((x, i) => ({ id: `sample-${i}`, name: x[0], expiry: dateKey(shift(today(), x[1])), tags: [x[2]], location: x[3], note: x[4], remind: true, archived: false, added: dateKey(shift(today(), -60)), snooze: null })) };
  }
  let mode = read('mode') === 'personal' ? 'personal' : 'demo';
  function loadMode() {
    try { const stored = read(mode); return stored ? normalizeState(stored) : mode === 'demo' ? demoState() : { version: 1, items: [], settings: { ...DEFAULTS } }; }
    catch { storageAvailable = false; return mode === 'demo' ? demoState() : { version: 1, items: [], settings: { ...DEFAULTS } }; }
  }
  let state = loadMode(), selectedTag = '药品', filter = 'all', query = '', timer, previousFocus;
  const activeItems = () => state.items.filter(m => !m.archived);
  const tagItems = () => state.items.filter(m => selectedTag === '全部' || m.tags.includes(selectedTag));
  const stateOf = m => m.archived ? 'archived' : days(m.expiry) < 0 ? 'expired' : days(m.expiry) <= state.settings.threshold ? 'soon' : 'normal';
  function statusLabel(m) {
    const n = days(m.expiry);
    return m.archived ? m.reason === 'used' ? '已用完' : '已处理' : n < 0 ? `已过期 ${-n} 天` : n === 0 ? '今天到期' : n <= state.settings.threshold ? `剩余 ${n} 天` : '有效期内';
  }
  function save() { write(mode, state); write('mode', mode); render(); }
  function allTags() { return [...new Set([...PRESETS, ...state.items.flatMap(x => x.tags)])]; }
  function reminderPlan() {
    if (!state.settings.enabled) return [];
    const result = [], base = dateKey(today()), s = state.settings;
    for (const item of activeItems().filter(x => x.remind)) {
      for (const lead of new Set([s.threshold, ...(s.seven ? [7] : []), ...(s.onDay ? [0] : [])])) {
        let when = dateKey(shift(parseDate(item.expiry), -lead));
        if (when < item.added) when = item.added;
        if (item.snooze && when < item.snooze) when = item.snooze;
        if (when >= base && !result.some(x => x.item.id === item.id && x.date === when)) result.push({ item, date: when });
      }
      if (item.snooze && item.snooze >= base && !result.some(x => x.item.id === item.id && x.date === item.snooze)) result.push({ item, date: item.snooze });
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.item.name.localeCompare(b.item.name, 'zh-CN'));
  }
  function render() {
    const active = tagItems().filter(m => !m.archived), soon = active.filter(m => stateOf(m) === 'soon'), expired = active.filter(m => stateOf(m) === 'expired'), count = soon.length + expired.length;
    $('#yq-mode').textContent = mode === 'demo' ? '示例模式' : '我的记录';
    $('#yq-demo-banner').hidden = mode !== 'demo';
    $('#mt-date').textContent = fmt(dateKey(today()));
    $('#yq-list-heading').textContent = selectedTag === '药品' ? '我的药箱' : selectedTag === '全部' ? '我的物品' : `${selectedTag}记录`;
    $('#yq-overview-tag').textContent = selectedTag === '药品' ? '家庭药箱 · 药品优先' : selectedTag === '全部' ? '日常物品 · 一起记好' : `${selectedTag} · 有效期记录`;
    $('#mt-total-count').textContent = active.length;
    $('#mt-soon-count').textContent = soon.length;
    $('#mt-expired-count').textContent = expired.length;
    $('#mt-overview-title').textContent = count ? `有 ${count} 件${selectedTag === '药品' ? '药品' : '物品'}需要关注` : active.length ? '有效期都记好了，安心一点' : '记下第一份有效期';
    $('#mt-overview-note').textContent = selectedTag === '药品' ? '定期整理小药箱，给家人多一份安心。' : '从药品到厨房，少一点遗忘，多一点从容。';
    $('#yq-tags').innerHTML = ['全部', ...allTags()].map(t => `<button class="yq-tag${t === selectedTag ? ' is-selected' : ''}" data-tag="${esc(t)}" aria-pressed="${t === selectedTag}">${t === '药品' ? '<span aria-hidden="true">✚</span> ' : ''}${esc(t)}${t === '药品' ? '<small>推荐</small>' : ''}</button>`).join('');
    $$('.mt-tab').forEach(b => { b.classList.toggle('is-active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); if (b.dataset.filter === 'attention') b.hidden = filter !== 'attention'; });
    const visible = tagItems().filter(m => {
      const status = stateOf(m), match = filter === 'all' ? !m.archived : filter === 'attention' ? ['soon', 'expired'].includes(status) : filter === 'archived' ? m.archived : status === filter;
      return match && `${m.name} ${m.location} ${m.tags.join(' ')} ${m.note}`.toLowerCase().includes(query.toLowerCase());
    }).sort((a, b) => a.expiry.localeCompare(b.expiry));
    $('#mt-list').innerHTML = visible.length ? visible.map(m => `<button class="mt-medicine-row" data-id="${esc(m.id)}" aria-label="查看${esc(m.name)}，${esc(statusLabel(m))}"><span class="mt-drug-icon ${stateOf(m)}" aria-hidden="true">${m.tags.includes('药品') ? '<span class="mt-pill"></span>' : `<span class="yq-item-letter">${esc(m.tags[0].slice(0, 1))}</span>`}</span><span class="mt-drug-main"><span class="mt-drug-name">${esc(m.name)}</span><span class="mt-drug-meta">${esc(m.tags.join(' / '))}${m.location ? ` · ${esc(m.location)}` : ''}</span></span><span class="mt-drug-status"><span class="mt-badge ${stateOf(m)}">${esc(statusLabel(m))}</span><span class="mt-expiry">${fmt(m.expiry)} 到期</span></span><span class="mt-row-chevron" aria-hidden="true">›</span></button>`).join('') : `<div class="mt-empty"><strong>${query ? '没有找到相关物品' : filter === 'archived' ? '还没有归档记录' : '这里暂时没有记录'}</strong>${query ? '试试其他名称、位置或标签' : filter === 'archived' ? '用完或处理后的记录会保存在这里' : '点击添加物品，把第一份有效期记下来。'}</div>`;
    $('#mt-visible-count').textContent = `共 ${visible.length} 件`;
    const s = state.settings, points = [`提前 ${s.threshold} 天`, ...(s.seven && s.threshold !== 7 ? ['提前 7 天'] : []), ...(s.onDay ? ['到期当天'] : [])];
    $('#mt-reminder-status').textContent = s.enabled ? '计划已保存' : '已暂停';
    $('#mt-reminder-heading').textContent = s.enabled ? '把日期交给提醒' : '提醒计划已暂停';
    $('#mt-reminder-summary').innerHTML = s.enabled ? `${points.join('、')}<br>每天 ${esc(s.time)} · 按日合并` : '可随时重新开启<br>记录和归档仍可继续使用';
    const next = reminderPlan()[0];
    $('#mt-next-reminder').innerHTML = next ? `<div class="mt-next-item"><div class="mt-calendar"><span>${parseDate(next.date).getMonth() + 1}月</span><strong>${parseDate(next.date).getDate()}</strong></div><div class="mt-next-copy">${esc(next.item.name)}<small>${fmt(next.date)} · ${esc(s.time)} · 全部标签</small></div></div>` : '<p class="mt-muted">暂无待提醒事项</p>';
    $('#mt-storage-note').textContent = storageAvailable ? '数据仅存在此浏览器，记得导出备份' : '浏览器存储不可用，请及时导出备份';
  }
  function toast(message) { clearTimeout(timer); $('#mt-toast').textContent = message; $('#mt-toast').hidden = false; timer = setTimeout(() => { $('#mt-toast').hidden = true; }, 3500); }
  function openDialog(title, content) {
    if ($('#mt-overlay').hidden) previousFocus = document.activeElement;
    $('#mt-dialog-title').textContent = title; $('#mt-dialog-body').innerHTML = content; $('#mt-overlay').hidden = false;
    $('.mt-app').inert = true;
    ($('#mt-dialog-body').querySelector('input,button,select') || $('#mt-dialog-close')).focus({ preventScroll: true });
    requestAnimationFrame(() => $('#mt-dialog').scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  }
  function closeDialog() { $('#mt-overlay').hidden = true; $('#mt-dialog-body').innerHTML = ''; $('.mt-app').inert = false; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); else $('#mt-add').focus({ preventScroll: true }); }
  $('#mt-dialog-close').onclick = closeDialog;
  $('#mt-overlay').onclick = e => { if (e.target === $('#mt-overlay')) closeDialog(); };
  root.addEventListener('keydown', e => {
    if ($('#mt-overlay').hidden) return;
    if (e.key === 'Escape') closeDialog();
    if (e.key === 'Tab') {
      const targets = [...$('#mt-dialog').querySelectorAll('button,input,select,a')].filter(x => !x.disabled && !x.closest('[hidden]'));
      if (e.shiftKey && document.activeElement === targets[0]) { e.preventDefault(); targets.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === targets.at(-1)) { e.preventDefault(); targets[0].focus(); }
    }
  });
  $$('[data-filter]').forEach(b => { b.onclick = () => { filter = b.dataset.filter; render(); }; });
  $('#yq-tags').onclick = e => { const button = e.target.closest('[data-tag]'); if (button) { selectedTag = button.dataset.tag; filter = 'all'; render(); } };
  $('#mt-focus').onclick = () => { filter = 'attention'; render(); $('.mt-list-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); };
  $('#mt-search').oninput = e => { query = e.target.value; render(); };
  $('#mt-list').onclick = e => { const b = e.target.closest('[data-id]'); if (b) detail(b.dataset.id); };
  function detail(id) {
    const m = state.items.find(x => x.id === id); if (!m) return;
    const next = reminderPlan().find(x => x.item.id === id);
    openDialog('物品详情', `<div class="mt-detail-top"><span class="mt-drug-icon ${stateOf(m)}" aria-hidden="true">${m.tags.includes('药品') ? '<span class="mt-pill"></span>' : `<span class="yq-item-letter">${esc(m.tags[0].slice(0, 1))}</span>`}</span><div><div class="mt-detail-name">${esc(m.name)}</div><span class="mt-badge ${stateOf(m)}">${esc(statusLabel(m))}</span></div></div><dl class="mt-detail-fields"><div><dt>标签</dt><dd>${esc(m.tags.join(' / '))}</dd></div><div><dt>有效期至</dt><dd>${fmt(m.expiry)}</dd></div><div><dt>存放位置</dt><dd>${esc(m.location || '未填写')}</dd></div><div><dt>备注</dt><dd>${esc(m.note || '未填写')}</dd></div><div><dt>提醒计划</dt><dd>${m.archived ? '已归档，不再安排' : !m.remind ? '未开启' : !state.settings.enabled ? '已暂停' : next ? fmt(next.date) + ' ' + state.settings.time : '无后续安排'}</dd></div></dl>${m.tags.includes('药品') ? '<p class="yq-detail-note">请按包装及说明书核对有效期；本工具不提供用药建议。</p>' : ''}<div class="mt-detail-actions">${m.archived ? '<button class="mt-button mt-primary" id="yq-restore">恢复记录</button>' : '<button class="mt-button mt-primary" id="yq-edit">编辑记录</button><button class="mt-button mt-secondary" id="yq-used">已用完</button><button class="mt-button mt-secondary" id="yq-disposed">已处理</button>'}</div>${!m.archived && ['soon', 'expired'].includes(stateOf(m)) ? '<button class="mt-button mt-quiet mt-full yq-snooze-button" id="yq-snooze">明天再提醒</button>' : ''}`);
    if (m.archived) { $('#yq-restore').onclick = () => { m.archived = false; m.snooze = null; save(); closeDialog(); toast('记录已恢复'); }; return; }
    $('#yq-edit').onclick = () => edit(m);
    for (const [button, reason] of [['#yq-used', 'used'], ['#yq-disposed', 'disposed']]) $(button).onclick = () => { m.archived = true; m.reason = reason; save(); closeDialog(); toast('已归档，不再安排提醒'); };
    if ($('#yq-snooze')) $('#yq-snooze').onclick = () => { if (!state.settings.enabled || !m.remind) { toast('请先在编辑记录和提醒设置中开启提醒'); return; } m.snooze = dateKey(shift(today(), 1)); save(); closeDialog(); toast('计划已延后至明天，请重新导出日历以更新'); };
  }
  function edit(existing) {
    const primaryTag = existing?.tags[0] || (selectedTag === '全部' ? '药品' : selectedTag);
    const m = existing || { name: '', expiry: '', location: '', note: '', remind: true, tags: [primaryTag] };
    openDialog(existing ? '编辑物品' : '添加物品', `<form id="yq-item-form"><label class="mt-field"><span>物品名称 *</span><input id="yq-name" maxlength="80" required placeholder="如：布洛芬、酸奶、防晒乳" value="${esc(m.name)}"></label><div class="mt-form-row"><label class="mt-field"><span>分类标签 *</span><select id="yq-primary-tag">${allTags().map(t => `<option ${t === primaryTag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="mt-field"><span>更多标签 <small>选填</small></span><input id="yq-extra-tags" maxlength="130" placeholder="如：宝宝、旅行（逗号分隔）" value="${esc(m.tags.slice(1).join('，'))}"></label></div><div class="mt-form-tabs"><button type="button" id="yq-direct" class="is-active" aria-pressed="true">直接填写有效期</button><button type="button" id="yq-calculate" aria-pressed="false">生产日期 ＋ 保质期</button></div><div id="yq-calc-fields" hidden><div class="mt-form-row"><label class="mt-field"><span>生产日期</span><input type="date" id="yq-produced"></label><label class="mt-field"><span>保质期</span><span class="yq-duration"><input type="number" min="1" max="36500" step="1" id="yq-duration" value="24"><select id="yq-unit" aria-label="保质期单位"><option value="months">月</option><option value="days">天</option></select></span></label></div><div class="mt-calculation" id="yq-result" aria-live="polite">填写生产日期后辅助推算，请核对包装</div></div><label class="mt-field"><span>有效期至 *</span><input id="yq-expiry" type="date" min="1900-01-01" max="9998-12-31" required value="${esc(m.expiry)}"><small>请按包装标注填写，推算日期需自行核对。</small></label><label class="mt-check-row" id="yq-confirm-row" hidden><input type="checkbox" id="yq-confirm"><span>我已核对包装，确认上方有效期</span></label><div class="mt-form-row"><label class="mt-field"><span>存放位置 <small>选填</small></span><input id="yq-location" maxlength="50" placeholder="如：客厅药箱、冰箱" value="${esc(m.location)}"></label><label class="mt-field"><span>备注 <small>选填</small></span><input id="yq-note" maxlength="100" placeholder="规格、数量等" value="${esc(m.note)}"></label></div><label class="mt-check-row"><input id="yq-remind" type="checkbox" ${m.remind ? 'checked' : ''}><span>加入到期提醒计划<small>提前 ${state.settings.threshold} 天，${state.settings.time}；手机提醒请导出日历</small></span></label><div id="yq-error" class="mt-error" role="alert" hidden></div><div class="mt-form-actions"><button type="button" class="mt-button mt-quiet" id="yq-cancel">取消</button><button type="submit" class="mt-button mt-primary">保存记录</button></div></form>`);
    let calculateMode = false;
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
    $('#yq-cancel').onclick = closeDialog;
    $('#yq-item-form').onsubmit = e => {
      e.preventDefault();
      try {
        if (!existing && state.items.length >= 2000) throw new Error('最多支持 2000 条记录，请先导出备份');
        const tags = [...new Set([$('#yq-primary-tag').value, ...$('#yq-extra-tags').value.split(/[,，、]/).map(t => t.trim()).filter(Boolean)])];
        const item = normalizeItem({ ...existing, id: existing?.id || uid(), name: $('#yq-name').value.trim(), expiry: $('#yq-expiry').value, tags, location: $('#yq-location').value.trim(), note: $('#yq-note').value.trim(), remind: $('#yq-remind').checked, archived: false, added: existing?.added || dateKey(today()), snooze: null });
        if (existing) state.items = state.items.map(x => x.id === item.id ? item : x); else state.items.push(item);
        selectedTag = item.tags[0]; filter = 'all'; query = ''; $('#mt-search').value = ''; save(); closeDialog(); toast(mode === 'demo' ? '已保存到示例记录，开始正式使用请点击“开始记录”' : '记录已保存');
      } catch (err) { $('#yq-error').textContent = err.message; $('#yq-error').hidden = false; }
    };
  }
  $('#mt-add').onclick = () => edit();
  $('#mt-settings').onclick = () => {
    const s = state.settings;
    openDialog('到期提醒计划', `<form id="yq-settings-form"><label class="mt-check-row"><input id="yq-enable" type="checkbox" ${s.enabled ? 'checked' : ''}><span>开启提醒计划<small>药品、厨房等所有标签统一使用此设置</small></span></label><hr class="mt-setting-separator"><label class="mt-field"><span>首次临期提醒</span><select id="yq-threshold">${[7, 30, 60, 90].map(n => `<option value="${n}" ${s.threshold === n ? 'selected' : ''}>到期前 ${n} 天</option>`).join('')}</select></label><label class="mt-check-row"><input type="checkbox" id="yq-seven" ${s.seven ? 'checked' : ''}><span>到期前 7 天再提醒</span></label><label class="mt-check-row"><input type="checkbox" id="yq-on-day" ${s.onDay ? 'checked' : ''}><span>到期当天提醒</span></label><label class="mt-field"><span>提醒时间</span><input type="time" id="yq-time" required value="${esc(s.time)}"></label><div class="mt-form-notice">当前网页不会在关闭后自动向手机推送。保存计划后，可导出并导入系统日历，由日历应用安排提醒。修改计划后请重新导出更新。</div><div class="mt-form-actions"><button type="button" class="mt-button mt-quiet" id="yq-cancel-settings">取消</button><button type="submit" class="mt-button mt-primary">保存提醒计划</button></div></form>`);
    $('#yq-cancel-settings').onclick = closeDialog;
    $('#yq-settings-form').onsubmit = e => { e.preventDefault(); state.settings = settingsFrom({ enabled: $('#yq-enable').checked, threshold: +$('#yq-threshold').value, seven: $('#yq-seven').checked, onDay: $('#yq-on-day').checked, time: $('#yq-time').value }); save(); closeDialog(); toast('计划已保存；导出日历后可添加手机提醒'); };
  };
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#yq-calendar').onclick = () => {
    const plan = reminderPlan();
    if (!plan.length) { toast('暂无可导出的提醒，请添加物品或开启提醒计划'); return; }
    openDialog('导出日历提醒', `<div class="mt-form-notice">${mode === 'demo' ? '当前为示例模式，导出内容也是示例。' : ''}将导出所有标签下的 ${plan.length} 条提醒安排。导入系统日历后，请检查其提醒开关和通知权限。更新记录后需要重新导出并更新日历。</div><div class="mt-form-actions"><button class="mt-button mt-quiet" id="yq-cancel-calendar">取消</button><button class="mt-button mt-primary" id="yq-export-calendar">下载日历文件</button></div>`);
    $('#yq-cancel-calendar').onclick = closeDialog;
    $('#yq-export-calendar').onclick = () => {
      const escapeICS = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), clock = state.settings.time.replace(':', '') + '00';
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Youqi//Expiry Reminder//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:有期 · 到期提醒'];
      for (const { item, date } of plan) {
        const eventID = [...new TextEncoder().encode(item.id)].map(x => x.toString(16).padStart(2, '0')).join('');
        lines.push('BEGIN:VEVENT', `UID:${eventID}-${date}@youqi.local`, `DTSTAMP:${stamp}`, `DTSTART:${date.replace(/-/g, '')}T${clock}`, 'DURATION:PT5M', `SUMMARY:${escapeICS('有期：' + item.name + '到期提醒')}`, `DESCRIPTION:${escapeICS(`物品：${item.name}\n有效期至：${item.expiry}\n标签：${item.tags.join('、')}\n位置：${item.location || '未填写'}\n请核对包装并检查物品状态。`)}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${escapeICS(item.name + '到期提醒')}`, 'END:VALARM', 'END:VEVENT');
      }
      lines.push('END:VCALENDAR');
      // Fold by UTF-8 octets, preserving multibyte Chinese characters (RFC 5545).
      const folded = lines.map(line => { const chunks = []; let part = '', size = 0; for (const c of line) { const bytes = new TextEncoder().encode(c).length; if (size + bytes > 73) { chunks.push(part); part = ' '; size = 1; } part += c; size += bytes; } chunks.push(part); return chunks.join('\r\n'); }).join('\r\n') + '\r\n';
      download(`youqi-reminders-${dateKey(today())}.ics`, folded, 'text/calendar;charset=utf-8'); closeDialog(); toast('日历文件已下载，请导入并检查提醒设置');
    };
  };
  $('#mt-notification-preview').onclick = () => {
    const plan = reminderPlan(), first = plan[0], sameDay = first ? plan.filter(x => x.date === first.date) : [];
    openDialog('通知样式预览', `<div class="mt-phone-preview"><div class="mt-phone-date"><span class="mt-phone-time">${esc(state.settings.time)}</span>${first ? fmt(first.date) : fmt(dateKey(today()))}</div>${first ? `<button class="mt-notification" id="yq-open-notification"><span class="mt-notification-app"><span class="mt-brandmark">期</span>有期 · 到期提醒<time>现在</time></span><strong>有 ${sameDay.length} 件物品需要关注</strong><p>${esc(sameDay.slice(0, 2).map(x => x.item.name).join('、'))}${sameDay.length > 2 ? '等' : ''}，点击查看有效期记录。</p></button>` : '<p class="mt-form-notice">暂无提醒安排，添加物品并开启提醒计划后再试。</p>'}</div><p class="mt-form-notice">仅展示通知样式，不会发送真实推送。实际手机通知需接入主产品服务；日历提醒以系统日历样式为准。</p>`);
    if (first) $('#yq-open-notification').onclick = () => {
      openDialog('本次提醒的物品', `<div class="yq-reminder-results">${sameDay.map(x => `<button class="mt-medicine-row" data-result-id="${esc(x.item.id)}"><span class="mt-drug-main"><span class="mt-drug-name">${esc(x.item.name)}</span><span class="mt-drug-meta">${esc(x.item.tags.join(' / '))} · ${fmt(x.item.expiry)} 到期</span></span><span aria-hidden="true">›</span></button>`).join('')}</div>`);
      $$('[data-result-id]').forEach(b => { b.onclick = () => detail(b.dataset.resultId); });
    };
  };
  function changeMode(nextMode) { mode = nextMode; state = loadMode(); selectedTag = '药品'; filter = 'all'; query = ''; $('#mt-search').value = ''; write('mode', mode); render(); closeDialog(); toast(mode === 'personal' ? '已进入我的记录，示例已收起' : '已进入示例模式，你的记录仍保留'); }
  $('#yq-start').onclick = () => changeMode('personal');
  $('#yq-data').onclick = () => {
    openDialog('数据管理', `<p class="mt-form-notice">当前为${mode === 'demo' ? '示例模式' : '我的记录'}，共 ${state.items.length} 条记录。数据仅保存在当前浏览器，请定期备份；不会自动同步到其他设备。</p><div class="yq-data-actions"><button class="mt-button mt-secondary mt-full" id="yq-export">导出 ${mode === 'demo' ? '示例' : '我的'} JSON 备份</button><button class="mt-button mt-secondary mt-full" id="yq-import">导入备份到我的记录</button><button class="mt-button mt-quiet mt-full" id="yq-switch">${mode === 'demo' ? '开始记录我的物品' : '查看示例（保留我的记录）'}</button></div><p class="yq-detail-note">导入会合并新记录，已有相同编号的记录会保留；提醒设置沿用当前“我的记录”设置。</p>`);
    $('#yq-export').onclick = () => { download(`youqi-${mode}-${dateKey(today())}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json;charset=utf-8'); toast('备份文件已下载'); };
    $('#yq-import').onclick = () => { $('#yq-import-file').value = ''; $('#yq-import-file').click(); };
    $('#yq-switch').onclick = () => changeMode(mode === 'demo' ? 'personal' : 'demo');
  };
  $('#yq-import-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('备份文件不能超过 2 MB');
      const incoming = normalizeState(JSON.parse(await file.text()));
      const personal = mode === 'personal' ? state : (() => { const saved = read('personal'); return saved ? normalizeState(saved) : { version: 1, items: [], settings: { ...DEFAULTS } }; })();
      const ids = new Set(personal.items.map(x => x.id)), additions = incoming.items.filter(x => !ids.has(x.id));
      if (personal.items.length + additions.length > 2000) throw new Error('合并后超过 2000 条记录，无法导入');
      openDialog('确认导入备份', `<p class="mt-form-notice">将向“我的记录”添加 ${additions.length} 条新记录，保留 ${incoming.items.length - additions.length} 条相同编号的现有记录。提醒设置保持不变。</p><div class="mt-form-actions"><button class="mt-button mt-quiet" id="yq-cancel-import">取消</button><button class="mt-button mt-primary" id="yq-confirm-import">确认合并</button></div>`);
      $('#yq-cancel-import').onclick = closeDialog;
      $('#yq-confirm-import').onclick = () => { mode = 'personal'; state = { ...personal, items: [...personal.items, ...additions] }; selectedTag = '全部'; filter = 'all'; query = ''; $('#mt-search').value = ''; save(); closeDialog(); toast(`已导入 ${additions.length} 条新记录`); };
    } catch (err) { toast(err instanceof SyntaxError ? '文件不是有效的 JSON 备份' : err.message); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(() => { if (!document.hidden) render(); }, 60000);
  render();
})();
