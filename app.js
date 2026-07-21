/* UI. Six screens plus settings. */

(() => {
  const $  = s => document.querySelector(s);
  const el = (t, cls, html) => { const n = document.createElement(t); if(cls) n.className = cls; if(html != null) n.innerHTML = html; return n; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const screen = $('#screen');
  const title  = $('#screen-title');
  let db, tab = 'today';

  const money = n => `<span class="peso"><span class="cur">\u20B1</span>${
    (Math.round((n+Number.EPSILON)*100)/100).toLocaleString('en-PH',{minimumFractionDigits: (n%1)?2:0, maximumFractionDigits:2})
  }</span>`;

  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  function toast(msg){
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function persist(tables, msg){
    await Store.save(tables);
    if(msg) toast(msg);
  }


  /* Applying a payment to a card: add this month's interest, subtract the
     payment. Guarded per month so paying from Bills and from Money in cannot
     both hit the same balance twice. */
  function applyCardPayment(ob, amount, dateStr){
    if(!ob.cardId || amount <= 0.005) return;
    const c = db.cards.find(x => x.id === ob.cardId);
    if(!c) return;
    const per = E.period(dateStr);
    ob.cardApplied = ob.cardApplied || {};
    const rec = ob.cardApplied[per];
    const before = c.balance;

    if(!rec){
      /* First payment this month: charge the month's interest, then pay. */
      const interest = (c.rate || 0) * c.balance;
      c.balance = Math.max(0, c.balance + interest - amount);
      ob.cardApplied[per] = {before, paid: amount, interest};
    } else {
      /* Later payments the same month: no second interest charge. */
      c.balance = Math.max(0, c.balance - amount);
      rec.paid += amount;
    }
    c.lastPayment = amount; c.lastPaid = dateStr;
    c.lastInterest = ob.cardApplied[per].interest;
    Store.log('card', c.id, 'balance', round2(before), round2(c.balance), 'payment ' + E.peso(amount));
  }

  function reverseCardPayment(ob, dateStr){
    if(!ob.cardId || !ob.cardApplied) return;
    const per = E.period(dateStr);
    const rec = ob.cardApplied[per];
    if(!rec) return;
    const c = db.cards.find(x => x.id === ob.cardId);
    if(c){
      const before = c.balance;
      c.balance = rec.before;
      Store.log('card', c.id, 'balance', round2(before), round2(c.balance), 'payments reversed');
    }
    delete ob.cardApplied[per];
  }

  /* Count a completed payment towards a one-off or fixed-count bill. */
  function bumpCount(ob, delta){
    if(ob.recur !== 'once' && ob.recur !== 'count') return;
    ob.paidCount = Math.max(0, (ob.paidCount || 0) + delta);
  }

  /* ================= TODAY ================= */

  function renderToday(){
    const s = db.settings, now = E.today();
    const inc = E.nextIncomes(db, now, 3);
    const next = inc[0];
    const wrap = el('div');

    /* arrears alarm */
    const arrears = Number(s.arrearsMonths || 0);
    if(arrears > 0){
      const houses = db.obligations.filter(o => o.tier === 1 && o.dueDay != null);
      const nextDue = houses.map(o => E.nextOnDay(now, o.dueDay)).sort()[0];
      const dLeft = nextDue ? E.daysBetween(now, nextDue) : null;
      const left = Math.max(0, 3 - arrears);
      const box = el('div','hero alarm');
      box.innerHTML = `
        <div class="label">Pag-IBIG arrears</div>
        <div class="figure">${arrears} month${arrears===1?'':'s'} behind</div>
        <div class="sub">${
          left === 0
            ? 'At the default threshold. Pay now.'
            : `${left} more missed payment${left===1?'':'s'} triggers default${dLeft!=null?`, next amortisation in ${dLeft} day${dLeft===1?'':'s'}`:''}. Default on either loan cross-defaults the other.`
        }</div>`;
      wrap.appendChild(box);
    }

    /* cash + next money */
    const cash = el('div','hero');
    cash.innerHTML = `
      <div class="label">Cash on hand</div>
      <div class="figure">${money(s.cash || 0)}</div>
      <div class="sub">${ next
        ? `Next: ${esc(next.name)} ${money(next.amount)} on ${E.fmtDate(next.date)}, ${E.daysBetween(now,next.date)} day${E.daysBetween(now,next.date)===1?'':'s'} away.`
        : 'No income scheduled. Add a source in Bills \u203A Income.' }</div>`;
    wrap.appendChild(cash);

    const edit = el('div');
    edit.innerHTML = `<button class="link" id="edit-cash">Update cash on hand</button>`;
    edit.querySelector('#edit-cash').onclick = () => {
      const v = prompt('Cash on hand right now', s.cash || 0);
      if(v == null) return;
      const n = Number(v);
      if(isNaN(n)) return toast('That is not a number');
      Store.log('settings','cash','cash', s.cash, n);
      s.cash = n; persist(['settings','changelog'],'Cash updated'); render();
    };
    wrap.appendChild(edit);

    /* due before next money */
    if(next){
      const due = E.dueInstances(db, now, next.date).sort(E.sortForPayment);
      const total = due.reduce((a,x) => a + x.amount, 0);
      const sec = el('section');
      sec.innerHTML = `<h2>Due before ${esc(next.name)} lands</h2>`;
      if(!due.length){
        sec.appendChild(el('div','empty','Nothing due in that window.'));
      } else {
        const rows = el('div','rows');
        due.forEach(x => rows.appendChild(dueRow(x)));
        sec.appendChild(rows);
        const gap = (s.cash || 0) - total;
        sec.appendChild(el('div','ledgerline total',
          `<span>Needed</span><span class="v">${money(total)}</span>`));
        sec.appendChild(el('div', gap < 0 ? 'note crit' : 'note',
          gap < 0
            ? `Short by ${E.peso(-gap)} before ${esc(next.name)}. Open Money in to see what gets funded and what waits.`
            : `Covered, with ${E.peso(gap)} to spare.`));
      }
      wrap.appendChild(sec);
    }

    /* float */
    const f = el('section');
    const fb = Number(s.floatBalance||0), ft = Number(s.floatTarget||65000);
    f.innerHTML = `<h2>Float</h2>
      <div class="ledgerline"><span>Balance</span><span class="v">${E.peso(fb)}</span></div>
      <div class="ledgerline"><span>Target</span><span class="v">${E.peso(ft)}</span></div>
      <div class="ledgerline total"><span>Still to build</span><span class="v">${E.peso(Math.max(0,ft-fb))}</span></div>`;
    const fbtn = el('div'); fbtn.innerHTML = `<button class="link" id="edit-float">Update float balance</button>`;
    fbtn.querySelector('#edit-float').onclick = () => {
      const v = prompt('Float account balance', fb);
      if(v == null) return; const n = Number(v); if(isNaN(n)) return toast('That is not a number');
      Store.log('settings','floatBalance','floatBalance', fb, n);
      s.floatBalance = n; persist(['settings','changelog'],'Float updated'); render();
    };
    f.appendChild(fbtn);
    wrap.appendChild(f);

    screen.appendChild(wrap);
  }

  function dueRow(x){
    const r = el('div','row');
    const badge = x.overdue ? `<span class="badge b-overdue">overdue</span>` : '';
    r.innerHTML = `
      <div class="main">
        <div class="name">${badge}${esc(x.ob.name)}</div>
        <div class="meta">${E.fmtDate(x.date)} · ${esc(E.TIER_LABEL[x.ob.tier] || '')}</div>
      </div>
      <div class="amt">${E.peso(x.amount)}</div>`;
    return r;
  }

  /* ================= MONEY IN ================= */

  let allocDraft = null;

  function renderAllocate(){
    const s = db.settings, now = E.today();
    const wrap = el('div');

    const form = el('section');
    form.innerHTML = `
      <h2>What landed</h2>
      <label class="field"><span class="lab">Amount received</span>
        <input id="a-amt" class="num" type="number" inputmode="decimal" step="0.01" placeholder="15800"></label>
      <label class="field"><span class="lab">Date</span>
        <input id="a-date" type="date" value="${now}"></label>
      <button class="btn" id="a-go" type="button">Work out where it goes</button>
      <div class="hint">Ranked by what it costs you to miss, not by due date. You can change any line before you confirm.</div>`;
    wrap.appendChild(form);
    const out = el('div', null, ''); out.id = 'a-out';
    wrap.appendChild(out);
    screen.appendChild(wrap);

    $('#a-go').onclick = () => {
      const amt = Number($('#a-amt').value);
      const date = $('#a-date').value || now;
      if(!amt || amt <= 0) return toast('Enter the amount that landed');
      allocDraft = E.plan(db, amt, date);
      drawPlan();
    };

    if(allocDraft) drawPlan();

    function drawPlan(){
      const p = allocDraft;
      const box = $('#a-out'); box.innerHTML = '';

      const head = el('section');
      head.innerHTML = `<h2>Deal it out</h2>`;
      box.appendChild(head);

      p.envelopes.forEach(e => {
        const n = el('div', 'env' + (e.kind === 'reserve' ? ' reserve' : ''));
        n.innerHTML = `
          <div class="env-top"><span class="env-name">${esc(e.name)}</span><span class="env-amt">${E.peso(e.amount)}</span></div>
          <div class="env-why">${esc(e.why)}</div>
          ${e.need > e.amount ? `<div class="env-why" style="color:var(--critical)">Short ${E.peso(e.need - e.amount)} of ${E.peso(e.need)}.</div>` : ''}`;
        box.appendChild(n);
      });

      p.lines.forEach((l, i) => {
        const funded = l.amount > 0.005;
        const n = el('div','env');
        n.innerHTML = `
          <div class="env-top">
            <span class="env-name">${l.item.overdue ? '<span class="badge b-overdue">overdue</span>' : ''}${esc(l.item.ob.name)}</span>
            <span class="env-amt" style="${funded?'':'color:var(--ink-3)'}">${E.peso(l.amount)}</span>
          </div>
          <div class="env-why">${esc(E.TIER_LABEL[l.item.ob.tier])} · due ${E.fmtDate(l.item.date)}</div>
          ${l.short > 0.005 ? `<div class="env-why" style="color:var(--critical)">Unfunded by ${E.peso(l.short)} of ${E.peso(l.item.amount)}.</div>` : ''}
          <div class="env-bar"><span style="width:${Math.min(100, l.amount / l.item.amount * 100)}%"></span></div>
          <div style="margin-top:9px"><button class="mini" data-adj="${i}">Change amount</button></div>`;
        n.querySelector('[data-adj]').onclick = () => {
          const v = prompt(`Amount for ${l.item.ob.name}`, Math.round(l.amount*100)/100);
          if(v == null) return; const num = Number(v); if(isNaN(num)) return toast('That is not a number');
          const delta = num - l.amount;
          l.amount = Math.max(0, num);
          l.short = Math.max(0, l.item.amount - l.amount);
          p.spare = Math.max(0, p.spare - delta);
          drawPlan();
        };
        box.appendChild(n);
      });

      if(p.spare > 0.005){
        const n = el('div','env');
        n.innerHTML = `<div class="env-top"><span class="env-name">To the float</span><span class="env-amt">${E.peso(p.spare)}</span></div>
          <div class="env-why">Everything due before the next money in is covered.</div>`;
        box.appendChild(n);
      }

      if(p.unfunded.length){
        box.appendChild(el('div','note crit',
          `${p.unfunded.length} item${p.unfunded.length===1?'':'s'} cannot be funded from this tranche. They sit at the bottom because missing them costs least, a late fee or a grace period, rather than a house or the car.`));
      }

      const act = el('div');
      act.innerHTML = `<div class="btnrow">
          <button class="btn" id="a-confirm" type="button">Record these payments</button>
          <button class="btn ghost" id="a-clear" type="button">Clear</button>
        </div>`;
      box.appendChild(act);

      $('#a-clear').onclick = () => { allocDraft = null; renderScreen(); };
      $('#a-confirm').onclick = confirmPlan;
    }

    function confirmPlan(){
      const p = allocDraft;
      let spent = 0;
      p.lines.forEach(l => {
        if(l.amount <= 0.005) return;
        spent += l.amount;
        const ob = db.obligations.find(o => o.id === l.item.ob.id);
        if(!ob) return;
        ob.paid = ob.paid || {}; ob.partial = ob.partial || {};
        const per = E.period(l.item.date);
        if(l.short <= 0.005){ ob.paid[per] = true; delete ob.partial[per]; }
        else { ob.partial[per] = (ob.partial[per] || 0) + l.amount; }
        db.payments.unshift({
          id:'py-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
          date: p.onDate, obligationId: ob.id, name: ob.name, amount: l.amount
        });
        if(l.short <= 0.005) bumpCount(ob, +1);
        applyCardPayment(ob, l.amount, p.onDate);
        Store.log('payment', ob.id, 'paid', 0, l.amount, p.onDate);
      });
      const env = p.envelopes.reduce((a,e) => a + e.amount, 0);
      const before = db.settings.cash || 0;
      db.settings.cash = Math.max(0, before + p.cash - spent - env + 0);
      if(p.spare > 0.005) db.settings.floatBalance = Number(db.settings.floatBalance || 0) + p.spare;
      Store.log('settings','cash','cash', before, db.settings.cash, 'allocation recorded');
      allocDraft = null;
      persist(null, 'Recorded');
      tab = 'today'; render();
    }
  }

  /* ================= BILLS ================= */

  let editId = null, payId = null;

  const TIERS = [
    [1,'Housing loan, foreclosure risk'],[2,'Vehicle, repossession risk'],
    [3,'Utilities, disconnection'],[4,'Rent'],[5,'Fixed loans, late fees and credit record'],
    [6,'Card minimum, late fee plus a month of interest'],[7,'Insurance, usually a 30-day grace period'],[8,'Living']
  ];

  function recurLabel(o){
    if(o.recur === 'once')  return (o.paidCount||0) >= 1 ? 'One time, done' : 'One time';
    if(o.recur === 'count'){
      const left = Math.max(0, (o.count||0) - (o.paidCount||0));
      return left + ' of ' + (o.count||0) + ' left';
    }
    return 'Every month';
  }

  function renderBills(){
    const now = E.today();
    const wrap = el('div');
    wrap.appendChild(el('div','note','Everything here is editable. Tap Pay to record what you actually handed over, or Edit to change anything about a bill. Every change goes into the log at the bottom.'));

    const byTier = {};
    db.obligations.forEach(o => { (byTier[o.tier] = byTier[o.tier] || []).push(o); });

    Object.keys(byTier).sort((a,b)=>a-b).forEach(t => {
      const sec = el('section');
      sec.innerHTML = `<h2>${esc((TIERS.find(x=>x[0]==t)||[0,'Other'])[1])}</h2>`;
      const rows = el('div','rows');
      byTier[t].sort((a,b) => (a.dueDay||99) - (b.dueDay||99)).forEach(o => {
        rows.appendChild(billRow(o, now));
        if(payId  === o.id) rows.appendChild(payPanel(o, now));
        if(editId === o.id) rows.appendChild(editPanel(o));
      });
      sec.appendChild(rows);
      wrap.appendChild(sec);
    });

    const add = el('section');
    add.innerHTML = `<button class="btn ghost" id="b-add" type="button">Add a bill</button>`;
    add.querySelector('#b-add').onclick = () => {
      const ob = {id:'ob-'+Date.now(), name:'New bill', amount:0, dueDay:1, tier:5,
                  kind:'other', recur:'monthly', count:null, paidCount:0, paid:{}, partial:{}, note:''};
      db.obligations.push(ob);
      Store.log('obligation', ob.id, 'created', null, ob.name);
      editId = ob.id; payId = null;
      persist(['obligations','changelog']); render();
    };
    wrap.appendChild(add);

    wrap.appendChild(incomeSection());
    wrap.appendChild(historySection());
    wrap.appendChild(logSection());
    screen.appendChild(wrap);
  }

  function billRow(o, now){
    const r = el('div','row');
    const paid  = E.paidFor(o, now);
    const spent = E.exhausted(o);
    const part  = (o.partial || {})[E.period(now)] || 0;
    const dueStr = o.dueDate ? E.fmtDate(o.dueDate)
                 : o.dueDay != null ? 'Day ' + o.dueDay : 'No fixed date';
    r.className = 'row' + (paid || spent ? ' settled' : '');
    r.innerHTML = `
      <div class="main">
        <div class="name">${spent?'<span class="badge b-paid">finished</span>':paid?'<span class="badge b-paid">paid</span>':part>0?'<span class="badge b-soon">part paid</span>':''}${esc(o.name)}</div>
        <div class="meta"><span class="badge b-tier">${esc(recurLabel(o))}</span>${dueStr}${part>0?' \u00b7 '+E.peso(part)+' paid so far':''}${o.note?' \u00b7 '+esc(o.note):''}</div>
        <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="mini" data-a="pay">${paid?'Undo payment':'Pay'}</button>
          <button class="mini" data-a="edit">Edit</button>
        </div>
      </div>
      <div class="amt">${E.peso(o.amount)}</div>`;

    r.querySelector('[data-a=pay]').onclick = () => {
      if(paid){
        delete o.paid[E.period(now)];
        reverseCardPayment(o, now);
        bumpCount(o, -1);
        delete (o.partial||{})[E.period(now)];
        Store.log('obligation', o.id, 'payment', 'paid', 'undone');
        persist(null, 'Payment undone'); render();
      } else {
        payId = (payId === o.id) ? null : o.id; editId = null; render();
      }
    };
    r.querySelector('[data-a=edit]').onclick = () => {
      editId = (editId === o.id) ? null : o.id; payId = null; render();
    };
    return r;
  }

  /* ---- record the exact amount actually handed over ---- */
  function payPanel(o, now){
    const per = E.period(now);
    const already = (o.partial || {})[per] || 0;
    const owing = Math.max(0, o.amount - already);
    const box = el('div','env');
    box.innerHTML = `
      <div class="env-top"><span class="env-name">Record payment</span><span class="env-amt">${E.peso(owing)} owing</span></div>
      <label class="field" style="margin-top:10px"><span class="lab">Amount actually paid</span>
        <input class="num" id="p-amt" type="number" inputmode="decimal" step="0.01" value="${round2(owing)}"></label>
      <label class="field"><span class="lab">Date paid</span>
        <input id="p-date" type="date" value="${now}"></label>
      ${o.cardId?'<div class="env-why">This will update the linked card balance.</div>':''}
      <div class="btnrow">
        <button class="btn" id="p-ok" type="button">Record it</button>
        <button class="btn ghost" id="p-no" type="button">Cancel</button>
      </div>`;
    box.querySelector('#p-no').onclick = () => { payId = null; render(); };
    box.querySelector('#p-ok').onclick = () => {
      const amt = Number(box.querySelector('#p-amt').value);
      const date = box.querySelector('#p-date').value || now;
      if(isNaN(amt) || amt <= 0) return toast('Enter the amount you paid');
      const dper = E.period(date);
      o.paid = o.paid || {}; o.partial = o.partial || {};
      const total = ((o.partial[dper] || 0) + amt);
      if(total >= o.amount - 0.005){
        o.paid[dper] = true; delete o.partial[dper]; bumpCount(o, +1);
      } else {
        o.partial[dper] = total;
      }
      applyCardPayment(o, amt, date);
      db.payments.unshift({id:'py-'+Date.now(), date, obligationId:o.id, name:o.name, amount:amt});
      Store.log('payment', o.id, 'amount', 0, round2(amt), date);
      payId = null;
      persist(null, o.cardId ? 'Recorded, card balance updated' : 'Recorded');
      render();
    };
    return box;
  }

  /* ---- edit every field on a bill ---- */
  function editPanel(o){
    const box = el('div','env');
    const cardOpts = ['<option value="">Not linked to a card</option>']
      .concat(db.cards.map(c => `<option value="${c.id}"${o.cardId===c.id?' selected':''}>${esc(c.name)}</option>`)).join('');
    box.innerHTML = `
      <div class="env-top"><span class="env-name">Edit bill</span></div>
      <label class="field" style="margin-top:10px"><span class="lab">Name</span><input id="e-name" value="${esc(o.name)}"></label>
      <label class="field"><span class="lab">Amount</span><input id="e-amt" class="num" type="number" step="0.01" value="${o.amount}"></label>
      <label class="field"><span class="lab">Priority</span><select id="e-tier">${
        TIERS.map(t => `<option value="${t[0]}"${o.tier==t[0]?' selected':''}>${t[0]}. ${esc(t[1])}</option>`).join('')}</select></label>
      <label class="field"><span class="lab">Repeats</span><select id="e-recur">
        <option value="monthly"${(o.recur||'monthly')==='monthly'?' selected':''}>Every month</option>
        <option value="once"${o.recur==='once'?' selected':''}>One time only</option>
        <option value="count"${o.recur==='count'?' selected':''}>A set number of payments</option>
      </select></label>
      <div id="e-extra"></div>
      <label class="field"><span class="lab">Linked card</span><select id="e-card">${cardOpts}</select></label>
      <label class="field"><span class="lab">Note</span><input id="e-note" value="${esc(o.note||'')}"></label>
      <div class="btnrow">
        <button class="btn" id="e-ok" type="button">Save</button>
        <button class="btn ghost" id="e-no" type="button">Cancel</button>
      </div>
      <div style="margin-top:8px"><button class="btn danger" id="e-del" type="button">Delete this bill</button></div>`;

    const extra = box.querySelector('#e-extra');
    const drawExtra = () => {
      const mode = box.querySelector('#e-recur').value;
      if(mode === 'once'){
        extra.innerHTML = `<label class="field"><span class="lab">Date it is due</span>
          <input id="e-date" type="date" value="${o.dueDate || ''}"></label>`;
      } else if(mode === 'count'){
        extra.innerHTML = `
          <label class="field"><span class="lab">Day of the month</span><input id="e-day" class="num" type="number" min="1" max="31" value="${o.dueDay||1}"></label>
          <label class="field"><span class="lab">Total payments</span><input id="e-count" class="num" type="number" min="1" value="${o.count||12}"></label>
          <label class="field"><span class="lab">Already paid</span><input id="e-done" class="num" type="number" min="0" value="${o.paidCount||0}"></label>`;
      } else {
        extra.innerHTML = `<label class="field"><span class="lab">Day of the month (blank for none)</span>
          <input id="e-day" class="num" type="number" min="1" max="31" value="${o.dueDay ?? ''}"></label>`;
      }
    };
    drawExtra();
    box.querySelector('#e-recur').onchange = drawExtra;

    box.querySelector('#e-no').onclick = () => { editId = null; render(); };
    box.querySelector('#e-del').onclick = () => {
      if(!confirm('Delete "' + o.name + '"? This cannot be undone.')) return;
      db.obligations = db.obligations.filter(x => x.id !== o.id);
      Store.log('obligation', o.id, 'deleted', o.name, null);
      editId = null; persist(null, 'Deleted'); render();
    };
    box.querySelector('#e-ok').onclick = () => {
      const g = id => box.querySelector(id);
      const before = {name:o.name, amount:o.amount, tier:o.tier, dueDay:o.dueDay, dueDate:o.dueDate, recur:o.recur};

      o.name  = g('#e-name').value.trim() || o.name;
      o.amount = Number(g('#e-amt').value) || 0;
      o.tier  = Number(g('#e-tier').value) || 5;
      o.note  = g('#e-note').value.trim();
      o.cardId = g('#e-card').value || null;
      if(o.cardId) o.kind = 'cardmin';

      const mode = g('#e-recur').value;
      o.recur = mode;
      if(mode === 'once'){
        const d = g('#e-date') ? g('#e-date').value : '';
        o.dueDate = d || null;
        if(d) o.dueDay = Number(d.slice(8,10));
        o.count = null;
      } else if(mode === 'count'){
        o.dueDate = null;
        o.dueDay = Number(g('#e-day').value) || 1;
        o.count = Number(g('#e-count').value) || 1;
        o.paidCount = Number(g('#e-done').value) || 0;
      } else {
        o.dueDate = null; o.count = null; o.paidCount = 0;
        const v = g('#e-day').value;
        o.dueDay = v === '' ? null : Number(v);
      }

      Object.keys(before).forEach(k => {
        if(String(before[k]) !== String(o[k])) Store.log('obligation', o.id, k, before[k], o[k]);
      });
      editId = null; persist(null, 'Saved'); render();
    };
    return box;
  }

  /* ---- income sources ---- */
  function incomeSection(){
    const sec = el('section');
    sec.innerHTML = `<h2>Money coming in</h2>`;
    const rows = el('div','rows');
    (db.income || []).forEach(s => {
      const when = s.rule === 'weekly'
        ? ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'][s.weekday ?? 2]
        : s.rule === 'semimonthly' ? 'Days ' + (s.days||[]).join(' and ') : 'Day ' + (s.day||1);
      const r = el('div','row' + (s.status==='tentative'?' settled':''));
      r.innerHTML = `
        <div class="main">
          <div class="name">${esc(s.name)}${s.status==='tentative'?' <span class="badge b-soon">not counted</span>':''}</div>
          <div class="meta">${when}${s.note?' \u00b7 '+esc(s.note):''}</div>
          <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="mini" data-i="amt">Amount</button>
            <button class="mini" data-i="when">Schedule</button>
            <button class="mini" data-i="st">${s.status==='tentative'?'Count it':'Stop counting'}</button>
            <button class="mini" data-i="del">Delete</button>
          </div>
        </div>
        <div class="amt">${E.peso(s.amount)}</div>`;
      r.querySelector('[data-i=amt]').onclick = () => {
        const v = prompt('Amount per payment for ' + s.name, s.amount); if(v==null) return;
        const n = Number(v); if(isNaN(n)) return toast('That is not a number');
        Store.log('income', s.id, 'amount', s.amount, n); s.amount = n;
        persist(null,'Updated'); render();
      };
      r.querySelector('[data-i=when]').onclick = () => {
        const m = (prompt('How is it paid?\n\n  1  Every week\n  2  Twice a month\n  3  Once a month',
          s.rule==='weekly'?'1':s.rule==='semimonthly'?'2':'3') || '').trim();
        if(m === '1'){
          const d = (prompt('Which day? 0 Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday', s.weekday ?? 2) || '').trim();
          Store.log('income', s.id, 'schedule', s.rule + ' ' + s.weekday, 'weekly ' + d);
          s.rule = 'weekly'; s.weekday = Number(d) || 0;
        } else if(m === '2'){
          const d = prompt('Which two days of the month?', (s.days||[15,30]).join(',')) || '15,30';
          s.rule = 'semimonthly'; s.days = d.split(',').map(x => Number(x.trim())).filter(Boolean);
          Store.log('income', s.id, 'schedule', 'semimonthly', s.days.join(' and '));
        } else if(m === '3'){
          s.rule = 'monthly'; s.day = Number(prompt('Which day of the month?', s.day || 1)) || 1;
          Store.log('income', s.id, 'schedule', 'monthly', s.day);
        } else return;
        persist(null,'Updated'); render();
      };
      r.querySelector('[data-i=st]').onclick = () => {
        s.status = s.status === 'tentative' ? 'confirmed' : 'tentative';
        Store.log('income', s.id, 'status', s.status==='tentative'?'confirmed':'tentative', s.status);
        persist(null, s.status==='tentative' ? 'Left out of planning' : 'Now counted'); render();
      };
      r.querySelector('[data-i=del]').onclick = () => {
        if(!confirm('Delete ' + s.name + '?')) return;
        db.income = db.income.filter(x => x.id !== s.id);
        Store.log('income', s.id, 'deleted', s.name, null);
        persist(null,'Deleted'); render();
      };
      rows.appendChild(r);
    });
    sec.appendChild(rows);
    const b = el('div'); b.innerHTML = `<button class="btn ghost" id="i-add" type="button">Add a source</button>`;
    b.querySelector('#i-add').onclick = () => {
      const name = prompt('Who pays you?'); if(!name) return;
      const amount = Number(prompt('How much per payment?','0')) || 0;
      const s = {id:'in-'+Date.now(), name, rule:'weekly', weekday:2, amount, status:'confirmed'};
      db.income.push(s); Store.log('income', s.id, 'created', null, name);
      persist(null,'Added'); render();
    };
    sec.appendChild(b);
    return sec;
  }

  /* ---- payment history ---- */
  function historySection(){
    const sec = el('section');
    sec.innerHTML = `<h2>Payments recorded</h2>`;
    if(!db.payments.length){ sec.appendChild(el('div','empty','Nothing recorded yet.')); return sec; }
    const rows = el('div','rows');
    db.payments.slice(0,40).forEach(pm => {
      const r = el('div','row');
      r.innerHTML = `<div class="main">
          <div class="name">${esc(pm.name)}</div>
          <div class="meta">${E.fmtDate(pm.date)}</div>
          <div style="margin-top:6px"><button class="mini" data-p="del">Remove from history</button></div>
        </div><div class="amt">${E.peso(pm.amount)}</div>`;
      r.querySelector('[data-p=del]').onclick = () => {
        if(!confirm('Remove this entry? It does not change balances or paid marks.')) return;
        db.payments = db.payments.filter(x => x.id !== pm.id);
        Store.log('payment', pm.id, 'deleted', pm.amount, null);
        persist(['payments','changelog'],'Removed'); render();
      };
      rows.appendChild(r);
    });
    sec.appendChild(rows);
    return sec;
  }

  function logSection(){
    const sec = el('section');
    sec.innerHTML = `<h2>What changed</h2>`;
    if(!db.changelog.length){ sec.appendChild(el('div','empty','No changes recorded yet.')); return sec; }
    const rows = el('div','rows');
    db.changelog.slice(0,25).forEach(c => {
      const r = el('div','row');
      r.innerHTML = `<div class="main">
          <div class="name">${esc(c.entity)} \u00b7 ${esc(c.field)}</div>
          <div class="meta">${esc(String(c.before))} \u2192 ${esc(String(c.after))} \u00b7 ${new Date(c.ts).toLocaleString()}${c.note?' \u00b7 '+esc(c.note):''}</div>
        </div>`;
      rows.appendChild(r);
    });
    sec.appendChild(rows);
    return sec;
  }

  /* ================= CARDS ================= */

  function renderCards(){
    const wrap = el('div');
    const rev = db.cards.filter(c => c.kind === 'revolving');
    const fix = db.cards.filter(c => c.kind !== 'revolving');

    const totalBal = rev.reduce((a,c) => a + c.balance, 0);
    const totalInt = rev.reduce((a,c) => a + c.balance * (c.rate||0), 0);
    const alloc = db.obligations.filter(o => o.kind === 'cardmin').reduce((a,o) => a + o.amount, 0);
    const principal = alloc - totalInt;

    const hero = el('div','hero' + (principal <= 0 ? ' alarm' : ''));
    hero.innerHTML = `
      <div class="label">Is the scheme working?</div>
      <div class="figure">${E.peso(principal)}</div>
      <div class="sub">${
        principal <= 0
          ? `Every peso you pay is being eaten by interest. Balances will not fall at this rate.`
          : `of your ${E.peso(alloc)} in card payments reaches principal each month. The other ${E.peso(totalInt)} is interest, ${Math.round(totalInt/alloc*100)}% of what you pay.`
      }</div>`;
    wrap.appendChild(hero);

    const now = el('section');
    const monthsNow = E.monthsToClear(totalBal, 0.03, alloc);
    const monthsFast = E.monthsToClear(totalBal, 0.03, 48000);
    now.innerHTML = `<h2>Revolving total</h2>
      <div class="ledgerline"><span>Balance</span><span class="v">${E.peso(totalBal)}</span></div>
      <div class="ledgerline"><span>Interest each month</span><span class="v">${E.peso(totalInt)}</span></div>
      <div class="ledgerline"><span>Clear at ${E.peso(alloc)}/mo</span><span class="v">${monthsNow===Infinity?'never':monthsNow+' months'}</span></div>
      <div class="ledgerline total"><span>Clear at ${E.peso(48000)}/mo</span><span class="v">${monthsFast===Infinity?'never':monthsFast+' months'}</span></div>`;
    wrap.appendChild(now);

    const list = el('section');
    list.innerHTML = `<h2>Revolving, pay in this order</h2>`;
    const order = rev.slice().sort((a,b) => (b.rate - a.rate) || (a.balance - b.balance));
    order.forEach((c,i) => list.appendChild(cardRow(c, i+1)));
    wrap.appendChild(list);

    const fixed = el('section');
    fixed.innerHTML = `<h2>Fixed loans, not payoff targets</h2>`;
    fixed.appendChild(el('p','small','Interest on these is pre-computed into the amortisation. Paying early usually saves nothing, so they are treated as fixed obligations.'));
    fix.forEach(c => {
      const r = el('div','row');
      r.innerHTML = `<div class="main">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${E.peso(c.payment||0)} \u00d7 ${c.remaining||0} left · day ${c.dueDay}</div>
        </div><div class="amt">${E.peso(c.balance)}</div>`;
      fixed.appendChild(r);
    });
    wrap.appendChild(fixed);

    screen.appendChild(wrap);
  }

  function cardRow(c, rank){
    const n = el('div','env');
    const interest = c.balance * (c.rate||0);
    const min = (db.obligations.find(o => o.cardId === c.id) || {}).amount || 0;
    const toPrincipal = min - interest;
    n.innerHTML = `
      <div class="env-top">
        <span class="env-name">${rank}. ${esc(c.name)}</span>
        <span class="env-amt">${E.peso(c.balance)}</span>
      </div>
      <div class="env-why">${(c.rate*100).toFixed(1)}% a month · ${E.peso(interest)} interest · due day ${c.dueDay}</div>
      <div class="env-why" style="color:${toPrincipal>0?'var(--ok)':'var(--critical)'}">
        ${toPrincipal>0
          ? `Paying ${E.peso(min)} cuts the balance by ${E.peso(toPrincipal)}.`
          : `Paying ${E.peso(min)} does not cover the ${E.peso(interest)} interest. This balance grows.`}
      </div>
      ${c.note?`<div class="env-why">${esc(c.note)}</div>`:''}
      <div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="mini" data-c="bal">Balance</button>
        <button class="mini" data-c="edit">Edit</button>
        <button class="mini" data-c="del">Delete</button>
      </div>`;
    n.querySelector('[data-c=bal]').onclick = () => {
      const v = prompt(`Balance on ${c.name}`, c.balance); if(v==null) return;
      const num = Number(v); if(isNaN(num)) return toast('That is not a number');
      Store.log('card', c.id, 'balance', c.balance, num, 'manual update');
      c.balance = num; persist(['cards','changelog'],'Balance updated'); render();
    };
    n.querySelector('[data-c=edit]').onclick = () => {
      const name = prompt('Name', c.name); if(name == null) return;
      const rate = prompt('Monthly interest rate as a percent, for example 3 or 5', round2((c.rate||0)*100));
      if(rate == null) return;
      const day = prompt('Day of the month it is due', c.dueDay); if(day == null) return;
      const before = {name:c.name, rate:c.rate, dueDay:c.dueDay};
      c.name = name.trim() || c.name;
      c.rate = (Number(rate) || 0) / 100;
      c.dueDay = Number(day) || c.dueDay;
      Object.keys(before).forEach(k => {
        if(String(before[k]) !== String(c[k])) Store.log('card', c.id, k, before[k], c[k]);
      });
      persist(null,'Saved'); render();
    };
    n.querySelector('[data-c=del]').onclick = () => {
      if(!confirm('Delete ' + c.name + '?')) return;
      db.cards = db.cards.filter(x => x.id !== c.id);
      db.obligations.forEach(o => { if(o.cardId === c.id) o.cardId = null; });
      Store.log('card', c.id, 'deleted', c.name, null);
      persist(null,'Deleted'); render();
    };
    return n;
  }

  /* ================= SURVIVE ================= */

  function renderSurvive(){
    const wrap = el('div');
    const done = db.todos.filter(t => t.done).length;
    const hero = el('div','hero');
    hero.innerHTML = `<div class="label">Getting through this month</div>
      <div class="figure">${done} / ${db.todos.length}</div>
      <div class="sub">The goal right now is not progress. It is keeping both houses and the car.</div>`;
    wrap.appendChild(hero);

    const groups = {};
    db.todos.forEach(t => { (groups[t.when || 'Anytime'] = groups[t.when || 'Anytime'] || []).push(t); });

    Object.keys(groups).forEach(g => {
      const sec = el('section');
      sec.innerHTML = `<h2>${esc(g)}</h2>`;
      groups[g].forEach(t => {
        const r = el('div','todo' + (t.done?' done':''));
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!t.done;
        cb.onchange = () => {
          t.done = cb.checked;
          Store.log('todo', t.id, 'done', !t.done, t.done);
          persist(['todos','changelog'], t.done ? 'Done' : 'Reopened'); render();
        };
        const tx = el('div','txt',
          `${esc(t.text)}<div style="margin-top:5px;display:flex;gap:6px">
             <button class="mini" data-t="edit">Edit</button>
             <button class="mini" data-t="del">Delete</button></div>`);
        tx.querySelector('[data-t=edit]').onclick = () => {
          const text = prompt('Task', t.text); if(text == null) return;
          const when = prompt('When?', t.when || 'Anytime'); if(when == null) return;
          Store.log('todo', t.id, 'text', t.text, text);
          t.text = text; t.when = when;
          persist(null,'Saved'); render();
        };
        tx.querySelector('[data-t=del]').onclick = () => {
          if(!confirm('Delete this task?')) return;
          db.todos = db.todos.filter(x => x.id !== t.id);
          Store.log('todo', t.id, 'deleted', t.text, null);
          persist(null,'Deleted'); render();
        };
        r.appendChild(cb); r.appendChild(tx);
        sec.appendChild(r);
      });
      wrap.appendChild(sec);
    });

    const add = el('section');
    add.innerHTML = `<button class="btn ghost" id="t-add" type="button">Add a task</button>`;
    add.querySelector('#t-add').onclick = () => {
      const text = prompt('What needs doing?'); if(!text) return;
      const when = prompt('When? (e.g. Now, Jul 30, This week)','Now') || 'Anytime';
      const t = {id:'td-'+Date.now(), text, when, done:false};
      db.todos.push(t); Store.log('todo', t.id, 'created', null, text);
      persist(['todos','changelog'],'Added'); render();
    };
    wrap.appendChild(add);
    screen.appendChild(wrap);
  }

  /* ================= ASK ================= */

  function buildSnapshot(){
    const now = E.today(), s = db.settings;
    const inc = E.nextIncomes(db, now, 4);
    const L = [];
    L.push(`Household finances snapshot, ${now}`);
    L.push('');
    L.push(`Cash on hand: ${E.peso(s.cash||0)}`);
    L.push(`Float: ${E.peso(s.floatBalance||0)} of ${E.peso(s.floatTarget||0)} target`);
    L.push(`Pag-IBIG arrears: ${s.arrearsMonths||0} months behind (default at 3, cross-defaults both loans)`);
    L.push('');
    L.push('INCOME COMING:');
    inc.forEach(i => L.push(`  ${i.date}  ${i.name}  ${E.peso(i.amount)}`));
    L.push('');
    L.push('UNPAID AND DUE IN THE NEXT 30 DAYS (priority order):');
    E.dueInstances(db, now, E.addDays(now,30)).sort(E.sortForPayment).forEach(x =>
      L.push(`  ${x.date}  T${x.ob.tier}  ${x.ob.name}  ${E.peso(x.amount)}${x.overdue?'  [OVERDUE]':''}`));
    L.push('');
    L.push('CARDS:');
    db.cards.filter(c => c.kind==='revolving').forEach(c =>
      L.push(`  ${c.name}  ${E.peso(c.balance)}  at ${(c.rate*100).toFixed(1)}%/mo  = ${E.peso(c.balance*c.rate)} interest/mo`));
    L.push('FIXED LOANS:');
    db.cards.filter(c => c.kind!=='revolving').forEach(c =>
      L.push(`  ${c.name}  ${E.peso(c.balance)}  ${E.peso(c.payment||0)} x ${c.remaining||0} left`));
    L.push('');
    L.push('OPEN TASKS:');
    db.todos.filter(t=>!t.done).forEach(t => L.push(`  [${t.when}] ${t.text}`));
    if(db.changelog.length){
      L.push('');
      L.push('RECENT CHANGES:');
      db.changelog.slice(0,10).forEach(c =>
        L.push(`  ${c.ts.slice(0,10)}  ${c.entity}.${c.field}: ${c.before} -> ${c.after}`));
    }
    L.push('');
    L.push('My question: ');
    return L.join('\n');
  }

  function renderAsk(){
    const wrap = el('div');
    wrap.appendChild(el('div','note','This builds a full picture of where things stand right now. Copy it, paste it into the Claude app, and type your question at the bottom.'));

    const snap = buildSnapshot();
    const box = el('section');
    box.innerHTML = `<h2>Snapshot</h2>
      <textarea id="snap" readonly style="min-height:260px;font-family:var(--mono);font-size:12px">${esc(snap)}</textarea>
      <div class="btnrow">
        <button class="btn" id="copy" type="button">Copy</button>
        <button class="btn ghost" id="open" type="button">Open Claude</button>
      </div>`;
    wrap.appendChild(box);

    const qs = el('section');
    qs.innerHTML = `<h2>Questions worth asking</h2>`;
    const rows = el('div','rows');
    [
      'What do I pay first with what I have right now?',
      'What happens if I miss this one, specifically?',
      'Is the card payoff working, or am I just paying interest?',
      'A due date moved. What does that change?',
      'Can I afford this before the next money lands?'
    ].forEach(q => {
      const r = el('div','row');
      r.innerHTML = `<div class="main"><div class="name">${esc(q)}</div></div>`;
      rows.appendChild(r);
    });
    qs.appendChild(rows);
    wrap.appendChild(qs);
    screen.appendChild(wrap);

    $('#copy').onclick = async () => {
      const t = $('#snap');
      try{ await navigator.clipboard.writeText(t.value); toast('Copied, paste it into Claude'); }
      catch(e){ t.select(); document.execCommand('copy'); toast('Copied'); }
    };
    $('#open').onclick = () => window.open('https://claude.ai/new','_blank','noopener');
  }

  /* ================= SETTINGS ================= */

  function renderSettings(){
    const cfg = Store.config() || {url:'',key:''};
    const s = db.settings;
    const wrap = el('div');

    const sync = el('section');
    sync.innerHTML = `<h2>Sync between phones</h2>
      <p class="small">Paste your Supabase project URL and anon key. They are stored only on this phone, never in the repository. Do this on both phones with the same values.</p>
      <label class="field"><span class="lab">Project URL</span><input id="s-url" type="url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url)}"></label>
      <label class="field"><span class="lab">Anon key</span><input id="s-key" type="password" placeholder="eyJ..." value="${esc(cfg.key)}"></label>
      <div class="btnrow">
        <button class="btn" id="s-save" type="button">Save and sync</button>
        <button class="btn ghost" id="s-pull" type="button">Pull now</button>
      </div>
      ${Store.isDirty() ? '<div class="note crit" style="margin-top:12px">This phone has changes that have not reached Supabase yet. <button class="link" id="s-retry">Try again now</button></div>' : ''}
      ${cfg.url ? '<div style="margin-top:12px"><button class="btn ghost" id="s-link" type="button">Copy setup link for the other phone</button><div class="hint">Opens the app on the second phone with these settings already filled in. It contains your key, so delete the message after the other phone has opened it once.</div></div>' : ''}`;
    wrap.appendChild(sync);

    const prefs = el('section');
    prefs.innerHTML = `<h2>Settings</h2>
      <label class="field"><span class="lab">Daily living allowance</span><input id="s-living" class="num" type="number" value="${s.dailyLiving||600}"></label>
      <label class="field"><span class="lab">Float target</span><input id="s-float" class="num" type="number" value="${s.floatTarget||65000}"></label>
      <label class="field"><span class="lab">Pag-IBIG months behind</span><input id="s-arr" class="num" type="number" min="0" max="6" value="${s.arrearsMonths||0}"></label>
      <button class="btn" id="s-prefs" type="button">Save settings</button>`;
    wrap.appendChild(prefs);

    const danger = el('section');
    danger.innerHTML = `<h2>Data</h2>
      <div class="btnrow">
        <button class="btn ghost" id="s-export" type="button">Export</button>
        <button class="btn danger" id="s-reset" type="button">Erase this phone</button>
      </div>`;
    wrap.appendChild(danger);
    screen.appendChild(wrap);

    $('#s-save').onclick = async () => {
      Store.setConfig($('#s-url').value.trim(), $('#s-key').value.trim());
      toast('Saved. Syncing…'); await Store.save(); render();
    };
    $('#s-pull').onclick = async () => {
      const ok = await Store.pull();
      db = Store.data(); toast(ok ? 'Pulled from Supabase' : 'Nothing to pull'); render();
    };
    $('#s-prefs').onclick = () => {
      s.dailyLiving = Number($('#s-living').value) || 600;
      s.floatTarget = Number($('#s-float').value) || 65000;
      const a = Number($('#s-arr').value) || 0;
      if(a !== s.arrearsMonths) Store.log('settings','arrearsMonths','arrearsMonths', s.arrearsMonths, a);
      s.arrearsMonths = a;
      persist(['settings','changelog'],'Saved'); tab='today'; render();
    };
    const retry = $('#s-retry');
    if(retry) retry.onclick = async () => {
      const ok = await Store.retry();
      toast(ok ? 'Sent to Supabase' : 'Still cannot reach Supabase'); render();
    };
    const linkBtn = $('#s-link');
    if(linkBtn) linkBtn.onclick = async () => {
      const c = Store.config();
      const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(c)))));
      const url = location.origin + location.pathname + '#setup=' + payload;
      try{ await navigator.clipboard.writeText(url); toast('Setup link copied'); }
      catch(e){ prompt('Copy this link', url); }
    };

    $('#s-export').onclick = () => {
      const blob = new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `finances-${E.today()}.json`; a.click();
    };
    $('#s-reset').onclick = () => {
      if(!confirm('Erase all data stored on this phone? Supabase data is not touched.')) return;
      Store.reset(); location.reload();
    };
  }

  /* ================= SHELL ================= */

  const TITLES = {today:'Today', allocate:'Money in', bills:'Bills', cards:'Cards', survive:'Survive', ask:'Ask Claude', settings:'Settings'};

  function renderScreen(){
    screen.innerHTML = '';
    title.textContent = TITLES[tab] || '';
    ({today:renderToday, allocate:renderAllocate, bills:renderBills,
      cards:renderCards, survive:renderSurvive, ask:renderAsk, settings:renderSettings}[tab] || renderToday)();
    document.querySelectorAll('.tab').forEach(b =>
      b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
    screen.scrollTop = 0; window.scrollTo(0,0);
  }
  const render = renderScreen;

  document.querySelectorAll('.tab').forEach(b => {
    b.onclick = () => { tab = b.dataset.tab; if(tab!=='allocate') allocDraft = null; if(tab!=='bills'){ editId=null; payId=null; } render(); };
  });
  $('#sync-chip').onclick = () => { tab = 'settings'; render(); };

  function paintStatus(s){
    const c = $('#sync-chip');
    c.className = 'chip' + (s==='synced' ? ' okstate' : s==='offline' ? ' warnstate' : '');
    c.textContent = {local:'Local only', syncing:'Syncing…', synced:'Synced', offline:'Offline'}[s] || s;
  }
  Store.onStatus(paintStatus);

  /* A setup link carries the Supabase settings in the URL fragment, which is
     never sent to any server. Used once to set up the second phone. */
  (function readSetupLink(){
    const m = location.hash.match(/setup=([^&]+)/);
    if(!m) return;
    try{
      const cfg = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if(cfg.url && cfg.key){
        Store.setConfig(cfg.url, cfg.key);
        history.replaceState(null, '', location.pathname + location.search);
      }
    }catch(e){ console.warn('Setup link could not be read', e); }
  })();

  Store.init().then(d => {
    db = d;
    paintStatus(Store.status());
    render();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
})();
