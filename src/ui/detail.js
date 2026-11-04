import { element as el, button, icon, iconButton, kindIcon, sizeLabel, toast } from './elements.js';
import { extension, basename, comparisonKey } from '../core/paths.js';
import { kindNames } from '../core/formats.js';
import { friendlyError } from '../core/async.js';
import { describeUnity } from '../unity/metadata.js';

export class Detail {
  token = 0;
  viewer;
  constructor(app) {
    this.app = app;
    this.root = el('section', 'detail-screen'); this.root.hidden = true; this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-label', '资源预览'); document.body.append(this.root);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !this.root.hidden) this.close(); });
  }
  close() {
    this.textureObserver?.disconnect(); for (const media of this.root.querySelectorAll('audio,video')) { media.pause(); media.removeAttribute('src'); media.load(); }
    this.token++; this.viewer?.dispose(); this.viewer = null; this.resource = null; this.root.hidden = true; this.root.replaceChildren(); document.body.style.overflow = ''; this.app.covers.paused = false; this.app.covers.next();
    this.previousFocus?.focus();
  }
  async open(resource) {
    this.previousFocus = document.activeElement; this.viewer?.dispose(); this.viewer = null;
    const token = ++this.token; this.resource = resource; this.imageOnly = false; this.app.covers.paused = true; this.root.hidden = false; document.body.style.overflow = 'hidden'; this.tab = 'preview';
    this.build(resource); this.back.focus(); this.setBusy('正在本地解析资源…');
    try {
      await this.app.catalog.expand(resource, true); if (token !== this.token) return;
      this.renderFiles(); this.fillModelSelect(); this.renderInfo();
      const model = this.app.catalog.chooseModel(resource), texture = resource.entries.find(entry => entry.kind === 'texture');
      if (resource.isWorld) this.message('世界资源暂不支持预览', '可以查看包内文件与资源说明。', 'cube');
      else if (model) await this.preview(model);
      else if (texture) await this.preview(texture);
      else await this.preview(resource.entries.find(entry => !['archive', 'other'].includes(entry.kind)) || resource.entries[0]);
      if (token === this.token) this.renderWarnings();
    } catch (error) { if (token !== this.token) return; this.message(error.code === 'PASSWORD_REQUIRED' ? '此资源需要密码' : '暂时无法展示', friendlyError(error), error.code === 'PASSWORD_REQUIRED' ? 'lock' : 'info'); this.renderInfo(); if (error.code === 'PASSWORD_REQUIRED') this.password.focus(); }
  }
  build(resource) {
    const header = el('header', 'detail-header'); this.back = button('返回资源库', 'back', () => this.close(), 'text-button');
    const title = el('div', 'detail-title'); title.append(el('h2', '', resource.name), el('span', '', this.app.sources.sources.get(resource.sourceId)?.name || '本地来源'));
    header.append(this.back, title, iconButton('关闭预览', 'close', () => this.close()));
    const layout = el('div', 'detail-layout'); this.summary = el('aside', 'detail-summary'); const main = el('div', 'detail-main'); this.previewToolbar = el('div', 'preview-toolbar');
    this.modelSelect = el('select'); this.modelSelect.setAttribute('aria-label', '选择包内模型'); this.modelSelect.onchange = () => { const entry = resource.entries.find(entry => entry.id === this.modelSelect.value); if (entry) this.preview(entry); };
    this.fit = iconButton('重新取景', 'fit', () => this.viewer?.fit()); this.grid = iconButton('显示或隐藏网格', 'grid', () => this.viewer?.toggleGrid());
    this.previewToolbar.append(el('span', 'preview-label', '资源预览'), this.modelSelect, this.fit, this.grid);
    this.stage = el('div', 'preview-stage'); this.stage.setAttribute('aria-live', 'polite'); this.stats = el('div', 'preview-stats');
    const tabs = el('nav', 'detail-tabs');
    this.tabs = {};
    for (const [name, label] of [['files', '文件'], ['textures', '贴图'], ['preview', '3D 预览'], ['unity', 'Unity 资源'], ['expressions', '表情与动画']]) { const node = button(label, null, () => this.selectTab(name), 'detail-tab' + (name === 'preview' ? ' active' : '')); this.tabs[name] = node; tabs.append(node); }
    this.panes = { preview: el('div', 'preview-pane'), files: el('div', 'files-pane'), textures: el('div', 'textures-pane'), unity: el('div', 'unity-pane'), expressions: el('div', 'expressions-pane') };
    this.panes.preview.append(this.previewToolbar, this.stage, this.stats);
    for (const [name, pane] of Object.entries(this.panes)) pane.hidden = name !== 'preview';
    main.append(tabs, ...Object.values(this.panes));
    this.inspector = el('aside', 'inspector'); layout.append(this.summary, main, this.inspector); this.root.replaceChildren(header, layout);
  }
  selectTab(name) { this.tab = name; for (const [key, pane] of Object.entries(this.panes)) { pane.hidden = key !== name; this.tabs[key].classList.toggle('active', key === name); } if (name === 'textures') this.renderTextures(); if (name === 'expressions') this.renderExpressions(); if (name === 'unity') this.renderUnity(); this.viewer?.draw(); }
  setBusy(text) { const busy = el('div', 'preview-message'); busy.append(el('span', 'spinner'), el('p', '', text)); this.stage.replaceChildren(busy); }
  message(title, text, symbol = 'info') { const node = el('div', 'preview-message'); node.append(icon(symbol, 42), el('h3', '', title), el('p', '', text)); this.stage.replaceChildren(node); }
  fillModelSelect() {
    const models = this.resource.entries.filter(entry => entry.kind === 'model'); this.modelSelect.replaceChildren(...models.map(entry => new Option(entry.path, entry.id))); this.modelSelect.hidden = !models.length;
  }
  renderInfo() {
    const resource = this.resource; this.inspector.replaceChildren(); this.summary.replaceChildren();
    const cover = el('div', 'detail-cover'), cached = this.app.covers.states.get(resource.id);
    if (cached?.url) { const image = el('img'); image.src = cached.url; image.alt = resource.name; cover.append(image); }
    else cover.append(icon(kindIcon(resource.detectedKind || resource.kind), 48), el('span', '', resource.isWorld ? '世界不支持预览' : '暂无展示'));
    const counts = el('div', 'detail-counts');
    for (const [number, label] of [[resource.entries.filter(entry => entry.kind === 'model').length, '模型文件'], [resource.entries.filter(entry => entry.kind === 'texture').length, '贴图文件'], [resource.entries.length, '条目总数'], [sizeLabel(resource.size), '体积']]) { const item = el('div'); item.append(el('strong', '', String(number)), el('span', '', label)); counts.append(item); }
    const heading = el('div', 'inspector-heading'); heading.append(icon(kindIcon(resource.detectedKind || resource.kind)), el('h3', '', '资源信息'));
    const info = el('dl', 'resource-facts'); for (const [label, value] of [['资源类型', resource.isWorld ? '世界' : kindNames[resource.detectedKind || resource.kind]], ['文件大小', sizeLabel(resource.size)], ['关联文件', `${resource.entries.length.toLocaleString()} 个`], ['适用模型', resource.avatars.join(' / ') || '未标注'], ['来源路径', resource.path || '本地根目录']]) { info.append(el('dt', '', label), el('dd', '', value)); }
    const passwordSection = el('section', 'inspector-section'); passwordSection.append(el('h3', '', '此资源的解压密码'), el('p', 'muted', '仅用于此资源及其嵌套压缩包。'));
    const passwordRow = el('div', 'password-row'); this.password = el('input'); this.password.type = 'password'; this.password.autocomplete = 'off'; this.password.placeholder = '未加密可留空'; this.password.setAttribute('aria-label', '此资源的解压密码');
    this.app.archives.password(resource.id).then(value => { if (this.resource === resource) this.password.value = value; });
    const remember = el('label', 'checkbox-label'), checkbox = el('input'); checkbox.type = 'checkbox'; remember.append(checkbox, document.createTextNode('在此浏览器记住密码'));
    const apply = button('应用', null, async () => {
      apply.disabled = true; const value = this.password.value;
      try { await this.app.catalog.retry(resource, value, checkbox.checked); this.app.covers.retry(resource); await this.open(resource); toast('密码已应用到此资源'); }
      catch (error) { toast(friendlyError(error)); } finally { apply.disabled = false; }
    }); passwordRow.append(this.password, apply); passwordSection.append(passwordRow, remember);
    this.materialSection = el('section', 'inspector-section'); this.materialSection.hidden = true;
    this.warnings = el('div', 'resource-warnings');
    this.summary.append(cover, counts, heading, info, passwordSection);
    this.inspector.append(el('div', 'inspector-heading', '贴图与配色'), this.materialSection, this.warnings, el('p', 'muted', '选择模型后，可调整对应材质的贴图与颜色。'));
    const local = el('p', 'inspector-local'); local.append(icon('shield', 15), document.createTextNode('仅本地读取 · 文件不会上传')); this.summary.append(local);
  }
  renderWarnings() {
    if (!this.warnings) return; const warnings = [...new Set([...(this.resource.warnings || []), ...(this.loadedWarnings || [])])]; this.warnings.replaceChildren();
    if (!warnings.length) return;
    const details = el('details', 'warning-details'), summary = el('summary', '', `${warnings.length} 项兼容性提示`); details.append(summary, ...warnings.map(text => el('p', '', text))); this.warnings.append(details);
  }
  async preview(entry) {
    if (!entry) { this.message('没有可预览的内容', '可以在文件清单中查看资源，或添加解压后的目录。'); return; }
    const resource = this.resource, token = ++this.token; this.entry = entry; this.viewer?.dispose(); this.viewer = null; this.loadedWarnings = []; this.selectTab('preview'); this.setBusy('正在准备预览…'); this.stats.textContent = entry.path; this.materialSection.hidden = true;
    try {
      if (entry.kind === 'model') await this.showModel(resource, entry, token);
      else if (entry.kind === 'texture') await this.showImage(entry, token);
      else if (entry.kind === 'audio' || entry.kind === 'video') {
        const url = await this.app.catalog.url(entry); if (token !== this.token) return;
        const media = el(entry.kind, 'media-preview'); media.controls = true; media.preload = 'metadata'; media.src = url; media.addEventListener('error', () => { if (token === this.token) this.message('浏览器不支持此媒体编码', '可以使用下方按钮保存文件，并在本地播放器打开。'); }); this.stage.replaceChildren(media);
      } else if (entry.kind === 'document' || entry.kind === 'unity') await this.showText(entry, token);
      else if (entry.kind === 'world') this.message('世界资源暂不支持预览', '可以在 Unity 中打开场景；此页面不执行包内脚本。', 'cube');
      else this.message('暂不支持此格式的可视预览', `${extension(entry.path).slice(1).toUpperCase() || '此文件'} 可在文件清单中保存到本地查看。`, kindIcon(entry.kind));
      if (token === this.token) {
        const download = button('保存此文件', 'download', () => this.download(entry), 'text-button'); this.stats.replaceChildren(el('span', '', entry.path), download); this.renderWarnings();
      }
    } catch (error) {
      if (token !== this.token) return;
      this.message(error.code === 'PASSWORD_REQUIRED' ? '此资源需要密码' : '暂时无法展示', friendlyError(error), error.code === 'PASSWORD_REQUIRED' ? 'lock' : 'info');
      if (error.code === 'PASSWORD_REQUIRED') this.password.focus();
    }
  }
  async showModel(resource, entry, token, texture) {
    const engine = await import('../viewer/engine.js');
    const loaded = await engine.loadModel(resource, entry, this.app.catalog, this.app.images, { progress: text => { if (token === this.token) this.setBusy(text); } });
    if (token !== this.token) { engine.releaseObject(loaded.object); return; }
    const canvas = el('canvas', 'model-canvas'); canvas.setAttribute('aria-label', '3D 模型预览'); this.stage.replaceChildren(canvas); this.viewer = new engine.ModelViewer(canvas); loaded.entry = entry; this.viewer.set(loaded);
    this.modelSelect.value = entry.id; this.loadedWarnings = loaded.warnings;
    const hints = el('div', 'scene-hints'); hints.append(el('span', '', '拖动旋转 · 滚轮缩放 · 右键平移'), el('span', '', '贴图原色')); this.stage.append(hints);
    const performance = el('div', 'scene-performance', `${loaded.stats.triangles.toLocaleString()} 三角形 · ${loaded.stats.loadMs.toLocaleString()} ms`); this.stage.append(performance);
    this.materialControls(texture);
    if (texture) {
      const matches = this.viewer.materials().filter(item => { const name = comparisonKey(item.material.name); return name.length > 2 && comparisonKey(texture.name).includes(name); });
      if (matches.length) { await this.viewer.texture(texture, this.app.images, matches.map(item => item.index)); toast('已为对应材质应用此贴图'); }
      else { this.loadedWarnings.push('已加载明确对应的模型；无法唯一确定贴图目标，请在右侧选择材质后应用'); this.renderWarnings(); }
    }
  }
  materialControls(selectedTexture) {
    this.materialSection.hidden = false; this.materialSection.replaceChildren(el('h3', '', '贴图与颜色'));
    const targetLabel = el('label', 'field-label', '目标材质'), target = el('select'); target.setAttribute('aria-label', '目标材质'); target.append(new Option(selectedTexture ? '请选择目标材质' : '全部材质', selectedTexture ? '' : 'all'));
    for (const item of this.viewer.materials()) target.append(new Option(item.name, String(item.index)));
    targetLabel.append(target);
    const selectLabel = el('label', 'field-label', '替换贴图'), select = el('select'); select.setAttribute('aria-label', '替换贴图'); select.append(new Option('选择本地贴图', ''));
    const textures = [...this.resource.entries.filter(entry => entry.kind === 'texture')]; if (selectedTexture && !textures.some(entry => entry.id === selectedTexture.id)) textures.unshift(selectedTexture);
    for (const entry of textures) select.append(new Option(entry.name, entry.id)); if (selectedTexture) select.value = selectedTexture.id; selectLabel.append(select);
    const apply = button('应用到所选材质', 'image', async () => {
      const texture = textures.find(entry => entry.id === select.value); if (!texture || !target.value) { toast('请先选择目标材质和贴图'); return; }
      try { apply.disabled = true; await this.viewer.texture(texture, this.app.images, target.value === 'all' ? undefined : [Number(target.value)]); toast('贴图已应用'); } catch (error) { toast(friendlyError(error)); } finally { apply.disabled = false; }
    });
    const colorLabel = el('label', 'color-field', '材质颜色'), color = el('input'); color.type = 'color'; color.value = '#ffffff'; color.setAttribute('aria-label', '材质颜色'); color.oninput = () => this.viewer?.color(color.value, target.value === 'all' ? undefined : [Number(target.value)]); colorLabel.append(color);
    this.materialSection.append(targetLabel, selectLabel, apply, colorLabel, el('p', 'muted', '原始贴图按材质引用匹配，不会随机套用无关图片。'));
  }
  async showImage(entry, token) {
    const data = await this.app.images.decode(entry), url = await this.app.images.url(entry); if (token !== this.token) return;
    const frame = el('div', 'image-frame checkerboard'), image = el('img'); image.src = url; image.alt = entry.name; frame.append(image);
    const controls = el('div', 'image-controls'), zoomLabel = el('label', '', '缩放'), zoom = el('input'); zoom.type = 'range'; zoom.min = '25'; zoom.max = '300'; zoom.value = '100'; zoom.setAttribute('aria-label', '贴图缩放'); zoom.oninput = () => { image.style.transform = `scale(${Number(zoom.value) / 100})`; };
    const alpha = button('透明背景', 'grid', () => frame.classList.toggle('checkerboard'), 'text-button'); zoomLabel.append(zoom); controls.append(el('span', '', `${data.width.toLocaleString()} × ${data.height.toLocaleString()}`), zoomLabel, alpha);
    this.stage.replaceChildren(frame, controls);
    const models = this.app.catalog.compatibleModels(this.resource);
    const hint = el('div', 'texture-model-hint');
    if (!this.resource.avatars.length) hint.append(icon('image', 16), el('span', '', '未标注适用模型，仅展示贴图。'));
    else if (!models.length) hint.append(icon('info', 16), el('span', '', `适用于 ${this.resource.avatars.join(' / ')}，尚未找到对应的本地模型。`));
    else {
      const choose = el('select'); choose.setAttribute('aria-label', '贴图对应的本地模型'); for (const model of models) choose.append(new Option(model.name, model.id));
      const load = async () => {
        const modelResource = models.find(model => model.id === choose.value); const current = this.token; this.setBusy('正在加载对应的本地模型…');
        try { await this.app.catalog.expand(modelResource, true); if (current !== this.token) return; const model = this.app.catalog.chooseModel(modelResource); if (!model) throw new Error('对应资源中没有可预览模型'); await this.showModel(modelResource, model, current, entry); }
        catch (error) { if (current === this.token) this.message('对应模型无法加载', friendlyError(error)); }
      };
      hint.append(choose, button('预览模型效果', 'cube', load, 'text-button'), button('查看原贴图', 'image', () => { this.imageOnly = true; this.preview(entry); }, 'text-button'));
      if (models.length === 1 && !this.imageOnly) { this.stage.append(hint); await load(); return; }
    }
    this.stage.append(hint);
  }
  async showText(entry, token) {
    const blob = await entry.read(); if (token !== this.token) return;
    if (extension(entry.path) === '.pdf') { const iframe = el('iframe', 'pdf-preview'); iframe.title = entry.name; iframe.src = await this.app.catalog.url(entry); this.stage.replaceChildren(iframe); return; }
    const text = await blob.slice(0, 2 * 1024 * 1024).text(); if (token !== this.token) return;
    const container = el('div', 'document-preview');
    if (entry.kind === 'unity') { const summary = describeUnity(text, entry.name), card = el('div', 'unity-summary'); card.append(icon('spark', 24), el('h3', '', summary.type)); for (const detail of summary.details) card.append(el('span', 'pill', detail)); container.append(card); }
    const pre = el('pre', '', text); container.append(pre); if (blob.size > 2 * 1024 * 1024) container.append(el('p', 'muted', '为保证浏览流畅，仅展示前 2 MB 内容。')); this.stage.replaceChildren(container);
  }
  renderFiles() {
    const pane = this.panes.files; pane.replaceChildren(); const search = el('input', 'file-search'); search.type = 'search'; search.placeholder = '在此资源中搜索文件或路径'; search.setAttribute('aria-label', '搜索资源内文件'); const list = el('div', 'file-tree');
    const draw = () => {
      const query = search.value.normalize('NFKC').toLowerCase(), entries = this.resource.entries.filter(entry => !query || entry.path.normalize('NFKC').toLowerCase().includes(query));
      const tree = { folders: new Map(), files: [] };
      for (const entry of entries) { const parts = entry.path.split('/'); let node = tree; for (const folder of parts.slice(0, -1)) { if (!node.folders.has(folder)) node.folders.set(folder, { folders: new Map(), files: [] }); node = node.folders.get(folder); } node.files.push(entry); }
      const nodes = (node, depth) => {
        const fragment = document.createDocumentFragment();
        for (const [name, child] of [...node.folders].sort(([a], [b]) => a.localeCompare(b))) { const details = el('details', 'file-folder'), summary = el('summary'); details.open = !!query || depth < 1; summary.append(icon('folder', 17), el('span', '', name)); const children = el('div', 'folder-children'); let filled = false; const fill = () => { if (!filled) { filled = true; children.append(nodes(child, depth + 1)); } }; details.addEventListener('toggle', () => { if (details.open) fill(); }); if (details.open) fill(); details.append(summary, children); fragment.append(details); }
        for (const entry of node.files.sort((a, b) => a.name.localeCompare(b.name))) { const row = button('', kindIcon(entry.kind), () => this.preview(entry), 'file-row'); row.title = entry.path; row.append(el('span', 'file-name', entry.name), el('span', 'file-size', sizeLabel(entry.size))); fragment.append(row); }
        return fragment;
      };
      list.replaceChildren(nodes(tree, 0)); if (!entries.length) list.append(el('p', 'muted', '没有匹配的文件。'));
    }; search.oninput = draw; draw(); pane.append(search, list);
  }
  renderTextures() {
    const pane = this.panes.textures; pane.replaceChildren(); const entries = this.resource.entries.filter(entry => entry.kind === 'texture');
    if (!entries.length) { pane.append(el('div', 'pane-empty', '此资源中没有可识别的贴图')); return; }
    const observer = new IntersectionObserver(events => { for (const event of events) if (event.isIntersecting) { observer.unobserve(event.target); const { entry, image, note } = event.target; this.app.images.url(entry).then(url => { image.src = url; note.textContent = ''; }).catch(error => { note.textContent = friendlyError(error); }); } }, { root: pane, rootMargin: '120px' });
    for (const entry of entries) { const card = button('', null, () => { this.imageOnly = true; this.preview(entry); }, 'texture-card'), image = el('img'), note = el('span', 'muted', '读取后预览'); image.alt = entry.name; image.loading = 'lazy'; card.append(image, el('strong', '', entry.name), note); card.entry = entry; card.image = image; card.note = note; pane.append(card); observer.observe(card); }
    this.textureObserver?.disconnect(); this.textureObserver = observer;
  }
  renderUnity() {
    const pane = this.panes.unity; pane.replaceChildren(el('h3', '', 'Unity 资源'));
    const entries = this.resource.entries.filter(entry => entry.kind === 'unity' || /\.(unitypackage|shader|cginc)$/i.test(entry.path));
    pane.append(el('p', 'muted', '查看材质、预制体、动画与控制器的原始配置。包内脚本与插件不会执行。'));
    for (const entry of entries) if (extension(entry.path) !== '.meta') {
      const row = button('', 'spark', () => extension(entry.path) === '.unitypackage' ? this.download(entry) : this.preview(entry), 'file-row'); row.append(el('span', 'file-name', entry.path), el('span', 'file-size', sizeLabel(entry.size))); pane.append(row);
    }
    if (!entries.length) pane.append(el('p', 'pane-empty', '此资源中没有 Unity 材质、预制体或动画文件。'));
  }
  renderExpressions() {
    const pane = this.panes.expressions; pane.replaceChildren(); const expressions = this.viewer?.expressions() || [], anims = this.resource.entries.filter(entry => /\.(anim|controller|overridecontroller|mask)$/i.test(entry.path));
    pane.append(el('h3', '', '模型表情'), el('p', 'muted', '调整当前模型的 BlendShape。更改只影响本次预览。'));
    if (expressions.length) {
      const search = el('input', 'file-search'); search.type = 'search'; search.placeholder = '筛选表情名称'; search.setAttribute('aria-label', '筛选表情'); const list = el('div', 'expression-list');
      for (const expression of expressions) { const row = el('label', 'expression-row'), range = el('input'), value = el('output', '', '0'); row.dataset.name = expression.name.toLowerCase(); range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '0'; range.oninput = () => { expression.set(Number(range.value) / 100); value.value = range.value; }; row.append(el('span', '', expression.name), range, value); list.append(row); }
      search.oninput = () => { for (const row of list.children) row.hidden = !row.dataset.name.includes(search.value.toLowerCase()); }; pane.append(search, list);
    } else pane.append(el('p', 'pane-empty', '当前没有已加载的模型表情。可在预览中选择模型。'));
    pane.append(el('h3', '', '动画与表情文件'));
    for (const entry of anims) pane.append(button(entry.path, 'spark', () => this.preview(entry), 'file-row'));
    if (!anims.length) pane.append(el('p', 'muted', '未找到独立的 Unity 动画或控制器文件。'));
    if (this.viewer?.loaded.animations.length) pane.append(el('p', 'muted', `模型内包含 ${this.viewer.loaded.animations.length} 个动画片段，此版本以静态姿态预览。`));
  }
  async download(entry) {
    try { const url = await this.app.catalog.url(entry), link = el('a'); link.href = url; link.download = basename(entry.path); link.click(); } catch (error) { toast(friendlyError(error)); }
  }
}
