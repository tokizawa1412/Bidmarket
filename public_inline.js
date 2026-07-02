let me=null,favs=[],selected=null,lastPage='home',currentAuctionCache=null,realtimeJoinedAuction=null;
const THEME_KEY='bidmarket_theme_mode';
function getTheme(){return localStorage.getItem(THEME_KEY)||'dark'}
function applyTheme(mode=getTheme()){
  const dark=mode!=='light';
  document.body.classList.toggle('theme-light',!dark);
  document.body.classList.toggle('theme-dark',dark);
  const btn=document.getElementById('topThemeBtn');
  if(btn){btn.innerHTML=`<span class="themeToggleIcon">${dark?'☀️':'🌙'}</span>`;btn.title=dark?'เปลี่ยนเป็นธีมสว่าง':'เปลี่ยนเป็นธีมมืด'}
}
function toggleTheme(){const next=getTheme()==='dark'?'light':'dark';localStorage.setItem(THEME_KEY,next);applyTheme(next);showToast(next==='dark'?'เปลี่ยนเป็นธีมมืดแล้ว':'เปลี่ยนเป็นธีมสว่างแล้ว')}
function setNotificationBadge(count){const b=document.getElementById('notificationBadge');if(!b)return;b.textContent=count>99?'99+':String(count||0);b.classList.toggle('hasUnread',Number(count||0)>0)}
async function refreshNotificationBadge(){if(!me){setNotificationBadge(0);return}try{const j=await api('/api/notifications');const unread=(j.notifications||[]).filter(n=>!n.read).length;setNotificationBadge(unread)}catch(e){setNotificationBadge(0)}}
function bumpNotificationBadge(){const b=document.getElementById('notificationBadge');if(!b)return;const current=b.classList.contains('hasUnread')?Number((b.textContent||'0').replace('+',''))||0:0;setNotificationBadge(current+1)}
function ensureNotificationWindow(){
  let wrap=document.getElementById('notificationWindow');
  if(wrap)return wrap;
  wrap=document.createElement('div');
  wrap.id='notificationWindow';
  wrap.className='notificationWindow hidden';
  wrap.innerHTML=`<div class="notificationWinHeader"><span>การแจ้งเตือน</span><button class="light" onclick="toggleNotificationWindow(false)">ย่อ</button></div><div id="notificationWinBody" class="notificationWinBody"><div class="notice">กำลังโหลด...</div></div>`;
  document.body.appendChild(wrap);
  return wrap;
}
function toggleNotificationWindow(force){
  const wrap=ensureNotificationWindow();
  const shouldOpen=force===undefined?wrap.classList.contains('hidden'):!!force;
  wrap.classList.toggle('hidden',!shouldOpen);
  if(shouldOpen)loadNotificationWindow();
}
async function openNotifications(){
  if(!me){show('login');return}
  toggleNotificationWindow();
}
async function loadNotificationWindow(){
  const body=document.getElementById('notificationWinBody');
  if(!body)return;
  body.innerHTML='<div class="notice">กำลังโหลด...</div>';
  try{
    const j=await api('/api/notifications');
    const list=(j.notifications||[]);
    const unread=Number(j.unread??list.filter(n=>!n.read).length);
    body.innerHTML=`<div class="notificationActions"><b>${unread} รายการยังไม่อ่าน</b><button class="light" onclick="markNotificationsRead()">ทำเครื่องหมายว่าอ่านแล้ว</button></div>`+(list.length?`<div class="notificationList floatingNotificationList">${list.map(n=>`<div class="notificationItem ${n.read?'':'unread'}"><div class="notificationItemTitle">${escapeHtml(n.title||'แจ้งเตือน')}</div><div class="notificationItemBody">${escapeHtml(n.body||'')}</div>${notificationActionHtml(n)}<div class="notificationItemTime">${n.created_at?new Date(n.created_at).toLocaleString('th-TH'):'-'}</div></div>`).join('')}</div>`:'<div class="notice">ยังไม่มีการแจ้งเตือน</div>');
  }catch(e){body.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}
}
async function markNotificationsRead(){try{const j=await api('/api/notifications/read',{method:'POST'});setNotificationBadge(Number(j.unread||0));await loadNotificationWindow()}catch(e){alert(e.message)}}
function notificationActionHtml(n){const t=n?.type||n?.meta?.type||n?.data?.type;const aid=n?.meta?.auction_id||n?.data?.auction_id;if(t!=='auction_win'||!aid)return '';const cur=String(n?.meta?.currency||n?.data?.currency||'').toLowerCase();const collectionBtn=cur==='credit'?`<button class="gold" onclick="addWinToCollection(${Number(aid)},this)">คอลเลคชั่น</button>`:'';return `<div class="notificationButtons">${collectionBtn}<button class="light" onclick="openSystemStatus(${Number(aid)})">ระบบ</button></div>`}
async function addWinToCollection(auctionId,btn){try{const j=await api('/api/auction-wins/'+auctionId+'/add-collection',{method:'POST'});if(btn){btn.disabled=true;btn.textContent='เพิ่มแล้ว'}showToast(j.message||'เพิ่มแล้ว');refresh()}catch(e){alert(e.message)}}
async function openSystemStatus(auctionId){try{const prev=Object.keys(pages).find(p=>document.getElementById(p)&&!document.getElementById(p).classList.contains('hidden'))||'home';const j=await api('/api/auctions/'+auctionId+'/system-status');show('system');const box=document.getElementById('systemBox');const rows=(j.system.timeline||[]).map(x=>`<div class="systemStep ${x.done?'done':''}"><b>${x.done?'✓':'•'} ${escapeHtml(x.title)}</b><span>${x.at?new Date(x.at).toLocaleString('th-TH'):'รอดำเนินการ'}</span></div>`).join('');if(box)box.innerHTML=`<div class="panel content"><button class="light" onclick="show('${prev}')">← กลับ</button><h2>ระบบรายการสินค้า</h2><h3>${escapeHtml(j.system.item_title||'รายการสินค้า')}</h3><div class="systemTimeline">${rows}</div></div>`;toggleNotificationWindow(false)}catch(e){alert(e.message)}}

function openMobileMenu(){const m=document.getElementById('mobileMenuOverlay');if(m)m.classList.add('open')}
function closeMobileMenu(){const m=document.getElementById('mobileMenuOverlay');if(m)m.classList.remove('open')}
let mobileSwipeStartX=null,mobileSwipeStartY=null;
document.addEventListener('touchstart',e=>{const t=e.touches&&e.touches[0];if(!t)return;mobileSwipeStartX=t.clientX;mobileSwipeStartY=t.clientY},{passive:true});
document.addEventListener('touchend',e=>{if(mobileSwipeStartX===null)return;const t=e.changedTouches&&e.changedTouches[0];if(!t)return;const dx=t.clientX-mobileSwipeStartX,dy=Math.abs(t.clientY-mobileSwipeStartY);const overlay=document.getElementById('mobileMenuOverlay');const isOpen=overlay&&overlay.classList.contains('open');if(dy<70&&dx>80&&mobileSwipeStartX<36&&!isOpen)openMobileMenu();if(dy<70&&dx<-80&&isOpen)closeMobileMenu();mobileSwipeStartX=null;mobileSwipeStartY=null},{passive:true});
function mobileGo(page){closeMobileMenu();show(page)}
function mobileVip(){closeMobileMenu();showVip()}
function mobileAdmin(){closeMobileMenu();showAdmin()}

const socket = io();
const VIP_LEVEL_ORDER=['Member','Silver','Gold','Sapphire','Platinum','Diamond','Ruby','Elite'];
const soundFiles={outbid:'/assets/sounds/outbid.wav',timer:'/assets/sounds/timer-warning.mp3',win:'/assets/sounds/auction-win.mp3',chat:'/assets/sounds/chat-new.wav',escrow:'/assets/sounds/escrow-update.wav',vip:'/assets/sounds/vip-levelup.wav'};
const audioPool={};
let soundEnabled=localStorage.getItem('bidmarket_sound_enabled')!=='0';
let audioUnlocked=false;
let timerWarnedByAuction={};
function audio(name){if(!audioPool[name]){audioPool[name]=new Audio(soundFiles[name]);audioPool[name].preload='auto';audioPool[name].volume=name==='timer'?0.45:0.75}return audioPool[name]}
function unlockAudio(){if(audioUnlocked)return;audioUnlocked=true;Object.keys(soundFiles).forEach(k=>{try{const a=audio(k);a.muted=true;const pr=a.play();if(pr&&pr.then)pr.then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false});else{a.pause();a.currentTime=0;a.muted=false}}catch(e){}})}
document.addEventListener('click',unlockAudio,{once:true});document.addEventListener('touchstart',unlockAudio,{once:true});
function playSound(name){if(!soundEnabled)return;try{const a=audio(name);a.pause();a.currentTime=0;a.play().catch(()=>{});}catch(e){}}
function setSoundEnabled(v){soundEnabled=!!v;localStorage.setItem('bidmarket_sound_enabled',soundEnabled?'1':'0');showToast(soundEnabled?'เปิดเสียงแจ้งเตือนแล้ว':'ปิดเสียงแจ้งเตือนแล้ว')}
function vipRank(level){return VIP_LEVEL_ORDER.indexOf(level||'Member')}
socket.on('connect',()=>{console.log('Real-Time Bid connected');joinRealtimeRooms();});
socket.on('realtime:ready',()=>console.log('Real-Time rooms ready'));
socket.on('auction:created',()=>refreshAuctionLists());
socket.on('auction:list:update',()=>refreshAuctionLists());
socket.on('auction:joined',(auction)=>handleRealtimeAuction(auction,'joined'));
socket.on('auction:bid',(auction)=>handleRealtimeAuction(auction,'bid'));
socket.on('auction:update',(auction)=>handleRealtimeAuction(auction,'update'));
socket.on('auction:chat',(auction)=>handleRealtimeAuction(auction,'chat'));
socket.on('auction:closed',(auction)=>handleRealtimeAuction(auction,'closed'));
socket.on('auction:timer',(t)=>handleRealtimeTimer(t));
socket.on('autoBid:update',(p)=>{if(p?.auto_bid){showToast(p.auto_bid.is_active?'Auto Bid อัปเดตแล้ว':'Auto Bid ถูกปิดแล้ว');} if(p?.auction&&selected&&Number(p.auction.id)===Number(selected))renderRoom(p.auction,true);});
socket.on('autoBid:triggered',(p)=>{if(p?.auction&&selected&&Number(p.auction.id)===Number(selected))renderRoom(p.auction,true);showToast('⏰ Auto Bid เคาะอัตโนมัติแล้ว');});
socket.on('wallet:update',(payload)=>{if(payload?.user){const oldLevel=me?.vip_level||'Member';me=payload.user;header();renderWallet();showToast('ยอดเงินอัปเดตแล้ว');if(vipRank(me.vip_level)>vipRank(oldLevel)){playSound('vip');showToast('🎉 VIP เลื่อนระดับเป็น '+me.vip_level);}}});
socket.on('order:update',(order)=>{playSound('escrow');showToast('สถานะการซื้อขายอัปเดตแล้ว'); if(!orders.classList.contains('hidden')) loadOrders('all'); if(me&&me.role==='admin'&&!admin.classList.contains('hidden')) loadAdmin();});
socket.on('escrow:update',(order)=>{playSound('escrow');showToast('สถานะการซื้อขายอัปเดตแล้ว'); if(!orders.classList.contains('hidden')) loadOrders('all');});
socket.on('chat:message',(msg)=>{if(!me||msg.from_id!==me.id)playSound('chat');if(currentChatUserId&&(msg.from_id===currentChatUserId||msg.to_id===currentChatUserId))loadFloatingConversation();else showToast('มีข้อความใหม่');});
socket.on('notification:new',(n)=>{const type=n?.meta?.type||n?.type;if(['outbid','escrow'].includes(type))return; if(n?.meta?.sound==='vip_level_up'||type==='vip_level_up'||type==='vip_levelup')playSound('vip'); else if(type==='auction')playSound('outbid'); else if(type==='chat')playSound('chat'); bumpNotificationBadge();showToast(n.title||'มีแจ้งเตือนใหม่'); const win=document.getElementById('notificationWindow'); if(win&&!win.classList.contains('hidden'))loadNotificationWindow();});
socket.on('auction:outbidNotice',(p)=>{if(selected&&Number(p?.auction_id)===Number(selected)){playSound('outbid');showAuctionImageNotice(`มีผู้เสนอราคาสูงกว่าคุณแล้ว<br>ราคาปัจจุบัน ${money(p.current_bid,p.currency)}`);}});
socket.on('notification:unread',(p)=>{setNotificationBadge(Number(p?.count||0));});
socket.on('admin:notification',(n)=>{if(me&&me.role==='admin'){showToast(n.title||'แจ้งเตือนระบบ'); if(!admin.classList.contains('hidden'))loadAdmin();}});
socket.on('showcase:rvalue',(p)=>{updateRealtimeCollectionPanel(p);});
socket.on('profile:media',(p)=>{if(!p||!p.user)return;if(Number(p.user.id)===Number(profileTargetId||me?.id)){applyProfileMediaRealtime(p.user);}});
function joinRealtimeRooms(){if(me&&socket.connected)socket.emit('user:join');if(selected&&socket.connected)socket.emit('auction:join',selected)}
function refreshAuctionLists(){if(!home.classList.contains('hidden'))loadAuctions('general');if(!vipzone.classList.contains('hidden'))loadAuctions('vip');if(!market.classList.contains('hidden'))loadMarket();if(!favorites.classList.contains('hidden'))loadFavs();}
function handleRealtimeAuction(auction,eventType){
  if(!auction)return;
  const prev=currentAuctionCache;
  const wasMine=!!(me&&prev&&prev.id===auction.id&&Number(prev.winner_id)===Number(me.id));
  const nowMine=!!(me&&Number(auction.winner_id)===Number(me.id));
  const priceUp=prev&&prev.id===auction.id&&Number(auction.current_bid||0)>Number(prev.current_bid||0);
  if(eventType==='bid'&&wasMine&&!nowMine&&priceUp){playSound('outbid');showAuctionImageNotice('มีผู้เสนอราคาสูงกว่าคุณแล้ว<br>ราคาปัจจุบัน '+money(auction.current_bid,auction.currency));}
  if(selected===auction.id && !room.classList.contains('hidden')) renderRoom(auction,true);
  refreshAuctionLists();
  if(eventType==='bid'&&!(wasMine&&!nowMine&&priceUp))showToast('มีการประมูลใหม่: '+money(auction.current_bid,auction.currency));
  if(eventType==='closed'){if(nowMine){playSound('win');showToast('🎉 คุณชนะการประมูล')}else showToast('การประมูลสิ้นสุดแล้ว');}
}
function handleRealtimeTimer(t){
  if(!t||selected!==t.auction_id||room.classList.contains('hidden'))return;
  const el=document.getElementById('roomTimer');
  if(el)el.textContent=t.remaining==null?'รอเคาะครั้งแรก':tleft(t.remaining);
  if(t.remaining!=null&&t.remaining>0&&t.remaining<=10000&&!timerWarnedByAuction[t.auction_id]){timerWarnedByAuction[t.auction_id]=true;playSound('timer');showToast('⏱ เหลือเวลาประมูลต่ำกว่า 10 วินาที');}
  if(t.remaining!=null&&t.remaining>12000)timerWarnedByAuction[t.auction_id]=false;
}
function showToast(text){
  let box=document.getElementById('rtToast');
  if(!box){box=document.createElement('div');box.id='rtToast';box.style.cssText='position:fixed;right:18px;bottom:92px;z-index:9999;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.18);padding:12px 14px;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.35);max-width:320px;font-size:14px';document.body.appendChild(box)}
  box.textContent=text;box.style.display='block';clearTimeout(box._t);box._t=setTimeout(()=>box.style.display='none',2600);
}
const pages={home:'หน้าหลัก',vipzone:'VIP Zone',market:'ซื้อ/ขาย',sell:'ลงทะเบียนสินค้า',wallet:'กระเป๋าเงิน',orders:'รายการซื้อขาย',favorites:'รายการที่สนใจ',publicProfile:'โปรไฟล์',collection:'คอลเลคชั่น',profile:'บัญชีผู้ใช้',vip:'สมัคร VIP',ads:'ดูโฆษณา',createAd:'ลงโฆษณา',activities:'กิจกรรม',createActivity:'สร้างกิจกรรม',chat:'สนทนา',admin:'ระบบจัดการ',room:'หน้าประมูล',system:'ระบบรายการสินค้า',login:'เข้าสู่ระบบ',register:'สมัครสมาชิก',settings:'ตั้งค่า',rules:'คำอธิบาย'};function $(id){return document.getElementById(id)}function money(n,c){return Number(n||0).toLocaleString('th-TH')+' '+c}async function api(u,o={}){let r=await fetch(u,{headers:{'Content-Type':'application/json'},...o}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'ผิดพลาด');return j}function av(u){let n=u?(u.display_name||u.username):'Guest';return u&&u.avatar_url?u.avatar_url:`https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=111827&color=fff`}
async function loadMe(){me=(await api('/api/me')).user;joinRealtimeRooms()}function header(){
  document.body.classList.toggle('admin',!!(me&&me.role==='admin'));
  const themeBtn=`<button id="topThemeBtn" class="topActionBtn" onclick="toggleTheme()" title="เปลี่ยนธีม"><span class="themeToggleIcon">🌙</span></button>`;
  const bellBtn=me?`<button id="topNotificationBtn" class="topActionBtn" onclick="openNotifications()" title="การแจ้งเตือน">🔔<span id="notificationBadge" class="notificationBadge">0</span></button>`:'';
  auth.innerHTML=me?`${themeBtn}${bellBtn}<button onclick="show('profile')" class="userChip" title="${escapeHtml(me.display_name||me.username)}"><img src="${av(me)}"><span class="userChipName">${escapeHtml(me.display_name||me.username)}</span></button>${me.role==='admin'?`<button class="gold" onclick="showAdmin()">ระบบจัดการ</button>`:''}<button class="danger" onclick="logout()">ออกจากระบบ</button>`:`${themeBtn}<a class="googleTopBtn" href="/auth/google">Gmail Login</a><button class="light" onclick="show('login')">เข้าสู่ระบบ</button><button class="gold" onclick="show('register')">สมัครสมาชิก</button>`;
  applyTheme();
  refreshNotificationBadge();
  sideAvatar.src=av(me);sideName.textContent=me?(me.display_name||me.username):'Guest';sideStatus.textContent=me?(me.role==='admin'?'ระบบจัดการ':(me.is_vip?'สมาชิก VIP':'สมาชิกทั่วไป')):'กรุณาเข้าสู่ระบบ';const mmA=document.getElementById('mobileMenuAvatar'),mmN=document.getElementById('mobileMenuName'),mmC=document.getElementById('mobileMenuCredit');if(mmA)mmA.src=av(me);if(mmN)mmN.textContent=me?(me.display_name||me.username):'Guest';if(mmC)mmC.textContent='Credit: '+Number(me?.credit||0).toLocaleString('th-TH')}async function refresh(){await loadMe();header();await loadFavIds();renderWallet();if(!home.classList.contains('hidden'))loadAuctions('general');if(!vipzone.classList.contains('hidden'))loadAuctions('vip');if(!market.classList.contains('hidden'))loadMarket();if(!favorites.classList.contains('hidden'))loadFavs();if(!orders.classList.contains('hidden'))loadOrders('all');if(!reviews.classList.contains('hidden'))loadReviews();if(!estimate.classList.contains('hidden'))loadEstHistory();if(!publicProfile.classList.contains('hidden'))renderPublicProfile();if(!collection.classList.contains('hidden'))renderCollectionPage();if(!profile.classList.contains('hidden'))renderProfile();if(!admin.classList.contains('hidden'))loadAdmin();if(!ads.classList.contains('hidden'))loadAds();if(!createAd.classList.contains('hidden'))loadMyAds();if(!activities.classList.contains('hidden'))loadActivities('');renderHearts()}function show(id){if(id==='admin')return showAdmin();Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));$(id)?.classList.remove('hidden');document.body.classList.toggle('profileWide',id==='publicProfile');document.body.classList.toggle('accountWide',id==='profile');document.querySelector('.app')?.classList.toggle('noSidebar',id==='login'||id==='register');title.textContent=pages[id]||'BidMarket';desc.textContent='BidMarket';refresh()}function need(){if(!me){show('login');return false}return true}function showVip(){if(need())show('vipzone')}async function login(){try{me=(await api('/api/login',{method:'POST',body:JSON.stringify({username:loginUser.value,password:loginPass.value})})).user;show('home')}catch(e){loginMsg.innerHTML='<div class="notice error">'+e.message+'</div>'}}async function register(){me=(await api('/api/register',{method:'POST',body:JSON.stringify({username:regUser.value,email:regEmail.value,password:regPass.value})})).user;show('home')}async function logout(){await api('/api/logout',{method:'POST'});me=null;show('login')}
