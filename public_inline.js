let me=null,favs=[],selected=null,lastPage='home',currentAuctionCache=null,realtimeJoinedAuction=null;
function openMobileMenu(){const m=document.getElementById('mobileMenuOverlay');if(m)m.classList.add('open')}
function closeMobileMenu(){const m=document.getElementById('mobileMenuOverlay');if(m)m.classList.remove('open')}
let mobileSwipeStartX=null,mobileSwipeStartY=null;
document.addEventListener('touchstart',e=>{const t=e.touches&&e.touches[0];if(!t)return;mobileSwipeStartX=t.clientX;mobileSwipeStartY=t.clientY},{passive:true});
document.addEventListener('touchend',e=>{if(mobileSwipeStartX===null)return;const t=e.changedTouches&&e.changedTouches[0];if(!t)return;const dx=t.clientX-mobileSwipeStartX,dy=Math.abs(t.clientY-mobileSwipeStartY);const overlay=document.getElementById('mobileMenuOverlay');const isOpen=overlay&&overlay.classList.contains('open');if(dy<70&&dx>80&&mobileSwipeStartX<36&&!isOpen)openMobileMenu();if(dy<70&&dx<-80&&isOpen)closeMobileMenu();mobileSwipeStartX=null;mobileSwipeStartY=null},{passive:true});
function mobileGo(page){closeMobileMenu();show(page)}
function mobileVip(){closeMobileMenu();showVip()}
function mobileAdmin(){closeMobileMenu();showAdmin()}

