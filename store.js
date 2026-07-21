/* Storage. localStorage is always the source of truth so the app works
   offline. If Supabase credentials are set, every write is mirrored up and
   a pull happens on load. Last write wins, fine for two people. */

const Store = (() => {
  const KEY = 'fin2026';
  const CFG = 'fin2026.supabase';
  const DIRTY = 'fin2026.dirty';
  const TABLES = ['obligations','cards','income','payments','todos','changelog','settings'];

  let db = null;
  let cfg = null;
  let status = 'local';
  let dirty = false;      // local has edits that never reached Supabase
  const listeners = [];

  function blank(){
    return {obligations:[],cards:[],income:[],payments:[],todos:[],changelog:[],settings:{}};
  }

  function readLocal(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return null;
      return Object.assign(blank(), JSON.parse(raw));
    }catch(e){ return null; }
  }

  function writeLocal(){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }
    catch(e){ console.warn('Could not save locally', e); }
  }

  function readCfg(){
    try{ return JSON.parse(localStorage.getItem(CFG) || 'null'); }
    catch(e){ return null; }
  }

  /* ---------- Supabase over plain REST, no SDK ---------- */

  function headers(){
    return {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    };
  }

  async function pushTable(table){
    if(!cfg) return;
    const rows = table === 'settings'
      ? [{id:'singleton', data: db.settings}]
      : (db[table] || []).map(r => ({id: r.id, data: r}));
    if(!rows.length) return;
    const res = await fetch(`${cfg.url}/rest/v1/${table}?on_conflict=id`, {
      method:'POST', headers: headers(), body: JSON.stringify(rows)
    });
    if(!res.ok) throw new Error(`${table}: ${res.status}`);
  }

  async function pullAll(){
    if(!cfg) return false;
    const next = blank();
    for(const table of TABLES){
      const res = await fetch(`${cfg.url}/rest/v1/${table}?select=id,data`, {headers: headers()});
      if(!res.ok) throw new Error(`${table}: ${res.status}`);
      const rows = await res.json();
      if(table === 'settings'){
        const one = rows.find(r => r.id === 'singleton');
        next.settings = one ? one.data : {};
      } else {
        next[table] = rows.map(r => r.data);
      }
    }
    if(next.obligations.length || next.todos.length){
      db = next; writeLocal(); return true;
    }
    return false;
  }

  async function pushAll(){
    for(const t of TABLES) await pushTable(t);
  }

  function setStatus(s){ status = s; listeners.forEach(fn => fn(s)); }

  /* ---------- public ---------- */

  return {
    async init(){
      cfg = readCfg();
      dirty = localStorage.getItem(DIRTY) === '1';
      db = readLocal();
      const fresh = !db;
      if(fresh){
        db = blank();
        const s = window.SEED || {};
        db.obligations = (s.obligations || []).map(o => ({...o, paid:{}}));
        db.cards       = (s.cards || []).slice();
        db.income      = (s.income || []).slice();
        db.todos       = (s.todos || []).slice();
        db.settings    = Object.assign({}, s.settings);
        db.payments = []; db.changelog = [];
        writeLocal();
      }
      if(cfg){
        setStatus('syncing');
        try{
          if(dirty || fresh){
            /* This phone has edits that never made it up. Push first, so a
               pull can never quietly overwrite them. */
            await pushAll();
            dirty = false;
            localStorage.removeItem(DIRTY);
          } else {
            const got = await pullAll();
            if(!got) await pushAll();
          }
          setStatus('synced');
        }catch(e){
          console.warn('Supabase unavailable, staying local', e);
          setStatus('offline');
        }
      } else {
        setStatus('local');
      }
      return db;
    },

    data(){ return db; },
    status(){ return status; },
    onStatus(fn){ listeners.push(fn); },

    config(){ return cfg; },
    setConfig(url, key){
      cfg = url && key ? {url: url.replace(/\/+$/,''), key} : null;
      if(cfg) localStorage.setItem(CFG, JSON.stringify(cfg));
      else localStorage.removeItem(CFG);
    },

    /* Record a change and persist. Every edit passes through here. */
    log(entity, id, field, before, after, note){
      db.changelog.unshift({
        id: 'lg-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
        ts: new Date().toISOString(),
        entity, entityId: id, field,
        before: before ?? null, after: after ?? null,
        note: note || ''
      });
      db.changelog = db.changelog.slice(0, 400);
    },

    async save(tables){
      writeLocal();
      if(!cfg) return;
      setStatus('syncing');
      try{
        for(const t of (tables || TABLES)) await pushTable(t);
        await pushTable('changelog');
        dirty = false; localStorage.removeItem(DIRTY);
        setStatus('synced');
      }catch(e){
        console.warn('Sync failed, saved locally', e);
        dirty = true;
        try{ localStorage.setItem(DIRTY, '1'); }catch(_){}
        setStatus('offline');
      }
    },

    isDirty(){ return dirty; },

    async retry(){
      if(!cfg) return false;
      setStatus('syncing');
      try{
        await pushAll();
        dirty = false; localStorage.removeItem(DIRTY);
        setStatus('synced'); return true;
      }catch(e){ setStatus('offline'); return false; }
    },

    async pull(){
      if(!cfg) return false;
      setStatus('syncing');
      try{ const ok = await pullAll(); setStatus('synced'); return ok; }
      catch(e){ setStatus('offline'); return false; }
    },

    reset(){ localStorage.removeItem(KEY); }
  };
})();
