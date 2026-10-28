/* 自願醫保保費規劃 — 介面 */
(function () {
  'use strict';
  const DATA = window.VHIS_DATA;
  const C = window.VHISCalc;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = { g: 'M', a: 30, p: 'supreme', o: 'advance-8000', s: 60, e: 90, br: 0.1, pr: 6, py: 5, inf: 0, m: 'annual', tax: '0', levy: 0, fm: 'plan', calc: 'need', ms: 2000, x: '' };
  const COLORS = { premium: '#b3261e', prep: '#9aa3b2', table: '#1D2B2A', bank: '#2459c9', plan: '#c26a06' };

  // ---------- 格式 ----------
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const money = (v) => 'HK$' + nf.format(Math.round(v));
  const pct = (v, d = 1) => (v * 100).toFixed(d).replace(/\.0+$/, '') + '%';
  const wan = (v) => {
    const a = Math.abs(v);
    if (a >= 10000) return '$' + (v / 10000).toFixed(a >= 1e6 ? 0 : a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '萬';
    return '$' + nf.format(v);
  };
  const dateZh = (iso) => {
    if (!iso) return '未知';
    const [y, m, d] = iso.split('-').map(Number);
    return `${y}年${m}月${d}日`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 狀態（同步去網址，方便分享） ----------
  let state = readHash();
  // 一步步顯示供款柱（唔入網址；列印時全部顯示）
  const story = { bank: false, plan: false, delay: false };

  function readHash() {
    const s = { ...DEFAULTS };
    try {
      const q = new URLSearchParams(location.hash.slice(1));
      for (const k of Object.keys(DEFAULTS)) {
        if (!q.has(k)) continue;
        const v = q.get(k);
        s[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
      }
    } catch (e) { /* 用預設 */ }
    if (!DATA.products[s.p]) s.p = DEFAULTS.p;
    return s;
  }
  function writeHash() {
    const q = new URLSearchParams();
    for (const k of Object.keys(DEFAULTS)) q.set(k, state[k]);
    try { history.replaceState(null, '', '#' + q.toString()); } catch (e) { /* ignore */ }
  }

  const product = () => DATA.products[state.p];
  const MAX_PLANS = 3;
  // 加多嘅計劃：網址入面用「產品~選項,產品~選項」
  function extraList() {
    return String(state.x || '').split(',').filter(Boolean).map((t) => {
      const [productId, optionId] = t.split('~');
      const p = DATA.products[productId];
      if (!p) return null;
      return { productId, optionId: p.options.some((o) => o.id === optionId) ? optionId : p.options[0].id };
    }).filter(Boolean).slice(0, MAX_PLANS - 1);
  }
  const setExtra = (list) => { state.x = list.map((pl) => `${pl.productId}~${pl.optionId}`).join(','); };
  const allPlans = () => [{ productId: state.p, optionId: state.o }, ...extraList()];
  const maxAgeAll = () => Math.max(...allPlans().map((pl) => DATA.products[pl.productId].maxAge));
  const planName = (pl) => {
    const p = DATA.products[pl.productId];
    const o = p.options.find((x) => x.id === pl.optionId) || p.options[0];
    return `${p.short.split('（')[0]} · ${o.label}`;
  };
  function optionsHtml(p) {
    const groups = [];
    for (const o of p.options) {
      let g = groups.find((x) => x.name === o.group);
      if (!g) groups.push((g = { name: o.group, items: [] }));
      g.items.push(o);
    }
    return groups.length === 1
      ? groups[0].items.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')
      : groups.map((g) => `<optgroup label="${esc(g.name)}">${g.items.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</optgroup>`).join('');
  }
  const productsHtml = () => Object.entries(DATA.products).map(([id, p]) => `<option value="${id}">${esc(p.short)}</option>`).join('');

  function renderExtraPlans() {
    const list = extraList();
    $('planNo1').textContent = list.length ? '第 1 份計劃' : '計劃';
    $('extraPlans').innerHTML = list.map((pl, i) => `<div class="plan-box" data-i="${i}">
        <div class="plan-box__head"><span>第 ${i + 2} 份計劃</span><button type="button" class="plan-box__del" data-del="${i}" aria-label="移除第 ${i + 2} 份計劃">✕ 移除</button></div>
        <label class="field"><span class="label">產品</span><select data-k="p">${productsHtml()}</select></label>
        <label class="field"><span class="label">計劃選項</span><select data-k="o">${optionsHtml(DATA.products[pl.productId])}</select></label>
      </div>`).join('');
    $('extraPlans').querySelectorAll('.plan-box').forEach((box) => {
      const pl = list[Number(box.dataset.i)];
      box.querySelector('[data-k="p"]').value = pl.productId;
      box.querySelector('[data-k="o"]').value = pl.optionId;
    });
    $('addPlan').hidden = list.length >= MAX_PLANS - 1;
  }

  // ---------- 選單 ----------
  function fillAges(sel, from, to, value) {
    const max = maxAgeAll();
    let html = '';
    for (let a = from; a <= to; a++) html += `<option value="${a}">${a}歲${a === max && max >= 121 ? '或以上' : ''}</option>`;
    sel.innerHTML = html;
    sel.value = String(Math.min(Math.max(value, from), to));
    return Number(sel.value);
  }

  function fillProducts() {
    $('product').innerHTML = productsHtml();
  }

  function fillOptions() {
    const p = product();
    $('option').innerHTML = optionsHtml(p);
    if (!p.options.some((o) => o.id === state.o)) state.o = p.options[0].id;
    $('option').value = state.o;
  }

  function syncAges() {
    const max = maxAgeAll();
    state.a = fillAges($('currentAge'), 0, max, state.a);
    state.s = fillAges($('startAge'), state.a, max, state.s);
    state.e = fillAges($('endAge'), state.s, max, state.e);
  }

  function setSeg(id, value) {
    $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
  }

  function syncControls() {
    $('product').value = state.p;
    fillOptions();
    renderExtraPlans();
    syncAges();
    setSeg('genderSeg', state.g);
    setSeg('modeSeg', state.m);
    setSeg('focusSeg', state.fm);
    setSeg('calcSeg', state.calc);
    $('msWrap').hidden = state.calc !== 'fixed';
    if (document.activeElement !== $('monthlySaving')) $('monthlySaving').value = state.ms;
    $('ageRangeLabel').textContent = state.calc === 'fixed' ? '由幾歲開始用儲蓄交保費，目標交到幾歲' : '想用儲蓄交保費嘅年齡';
    setSeg('delayTabs', state.fm);
    $('bankRate').value = state.br;
    $('planRate').value = state.pr;
    $('planYears').value = state.py;
    $('inflation').value = state.inf;
    $('taxRate').value = state.tax;
    $('levy').checked = !!state.levy;
    const p = product();
    const ids = [...new Set(allPlans().map((pl) => pl.productId))];
    const hint = [`保費表生效日期：${ids.map((id) => `${ids.length > 1 ? DATA.products[id].short.split('（')[0] + ' ' : ''}${dateZh(DATA.products[id].effective)}`).join('、')}`];
    if (p.maxIssueAge != null) hint.push(`投保年齡 0–${p.maxIssueAge} 歲，${p.maxIssueAge + 1} 歲或以上只適用於續保`);
    hint.push(ids.length > 1 ? '幾份計劃嘅保費會逐年加埋一齊計' : p.maxAgeNote);
    if (ids.some((id) => DATA.products[id].supplementary)) hint.push('晉逸係附加保障，需附加於其他醫保計劃；呢度只計附加保障本身嘅保費');
    $('productHint').textContent = hint.join('。') + '。';
    $('bankRateOut').textContent = pct(state.br / 100);
    $('planRateOut').textContent = pct(state.pr / 100);
    $('planYearsOut').textContent = `${state.py} 年`;
    $('inflationOut').textContent = pct(state.inf / 100);
  }

  // ---------- 事件 ----------
  let raf = 0;
  function changed() {
    syncControls();
    writeHash();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  function bind() {
    $('product').addEventListener('change', (e) => { state.p = e.target.value; changed(); });
    $('option').addEventListener('change', (e) => { state.o = e.target.value; changed(); });
    $('addPlan').addEventListener('click', () => {
      const list = extraList();
      if (list.length >= MAX_PLANS - 1) return;
      const used = new Set(allPlans().map((pl) => pl.productId));
      const pid = ['lite', 'first', 'supreme', 'standard'].find((id) => !used.has(id)) || 'lite';
      list.push({ productId: pid, optionId: DATA.products[pid].options[0].id });
      setExtra(list);
      changed();
    });
    $('extraPlans').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const list = extraList();
      list.splice(Number(del.dataset.del), 1);
      setExtra(list);
      changed();
    });
    $('extraPlans').addEventListener('change', (e) => {
      const box = e.target.closest('.plan-box');
      if (!box) return;
      const list = extraList();
      const pl = list[Number(box.dataset.i)];
      if (e.target.dataset.k === 'p') { pl.productId = e.target.value; pl.optionId = DATA.products[pl.productId].options[0].id; }
      else pl.optionId = e.target.value;
      setExtra(list);
      changed();
    });
    $('currentAge').addEventListener('change', (e) => {
      const old = state.a;
      state.a = Number(e.target.value);
      // 如果之前係即刻用儲蓄交，跟住一齊郁
      if (state.s === old) state.s = state.a;
      changed();
    });
    $('startAge').addEventListener('change', (e) => { state.s = Number(e.target.value); changed(); });
    $('endAge').addEventListener('change', (e) => { state.e = Number(e.target.value); changed(); });
    $('monthlySaving').addEventListener('input', (e) => { state.ms = Math.max(0, Number(e.target.value) || 0); changed(); });
    $('levy').addEventListener('change', (e) => { state.levy = e.target.checked ? 1 : 0; changed(); });
    $('taxRate').addEventListener('change', (e) => { state.tax = e.target.value; changed(); });
    for (const [id, key] of [['bankRate', 'br'], ['planRate', 'pr'], ['planYears', 'py'], ['inflation', 'inf']]) {
      $(id).addEventListener('input', (e) => { state[key] = Number(e.target.value); changed(); });
    }
    for (const [id, key] of [['genderSeg', 'g'], ['modeSeg', 'm'], ['focusSeg', 'fm'], ['delayTabs', 'fm'], ['calcSeg', 'calc']]) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        state[key] = b.dataset.value;
        changed();
      });
    }
    $('resetBtn').addEventListener('click', () => { state = { ...DEFAULTS }; changed(); });
    $('printBtn').addEventListener('click', () => window.print());
    document.querySelectorAll('.step').forEach((btn) => btn.addEventListener('click', () => {
      const el = $(btn.dataset.for);
      if (btn.dataset.dir === '1') el.stepUp(); else el.stepDown();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    // 列印：圖表按 A4 闊度重新畫，印完還原
    const printW = 680;
    let storyBefore = null;
    window.addEventListener('beforeprint', () => {
      storyBefore = { ...story };
      Object.assign(story, { bank: true, plan: true, delay: true });
      render();
      $('printMeta').textContent = `列印日期：${dateZh(new Date().toISOString().slice(0, 10))}　·　只供規劃參考，並非保險公司文件`;
      Object.values(charts).forEach((c) => c.resize(printW, Math.round(printW * (c.canvas.id === "premiumChart" ? 0.34 : 0.32))));
    });
    window.addEventListener('afterprint', () => {
      if (storyBefore) { Object.assign(story, storyBefore); storyBefore = null; render(); }
      Object.values(charts).forEach((c) => c.resize());
    });
    $('copyLink').addEventListener('click', copyLink);
    $('story').addEventListener('click', (e) => {
      const all = e.target.closest('.story__all');
      if (all) {
        const on = !(story.bank && story.plan && story.delay);
        Object.assign(story, { bank: on, plan: on, delay: on });
        render();
        return;
      }
      const btn = e.target.closest('.story__btn');
      if (!btn || btn.disabled) return;
      story[btn.dataset.step] = !story[btn.dataset.step];
      render();
    });
    // 頂部第 2–4 格：未打開就撳一下打開（唔跳去下面），打開咗就跳去詳細內容
    document.querySelectorAll('.kpi[data-step]').forEach((tile) => tile.addEventListener('click', (e) => {
      const k = tile.dataset.step;
      const btn = document.querySelector(`.story__btn[data-step="${k}"]`);
      if (!story[k]) {
        e.preventDefault();
        if (btn && btn.disabled) return;
        story[k] = true;
        render();
      }
    }));
  }

  async function copyLink() {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('已複製連結，貼俾客戶就睇到同一個方案');
    } catch (e) {
      window.prompt('複製呢條連結：', url);
    }
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ---------- 計算 ----------
  function inputs() {
    return {
      productId: state.p,
      extraPlans: extraList(),
      optionId: state.o,
      gender: state.g,
      currentAge: state.a,
      startAge: state.s,
      endAge: state.e,
      inflation: state.inf / 100,
      levy: state.levy ? 0.001 : 0,
      mode: state.m,
      bankRate: state.br / 100,
      planRate: state.pr / 100,
      planYears: state.py,
      taxRate: Number(state.tax),
      calc: state.calc,
      monthlySaving: state.ms,
    };
  }

  function render() {
    const inp = inputs();
    const errs = C.validateInputs(DATA, inp);
    if (inp.calc === 'fixed' && !(inp.monthlySaving > 0)) errs.push('請輸入每月儲幾多');
    if (errs.length) {
      $('errors').hidden = false;
      $('errors').innerHTML = `<ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      $('resultBody').hidden = true;
      return;
    }
    let r;
    try {
      r = C.summarize(DATA, inp);
    } catch (e) {
      $('errors').hidden = false;
      $('errors').textContent = '計算出錯：' + e.message;
      $('resultBody').hidden = true;
      return;
    }
    $('errors').hidden = true;
    $('resultBody').hidden = false;
    renderCombo(inp, r);
    renderClient(inp, r);
    renderKpis(inp, r);
    renderFuture(inp, r);
    renderCompare(inp, r);
    renderDelay(inp, r);
    renderDetail(inp, r);
    renderAssumptions(inp, r);
  }

  // 年齡升幅 + 額外加價 = 合共
  function ageGrowth(r, inp) {
    const n = inp.endAge - inp.currentAge;
    const a = r.rows[0].table, b = r.rows[r.rows.length - 1].table;
    return n > 0 && a > 0 ? Math.pow(b / a, 1 / n) - 1 : 0;
  }
  function renderCombo(inp, r) {
    const ag = ageGrowth(r, inp);
    const total = (1 + ag) * (1 + inp.inflation) - 1;
    const f = (v) => (v * 100).toFixed(1) + '%';
    $('inflationCombo').innerHTML = `<span>年齡升幅平均 <b>${f(ag)}</b></span><span>＋ 額外加價 <b>${f(inp.inflation)}</b></span><span class="combo__eq">≈ 合共每年 <b>${f(total)}</b></span>`;
  }

  const plansLabel = () => allPlans().map(planName).join(' ＋ ');
  const modeInfo = () => C.PAYMENT_MODES[state.m];

  function renderClient(inp, r) {
    const ps = allPlans().map((pl) => DATA.products[pl.productId]);
    const tags = [
      `${ps.some((x) => x.gendered) ? (inp.gender === 'M' ? '男' : '女') + ' · ' : ''}現時 ${inp.currentAge} 歲`,
      plansLabel(),
      inp.calc === 'fixed'
        ? `每月儲 ${money(inp.monthlySaving)} · 目標 ${inp.startAge}–${inp.endAge} 歲用儲蓄交保費`
        : `目標 ${inp.startAge}–${inp.endAge} 歲用儲蓄交保費（${r.coverYears} 年）`,
    ];
    let warn = '';
    const issue = Math.min(...ps.map((x) => (x.maxIssueAge == null ? 999 : x.maxIssueAge)));
    if (issue < 999 && inp.currentAge > issue)
      warn = `<span class="tag tag--warn">${inp.currentAge} 歲只適用於續保，唔可以新投保</span>`;
    $('clientLine').innerHTML = tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('') + warn;
  }

  function renderKpis(inp, r) {
    const now = r.now;
    const mode = modeInfo();
    // 1 總共要交幾多保費
    $('kTotal').innerHTML = money(r.totalPayable);
    const s1 = [`${inp.startAge}–${inp.endAge} 歲，共 ${r.coverYears} 年`];
    s1.push(`今年保費 <b>${money(now.payable)}</b>（${state.m !== 'annual' ? `${mode.label}每期 ${money(now.perInstalment)}` : `約每月 ${money(now.payable / 12)}`}）`);
    if (inp.taxRate > 0) s1.push(`今年扣稅慳 ${money(r.tax.saved)}`);
    $('kTotalSub').innerHTML = s1.join('<br>');

    const f = focus(r);
    $('kBankTag').textContent = pct(inp.bankRate);
    $('kPlanTag').textContent = pct(inp.planRate);
    $('kBankTitle').textContent = inp.calc === 'fixed' ? '銀行夠交到幾歲' : '銀行要點儲';
    $('kPlanTitle').textContent = inp.calc === 'fixed' ? '儲蓄計劃夠交到幾歲' : '儲蓄計劃要點儲';
    if (inp.calc === 'fixed') return renderKpisFixed(inp, r, f);

    // 2 + 3 銀行 / 儲蓄計劃
    const b = r.bank, pl = r.plan;
    if (b.feasible) {
      $('kBank').innerHTML = `${money(b.monthly)}<small> / 月</small>`;
      $('kBankSub').innerHTML = `儲 ${b.years} 年（${b.depositFrom}–${b.depositTo} 歲）<br>總共拎出嚟 <b>${money(b.totalOutlay)}</b>`;
    } else {
      $('kBank').innerHTML = '<small>唔適用</small>';
      $('kBankSub').innerHTML = '即刻要用儲蓄交保費，<br>冇時間預先儲錢';
    }
    $('kPlan').innerHTML = `${money(pl.monthly)}<small> / 月</small>`;
    const s3 = [`供 ${pl.years} 年（${pl.depositFrom}–${pl.depositTo} 歲）`, `總共拎出嚟 <b>${money(pl.totalOutlay)}</b>`];
    if (b.feasible) {
      const dm = b.monthly - pl.monthly, dy = b.years - pl.years, dt = b.totalOutlay - pl.totalOutlay;
      const parts = [];
      if (Math.abs(dm) > 0.5) parts.push(`每月${dm > 0 ? '少' : '多'} ${money(Math.abs(dm))}`);
      if (dy !== 0) parts.push(`${dy > 0 ? '少' : '多'}儲 ${Math.abs(dy)} 年`);
      if (Math.abs(dt) > 0.5) parts.push(`總共${dt > 0 ? '少' : '多'}拎 ${money(Math.abs(dt))}`);
      if (parts.length) s3.push(`<span class="${dt > 0 ? 'good' : 'bad'}">比銀行${parts.join('、')}</span>`);
    }
    $('kPlanSub').innerHTML = s3.join('<br>');
    renderDelayKpi(inp, r);
    gateKpis(inp, r);
  }

  // 第 4 格：銀行同儲蓄計劃都計
  function renderDelayKpi(inp, r) {
    const fixed = inp.calc === 'fixed';
    const list = fixed ? r.fixed : r.scenarios;
    const s5 = list[1];
    const maxAge = maxAgeAll();
    const ks = s5 ? ['bank', 'plan'].filter((k) => s5[k].feasible && list[0][k].feasible) : [];
    if (!ks.length) {
      $('kDelayTag').textContent = '';
      $('kDelay').innerHTML = `${money(r.peak.payable)}<small> / 年</small>`;
      $('kDelaySub').innerHTML = `冇時間再遲。完全唔儲嘅話，${r.peak.age} 歲時每年要自己交（約每月 <b>${money(r.peak.payable / 12)}</b>）`;
      return;
    }
    $('kDelayTag').textContent = `遲 ${s5.delay} 年`;
    $('kDelay').innerHTML = `<div class="kd">${ks.map((k) => {
      const base = list[0][k], d = s5[k];
      const nm = k === 'bank' ? '銀行' : '儲蓄計劃';
      const v = fixed
        ? `${reachShort(base, maxAge)} → <b>${reachShort(d, maxAge)}</b><small> 歲</small>`
        : `$${nf.format(Math.round(base.monthly))} → <b>$${nf.format(Math.round(d.monthly))}</b><small> / 月</small>`;
      return `<div class="kd__row kd__row--${k}"><span>${nm}</span><span class="kd__v">${v}</span></div>`;
    }).join('')}</div>`;
    $('kDelaySub').innerHTML = fixed
      ? `${s5.age} 歲先開始儲，同樣每月 ${money(inp.monthlySaving)}，可以交到嘅年齡`
      : `${s5.age} 歲先開始儲，每月要儲嘅錢`;
  }

  // 未撳嘅步驟唔顯示數字
  function gateKpis(inp, r) {
    const hide = (id, step, hint) => {
      const tile = $(id).closest('.kpi');
      tile.classList.toggle('kpi--locked', !story[step]);
      tile.setAttribute('aria-pressed', String(!!story[step]));
      if (!story[step]) {
        $(id).innerHTML = `<span class="kpi__reveal">撳呢度睇 ${{ bank: '①', plan: '②', delay: '③' }[step]}</span>`;
        $(id + 'Sub').innerHTML = hint;
      }
    };
    const fixed = inp.calc === 'fixed';
    hide('kBank', 'bank', fixed ? `每月儲 ${money(inp.monthlySaving)} 入銀行，夠交到幾歲？` : '放銀行儲，每月要儲幾多、儲幾耐？');
    hide('kPlan', 'plan', fixed ? `每月儲 ${money(inp.monthlySaving)} 落儲蓄計劃，夠交到幾歲？` : '用儲蓄計劃，每月要儲幾多、儲幾耐？');
    hide('kDelay', 'delay', '遲幾年先開始儲，差幾遠？');
  }

  function renderKpisFixed(inp, r, f) {
    const fx = f.fx;
    const maxAge = maxAgeAll();
    const one = (id, res, need) => {
      if (!res.feasible) { $(id).innerHTML = '<small>唔適用</small>'; $(id + 'Sub').innerHTML = '即刻要用儲蓄交保費，<br>冇時間預先儲錢'; return; }
      $(id).innerHTML = res.runOutAge == null || res.lastPaidAge >= res.withdrawFrom
        ? `交到 ${reachShort(res, maxAge)}<small> 歲</small>` : '<small>一年都唔夠交</small>';
      const t = [`每月 ${money(res.monthly)} × ${res.years} 年，${res.withdrawFrom} 歲起交保費`];
      if (res.reachesTarget) t.push(`✓ 夠交到 ${inp.endAge} 歲，仲剩 <b>${money(res.leftoverAtTarget)}</b>`);
      else {
        t.push(`${res.runOutAge}–${inp.endAge} 歲要自己交 <b>${money(res.shortfall)}</b>`);
        if (need.feasible) t.push(`想夠交到 ${inp.endAge} 歲，每月要儲 ${money(need.monthly)}`);
      }
      $(id + 'Sub').innerHTML = t.join('<br>');
    };
    one('kBank', r.fixed[0].bank, r.bank);
    one('kPlan', r.fixed[0].plan, r.plan);

    renderDelayKpi(inp, r);
    gateKpis(inp, r);
  }

  // 主要展示方案（銀行冇儲錢時間就自動用儲蓄計劃）
  function focus(r) {
    const inp = inputs();
    let kind = state.fm === 'bank' ? 'bank' : 'plan';
    let note = '';
    if (!r[kind].feasible) { note = '冇時間預先儲錢，銀行方案唔適用'; kind = 'plan'; }
    const fx = r.fixed ? r.fixed[0][kind] : null;
    const label = kind === 'plan' ? `儲蓄計劃 ${pct(inp.planRate)}` : `銀行 ${pct(inp.bankRate)}`;
    return { kind, label, note, fx, name: kind === 'plan' ? '儲蓄計劃' : '銀行' };
  }

  // 定數模式：目標期總保費拆做「供款期內自己交 / 儲蓄支付 / 錢用完自己交」
  function fixedSplit(inp, r, f) {
    if (inp.calc !== 'fixed' || !f.fx || !f.fx.feasible) return null;
    const fx = f.fx;
    const sumR = (a, b) => r.rows.filter((x) => x.age >= a && x.age <= b).reduce((t, x) => t + x.payable, 0);
    const bFrom = inp.startAge, bTo = Math.min(fx.withdrawFrom - 1, inp.endAge);
    const sFrom = Math.max(fx.withdrawFrom, inp.startAge);
    const sTo = Math.min(fx.runOutAge == null ? inp.endAge : fx.runOutAge - 1, inp.endAge);
    const oFrom = fx.runOutAge == null ? null : Math.max(fx.runOutAge, inp.startAge);
    const before = { from: bFrom, to: bTo, years: Math.max(bTo - bFrom + 1, 0), amount: fx.before };
    const save = { from: sFrom, to: sTo, years: Math.max(sTo - sFrom + 1, 0), amount: sTo >= sFrom ? sumR(sFrom, sTo) : 0 };
    const out = oFrom != null && oFrom <= inp.endAge
      ? { from: oFrom, to: inp.endAge, years: inp.endAge - oFrom + 1, amount: fx.shortfall }
      : { years: 0, amount: 0 };
    // 錢用完嗰年仍然夠交部分，計入儲蓄支付
    if (out.years > 0 && fx.partial > 0.5) save.amount += fx.partial;
    return { before, save, out };
  }

  // 每一歲由邊個交保費（跟主要展示方案）
  // 圖表用邊個方法講「邊個交」：只撳咗一個就跟嗰個；兩個都撳就跟主要展示方案；未撳就淨係講目標
  function chartFocus(r) {
    if (!story.bank && !story.plan) return null;
    const f = focus(r);
    let kind = f.kind;
    if (story.bank && !story.plan && r.bank.feasible) kind = 'bank';
    else if (story.plan && !story.bank) kind = 'plan';
    return { kind, name: kind === 'plan' ? '儲蓄計劃' : '銀行', fx: r.fixed ? r.fixed[0][kind] : null };
  }

  function payerMap(r, inp, ck = chartFocus(r)) {
    const f = ck;
    const m = {};
    for (const x of r.rows) {
      let who = 'self';
      if (x.age >= inp.startAge) {
        if (!f) who = 'target';
        else if (inp.calc === 'fixed') {
          const fx = f.fx;
          if (fx && fx.feasible && x.age >= fx.withdrawFrom && (fx.runOutAge == null || x.age < fx.runOutAge)) who = 'save';
          else if (fx && fx.feasible && fx.runOutAge != null && x.age >= fx.runOutAge) who = 'out';
        } else {
          const res = r[f.kind];
          if (res.feasible && x.age >= res.withdrawFrom) who = 'save';
        }
      }
      m[x.age] = who;
    }
    return m;
  }
  function ranges(map, ages, who) {
    const out = [];
    for (const a of ages) {
      if (map[a] !== who) continue;
      const last = out[out.length - 1];
      if (last && last[1] === a - 1) last[1] = a; else out.push([a, a]);
    }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  }
  const reachShort = (fx, maxAge) => (fx.runOutAge == null ? `${maxAge}+` : `${fx.lastPaidAge}`);
  const reachText = (fx, maxAge) => (fx.runOutAge == null ? `${maxAge} 歲以上` : fx.lastPaidAge < fx.withdrawFrom ? '一年都唔夠' : `${fx.lastPaidAge} 歲`);

  // ---------- 圖表 ----------
  const charts = {};
  // 喺保費圖入面標示總保費
  let premiumLabels = [];
  const totalLabelPlugin = {
    id: 'totalLabel',
    afterDatasetsDraw(ch) {
      if (ch.canvas.id !== 'premiumChart' || !premiumLabels.length) return;
      const { ctx, chartArea, scales } = ch;
      const narrow = chartArea.width < 520;
      const fam = Chart.defaults.font.family;
      const rowH = narrow ? 50 : 58;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const drawn = [];
      for (const L of premiumLabels) {
        if (narrow && L.row > 0) continue; // 手機太窄，上面拆分條已經有
        const x0 = scales.x.getPixelForValue(L.from);
        const x1 = scales.x.getPixelForValue(L.to);
        const top = chartArea.top + 6 + L.row * rowH;
        ctx.font = `900 ${narrow ? 15 : 18}px ${fam}`;
        const tw = Math.max(ctx.measureText(L.value).width, (ctx.font = `500 ${narrow ? 11 : 12}px ${fam}`, ctx.measureText(L.title).width));
        const cx = Math.max(chartArea.left + tw / 2 + 2, Math.min((x0 + x1) / 2, chartArea.right - tw / 2 - 2));
        // 同一行撞埋就唔畫
        if (drawn.some((d) => d.row === L.row && Math.abs(d.cx - cx) < (d.tw + tw) / 2 + 8)) continue;
        drawn.push({ row: L.row, cx, tw });
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = 4;
        ctx.font = `500 ${narrow ? 11 : 12}px ${fam}`;
        ctx.fillStyle = '#4a5468';
        ctx.strokeText(L.title, cx, top + (narrow ? 11 : 13));
        ctx.fillText(L.title, cx, top + (narrow ? 11 : 13));
        ctx.font = `900 ${narrow ? 15 : 18}px ${fam}`;
        ctx.fillStyle = L.color;
        ctx.strokeText(L.value, cx, top + (narrow ? 29 : 33));
        ctx.fillText(L.value, cx, top + (narrow ? 29 : 33));
        // 範圍線
        const ly = top + (narrow ? 37 : 42);
        ctx.strokeStyle = L.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x0, ly); ctx.lineTo(x1, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x0, ly - 4); ctx.lineTo(x0, ly + 4);
        ctx.moveTo(x1, ly - 4); ctx.lineTo(x1, ly + 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  };
  Chart.register(totalLabelPlugin);
  function chart(id, config) {
    if (charts[id]) {
      charts[id].data = config.data;
      charts[id].options = config.options;
      charts[id].update('none');
    } else {
      charts[id] = new Chart($(id), config);
    }
  }
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = '#4a5468';
  const baseOptions = (extra = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: (c) => (c.parsed.y == null ? null : `${c.dataset.label}：${money(c.parsed.y)}`) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: { beginAtZero: true, grid: { color: '#efece4' }, ticks: { callback: (v) => wan(v) } },
    },
    ...extra,
  });

  // 紅色斜紋（遲儲供款柱）
  const stripeCache = {};
  function stripes(kind) {
    if (stripeCache[kind]) return stripeCache[kind];
    const rgb = kind === 'bank' ? '36,89,201' : '194,106,6';
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = `rgba(${rgb},.18)`; x.fillRect(0, 0, 8, 8);
    x.strokeStyle = `rgba(${rgb},.95)`; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
    stripeCache[kind] = x.createPattern(c, 'repeat');
    return stripeCache[kind];
  }
  // 遲儲睇邊個方法：撳咗邊個就睇邊個；兩個都未撳就兩個都睇
  function delayKinds(delayS) {
    let ks = ['bank', 'plan'].filter((k) => story[k]);
    if (!ks.length) ks = ['bank', 'plan'];
    return ks.filter((k) => delayS[k].feasible);
  }

  // 三個掣同埋每一步嘅講解
  function renderStory(inp, r, f, dep, delayS, canBank, canDelay) {
    const btns = $('story').querySelectorAll('.story__btn');
    btns.forEach((b) => {
      const k = b.dataset.step;
      b.disabled = (k === 'bank' && !canBank) || (k === 'delay' && !canDelay);
      b.setAttribute('aria-pressed', String(!!story[k] && !b.disabled));
    });
    $('storyDelayLabel').textContent = delayS ? `遲 ${delayS.delay} 年先儲` : '遲儲';
    $('storyAll').textContent = story.bank && story.plan && story.delay ? '全部收埋' : '全部顯示';
    const maxAge = maxAgeAll();
    const fixed = inp.calc === 'fixed';
    const notes = [];
    const b = dep.bank, p = dep.plan;
    if (story.bank && canBank) {
      notes.push(['bank', '①', fixed
        ? `銀行 ${pct(inp.bankRate)}：${b.depositFrom}–${b.depositTo} 歲每月儲 <b>${money(b.monthly)}</b>，儲 ${b.years} 年，夠交到 <b>${reachText(b, maxAge)}</b>${b.reachesTarget ? '' : `，之後要自己交 ${money(b.shortfall)}`}。`
        : `銀行 ${pct(inp.bankRate)}：${b.depositFrom}–${b.depositTo} 歲每月要儲 <b>${money(b.monthly)}</b>，儲 ${b.years} 年，總共拎出嚟 <b>${money(b.totalOutlay)}</b>。`]);
    }
    if (story.plan) {
      let t = fixed
        ? `儲蓄計劃 ${pct(inp.planRate)}：${p.depositFrom}–${p.depositTo} 歲每月儲 <b>${money(p.monthly)}</b>，供 ${p.years} 年，夠交到 <b>${reachText(p, maxAge)}</b>${p.reachesTarget ? '' : `，之後要自己交 ${money(p.shortfall)}`}。`
        : `儲蓄計劃 ${pct(inp.planRate)}：${p.depositFrom}–${p.depositTo} 歲每月要儲 <b>${money(p.monthly)}</b>，供 ${p.years} 年，總共拎出嚟 <b>${money(p.totalOutlay)}</b>。`;
      if (canBank) {
        if (fixed) {
          const dy = p.paidYears - b.paidYears;
          if (dy !== 0) t += ` 同樣每月 ${money(p.monthly)}，比銀行<b class="${dy > 0 ? 'good' : 'bad'}">${dy > 0 ? '多' : '少'}交 ${Math.abs(dy)} 年</b>保費。`;
        } else {
          const parts = [];
          const dm = b.monthly - p.monthly, dy = b.years - p.years, dt = b.totalOutlay - p.totalOutlay;
          if (Math.abs(dm) > 0.5) parts.push(`每月${dm > 0 ? '少' : '多'} ${money(Math.abs(dm))}`);
          if (dy !== 0) parts.push(`${dy > 0 ? '少' : '多'}儲 ${Math.abs(dy)} 年`);
          if (Math.abs(dt) > 0.5) parts.push(`總共${dt > 0 ? '少' : '多'}拎 ${money(Math.abs(dt))}`);
          if (parts.length) t += ` 比銀行<b class="${dt > 0 ? 'good' : 'bad'}">${parts.join('、')}</b>。`;
        }
      }
      if (p.withdrawFrom > inp.startAge) t += ` 要供滿先可以提取，${inp.startAge}–${p.withdrawFrom - 1} 歲保費仍然自己交。`;
      notes.push(['plan', '②', t]);
    }
    if (story.delay && canDelay) {
      const lines = delayKinds(delayS).map((k) => {
        const nm = k === 'bank' ? '銀行' : '儲蓄計劃';
        const base = (fixed ? r.fixed : r.scenarios)[0][k];
        const d = delayS[k];
        if (fixed) {
          const lost = base.paidYears - d.paidYears;
          return `${nm}：同樣每月 ${money(d.monthly)}，由交到 ${reachText(base, maxAge)} 變成只夠交到 <b>${reachText(d, maxAge)}</b>${lost > 0 ? `（<b class="bad">少交 ${lost} 年</b>）` : ''}`;
        }
        const up = d.monthly - base.monthly;
        return `${nm}：每月由 ${money(base.monthly)} 變 <b>${money(d.monthly)}</b>（<b class="bad">多 ${money(up)}，+${pct(up / base.monthly, 0)}</b>）`;
      });
      notes.push(['delay', '③', `遲 ${delayS.delay} 年（${delayS.age} 歲）先開始儲：<br>${lines.join('<br>')}`]);
    }
    $('storyNotes').innerHTML = notes.length
      ? notes.map(([k, n, t]) => `<div class="story-note story-note--${k}"><span class="story-note__n">${n}</span><p>${t}</p></div>`).join('')
      : '<p class="hint story-empty no-print">撳上面嘅掣，一步步喺圖上加入供款柱。</p>';
  }

  // 幾份計劃：各佔總保費幾多
  const MIX_COLORS = ['#0E5E57', '#00A758', '#7FB8A8'];
  function mixHtml(inp, r) {
    const plans = allPlans();
    if (plans.length < 2) return '';
    const cover = r.rows.filter((x) => x.covered);
    const tot = plans.map((pl, i) => cover.reduce((t, x) => t + x.parts[i], 0));
    const T = tot.reduce((a, b) => a + b, 0);
    return `<div class="mix">
      <div class="mix__bar">${tot.map((v, i) => `<span style="width:${(v / T) * 100}%;background:${MIX_COLORS[i]}"></span>`).join('')}</div>
      <div class="mix__items">${plans.map((pl, i) => `<div class="mix__item"><i style="background:${MIX_COLORS[i]}"></i><span>${esc(planName(pl))}</span><b>${money(tot[i])}</b><small>${pct(tot[i] / T, 0)} · 今年 ${money(r.now.parts[i])}</small></div>`).join('')}</div>
    </div>`;
  }

  function renderFuture(inp, r) {
    const labels = r.rows.map((x) => `${x.age}歲`);
    const f = focus(r);
    const ck = chartFocus(r);
    const pm = payerMap(r, inp, ck);
    const ageList = r.rows.map((x) => x.age);
    const mode = C.PAYMENT_MODES[inp.mode];
    const isSave = (i) => pm[ageList[i]] === 'save' || pm[ageList[i]] === 'target';
    const isOut = (i) => pm[ageList[i]] === 'out';
    const saveCol = COLORS.premium, selfCol = COLORS.prep, outCol = '#4b5563';
    const datasets = [{
      label: '全年保費', order: 1, data: r.rows.map((x) => x.payable), pointRadius: 0, borderWidth: 2.5, tension: 0.2, fill: true,
      borderColor: selfCol, backgroundColor: 'rgba(154,163,178,.14)',
      segment: {
        borderColor: (c) => (isSave(c.p1DataIndex) ? saveCol : isOut(c.p1DataIndex) ? outCol : selfCol),
        backgroundColor: (c) => (isSave(c.p1DataIndex) ? 'rgba(179,38,30,.12)' : isOut(c.p1DataIndex) ? 'rgba(75,85,99,.16)' : 'rgba(154,163,178,.14)'),
      },
    }];
    const selfR = ranges(pm, ageList, 'self');
    const outR = ranges(pm, ageList, 'out');
    const saveR = ranges(pm, ageList, 'save');
    const targetR = ranges(pm, ageList, 'target');
    // 圖例用
    if (selfR.length) datasets.push({ label: `自己交（${selfR.join('、')}歲）`, data: [], borderColor: selfCol, backgroundColor: selfCol, legendOnly: true });
    if (saveR.length) datasets.push({ label: `由${ck.name}支付（${saveR.join('、')}歲）`, data: [], borderColor: saveCol, backgroundColor: saveCol, legendOnly: true });
    if (targetR.length) datasets.push({ label: `目標用儲蓄交（${targetR.join('、')}歲）`, data: [], borderColor: saveCol, backgroundColor: saveCol, legendOnly: true });
    if (outR.length) datasets.push({ label: `錢用完，自己交（${outR.join('、')}歲）`, data: [], borderColor: outCol, backgroundColor: outCol, legendOnly: true });
    if (inp.inflation > 0) {
      datasets.push({ label: '只計年齡升幅（未計額外加價）', data: r.rows.map((x) => x.table * mode.factor * mode.periods * (1 + inp.levy)), borderColor: COLORS.table, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false, tension: 0.2 });
    }
    // 供款柱：邊段時間儲錢、每年儲幾多（同保費用同一條金額軸）
    const dep = inp.calc === 'fixed' ? r.fixed[0] : r;
    const depBar = (res, nm, rate, col) => {
      if (!res || !res.feasible) return;
      datasets.push({
        type: 'bar', order: 2, deposit: true, monthly: res.monthly,
        label: `${nm} ${pct(rate)} 供款：每月 ${money(res.monthly)} × ${res.years} 年`,
        data: ageList.map((a) => (a >= res.depositFrom && a <= res.depositTo ? res.annual : null)),
        backgroundColor: col, borderRadius: 2, maxBarThickness: 14, categoryPercentage: 0.8, barPercentage: 0.9,
      });
    };
    const delayS = (inp.calc === 'fixed' ? r.fixed : r.scenarios)[1];
    const canBank = !!(dep.bank && dep.bank.feasible);
    const canDelay = !!(delayS && (delayS.bank.feasible || delayS.plan.feasible));
    if (story.bank && canBank) depBar(dep.bank, '銀行', inp.bankRate, 'rgba(36,89,201,.75)');
    if (story.plan) depBar(dep.plan, '儲蓄計劃', inp.planRate, 'rgba(194,106,6,.8)');
    if (story.delay && canDelay) {
      for (const k of delayKinds(delayS)) {
        const d = delayS[k];
        datasets.push({
          type: 'bar', order: 2, deposit: true, monthly: d.monthly,
          label: `遲 ${delayS.delay} 年先儲（${k === 'bank' ? '銀行' : '儲蓄計劃'}）供款：每月 ${money(d.monthly)} × ${d.years} 年`,
          data: ageList.map((a) => (a >= d.depositFrom && a <= d.depositTo ? d.annual : null)),
          backgroundColor: stripes(k), borderColor: k === 'bank' ? COLORS.bank : COLORS.plan, borderWidth: 1, borderRadius: 2, maxBarThickness: 14, categoryPercentage: 0.8, barPercentage: 0.9,
        });
      }
    }
    renderStory(inp, r, f, dep, delayS, canBank, canDelay);
    const opts = baseOptions();
    opts.plugins.legend.labels.filter = (item, d) => d.datasets[item.datasetIndex].label !== '全年保費';
    opts.plugins.tooltip.callbacks.label = (c) => {
      if (c.dataset.legendOnly || c.parsed.y == null) return null;
      if (c.dataset.deposit) return `${c.dataset.label.split(' 供款')[0]} 供款：每年 ${money(c.parsed.y)}（每月 ${money(c.dataset.monthly)}）`;
      if (c.dataset.label !== '全年保費') return `${c.dataset.label}：${money(c.parsed.y)}`;
      const who = pm[ageList[c.dataIndex]];
      const line = `全年保費：${money(c.parsed.y)}（${who === 'save' ? `由${ck.name}支付` : who === 'target' ? '目標用儲蓄交' : who === 'out' ? '儲蓄用完，自己交' : '自己交'}）`;
      const plans = allPlans();
      if (plans.length < 2) return line;
      const row = r.rows[c.dataIndex];
      return [line, ...plans.map((pl, i) => `  ${planName(pl)}：${money(row.parts[i])}`)];
    };
    premiumLabels = [{ from: `${inp.startAge}歲`, to: `${inp.endAge}歲`, title: `${inp.startAge}–${inp.endAge} 歲總保費（${r.coverYears} 年）`, value: money(r.totalPayable), color: COLORS.premium, row: 0 }];
    const split = ck ? fixedSplit(inp, r, ck) : null;
    if (split) {
      if (split.save.years > 0) premiumLabels.push({ from: `${split.save.from}歲`, to: `${split.save.to}歲`, title: `${ck.name}支付 ${split.save.from}–${split.save.to} 歲（${split.save.years} 年）`, value: money(split.save.amount), color: COLORS.premium, row: 1 });
      if (split.out.years > 0) premiumLabels.push({ from: `${split.out.from}歲`, to: `${split.out.to}歲`, title: `錢用完，自己交 ${split.out.from}–${split.out.to} 歲（${split.out.years} 年）`, value: money(split.out.amount), color: outCol, row: 1 });
    }
    opts.layout = { padding: { top: 4 } };
    opts.scales.y.grace = split ? '55%' : '22%';
    chart('premiumChart', { type: 'line', data: { labels, datasets }, options: opts });

    // 總保費大字
    const avg = r.totalPayable / r.coverYears;
    const splitHtml = split ? (() => {
      const T = r.totalPayable;
      const seg = (cls, v) => (v > 0.5 ? `<span class="split__seg split__seg--${cls}" style="width:${(v / T) * 100}%"></span>` : '');
      const item = (cls, label, x) => (x.amount > 0.5 ? `<div class="split__item"><i class="split__dot split__dot--${cls}"></i><span>${label}</span><b>${money(x.amount)}</b><small>${x.years} 年 · ${pct(x.amount / T, 0)}</small></div>` : '');
      return `<div class="split">
        <div class="split__bar">${seg('before', split.before.amount)}${seg('save', split.save.amount)}${seg('out', split.out.amount)}</div>
        <div class="split__items">
          ${item('before', `${split.before.from}–${split.before.to} 歲供款期內自己交`, split.before)}
          ${item('save', `${split.save.from}–${split.save.to} 歲由${ck.name}支付`, split.save)}
          ${item('out', `${split.out.from}–${split.out.to} 歲錢用完，自己交`, split.out)}
        </div></div>`;
    })() : '';
    $('totalHero').innerHTML = `<div class="total-hero__main"><span>${inp.startAge}–${inp.endAge} 歲要交嘅保費，總共</span><b>${money(r.totalPayable)}</b>
        <small>共 ${r.coverYears} 年 · 平均每年 ${money(avg)} · 約每月 ${money(avg / 12)}</small></div>
      <div class="total-hero__facts">
        <div class="fact-now"><span>今年（${inp.currentAge} 歲）保費</span><b>${money(r.now.payable)}</b></div>
        <div class="fact-peak"><span>${r.peak.age} 歲時保費</span><b>${money(r.peak.payable)}</b><em>係而家嘅 ${(r.peak.payable / r.now.payable).toFixed(1)} 倍</em></div>
      </div>${mixHtml(inp, r)}${splitHtml}`;

    // 講清楚邊段邊個交
    const parts = [];
    const res = ck ? (inp.calc === 'fixed' ? ck.fx : r[ck.kind]) : null;
    if (!ck) {
      if (inp.startAge > inp.currentAge) parts.push(`${inp.currentAge}–${inp.startAge - 1} 歲保費自己交`);
      parts.push(`目標由 ${inp.startAge} 歲起用儲落嘅錢交，交到 ${inp.endAge} 歲`);
    } else if (res && res.feasible) {
      if (inp.startAge > inp.currentAge) parts.push(`${inp.currentAge}–${inp.startAge - 1} 歲自己交，同時儲錢`);
      if (res.withdrawFrom > inp.startAge) parts.push(`${inp.startAge}–${Math.min(res.withdrawFrom - 1, inp.endAge)} 歲仲喺${ck.name}供款期，未可以提取，保費都係自己交`);
      if (saveR.length) parts.push(`${saveR.join('、')} 歲由${ck.name}支付`);
      if (inp.calc === 'fixed' && res.runOutAge != null && res.runOutAge <= inp.endAge) parts.push(`${res.runOutAge} 歲起錢用完，要自己交`);
    }
    $('futureSub').textContent = '';
    $('futureWho').textContent = parts.length ? parts.join('；') + '。' : '';

    const sub = [];
    if (inp.inflation > 0) sub.push(`當中 ${money(r.inflationExtra)} 嚟自保費表每年額外加價 ${pct(inp.inflation)}`);
    $('futureSub').textContent = sub.length ? sub.join('；') + '。' : '';

    const ages = [...new Set([inp.currentAge, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100, inp.endAge, r.peak.age])]
      .filter((a) => a >= inp.currentAge && a <= inp.endAge).sort((a, b) => a - b);
    $('growth').innerHTML = growthHtml(r, inp);
    $('milestones').innerHTML = ages.map((a) => {
      const row = r.rows.find((x) => x.age === a);
      const isNow = a === inp.currentAge;
      const x = isNow ? '而家' : `× ${(row.payable / r.now.payable).toFixed(1)}`;
      return `<div class="ms${isNow ? ' ms--now' : ''}"><div class="ms__age">${a} 歲${a === r.peak.age && !isNow ? ' · 最高' : ''}</div><div class="ms__v">${money(row.payable)}</div><div class="ms__x">${x}</div></div>`;
    }).join('');
  }

  function optCard(kind, res, inp, r, best, other) {
    const isBank = kind === 'bank';
    const name = isBank ? `銀行儲蓄 · ${pct(inp.bankRate)}` : `儲蓄計劃 · 假設 ${pct(inp.planRate)}`;
    if (!res.feasible) {
      return `<div class="opt opt--na"><div class="opt__name"><span>${name}</span></div><div class="opt__big">唔適用</div><div class="opt__note">${isBank ? '開始年齡等於現時年齡，冇時間預先儲錢。可以將「由幾歲開始用儲蓄交保費」較遲啲睇下。' : esc(res.reason)}</div></div>`;
    }
    const big = `${money(res.monthly)}<small> / 月</small>`;
    const alt = `即每年 ${money(res.annual)}，供 ${res.years} 年`;
    const isBest = best === res;
    const badge = isBest ? '<span class="best">★ 較著數</span>' : '';
    const vs = isBest && other && other.feasible
      ? `<div class="opt__vs">比${isBank ? '儲蓄計劃' : '銀行儲蓄'}少拎 <b>${money(other.totalOutlay - res.totalOutlay)}</b> 出嚟</div>` : '';
    const rows = [
      ['供款期', `${res.depositFrom}–${res.depositTo} 歲（${res.years} 年）`],
      ['總本金', money(res.principal)],
      [isBank ? '利息幫你交咗' : '回報幫你交咗', money(res.interest), 'good'],
    ];
    if (res.outOfPocket > 0.5) rows.push(['要自己額外交嘅保費', money(res.outOfPocket), 'warn']);
    rows.push(['總共要拎出嚟', `<b>${money(res.totalOutlay)}</b>`]);
    let note = '';
    if (!isBank) {
      note = `供款期內假設唔提取，${res.withdrawFrom} 歲起每年提取交保費。`;
      if (res.outOfPocket > 0.5) note += `${inp.startAge}–${res.withdrawFrom - 1} 歲到期嘅保費（${money(res.outOfPocket)}）要另外用現金交。`;
      note += '回報並非保證，以產品建議書為準。';
    } else {
      note = `${inp.startAge} 歲起每年由戶口提取當年保費，餘額繼續收息。`;
    }
    return `<div class="opt opt--${kind}${isBest ? ' opt--best' : ''}"><div class="opt__name"><span>${name}</span>${badge}</div>
      <div class="opt__big">${big}</div><div class="opt__alt">${alt}</div>${vs}
      <dl>${rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c || ''}">${v}</dd>`).join('')}</dl>
      <div class="opt__note">${note}</div></div>`;
  }

  const shownKinds = () => ['bank', 'plan'].filter((k) => story[k]);

  function renderCompare(inp, r) {
    $('secSave').hidden = !shownKinds().length;
    $('secDelay').hidden = !story.delay;
    $('totalTitle').textContent = inp.calc === 'fixed' ? '可以交到幾歲' : '總共要拎出嚟';
    if (inp.calc === 'fixed') return renderCompareFixed(inp, r);
    $('saveTitle').textContent = '要儲幾多';
    $('saveSub').textContent = '用同一套計法：每月月初供款、按月複息；到期每年年頭提取當年保費，最後剛好用完。★ 代表總共要拎出嚟嘅錢較少。';
    const show = shownKinds();
    const ok = show.map((k) => r[k]).filter((x) => x.feasible).sort((a, b) => a.totalOutlay - b.totalOutlay);
    const best = ok.length === 2 && ok[1].totalOutlay - ok[0].totalOutlay > 0.5 ? ok[0] : null;
    const saved = ok.length ? r.totalPayable - ok[0].totalOutlay : 0;
    const cards = { bank: optCard('bank', r.bank, inp, r, best, r.plan), plan: optCard('plan', r.plan, inp, r, best, r.bank) };
    const order = ['bank', 'plan'].filter((k) => show.includes(k));
    $('compare').classList.toggle('compare--one', order.length === 1);
    $('compare').innerHTML = order.map((k) => cards[k]).join('') +
      `<div class="baseline">如果完全唔預先儲：${inp.startAge}–${inp.endAge} 歲要自己交 <b>${money(r.totalPayable)}</b>。${ok.length && saved > 0 ? `預先儲最多可以少拎 ${money(saved)}（${pct(saved / r.totalPayable)}）出嚟。` : ''}</div>`;

    drawTotals(inp, r);
    drawBalance(inp, story.bank ? r.bank : null, story.plan ? r.plan : null);
  }

  function drawTotals(inp, r) {
    // 總共要拎出嚟：橫條
    const tot = [
      { name: `銀行 ${pct(inp.bankRate)}`, kind: 'bank', v: r.bank.feasible ? r.bank.totalOutlay : null, sub: r.bank.feasible ? `每月 ${money(r.bank.monthly)} × ${r.bank.years} 年` : '冇時間預先儲' },
      { name: `儲蓄計劃 ${pct(inp.planRate)}`, kind: 'plan', v: r.plan.totalOutlay, sub: `每月 ${money(r.plan.monthly)} × ${r.plan.years} 年${r.plan.outOfPocket > 0.5 ? ' ＋ 自己交部分保費' : ''}` },
      { name: '完全唔儲', kind: 'none', v: r.totalPayable, sub: `${inp.startAge}–${inp.endAge} 歲全部自己交` },
    ];
    for (let i = tot.length - 1; i >= 0; i--) if (tot[i].kind !== 'none' && !story[tot[i].kind]) tot.splice(i, 1);
    const tmax = Math.max(...tot.map((x) => x.v || 0));
    const minV = Math.min(...tot.filter((x) => x.v != null).map((x) => x.v));
    $('totalBars').innerHTML = tot.map((x) => `<div class="hbar${x.v === minV ? ' hbar--best' : ''}">
        <div class="hbar__name"><b>${x.name}</b><span>${x.sub}</span></div>
        <div class="hbar__track">${x.v != null ? `<span class="bar bar--${x.kind}" style="width:${Math.max((x.v / tmax) * 100, 1)}%"></span>` : ''}</div>
        <div class="hbar__v">${x.v != null ? money(x.v) : '—'}${x.v === minV ? '<span>★ 最少</span>' : ''}</div>
      </div>`).join('');

  }

  function drawBalance(inp, bank, plan) {
    const r = { bank, plan };
    const ages = [];
    for (let a = inp.currentAge; a <= inp.endAge; a++) ages.push(a);
    const series = (res) => {
      if (!res || !res.feasible) return ages.map(() => null);
      const m = new Map(res.balances.map((b) => [b.age, b.balance]));
      return ages.map((a) => (m.has(a) ? m.get(a) : null));
    };
    chart('balanceChart', {
      type: 'line',
      data: {
        labels: ages.map((a) => `${a}歲`),
        datasets: [
          ...(r.bank ? [{ label: '銀行儲蓄餘額', data: series(r.bank), borderColor: COLORS.bank, backgroundColor: 'rgba(36,89,201,.08)', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2 }] : []),
          ...(r.plan ? [{ label: '儲蓄計劃餘額', data: series(r.plan), borderColor: COLORS.plan, backgroundColor: 'rgba(194,106,6,.08)', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2 }] : []),
        ],
      },
      options: baseOptions(),
    });
  }

  function optCardFixed(kind, fx, inp, r, best) {
    const isBank = kind === 'bank';
    const name = isBank ? `銀行儲蓄 · ${pct(inp.bankRate)}` : `儲蓄計劃 · 假設 ${pct(inp.planRate)}`;
    if (!fx.feasible) {
      return `<div class="opt opt--na"><div class="opt__name"><span>${name}</span></div><div class="opt__big">唔適用</div><div class="opt__note">即刻要用儲蓄交保費，冇時間預先儲錢。</div></div>`;
    }
    const maxAge = maxAgeAll();
    const isBest = best === fx;
    const big = fx.lastPaidAge >= fx.withdrawFrom || fx.runOutAge == null
      ? `<span class="${fx.reachesTarget ? 'ok' : 'short'}">交到 ${reachText(fx, maxAge)}</span>`
      : '<span class="short">一年都唔夠交</span>';
    const rows = [
      ['供款', `每月 ${money(fx.monthly)} × ${fx.years} 年（${fx.depositFrom}–${fx.depositTo} 歲）`],
      ['總本金', money(fx.principal)],
      ['開始提取交保費', `${fx.withdrawFrom} 歲`],
      ['由儲蓄交咗', `${fx.paidYears} 年保費`],
    ];
    if (fx.before > 0.5) rows.push(['供款期內要自己交', money(fx.before), 'warn']);
    if (fx.reachesTarget) rows.push([`交到 ${inp.endAge} 歲仲剩`, money(fx.leftoverAtTarget), 'good']);
    else rows.push([`${fx.runOutAge}–${inp.endAge} 歲要自己交`, money(fx.shortfall), 'warn']);
    const need = r[kind];
    const tip = !fx.reachesTarget && need.feasible ? `想夠交到 ${inp.endAge} 歲，每月要儲 <b>${money(need.monthly)}</b>（多 ${money(need.monthly - fx.monthly)}）。` : '';
    const note = (isBank ? `${fx.withdrawFrom} 歲起每年由戶口提取當年保費，餘額繼續收息。` : `供款期內假設唔提取，${fx.withdrawFrom} 歲起每年提取交保費，餘額繼續滾存。回報並非保證。`) + (fx.runOutAge != null ? ` ${fx.runOutAge} 歲嗰年只夠交 ${money(fx.partial)}。` : '');
    return `<div class="opt opt--${kind}${isBest ? ' opt--best' : ''}"><div class="opt__name"><span>${name}</span>${isBest ? '<span class="best">★ 交得最耐</span>' : ''}</div>
      <div class="opt__big">${big}</div><div class="opt__alt">目標：${inp.startAge}–${inp.endAge} 歲</div>
      <dl>${rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c || ''}">${v}</dd>`).join('')}</dl>
      ${tip ? `<div class="opt__vs">${tip}</div>` : ''}
      <div class="opt__note">${note}</div></div>`;
  }

  function renderCompareFixed(inp, r) {
    const fb = r.fixed[0].bank, fp = r.fixed[0].plan;
    $('saveTitle').textContent = `每月儲 ${money(inp.monthlySaving)} 夠交到幾歲`;
    $('saveSub').textContent = '計埋利息：每月月初供款、按月複息；到期每年年頭提取當年保費，剩低嘅錢繼續滾存，直至用完。★ 代表交得最耐。';
    const show = shownKinds();
    const ok = [fb, fp].filter((x) => x.feasible).sort((a, b) => b.paidYears - a.paidYears || (b.leftoverAtTarget || 0) - (a.leftoverAtTarget || 0));
    const best = ok.length === 2 && (ok[0].paidYears > ok[1].paidYears || (ok[0].leftoverAtTarget || 0) - (ok[1].leftoverAtTarget || 0) > 1) ? ok[0] : null;
    const cards = { bank: optCardFixed('bank', fb, inp, r, show.length === 2 ? best : null), plan: optCardFixed('plan', fp, inp, r, show.length === 2 ? best : null) };
    const order = ['bank', 'plan'].filter((k) => show.includes(k));
    $('compare').classList.toggle('compare--one', order.length === 1);
    $('compare').innerHTML = order.map((k) => cards[k]).join('') +
      `<div class="baseline">目標 ${inp.startAge}–${inp.endAge} 歲總保費 <b>${money(r.totalPayable)}</b>，${r.peak.age} 歲時一年要 ${money(r.peak.payable)}。</div>`;

    // 可以交到幾歲：橫條（以目標年數為 100%）
    const target = inp.endAge - inp.startAge + 1;
    const maxAge = maxAgeAll();
    const items = [
      { name: `銀行 ${pct(inp.bankRate)}`, kind: 'bank', fx: fb },
      { name: `儲蓄計劃 ${pct(inp.planRate)}`, kind: 'plan', fx: fp },
    ].filter((x) => show.includes(x.kind));
    $('totalBars').innerHTML = items.map((x) => {
      const fx = x.fx;
      if (!fx.feasible) return `<div class="hbar"><div class="hbar__name"><b>${x.name}</b><span>冇時間預先儲</span></div><div class="hbar__track"></div><div class="hbar__v">—</div></div>`;
      const startOff = ((fx.withdrawFrom - inp.startAge) / target) * 100;
      const paidIn = Math.max(0, Math.min(fx.lastPaidAge, inp.endAge) - fx.withdrawFrom + 1);
      const w = (paidIn / target) * 100;
      return `<div class="hbar${best === fx ? ' hbar--best' : ''}">
        <div class="hbar__name"><b>${x.name}</b><span>每月 ${money(fx.monthly)} × ${fx.years} 年</span></div>
        <div class="hbar__track hbar__track--age"><span class="bar bar--gap" style="width:${Math.max(startOff, 0)}%"></span><span class="bar bar--${x.kind}" style="width:${w}%"></span></div>
        <div class="hbar__v">交到 ${reachText(fx, maxAge)}<span class="${fx.reachesTarget ? '' : 'miss'}">${fx.reachesTarget ? `✓ 夠交到 ${inp.endAge} 歲` : `之後自己交 ${money(fx.shortfall)}`}</span></div>
      </div>`;
    }).join('') + `<p class="hint">條長度代表目標 ${inp.startAge}–${inp.endAge} 歲入面，由儲蓄支付咗幾多年。</p>`;
    drawBalance(inp, story.bank ? fb : null, story.plan ? fp : null);
  }

  function renderDelayFixed(inp, r, f) {
    const k = f.kind;
    const maxAge = maxAgeAll();
    $('delaySub').textContent = `同樣每月儲 ${money(inp.monthlySaving)}，越遲開始，儲到嘅錢越少，可以交保費嘅年數就越短。`;
    $('keyBaseText').textContent = '可以由儲蓄交嘅年數';
    $('keyExtraText').textContent = '遲咗少交嘅年數';
    const base = r.fixed[0][k];
    const rows = r.fixed.filter((s) => s[k].feasible).map((s) => ({
      title: s.delay === 0 ? '而家開始' : `遲 ${s.delay} 年`, age: `${s.age} 歲開始儲`, fx: s[k], lost: base.paidYears - s[k].paidYears,
    }));
    const max = Math.max(...rows.map((x) => x.fx.paidYears), 1);
    const s5 = rows[1];
    const dl = s5 ? s5.title : '';
    const bothOk = s5 && base.reachesTarget && s5.fx.reachesTarget;
    const lead = s5
      ? (!bothOk && s5.lost > 0 ? `${dl}先開始儲，由交到 <b class="calm">${reachText(base, maxAge)}</b> 變成只夠交到 <b>${reachText(s5.fx, maxAge)}</b>（少交 ${s5.lost} 年）` : `${dl}先開始儲，到 ${inp.endAge} 歲剩錢由 <b class="calm">${money(base.leftoverAtTarget || 0)}</b> 變 <b>${money(s5.fx.leftoverAtTarget || 0)}</b>`)
      : `${inp.startAge} 歲就要開始用儲蓄交保費，冇時間再遲；如果唔儲，就要好似下面咁全部自己交`;
    $('delayLead').innerHTML = `<span class="delay-lead__tag">${esc(f.label)}</span>${lead}${f.note ? `<span class="hint">（${f.note}）</span>` : ''}`;
    $('delayLadder').innerHTML = rows.map((x, i) => {
      const w = (x.fx.paidYears / max) * 100;
      const lw = (Math.max(x.lost, 0) / max) * 100;
      const detail = `本金 ${money(x.fx.principal)}，${x.fx.withdrawFrom} 歲起交 ${x.fx.paidYears} 年` + (x.fx.reachesTarget ? ` · 到 ${inp.endAge} 歲仲剩 ${money(x.fx.leftoverAtTarget)}` : ` · ${x.fx.runOutAge}–${inp.endAge} 歲要自己交 ${money(x.fx.shortfall)}`);
      return `<div class="rung${i === 0 ? ' rung--now' : ''}">
        <div class="rung__who"><b>${x.title}</b><span>${x.age}</span></div>
        <div class="rung__bar"><span class="bar bar--${k}" style="width:${w}%"></span><span class="bar bar--extra" style="width:${lw}%"></span></div>
        <div class="rung__num"><b>交到 ${reachText(x.fx, maxAge)}</b><span>${i === 0 ? (x.fx.runOutAge == null ? '錢用唔晒' : `交 ${x.fx.paidYears} 年`) : x.fx.reachesTarget && base.reachesTarget ? `${inp.endAge} 歲剩錢少 ${money(base.leftoverAtTarget - x.fx.leftoverAtTarget)}` : x.lost > 0 ? `少交 ${x.lost} 年` : '一樣交到'}</span></div>
        <div class="rung__detail">${detail}</div>
      </div>`;
    }).join('');
  }

  function renderDelay(inp, r) {
    const f = focus(r);
    const k = f.kind;
    $('delayTabs').querySelector('[data-value="bank"]').disabled = !r.bank.feasible;
    setSeg('delayTabs', k);
    $('keyBase').className = `key key--${k}`;
    renderNoSave(inp, r);
    if (inp.calc === 'fixed') return renderDelayFixed(inp, r, f);
    $('delaySub').textContent = '同一筆保費，越遲開始儲，可以儲嘅時間越短，每月要儲嘅錢就越多。';
    $('keyBaseText').textContent = '而家開始每月要儲';
    $('keyExtraText').textContent = '遲咗每月要多儲';
    const base = r.scenarios[0][k];
    const rows = r.scenarios.filter((s) => s[k].feasible).map((s) => ({
      title: s.delay === 0 ? '而家開始' : `遲 ${s.delay} 年`,
      age: `${s.age} 歲開始儲`,
      res: s[k],
      up: s[k].monthly - base.monthly,
      extraTotal: s[k].totalOutlay - base.totalOutlay,
    }));
    const max = Math.max(...rows.map((x) => x.res.monthly));

    const s5 = rows[1];
    const lead = s5
      ? `${s5.title}先開始儲，每月要由 <b class="calm">${money(base.monthly)}</b> 加到 <b>${money(s5.res.monthly)}</b>（+${pct(s5.up / base.monthly, 0)}）`
      : `${inp.startAge} 歲就要開始用儲蓄交保費，冇時間再遲；如果唔儲，就要好似下面咁全部自己交`;
    $('delayLead').innerHTML = `<span class="delay-lead__tag">${esc(f.label)}</span>${lead}${f.note ? `<span class="hint">（${f.note}）</span>` : ''}`;

    $('delayLadder').innerHTML = rows.map((x, i) => {
      const baseW = (base.monthly / max) * 100;
      const extraW = (Math.max(x.up, 0) / max) * 100;
      const detail = `供 ${x.res.years} 年（${x.res.depositFrom}–${x.res.depositTo} 歲）· 總共拎出嚟 ${money(x.res.totalOutlay)}` +
        (i > 0 && x.extraTotal > 1000 ? `（多 ${money(x.extraTotal)}）` : '') +
        (x.res.outOfPocket > 0.5 ? ` · 另加自己交保費 ${money(x.res.outOfPocket)}` : '');
      return `<div class="rung${i === 0 ? ' rung--now' : ''}">
        <div class="rung__who"><b>${x.title}</b><span>${x.age}</span></div>
        <div class="rung__bar"><span class="bar bar--${k}" style="width:${baseW}%"></span><span class="bar bar--extra" style="width:${extraW}%"></span></div>
        <div class="rung__num"><b>${money(x.res.monthly)}<small> / 月</small></b><span>${i === 0 ? '每月要儲' : `每月多 ${money(x.up)}（+${pct(x.up / base.monthly, 0)}）`}</span></div>
        <div class="rung__detail">${detail}</div>
      </div>`;
    }).join('');

  }

  function renderNoSave(inp, r) {
    // 完全唔儲：講退休後要自己交幾多
    const at = (age) => r.rows.find((x) => x.age === age);
    const marks = [65, 75, 85, 95].filter((a) => a >= inp.startAge && a <= inp.endAge && a !== r.peak.age).slice(0, 2);
    const list = [...marks.map(at), r.peak].sort((a, b) => a.age - b.age);
    $('noSave').innerHTML = `<div class="nosave__head"><b>如果完全唔儲</b>：${inp.startAge}–${inp.endAge} 歲嘅保費全部要自己交，總共 ${money(r.totalPayable)}，而且越老越貴——通常已經退休、冇收入。</div>
      <div class="nosave__row">${list.map((x) => `<div class="nosave__cell"><span>${x.age} 歲時每年要交</span><b>${money(x.payable)}</b><small>約每月 ${money(x.payable / 12)}</small></div>`).join('')}</div>`;
  }

  // 按年齡段計平均每年升幅（複合）
  function growthBands(r, inp) {
    const P = (a) => r.rows.find((x) => x.age === a).payable;
    const from = inp.currentAge, to = inp.endAge;
    const bands = [];
    let s = from;
    while (s < to) {
      const e = Math.min((Math.floor(s / 10) + 1) * 10, to);
      bands.push({ s, e, rate: Math.pow(P(e) / P(s), 1 / (e - s)) - 1 });
      s = e;
    }
    const overall = to > from ? Math.pow(P(to) / P(from), 1 / (to - from)) - 1 : 0;
    return { overall, bands, from, to };
  }

  function growthHtml(r, inp) {
    const g = growthBands(r, inp);
    if (!g.bands.length) return '';
    const sign = (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    const heat = (v) => (v >= 0.06 ? 'hot' : v >= 0.03 ? 'warm' : v < -0.0005 ? 'down' : 'mild');
    return `<div class="growth">
      <div class="growth__main"><span>由 ${g.from} 歲到 ${g.to} 歲，保費平均每年升</span><b>${sign(g.overall)}</b>
        <small>${money(r.rows[0].payable)} → ${money(r.rows[r.rows.length - 1].payable)}${inp.inflation > 0 ? `，當中年齡升幅平均 ${(ageGrowth(r, inp) * 100).toFixed(1)}% ＋ 保費表額外加價每年 ${pct(inp.inflation)}` : '，只計年齡增長（未計保費表額外加價）'}</small></div>
      <div class="growth__bands">${g.bands.map((b) => `<div class="gb gb--${heat(b.rate)}"><span>${b.s}→${b.e} 歲</span><b>${sign(b.rate)}</b><small>每年</small></div>`).join('')}</div>
    </div>`;
  }

  function renderDetail(inp, r) {
    const mode = modeInfo();
    const pm = payerMap(r, inp);
    const fName = (chartFocus(r) || {}).name || '儲蓄';
    const differs = inp.inflation > 0 || inp.levy > 0 || state.m !== 'annual';
    const plans = allPlans();
    const multi = plans.length > 1;
    const head = ['年齡', '邊個交',
      ...(multi ? plans.map((pl) => esc(planName(pl))) : []),
      ...(differs ? ['保費表（年繳）', multi ? '合共全年實付' : '全年實付'] : [multi ? '合共全年保費' : '全年保費']),
      ...(state.m !== 'annual' ? [`${mode.label}每期`] : []), '比上年升幅'];
    const body = r.rows.map((x, i) => {
      const prev = r.rows[i - 1];
      const ch = prev ? x.payable / prev.payable - 1 : null;
      const chCls = ch == null ? '' : ch > 0.0005 ? 'up' : ch < -0.0005 ? 'down' : '';
      const who = pm[x.age];
      const cells = [`${x.age}歲`, who === 'save' ? `由${fName}支付` : who === 'target' ? '目標用儲蓄交' : who === 'out' ? '儲蓄用完，自己交' : '自己交',
        ...(multi ? x.parts.map((v) => money(v)) : []),
        ...(differs ? [money(x.table), money(x.payable)] : [money(x.payable)]),
        ...(state.m !== 'annual' ? [money(x.perInstalment)] : [])];
      return `<tr class="${who === 'save' || who === 'target' ? 'cover' : 'prep'}">${cells.map((c) => `<td>${c}</td>`).join('')}<td class="${chCls}">${ch == null ? '—' : (ch > 0 ? '+' : '') + pct(ch)}</td></tr>`;
    }).join('');
    const why = [];
    if (state.m !== 'annual') why.push(`${mode.label}全年貴 ${pct(mode.factor * mode.periods - 1, 0)}`);
    if (inp.inflation > 0) why.push(`保費表每年額外加價 ${pct(inp.inflation)}`);
    if (inp.levy > 0) why.push('0.1% 保費徵費');
    $('detailNote').innerHTML = differs
      ? `「保費表」係宏利保費表上嘅年繳價；「全年實付」已計${why.join('、')}，係客戶實際一年要交嘅錢。`
      : '年繳、未計保費調整及徵費，全年保費即係保費表上嘅價錢。';
    $('detailTable').innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>`;
  }

  function renderAssumptions(inp, r) {
    const list = [
      `保費表：${allPlans().map((pl) => { const p = DATA.products[pl.productId]; return `${p.name}（${p.en}）${dateZh(p.effective)}生效${p.supplementary ? '，只計附加保障保費' : ''}`; }).join('；')}。${allPlans().length > 1 ? '幾份計劃嘅保費逐年加埋計算。' : ''}年齡以最接近生日年齡計。`,
      inp.inflation > 0 ? `保費表每年額外加價假設 ${pct(inp.inflation)}（醫療通脹），喺年齡升幅之上，由現時年齡起每年複合計算。` : '未計保費表額外加價：只反映現行保費表隨年齡上升。',
      `繳費方式：${modeInfo().label}${state.m !== 'annual' ? `（每期 = 年繳保費 × ${modeInfo().factor}，全年等於年繳 × ${(modeInfo().factor * modeInfo().periods).toFixed(2)}）` : ''}${inp.levy ? '；已加 0.1% 保費徵費（未計徵費上限）' : '；未計保費徵費'}。`,
      r.bank.feasible ? `銀行儲蓄：年利率 ${pct(inp.bankRate)}，由 ${inp.currentAge} 歲儲到 ${inp.startAge - 1} 歲，${inp.startAge} 歲起每年提取。` : '銀行儲蓄：即刻要用儲蓄交保費，冇時間預先儲錢，唔適用。',
      `儲蓄計劃：假設年回報 ${pct(inp.planRate)}，供款 ${inp.planYears} 年，供款期後先開始提取；未供滿之前到期嘅保費要自己交。`,
      inp.calc === 'fixed'
        ? `每月儲定數：每月 ${money(inp.monthlySaving)}，每月月初供款、按月複息，每年年頭提取當年保費；錢用完之後嘅保費要自己交。`
        : '兩者均假設每月月初供款、按月複息（以年利率計），每年年頭提取當年保費，最後餘額為零。',
    ];
    const taxLine = inp.taxRate > 0
      ? `扣稅：按邊際稅率 ${pct(inp.taxRate, 0)}，今年可慳 <strong class="tax-hl">${money(r.tax.saved)}</strong>；${inp.startAge}–${inp.endAge} 歲累計約慳 <strong class="tax-hl">${money(r.tax.lifetimeSaved)}</strong>（每年最多扣 HK$8,000，假設稅制不變）。`
      : `扣稅：自願醫保合資格保費每名受保人每年最多可扣稅 HK$8,000，按最高累進稅率 17% 計，<strong class="tax-hl">每年最多慳 ${money(C.TAX_CAP * 0.17)}</strong>（上面數字未計扣稅；喺左邊揀邊際稅率可以計埋）。`;
    $('assumptions').innerHTML = list.map((t) => `<li>${esc(t)}</li>`).join('') + `<li class="tax-li">${taxLine}</li>`;
  }

  // ---------- 開始 ----------
  function init() {
    $('dataInfo').textContent = `${Object.values(DATA.products).map((p) => `${p.short.split('（')[0]} ${dateZh(p.effective)}`).join('、')} 生效版本`;
    fillProducts();
    bind();
    window.addEventListener('hashchange', () => { state = readHash(); syncControls(); render(); });
    syncControls();
    writeHash();
    render();
  }
  init();
})();
