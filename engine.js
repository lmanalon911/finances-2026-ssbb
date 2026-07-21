/* Dates, income projection, and the allocation engine. */

const E = (() => {

  const DAY = 86400000;

  const iso   = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const today = () => iso(new Date());
  const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const addDays = (s,n) => iso(new Date(parse(s).getTime() + n*DAY));
  const daysBetween = (a,b) => Math.round((parse(b) - parse(a)) / DAY);
  const period = s => s.slice(0,7);

  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(s){
    const d = parse(s);
    return `${MON[d.getMonth()]} ${d.getDate()}`;
  }
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }

  /* Next date on or after `from` that falls on day-of-month `day`.
     Clamps to the last day for short months. */
  function nextOnDay(from, day){
    const f = parse(from);
    let y = f.getFullYear(), m = f.getMonth();
    for(let i=0;i<3;i++){
      const dd = Math.min(day, daysInMonth(y,m));
      const cand = new Date(y, m, dd);
      if(cand >= f) return iso(cand);
      m++; if(m>11){m=0;y++;}
    }
    return from;
  }

  /* ---------- income ---------- */

  function projectIncome(sources, from, until, includeTentative){
    const out = [];
    for(const s of sources){
      if(s.status === 'tentative' && !includeTentative) continue;
      if(s.rule === 'weekly'){
        let d = from;
        for(let i=0;i<200;i++){
          if(parse(d).getDay() === (s.weekday ?? 2)) break;
          d = addDays(d, 1);
        }
        while(daysBetween(d, until) >= 0){
          out.push({date:d, name:s.name, amount:s.amount, id:s.id});
          d = addDays(d, 7);
        }
      } else if(s.rule === 'semimonthly'){
        for(const day of (s.days || [15,30])){
          let d = nextOnDay(from, day);
          while(daysBetween(d, until) >= 0){
            out.push({date:d, name:s.name, amount:s.amount, id:s.id});
            d = nextOnDay(addDays(d, 1), day);
          }
        }
      } else if(s.rule === 'monthly'){
        let d = nextOnDay(from, s.day || 1);
        while(daysBetween(d, until) >= 0){
          out.push({date:d, name:s.name, amount:s.amount, id:s.id});
          d = nextOnDay(addDays(d,1), s.day || 1);
        }
      }
    }
    return out.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }

  function nextIncomes(db, from, n){
    const horizon = addDays(from, 70);
    const all = projectIncome(db.income || [], from, horizon, false);
    return all.slice(0, n || 4);
  }

  /* ---------- obligations ---------- */

  function isActive(ob, onDate){
    if(ob.archived) return false;
    if(ob.endsOn && daysBetween(ob.endsOn, onDate) > 0) return false;
    return true;
  }

  function paidFor(ob, dateStr){
    return !!(ob.paid && ob.paid[period(dateStr)]);
  }

  /* Amount still owed on an instance, net of anything already part-paid
     for that month. */
  function owing(ob, dateStr){
    const part = (ob.partial && ob.partial[period(dateStr)]) || 0;
    return Math.max(0, ob.amount - part);
  }

  /* Unpaid dated obligation instances between `from` and `until`.
     `includeOverdue` backfills anything from the current month whose day has
     already passed, only ever true for a window that starts today, or a
     future window would resurrect the same arrears again.
     At most one instance per obligation: the earliest unpaid one. */
  /* Has this obligation run out of payments? Monthly ones never do. */
  function exhausted(ob){
    const done = ob.paidCount || 0;
    if(ob.recur === 'once')  return done >= 1;
    if(ob.recur === 'count') return done >= (ob.count || 0);
    return false;
  }

  function dueInstances(db, from, until, includeOverdue){
    const seen = new Set();
    const out = [];
    const wantOverdue = includeOverdue !== false;

    for(const ob of db.obligations || []){
      if(!isActive(ob, from)) continue;
      if(exhausted(ob)) continue;

      /* One-off with a specific calendar date. */
      if(ob.dueDate){
        if(paidFor(ob, ob.dueDate)) continue;
        const owe = owing(ob, ob.dueDate);
        if(owe <= 0.005) continue;
        const past = daysBetween(ob.dueDate, from) > 0;
        if(past && wantOverdue){
          out.push({ob, date:ob.dueDate, amount:owe, overdue:true, part:ob.amount-owe});
        } else if(!past && daysBetween(ob.dueDate, until) >= 0 && daysBetween(from, ob.dueDate) >= 0){
          out.push({ob, date:ob.dueDate, amount:owe, overdue:false, part:ob.amount-owe});
        }
        continue;
      }

      if(ob.dueDay == null) continue;

      if(wantOverdue){
        const thisMonthDue = nextOnDay(period(from) + '-01', ob.dueDay);
        if(daysBetween(thisMonthDue, from) > 0 && !paidFor(ob, from)){
          const owe = owing(ob, thisMonthDue);
          if(owe > 0.005){
            out.push({ob, date:thisMonthDue, amount:owe, overdue:true, part:ob.amount-owe});
            seen.add(ob.id);
            continue;
          }
        }
      }
      if(seen.has(ob.id)) continue;

      let d = nextOnDay(from, ob.dueDay);
      let guard = 0;
      while(daysBetween(d, until) >= 0 && guard++ < 12){
        if(!paidFor(ob, d)){
          const owe = owing(ob, d);
          if(owe > 0.005){
            out.push({ob, date:d, amount:owe, overdue:false, part:ob.amount-owe});
            seen.add(ob.id);
            break;
          }
        }
        d = nextOnDay(addDays(d, 1), ob.dueDay);
      }
    }
    return out.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }

  const TIER_LABEL = {
    1:'Housing loan, foreclosure risk',
    2:'Vehicle, repossession risk',
    3:'Utilities, disconnection',
    4:'Rent',
    5:'Fixed loans, late fees and credit record',
    6:'Card minimum, late fee plus a month of interest',
    7:'Insurance, usually a 30-day grace period',
    8:'Living'
  };

  function sortForPayment(a, b){
    if(a.ob.tier !== b.ob.tier) return a.ob.tier - b.ob.tier;
    if(a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.date < b.date ? -1 : 1;
  }

  /* ---------- the allocation engine ---------- */

  function plan(db, cash, onDate){
    const set = db.settings || {};
    const incomes = nextIncomes(db, addDays(onDate, 1), 3);
    const next = incomes[0] || null;
    const following = incomes[1] || null;

    const h1 = next ? next.date : addDays(onDate, 14);
    const h2 = following ? following.date : addDays(h1, 14);
    const daysToNext = Math.max(1, daysBetween(onDate, h1));

    const envelopes = [];
    let left = cash;

    const take = amt => { const t = Math.max(0, Math.min(left, amt)); left -= t; return t; };

    /* 1. Food and fuel come off the top. You cannot not eat. */
    const livingNeed = Math.round((set.dailyLiving || 600) * daysToNext);
    const livingGot = take(livingNeed);
    if(livingGot > 0){
      envelopes.push({
        name: 'Food and essentials',
        amount: livingGot,
        need: livingNeed,
        why: `${daysToNext} day${daysToNext===1?'':'s'} until ${next ? next.name + ' on ' + fmtDate(h1) : 'the next money in'}.`,
        kind: 'living'
      });
    }

    /* 2. Due before the next money in. */
    const bucketA = dueInstances(db, onDate, h1, true);
    const aIds = new Set(bucketA.map(x => x.ob.id));

    /* 3. Due after that but before the money after next, where the next
          tranche cannot cover it on its own. That gap has to be held back
          out of today's cash. */
    const bucketB = dueInstances(db, addDays(h1,1), h2, false)
                      .filter(x => x.ob.tier <= 5 && !aIds.has(x.ob.id));
    const needB  = bucketB.reduce((s,x) => s + x.amount, 0);
    const coverB = next ? next.amount : 0;
    const shortB = Math.max(0, needB - coverB);

    /* The reserve competes by tier rather than jumping the queue: holding back
       for next week's car payment must not starve this week's overdue housing
       loan. */
    const queue = bucketA.map(x => ({item:x, reserve:false}));
    let reserveMeta = null;
    if(shortB > 0){
      const drivers = bucketB.slice().sort(sortForPayment);
      const tier = drivers.length ? drivers[0].ob.tier : 5;
      reserveMeta = {
        names: drivers.slice(0,2).map(x => x.ob.name).join(', '),
        dates: drivers.length ? fmtDate(drivers[0].date) : '',
        need: shortB, tier
      };
      queue.push({
        reserve:true,
        item:{ ob:{name:'Hold back', tier}, date:h2, amount:shortB, overdue:false }
      });
    }

    queue.sort((a,b) => sortForPayment(a.item, b.item));

    const lines = [];
    for(const q of queue){
      const got = left > 0 ? take(q.item.amount) : 0;
      if(q.reserve){
        envelopes.push({
          name: 'Hold back',
          amount: got,
          need: shortB,
          why: `${reserveMeta.names} falls due ${reserveMeta.dates}, before the money after next. ${next ? next.name + '\u2019s ' + peso(coverB) : 'That tranche'} will not cover it alone.`,
          kind: 'reserve'
        });
      } else {
        lines.push({item:q.item, amount:got, short:q.item.amount - got});
      }
    }

    /* 4. Anything over goes to the float. */
    const spare = left;

    return {
      onDate, cash, envelopes, lines, spare,
      next, following, daysToNext,
      unfunded: lines.filter(l => l.short > 0.005)
    };
  }

  /* ---------- money ---------- */

  function peso(n){
    const v = Math.round((n + Number.EPSILON) * 100) / 100;
    return '\u20B1' + v.toLocaleString('en-PH', {minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2});
  }

  /* ---------- cards ---------- */

  function monthsToClear(balance, rate, payment){
    if(payment <= 0) return Infinity;
    if(rate <= 0) return Math.ceil(balance / payment);
    const interest = balance * rate;
    if(payment <= interest) return Infinity;
    return Math.ceil(-Math.log(1 - rate*balance/payment) / Math.log(1+rate));
  }

  function addMonths(dateStr, n){
    const d = parse(dateStr);
    return iso(new Date(d.getFullYear(), d.getMonth()+n, 1));
  }

  return {
    iso, today, parse, addDays, daysBetween, period, fmtDate, nextOnDay,
    projectIncome, nextIncomes, dueInstances, paidFor, owing, exhausted, plan, peso,
    monthsToClear, addMonths, TIER_LABEL, sortForPayment, isActive
  };
})();