async function upload(f){let fd=new FormData();fd.append('file',f);let r=await fetch('/api/upload',{method:'POST',body:fd}),j=await r.json();if(!r.ok)throw Error(j.error||'อัปโหลดไม่สำเร็จ');return j.url}
function showHelp(title,text){helpTitle.textContent=title;helpBody.innerHTML=String(text||'');helpModal.classList.add('show')}
function trustDetailHtml(u){
  u=u||{};
  const rate=Number(u.trust_rate||0);
  const completed=Number(u.trust_completed_sales||0);
  const total=Number(u.trust_total_orders||0);
  const pending=Math.max(0,total-completed);
  const verified=!!(u.verified||u.google_linked);
  const emailOk=!!u.email;
  const googleOk=!!u.google_linked;
  const name=escapeHtml(u.display_name||u.username||'ผู้ใช้');
  return `<div class="trustDetailBox">
    <div class="trustBigScore">${rate}<span>/100</span></div>
    <div class="muted">คะแนนความน่าเชื่อถือของ ${name}</div>
    <div class="trustRows">
      <div><span>${emailOk?'✓':'—'} ยืนยันอีเมล</span><b>${emailOk?'ผ่าน':'ยังไม่มีข้อมูล'}</b></div>
      <div><span>${googleOk?'✓':'—'} ยืนยัน Google</span><b>${googleOk?'ผ่าน':'ยังไม่เชื่อม'}</b></div>
      <div><span>${verified?'✓':'—'} Badge ยืนยันตัวตน</span><b>${verified?'VERIFIED':'ยังไม่ยืนยัน'}</b></div>
      <div><span>ซื้อขายสำเร็จ</span><b>${completed}/${total} รายการ</b></div>
      <div><span>รายการที่ยังไม่สำเร็จ/รอตรวจสอบ</span><b>${pending} รายการ</b></div>
    </div>
    <div class="notice" style="margin-top:12px">Trust Score คำนวณจากประวัติซื้อขายสำเร็จ การยืนยันตัวตน และข้อมูลความน่าเชื่อถือของบัญชีในระบบ BidMarket</div>
  </div>`;
}
function showTrustDetails(u){
  helpTitle.textContent='รายละเอียด Trust Score';
  helpBody.innerHTML=trustDetailHtml(u);
  helpModal.classList.add('show');
}
function toggleStartSchedule(){sellStartAtWrap?.classList.toggle('hidden',sellStartMode.value!=='schedule')}
function rulesSell(){let l=sellLevel.value;let current=sellMethod.value;let ms=l=='general'?[['english','เสนอราคา'],['fee','เคาะราคา']]:[['english','เสนอราคา'],['fee','เคาะราคา'],['sealed','ปิดซอง']];sellMethod.innerHTML=ms.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('');if(ms.some(x=>x[0]===current))sellMethod.value=current;let m=sellMethod.value;let currencies=m==='sealed'?['credit']:['coin','credit'];let oldCurrency=sellCurrency.value;sellCurrency.innerHTML=currencies.map(x=>`<option value="${x}">${x}</option>`).join('');if(currencies.includes(oldCurrency))sellCurrency.value=oldCurrency;vipBox.classList.toggle('hidden',l!='vip');sellStart.placeholder=m==='fee'?'ค่าเคาะต่อครั้ง':'ราคาเริ่มต้น';sellStart.disabled=m==='sealed';sellHours.placeholder=m==='english'?'ระยะเวลาประมูล ชั่วโมง (0.5 - 6)':m==='fee'?'เวลานับถอยหลังต่อครั้ง วินาที (15 - 60)':'ระยะเวลาปิดซอง วัน (1 - 30)';if(m==='sealed'&&!sellHours.value)sellHours.value=1;if(m==='fee'&&!sellHours.value)sellHours.value=30;if(m==='english'&&!sellHours.value)sellHours.value=1;toggleStartSchedule()}
rulesSell();toggleStartSchedule();
let pendingSellPayload=null;
function sellMethodText(m){return m==='english'?'เสนอราคา':m==='fee'?'เคาะราคา':'ปิดซอง'}
function levelText(v){return v==='vip'?'Vip Zone':'ทั่วไป'}
function buildSellPayload(){
  const title=(sellTitle.value||'').trim(), description=(sellDesc.value||'').trim();
  if(!title)throw Error('กรุณากรอกชื่อสินค้า');
  if(!description)throw Error('กรุณากรอกรายละเอียดสินค้า');
  const m=sellMethod.value;
  const startMode=sellStartMode.value;
  if(startMode==='schedule'&&!sellStartAt.value)throw Error('กรุณากำหนดเวลาเริ่มประมูล');
  let payload={level:sellLevel.value,method:m,currency:sellCurrency.value,title,description,category:sellCategory.value,image_url:(sellUrl.value||'').trim(),media_type:mediaType.value,start_price:+sellStart.value||0,start_at:startMode==='schedule'?sellStartAt.value:'',vip_entry_min_credit:+(vipMin.value||0)};
  if(m==='english'){if(!(payload.start_price>0))throw Error('กรุณากรอกราคาเริ่มต้น');payload.duration_minutes=Number(sellHours.value||1)*60}
  if(m==='fee'){if(!(payload.start_price>0))throw Error('กรุณากรอกค่าเคาะต่อครั้ง');payload.bid_fee=payload.start_price;payload.countdown_seconds=+sellHours.value||30}
  if(m==='sealed'){payload.duration_days=+sellHours.value||1;payload.start_price=0}
  return payload;
}
function renderSellConfirm(payload){
  const localFile=sellFile.files&&sellFile.files[0]?sellFile.files[0]:null;
  const previewUrl=localFile?URL.createObjectURL(localFile):payload.image_url;
  const mediaHtml=previewUrl?(payload.media_type==='video'?`<video src="${escapeHtml(previewUrl)}" controls></video>`:`<img src="${escapeHtml(previewUrl)}">`):'ยังไม่มีไฟล์ตัวอย่าง';
  sellConfirmBody.innerHTML=`<div class="notice">กรุณาตรวจสอบข้อมูลก่อนยืนยันการลงทะเบียนสินค้า</div><div class="previewCard"><div class="previewMedia">${mediaHtml}</div><div class="previewBody"><span class="tag ${payload.level==='vip'?'vip':''}">${levelText(payload.level)}</span><span class="tag">${sellMethodText(payload.method)}</span><h3>${escapeHtml(payload.title)}</h3><div class="price">${payload.method==='sealed'?'ปิดซอง':money(payload.method==='fee'?payload.bid_fee:payload.start_price,payload.currency)}</div><p>${escapeHtml(payload.description)}</p></div></div><div class="previewDetails"><div><b>หมวดหมู่</b><span>${escapeHtml(payload.category)}</span></div><div><b>ช่องทาง</b><span>${levelText(payload.level)}</span></div><div><b>หน่วยเงิน</b><span>${payload.currency}</span></div><div><b>เวลาเริ่ม</b><span>${sellStartMode.value==='schedule'?new Date(payload.start_at).toLocaleString('th-TH'):'ทันที'}</span></div><div><b>ระยะเวลา</b><span>${payload.method==='english'?((payload.duration_minutes||0)/60)+' ชั่วโมง':payload.method==='fee'?(payload.countdown_seconds+' วินาที'):(payload.duration_days+' วัน')}</span></div></div>`;
}
async function createAuction(){try{if(!need())return;pendingSellPayload=buildSellPayload();renderSellConfirm(pendingSellPayload);sellConfirmModal.classList.add('show')}catch(e){sellMsg.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}}
async function confirmCreateAuction(){try{if(!pendingSellPayload)return;let payload={...pendingSellPayload};sellMsg.innerHTML='<div class="notice">กำลังลงทะเบียนสินค้า...</div>';if(sellFile.files[0])payload.image_url=await upload(sellFile.files[0]);await api('/api/auctions',{method:'POST',body:JSON.stringify(payload)});sellConfirmModal.classList.remove('show');sellMsg.innerHTML='<div class="notice success">ลงทะเบียนสินค้าแล้ว</div>';sellTitle.value='';sellDesc.value='';sellStart.value='';sellUrl.value='';sellFile.value='';loadAuctions('general');loadAuctions('vip')}catch(e){sellMsg.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>';sellConfirmModal.classList.remove('show')}}
const auctionPages={general:1,vip:1};
function renderAuctionPager(level,total){const per=12;const pages=Math.max(1,Math.ceil(total/per));const box=level==='general'?$('generalPager'):$('vipPager');if(!box)return;box.innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<button class="${auctionPages[level]===i+1?'green':'light'}" onclick="auctionPages['${level}']=${i+1};loadAuctions('${level}')">${i+1}</button>`).join('')}
async function loadAuctions(level){let j=await api('/api/auctions?level='+level);let all=(j.auctions||[]).filter(a=>a&&a.status==='active'&&(!a.end_at||Date.now()<Number(a.end_at)));let per=12;let page=auctionPages[level]||1;let maxPage=Math.max(1,Math.ceil(all.length/per));if(page>maxPage){page=maxPage;auctionPages[level]=page}let items=all.slice((page-1)*per,page*per);(level=='general'?generalGrid:vipGrid).innerHTML=items.map(card).join('')||'<div class="notice">ยังไม่มีสินค้า</div>';renderAuctionPager(level,all.length);renderHearts()}function tleft(ms){let s=Math.floor(ms/1000),d=Math.floor(s/86400);s%=86400;let h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return d?d+' วัน':h?h+' ชม.':m?m+' นาที':s+' วิ'}function media(a,cls=''){return a.media_type=='video'?`<video class="${cls}" src="${a.image_url}" controls></video>`:`<img class="${cls}" src="${a.image_url||''}">`}function card(a){let btn=!a.is_started?`<button disabled>เริ่มในอีก ${tleft(a.time_until_start)}</button>`:`<button class="green" onclick="openJoin(${a.id})">เข้าร่วมประมูล</button>`;return `<div class="card auction">${media(a)}<div class="content"><span class="tag ${a.level=='vip'?'vip':''}">${a.level}</span><span class="tag">${a.method_label||a.method}</span><h3>${a.title}</h3><div class="price">${money(a.current_bid,a.currency)}</div><div class="meta"><div>ผู้ขาย: ${escapeHtml(a.seller_name||'-')}</div><div>Trust: ${a.seller_trust_rate||0}%</div><div>ผู้เสนอราคา: ${a.participant_count}</div></div>${btn}<button class="light detailBtn" onclick="openRoom(${a.id})">รายละเอียด</button></div><button class="heart" id="heart-${a.id}" onclick="toggleFav(event,${a.id})">♡</button></div>`}
async function openJoin(id){if(!need())return;let a=(await api('/api/auctions/'+id)).auction;joinBody.innerHTML=`<h3>${a.title}</h3><div class="notice">วิธีประมูล: ${a.method_label||a.method}${a.method==='english'?'<br>ต้องมีผู้เข้าร่วมอย่างน้อย 3 คน':''}</div>${a.level=='vip'?`<input id="joinCredit" type="number" placeholder="Credit เข้าร่วม">`:''}<button class="green" onclick="confirmJoin(${id})">ยืนยันเข้าร่วม</button><button class="light" onclick="openRoom(${id})">ดูรายละเอียด</button>`;joinModal.classList.add('show')}async function confirmJoin(id){await api('/api/auctions/'+id+'/join',{method:'POST',body:JSON.stringify({credit_amount:+($('joinCredit')?.value||0)})});joinModal.classList.remove('show');openRoom(id)}async function openRoom(id){
  selected=id;lastPage=vipzone.classList.contains('hidden')?'home':'vipzone';
  if(realtimeJoinedAuction&&realtimeJoinedAuction!==id)socket.emit('auction:leave',realtimeJoinedAuction);
  realtimeJoinedAuction=id;socket.emit('auction:join',id);
  let a=(await api('/api/auctions/'+id)).auction;
  Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));
  room.classList.remove('hidden');title.textContent='หน้าประมูล';
  renderRoom(a,false);
}
function renderRoom(a,fromRealtime=false){
  currentAuctionCache=a;
  let bidControl=a.method==='fee'?`<div class="notice">เคาะครั้งละ ${money(a.bid_fee,a.currency)} | นับถอยหลัง ${a.countdown_seconds} วินาที</div><div class="autoBidControls"><button class="green" onclick="bid(${a.id})">เคาะราคา</button><button class="autoBidClockBtn" title="ตั้งค่า Auto Bid" onclick="openAutoBidSettings(${a.id})">⏰ Auto Bid</button></div><div id="autoBidStatus" class="autoBidStatus">กด ⏰ เพื่อตั้งงบเคาะอัตโนมัติเมื่อเหลือ 5 วินาที</div>`:`<input id="bidAmt" type="number" placeholder="${a.method==='sealed'?'ราคาเสนอแบบปิดซอง':'ราคาเสนอ'}"><button class="green" onclick="bid(${a.id})">${a.method==='sealed'?'ส่งซองราคา':'เสนอราคา'}</button>`;
  roomBody.innerHTML=`<h2>${escapeHtml(a.title)}</h2><div class="auctionMediaWrap">${media(a,'auctionMedia')}<div id="auctionImageNotice" class="auctionImageNotice"></div></div><div class="meta"><div>วิธีประมูล: ${a.method_label||a.method}</div><div>ราคาเริ่ม: ${money(a.start_price,a.currency)}</div><div>ราคาปัจจุบัน: <span id="roomCurrentBid">${money(a.current_bid,a.currency)}</span></div><div>ผู้เข้าร่วม: <span id="roomParticipants">${a.participant_count}</span>${a.method==='english'?' / ขั้นต่ำ 3 คน':''}</div><div>เหลือเวลา: <span id="roomTimer">${a.end_at?tleft(Math.max(0,a.end_at-Date.now())):'รอเคาะครั้งแรก'}</span></div><div>${escapeHtml(a.description||'')}</div></div>${bidControl}<button class="light" onclick="shareAuction(${a.id})">แชร์</button><button class="gold" onclick="pinAuction(${a.id})">ปักหมุด</button><button class="light" onclick="closeAuc(${a.id})">สิ้นสุดการประมูล</button><h3>แชทประมูล</h3><div class="chatBox">${(a.chats||[]).map(m=>`<div class="msg sys">${escapeHtml(m.text||'')}</div>`).join('')}</div>`;
  if(a.method==='fee')loadAutoBidStatus(a.id);
}
function showAuctionImageNotice(html){const box=document.getElementById('auctionImageNotice');if(!box)return;box.innerHTML=html;box.classList.add('show');clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove('show'),3000)}
async function loadAutoBidStatus(id){try{if(!me)return;const j=await api('/api/auctions/'+id+'/auto-bid/me');const box=$('autoBidStatus');if(!box)return;const ab=j.auto_bid;if(ab&&ab.is_active)box.innerHTML=`<b>Auto Bid เปิดอยู่</b> งบคงเหลือ ${money(ab.remaining_budget,ab.currency)} / ${money(ab.budget_amount,ab.currency)}`;else box.textContent='Auto Bid ยังไม่เปิดใช้งาน';}catch(e){const box=$('autoBidStatus');if(box)box.textContent='Auto Bid: '+e.message;}}
async function openAutoBidSettings(id){try{if(!need())return;const j=await api('/api/auctions/'+id+'/auto-bid/me');const ab=j.auto_bid;let text=ab&&ab.is_active?`Auto Bid เปิดอยู่\nงบคงเหลือ ${ab.remaining_budget} ${ab.currency} / ${ab.budget_amount} ${ab.currency}\n\nใส่งบใหม่เพื่อแก้ไข หรือพิมพ์ 0 เพื่อปิด`:'ใส่งบ Auto Bid สำหรับเคาะอัตโนมัติ';let val=prompt(text,ab?.budget_amount||'');if(val===null)return;let amount=Number(val||0);if(amount<=0){await fetch('/api/auctions/'+id+'/auto-bid',{method:'DELETE'});showToast('ปิด Auto Bid แล้ว');await loadAutoBidStatus(id);return;}await api('/api/auctions/'+id+'/auto-bid',{method:'POST',body:JSON.stringify({budget_amount:amount})});showToast('ตั้งค่า Auto Bid แล้ว');await loadAutoBidStatus(id);}catch(e){alert(e.message)}}
async function bid(id){try{let body={auction_id:id};if($('bidAmt'))body.amount=+bidAmt.value;let j;if(socket&&socket.connected){j=await new Promise((resolve,reject)=>socket.emit('auction:bid',body,(r)=>r&&r.ok?resolve(r):reject(new Error(r?.error||'เสนอราคาไม่สำเร็จ'))));}else{j=await api('/api/auctions/'+id+'/bid',{method:'POST',body:JSON.stringify(body)});}if(j.auction)renderRoom(j.auction,false);refresh()}catch(e){alert(e.message)}}async function closeAuc(id){try{await api('/api/auctions/'+id+'/close',{method:'POST'});alert('ปิดประมูลแล้ว ระบบสร้าง Order และพักเงินไว้ในระบบซื้อขายปลอดภัย แล้ว'); if(me&&me.role==='admin') showAdmin(); else show('home')}catch(e){alert(e.message)}}
async function shareAuction(id){const url=location.origin+location.pathname+'#auction-'+id;try{if(navigator.share)await navigator.share({title:'BidMarket Auction',url});else await navigator.clipboard.writeText(url);let r=await fetch('/api/auctions/'+id+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});let j=await r.json().catch(()=>({}));if(r.ok&&j.code)showRewardCode(j.code,j.activity_link||'',j.activity?.title||'กิจกรรม');else alert(j.message||'แชร์/คัดลอกลิงก์แล้ว')}catch(e){alert('คัดลอกลิงก์: '+url)}}
async function pinAuction(id){try{let hours=prompt('ต้องการปักหมุดกี่ชั่วโมง? (สูงสุด 168 ชั่วโมง / 7 วัน)','24');if(!hours)return;let j=await api('/api/auctions/'+id+'/pin',{method:'POST',body:JSON.stringify({hours:+hours})});alert(`ปักหมุดสำเร็จ ค่าธรรมเนียม ${j.fee} Credit${j.elite_free?' (ใช้สิทธิ์ Elite ฟรี)':''}`);openRoom(id)}catch(e){alert(e.message)}}

async function loadFavIds(){if(!me){favs=[];return}try{favs=(await api('/api/favorites')).favorite_ids}catch{favs=[]}}async function toggleFav(ev,id){ev.stopPropagation();if(!need())return;if(favs.includes(id))await fetch('/api/favorites/'+id,{method:'DELETE'});else await api('/api/favorites/'+id,{method:'POST'});await loadFavIds();renderHearts();if(!favorites.classList.contains('hidden'))loadFavs()}function renderHearts(){document.querySelectorAll('.heart').forEach(b=>{let id=+b.id.replace('heart-','');b.classList.toggle('saved',favs.includes(id));b.textContent=favs.includes(id)?'♥':'♡'})}async function loadFavs(){let j=await api('/api/favorites');favGrid.innerHTML=j.auctions.map(card).join('')||'<div class="notice">ยังไม่มีรายการที่สนใจ</div>'}
// ============================================================
// ซื้อ/ขาย ไอเทม ด้วยระบบซื้อขายปลอดภัย
// ============================================================
function marketCurrencyLabel(c){return String(c||'credit').toLowerCase()==='coin'?'Coin':'Credit'}
function marketCard(it){
  const mine=me&&Number(it.seller_id)===Number(me.id);
  const sold=it.status!=='active';
  return `<div class="card marketItemCard">${it.image_url?`<img src="${escapeHtml(it.image_url)}">`:''}<div class="content"><span class="tag">${escapeHtml(it.category||'ไอเทม')}</span><span class="tag ${sold?'danger':'success'}">${sold?'ขายแล้ว':'พร้อมขาย'}</span><h3>${escapeHtml(it.title||'-')}</h3><div class="price">${money(it.price||0,marketCurrencyLabel(it.currency))}</div><div class="meta"><div>ผู้ขาย: ${escapeHtml(it.seller_name||it.seller?.username||'-')}</div><div>ระบบ: <b>ระบบซื้อขายปลอดภัย</b></div></div><p class="muted">${escapeHtml(it.description||'')}</p>${sold?'<button disabled>จบรายการแล้ว</button>':mine?`<button class="danger" onclick="cancelMarketItem(${it.id})">ยกเลิกการขาย</button>`:`<button class="green" onclick="buyMarketItem(${it.id})">ซื้อด้วยระบบกลาง</button>`}</div></div>`;
}
async function loadMarket(){
  try{
    const j=await api('/api/market/items');
    if(window.marketGrid)marketGrid.innerHTML=(j.items||[]).map(marketCard).join('')||'<div class="notice">ยังไม่มีไอเทมที่เปิดขาย</div>';
    if(me&&window.marketMyItems){
      const mine=await api('/api/market/items/mine');
      marketMyItems.innerHTML=(mine.items||[]).map(marketCard).join('')||'<div class="notice">ยังไม่มีรายการของฉัน</div>';
    }
  }catch(e){if(window.marketGrid)marketGrid.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}
}
async function createMarketItem(){
  if(!need())return;
  try{
    const body={title:marketTitle.value,description:marketDesc.value,category:marketCategory.value,image_url:marketImage.value,price:Number(marketPrice.value||0),currency:marketCurrency.value};
    await api('/api/market/items',{method:'POST',body:JSON.stringify(body)});
    marketTitle.value='';marketDesc.value='';marketImage.value='';marketPrice.value='';
    showToast('ลงขายไอเทมแล้ว');loadMarket();
  }catch(e){alert(e.message)}
}
async function buyMarketItem(id){
  if(!need())return;
  if(!confirm('ยืนยันซื้อไอเทมนี้ผ่านระบบซื้อขายปลอดภัย?\nระบบจะพักเงินไว้ก่อนจนกว่าการส่งมอบจะสำเร็จ'))return;
  try{await api('/api/market/items/'+id+'/buy',{method:'POST'});showToast('ซื้อสำเร็จ ระบบพักเงินไว้แล้ว');show('orders')}catch(e){alert(e.message)}
}
async function cancelMarketItem(id){
  if(!need())return;if(!confirm('ยืนยันยกเลิกการขาย?'))return;
  try{await api('/api/market/items/'+id+'/cancel',{method:'POST'});loadMarket()}catch(e){alert(e.message)}
}

function renderWallet(){if(!me)return;walletBox&&(walletBox.innerHTML=`<div class="notice success">Coin ${money(me.coin,'Coin')} | Credit ${money(me.credit,'Credit')} | VIP: ${me.vip_level||'Member'} ${me.is_vip?'(ใช้งานอยู่)':'(หมดอายุ/ยังไม่ได้ซื้อ)'}</div><div class="notice">VIP Points: ${money(me.vip_points||0,'คะแนน')} | เติมสะสม: ${money(me.lifetime_credit_topup||0,'Credit')}</div>`);loadTx()}async function loadTx(){if(!me||!txBox)return;let j=await api('/api/transactions');txBox.innerHTML=j.transactions.length?`<table><tr><th>รายการ</th><th>จำนวน</th><th>สกุลเงิน</th></tr>${j.transactions.map(t=>`<tr><td>${t.type}</td><td>${t.amount}</td><td>${t.currency}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการ</div>'}async function buyCoin(){try{let credit=+(coinCredit?.value||0);if(credit<=0)return alert('กรุณากรอกจำนวน Credit ที่ต้องการแลก');if(!confirm(`ยืนยันแลก ${credit} Credit เป็น ${credit*100} Coin?\nหมายเหตุ: Coin ไม่สามารถแลกกลับเป็น Credit ได้`))return;await api('/api/wallet/buy-coin',{method:'POST',body:JSON.stringify({credit})});refresh()}catch(e){alert(e.message)}}
async function createPay(){try{let credit=+(creditAmount?.value||0);if(credit<10)return alert('เติมขั้นต่ำ 10 Credit');let j=await api('/api/payments/create-credit-topup',{method:'POST',body:JSON.stringify({credit})});let p=j.payment;payBox.innerHTML=`<div class="notice success"><b>รายการเติมเงิน</b><br>ต้องชำระ ${p.baht_amount.toLocaleString()} บาท = ${p.credit_amount.toLocaleString()} Credit<br>อัตรา ${p.rate_baht_per_credit||6} บาท / 1 Credit<br>สถานะ: รออัปโหลดสลิป</div><div style="text-align:center"><img src="/assets/payment-qr.jfif" style="max-width:280px;width:100%;border-radius:18px;border:1px solid #ddd"><p>สแกน QR นี้เพื่อโอนเงิน แล้วอัปโหลดสลิปเพื่อให้ระบบตรวจสอบ</p></div><input id="slip_${p.id}" type="file" accept="image/*,.pdf"><button class="green" onclick="uploadSlip('${p.id}')">อัปโหลดสลิปแจ้งชำระเงิน</button>`}catch(e){alert(e.message)}}
async function uploadSlip(id){let inp=document.getElementById('slip_'+id);if(!inp||!inp.files[0])return alert('กรุณาเลือกไฟล์สลิป');let fd=new FormData();fd.append('payment_id',id);fd.append('slip',inp.files[0]);let r=await fetch('/api/payments/upload-slip',{method:'POST',body:fd});let j=await r.json();if(!r.ok)return alert(j.error||'อัปโหลดไม่สำเร็จ');payBox.innerHTML='<div class="notice success">ส่งสลิปแล้ว กรุณารอระบบตรวจสอบ เมื่ออนุมัติแล้ว Credit จะเพิ่มเข้าบัญชีอัตโนมัติ</div>';refresh()}
async function mockPay(id){alert('ระบบ Mock ถูกปิดแล้ว ใช้การอัปโหลดสลิปและรอระบบอนุมัติแทน')}
async function subVip(p){await api('/api/vip/subscribe',{method:'POST',body:JSON.stringify({plan:p})});refresh()}

async function showVipBenefits(){
  try{
    const cfg=await api('/api/vip/config');
    const levels=cfg.levels||[];
    const bt=cfg.benefits?.benefit_text||{};
    const html=`<div class="vipHelpText"><p>ผู้ที่เป็นสมาชิก Vip จะสามารถเข้าร่วมการประมูลแบบ <b>ปิดซอง</b> ที่ห้อง Vip Zone ได้ และหากระดับ Vip สูงขึ้นก็จะได้รับสิทธิประโยชน์มากขึ้นตามระดับ</p>`+
      levels.map(l=>`<h3>${l}</h3><ul>${(bt[l]||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`).join('')+
      `<div class="notice">การปักหมุดประมูลฟรีจากสิทธิ VIP ใช้ได้ 24 ชั่วโมงต่อ 1 ครั้งเท่านั้น</div></div>`;
    showHelp('สิทธิประโยชน์ VIP แต่ละระดับ',html);
  }catch(e){alert(e.message)}
}
async function buyVipPoints(){
  const credit=Number(prompt('ต้องการใช้กี่ Credit เพื่อซื้อ VIP Point?\\n1 Credit = 1 คะแนน')||0);
  if(!credit)return;
  try{me=(await api('/api/vip/buy-points',{method:'POST',body:JSON.stringify({credit})})).user;refresh();showToast('ซื้อ VIP Point สำเร็จ')}catch(e){alert(e.message)}
}


async function loadOrders(type='all'){
  if(!need())return;
  let j=await api('/api/orders?type='+type);
  ordersBox.innerHTML=j.orders.length?`<div class="grid">${j.orders.map(orderCard).join('')}</div>`:'<div class="notice">ยังไม่มีรายการซื้อขาย</div>';
}
function status(s){return {WAIT_SHIPPING:'รอผู้ขายจัดส่ง',SHIPPED:'ผู้ขายแจ้งจัดส่งแล้ว',DELIVERED:'รอยืนยันครบสองฝ่าย',COMPLETED:'สำเร็จ / ปล่อยเงินแล้ว',DISPUTE:'ข้อพิพาท',REFUNDED:'คืนเงินแล้ว',CANCELLED:'ยกเลิก'}[s]||s}
function orderTimeline(o){let ev=(o.events||o.timeline||[]).slice(0,5);return ev.length?`<details><summary>ประวัติการซื้อขายปลอดภัย</summary>${ev.map(e=>`<div class="muted">${new Date(e.created_at||Date.now()).toLocaleString('th-TH')} - ${escapeHtml(e.note||e.type||'-')}</div>`).join('')}</details>`:''}
function orderCard(o){
  const isBuyer=o.buyer_id==me?.id, isSeller=o.seller_id==me?.id;
  const role=isBuyer?'คุณเป็นผู้ซื้อ':isSeller?'คุณเป็นผู้ขาย':'เกี่ยวข้อง';
  return `<div class="card content"><h3>${escapeHtml(o.item_title)}</h3><div class="tag">${role}</div><div class="meta"><div>สถานะ: <b>${status(o.status)}</b></div><div>ยอดที่ระบบพักไว้: <b>${money(o.amount,o.currency)}</b></div><div>ผู้ซื้อ: ${escapeHtml(o.buyer?.display_name||o.buyer?.username||'-')} (#${o.buyer_id})</div><div>ผู้ขาย: ${escapeHtml(o.seller?.display_name||o.seller?.username||'-')} (#${o.seller_id})</div>${o.shipping_company||o.tracking_number?`<div>ขนส่ง: ${escapeHtml(o.shipping_company||'-')} / เลขพัสดุ: ${escapeHtml(o.tracking_number||'-')}</div>`:''}<div>ระบบซื้อขายปลอดภัย: <b>${escapeHtml(o.escrow_version||'v1')}</b> / ${escapeHtml(o.escrow_status||'-')}</div>${o.resolution_note?`<div class="notice">ผลตัดสิน: ${escapeHtml(o.resolution_note)}</div>`:''}${o.dispute?`<div class="notice error">ข้อพิพาท: ${escapeHtml(o.dispute.reason||'-')}</div>`:''}</div>${orderTimeline(o)}${actions(o)}</div>`;
}
function actions(o){
  let h='';
  if(o.seller_id==me?.id&&o.status==='WAIT_SHIPPING')h+=`<input id="co${o.id}" placeholder="บริษัทขนส่ง / วิธีส่งมอบ"><input id="tr${o.id}" placeholder="เลขพัสดุ หรือหลักฐานส่งมอบ"><input id="dn${o.id}" placeholder="หมายเหตุการส่งมอบ"><button class="green" onclick="ship(${o.id})">แจ้งจัดส่ง / ส่งมอบแล้ว</button>`;
  if([o.seller_id,o.buyer_id].includes(me?.id)&&['SHIPPED','DELIVERED'].includes(o.status))h+=`<button class="green" onclick="confirmO(${o.id})">ยืนยันซื้อขายสำเร็จ</button>`;
  if([o.seller_id,o.buyer_id].includes(me?.id)&&!['COMPLETED','REFUNDED','DISPUTE'].includes(o.status))h+=`<input id="dp${o.id}" placeholder="เหตุผลหากต้องการแจ้งปัญหา"><input id="ev${o.id}" type="file" multiple accept="image/*,.pdf"><button class="danger" onclick="dispute(${o.id})">แจ้งปัญหา / เปิดข้อพิพาท</button>`;
  return h||'<span class="muted">ไม่มีรายการที่ต้องดำเนินการ</span>';
}
async function ship(id){
  try{await api('/api/orders/'+id+'/ship',{method:'POST',body:JSON.stringify({shipping_company:$('co'+id).value,tracking_number:$('tr'+id).value,delivery_note:$('dn'+id).value})});alert('แจ้งจัดส่งแล้ว');loadOrders()}catch(e){alert(e.message)}
}
async function confirmO(id){
  try{await api('/api/orders/'+id+'/confirm',{method:'POST'});alert('ยืนยันแล้ว หากทั้งสองฝ่ายยืนยันครบ ระบบจะปล่อยเงินให้ผู้ขาย');loadOrders();refresh()}catch(e){alert(e.message)}
}
async function dispute(id){
  try{let fd=new FormData();fd.append('reason',$('dp'+id).value||'');let inp=$('ev'+id);if(inp&&inp.files){[...inp.files].forEach(f=>fd.append('files',f))}let r=await fetch('/api/orders/'+id+'/dispute',{method:'POST',body:fd});let j=await r.json();if(!r.ok)throw Error(j.error||'เปิดข้อพิพาทไม่สำเร็จ');alert('เปิดข้อพิพาทแล้ว กรุณารอ ระบบพิจารณา');loadOrders()}catch(e){alert(e.message)}
}
async function estimatePrice(){if(!need())return;let fs=[...estPhotos.files];if(fs.length<1||fs.length>6)return alert('ใส่รูป 1-6 รูป');let fd=new FormData();fd.append('title',estTitle.value);fd.append('category',estCat.value);fd.append('condition',estCond.value);fd.append('notes',estNotes.value);fs.forEach(f=>fd.append('photos',f));let r=await fetch('/api/ai/price-estimate',{method:'POST',body:fd}),j=await r.json();let e=j.estimate;estResult.innerHTML=`<div class="notice success"><h3>${e.estimated_min.toLocaleString()} - ${e.estimated_max.toLocaleString()} บาท</h3><p>ค่ากลาง ${e.estimated_mid.toLocaleString()} | ความมั่นใจ ${e.confidence}</p><div class="thumbs">${e.photos.map(p=>`<img src="${p}">`).join('')}</div></div>`;loadEstHistory()}async function loadEstHistory(){if(!me)return;let j=await api('/api/ai/price-estimates');estHistory.innerHTML=j.estimates.map(e=>`<div class="notice">${e.title}: ${e.estimated_min.toLocaleString()} - ${e.estimated_max.toLocaleString()} บาท</div>`).join('')||'<div class="notice">ยังไม่มีประวัติ</div>'}

const VIP_CARD_ASSETS={Member:'/assets/vip/card-member.png',Silver:'/assets/vip/card-silver.png',Gold:'/assets/vip/card-gold.png',Sapphire:'/assets/vip/card-sapphire.png',Platinum:'/assets/vip/card-platinum.png',Diamond:'/assets/vip/card-diamond.png',Ruby:'/assets/vip/card-ruby.png',Elite:'/assets/vip/card-elite.png'};
const VIP_BADGE_ASSETS={Member:'/assets/vip/badge-member.png',Silver:'/assets/vip/badge-silver.png',Gold:'/assets/vip/badge-gold.png',Sapphire:'/assets/vip/badge-sapphire.png',Platinum:'/assets/vip/badge-platinum.png',Diamond:'/assets/vip/badge-diamond.png',Ruby:'/assets/vip/badge-ruby.png',Elite:'/assets/vip/badge-elite.png'};
const VIP_NEXT_TARGET={Member:100,Silver:2000,Gold:15000,Sapphire:50000,Platinum:300000,Diamond:600000,Ruby:1000000,Elite:1000000};
function normalizedVipLevel(level){level=String(level||'Member');if(level==='Emerald')level='Ruby';return VIP_LEVEL_ORDER.includes(level)?level:'Member'}
function nextVipLevel(level){level=normalizedVipLevel(level);const i=VIP_LEVEL_ORDER.indexOf(level);return VIP_LEVEL_ORDER[Math.min(i+1,VIP_LEVEL_ORDER.length-1)]||level}
function vipLevelName(u){
  const points=Number(u?.vip_points||0);
  const levelFromServer=normalizedVipLevel((u&&(u.vip_level||u.vipLevel||u.level))||'Member');
  const thresholds={Member:0,Silver:100,Gold:2000,Sapphire:15000,Platinum:50000,Diamond:300000,Ruby:600000,Elite:1000000};
  let levelFromPoints='Member';
  for(const lv of VIP_LEVEL_ORDER){ if(points>=thresholds[lv]) levelFromPoints=lv; }
  return VIP_LEVEL_ORDER.indexOf(levelFromPoints)>VIP_LEVEL_ORDER.indexOf(levelFromServer)?levelFromPoints:levelFromServer;
}
function vipTargetForLevel(level){level=normalizedVipLevel(level);return VIP_NEXT_TARGET[level]||0}
function vipProgressForUser(u){const level=vipLevelName(u);const points=Number(u?.vip_points||0);const target=vipTargetForLevel(level);const pct=level==='Elite'?100:(target?Math.max(0,Math.min(100,(points/target)*100)):0);return {level,points,target,pct,next:nextVipLevel(level)}}
function vipBadgeImageHtml(level,extraClass=''){level=normalizedVipLevel(level);const src=VIP_BADGE_ASSETS[level]||VIP_BADGE_ASSETS.Member;return `<img class="vipBadgeImg ${extraClass}" src="${src}" alt="${escapeHtml(level)} badge">`}
function vipMiniBadge(u){return vipBadgeImageHtml(vipLevelName(u),'inlineVipBadge')}
function vipPremiumCard(level){return vipBadgeImageHtml(level,'heroVipBadge')}
function accountVipCardHtml(u){
  const p=vipProgressForUser(u);
  const displayLevel=normalizedVipLevel(window.__vipCardPreviewLevel||p.level);
  const src=VIP_CARD_ASSETS[displayLevel]||VIP_CARD_ASSETS.Member;
  const displayTarget=vipTargetForLevel(displayLevel);
  const displayPct=displayTarget?Math.max(0,Math.min(100,(Number(p.points||0)/displayTarget)*100)):0;
  const points=Number(p.points||0).toLocaleString('th-TH');
  const target=Number(displayTarget||0).toLocaleString('th-TH');
  const pct=Math.round(displayPct).toLocaleString('th-TH');
  const barPct=Math.max(0, Math.min(100, displayPct));
  // Visual rail fix: when the logical progress is full, keep the fill ending at the arrow-marked point inside the printed rail.
  // The percent text still shows the real value; only the painted fill is shortened for 100% cases.
  const visualBarPct = barPct >= 99 ? 94 : barPct;
  const isAdmin=!!(me&&me.role==='admin');
  return `<div class="accountVipCardPreviewShell">
    <div class="accountVipCardImageBox vipCard_${displayLevel.toLowerCase()}">
      <img class="accountVipCardImage" src="${src}" alt="VIP ${escapeHtml(displayLevel)} card">
      <button class="vipHelpBtn" onclick="showVipLevelPopup('${escapeHtml(displayLevel)}')" title="ดูเงื่อนไขเลื่อนระดับ">?</button>
      <div class="vipCardOverlayText"><span class="vipScoreCurrent">${points}</span><span class="vipScoreTarget">${target}</span></div>
      <div class="vipCardProgress"><div style="--vip-fill-width:${visualBarPct}%"></div></div>
      <div class="vipCardPercent">${pct}%</div>
    </div>
    ${isAdmin?`<div class="vipCardNav" aria-label="ตรวจดูบัตร VIP ระดับต่างๆ">
      <button type="button" onclick="changeVipCardPreview(-1)" title="บัตรระดับก่อนหน้า">‹</button>
      <button type="button" onclick="changeVipCardPreview(1)" title="บัตรระดับถัดไป">›</button>
    </div>`:''}
  </div>`;
}
function changeVipCardPreview(delta){
  if(!(me&&me.role==='admin'))return;
  const current=normalizedVipLevel(window.__vipCardPreviewLevel||vipProgressForUser(me||{}).level);
  const i=VIP_LEVEL_ORDER.indexOf(current);
  const next=VIP_LEVEL_ORDER[(i+delta+VIP_LEVEL_ORDER.length)%VIP_LEVEL_ORDER.length];
  window.__vipCardPreviewLevel=next;
  if(typeof renderProfile==='function') renderProfile();
}
function showVipLevelPopup(level){
  const p=vipProgressForUser(me||{}); level=normalizedVipLevel(level||p.level); const next=nextVipLevel(level);
  const currentSrc=VIP_CARD_ASSETS[level]||VIP_CARD_ASSETS.Member; const nextSrc=VIP_CARD_ASSETS[next]||currentSrc;
  const isTop=level==='Elite';
  const target=vipTargetForLevel(level);
  const points=Number(me?.vip_points||0);
  const need=Math.max(0,target-points);
  const condition=isTop?'คุณอยู่ระดับสูงสุดแล้ว':`ต้องมีคะแนน VIP ถึง ${Number(target).toLocaleString('th-TH')} คะแนน เพื่อเลื่อนเป็น ${escapeHtml(next)}${need>0?` (ขาดอีก ${Number(need).toLocaleString('th-TH')} คะแนน)`:''}`;
  helpTitle.textContent='เงื่อนไขเลื่อนระดับ VIP';
  helpBody.innerHTML=`<div class="vipLevelPopupBody"><div class="vipCompare"><img src="${currentSrc}" alt="${escapeHtml(level)}"><div class="vipArrow">➜</div><img src="${nextSrc}" alt="${escapeHtml(next)}"></div><div class="vipRequirement"><b>เงื่อนไข:</b> ${condition}</div></div>`;
  helpModal.classList.add('show');
}

function renderAccountSidePanels(){
  const fBox=document.getElementById('accountFriendsBox');
  const aBox=document.getElementById('accountActivityBox');
  if(!fBox||!aBox||!me)return;
  fBox.innerHTML='<div class="friendsPanel"><div class="panelHead"><h3>เพื่อน (0/100)</h3><a href="#" onclick="return false">ทั้งหมด ›</a></div><input class="friendSearch" placeholder="ค้นหาเพื่อน"><div class="profileEmpty">กำลังโหลด...</div></div>';
  aBox.innerHTML='<div class="activityPanel"><h3>กิจกรรมล่าสุด</h3><div class="profileEmpty">กำลังโหลด...</div></div>';
  api('/api/profiles/'+me.id).then(j=>{
    const friends=(j.friends||[]).slice(0,8);
    fBox.innerHTML=`<div class="friendsPanel"><div class="panelHead"><h3>เพื่อน (${(j.friends||[]).length}/100)</h3><a href="#" onclick="return false">ทั้งหมด ›</a></div><input class="friendSearch" placeholder="ค้นหาเพื่อน">${friends.length?friends.map(f=>`<div class="friendRow" onclick="openChatWithUser(${f.id})"><img src="${av(f)}"><div><b>${escapeHtml(f.display_name||f.username)}</b><br><span class="muted">ออนไลน์</span></div><button class="chatTiny">💬</button></div>`).join(''):'<div class="profileEmpty">ยังไม่มีรายชื่อเพื่อน</div>'}</div>`;
    aBox.innerHTML=`<div class="activityPanel"><h3>กิจกรรมล่าสุด</h3>${(j.recent_activities||[]).length?(j.recent_activities||[]).slice(0,8).map(a=>`<div class="activityItem"><b>${escapeHtml(a.type)}</b><br>${escapeHtml(a.title||'-')}<br><span class="muted">${a.amount?money(a.amount,a.currency||''):''} ${a.created_at?new Date(a.created_at).toLocaleString('th-TH'):''}</span></div>`).join(''):'<div class="profileEmpty">ยังไม่มีกิจกรรมล่าสุด</div>'}</div>`;
  }).catch(()=>{
    fBox.innerHTML='<div class="friendsPanel"><h3>เพื่อน (0/100)</h3><div class="profileEmpty">ยังไม่มีรายชื่อเพื่อน</div></div>';
    aBox.innerHTML='<div class="activityPanel"><h3>กิจกรรมล่าสุด</h3><div class="profileEmpty">ยังไม่มีกิจกรรมล่าสุด</div></div>';
  });
}
function renderProfile(){
  if(!me)return;
  const display=escapeHtml(me.display_name||me.username||'ผู้ใช้');
  const uid=escapeHtml(me.public_user_id||me.user_id16||('BM'+String(me.id||'').padStart(14,'0')).slice(0,16));
  const isVip=!!me.is_vip;
  const statusText=isVip?'VIP MEMBER':'สมาชิกทั่วไป';
  const verified=me.verified||me.google_linked;
  window.trustDetailMe=me;
  profileBox.innerHTML=`<div class="accountLayoutV2">
    <main class="accountMainV2">
      <section class="accountHeroBannerV2">
        <div class="accountIdentityCardV2">
          <img class="accountHeroAvatar" src="${av(me)}" alt="profile">
          <div class="accountHeroName"><span class="accountNameText">${display}</span></div>
          <div class="accountHeroId">ID : <span>${uid}</span></div>
          <div class="accountHeroStatus"><span>${statusText}</span>${isVip?vipPremiumCard(vipLevelName(me)):''}</div>
          <div class="accountHeroVerified ${verified?'ok':'no'}">${verified?'✓ VERIFIED':'ยังไม่ยืนยันตัวตน'}</div>
          <div class="accountHeroStats">
            <button class="trustStatBtn" onclick="showTrustDetails(window.trustDetailMe)"><b>Trust Score</b><span>${Number(me.trust_rate??50)}</span></button>
            <div><b>Coin</b><span>${Number(me.coin||0).toLocaleString('th-TH')}</span></div>
            <div><b>Credit</b><span>${Number(me.credit||0).toLocaleString('th-TH')}</span></div>
          </div>
        </div>
        <aside class="accountVipCardWrapV2">${accountVipCardHtml(me)}</aside>
      </section>
      <section class="notice accountSoundBox"><b>เสียงแจ้งเตือน</b><br><label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" ${soundEnabled?'checked':''} onchange="setSoundEnabled(this.checked)" style="width:auto;margin:0"> เปิดเสียงแจ้งเตือน Realtime</label><div class="small">ใช้กับ: ถูกเสนอราคาสูงกว่า, เหลือเวลา 10 วินาที, ชนะประมูล, แชท, ระบบซื้อขายปลอดภัย และ VIP Level Up</div></section>
      <section class="accountCardsGrid"><div class="card content"><h3>ข้อมูลบัญชี</h3><input id="pName"><input id="pEmail"><textarea id="pBio"></textarea><input id="pAvatar" placeholder="URL รูปโปรไฟล์"><button onclick="saveProfile()">บันทึก</button></div><div class="card content"><h3>ความน่าเชื่อถือผู้ขาย</h3><div id="trustBox"></div></div></section>
    </main>
    <aside class="accountRightV2"><div id="accountFriendsBox" class="profileFriends"></div><div id="accountActivityBox" class="profileActivity"></div></aside>
  </div>`;
  pName.value=me.display_name||me.username||'';
  pEmail.value=me.email||'';
  pBio.value=me.bio||'';
  pAvatar.value=me.avatar_url||'';
  trustBox.innerHTML=`<button class="trustSummaryBtn" onclick="showTrustDetails(window.trustDetailMe)"><div class="price">${Number(me.trust_rate??50)}%</div><div>สำเร็จ ${me.trust_completed_sales||0}/${me.trust_total_orders||0} รายการ</div><span class="muted">กดเพื่อดูรายละเอียด</span></button>`;
  renderAccountSidePanels();
}
async function saveProfile(){me=(await api('/api/me/profile',{method:'PUT',body:JSON.stringify({display_name:pName.value,email:pEmail.value,bio:pBio.value,avatar_url:pAvatar.value})})).user;refresh()}

let profileTargetId=null;
function openProfilePage(id){if(!me){show('login');return}profileTargetId=id||me.id;show('publicProfile')}
function mobileOpenProfile(){closeMobileMenu();openProfilePage()}
function cssUrl(url){return String(url||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'')}

function updateRealtimeCollectionPanel(p={}){
  const val=document.querySelector('[data-collection-value]');
  if(val&&p.collection_value!==undefined)val.textContent=fmtNum(p.collection_value)+' R';
  const card=document.querySelector(`[data-showcase-id="${p.showcase_id}"] .rValue`);
  if(card&&p.r_value!==undefined)card.textContent=fmtNum(p.r_value)+' R';
}
function applyProfileMediaRealtime(u){
  const banner=document.querySelector('.profileBanner');
  if(banner&&u.profile_banner_url){banner.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.12)),url('${cssUrl(u.profile_banner_url)}')`;}
  const avatar=document.querySelector('.profilePic');
  if(avatar&&(u.profile_image_url||u.avatar_url))avatar.src=u.profile_image_url||u.avatar_url;
}
function openImageViewer(url,title='รูปภาพ'){
  showHelp(title,`<div class="imageViewer"><img src="${escapeHtml(url)}" alt="${escapeHtml(title)}"></div>`);
}

function profileBannerStyle(u){const url=u&&u.profile_banner_url?cssUrl(u.profile_banner_url):'';return url?`background-image:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.12)),url('${url}')`:''}
function canChangeText(ts){if(!ts)return 'เปลี่ยนได้ทันที';const left=7*24*60*60*1000-(Date.now()-Number(ts));return left<=0?'เปลี่ยนได้ทันที':'เปลี่ยนได้อีกใน '+Math.ceil(left/(24*60*60*1000))+' วัน'}
function fmtNum(n){return Number(n||0).toLocaleString('th-TH')}
function crownHtml(rank){rank=Number(rank||0);if(!rank)return '';const src=rank<=10?'/assets/crown-gold.png':'/assets/crown-silver.png';return `<img class="rankCrown" src="${src}" alt="crown">`}
function collectionRankText(profileData){const r=Number(profileData?.collection_rank||0);return r?`อันดับ ${r} ${crownHtml(r)}`:'ยังไม่มีอันดับ'}
function openShowcaseEditor(rank){
  const html=`<div class="showcaseEditor"><label>ชื่อ</label><input id="modalShowcaseTitle" placeholder="ชื่อสินค้าในตู้โชว์"><label>เลือกไฟล์</label><input id="modalShowcaseFile" type="file" accept="image/*"><div class="modalActions"><button class="green" onclick="saveShowcaseFromPopup(${rank})">เพิ่ม/เปลี่ยน</button><button onclick="helpModal.classList.remove('show')">ยกเลิก</button></div></div>`;
  showHelp('เพิ่ม/เปลี่ยนรูปตู้โชว์อันดับ '+rank,html);
}
async function saveShowcaseFromPopup(rank){
  try{const title=(document.getElementById('modalShowcaseTitle')?.value||'').trim();const f=document.getElementById('modalShowcaseFile')?.files?.[0];if(!f)throw new Error('กรุณาเลือกรูปภาพ');const image_url=await uploadAny(f);await api('/api/profiles/me/showcase',{method:'POST',body:JSON.stringify({rank:Number(rank),title,image_url})});helpModal.classList.remove('show');await renderPublicProfile();showToast('อัปเดตตู้โชว์สินค้าแล้ว')}catch(e){alert(e.message)}
}

function renderProfileShowcase(items,owner,profileData){
  const arr=[2,1,3].map(rank=>(items||[]).find(x=>Number(x.rank)===rank)||{rank});
  const cards=arr.map(x=>{
    const clickable=owner?` onclick="openShowcaseEditor(${x.rank})" title="กดเพื่อเพิ่ม/เปลี่ยนรูป"`:'';
    return x.image_url?`<div class="showcaseItem rank${x.rank}" data-showcase-id="${escapeHtml(x.id||'')}"${clickable}><img src="${escapeHtml(x.image_url)}" alt="${escapeHtml(x.title||'สินค้าในตู้โชว์')}"><button class="showcaseEye" onclick="event.stopPropagation();openImageViewer('${escapeHtml(x.image_url)}','${escapeHtml(x.title||('อันดับ '+x.rank))}')" title="ดูรูปภาพ">👁</button><div class="showcaseBadge">อันดับ ${x.rank}</div>${owner?`<button class="showcaseRemove" onclick="event.stopPropagation();removeProfileShowcase(${x.rank})">ลบ</button>`:''}<div class="rValue">${fmtNum(x.r_value||100)} R</div>${!owner?`<button class="green boostBtn" onclick="event.stopPropagation();boostShowcaseValue(${x.id})">เพิ่มมูลค่า +100 R</button>`:''}</div>`:`<div class="showcaseItem rank${x.rank} emptyShowcase"${clickable}><div class="showcaseBadge">อันดับ ${x.rank}</div><div class="profileEmpty">${owner?'กดตรงนี้เพื่อเพิ่มรูป':'ยังไม่ได้เพิ่มสินค้า'}</div></div>`;
  }).join('');
  const u=profileData?.user||{};
  const canCollection=!!profileData?.can_open_collection;
  return `<div class="showcaseV3"><div class="showcaseLeft"><h3>ตู้โชว์สินค้า</h3><div class="showcaseGrid">${cards}</div></div><aside class="collectionSide"><section class="collectionValueCard"><div class="collectionTitle"><b>มูลค่าคอลเลคชั่น</b>${canCollection?`<button class="miniBtn" onclick="openCollectionVault()">∆</button>`:''}</div><div class="collectionValue" data-collection-value>${fmtNum(u.collection_value||0)} R</div><div class="collectionRankBox"><span>อันดับคอลเลคชั่น</span><b data-collection-rank>${collectionRankText(profileData)}</b></div></section><section class="rcoinCard"><div class="rcoinLabel">บัญชี R-Coin</div><div class="rcoinValue" data-rcoin-balance>${fmtNum(u.r_coin||0)} R-Coin</div>${owner?`<button class="gold rcoinExchange" onclick="exchangeRCoin()">แลก R-Coin</button>`:''}</section></aside></div>`;
}
async function boostShowcaseValue(id){
  try{await api('/api/profiles/showcase/'+id+'/boost-value',{method:'POST',body:JSON.stringify({})});await renderPublicProfile();showToast('เพิ่มมูลค่า +100 R แล้ว')}catch(e){alert(e.message)}
}
async function exchangeRCoin(){
  try{me=(await api('/api/me/rcoin/exchange',{method:'POST',body:JSON.stringify({})})).user;const rb=document.querySelector('[data-rcoin-balance]');if(rb)rb.textContent=fmtNum(me.r_coin||0)+' R-Coin';await renderPublicProfile();showToast('แลก R-Coin +100 สำเร็จ')}catch(e){alert(e.message)}
}
let collectionVaultCache=[];
async function openCollectionVault(){
  try{
    const j=await api('/api/me/collection');
    collectionVaultCache=j.items||[];
    showHelp('คลังสินค้าคอลเลคชั่น',`<div class="notice">ความจุ ${collectionVaultCache.length}/${j.capacity} รูป • มูลค่า ${Number(j.collection_value||0).toLocaleString('th-TH')} R</div><div class="collectionVaultGrid fivePerRow">${collectionVaultCache.map(x=>`<div class="vaultItem" onclick="openCollectionItemDetail(${x.id})"><img src="${escapeHtml(x.image_url)}"><b>${escapeHtml(x.title||'Collection')}</b><span>${Number(x.r_value||0).toLocaleString('th-TH')} R</span><div class="collectionVaultActions"><button onclick="event.stopPropagation();putCollectionToShowcase(${x.id})">โชว์ในตู้โชว์</button><button class="vaultDeleteBtn" onclick="event.stopPropagation();deleteCollectionItem(${x.id})">ลบรูป</button></div></div>`).join('')||'<div class="profileEmpty">ยังไม่มีรูปในคลังคอลเลคชั่น</div>'}</div>`);
  }catch(e){alert(e.message)}
}
function openCollectionItemDetail(id){
  const x=(collectionVaultCache||[]).find(v=>String(v.id)===String(id));
  if(!x)return;
  const price=x.price?`${Number(x.price||0).toLocaleString('th-TH')} ${escapeHtml(x.currency||'')}`:'-';
  const source=x.origin||x.source||'คอลเลคชั่น';
  showHelp('รายละเอียดรูปคอลเลคชั่น',`<div class="collectionDetailView"><img src="${escapeHtml(x.image_url)}"><div class="collectionDetailInfo"><h3>${escapeHtml(x.title||'Collection')}</h3><p><b>ราคา:</b> ${price}</p><p><b>ที่มา:</b> ${escapeHtml(source)}</p><p><b>มูลค่า R:</b> ${Number(x.r_value||0).toLocaleString('th-TH')} R</p><p><b>วันที่เพิ่ม:</b> ${x.created_at?new Date(x.created_at).toLocaleString('th-TH'):'-'}</p><div class="collectionVaultActions"><button onclick="putCollectionToShowcase(${x.id})">โชว์ในตู้โชว์</button><button class="vaultDeleteBtn" onclick="deleteCollectionItem(${x.id})">ลบรูปนี้</button></div></div></div>`);
}

async function deleteCollectionItem(id){
  if(!confirm('ต้องการลบรูปนี้ออกจากคลังคอลเลคชั่นใช่ไหม?'))return;
  try{
    await api('/api/me/collection/'+id,{method:'DELETE'});
    helpModal.classList.remove('show');
    await renderPublicProfile();
    showToast('ลบรูปคอลเลคชั่นแล้ว');
  }catch(e){alert(e.message)}
}
async function putCollectionToShowcase(id){
  const rank=Number(prompt('ใส่อันดับตู้โชว์ 1, 2 หรือ 3')||0);
  if(!rank)return;
  try{await api('/api/me/collection/'+id+'/showcase',{method:'POST',body:JSON.stringify({rank})});helpModal.classList.remove('show');await renderPublicProfile();}catch(e){alert(e.message)}
}
async function saveProfileShowcase(){
  try{
    const f=showcaseFile.files&&showcaseFile.files[0];
    if(!f)throw new Error('กรุณาเลือกรูปสินค้า');
    const image_url=await uploadAny(f);
    await api('/api/profiles/me/showcase',{method:'POST',body:JSON.stringify({rank:Number(showcaseRank.value),title:showcaseTitle.value,image_url})});
    await renderPublicProfile();showToast('อัปเดตตู้โชว์สินค้าแล้ว');
  }catch(e){alert(e.message)}
}
async function removeProfileShowcase(rank){
  if(!confirm('ลบสินค้าแนะนำอันดับนี้?'))return;
  await api('/api/profiles/me/showcase/'+rank,{method:'DELETE'});
  await renderPublicProfile();
}

async function renderPublicProfile(){
  if(!me)return;
  const target=profileTargetId||me.id;
  let j;
  try{j=await api('/api/profiles/'+encodeURIComponent(target));}catch(e){publicProfileBox.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>';return}
  const u=j.user;
  const owner=!!j.is_self;
  window.trustDetailProfile=u;
  const friends=(j.friends||[]).slice(0,8);
  const displayName=escapeHtml(u.display_name||u.username);
  const vipBadge=vipMiniBadge(u);
  if(window.profileLeftBox){
    profileLeftBox.innerHTML=`<div class="profileLeftCard"><div class="leftTop"><img src="${av(u)}"><h3>${displayName}</h3><div class="walletMini"><span>Coin <b>${fmtNum(u.coin||0)}</b></span><span>Credit <b>${fmtNum(u.credit||0)}</b></span></div></div><div class="leftMenu"><button onclick="openProfilePage(${u.id})">▣ โปรไฟล์</button><button onclick="show('profile')">👤 บัญชีผู้ใช้</button><button onclick="show('vip')">⭐ สมัคร VIP</button><button onclick="show('wallet')">💰 กระเป๋าเงิน</button><button onclick="show('orders')">🛡 คำสั่งซื้อของฉัน</button><button onclick="show('estimate')">🤖 ประเมินราคา</button><button onclick="show('favorites')">❤ รายการที่สนใจ</button><button onclick="show('sell')">📦 ลงทะเบียนสินค้า</button><button onclick="show('createAd')">📣 ลงโฆษณา</button><button onclick="show('createActivity')">🎯 สร้างกิจกรรม</button></div></div>`;
  }
  publicProfileBox.innerHTML=`<div class="profileHero v3"><div class="profileBanner" style="${profileBannerStyle(u)}">${owner?`<label class="bannerChange">📷 เปลี่ยนพื้นหลัง<input id="profileBannerFile" type="file" accept="image/*" style="display:none" onchange="changeProfileMedia('banner',this)"></label>`:''}</div><div class="profileInfo"><img class="profilePic" src="${av(u)}">${owner?`<label class="avatarChange">📷<input id="profileAvatarFile" type="file" accept="image/*" style="display:none" onchange="changeProfileMedia('avatar',this)"></label>`:''}<div class="profileText"><div class="profileName">${displayName} ${vipBadge}</div><div class="profileLine">ID : ${escapeHtml(u.public_user_id||u.id)} <button class="profileTrustBtn" onclick="showTrustDetails(window.trustDetailProfile)">Trust Score : <b>${Number(u.trust_rate??50)}</b></button></div>${owner?`<div class="profileSmall">รูป: ${canChangeText(u.profile_image_changed_at)} • พื้นหลัง: ${canChangeText(u.profile_banner_changed_at)}</div>`:''}</div><div class="profileActions">${!owner?`<button class="green" onclick="addFriend(${u.id})">${j.is_friend?'เป็นเพื่อนแล้ว':'เพิ่มเพื่อน'}</button><button onclick="openChatWithUser(${u.id})">ส่งข้อความ</button>`:''}</div></div></div>`;
  profileFriendsBox.innerHTML=`<div class="friendsPanel"><div class="panelHead"><h3>เพื่อน (${(j.friends||[]).length}/100)</h3><a href="#" onclick="return false">ทั้งหมด ›</a></div><input class="friendSearch" placeholder="ค้นหาเพื่อน">${friends.length?friends.map(f=>`<div class="friendRow" onclick="openChatWithUser(${f.id})"><img src="${av(f)}"><div><b>${escapeHtml(f.display_name||f.username)}</b><br><span class="muted">ออนไลน์</span></div><button class="chatTiny">💬</button></div>`).join(''):'<div class="profileEmpty">ยังไม่มีรายชื่อเพื่อน</div>'}</div>`;
  profileShowcaseBox.innerHTML=renderProfileShowcase(j.showcase||[],owner,j);
  profilePostBox.innerHTML=owner?`<h3>โพสต์</h3><div class="postComposer v3"><textarea id="profilePostText" placeholder="คุณกำลังคิดอะไรอยู่?"></textarea><div class="postTools"><input id="profilePostMedia" type="file" accept="image/*,video/*"><button class="green" onclick="createProfilePost()">โพสต์</button></div></div>`:`<h3>โพสต์</h3>`;
  profileFeedBox.innerHTML=(j.posts||[]).length?`<h3>โพสต์ล่าสุด</h3>`+(j.posts||[]).map(p=>`<div class="postCard"><div class="postHead"><img src="${av({display_name:p.user_name,avatar_url:p.user_avatar})}"><div><b>${escapeHtml(p.user_name||'ผู้ใช้')}</b><br><span class="muted">${new Date(p.created_at).toLocaleString('th-TH')}</span></div></div>${p.content?`<div>${escapeHtml(p.content)}</div>`:''}${p.media_url?(p.media_type==='video'?`<video class="postMedia" src="${escapeHtml(p.media_url)}" controls></video>`:`<img class="postMedia" src="${escapeHtml(p.media_url)}">`):''}</div>`).join(''):'<h3>โพสต์ล่าสุด</h3><div class="profileEmpty">ยังไม่มีโพสต์</div>';
  profileActivityBox.innerHTML=`<div class="activityPanel"><h3>กิจกรรมล่าสุด</h3>${(j.recent_activities||[]).length?(j.recent_activities||[]).map(a=>`<div class="activityItem"><b>${escapeHtml(a.type)}</b><br>${escapeHtml(a.title||'-')}<br><span class="muted">${a.amount?money(a.amount,a.currency||''):''} ${a.created_at?new Date(a.created_at).toLocaleString('th-TH'):''}</span></div>`).join(''):'<div class="profileEmpty">ยังไม่มีกิจกรรมล่าสุด</div>'}</div>`;
}
async function addFriend(id){try{await api('/api/profiles/'+id+'/friend',{method:'POST'});await renderPublicProfile();showToast('เพิ่มเพื่อนแล้ว')}catch(e){alert(e.message)}}
async function uploadAny(file){const fd=new FormData();fd.append('file',file);const r=await fetch('/api/upload',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw Error(j.error||'อัปโหลดไม่สำเร็จ');return j.url}
async function changeProfileMedia(type,input){try{const file=input.files&&input.files[0];if(!file)return;const url=await uploadAny(file);if(type==='banner'){const banner=document.querySelector('.profileBanner');if(banner)banner.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.12)),url('${cssUrl(url)}')`;}else{const avatar=document.querySelector('.profilePic');if(avatar)avatar.src=url;}me=(await api('/api/me/profile-media',{method:'PUT',body:JSON.stringify({type,url})})).user;applyProfileMediaRealtime(me);await renderPublicProfile();header();showToast(type==='banner'?'เปลี่ยนพื้นหลังโปรไฟล์แล้ว':'เปลี่ยนรูปโปรไฟล์แล้ว')}catch(e){alert(e.message);await renderPublicProfile()}finally{input.value=''}}
async function createProfilePost(){try{const content=(profilePostText.value||'').trim();let media_url='',media_type='';const f=profilePostMedia.files&&profilePostMedia.files[0];if(f){media_url=await uploadAny(f);media_type=f.type.startsWith('video')?'video':'image'}await api('/api/profiles/me/posts',{method:'POST',body:JSON.stringify({content,media_url,media_type})});profilePostText.value='';profilePostMedia.value='';await renderPublicProfile()}catch(e){alert(e.message)}}


async function loadReviews(){
  const q = encodeURIComponent(reviewSearch?.value || '');
  const j = await api('/api/reviews/users?q=' + q);
  reviewUsersBox.innerHTML = j.users.length ? `<table><tr><th>ID</th><th>ชื่อผู้ใช้</th><th>ซื้อ/ขาย</th><th>อัตราสำเร็จ</th><th>ดูข้อมูล</th></tr>${j.users.map(u=>`<tr><td>#${u.id}</td><td><button class="light" onclick="loadReviewDetail(${u.id})">${u.display_name||u.username}</button><br><span class="muted">@${u.username}</span></td><td>ซื้อ ${u.bought_count} / ขาย ${u.sold_count}</td><td>${u.trust_rate||0}%<br><span class="muted">สำเร็จ ${u.trust_completed_sales||0}/${u.trust_total_orders||0}</span></td><td><button onclick="loadReviewDetail(${u.id})">รายละเอียด</button></td></tr>`).join('')}</table>` : '<div class="notice">ไม่พบข้อมูลที่ตรงกัน</div>';
  reviewDetailBox.innerHTML = '';
}
async function loadReviewDetail(id){
  const j = await api('/api/reviews/users/' + id);
  const u = j.user;
  reviewDetailBox.innerHTML = `<div class="panel content" style="margin-top:18px"><h2>ข้อมูลรีวิว: ${u.display_name||u.username} (#${u.id})</h2><button class="green" onclick="openChatWithUser(${u.id})">💬 ติดต่อส่งข้อความ</button><div class="grid"><div class="card content"><h3>อัตราความสำเร็จ</h3><div class="price">${u.trust_rate||0}%</div><p class="muted">ซื้อขายสำเร็จ ${u.trust_completed_sales||0}/${u.trust_total_orders||0} รายการ</p></div><div class="card content"><h3>ประวัติ</h3><div>ซื้อ: <b>${j.summary.bought_count}</b></div><div>ขาย: <b>${j.summary.sold_count}</b></div><div>ทั้งหมด: <b>${j.summary.total_trades}</b></div></div></div><h3>รายการซื้อขาย/ประมูลที่ผ่านมา</h3>${j.history.length ? `<table><tr><th>สินค้า</th><th>รายละเอียด</th><th>ราคาปิด</th><th>ผู้ชนะ</th><th>สถานะ</th><th>เวลา</th></tr>${j.history.map(h=>`<tr><td><b>${h.item_title||'-'}</b><br><span class="muted">${h.level||''} / ${h.method||''}</span></td><td>${h.description||'-'}</td><td>${money(h.close_price,h.currency||'Credit')}</td><td>${h.winner_name||'-'}</td><td>${status(h.status)}</td><td>${h.created_at?new Date(h.created_at).toLocaleString('th-TH'):'-'}</td></tr>`).join('')}</table>` : '<div class="notice">ยังไม่มีประวัติซื้อขาย</div>'}</div>`;
}


function showAdmin(){if(!me){Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));login.classList.remove('hidden');title.textContent=pages.login;desc.textContent='BidMarket';refresh();return}if(me.role!='admin')return alert('เฉพาะผู้มีสิทธิ์จัดการระบบ');Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));admin.classList.remove('hidden');title.textContent=pages.admin;desc.textContent='BidMarket';loadAdmin()}
async function loadAdmin(){
  let e=await api('/api/admin/escrow');let pj=await api('/api/admin/payments');
  adminBox.innerHTML=`<div class="grid"><div class="card content"><h3>เงินที่ระบบพักไว้</h3><div class="price">${money(e.held,'Credit')}</div></div><div class="card content"><h3>รอจัดส่ง</h3><div class="price">${e.waitShipping}</div></div><div class="card content"><h3>ข้อพิพาท</h3><div class="price">${e.disputes}</div></div></div>
  <h3>ตรวจสอบสลิปเติม Credit</h3>${pj.payments.length?`<table><tr><th>ผู้ใช้</th><th>ยอด</th><th>Credit</th><th>สถานะ</th><th>สลิป</th><th>จัดการ</th></tr>${pj.payments.map(p=>`<tr><td>${p.user?.username||p.user_id}</td><td>${p.baht_amount||0} บาท</td><td>${p.credit_amount}</td><td>${payStatus(p.status)}</td><td>${p.slip_url?`<a href="${p.slip_url}" target="_blank">ดูสลิป</a>`:'-'}</td><td>${p.status==='approved'?'-':`<button class="green" onclick="adminApprovePay('${p.id}')">อนุมัติ</button><button class="danger" onclick="adminRejectPay('${p.id}')">ปฏิเสธ</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการเติม Credit</div>'}
  <h3>คิวรอตรวจสอบ</h3><div id="reviewQueueBox"></div><h3>จัดการรายการซื้อขาย V2</h3><div class="notice">V2 บันทึกเหตุการณ์ทุกขั้นตอน ป้องกันปล่อยเงิน/คืนเงินซ้ำ และแนบบันทึกเหตุผลการตัดสินของระบบ</div>
  ${e.orders.length?`<table><tr><th>ID</th><th>สินค้า</th><th>คู่ซื้อขาย</th><th>สถานะ</th><th>ยอด</th><th>รายละเอียด</th><th>ตัดสิน</th></tr>${e.orders.map(o=>`<tr><td>#${o.id}</td><td><b>${escapeHtml(o.item_title||'-')}</b></td><td>ผู้ซื้อ: ${escapeHtml(o.buyer?.username||'-')}<br>ผู้ขาย: ${escapeHtml(o.seller?.username||'-')}</td><td>${status(o.status)}</td><td>${money(o.amount,o.currency)}<br><span class="muted">ค่าบริการ ${money(o.service_fee||0,o.currency)}</span></td><td><button class="light" onclick="openAdminOrderDetail(${o.id})">รายละเอียด</button></td><td>${['COMPLETED','REFUNDED'].includes(o.status)?'-':`<input id="adn${o.id}" placeholder="บันทึกเหตุผลการตัดสิน"><button class="green" onclick="adminRel(${o.id})">ปล่อยเงินให้ผู้ขาย</button><button class="danger" onclick="adminRef(${o.id})">คืนเงินผู้ซื้อ</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการซื้อขาย</div>'}`;
  loadReviewQueueAdmin();
}
async function loadReviewQueueAdmin(){try{let q=await api('/api/admin/review-queue');reviewQueueBox.innerHTML=q.queue?.length?`<table><tr><th>ประเภท</th><th>ID</th><th>เหตุผล</th><th>สถานะ</th></tr>${q.queue.map(x=>`<tr><td>${x.target_type}</td><td>${x.target_id}</td><td>${escapeHtml(x.reason||'')}</td><td>${x.status}</td></tr>`).join('')}</table>`:'<div class="notice">ไม่มีรายการรอตรวจสอบ</div>'}catch(e){}}
function payStatus(s){return {pending_slip:'รอสลิป',waiting_admin:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธ'}[s]||s}
async function adminApprovePay(id){await api('/api/admin/payments/'+id+'/approve',{method:'POST',body:JSON.stringify({})});alert('อนุมัติแล้ว ระบบเพิ่ม Credit ให้ผู้ใช้แล้ว');loadAdmin()}
async function adminRejectPay(id){let note=prompt('เหตุผลที่ปฏิเสธ')||'';await api('/api/admin/payments/'+id+'/reject',{method:'POST',body:JSON.stringify({note})});loadAdmin()}

async function openAdminOrderDetail(id){
  try{
    const j=await api('/api/admin/orders/'+id+'/detail');
    const o=j.order||{};
    const d=o.dispute||{};
    const evidence=(d.evidence||[]);
    const evHtml=evidence.length?`<div class="adminOrderEvidenceGrid">${evidence.map(url=>String(url).match(/\.(png|jpe?g|webp|gif)$/i)?`<a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(url)}"></a>`:`<a class="button light" href="${escapeHtml(url)}" target="_blank">ดูไฟล์หลักฐาน</a>`).join('')}</div>`:'<div class="notice">ไม่มีรูป/ไฟล์หลักฐานแนบ</div>';
    const eventRows=(j.events||o.events||[]).map(e=>`<div class="muted">${e.created_at?new Date(e.created_at).toLocaleString('th-TH'):'-'} - ${escapeHtml(e.note||e.type||'-')}</div>`).join('')||'<div class="muted">ยังไม่มีประวัติ</div>';
    showHelp('รายละเอียดคำสั่งซื้อ',`<div class="adminOrderDetailBlock"><h3>${escapeHtml(o.item_title||'-')}</h3><p><b>สถานะ:</b> ${status(o.status)}</p><p><b>ยอด:</b> ${money(o.amount,o.currency||'Credit')}</p><p><b>ผู้ซื้อ:</b> ${escapeHtml(o.buyer?.display_name||o.buyer?.username||'-')} (#${escapeHtml(o.buyer_id||'-')})</p><p><b>ผู้ขาย:</b> ${escapeHtml(o.seller?.display_name||o.seller?.username||'-')} (#${escapeHtml(o.seller_id||'-')})</p></div><div class="adminOrderDetailBlock"><h3>ข้อมูลจัดส่ง</h3><p><b>บริษัท/วิธีส่ง:</b> ${escapeHtml(o.shipping_company||'-')}</p><p><b>เลขพัสดุ/หลักฐาน:</b> ${escapeHtml(o.tracking_number||'-')}</p><p><b>หมายเหตุ:</b> ${escapeHtml(o.delivery_note||'-')}</p></div><div class="adminOrderDetailBlock"><h3>ข้อพิพาท / หลักฐาน</h3><p><b>เหตุผล:</b> ${escapeHtml(d.reason||'-')}</p>${evHtml}</div><div class="adminOrderDetailBlock"><h3>ประวัติระบบ</h3>${eventRows}</div>`);
  }catch(e){alert(e.message)}
}
async function adminRel(id){await api('/api/admin/orders/'+id+'/release',{method:'POST',body:JSON.stringify({note:($('adn'+id)?.value||'')})});loadAdmin()}async function adminRef(id){await api('/api/admin/orders/'+id+'/refund',{method:'POST',body:JSON.stringify({note:($('adn'+id)?.value||'')})});loadAdmin()}



function adTypeChanged(){const t=adType.value;adVideoFields.classList.toggle('hidden',t!=='video');adQuestionFields.classList.toggle('hidden',t!=='question')}
function adRewardText(a){return `${Number(a.reward_amount||0).toLocaleString('th-TH')} ${a.reward_currency==='credit'?'Credit':'Coin'}`}
function adConditionText(a){return a.type==='video'?`ดูวิดีโอครบ ${a.view_seconds} วินาที`:'อ่านเนื้อหาและตอบคำถามให้ถูกต้อง'}
function adCard(a){return `<div class="adRewardCard ${a.status==='deleted'?'deletedAd':''}">${a.cover_url?`<img src="${escapeHtml(a.cover_url)}">`:''}<div class="content"><h3>${escapeHtml(a.title)}</h3><div class="adCoverMeta"><span class="rewardPill">🎁 ${adRewardText(a)}</span><span class="tag">${a.type==='video'?'วิดีโอ':'ตอบคำถาม'}</span>${a.viewer?.rewarded?'<span class="tag success">รับรางวัลแล้ว</span>':''}</div><p>${escapeHtml(a.description||'')}</p><div class="adLock"><b>วิธีรับรางวัล:</b> ${escapeHtml(adConditionText(a))}<br><b>รางวัล:</b> ${adRewardText(a)}<br><b>ผู้ลงโฆษณา:</b> ${escapeHtml(a.owner_name||'-')}</div><button class="green" onclick="openRewardAd(${a.id})">ดูโฆษณา</button></div></div>`}
async function loadAds(){const j=await api('/api/ads');adsGrid.innerHTML=j.ads.length?j.ads.map(adCard).join(''):'<div class="notice">ยังไม่มีโฆษณา</div>'}
async function loadMyAds(){if(!me)return;try{const j=await api('/api/ads/my');myAdsBox.innerHTML=j.ads.length?j.ads.slice(0,5).map(a=>`<div class="notice"><b>${escapeHtml(a.title)}</b><br>${a.status==='active'?'ใช้งานอยู่':'ถูกลบ'} • ผู้ชม ${a.stats.unique_viewers||0} • ตอบไม่ได้ ${a.stats.fail_rate||0}%</div>`).join(''):'<div class="notice">คุณยังไม่มีโฆษณา</div>'}catch(e){myAdsBox.innerHTML='<div class="notice error">กรุณาเข้าสู่ระบบ</div>'}}
async function createRewardAd(){if(!need())return;try{let fd=new FormData();fd.append('title',adTitle.value);fd.append('description',adDesc.value);fd.append('type',adType.value);fd.append('reward_currency',adRewardCurrency.value);fd.append('reward_amount',adRewardAmount.value);fd.append('view_seconds',adViewSeconds.value);fd.append('question',adQuestion.value);fd.append('answer',adAnswer.value);fd.append('cover_url',adCoverUrl.value);fd.append('media_url',adMediaUrl.value);fd.append('reward_code',adRewardCode?.value||'');fd.append('reward_code_trigger',adRewardCodeTrigger?.value||'none');fd.append('activity_link',adActivityLink?.value||'');if(adCover.files[0])fd.append('cover',adCover.files[0]);if(adMedia.files[0])fd.append('media',adMedia.files[0]);let r=await fetch('/api/ads',{method:'POST',body:fd});let j=await r.json();if(!r.ok)throw Error(j.error||'สร้างโฆษณาไม่สำเร็จ');createAdMsg.innerHTML='<div class="notice success">สร้างโฆษณาแล้ว</div>';loadMyAds();}catch(e){createAdMsg.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}}
let currentAd=null,adTimerId=null,adRemain=0,adLastStarted=0;
async function openRewardAd(id){if(!need())return;try{const j=await api('/api/ads/'+id);currentAd=j.ad;await api('/api/ads/'+id+'/start',{method:'POST',body:JSON.stringify({})});adViewerBox.classList.remove('hidden');adViewerBox.scrollIntoView({behavior:'smooth'});if(currentAd.type==='video')renderVideoAd(currentAd);else renderQuestionAd(currentAd)}catch(e){alert(e.message)}}
function renderVideoAd(a){clearInterval(adTimerId);adRemain=Number(a.view_seconds||10);adLastStarted=Date.now();adViewerBox.innerHTML=`<h2>${escapeHtml(a.title)}</h2><div class="adLock"><b>ล็อกเงื่อนไข:</b> ต้องดูวิดีโอครบ ${a.view_seconds} วินาที จึงจะกดรับรางวัลได้ ระบบจะพยายามไม่ให้หยุดวิดีโอหรือปิดเสียงระหว่างนับเวลา<br><b>รางวัล:</b> ${adRewardText(a)}</div><div class="adViewerBox"><video id="rewardVideo" src="${escapeHtml(a.media_url)}" autoplay playsinline controlslist="nodownload noplaybackrate" oncontextmenu="return false"></video></div><div class="adTimer" id="adTimer">เหลือ ${adRemain} วินาที</div><button id="claimVideoBtn" class="green" disabled onclick="claimVideoReward(${a.id})">รับรางวัล</button><button class="light" onclick="adViewerBox.classList.add('hidden')">ปิด</button>`;const v=document.getElementById('rewardVideo');v.controls=false;v.muted=false;const keep=()=>{if(v.paused)v.play().catch(()=>{});if(v.muted)v.muted=false;v.volume=1};v.addEventListener('pause',()=>{adRemain=Number(a.view_seconds||10);keep()});v.addEventListener('volumechange',()=>{if(v.muted||v.volume<1){v.muted=false;v.volume=1;adRemain=Number(a.view_seconds||10)}});v.play().catch(()=>{});adTimerId=setInterval(()=>{keep();adRemain--;adTimer.textContent=adRemain>0?`เหลือ ${adRemain} วินาที`:'ดูครบแล้ว กดรับรางวัลได้';if(adRemain<=0){clearInterval(adTimerId);claimVideoBtn.disabled=false}},1000)}
async function claimVideoReward(id){try{let j=await api('/api/ads/'+id+'/claim-video',{method:'POST',body:JSON.stringify({})});me=j.user;alert(j.already?'บัญชีนี้เคยรับรางวัลโฆษณานี้แล้ว':'รับรางวัลสำเร็จ');refresh();loadAds()}catch(e){alert(e.message)}}
function renderQuestionAd(a){clearInterval(adTimerId);adViewerBox.innerHTML=`<h2>${escapeHtml(a.title)}</h2><div class="adLock"><b>ล็อกเงื่อนไข:</b> อ่านเนื้อหาโฆษณาแล้วตอบคำถามให้ถูกต้องจึงจะรับรางวัลได้<br><b>รางวัล:</b> ${adRewardText(a)}<br><b>หมายเหตุ:</b> หากเวลา 23:30 พบว่ามีผู้ชมมากกว่า 30% ตอบไม่ได้ โฆษณานี้จะถูกลบอัตโนมัติ</div><div class="adReadBox">${escapeHtml(a.description||'')}</div><h3>คำถาม</h3><div class="notice">${escapeHtml(a.question||'-')}</div><input id="adAnswerInput" placeholder="พิมพ์คำตอบ"><button class="green" onclick="submitAdAnswer(${a.id})">ส่งคำตอบเพื่อรับรางวัล</button><button class="light" onclick="adViewerBox.classList.add('hidden')">ปิด</button><div id="adAnswerMsg"></div>`}
async function submitAdAnswer(id){try{let j=await api('/api/ads/'+id+'/answer',{method:'POST',body:JSON.stringify({answer:adAnswerInput.value})});me=j.user;adAnswerMsg.innerHTML='<div class="notice success">ตอบถูกต้องและรับรางวัลแล้ว</div>';refresh();loadAds()}catch(e){adAnswerMsg.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}}

async function topSearchUsers(){
  const q=(topUserSearch.value||'').trim();
  if(!q){topSearchPanel.classList.add('hidden');topSearchPanel.innerHTML='';return}
  const j=await api('/api/reviews/users?q='+encodeURIComponent(q));
  topSearchPanel.classList.remove('hidden');
  topSearchPanel.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b>ผลการค้นหา: ${escapeHtml(q)}</b><button class="light" onclick="topSearchPanel.classList.add('hidden')">ปิด</button></div>` +
  (j.users.length?j.users.map(u=>`<div class="searchUserCard"><div><b>${escapeHtml(u.display_name||u.username)}</b> <span class="muted">#${u.id} / @${escapeHtml(u.username)}</span><br><span class="muted">ซื้อ ${u.bought_count||0} / ขาย ${u.sold_count||0} • สำเร็จ ${u.success_rate||u.trust_rate||0}%</span><div id="topUserDetail_${u.id}" class="userDetailBox hidden"></div></div><div><button onclick="topShowUser(${u.id})">ตรวจสอบข้อมูล</button><button class="light" onclick="openProfilePage(${u.id})">โปรไฟล์</button><button class="green" onclick="openChatWithUser(${u.id})">ส่งข้อความ</button></div></div>`).join(''):'<div class="notice">ไม่พบชื่อบัญชีหรือ ID ที่ตรงกัน</div>');
}
async function topShowUser(id){
  const box=document.getElementById('topUserDetail_'+id);
  if(!box)return;
  if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
  const j=await api('/api/reviews/users/'+id);
  const u=j.user;
  box.classList.remove('hidden');
  box.innerHTML=`<b>ข้อมูลบัญชี</b><br>ชื่อ: ${escapeHtml(u.display_name||u.username)}<br>ID: #${u.id}<br>Username: @${escapeHtml(u.username)}<br>อัตราความสำเร็จ: ${u.trust_rate||j.summary.success_rate||0}%<br>ซื้อขายทั้งหมด: ${j.summary.total_trades||0} รายการ<br><button class="light" onclick="show('reviews');reviewSearch.value='${u.id}';loadReviewDetail(${u.id});topSearchPanel.classList.add('hidden')">ดูหน้ารีวิวเต็ม</button>`;
}
let currentChatUserId=null;
async function openChatWithUser(id){
  if(!me){show('login');return}
  currentChatUserId=id;
  const j=await api('/api/reviews/users/'+id);
  const u=j.user;
  chatWindow.classList.remove('hidden');
  document.querySelector('.chatHeader span').textContent='สนทนากับ '+(u.display_name||u.username)+' (#'+u.id+')';
  await loadFloatingConversation();
}
async function loadFloatingConversation(){
  if(!currentChatUserId){floatingChatMessages.innerHTML='<div class="chatBubble">ค้นหาผู้ใช้จากช่องค้นหาด้านบน แล้วกด “ส่งข้อความ” เพื่อเริ่มสนทนา</div>';return}
  const j=await api('/api/messages/'+currentChatUserId);
  floatingChatMessages.innerHTML=j.messages.length?j.messages.map(m=>`<div class="chatBubble ${m.from_id===me.id?'me':''}"><b>${m.from_id===me.id?'คุณ':escapeHtml(m.from_name||'ผู้ใช้')}:</b> ${escapeHtml(m.text)}<br><span class="muted">${new Date(m.created_at).toLocaleString('th-TH')}</span></div>`).join(''):'<div class="chatBubble">ยังไม่มีข้อความ เริ่มพิมพ์ข้อความได้เลย</div>';
  floatingChatMessages.scrollTop=floatingChatMessages.scrollHeight;
}

async 
function showRewardCode(code,link='',title='กิจกรรม'){
  rewardCodeBody.innerHTML=`<div class="notice success"><b>${escapeHtml(title)}</b><div class="price" style="font-size:22px;letter-spacing:1px">${escapeHtml(code)}</div></div><button class="green" onclick="navigator.clipboard?.writeText('${code}')">คัดลอกโค้ด</button>${link?`<button class="gold" onclick="location.href='${escapeHtml(link)}'">ไปหน้ากิจกรรม</button>`:''}`;
  rewardCodeModal.classList.add('show');
}
async function loadActivities(category=''){
  const j=await api('/api/activities'+(category?'?category='+category:''));
  activitiesBox.innerHTML=j.activities.length?j.activities.map(a=>`<div class="card content"><span class="tag vip">${a.category==='auction'?'ประมูล':a.category==='website'?'เว็บไซต์':'เติมเงินสะสม'}</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.description||'')}</p><div class="meta"><div>ผู้สร้าง: ${escapeHtml(a.creator_name||'-')}</div><div>สิ้นสุด: ${new Date(a.ends_at).toLocaleString('th-TH')}</div><div>ค่าธรรมเนียม: ${a.fee?.amount||0} ${a.fee?.currency||''}</div></div><button onclick="openActivity(${a.id})">ดูรายละเอียด</button><button class="light" onclick="reportActivity(${a.id})">รายงานกิจกรรม</button></div>`).join(''):'<div class="notice">ยังไม่มีกิจกรรม</div>';
}
async function openActivity(id){
  const j=await api('/api/activities/'+id),a=j.activity;
  let topup='';
  if(a.category==='topup')topup=`<h3>ยอดเติม Credit สะสมของคุณ: ${j.topup.lifetime_credit_topup||0} Credit</h3><table><tr><th>จำนวน Credit</th><th>รางวัล</th><th>สิทธิ์</th></tr>${(j.topup.tiers||[]).map(t=>{let claimed=(j.topup.claimed||[]).some(c=>c.tier_credit==t.credit), ok=(j.topup.lifetime_credit_topup||0)>=t.credit;return `<tr><td>${t.credit.toLocaleString()} Credit</td><td>${escapeHtml(t.reward)}</td><td>${claimed?'รับแล้ว':ok?`<button class="green" onclick="claimTopup(${a.id},${t.credit})">ได้รับสิทธิ์</button>`:'ไม่ได้รับสิทธิ์'}</td></tr>`}).join('')}</table>`;
  activityDetailBox.classList.remove('hidden');activityDetailBox.innerHTML=`<h2>${escapeHtml(a.title)}</h2><div class="meta"><div>ผู้สร้าง: ${escapeHtml(a.creator_name||'-')}</div><div>เงื่อนไข: ${escapeHtml(a.condition||'-')}</div><div>จำนวนผู้เข้าร่วม: ${escapeHtml(a.participants_limit||'ไม่จำกัด')}</div><div>ค่าธรรมเนียมผู้สร้าง: ${a.fee?.amount||0} ${a.fee?.currency||''}</div></div><p>${escapeHtml(a.description||'')}</p>${topup}<h3>กรอกโค้ดกิจกรรม</h3><input id="redeemCode_${a.id}" placeholder="กรอกโค้ด A-Z a-z 0-9"><button class="green" onclick="redeemActivity(${a.id})">รับรางวัล</button>`;activityDetailBox.scrollIntoView({behavior:'smooth'});
}
async function createActivity(){if(!need())return;try{let j=await api('/api/activities',{method:'POST',body:JSON.stringify({title:actTitle.value,description:actDesc.value,condition:actCondition.value,category:actCategory.value,days:+actDays.value,participants_limit:actLimit.value,fee_currency:actFeeCurrency.value,reward_enabled:true,reward_trigger:actRewardTrigger.value,auction_id:actAuctionId.value,reward_code:actRewardCode.value,reward_code_limit:+actRewardLimit.value,random_code_count:+actRandomCount.value,activity_link:actLink.value})});createActivityMsg.innerHTML='<div class="notice success">สร้างกิจกรรมแล้ว '+(j.codes?.length?`<br>โค้ดที่สุ่ม: ${j.codes.map(escapeHtml).join(', ')}`:'')+'</div>'}catch(e){createActivityMsg.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}}
async function redeemActivity(id){try{let code=$('redeemCode_'+id).value;await api('/api/activities/'+id+'/redeem',{method:'POST',body:JSON.stringify({code})});alert('รับรางวัลกิจกรรมสำเร็จ');openActivity(id)}catch(e){alert(e.message)}}
async function claimTopup(id,credit){try{let j=await api('/api/activities/'+id+'/claim-topup-tier',{method:'POST',body:JSON.stringify({credit})});me=j.user;alert('รับสิทธิ์สำเร็จ');openActivity(id);refresh()}catch(e){alert(e.message)}}
async function reportActivity(id){if(!need())return;let reason=prompt('เหตุผลที่รายงานกิจกรรมนี้')||'';if(!reason)return;await api('/api/activities/'+id+'/report',{method:'POST',body:JSON.stringify({reason})});alert('ส่งรายงานให้ระบบตรวจสอบแล้ว')}

async function toggleFloatingChat(){
  if(!me){show('login');return}
  chatWindow.classList.toggle('hidden');
  if(!chatWindow.classList.contains('hidden')) await loadFloatingConversation();
}
async function sendFloatingChat(){
  if(!me){show('login');return}
  if(!currentChatUserId)return alert('กรุณาค้นหาและเลือกผู้ใช้ที่ต้องการส่งข้อความก่อน');
  const text=(floatingChatInput.value||'').trim();
  if(!text)return;
  await api('/api/messages/'+currentChatUserId,{method:'POST',body:JSON.stringify({text})});
  floatingChatInput.value='';
  await loadFloatingConversation();
}
function escapeHtml(t){return String(t).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

setInterval(()=>{if(selected&&!room.classList.contains('hidden')&&currentAuctionCache){const el=document.getElementById('roomTimer');if(el&&currentAuctionCache.end_at)el.textContent=tleft(Math.max(0,currentAuctionCache.end_at-Date.now()))}},1000);adTypeChanged();show('home');


async function renderCollectionPage(){
  if(!need())return;
  try{
    const [j,rank]=await Promise.all([api('/api/collection-auctions'),api('/api/collection-rankings')]);
    const auctions=(j.auctions||[]);
    const rows=(rank.rankings||[]).slice(0,100);
    collectionBox.innerHTML=`<div class="collectionPageLayout"><section class="collectionAuctionPanel"><div class="notice">ประมูลคอลเลคชั่นใช้ R-Coin เท่านั้น เข้าร่วมได้เฉพาะ VIP ระดับ Silver ขึ้นไป และไม่มีค่าธรรมเนียม</div><div class="grid collectionAuctionGrid">${auctions.map(a=>`<div class="card content"><img src="${escapeHtml(a.image_url)}" style="width:100%;height:180px;object-fit:cover;border-radius:16px"><h3>${escapeHtml(a.title)}</h3><div>ราคาปัจจุบัน: <b>${Number(a.current_bid||0).toLocaleString('th-TH')} R-Coin</b></div><div class="muted">ผู้ลง: ${escapeHtml(a.seller_name||'-')}</div><input id="caBid${a.id}" type="number" step="100" placeholder="เสนอ R-Coin"><button class="green" onclick="bidCollectionAuction(${a.id})">เสนอราคา</button></div>`).join('')||'<div class="notice">ยังไม่มีประมูลคอลเลคชั่น</div>'}</div></section><aside class="collectionRankPanel"><h3>อันดับคะแนน R</h3><div class="collectionRankList">${rows.map(r=>`<div class="collectionRankRow"><span class="rankNo">${r.rank}</span><img class="rankAvatar" src="${escapeHtml(r.avatar_url||av(r))}"><span class="rankName">${escapeHtml(r.display_name||r.username||'User')}</span><b class="rankScore">${fmtNum(r.collection_value||0)} R ${crownHtml(r.rank)}</b><button class="light showCaseBtn" onclick="openProfilePage(${Number(r.id)})">ตู้โชว์</button></div>`).join('')||'<div class="notice">ยังไม่มีอันดับคะแนน R</div>'}</div></aside></div>`;
  }catch(e){collectionBox.innerHTML='<div class="notice error">'+escapeHtml(e.message)+'</div>'}
}
async function bidCollectionAuction(id){
  try{const amount=Number(document.getElementById('caBid'+id).value||0);await api('/api/collection-auctions/'+id+'/bid',{method:'POST',body:JSON.stringify({amount})});renderCollectionPage();refresh();}catch(e){alert(e.message)}
}


/* ============================================================
   BidMarket System Management Dashboard UI
   จัดการผู้ใช้ / ประมูล / ธุรกรรม / Log
============================================================ */
let adminTab='overview';
function adminTabs(active='overview'){
  adminTab=active;
  return `<div class="adminTabs">
    ${['overview','users','auctions','transactions','logs','escrow'].map(t=>`<button class="${active===t?'gold':'light'}" onclick="loadAdmin('${t}')">${{overview:'ภาพรวม',users:'ผู้ใช้',auctions:'ประมูล',transactions:'ธุรกรรม',logs:'Log',escrow:'ระบบซื้อขายปลอดภัย'}[t]}</button>`).join('')}
  </div>`;
}
function adminStatusBadge(v){return `<span class="tag ${v==='active'||v==='approved'?'success':(v==='suspended'||v==='cancelled'||v==='deleted'||v==='rejected'?'danger':'')}">${escapeHtml(String(v||'-'))}</span>`}
async function loadAdmin(tab=adminTab||'overview'){
  if(!me||me.role!=='admin')return alert('เฉพาะผู้มีสิทธิ์จัดการระบบ');
  adminTab=tab;
  try{
    if(tab==='overview')return loadAdminOverview();
    if(tab==='users')return loadAdminUsers();
    if(tab==='auctions')return loadAdminAuctions();
    if(tab==='transactions')return loadAdminTransactions();
    if(tab==='logs')return loadAdminLogs();
    if(tab==='escrow')return loadAdminEscrow();
  }catch(e){adminBox.innerHTML=adminTabs(tab)+`<div class="notice error">${escapeHtml(e.message)}</div>`}
}
async function loadAdminOverview(){
  const j=await api('/api/admin/dashboard'); const c=j.counts||{};
  adminBox.innerHTML=adminTabs('overview')+`<div class="grid adminStatGrid">
    <div class="card content"><h3>ผู้ใช้ทั้งหมด</h3><div class="price">${c.users||0}</div><p class="muted">ระงับ ${(c.suspended_users||0).toLocaleString('th-TH')}</p></div>
    <div class="card content"><h3>ประมูลที่เปิดอยู่</h3><div class="price">${c.active_auctions||0}</div><p class="muted">ทั้งหมด ${(c.auctions||0).toLocaleString('th-TH')}</p></div>
    <div class="card content"><h3>ธุรกรรม</h3><div class="price">${c.transactions||0}</div></div>
    <div class="card content"><h3>ข้อพิพาท</h3><div class="price">${c.disputes||0}</div></div>
  </div>
  <div class="grid"><div class="card content"><h3>ผู้ใช้ล่าสุด</h3>${(j.recent?.users||[]).map(u=>`<div class="adminLine"><b>${escapeHtml(u.display_name||u.username)}</b><span>${adminStatusBadge(u.status)} ${escapeHtml(u.role)}</span></div>`).join('')||'<div class="notice">ไม่มีข้อมูล</div>'}</div>
  <div class="card content"><h3>ประมูลล่าสุด</h3>${(j.recent?.auctions||[]).map(a=>`<div class="adminLine"><b>${escapeHtml(a.title||'-')}</b><span>${money(a.current_bid||a.start_price||0,a.currency||'Credit')} ${adminStatusBadge(a.status)}</span></div>`).join('')||'<div class="notice">ไม่มีข้อมูล</div>'}</div></div>`;
}
async function loadAdminUsers(){
  const q=adminUserSearch?.value||''; const j=await api('/api/admin/users/full?q='+encodeURIComponent(q));
  adminBox.innerHTML=adminTabs('users')+`<div class="adminToolbar"><input id="adminUserSearch" placeholder="ค้นหา ID / ชื่อ / อีเมล" value="${escapeHtml(q)}"><button onclick="loadAdminUsers()">ค้นหา</button></div>
  <table class="adminTable"><tr><th>ID</th><th>ชื่อ</th><th>Wallet</th><th>VIP</th><th>สถานะ</th><th>จัดการ</th></tr>${j.users.map(u=>`<tr><td>#${u.id}</td><td><b>${escapeHtml(u.display_name||u.username)}</b><br><span class="muted">${escapeHtml(u.email||'')} • ${escapeHtml(u.role||'user')}</span></td><td>${money(u.credit,'Credit')}<br>${money(u.coin,'Coin')}</td><td>${escapeHtml(u.vip_level||'Member')}<br><span class="muted">${Number(u.vip_points||0).toLocaleString('th-TH')} pts</span></td><td>${adminStatusBadge(u.status)}</td><td><button class="light" onclick="adminSetUserStatus(${u.id},'${u.status==='suspended'?'active':'suspended'}')">${u.status==='suspended'?'ปลดระงับ':'ระงับ'}</button><button class="light" onclick="adminSetUserRole(${u.id},'${u.role==='admin'?'user':'admin'}')">${u.role==='admin'?'ลดเป็น User':'ตั้งสิทธิ์จัดการระบบ'}</button><button class="green" onclick="adminAdjustWallet(${u.id})">ปรับยอด</button><button class="gold" onclick="adminAdjustVip(${u.id})">ปรับ VIP</button></td></tr>`).join('')}</table>`;
}
async function adminSetUserStatus(id,status){if(!confirm('ยืนยันเปลี่ยนสถานะผู้ใช้?'))return;await api('/api/admin/users/'+id+'/status',{method:'POST',body:JSON.stringify({status})});loadAdminUsers()}
async function adminSetUserRole(id,role){if(!confirm('ยืนยันเปลี่ยน Role?'))return;await api('/api/admin/users/'+id+'/role',{method:'POST',body:JSON.stringify({role})});loadAdminUsers()}
async function adminAdjustWallet(id){const currency=prompt('coin / credit / token','credit')||'credit';const amount=Number(prompt('จำนวน + เพิ่ม / - ลด','0')||0);if(!amount)return;const note=prompt('หมายเหตุ','ระบบปรับยอด')||'ระบบปรับยอด';await api('/api/admin/users/'+id+'/wallet',{method:'POST',body:JSON.stringify({currency,amount,note})});loadAdminUsers()}
async function adminAdjustVip(id){const vip_points=Number(prompt('VIP Points ใหม่','0')||0);const vip_days=Number(prompt('ต่ออายุ VIP อีกกี่วัน? ใส่ 0 หากไม่ต่อ','0')||0);await api('/api/admin/users/'+id+'/vip',{method:'POST',body:JSON.stringify({vip_points,vip_days})});loadAdminUsers()}
async function loadAdminAuctions(){
  const j=await api('/api/admin/auctions/full');
  adminBox.innerHTML=adminTabs('auctions')+`<table class="adminTable"><tr><th>ID</th><th>สินค้า</th><th>ผู้ขาย</th><th>ราคา</th><th>เวลา</th><th>สถานะ</th><th>จัดการ</th></tr>${j.auctions.map(a=>`<tr><td>#${a.id}</td><td><b>${escapeHtml(a.title||'-')}</b><br><span class="muted">${escapeHtml(a.level||'')} / ${escapeHtml(a.method||'')}</span></td><td>${escapeHtml(a.seller_name||'-')}</td><td>${money(a.current_bid||a.start_price||0,a.currency||'Credit')}<br><span class="muted">ผู้ชนะ ${escapeHtml(a.winner_name||'-')}</span></td><td>${a.end_at?new Date(a.end_at).toLocaleString('th-TH'):'-'}</td><td>${adminStatusBadge(a.status)}</td><td><button class="green" onclick="adminSetAuction(${a.id},'close')">ปิด/ตัดสิน</button><button class="light" onclick="adminSetAuction(${a.id},'active')">เปิด</button><button class="danger" onclick="adminSetAuction(${a.id},'cancelled')">ยกเลิก</button><button class="danger" onclick="adminSetAuction(${a.id},'deleted')">ลบ</button></td></tr>`).join('')}</table>`;
}
async function adminSetAuction(id,action){if(!confirm('ยืนยันจัดการประมูลนี้?'))return;await api('/api/admin/auctions/'+id+'/status',{method:'POST',body:JSON.stringify({action})});loadAdminAuctions()}
async function loadAdminTransactions(){
  const q=adminTxSearch?.value||''; const j=await api('/api/admin/transactions/full?q='+encodeURIComponent(q));
  adminBox.innerHTML=adminTabs('transactions')+`<div class="adminToolbar"><input id="adminTxSearch" placeholder="ค้นหาธุรกรรม" value="${escapeHtml(q)}"><button onclick="loadAdminTransactions()">ค้นหา</button></div><table class="adminTable"><tr><th>เวลา</th><th>ผู้ใช้</th><th>ประเภท</th><th>จำนวน</th><th>หมายเหตุ</th></tr>${j.transactions.map(t=>`<tr><td>${t.created_at?new Date(t.created_at).toLocaleString('th-TH'):'-'}</td><td>#${t.user_id}<br><span class="muted">${escapeHtml(t.user?.username||'')}</span></td><td>${escapeHtml(t.type||'-')}</td><td>${Number(t.amount||0).toLocaleString('th-TH')} ${escapeHtml(t.currency||'')}</td><td>${escapeHtml(t.note||'')}</td></tr>`).join('')}</table>`;
}
async function loadAdminLogs(){
  const q=adminLogSearch?.value||''; const j=await api('/api/admin/logs/full?q='+encodeURIComponent(q));
  adminBox.innerHTML=adminTabs('logs')+`<div class="adminToolbar"><input id="adminLogSearch" placeholder="ค้นหา Log" value="${escapeHtml(q)}"><button onclick="loadAdminLogs()">ค้นหา</button></div><table class="adminTable"><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>Action</th><th>Target</th><th>Details</th></tr>${j.audit_logs.map(l=>`<tr><td>${l.created_at?new Date(l.created_at).toLocaleString('th-TH'):'-'}</td><td>${escapeHtml(l.actor_name||String(l.actor_id||'-'))}</td><td>${escapeHtml(l.action||'-')}</td><td>${escapeHtml(l.target_type||'-')} #${escapeHtml(String(l.target_id||''))}</td><td><pre class="adminPre">${escapeHtml(JSON.stringify(l.details||{},null,2))}</pre></td></tr>`).join('')}</table>`;
}
async function loadAdminEscrow(){
  let e=await api('/api/admin/escrow');let pj=await api('/api/admin/payments');
  adminBox.innerHTML=adminTabs('escrow')+`<div class="grid"><div class="card content"><h3>เงินที่ระบบพักไว้</h3><div class="price">${money(e.held,'Credit')}</div></div><div class="card content"><h3>รอจัดส่ง</h3><div class="price">${e.waitShipping}</div></div><div class="card content"><h3>ข้อพิพาท</h3><div class="price">${e.disputes}</div></div></div>
  <h3>ตรวจสอบสลิปเติม Credit</h3>${pj.payments.length?`<table><tr><th>ผู้ใช้</th><th>ยอด</th><th>Credit</th><th>สถานะ</th><th>สลิป</th><th>จัดการ</th></tr>${pj.payments.map(p=>`<tr><td>${escapeHtml(p.user?.username||String(p.user_id))}</td><td>${p.baht_amount||0} บาท</td><td>${p.credit_amount}</td><td>${payStatus(p.status)}</td><td>${p.slip_url?`<a href="${p.slip_url}" target="_blank">ดูสลิป</a>`:'-'}</td><td>${p.status==='approved'?'-':`<button class="green" onclick="adminApprovePay('${p.id}')">อนุมัติ</button><button class="danger" onclick="adminRejectPay('${p.id}')">ปฏิเสธ</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการเติม Credit</div>'}
  <h3>รายการซื้อขาย</h3>${e.orders.length?`<table><tr><th>ID</th><th>สินค้า</th><th>คู่ซื้อขาย</th><th>สถานะ</th><th>ยอด</th><th>รายละเอียด</th><th>ตัดสิน</th></tr>${e.orders.map(o=>`<tr><td>#${o.id}</td><td><b>${escapeHtml(o.item_title||'-')}</b></td><td>ผู้ซื้อ: ${escapeHtml(o.buyer?.username||'-')}<br>ผู้ขาย: ${escapeHtml(o.seller?.username||'-')}</td><td>${status(o.status)}</td><td>${money(o.amount,o.currency)}</td><td><button class="light" onclick="openAdminOrderDetail(${o.id})">รายละเอียด</button></td><td>${['COMPLETED','REFUNDED'].includes(o.status)?'-':`<input id="adn${o.id}" placeholder="บันทึกเหตุผล"><button class="green" onclick="adminRel(${o.id})">ปล่อยเงิน</button><button class="danger" onclick="adminRef(${o.id})">คืนเงิน</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการซื้อขาย</div>'}`;
}


/* Dashboard layout redo: keep left wallet values synchronized after header refresh. */
(function(){
  const previousHeader = typeof header === 'function' ? header : null;
  window.header = function(){
    if(previousHeader) previousHeader();
    try{
      const coin=document.getElementById('sideCoin');
      const credit=document.getElementById('sideCredit');
      if(coin) coin.textContent=Number(me?.coin||0).toLocaleString('th-TH');
      if(credit) credit.textContent=Number(me?.credit||0).toLocaleString('th-TH');
    }catch(e){}
  };
})();


(function(){
  function pageGroup(id){
    if(['home','vipzone','market','activities','rules'].includes(id))return 'auction';
    if(['profile','collection'].includes(id))return 'account';
    if(id==='publicProfile')return 'profile';
    return 'none';
  }
  function subTabsFor(id){
    const sub=document.querySelector('.dashboardSubTabs');
    if(!sub)return;
    const group=pageGroup(id);
    if(group==='auction'){
      sub.innerHTML=`<button data-page="home" onclick="show('home')">ทั่วไป</button><button data-page="vipzone" onclick="showVip()">Vip</button><button data-page="market" onclick="show('market')">ซื้อ/ขาย</button><button data-page="activities" onclick="show('activities')">กิจกรรม</button><button data-page="rules" onclick="show('rules')">คำอธิบาย</button>`;
    }else if(group==='account'){
      sub.innerHTML=`<button data-page="profile" onclick="show('profile')">บัญชีผู้ใช้</button><button data-page="collection" onclick="show('collection')">คอลเลคชั่น</button>`;
    }else{
      sub.innerHTML='';
    }
    sub.querySelectorAll('button').forEach(b=>b.classList.toggle('isActive',b.dataset.page===id));
  }
  window.applyDashboardNav=function(id){
    id=id||'home';
    const group=pageGroup(id);
    document.body.dataset.page=id;
    document.body.dataset.navGroup=group;
    subTabsFor(id);
    const top=document.querySelector('.dashboardTopTabs');
    if(top){
      top.querySelectorAll('button').forEach(b=>b.classList.remove('isActive','active'));
      const btn = group==='auction' ? top.children[0] : group==='profile' ? top.children[1] : group==='account' ? top.children[2] : null;
      if(btn)btn.classList.add('isActive');
    }
  };
  const oldShow=window.show;
  if(typeof oldShow==='function'){
    window.show=function(id){
      oldShow(id);
      setTimeout(()=>window.applyDashboardNav(id),0);
    };
  }
  const oldOpenProfile=window.openProfilePage;
  if(typeof oldOpenProfile==='function'){
    window.openProfilePage=function(id){
      oldOpenProfile(id);
      setTimeout(()=>window.applyDashboardNav('publicProfile'),0);
    };
  }
  const oldShowAdmin=window.showAdmin;
  if(typeof oldShowAdmin==='function'){
    window.showAdmin=function(){
      oldShowAdmin();
      setTimeout(()=>window.applyDashboardNav('admin'),0);
    };
  }
  setTimeout(()=>{
    const visible=[...document.querySelectorAll('main section')].find(s=>!s.classList.contains('hidden'));
    window.applyDashboardNav(visible?visible.id:'home');
  },0);
})();

/* ============================================================
   REAL FIX 2026-06-18: sidebar wallet sync + theme toggle reliability
   - Coin/Credit in left sidebar always follows the real logged-in user object.
   - Falls back to the account card values already rendered on screen when needed.
   - Re-applies theme classes reliably after toggling.
============================================================ */
(function(){
  function parseThaiNumberText(v){
    const n=Number(String(v||'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }
  function valueFromAccountStat(label){
    try{
      const blocks=[...document.querySelectorAll('.accountHeroStats div,.accountHeroStats button')];
      for(const el of blocks){
        const b=(el.querySelector('b')?.textContent||'').trim().toLowerCase();
        if(b===label.toLowerCase()) return parseThaiNumberText(el.querySelector('span')?.textContent||'0');
      }
    }catch(e){}
    return null;
  }
  function setText(id,val){
    const el=document.getElementById(id);
    if(el) el.textContent=Number(val||0).toLocaleString('th-TH');
  }
  window.syncSidebarWalletReal=function(){
    try{
      let coin=0, credit=0;
      if(typeof me!=='undefined' && me){
        coin=Number(me.coin||0);
        credit=Number(me.credit||0);
      }
      const profileCoin=valueFromAccountStat('Coin');
      const profileCredit=valueFromAccountStat('Credit');
      if(profileCoin!==null && (coin===0 || !Number.isFinite(coin))) coin=profileCoin;
      if(profileCredit!==null && (credit===0 || !Number.isFinite(credit))) credit=profileCredit;
      setText('sideCoin',coin);
      setText('sideCredit',credit);
      const mobileCredit=document.getElementById('mobileMenuCredit');
      if(mobileCredit) mobileCredit.textContent='Credit: '+Number(credit||0).toLocaleString('th-TH');
    }catch(e){}
  };
  const oldHeader=typeof header==='function'?header:null;
  if(oldHeader){
    header=function(){
      oldHeader.apply(this,arguments);
      setTimeout(window.syncSidebarWalletReal,0);
      setTimeout(window.syncSidebarWalletReal,150);
    };
  }
  const oldRefresh=typeof refresh==='function'?refresh:null;
  if(oldRefresh){
    refresh=async function(){
      const out=await oldRefresh.apply(this,arguments);
      setTimeout(window.syncSidebarWalletReal,0);
      setTimeout(window.syncSidebarWalletReal,250);
      return out;
    };
  }
  const oldRenderProfile=typeof renderProfile==='function'?renderProfile:null;
  if(oldRenderProfile){
    renderProfile=function(){
      oldRenderProfile.apply(this,arguments);
      setTimeout(window.syncSidebarWalletReal,0);
      setTimeout(window.syncSidebarWalletReal,250);
    };
  }
  const oldApplyTheme=typeof applyTheme==='function'?applyTheme:null;
  if(oldApplyTheme){
    applyTheme=function(mode=getTheme()){
      oldApplyTheme(mode);
      const dark=mode!=='light';
      document.documentElement.classList.toggle('theme-light',!dark);
      document.documentElement.classList.toggle('theme-dark',dark);
      document.documentElement.dataset.theme=dark?'dark':'light';
      document.body.dataset.theme=dark?'dark':'light';
    };
  }
  document.addEventListener('click',function(ev){
    const btn=ev.target&&ev.target.closest&&ev.target.closest('#topThemeBtn');
    if(btn) setTimeout(()=>{ try{ applyTheme(getTheme()); }catch(e){} },30);
  },true);
  setInterval(window.syncSidebarWalletReal,700);
  setTimeout(()=>{ try{ applyTheme(getTheme()); }catch(e){} window.syncSidebarWalletReal(); },0);
})();

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

