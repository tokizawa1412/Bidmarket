/* ============================================================
   BidMarket REAL wallet/sidebar focus fix 2026-06-18
   - Sidebar Coin/Credit uses the rendered account wallet values first,
     then /api/me as fallback.
   - Sidebar menu buttons never keep a selected/focus background.
============================================================ */
(function(){
  function parseAmount(text){
    const raw=String(text||'').replace(/,/g,'').replace(/[^0-9.-]/g,'');
    const n=Number(raw);
    return Number.isFinite(n)?n:null;
  }
  function formatAmount(n){return Number(n||0).toLocaleString('th-TH');}
  function findAccountStat(label){
    label=String(label||'').toLowerCase();
    const scopes=[...document.querySelectorAll('.accountHeroStats,.walletMini,.profileWallet,.walletBox,#walletBox')];
    for(const scope of scopes){
      const nodes=[...scope.querySelectorAll('div,button,span')];
      for(const node of nodes){
        const b=[...node.querySelectorAll('b')].find(x=>String(x.textContent||'').trim().toLowerCase()===label);
        if(!b)continue;
        const span=node.querySelector('span');
        const candidates=[span?.textContent,node.textContent];
        for(const c of candidates){
          const n=parseAmount(c);
          if(n!==null)return n;
        }
      }
    }
    return null;
  }
  function setSidebarWallet(coin,credit){
    const c=document.getElementById('sideCoin');
    const cr=document.getElementById('sideCredit');
    if(c)c.textContent=formatAmount(coin);
    if(cr)cr.textContent=formatAmount(credit);
    const mobile=document.getElementById('mobileMenuCredit');
    if(mobile)mobile.textContent='Credit: '+formatAmount(credit);
  }
  async function syncSidebarWalletExact(){
    let coin=null,credit=null;
    const domCoin=findAccountStat('Coin');
    const domCredit=findAccountStat('Credit');
    if(domCoin!==null)coin=domCoin;
    if(domCredit!==null)credit=domCredit;
    try{
      const r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});
      const j=await r.json().catch(()=>({}));
      if(j&&j.user){
        if(coin===null)coin=Number(j.user.coin||0);
        if(credit===null)credit=Number(j.user.credit||0);
      }
    }catch(e){}
    setSidebarWallet(coin||0,credit||0);
  }
  window.syncSidebarWalletExact=syncSidebarWalletExact;
  function clearSidebarStuckState(){
    document.querySelectorAll('.sideMenu button').forEach(btn=>{
      btn.classList.remove('active','isActive','selected','current');
      btn.blur();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    syncSidebarWalletExact();
    clearSidebarStuckState();
    const obs=new MutationObserver(()=>{syncSidebarWalletExact();clearSidebarStuckState();});
    obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
  document.addEventListener('click',()=>setTimeout(()=>{syncSidebarWalletExact();clearSidebarStuckState();},80),true);
  setInterval(syncSidebarWalletExact,900);
})();
