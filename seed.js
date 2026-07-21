/* Starting data, written once on first run.
   After the app has loaded once, this file is no longer needed —
   your data lives in the browser (and Supabase, if connected).
   You can safely replace the contents of SEED with empty arrays. */

window.SEED = {

  /* Tier drives payment priority. Lower number = paid first.
     1 housing (Pag-IBIG)  2 vehicle  3 utilities  4 rent
     5 fixed loans  6 card minimums  7 insurance  8 living      */
  obligations: [
    {id:'ob-house-a', name:'Pag-IBIG housing loan A', tier:1, amount:9166.28, dueDay:11, kind:'housing', note:'Default at 3 unpaid months. Cross-defaults with loan B.'},
    {id:'ob-house-b', name:'Pag-IBIG housing loan B', tier:1, amount:9166.28, dueDay:16, kind:'housing', note:'Default at 3 unpaid months. Cross-defaults with loan A.'},

    {id:'ob-car',     name:'Car loan',                tier:2, amount:17700,   dueDay:5,  kind:'loan', note:'Secured. Repossession risk.'},

    {id:'ob-elec',    name:'Electricity',             tier:3, amount:9700,    dueDay:30, kind:'utility'},
    {id:'ob-water',   name:'Water',                   tier:3, amount:800,     dueDay:12, kind:'utility'},
    {id:'ob-net',     name:'Internet',                tier:3, amount:1500,    dueDay:15, kind:'utility'},

    {id:'ob-rent',    name:'Rent and house maintenance', tier:4, amount:7000, dueDay:22, kind:'housing'},

    {id:'ob-cimb',    name:'CIMB personal loan',      tier:5, amount:6685.33, dueDay:1,  kind:'fixed', note:'Fixed amortisation to Jun 2028. Interest pre-computed.'},
    {id:'ob-gloan-a', name:'GLoan (to Jun 2027)',     tier:5, amount:3969.33, dueDay:28, kind:'fixed'},
    {id:'ob-gloan-b', name:'GLoan (to Sep 2027)',     tier:5, amount:4527.33, dueDay:2,  kind:'fixed'},
    {id:'ob-loandiff',name:'Loan difference, 2 houses',tier:5, amount:17460,  dueDay:20, kind:'fixed', note:'To Oct 2027. Confirm whether secured against the properties.'},
    {id:'ob-spay',    name:'Spaylater',               tier:5, amount:8875.67, dueDay:15, kind:'fixed', note:'Ends Aug 2026.', endsOn:'2026-08-31'},

    {id:'ob-min-bpig',name:'BPI Gold — minimum',      tier:6, amount:6500,    dueDay:13, kind:'cardmin', cardId:'cd-bpi-gold'},
    {id:'ob-min-bpib',name:'BPI blue — minimum',      tier:6, amount:5000,    dueDay:13, kind:'cardmin', cardId:'cd-bpi-blue'},
    {id:'ob-min-velv',name:'Chinabank Velvet — minimum',tier:6,amount:8600,   dueDay:13, kind:'cardmin', cardId:'cd-cb-velvet'},
    {id:'ob-min-ub',  name:'Unionbank — minimum',     tier:6, amount:4850,    dueDay:24, kind:'cardmin', cardId:'cd-unionbank', note:'Estimate. Check statement.'},
    {id:'ob-min-free',name:'Chinabank Freedom — minimum',tier:6,amount:2250,  dueDay:28, kind:'cardmin', cardId:'cd-cb-freedom', note:'Estimate. Check statement.'},
    {id:'ob-min-gc',  name:'GCredit — minimum',       tier:6, amount:2177.35, dueDay:24, kind:'cardmin', cardId:'cd-gcredit'},

    {id:'ob-ins-1',   name:'Insurance — L',           tier:7, amount:3000,    dueDay:8,  kind:'insurance'},
    {id:'ob-ins-2',   name:'Insurance — child',       tier:7, amount:3000,    dueDay:10, kind:'insurance'},
    {id:'ob-ins-3',   name:'Insurance — parent (M)',  tier:7, amount:4070,    dueDay:10, kind:'insurance'},
    {id:'ob-ins-4',   name:'Insurance — S (AXA)',     tier:7, amount:1500,    dueDay:11, kind:'insurance'},
    {id:'ob-ins-5',   name:'Insurance — S (Pru)',     tier:7, amount:3000,    dueDay:25, kind:'insurance'},
    {id:'ob-ins-6',   name:'Insurance — parent (P)',  tier:7, amount:4535,    dueDay:29, kind:'insurance'},
    {id:'ob-subs',    name:'Subscriptions',           tier:7, amount:3078,    dueDay:6,  kind:'insurance', note:'Spotify, Disney+, Netflix, YouTube, Tapo, Canva, LazyWork, GoogleOne'},

    {id:'ob-groc',    name:'Groceries',               tier:8, amount:15000,   dueDay:null, kind:'living'},
    {id:'ob-child',   name:'Child needs',             tier:8, amount:18000,   dueDay:null, kind:'living', note:'Split 7,500 on the 2nd and 7,500 on the 16th.'},
    {id:'ob-gas',     name:'Gas, parking, toll',      tier:8, amount:6000,    dueDay:null, kind:'living'},
    {id:'ob-leisure', name:'Leisure',                 tier:8, amount:10000,   dueDay:null, kind:'living', note:'1,250 per week.'}
  ],

  cards: [
    {id:'cd-bpi-gold',  name:'BPI Gold',                 balance:171419.21, rate:0.03, dueDay:13, kind:'revolving'},
    {id:'cd-bpi-blue',  name:'BPI blue',                 balance:106374.45, rate:0.03, dueDay:13, kind:'revolving'},
    {id:'cd-cb-velvet', name:'Chinabank Velvet',         balance:105000,    rate:0.03, dueDay:13, kind:'revolving'},
    {id:'cd-unionbank', name:'Unionbank Rewards',        balance:97000,     rate:0.03, dueDay:24, kind:'revolving'},
    {id:'cd-cb-freedom',name:'Chinabank Freedom Platinum',balance:45000,    rate:0.03, dueDay:28, kind:'revolving'},
    {id:'cd-gcredit',   name:'GCredit',                  balance:12347.21,  rate:0.05, dueDay:24, kind:'revolving', note:'5–7% depending on GCash activity. Confirm in app.'},
    {id:'cd-cimb',      name:'CIMB personal loan',       balance:112299.93, rate:0,    dueDay:1,  kind:'fixed', payment:6685.33, remaining:23, note:'Interest pre-computed. Not a snowball target.'},
    {id:'cd-gloan-a',   name:'GLoan (to Jun 2027)',      balance:47631.96,  rate:0,    dueDay:28, kind:'fixed', payment:3969.33, remaining:12},
    {id:'cd-gloan-b',   name:'GLoan (to Sep 2027)',      balance:63382.62,  rate:0,    dueDay:2,  kind:'fixed', payment:4527.33, remaining:14}
  ],

  income: [
    {id:'in-a', name:'Client A', rule:'weekly',      weekday:1,        amount:15800, status:'confirmed', note:'Stated as Tuesdays; July tranche landed Monday the 27th. Confirm.'},
    {id:'in-b', name:'Client B', rule:'semimonthly', days:[15,30],     amount:40000, status:'confirmed'},
    {id:'in-c', name:'Client C', rule:'weekly',      weekday:2,        amount:11000, status:'tentative'}
  ],

  todos: [
    {id:'td-1',  text:'Call Pag-IBIG: request Statement of Account for both loans', when:'Now', done:false},
    {id:'td-2',  text:'Ask Pag-IBIG the exact date each account flips to default', when:'Now', done:false},
    {id:'td-3',  text:'Ask whether a partial payment stops the default clock', when:'Now', done:false},
    {id:'td-4',  text:'Confirm GCredit minimum (2,177) was paid', when:'Now', done:false},
    {id:'td-5',  text:'Confirm rent (7,000) for the 22nd', when:'Now', done:false},
    {id:'td-6',  text:'Check real minimum due on Unionbank and Chinabank Freedom statements', when:'Before the 24th', done:false},
    {id:'td-7',  text:'Confirm GCredit rate in the GCash app — 5% or 7%', when:'This week', done:false},
    {id:'td-8',  text:'Jul 27: food 4,000, then the rest to Pag-IBIG', when:'Jul 27', done:false},
    {id:'td-9',  text:'Jul 30: finish Pag-IBIG, pay electricity, water, GLoan', when:'Jul 30', done:false},
    {id:'td-10', text:'Jul 30: hold back 12,000 for the car loan on Aug 5', when:'Jul 30', done:false},
    {id:'td-11', text:'Aug 3: top up car loan to 17,700, then CIMB', when:'Aug 3', done:false},
    {id:'td-12', text:'Mid-Aug: catch up Unionbank, Freedom, both insurances (~14,635)', when:'Mid-Aug', done:false},
    {id:'td-13', text:'Confirm which day Client A actually pays', when:'This week', done:false},
    {id:'td-14', text:'Identify who holds the loan difference for the 2 houses', when:'This week', done:false}
  ],

  settings: {
    cash: 0,
    dailyLiving: 600,
    floatTarget: 65000,
    floatBalance: 0,
    arrearsMonths: 2,
    arrearsNote: 'Two Pag-IBIG amortisations unpaid. Third triggers default and cross-default.'
  }
};