const socket = io();
const VIP_LEVEL_ORDER=['Member','Silver','Gold','Sapphire','Platinum','Diamond','Emerald','Elite'];
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
socket.on('wallet:update',(payload)=>{if(payload?.user){const oldLevel=me?.vip_level||'Member';me=payload.user;header();renderWallet();showToast('ยอดเงินอัปเดตแล้ว');if(vipRank(me.vip_level)>vipRank(oldLevel)){playSound('vip');showToast('🎉 VIP เลื่อนระดับเป็น '+me.vip_level);}}});
socket.on('order:update',(order)=>{playSound('escrow');showToast('สถานะ Escrow อัปเดตแล้ว'); if(!orders.classList.contains('hidden')) loadOrders('all'); if(me&&me.role==='admin'&&!admin.classList.contains('hidden')) loadAdmin();});
socket.on('escrow:update',(order)=>{playSound('escrow');showToast('สถานะ Escrow อัปเดตแล้ว'); if(!orders.classList.contains('hidden')) loadOrders('all');});
socket.on('chat:message',(msg)=>{if(!me||msg.from_id!==me.id)playSound('chat');if(currentChatUserId&&(msg.from_id===currentChatUserId||msg.to_id===currentChatUserId))loadFloatingConversation();else showToast('มีข้อความใหม่');});
socket.on('notification:new',(n)=>{if(n?.meta?.sound==='vip_level_up'||n?.meta?.type==='vip_level_up')playSound('vip');showToast(n.title||'มีแจ้งเตือนใหม่')});
socket.on('admin:notification',(n)=>{if(me&&me.role==='admin'){showToast(n.title||'Admin notification'); if(!admin.classList.contains('hidden'))loadAdmin();}});
function joinRealtimeRooms(){if(me&&socket.connected)socket.emit('user:join',{userId:me.id,role:me.role});if(selected&&socket.connected)socket.emit('auction:join',selected)}
function refreshAuctionLists(){if(!home.classList.contains('hidden'))loadAuctions('general');if(!vipzone.classList.contains('hidden'))loadAuctions('vip');if(!favorites.classList.contains('hidden'))loadFavs();}
function handleRealtimeAuction(auction,eventType){
  if(!auction)return;
  const prev=currentAuctionCache;
  const wasMine=!!(me&&prev&&prev.id===auction.id&&Number(prev.winner_id)===Number(me.id));
  const nowMine=!!(me&&Number(auction.winner_id)===Number(me.id));
  const priceUp=prev&&prev.id===auction.id&&Number(auction.current_bid||0)>Number(prev.current_bid||0);
  if(eventType==='bid'&&wasMine&&!nowMine&&priceUp){playSound('outbid');showToast('⚠️ มีคนเสนอราคาสูงกว่าคุณแล้ว: '+money(auction.current_bid,auction.currency));}
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
const pages={home:'หน้าหลัก',vipzone:'VIP Zone',sell:'ลงสินค้า',estimate:'ประเมิณราคา',wallet:'กระเป๋าเงิน',orders:'คำสั่งซื้อ / Escrow',favorites:'รายการที่สนใจ',publicProfile:'โปรไฟล์',profile:'บัญชีผู้ใช้',vip:'สมัคร VIP',ads:'ดูโฆษณา',createAd:'ลงโฆษณา',activities:'กิจกรรม',createActivity:'สร้างกิจกรรม',chat:'สนทนา',reviews:'รีวิว',admin:'Admin',room:'หน้าประมูล',login:'เข้าสู่ระบบ',register:'สมัครสมาชิก',rules:'กฏ/เงื่อนไข'};function $(id){return document.getElementById(id)}function money(n,c){return Number(n||0).toLocaleString('th-TH')+' '+c}async function api(u,o={}){let r=await fetch(u,{headers:{'Content-Type':'application/json'},...o}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'ผิดพลาด');return j}function av(u){let n=u?(u.display_name||u.username):'Guest';return u&&u.avatar_url?u.avatar_url:`https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=111827&color=fff`}
async function loadMe(){me=(await api('/api/me')).user;joinRealtimeRooms()}function header(){document.body.classList.toggle('admin',!!(me&&me.role==='admin'));auth.innerHTML=me?`<button onclick="show('profile')" class="userChip" title="${escapeHtml(me.display_name||me.username)}"><img src="${av(me)}"><span class="userChipName">${escapeHtml(me.display_name||me.username)}</span></button>${me.role==='admin'?`<button class="gold" onclick="showAdmin()">Admin</button>`:''}<button class="danger" onclick="logout()">ออกจากระบบ</button>`:`<a class="googleTopBtn" href="/auth/google">Gmail Login</a><button class="light" onclick="show('login')">เข้าสู่ระบบ</button><button class="gold" onclick="show('register')">สมัครสมาชิก</button>`;sideAvatar.src=av(me);sideName.textContent=me?(me.display_name||me.username):'Guest';sideStatus.textContent=me?(me.role==='admin'?'Admin':(me.is_vip?'สมาชิก VIP':'สมาชิกทั่วไป')):'กรุณาเข้าสู่ระบบ';const mmA=document.getElementById('mobileMenuAvatar'),mmN=document.getElementById('mobileMenuName'),mmC=document.getElementById('mobileMenuCredit');if(mmA)mmA.src=av(me);if(mmN)mmN.textContent=me?(me.display_name||me.username):'Guest';if(mmC)mmC.textContent='Credit: '+Number(me?.credit||0).toLocaleString('th-TH')}async function refresh(){await loadMe();header();await loadFavIds();renderWallet();if(!home.classList.contains('hidden'))loadAuctions('general');if(!vipzone.classList.contains('hidden'))loadAuctions('vip');if(!favorites.classList.contains('hidden'))loadFavs();if(!orders.classList.contains('hidden'))loadOrders('all');if(!reviews.classList.contains('hidden'))loadReviews();if(!estimate.classList.contains('hidden'))loadEstHistory();if(!publicProfile.classList.contains('hidden'))renderPublicProfile();if(!profile.classList.contains('hidden'))renderProfile();if(!admin.classList.contains('hidden'))loadAdmin();if(!ads.classList.contains('hidden'))loadAds();if(!createAd.classList.contains('hidden'))loadMyAds();if(!activities.classList.contains('hidden'))loadActivities('');renderHearts()}function show(id){if(id==='admin')return showAdmin();Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));$(id)?.classList.remove('hidden');document.querySelector('.app')?.classList.toggle('noSidebar',id!=='profile');title.textContent=pages[id]||'BidMarket';desc.textContent='BidMarket';refresh()}function need(){if(!me){show('login');return false}return true}function showVip(){if(need())show('vipzone')}async function login(){try{me=(await api('/api/login',{method:'POST',body:JSON.stringify({username:loginUser.value,password:loginPass.value})})).user;show('home')}catch(e){loginMsg.innerHTML='<div class="notice error">'+e.message+'</div>'}}async function register(){me=(await api('/api/register',{method:'POST',body:JSON.stringify({username:regUser.value,email:regEmail.value,password:regPass.value})})).user;show('home')}async function logout(){await api('/api/logout',{method:'POST'});me=null;show('login')}
async function upload(f){let fd=new FormData();fd.append('file',f);let r=await fetch('/api/upload',{method:'POST',body:fd}),j=await r.json();if(!r.ok)throw Error(j.error||'อัปโหลดไม่สำเร็จ');return j.url}
function showHelp(title,text){helpTitle.textContent=title;helpBody.textContent=text;helpModal.classList.add('show')}
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
async function loadAuctions(level){let j=await api('/api/auctions?level='+level);let all=j.auctions||[];let per=12;let page=auctionPages[level]||1;let maxPage=Math.max(1,Math.ceil(all.length/per));if(page>maxPage){page=maxPage;auctionPages[level]=page}let items=all.slice((page-1)*per,page*per);(level=='general'?generalGrid:vipGrid).innerHTML=items.map(card).join('')||'<div class="notice">ยังไม่มีสินค้า</div>';renderAuctionPager(level,all.length);renderHearts()}function tleft(ms){let s=Math.floor(ms/1000),d=Math.floor(s/86400);s%=86400;let h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return d?d+' วัน':h?h+' ชม.':m?m+' นาที':s+' วิ'}function media(a,cls=''){return a.media_type=='video'?`<video class="${cls}" src="${a.image_url}" controls></video>`:`<img class="${cls}" src="${a.image_url||''}">`}function card(a){let btn=!a.is_started?`<button disabled>เริ่มในอีก ${tleft(a.time_until_start)}</button>`:`<button class="green" onclick="openJoin(${a.id})">เข้าร่วมประมูล</button>`;return `<div class="card auction">${media(a)}<div class="content"><span class="tag ${a.level=='vip'?'vip':''}">${a.level}</span><span class="tag">${a.method_label||a.method}</span><h3>${a.title}</h3><div class="price">${money(a.current_bid,a.currency)}</div><div class="meta"><div>ผู้ขาย: ${escapeHtml(a.seller_name||'-')}</div><div>Trust: ${a.seller_trust_rate||0}%</div><div>ผู้เสนอราคา: ${a.participant_count}</div></div>${btn}<button class="light detailBtn" onclick="openRoom(${a.id})">รายละเอียด</button></div><button class="heart" id="heart-${a.id}" onclick="toggleFav(event,${a.id})">♡</button></div>`}
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
  let bidControl=a.method==='fee'?`<div class="notice">เคาะครั้งละ ${money(a.bid_fee,a.currency)} | นับถอยหลัง ${a.countdown_seconds} วินาที</div><button class="green" onclick="bid(${a.id})">เคาะราคา</button>`:`<input id="bidAmt" type="number" placeholder="${a.method==='sealed'?'ราคาเสนอแบบปิดซอง':'ราคาเสนอ'}"><button class="green" onclick="bid(${a.id})">${a.method==='sealed'?'ส่งซองราคา':'เสนอราคา'}</button>`;
  roomBody.innerHTML=`<h2>${escapeHtml(a.title)}</h2>${media(a,'auctionMedia')}<div class="meta"><div>วิธีประมูล: ${a.method_label||a.method}</div><div>ราคาเริ่ม: ${money(a.start_price,a.currency)}</div><div>ราคาปัจจุบัน: <span id="roomCurrentBid">${money(a.current_bid,a.currency)}</span></div><div>ผู้เข้าร่วม: <span id="roomParticipants">${a.participant_count}</span>${a.method==='english'?' / ขั้นต่ำ 3 คน':''}</div><div>เหลือเวลา: <span id="roomTimer">${a.end_at?tleft(Math.max(0,a.end_at-Date.now())):'รอเคาะครั้งแรก'}</span></div><div>${escapeHtml(a.description||'')}</div></div>${bidControl}<button class="light" onclick="shareAuction(${a.id})">แชร์</button><button class="gold" onclick="pinAuction(${a.id})">ปักหมุด</button><button class="light" onclick="closeAuc(${a.id})">สิ้นสุดการประมูล</button><h3>แชทประมูล</h3><div class="chatBox">${(a.chats||[]).map(m=>`<div class="msg sys">${escapeHtml(m.text||'')}</div>`).join('')}</div>`;
}
async function bid(id){try{let body={};if($('bidAmt'))body.amount=+bidAmt.value;let j=await api('/api/auctions/'+id+'/bid',{method:'POST',body:JSON.stringify(body)});if(j.auction)renderRoom(j.auction,false);refresh()}catch(e){alert(e.message)}}async function closeAuc(id){try{await api('/api/auctions/'+id+'/close',{method:'POST'});alert('ปิดประมูลแล้ว ระบบสร้าง Order และพักเงิน Escrow แล้ว'); if(me&&me.role==='admin') showAdmin(); else show('home')}catch(e){alert(e.message)}}
async function shareAuction(id){const url=location.origin+location.pathname+'#auction-'+id;try{if(navigator.share)await navigator.share({title:'BidMarket Auction',url});else await navigator.clipboard.writeText(url);let r=await fetch('/api/auctions/'+id+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});let j=await r.json().catch(()=>({}));if(r.ok&&j.code)showRewardCode(j.code,j.activity_link||'',j.activity?.title||'กิจกรรม');else alert(j.message||'แชร์/คัดลอกลิงก์แล้ว')}catch(e){alert('คัดลอกลิงก์: '+url)}}
async function pinAuction(id){try{let hours=prompt('ต้องการปักหมุดกี่ชั่วโมง? (สูงสุด 168 ชั่วโมง / 7 วัน)','24');if(!hours)return;let j=await api('/api/auctions/'+id+'/pin',{method:'POST',body:JSON.stringify({hours:+hours})});alert(`ปักหมุดสำเร็จ ค่าธรรมเนียม ${j.fee} Credit${j.elite_free?' (ใช้สิทธิ์ Elite ฟรี)':''}`);openRoom(id)}catch(e){alert(e.message)}}

