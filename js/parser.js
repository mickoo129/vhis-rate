/*
 * 保費表 PDF 解析器（瀏覽器同 Node 共用）
 * 輸入：PDF 每一行文字（由左至右，用空格分隔）
 * 輸出：{ productId, effective, maxIssueAge, renewOnlyFrom, premiums: { "M|ward": [..] }, warnings: [] }
 */
(function (root) {
  'use strict';

  // 每個產品 PDF 嘅欄位對應（次序同 PDF 表格欄位一致）
  const COLUMNS = {
    standard: { width: 2, cols: () => ['M|std', 'F|std'] },
    first: {
      width: 3,
      cols: (s) => ['', '-mm', '-mmp'].map((suf) => `${s.gender}|${s.room}${suf}`),
    },
    supreme: {
      width: (s) => (s.tier === 'smart' ? 4 : 5),
      cols: (s) =>
        (s.tier === 'smart' ? [0, 22800, 45000, 100000] : [0, 8000, 22800, 45000, 100000]).map(
          (d) => `U|${s.tier}-${d}`
        ),
    },
    lite: {
      width: 4,
      cols: (s) => [0, 25000, 50000, 100000].map((d) => `U|${s.tier}-${d}`),
    },
  };

  const norm = (line) =>
    String(line)
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/[\s　]+/g, '');

  function detectProduct(allText) {
    const t = norm(allText);
    if (/晉逸|SupremeLiteVHIS/i.test(t)) return 'lite';
    if (/晉悅|SupremeVHISFlexiPlan/i.test(t)) return 'supreme';
    if (/全護航|FirstVHISFlexiPlan/i.test(t)) return 'first';
    if (/愛守護|ShelterVHISStandard/i.test(t)) return 'standard';
    return null;
  }

  function detectEffective(allText) {
    const t = norm(allText);
    const found = {};
    const re = /以下保費表由(\d{4})年(\d{1,2})月(\d{1,2})日開始生效/g;
    let m;
    while ((m = re.exec(t))) {
      const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      found[d] = (found[d] || 0) + 1;
    }
    const dates = Object.keys(found).sort();
    return { date: dates[dates.length - 1] || null, all: dates };
  }

  // 將一行拆成 [{age, renewOnly, values}]；唔係數據行就回傳 null
  function parseRow(line, width) {
    let s = String(line)
      .replace(/及以上\s*\*?/g, ' ')
      .replace(/&\s*above\s*\*?/gi, ' ')
      .replace(/\$/g, '')
      .replace(/(\d),(?=\d{3}\b)/g, '$1');
    let tokens = s.trim().split(/\s+/).filter(Boolean);
    // 「93 *」或「121 + *」咁樣拆開咗嘅星號 / 加號，黐返落前一格
    const merged = [];
    for (const tok of tokens) {
      if (/^[*+]+$/.test(tok) && merged.length) merged[merged.length - 1] += tok;
      else merged.push(tok);
    }
    tokens = merged;
    if (!tokens.length || !tokens.every((x) => /^\d+\+?\*?$/.test(x))) return null;
    if (tokens.length !== width + 1 && tokens.length !== 2 * (width + 1)) return null;
    const rows = [];
    for (let i = 0; i < tokens.length; i += width + 1) {
      const ageTok = tokens[i];
      const age = parseInt(ageTok, 10);
      const values = tokens.slice(i + 1, i + 1 + width).map(Number);
      if (age > 130 || values.some((v) => !(v >= 50))) return null; // 防止誤讀頁碼等
      rows.push({ age, renewOnly: ageTok.includes('*'), values });
    }
    return rows;
  }

  function parse(lines) {
    const allText = lines.join('\n');
    const productId = detectProduct(allText);
    const warnings = [];
    if (!productId) {
      return { error: '認唔到呢份係邊個計劃嘅保費表（愛守護 / 全護航 / 晉悅 / 晉逸）。' };
    }
    const eff = detectEffective(allText);
    if (!eff.date) warnings.push('搵唔到「以下保費表由…開始生效」嘅日期，請手動確認。');
    if (eff.all.length > 1) warnings.push(`份文件入面有多個生效日期：${eff.all.join('、')}，已採用最遲嗰個。`);

    const issueMatch = norm(allText).match(/年齡介乎0至(\d+)歲/);
    const maxIssueAge = issueMatch ? parseInt(issueMatch[1], 10) : null;

    const def = COLUMNS[productId];
    const state = { gender: null, room: null, tier: null, hkd: true, started: false };
    const premiums = {};
    let renewOnlyFrom = null;
    const conflicts = [];

    for (const raw of lines) {
      const n = norm(raw);
      if (/標準保費表|StandardPremiumSchedule/i.test(n)) state.started = true;
      // 段落標記
      if (productId === 'first') {
        if (/^普通房Ward$/.test(n)) state.room = 'ward';
        if (/Semi-privateRoom/.test(n)) state.room = 'semi';
        else if (/(^|[^-])PrivateRoom/.test(n)) state.room = 'private';
        if (/男性Male/.test(n)) state.gender = 'M';
        if (/女性Female/.test(n)) state.gender = 'F';
      }
      if (productId === 'supreme') {
        const m = n.match(/SupremeVHISFlexiPlan\((Smart|Advance|Deluxe)\)/i);
        if (m) state.tier = m[1].toLowerCase();
      }
      if (productId === 'lite') {
        const m = n.match(/Supplementary(?:Benefit|Bene.?t)\((Smart|Advance|Deluxe)\)/i);
        if (m) state.tier = m[1].toLowerCase();
        if (/StandardPremiumSchedule\(US\$\)/i.test(n)) state.hkd = false;
        if (/StandardPremiumSchedule\(HK\$\)/i.test(n)) state.hkd = true;
      }
      if (!state.started) continue;
      if (productId === 'first' && !(state.room && state.gender)) continue;
      if ((productId === 'supreme' || productId === 'lite') && !state.tier) continue;
      if (productId === 'lite' && !state.hkd) continue;

      const width = typeof def.width === 'function' ? def.width(state) : def.width;
      const rows = parseRow(raw, width);
      if (!rows) continue;
      const keys = def.cols(state);
      for (const r of rows) {
        if (r.renewOnly) renewOnlyFrom = renewOnlyFrom == null ? r.age : Math.min(renewOnlyFrom, r.age);
        keys.forEach((k, i) => {
          premiums[k] = premiums[k] || [];
          const prev = premiums[k][r.age];
          if (prev != null && prev !== r.values[i]) conflicts.push(`${k} ${r.age}歲：${prev} / ${r.values[i]}`);
          premiums[k][r.age] = r.values[i];
        });
      }
    }
    if (conflicts.length) warnings.push(`有 ${conflicts.length} 個年齡讀到兩個唔同數字，例如：${conflicts.slice(0, 3).join('；')}`);
    return { productId, effective: eff.date, maxIssueAge, renewOnlyFrom, premiums, warnings };
  }

  // 用產品目錄檢查完整性：每個選項 × 性別，0 至最高年齡都要有數
  function validate(parsed, product) {
    const errors = [];
    const warnings = [];
    const genders = product.gendered ? ['M', 'F'] : ['U'];
    for (const g of genders) {
      for (const opt of product.options) {
        const key = `${g}|${opt.id}`;
        const arr = parsed.premiums[key];
        const label = `${g === 'M' ? '男 ' : g === 'F' ? '女 ' : ''}${opt.label}`;
        if (!arr) {
          errors.push(`缺少「${label}」成個表`);
          continue;
        }
        const missing = [];
        for (let a = 0; a <= product.maxAge; a++) if (!(arr[a] > 0)) missing.push(a);
        if (missing.length) errors.push(`「${label}」缺少 ${missing.length} 個年齡：${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
        for (let a = 26; a <= product.maxAge; a++) {
          if (arr[a] && arr[a - 1] && arr[a] < arr[a - 1] * 0.98)
            warnings.push(`「${label}」${a}歲保費比${a - 1}歲低（${arr[a - 1]} → ${arr[a]}），請核對`);
          if (arr[a] && arr[a - 1] && arr[a] > arr[a - 1] * 1.35)
            warnings.push(`「${label}」${a}歲保費跳升超過35%（${arr[a - 1]} → ${arr[a]}），請核對`);
        }
      }
    }
    const extra = Object.keys(parsed.premiums).filter(
      (k) => !genders.some((g) => product.options.some((o) => `${g}|${o.id}` === k))
    );
    if (extra.length) warnings.push(`有啲表唔喺目錄入面，已略過：${extra.join(', ')}`);
    return { errors, warnings };
  }

  const api = { parse, validate, parseRow, detectProduct, detectEffective };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHISParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
