/*
 * 自願醫保計算引擎（純計算，唔掂介面）
 * 所有金額以港元、按年計。現金流假設：每年年初供款及交保費，年末按年利率計息。
 */
(function (root) {
  'use strict';

  // 繳費方式：每期保費 = 年繳保費 × 系數（保費表註解 5）
  const PAYMENT_MODES = {
    annual: { label: '年繳', factor: 1, periods: 1 },
    semi: { label: '半年繳', factor: 0.52, periods: 2 },
    quarterly: { label: '季繳', factor: 0.265, periods: 4 },
    monthly: { label: '月繳', factor: 0.09, periods: 12 },
  };
  const TAX_CAP = 8000; // 每名受保人每年可扣稅保費上限

  // 同一個人可以有幾份計劃：第一份 + extraPlans
  function planList(sel) {
    return [{ productId: sel.productId, optionId: sel.optionId }, ...(sel.extraPlans || [])];
  }

  function tablePremium(data, sel, age) {
    if (sel.extraPlans && sel.extraPlans.length) {
      const parts = planList(sel).map((pl) => onePremium(data, { ...pl, gender: sel.gender }, age).main);
      const total = parts.reduce((a, b) => a + b, 0);
      return { main: parts[0], total, parts };
    }
    const one = onePremium(data, sel, age);
    return { ...one, parts: [one.main] };
  }

  function onePremium(data, sel, age) {
    const p = data.products[sel.productId];
    if (!p) throw new Error(`搵唔到計劃：${sel.productId}`);
    const g = p.gendered ? sel.gender : 'U';
    const arr = p.premiums[`${g}|${sel.optionId}`];
    if (!arr) throw new Error(`搵唔到保費表：${sel.productId} ${g}|${sel.optionId}`);
    let main = 0;
    if (age <= p.maxAge) {
      main = arr[age];
      if (!(main > 0)) throw new Error(`${p.short} ${age}歲冇保費數據`);
    } else if (p.maxAge >= 121) {
      main = arr[p.maxAge]; // 121歲及以上
    }
    return { main, total: main };
  }

  function maxAgeFor(data, sel) {
    return Math.max(...planList(sel).map((pl) => data.products[pl.productId].maxAge));
  }

  /*
   * 逐年保費
   * inflation：每年保費表調整率（例如 0.05），由現時年齡起計
   * levy：保費徵費率；mode：繳費方式
   */
  function premiumSchedule(data, inp) {
    const mode = PAYMENT_MODES[inp.mode || 'annual'];
    const yearlyFactor = mode.factor * mode.periods;
    const rows = [];
    for (let age = inp.currentAge; age <= inp.endAge; age++) {
      const t = tablePremium(data, inp, age);
      const infl = Math.pow(1 + (inp.inflation || 0), age - inp.currentAge);
      const adjusted = t.total * infl; // 年繳，計入保費調整
      const premium = adjusted * yearlyFactor; // 全年實付（未計徵費）
      const levy = premium * (inp.levy || 0);
      const k = infl * yearlyFactor * (1 + (inp.levy || 0));
      rows.push({
        parts: t.parts.map((v) => v * k), // 每份計劃嘅全年實付
        age,
        table: t.total,
        main: t.main,
        adjusted,
        premium,
        levy,
        payable: premium + levy,
        perInstalment: (adjusted * mode.factor) * (1 + (inp.levy || 0)),
        covered: age >= inp.startAge,
      });
    }
    return rows;
  }

  /*
   * 儲錢模型（銀行同儲蓄計劃共用）
   * depositFrom：開始供款年齡；years：供款年數；rate：年回報
   * withdrawFrom：最早可以提取嚟交保費嘅年齡（之前到期嘅保費要自己俾）
   * 回傳所需每年供款（剛好夠交晒保費、最後餘額為 0）
   */
  function solveFunding(rows, opts) {
    const { depositFrom, years, rate, withdrawFrom, startAge, endAge } = opts;
    if (years <= 0) return { feasible: false, reason: '冇時間儲錢' };
    const due = {};
    rows.forEach((r) => { if (r.age >= startAge && r.age <= endAge) due[r.age] = r.payable; });

    let A = 0; // 每 $1 年供款累積價值
    let B = 0; // 已提取保費累積（負債）
    let need = 0;
    let outOfPocket = 0;
    let withdrawn = 0;
    const firstAge = Math.min(depositFrom, startAge);
    const mg = monthlyGrowth(rate);
    for (let age = firstAge; age <= endAge; age++) {
      const depYear = age >= depositFrom && age < depositFrom + years;
      for (let m = 0; m < 12; m++) {
        if (depYear) A += 1 / 12; // 每月月初存入（以每 $1 年供款計）
        if (m === 0) {
          const p = due[age] || 0;
          if (p) {
            if (age >= withdrawFrom) {
              B += p;
              withdrawn += p;
              if (A > 0) need = Math.max(need, B / A);
              else return { feasible: false, reason: '未開始供款已要提取' };
            } else {
              outOfPocket += p;
            }
          }
        }
        A *= mg;
        B *= mg;
      }
    }
    const annual = need;
    // 用解出嚟嘅供款再行一次，記錄每年年尾餘額
    const balances = [];
    let bal = 0;
    for (let age = firstAge; age <= endAge; age++) {
      const depYear = age >= depositFrom && age < depositFrom + years;
      const p = due[age] && age >= withdrawFrom ? due[age] : 0;
      for (let m = 0; m < 12; m++) {
        if (depYear) bal += annual / 12;
        if (m === 0) bal -= p;
        bal *= mg;
      }
      balances.push({ age, deposit: depYear ? annual : 0, withdraw: p, balance: Math.max(bal, 0) });
    }
    const principal = annual * years;
    return {
      feasible: true,
      annual,
      monthly: annual / 12,
      years,
      depositFrom,
      depositTo: depositFrom + years - 1,
      withdrawFrom,
      principal,
      withdrawn,
      outOfPocket,
      totalOutlay: principal + outOfPocket,
      interest: withdrawn - principal,
      balances,
    };
  }

  // 年利率（實際年回報）→ 每月增長倍數
  const monthlyGrowth = (rate) => Math.pow(1 + rate, 1 / 12);

  function bankPlan(rows, inp, delay = 0) {
    const depositFrom = inp.currentAge + delay;
    return solveFunding(rows, {
      depositFrom,
      years: inp.startAge - depositFrom,
      rate: inp.bankRate,
      withdrawFrom: inp.startAge,
      startAge: inp.startAge,
      endAge: inp.endAge,
    });
  }

  function savingsPlan(rows, inp, delay = 0) {
    const depositFrom = inp.currentAge + delay;
    const years = inp.planYears;
    return solveFunding(rows, {
      depositFrom,
      years,
      rate: inp.planRate,
      withdrawFrom: Math.max(inp.startAge, depositFrom + years),
      startAge: inp.startAge,
      endAge: inp.endAge,
    });
  }

  /*
   * 每月儲定數：睇吓夠交到幾多歲
   * rows 要包到產品最高年齡，target 係用家想交到嘅年齡
   */
  function simulateFixed(rows, opts) {
    const { depositFrom, years, rate, withdrawFrom, startAge, target, annual } = opts;
    if (years <= 0) return { feasible: false, reason: '冇時間儲錢' };
    const due = {};
    rows.forEach((r) => { if (r.age >= startAge) due[r.age] = r.payable; });
    const lastAge = rows[rows.length - 1].age;
    let bal = 0;
    let runOutAge = null; // 第一個唔夠錢交足嘅年齡
    let partial = 0; // 嗰年用剩錢交咗幾多
    let covered = 0; // 由儲蓄交咗嘅保費（只計到目標年齡）
    let coveredAll = 0;
    let before = 0; // 未可以提取前要自己交（到目標年齡）
    let shortfall = 0; // 錢用完之後要自己交（到目標年齡）
    let leftoverAtTarget = null;
    const balances = [];
    const mg = monthlyGrowth(rate);
    for (let age = Math.min(depositFrom, startAge); age <= lastAge; age++) {
      const depYear = age >= depositFrom && age < depositFrom + years;
      let paid = 0;
      for (let m = 0; m < 12; m++) {
        if (depYear) bal += annual / 12; // 每月月初存入
        if (m === 0) {
          const p = due[age] || 0;
          if (p) {
            if (age < withdrawFrom) {
              if (age <= target) before += p;
            } else if (runOutAge == null && bal >= p - 0.005) {
              paid = p;
            } else {
              if (runOutAge == null) { runOutAge = age; partial = Math.max(bal, 0); paid = partial; }
              if (age <= target) shortfall += p - paid;
            }
            bal -= paid;
            coveredAll += paid;
            if (age <= target) covered += paid;
          }
        }
        bal *= mg;
      }
      if (age <= target) balances.push({ age, deposit: depYear ? annual : 0, withdraw: paid, balance: Math.max(bal, 0) });
      if (age === target) leftoverAtTarget = Math.max(bal, 0);
      if (runOutAge != null && age >= target) break;
    }
    const principal = annual * years;
    const lastPaidAge = runOutAge == null ? lastAge : runOutAge - 1;
    const paidYears = lastPaidAge >= withdrawFrom ? lastPaidAge - withdrawFrom + 1 : 0;
    return {
      feasible: true,
      annual,
      monthly: annual / 12,
      years,
      depositFrom,
      depositTo: depositFrom + years - 1,
      withdrawFrom,
      principal,
      runOutAge, // null = 交到最高年齡都仲有錢
      lastPaidAge,
      paidYears,
      lastsAll: runOutAge == null,
      reachesTarget: runOutAge == null || runOutAge > target,
      partial,
      covered,
      coveredAll,
      before,
      shortfall,
      leftoverAtTarget: runOutAge == null || runOutAge > target ? leftoverAtTarget : 0,
      interest: coveredAll - principal,
      balances,
    };
  }

  function bankFixed(rowsAll, inp, delay = 0) {
    const depositFrom = inp.currentAge + delay;
    return simulateFixed(rowsAll, {
      depositFrom, years: inp.startAge - depositFrom, rate: inp.bankRate, withdrawFrom: inp.startAge,
      startAge: inp.startAge, target: inp.endAge, annual: inp.monthlySaving * 12,
    });
  }

  function planFixed(rowsAll, inp, delay = 0) {
    const depositFrom = inp.currentAge + delay;
    return simulateFixed(rowsAll, {
      depositFrom, years: inp.planYears, rate: inp.planRate, withdrawFrom: Math.max(inp.startAge, depositFrom + inp.planYears),
      startAge: inp.startAge, target: inp.endAge, annual: inp.monthlySaving * 12,
    });
  }

  function summarize(data, inp) {
    const rows = premiumSchedule(data, inp);
    const cover = rows.filter((r) => r.covered);
    const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0);
    const totalPayable = sum(cover, (r) => r.payable);
    const totalTable = sum(cover, (r) => r.table * PAYMENT_MODES[inp.mode || 'annual'].factor * PAYMENT_MODES[inp.mode || 'annual'].periods * (1 + (inp.levy || 0)));
    const first = cover[0];
    const last = cover[cover.length - 1];
    const years = last.age - first.age;
    const cagr = years > 0 && first.payable > 0 ? Math.pow(last.payable / first.payable, 1 / years) - 1 : 0;
    const peak = cover.reduce((m, r) => (r.payable > m.payable ? r : m), cover[0]);

    const now = rows[0];
    const taxDeduct = Math.min(TAX_CAP, now.premium);
    const tax = {
      deductible: taxDeduct,
      saved: taxDeduct * (inp.taxRate || 0),
      lifetimeSaved: sum(cover, (r) => Math.min(TAX_CAP, r.premium) * (inp.taxRate || 0)),
    };

    const maxPrep = inp.startAge - inp.currentAge;
    // 遲幾年：時間夠就睇 5 / 10 / 15 年，唔夠 5 年就睇 1 / 2 / 3 年
    const steps = maxPrep > 5 ? [5, 10, 15] : [1, 2, 3, 4];
    const delays = [0, ...steps.filter((d) => d < maxPrep)];
    const scenarios = delays.map((d) => ({
      delay: d,
      age: inp.currentAge + d,
      bank: bankPlan(rows, inp, d),
      plan: savingsPlan(rows, inp, d),
    }));

    let fixed = null;
    if (inp.calc === 'fixed') {
      const rowsAll = premiumSchedule(data, { ...inp, endAge: data.products[inp.productId].maxAge });
      fixed = delays.map((d) => ({ delay: d, age: inp.currentAge + d, bank: bankFixed(rowsAll, inp, d), plan: planFixed(rowsAll, inp, d) }));
    }

    return {
      fixed,
      rows,
      now,
      coverYears: cover.length,
      totalPayable,
      totalTable,
      inflationExtra: totalPayable - totalTable,
      firstCovered: first,
      lastCovered: last,
      cagr,
      peak,
      tax,
      bank: scenarios[0].bank,
      plan: scenarios[0].plan,
      scenarios,
    };
  }

  function validateInputs(data, inp) {
    const errs = [];
    const list = planList(inp);
    if (list.some((pl) => !data.products[pl.productId])) return ['請揀計劃'];
    const ps = list.map((pl) => data.products[pl.productId]);
    const top = ps.reduce((a, b) => (b.maxAge > a.maxAge ? b : a));
    const maxAge = top.maxAge;
    if (!(inp.currentAge >= 0)) errs.push('請輸入現時年齡');
    if (inp.currentAge > maxAge) errs.push(`${top.short}最高只計到${maxAge}歲`);
    if (inp.startAge < inp.currentAge) errs.push('開始年齡唔可以細過現時年齡');
    if (inp.endAge < inp.startAge) errs.push('結束年齡唔可以細過開始年齡');
    if (inp.endAge > maxAge) errs.push(`最高只計到${maxAge}歲（${top.maxAgeNote}）`);
    if (ps.some((p) => p.gendered) && (!inp.gender || inp.gender === 'U')) errs.push('請揀性別');
    return errs;
  }

  const api = { PAYMENT_MODES, TAX_CAP, planList, tablePremium, maxAgeFor, premiumSchedule, solveFunding, bankPlan, savingsPlan, simulateFixed, bankFixed, planFixed, summarize, validateInputs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHISCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
