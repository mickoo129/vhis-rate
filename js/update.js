/* 保費表更新工具：PDF → 檢查 → 比較 → 下載 premiums.js */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CURRENT = window.VHIS_DATA;
  const NEXT = JSON.parse(JSON.stringify(CURRENT));
  const changedProducts = new Set();
  const nf = new Intl.NumberFormat('en-US');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dateZh = (iso) => { if (!iso) return '未知'; const [y, m, d] = iso.split('-').map(Number); return `${y}年${m}月${d}日`; };

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf-3.11.174.worker.min.js';

  $('current').textContent = Object.values(CURRENT.products).map((p) => `${p.short} ${dateZh(p.effective)}`).join('、');

  // PDF → 一行行文字（同一高度嘅字砌返做一行）
  async function pdfLines(buf) {
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // PDF 有時會將同一個字疊印兩次，同一位置嘅重複字只保留一個
      const seen = new Set();
      const items = tc.items.filter((it) => {
        if (!it.str || !it.str.trim()) return false;
        const key = `${it.str}@${Math.round(it.transform[4])},${Math.round(it.transform[5])}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const rows = [];
      for (const it of items) {
        const x = it.transform[4];
        const y = it.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
        if (!row) rows.push((row = { y, items: [] }));
        row.items.push({ x, w: it.width || 0, h: Math.abs(it.transform[3]) || 8, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        // 同一個數字有時會被拆成幾段（例如「$17」「,419」），緊貼嘅就黐返埋
        let text = '';
        let prevEnd = null;
        for (const t of r.items.sort((a, b) => a.x - b.x)) {
          const gap = prevEnd == null ? Infinity : t.x - prevEnd;
          text += gap < t.h * 0.2 ? t.s : (text ? ' ' : '') + t.s;
          prevEnd = t.x + t.w;
        }
        lines.push(text);
      }
      lines.push('');
    }
    return lines;
  }

  function diff(oldP, newPremiums) {
    let changed = 0, cells = 0, sumPct = 0, n = 0, minPct = Infinity, maxPct = -Infinity;
    for (const [k, arr] of Object.entries(newPremiums)) {
      const old = oldP && oldP.premiums[k];
      if (!old) continue;
      arr.forEach((v, a) => {
        if (v == null || old[a] == null) return;
        cells++;
        if (v !== old[a]) changed++;
        const pc = v / old[a] - 1;
        sumPct += pc; n++;
        minPct = Math.min(minPct, pc); maxPct = Math.max(maxPct, pc);
      });
    }
    return { changed, cells, avg: n ? sumPct / n : 0, min: minPct, max: maxPct };
  }

  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

  function sampleTable(oldP, newPremiums, product) {
    const keys = Object.keys(newPremiums).slice(0, product.gendered ? 2 : 1);
    const ages = [0, 20, 30, 40, 50, 60, 65, 70, 80, 90, 100].filter((a) => a <= product.maxAge);
    const label = (k) => {
      const [g, id] = k.split('|');
      const o = product.options.find((x) => x.id === id);
      return `${g === 'M' ? '男 · ' : g === 'F' ? '女 · ' : ''}${o ? o.label : id}`;
    };
    return keys.map((k) => {
      const old = oldP.premiums[k] || [];
      const nu = newPremiums[k];
      return `<div class="table-wrap"><table class="detail"><thead><tr><th>${esc(label(k))}</th>${ages.map((a) => `<th>${a}歲</th>`).join('')}</tr></thead><tbody>
        <tr><td>現行</td>${ages.map((a) => `<td>${old[a] != null ? nf.format(old[a]) : '—'}</td>`).join('')}</tr>
        <tr><td>新表</td>${ages.map((a) => `<td>${nu[a] != null ? nf.format(nu[a]) : '—'}</td>`).join('')}</tr>
        <tr><td>變幅</td>${ages.map((a) => { const c = old[a] && nu[a] ? nu[a] / old[a] - 1 : null; return `<td class="${c > 0 ? 'up' : c < 0 ? 'down' : ''}">${c == null ? '—' : fmtPct(c)}</td>`; }).join('')}</tr>
      </tbody></table></div>`;
    }).join('');
  }

  async function handle(file) {
    const box = document.createElement('div');
    box.className = 'report';
    box.innerHTML = `<div class="report__head"><strong>${esc(file.name)}</strong><span class="badge">讀緊…</span></div>`;
    $('reports').appendChild(box);
    const setBadge = (txt, cls) => { const b = box.querySelector('.badge'); b.textContent = txt; b.className = 'badge ' + (cls || ''); };
    try {
      const lines = await pdfLines(await file.arrayBuffer());
      const r = window.VHISParser.parse(lines);
      window.__lastParsed = window.__lastParsed || {};
      if (r.error) { setBadge('唔認得', 'bad'); box.insertAdjacentHTML('beforeend', `<p class="bad">${esc(r.error)}</p>`); return; }
      window.__lastParsed[r.productId] = r;
      const product = CURRENT.products[r.productId];
      const v = window.VHISParser.validate(r, product);
      const premiums = {};
      for (const g of product.gendered ? ['M', 'F'] : ['U']) {
        for (const o of product.options) {
          const k = `${g}|${o.id}`;
          if (r.premiums[k]) premiums[k] = Array.from({ length: product.maxAge + 1 }, (_, a) => r.premiums[k][a] ?? null);
        }
      }
      const warnings = [...r.warnings, ...v.warnings];
      let html = `<p>${esc(product.name)} · 生效日期 <strong>${dateZh(r.effective)}</strong>（現行：${dateZh(product.effective)}）</p>`;
      if (v.errors.length) {
        setBadge('有錯誤，唔會更新', 'bad');
        html += `<ul class="bad">${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
        html += `<p class="hint">可能係 PDF 格式改咗，或者唔係標準保費表。呢份唔會寫入新檔案。</p>`;
        box.insertAdjacentHTML('beforeend', html);
        return;
      }
      const d = diff(product, premiums);
      const same = d.changed === 0;
      setBadge(same ? '同現行一樣' : `更新 ${nf.format(d.changed)} 個數字`, same ? 'same' : 'ok');
      html += `<p>${Object.keys(premiums).length} 個表、${nf.format(d.cells)} 個數字讀取完整。` +
        (same ? '所有數字同現行版本一樣。' : `平均變幅 <strong>${fmtPct(d.avg)}</strong>（最少 ${fmtPct(d.min)}，最多 ${fmtPct(d.max)}）。`) + '</p>';
      if (warnings.length) html += `<details class="warn"><summary>${warnings.length} 個提示（請核對）</summary><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`;
      if (!same) html += sampleTable(product, premiums, product);
      box.insertAdjacentHTML('beforeend', html);

      NEXT.products[r.productId] = { ...NEXT.products[r.productId], effective: r.effective || product.effective, maxIssueAge: r.maxIssueAge ?? product.maxIssueAge, renewOnlyFrom: r.renewOnlyFrom ?? product.renewOnlyFrom, premiums };
      if (!same || r.effective !== product.effective) changedProducts.add(r.productId);
      refreshActions();
    } catch (e) {
      setBadge('讀取失敗', 'bad');
      box.insertAdjacentHTML('beforeend', `<p class="bad">${esc(e.message || e)}</p>`);
    }
  }

  function refreshActions() {
    $('actions').hidden = false;
    const names = [...changedProducts].map((id) => CURRENT.products[id].short);
    $('actionHint').textContent = names.length ? `會更新：${names.join('、')}；其他計劃保持不變。` : '冇任何改動，唔使更新。';
    $('download').disabled = !names.length;
  }

  function serialize(data) {
    const body = JSON.stringify(data, (k, v) => (Array.isArray(v) && (typeof v[0] === 'number' || v[0] === null) ? JSON.stringify(v) : v), 1)
      .replace(/"(\[[\d,null]+\])"/g, '$1');
    return `/* 宏利自願醫保保費數據 — 由保費表 PDF 自動生成，請用 update.html 更新，唔好手改 */\nwindow.VHIS_DATA = ${body};\n`;
  }

  $('download').addEventListener('click', () => {
    NEXT.updated = new Date().toISOString().slice(0, 10);
    const text = serialize(NEXT);
    window.__lastOutput = text;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    a.download = 'premiums.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  async function take(list) {
    for (const f of list) if (/\.pdf$/i.test(f.name)) await handle(f);
  }
  $('files').addEventListener('change', (e) => take([...e.target.files]));
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drop--over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drop--over'); }));
  drop.addEventListener('drop', (e) => take([...e.dataTransfer.files]));
  window.__serialize = serialize;
})();