async function loadFavIds(){if(!me){favs=[];return}try{favs=(await api('/api/favorites')).favorite_ids}catch{favs=[]}}async function toggleFav(ev,id){ev.stopPropagation();if(!need())return;if(favs.includes(id))await fetch('/api/favorites/'+id,{method:'DELETE'});else await api('/api/favorites/'+id,{method:'POST'});await loadFavIds();renderHearts();if(!favorites.classList.contains('hidden'))loadFavs()}function renderHearts(){document.querySelectorAll('.heart').forEach(b=>{let id=+b.id.replace('heart-','');b.classList.toggle('saved',favs.includes(id));b.textContent=favs.includes(id)?'♥':'♡'})}async function loadFavs(){let j=await api('/api/favorites');favGrid.innerHTML=j.auctions.map(card).join('')||'<div class="notice">ยังไม่มีรายการที่สนใจ</div>'}
function renderWallet(){if(!me)return;walletBox&&(walletBox.innerHTML=`<div class="notice success">Coin ${money(me.coin,'Coin')} | Credit ${money(me.credit,'Credit')} | VIP: ${me.vip_level||'Member'} ${me.is_vip?'(ใช้งานอยู่)':'(หมดอายุ/ยังไม่ได้ซื้อ)'}</div><div class="notice">VIP Points: ${money(me.vip_points||0,'คะแนน')} | เติมสะสม: ${money(me.lifetime_credit_topup||0,'Credit')}</div>`);loadTx()}async function loadTx(){if(!me||!txBox)return;let j=await api('/api/transactions');txBox.innerHTML=j.transactions.length?`<table><tr><th>รายการ</th><th>จำนวน</th><th>สกุลเงิน</th></tr>${j.transactions.map(t=>`<tr><td>${t.type}</td><td>${t.amount}</td><td>${t.currency}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการ</div>'}async function buyCoin(){try{let credit=+(coinCredit?.value||0);if(credit<=0)return alert('กรุณากรอกจำนวน Credit ที่ต้องการแลก');if(!confirm(`ยืนยันแลก ${credit} Credit เป็น ${credit*100} Coin?\nหมายเหตุ: Coin ไม่สามารถแลกกลับเป็น Credit ได้`))return;await api('/api/wallet/buy-coin',{method:'POST',body:JSON.stringify({credit})});refresh()}catch(e){alert(e.message)}}
async function createPay(){try{let credit=+(creditAmount?.value||0);if(credit<10)return alert('เติมขั้นต่ำ 10 Credit');let j=await api('/api/payments/create-credit-topup',{method:'POST',body:JSON.stringify({credit})});let p=j.payment;payBox.innerHTML=`<div class="notice success"><b>รายการเติมเงิน</b><br>ต้องชำระ ${p.baht_amount.toLocaleString()} บาท = ${p.credit_amount.toLocaleString()} Credit<br>อัตรา ${p.rate_baht_per_credit||6} บาท / 1 Credit<br>สถานะ: รออัปโหลดสลิป</div><div style="text-align:center"><img src="/assets/payment-qr.jfif" style="max-width:280px;width:100%;border-radius:18px;border:1px solid #ddd"><p>สแกน QR นี้เพื่อโอนเงิน แล้วอัปโหลดสลิปเพื่อให้ Admin ตรวจสอบ</p></div><input id="slip_${p.id}" type="file" accept="image/*,.pdf"><button class="green" onclick="uploadSlip('${p.id}')">อัปโหลดสลิปแจ้งชำระเงิน</button>`}catch(e){alert(e.message)}}
async function uploadSlip(id){let inp=document.getElementById('slip_'+id);if(!inp||!inp.files[0])return alert('กรุณาเลือกไฟล์สลิป');let fd=new FormData();fd.append('payment_id',id);fd.append('slip',inp.files[0]);let r=await fetch('/api/payments/upload-slip',{method:'POST',body:fd});let j=await r.json();if(!r.ok)return alert(j.error||'อัปโหลดไม่สำเร็จ');payBox.innerHTML='<div class="notice success">ส่งสลิปแล้ว กรุณารอ Admin ตรวจสอบ เมื่ออนุมัติแล้ว Credit จะเพิ่มเข้าบัญชีอัตโนมัติ</div>';refresh()}
async function mockPay(id){alert('ระบบ Mock ถูกปิดแล้ว ใช้การอัปโหลดสลิปและรอ Admin อนุมัติแทน')}
async function subVip(p){await api('/api/vip/subscribe',{method:'POST',body:JSON.stringify({plan:p})});refresh()}

async function loadOrders(type='all'){
  if(!need())return;
  let j=await api('/api/orders?type='+type);
  ordersBox.innerHTML=j.orders.length?`<div class="grid">${j.orders.map(orderCard).join('')}</div>`:'<div class="notice">ยังไม่มีคำสั่งซื้อ / Escrow</div>';
}
function status(s){return {WAIT_SHIPPING:'รอผู้ขายจัดส่ง',SHIPPED:'ผู้ขายแจ้งจัดส่งแล้ว',DELIVERED:'รอยืนยันครบสองฝ่าย',COMPLETED:'สำเร็จ / ปล่อยเงินแล้ว',DISPUTE:'ข้อพิพาท',REFUNDED:'คืนเงินแล้ว',CANCELLED:'ยกเลิก'}[s]||s}
function orderTimeline(o){let ev=(o.events||o.timeline||[]).slice(0,5);return ev.length?`<details><summary>ประวัติ Escrow V2</summary>${ev.map(e=>`<div class="muted">${new Date(e.created_at||Date.now()).toLocaleString('th-TH')} - ${escapeHtml(e.note||e.type||'-')}</div>`).join('')}</details>`:''}
function orderCard(o){
  const isBuyer=o.buyer_id==me?.id, isSeller=o.seller_id==me?.id;
  const role=isBuyer?'คุณเป็นผู้ซื้อ':isSeller?'คุณเป็นผู้ขาย':'เกี่ยวข้อง';
  return `<div class="card content"><h3>${escapeHtml(o.item_title)}</h3><div class="tag">${role}</div><div class="meta"><div>สถานะ: <b>${status(o.status)}</b></div><div>ยอดพัก Escrow: <b>${money(o.amount,o.currency)}</b></div><div>ผู้ซื้อ: ${escapeHtml(o.buyer?.display_name||o.buyer?.username||'-')} (#${o.buyer_id})</div><div>ผู้ขาย: ${escapeHtml(o.seller?.display_name||o.seller?.username||'-')} (#${o.seller_id})</div>${o.shipping_company||o.tracking_number?`<div>ขนส่ง: ${escapeHtml(o.shipping_company||'-')} / เลขพัสดุ: ${escapeHtml(o.tracking_number||'-')}</div>`:''}<div>Escrow: <b>${escapeHtml(o.escrow_version||'v1')}</b> / ${escapeHtml(o.escrow_status||'-')}</div>${o.resolution_note?`<div class="notice">ผลตัดสิน: ${escapeHtml(o.resolution_note)}</div>`:''}${o.dispute?`<div class="notice error">ข้อพิพาท: ${escapeHtml(o.dispute.reason||'-')}</div>`:''}</div>${orderTimeline(o)}${actions(o)}</div>`;
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
  try{let fd=new FormData();fd.append('reason',$('dp'+id).value||'');let inp=$('ev'+id);if(inp&&inp.files){[...inp.files].forEach(f=>fd.append('files',f))}let r=await fetch('/api/orders/'+id+'/dispute',{method:'POST',body:fd});let j=await r.json();if(!r.ok)throw Error(j.error||'เปิดข้อพิพาทไม่สำเร็จ');alert('เปิดข้อพิพาทแล้ว กรุณารอ Admin ตัดสิน');loadOrders()}catch(e){alert(e.message)}
}
async function estimatePrice(){if(!need())return;let fs=[...estPhotos.files];if(fs.length<1||fs.length>6)return alert('ใส่รูป 1-6 รูป');let fd=new FormData();fd.append('title',estTitle.value);fd.append('category',estCat.value);fd.append('condition',estCond.value);fd.append('notes',estNotes.value);fs.forEach(f=>fd.append('photos',f));let r=await fetch('/api/ai/price-estimate',{method:'POST',body:fd}),j=await r.json();let e=j.estimate;estResult.innerHTML=`<div class="notice success"><h3>${e.estimated_min.toLocaleString()} - ${e.estimated_max.toLocaleString()} บาท</h3><p>ค่ากลาง ${e.estimated_mid.toLocaleString()} | ความมั่นใจ ${e.confidence}</p><div class="thumbs">${e.photos.map(p=>`<img src="${p}">`).join('')}</div></div>`;loadEstHistory()}async function loadEstHistory(){if(!me)return;let j=await api('/api/ai/price-estimates');estHistory.innerHTML=j.estimates.map(e=>`<div class="notice">${e.title}: ${e.estimated_min.toLocaleString()} - ${e.estimated_max.toLocaleString()} บาท</div>`).join('')||'<div class="notice">ยังไม่มีประวัติ</div>'}
function vipPremiumCard(level){
  const lv=level||'Member';
  const cls='vipCard_'+String(lv).toLowerCase();
  return `<span class="vipMiniCard ${cls}">${escapeHtml(lv)}</span>`;
}
function renderProfile(){
  if(!me)return;
  const display=escapeHtml(me.display_name||me.username||'ผู้ใช้');
  const uid=escapeHtml(me.public_user_id||me.user_id16||('BM'+String(me.id||'').padStart(14,'0')).slice(0,16));
  const isVip=!!me.is_vip;
  const statusText=isVip?'VIP MEMBER':'สมาชิกทั่วไป';
  const verified=me.verified||me.google_linked;
  window.trustDetailMe=me;
  profileBox.innerHTML=`<div class="accountHero">
    <img class="accountHeroAvatar" src="${av(me)}" alt="profile">
    <div class="accountHeroName">${display}</div>
    <div class="accountHeroId">ID : <span>${uid}</span></div>
    <div class="accountHeroStatus"><span>${statusText}</span>${isVip?vipPremiumCard(me.vip_level):''}</div>
    <div class="accountHeroVerified ${verified?'ok':'no'}">${verified?'✓ VERIFIED':'ยังไม่ยืนยันตัวตน'}</div>
    <div class="accountHeroStats">
      <button class="trustStatBtn" onclick="showTrustDetails(window.trustDetailMe)"><b>Trust Score</b><span>${Number(me.trust_rate||0)}</span></button>
      <div><b>Coin</b><span>${Number(me.coin||0).toLocaleString('th-TH')}</span></div>
      <div><b>Credit</b><span>${Number(me.credit||0).toLocaleString('th-TH')}</span></div>
    </div>
  </div><div class="notice"><b>เสียงแจ้งเตือน</b><br><label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" ${soundEnabled?'checked':''} onchange="setSoundEnabled(this.checked)" style="width:auto;margin:0"> เปิดเสียงแจ้งเตือน Realtime</label><div class="small">ใช้กับ: ถูกเสนอราคาสูงกว่า, เหลือเวลา 10 วินาที, ชนะประมูล, แชท, Escrow และ VIP Level Up</div></div>`;
  pName.value=me.display_name||me.username||'';
  pEmail.value=me.email||'';
  pBio.value=me.bio||'';
  pAvatar.value=me.avatar_url||'';
  trustBox.innerHTML=`<button class="trustSummaryBtn" onclick="showTrustDetails(window.trustDetailMe)"><div class="price">${me.trust_rate||0}%</div><div>สำเร็จ ${me.trust_completed_sales||0}/${me.trust_total_orders||0} รายการ</div><span class="muted">กดเพื่อดูรายละเอียด</span></button>`;
}
async function saveProfile(){me=(await api('/api/me/profile',{method:'PUT',body:JSON.stringify({display_name:pName.value,email:pEmail.value,bio:pBio.value,avatar_url:pAvatar.value})})).user;refresh()}

let profileTargetId=null;
function openProfilePage(id){if(!me){show('login');return}profileTargetId=id||me.id;show('publicProfile')}
function mobileOpenProfile(){closeMobileMenu();openProfilePage()}
function profileBannerStyle(u){return u.profile_banner_url?`background-image:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.12)),url('${escapeHtml(u.profile_banner_url)}')`:''}
function canChangeText(ts){if(!ts)return 'เปลี่ยนได้ทันที';const left=7*24*60*60*1000-(Date.now()-Number(ts));return left<=0?'เปลี่ยนได้ทันที':'เปลี่ยนได้อีกใน '+Math.ceil(left/(24*60*60*1000))+' วัน'}

function renderProfileShowcase(items,owner){
  const arr=[1,2,3].map(rank=>(items||[]).find(x=>Number(x.rank)===rank)||{rank});
  const cards=arr.map(x=>x.image_url?`<div class="showcaseItem rank${x.rank}"><img src="${escapeHtml(x.image_url)}"><div class="showcaseBadge">อันดับ ${x.rank}</div>${owner?`<button class="showcaseRemove" onclick="removeProfileShowcase(${x.rank})">ลบ</button>`:''}<div class="showcaseTitle">${escapeHtml(x.title||('สินค้าแนะนำอันดับ '+x.rank))}</div></div>`:`<div class="showcaseItem rank${x.rank}"><div class="showcaseBadge">อันดับ ${x.rank}</div><div class="profileEmpty" style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center">ยังไม่ได้เพิ่มสินค้า</div></div>`).join('');
  const tools=owner?`<div class="showcaseTools"><select id="showcaseRank"><option value="1">อันดับ 1</option><option value="2">อันดับ 2</option><option value="3">อันดับ 3</option></select><input id="showcaseTitle" placeholder="ชื่อสินค้าแนะนำ"><input id="showcaseFile" type="file" accept="image/*"><button class="green" onclick="saveProfileShowcase()">เพิ่ม/เปลี่ยน</button></div><div class="muted" style="margin-top:8px">ตู้โชว์ใส่ได้ 3 อันดับเท่านั้น และไม่สามารถใช้รูปสินค้าซ้ำกันได้</div>`:'';
  return `<h3>ตู้โชว์สินค้าถาวร</h3><div class="showcaseGrid">${cards}</div>${tools}`;
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
  publicProfileBox.innerHTML=`<div class="profileHero"><div class="profileBanner" style="${profileBannerStyle(u)}"></div><div class="profileInfo"><img class="profilePic" src="${av(u)}"><div><div class="profileName">${escapeHtml(u.display_name||u.username)}</div><div class="profileId">ID : ${escapeHtml(u.public_user_id||u.id)}</div><button class="profileTrustBtn" onclick="showTrustDetails(window.trustDetailProfile)">Trust Score : <b>${Number(u.trust_rate||0)}</b></button>${owner?`<div class="profileMediaTools"><label class="light" style="padding:8px 12px;border-radius:999px;border:1px solid #ddd;cursor:pointer">เปลี่ยนรูปโปรไฟล์<input id="profileAvatarFile" type="file" accept="image/*" style="display:none" onchange="changeProfileMedia('avatar',this)"></label><label class="light" style="padding:8px 12px;border-radius:999px;border:1px solid #ddd;cursor:pointer">เปลี่ยนพื้นหลัง<input id="profileBannerFile" type="file" accept="image/*" style="display:none" onchange="changeProfileMedia('banner',this)"></label><span class="profileSmall">รูป: ${canChangeText(u.profile_image_changed_at)} • พื้นหลัง: ${canChangeText(u.profile_banner_changed_at)}</span></div>`:''}</div><div class="profileActions">${!owner?`<button class="green" onclick="addFriend(${u.id})">${j.is_friend?'เป็นเพื่อนแล้ว':'เพิ่มเพื่อน'}</button><button onclick="openChatWithUser(${u.id})">ส่งข้อความ</button>`:''}</div></div></div>`;
  profileFriendsBox.innerHTML=`<h3>เพื่อน (${(j.friends||[]).length}/100)</h3>${(j.friends||[]).length?(j.friends||[]).map(f=>`<div class="friendRow" onclick="openChatWithUser(${f.id})"><img src="${av(f)}"><div><b>${escapeHtml(f.display_name||f.username)}</b><br><span class="muted">${escapeHtml(f.public_user_id||('#'+f.id))}</span></div></div>`).join(''):'<div class="profileEmpty">ยังไม่มีรายชื่อเพื่อน</div>'}`;
  profileShowcaseBox.innerHTML=renderProfileShowcase(j.showcase||[],owner);
  profilePostBox.innerHTML=owner?`<h3>โพสต์</h3><div class="postComposer"><textarea id="profilePostText" placeholder="พิมพ์ข้อความเพื่อแสดงให้คนอื่นเห็น..."></textarea><input id="profilePostMedia" type="file" accept="image/*,video/*"><button class="green" onclick="createProfilePost()">โพสต์</button></div>`:`<h3>โพสต์</h3>`;
  profileFeedBox.innerHTML=(j.posts||[]).length?`<h3>โพสต์ล่าสุด</h3>`+(j.posts||[]).map(p=>`<div class="postCard"><div class="postHead"><img src="${av({display_name:p.user_name,avatar_url:p.user_avatar})}"><div><b>${escapeHtml(p.user_name||'ผู้ใช้')}</b><br><span class="muted">${new Date(p.created_at).toLocaleString('th-TH')}</span></div></div>${p.content?`<div>${escapeHtml(p.content)}</div>`:''}${p.media_url?(p.media_type==='video'?`<video class="postMedia" src="${escapeHtml(p.media_url)}" controls></video>`:`<img class="postMedia" src="${escapeHtml(p.media_url)}">`):''}</div>`).join(''):'<h3>โพสต์ล่าสุด</h3><div class="profileEmpty">ยังไม่มีโพสต์</div>';
  profileActivityBox.innerHTML=`<h3>กิจกรรมล่าสุด</h3>${(j.recent_activities||[]).length?(j.recent_activities||[]).map(a=>`<div class="activityItem"><b>${escapeHtml(a.type)}</b> — ${escapeHtml(a.title||'-')}<br><span class="muted">${a.amount?money(a.amount,a.currency||''):''} ${a.created_at?new Date(a.created_at).toLocaleString('th-TH'):''}</span></div>`).join(''):'<div class="profileEmpty">ยังไม่มีกิจกรรมล่าสุด</div>'}`;
}
async function addFriend(id){try{await api('/api/profiles/'+id+'/friend',{method:'POST'});await renderPublicProfile();showToast('เพิ่มเพื่อนแล้ว')}catch(e){alert(e.message)}}
async function uploadAny(file){const fd=new FormData();fd.append('file',file);const r=await fetch('/api/upload',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw Error(j.error||'อัปโหลดไม่สำเร็จ');return j.url}
async function changeProfileMedia(type,input){try{const file=input.files&&input.files[0];if(!file)return;const url=await uploadAny(file);me=(await api('/api/me/profile-media',{method:'PUT',body:JSON.stringify({type,url})})).user;await renderPublicProfile();header()}catch(e){alert(e.message)}finally{input.value=''}}
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


function showAdmin(){if(!me){Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));login.classList.remove('hidden');title.textContent=pages.login;desc.textContent='BidMarket';refresh();return}if(me.role!='admin')return alert('เฉพาะ Admin');Object.keys(pages).forEach(p=>$(p)?.classList.add('hidden'));admin.classList.remove('hidden');title.textContent=pages.admin;desc.textContent='BidMarket';loadAdmin()}
async function loadAdmin(){
  let e=await api('/api/admin/escrow');let pj=await api('/api/admin/payments');
  adminBox.innerHTML=`<div class="grid"><div class="card content"><h3>เงินพัก Escrow</h3><div class="price">${money(e.held,'Credit')}</div></div><div class="card content"><h3>รอจัดส่ง</h3><div class="price">${e.waitShipping}</div></div><div class="card content"><h3>ข้อพิพาท</h3><div class="price">${e.disputes}</div></div></div>
  <h3>ตรวจสอบสลิปเติม Credit</h3>${pj.payments.length?`<table><tr><th>ผู้ใช้</th><th>ยอด</th><th>Credit</th><th>สถานะ</th><th>สลิป</th><th>จัดการ</th></tr>${pj.payments.map(p=>`<tr><td>${p.user?.username||p.user_id}</td><td>${p.baht_amount||0} บาท</td><td>${p.credit_amount}</td><td>${payStatus(p.status)}</td><td>${p.slip_url?`<a href="${p.slip_url}" target="_blank">ดูสลิป</a>`:'-'}</td><td>${p.status==='approved'?'-':`<button class="green" onclick="adminApprovePay('${p.id}')">อนุมัติ</button><button class="danger" onclick="adminRejectPay('${p.id}')">ปฏิเสธ</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีรายการเติม Credit</div>'}
  <h3>Review Queue</h3><div id="reviewQueueBox"></div><h3>จัดการคำสั่งซื้อ / Escrow V2</h3><div class="notice">V2 บันทึกเหตุการณ์ทุกขั้นตอน ป้องกันปล่อยเงิน/คืนเงินซ้ำ และแนบบันทึกเหตุผลการตัดสินของ Admin</div>
  ${e.orders.length?`<table><tr><th>ID</th><th>สินค้า</th><th>คู่ซื้อขาย</th><th>สถานะ</th><th>ยอด</th><th>ข้อพิพาท/จัดส่ง</th><th>ตัดสิน</th></tr>${e.orders.map(o=>`<tr><td>#${o.id}</td><td><b>${escapeHtml(o.item_title||'-')}</b></td><td>ผู้ซื้อ: ${escapeHtml(o.buyer?.username||'-')}<br>ผู้ขาย: ${escapeHtml(o.seller?.username||'-')}</td><td>${status(o.status)}</td><td>${money(o.amount,o.currency)}<br><span class="muted">ค่าบริการ ${money(o.service_fee||0,o.currency)}</span></td><td>${o.shipping_company||o.tracking_number?`ขนส่ง: ${escapeHtml(o.shipping_company||'-')}<br>เลข/หลักฐาน: ${escapeHtml(o.tracking_number||'-')}`:'-'}${o.dispute?`<div class="notice error">${escapeHtml(o.dispute.reason||'-')}</div>`:''}</td><td>${['COMPLETED','REFUNDED'].includes(o.status)?'-':`<input id="adn${o.id}" placeholder="บันทึกเหตุผลการตัดสิน"><button class="green" onclick="adminRel(${o.id})">ปล่อยเงินให้ผู้ขาย</button><button class="danger" onclick="adminRef(${o.id})">คืนเงินผู้ซื้อ</button>`}</td></tr>`).join('')}</table>`:'<div class="notice">ยังไม่มีคำสั่งซื้อ / Escrow</div>'}`;
  loadReviewQueueAdmin();
}
async function loadReviewQueueAdmin(){try{let q=await api('/api/admin/review-queue');reviewQueueBox.innerHTML=q.queue?.length?`<table><tr><th>ประเภท</th><th>ID</th><th>เหตุผล</th><th>สถานะ</th></tr>${q.queue.map(x=>`<tr><td>${x.target_type}</td><td>${x.target_id}</td><td>${escapeHtml(x.reason||'')}</td><td>${x.status}</td></tr>`).join('')}</table>`:'<div class="notice">ไม่มีรายการรอตรวจสอบ</div>'}catch(e){}}
function payStatus(s){return {pending_slip:'รอสลิป',waiting_admin:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธ'}[s]||s}
async function adminApprovePay(id){await api('/api/admin/payments/'+id+'/approve',{method:'POST',body:JSON.stringify({})});alert('อนุมัติแล้ว ระบบเพิ่ม Credit ให้ผู้ใช้แล้ว');loadAdmin()}
async function adminRejectPay(id){let note=prompt('เหตุผลที่ปฏิเสธ')||'';await api('/api/admin/payments/'+id+'/reject',{method:'POST',body:JSON.stringify({note})});loadAdmin()}
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
async function reportActivity(id){if(!need())return;let reason=prompt('เหตุผลที่รายงานกิจกรรมนี้')||'';if(!reason)return;await api('/api/activities/'+id+'/report',{method:'POST',body:JSON.stringify({reason})});alert('ส่งรายงานให้ Admin ตรวจสอบแล้ว')}

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
