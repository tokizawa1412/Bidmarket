require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), fs=require('fs'), path=require('path'), multer=require('multer'), {v4:uuid}=require('uuid');
const {Pool}=require('pg');
const PgSession=require('connect-pg-simple')(session);
const app=express(), PORT=process.env.PORT||3000, dataDir=path.join(__dirname,'data'), dbFile=path.join(dataDir,'db.json'), uploadDir=path.join(__dirname,'public','uploads');
const USE_POSTGRES=!!process.env.DATABASE_URL;
const pgPool=USE_POSTGRES?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}}):null;
const http=require('http');
const serverHttp=http.createServer(app);
const {Server}=require('socket.io');
const io=new Server(serverHttp);
const auctionApi=(a)=>au(a);
fs.mkdirSync(dataDir,{recursive:true}); fs.mkdirSync(uploadDir,{recursive:true});
const now=()=>Date.now(), img='https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1200&auto=format&fit=crop';
function fresh(){const h=bcrypt.hashSync('1234',10);return {next:{user:3,auc:3,tx:1,order:1,escrow:1,dispute:1,estimate:1,ad:1,msg:1,payment:1},users:[{id:1,username:'demo',email:'demo@x.local',password_hash:h,role:'admin',status:'active',display_name:'Demo Admin',avatar_url:'',bio:'',coin:5e6,credit:50000,token:20,vip_until:now()+31536e6,trust_completed_sales:0,trust_total_orders:0},{id:2,username:'seller',email:'seller@x.local',password_hash:h,role:'user',status:'active',display_name:'VIP Seller',avatar_url:'',bio:'',coin:2e6,credit:30000,token:5,vip_until:now()+15552e6,trust_completed_sales:0,trust_total_orders:0}],auctions:[{id:1,seller_id:2,level:'vip',method:'forward',currency:'credit',title:'Rolex Submariner Vintage',description:'ตัวอย่าง VIP + Escrow',category:'ของสะสม',image_url:'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:10000,current_bid:10000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+7200e3,status:'active',vip_entry_min_credit:7000,vip_entry_fee_percent:5},{id:2,seller_id:1,level:'general',method:'forward',currency:'credit',title:'iPhone 15 Pro Max',description:'ตัวอย่างประมูลทั่วไป + Escrow',category:'มือถือ',image_url:'https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:20000,current_bid:20000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+86400e3,status:'active',vip_entry_min_credit:0,vip_entry_fee_percent:0}],orders:[],escrow:[],disputes:[],transactions:[],favorites:[],messages:[],estimates:[],ads:[],company_revenue:[],winners:[]}}
function normalizeDb(d){
  ['orders','escrow','disputes','transactions','favorites','messages','estimates','ads','company_revenue','winners','payments','audit_logs','escrow_events'].forEach(k=>d[k]||(d[k]=[]));
  d.next||(d.next={});
  ['user','auc','tx','order','escrow','dispute','estimate','ad','msg','payment','audit','escrow_event'].forEach(k=>d.next[k]||(d.next[k]=1));
  (d.users||[]).forEach(u=>{u.trust_completed_sales??=0;u.trust_total_orders??=0;u.avatar_url??='';u.display_name??=u.username;u.role??='user';u.status??='active';u.google_id??='';u.auth_provider??=(u.google_id?'google':'local');u.credit??=0;u.coin??=0;u.token??=0});
  (d.orders||[]).forEach(o=>{o.escrow_version??='v1';o.timeline??=[];o.audit_refs??=[];o.locked_amount??=Number(o.amount||0);o.service_fee??=Number(o.service_fee||0);o.escrow_status??=(['COMPLETED','REFUNDED'].includes(o.status)?o.status:'HELD')});
  return d;
}
function loadLocal(){
  if(!fs.existsSync(dbFile))fs.writeFileSync(dbFile,JSON.stringify(fresh(),null,2));
  return normalizeDb(JSON.parse(fs.readFileSync(dbFile)));
}
async function initPostgres(){
  await pgPool.query(`CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const row=(await pgPool.query('SELECT state FROM app_state WHERE id=$1',['main'])).rows[0];
  if(row&&row.state)return normalizeDb(row.state);
  let initial=fs.existsSync(dbFile)?JSON.parse(fs.readFileSync(dbFile)):fresh();
  initial=normalizeDb(initial);
  await pgPool.query('INSERT INTO app_state(id,state,updated_at) VALUES($1,$2,now()) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()',['main',initial]);
  return initial;
}
let db;
async function load(){
  if(USE_POSTGRES)return await initPostgres();
  return loadLocal();
}
let saveQueue=Promise.resolve();
function save(){
  const snapshot=JSON.stringify(db,null,2);
  fs.writeFileSync(dbFile,snapshot);
  if(USE_POSTGRES){
    saveQueue=saveQueue.then(()=>pgPool.query('UPDATE app_state SET state=$1, updated_at=now() WHERE id=$2',[JSON.parse(snapshot),'main'])).catch(e=>console.error('PostgreSQL save failed:',e.message));
  }
}
const nid=k=>(db.next[k]=db.next[k]||1,db.next[k]++);const user=id=>db.users.find(u=>u.id==id);const uname=n=>db.users.find(u=>u.username==n);const vip=u=>u&&u.vip_until>now();const trust=u=>u&&u.trust_total_orders?Math.round(u.trust_completed_sales/u.trust_total_orders*100):0;
function pub(u){return u&&{id:u.id,username:u.username,email:u.email,role:u.role,status:u.status,display_name:u.display_name,avatar_url:u.avatar_url,bio:u.bio||'',coin:u.coin,credit:u.credit,token:u.token,is_vip:vip(u),vip_until:u.vip_until,trust_rate:trust(u),trust_completed_sales:u.trust_completed_sales,trust_total_orders:u.trust_total_orders,google_linked:!!u.google_id}}
function adminEmailSet(){return new Set(String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
function isAdminEmail(email){return !!email&&adminEmailSet().has(String(email).toLowerCase())}
function uniqueUsername(base){let clean=String(base||'user').toLowerCase().replace(/[^a-z0-9_ก-๙.-]+/g,'').replace(/^[.-]+|[.-]+$/g,'')||'user';let name=clean, i=1;while(uname(name))name=clean+i++;return name}
function googleCallbackUrl(req){return process.env.GOOGLE_CALLBACK_URL||`${req.protocol}://${req.get('host')}/auth/google/callback`}
function upsertGoogleUser(profile){
  const email=String(profile.email||'').toLowerCase();
  if(!email)throw new Error('Google ไม่ส่งอีเมลกลับมา');
  let u=db.users.find(x=>x.google_id===profile.sub)||db.users.find(x=>String(x.email||'').toLowerCase()===email);
  if(!u){
    const base=email.split('@')[0];
    u={id:nid('user'),username:uniqueUsername(base),email,password_hash:'',role:isAdminEmail(email)?'admin':'user',status:'active',display_name:profile.name||base,avatar_url:profile.picture||'',bio:'',coin:0,credit:0,token:0,vip_until:0,trust_completed_sales:0,trust_total_orders:0,google_id:profile.sub,auth_provider:'google',created_at:now()};
    db.users.push(u);
  }else{
    u.google_id=profile.sub;u.auth_provider=u.auth_provider||'google';u.email=email;
    if(profile.name&&!u.display_name)u.display_name=profile.name;
    if(profile.picture)u.avatar_url=profile.picture;
    if(isAdminEmail(email))u.role='admin';
  }
  return u;
}
function au(a,viewer){return {...a,seller_name:user(a.seller_id)?.username,seller_trust_rate:trust(user(a.seller_id)),is_started:now()>=a.start_at,time_until_start:Math.max(0,a.start_at-now()),participant_count:Object.keys(a.bidder_last_amounts||{}).length,winner_name:a.winner_id?user(a.winner_id)?.username:null,viewer_vip_entry:(a.vip_entries||[]).find(e=>e.user_id==viewer)||null}}
function need(req,res,next){if(!req.session.userId)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});let u=user(req.session.userId);if(!u||u.status!=='active')return res.status(403).json({error:'บัญชีถูกระงับ'});next()}function admin(req,res,next){let u=user(req.session.userId);if(!u||u.role!='admin')return res.status(403).json({error:'เฉพาะ Admin'});next()}
function tx(uid,type,amount,currency,note='',meta={}){let u=user(uid),before=meta.before_balance,after=meta.after_balance;db.transactions.unshift({id:nid('tx'),user_id:uid,type,amount,currency,note,before_balance:before,after_balance:after,ref_type:meta.ref_type||'',ref_id:meta.ref_id||'',created_at:now()})}
function audit(actor_id,action,target_type,target_id,details={}){const row={id:nid('audit'),actor_id:actor_id||null,actor_name:actor_id?(user(actor_id)?.username||'system'):'system',action,target_type,target_id,details,ip:details.ip||'',user_agent:details.user_agent||'',created_at:now()};db.audit_logs.unshift(row);return row}
function escrowEvent(order,type,actor_id,note='',details={}){const ev={id:nid('escrow_event'),order_id:order?.id||null,type,actor_id:actor_id||null,note,details,created_at:now()};db.escrow_events.unshift(ev);if(order){order.timeline=order.timeline||[];order.timeline.unshift(ev)}return ev}
function bal(uid,c,delta,type,note='',meta={}){let u=user(uid);if(!u)throw Error('ไม่พบผู้ใช้');delta=Number(delta||0);const before=Number(u[c]||0), after=before+delta;if(after<0)throw Error('ยอด '+c+' ไม่พอ');u[c]=after;tx(uid,type,delta,c,note,{...meta,before_balance:before,after_balance:after})}

function realtimeAuctionPayload(a) {
  return auctionApi(a);
}
function emitAuctionUpdate(a, event='auction:update') {
  try {
    io.to(`auction:${a.id}`).emit(event, realtimeAuctionPayload(a));
  } catch (e) {
    console.warn('emit auction update failed', e.message);
  }
}
function emitOrderUpdate(order) {
  try {
    io.emit('order:update', order);
  } catch (e) {
    console.warn('emit order update failed', e.message);
  }
}
io.on('connection', (socket) => {
  socket.on('auction:join', (auctionId) => {
    socket.join(`auction:${Number(auctionId)}`);
    const a = db.auctions.find(x => x.id === Number(auctionId));
    if (a) socket.emit('auction:update', realtimeAuctionPayload(a));
  });
  socket.on('auction:leave', (auctionId) => {
    socket.leave(`auction:${Number(auctionId)}`);
  });
});

app.set('trust proxy',1);
app.use(express.json({limit:'25mb'}));app.use(express.urlencoded({extended:true}));
const sessionOptions={secret:process.env.SESSION_SECRET||'dev-change-me',resave:false,saveUninitialized:false,cookie:{maxAge:6048e5,secure:process.env.NODE_ENV==='production',sameSite:'lax'}};
if(USE_POSTGRES){sessionOptions.store=new PgSession({pool:pgPool,tableName:'user_sessions',createTableIfMissing:true});}
app.use(session(sessionOptions));app.use(express.static(path.join(__dirname,'public')));app.use('/uploads',express.static(uploadDir));const up=multer({storage:multer.diskStorage({destination:(_,__,cb)=>cb(null,uploadDir),filename:(_,f,cb)=>cb(null,Date.now()+'-'+uuid()+path.extname(f.originalname))}),limits:{fileSize:50*1024*1024}});
app.post('/api/register',(req,res)=>{let {username,email,password}=req.body;if(!username||!email||!password)return res.status(400).json({error:'กรอกข้อมูลให้ครบ'});if(uname(username))return res.status(400).json({error:'ชื่อซ้ำ'});let u={id:nid('user'),username,email,password_hash:bcrypt.hashSync(password,10),role:'user',status:'active',display_name:username,avatar_url:'',bio:'',coin:0,credit:0,token:0,vip_until:0,trust_completed_sales:0,trust_total_orders:0};db.users.push(u);req.session.userId=u.id;save();res.json({user:pub(u)})});
app.post('/api/login',(req,res)=>{let u=uname(req.body.username);if(!u||!u.password_hash||!bcrypt.compareSync(req.body.password||'',u.password_hash))return res.status(401).json({error:'ผิด'});req.session.userId=u.id;res.json({user:pub(u)})});app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));app.get('/api/me',(req,res)=>res.json({user:pub(user(req.session.userId))}));
app.get('/auth/google',(req,res)=>{
  if(!process.env.GOOGLE_CLIENT_ID)return res.status(500).send('Missing GOOGLE_CLIENT_ID in Render Environment');
  const state=uuid();req.session.googleOAuthState=state;
  const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:googleCallbackUrl(req),response_type:'code',scope:'openid email profile',state,prompt:'select_account'});
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+params.toString());
});
app.get('/auth/google/callback',async(req,res)=>{
  try{
    if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return res.status(500).send('Missing Google OAuth Environment Variables');
    if(!req.query.code)return res.redirect('/?google_error=no_code');
    if(!req.session.googleOAuthState||req.query.state!==req.session.googleOAuthState)return res.status(400).send('Invalid OAuth state');
    delete req.session.googleOAuthState;
    const tokenResp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:String(req.query.code),client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:googleCallbackUrl(req),grant_type:'authorization_code'})});
    const token=await tokenResp.json();
    if(!tokenResp.ok)throw new Error(token.error_description||token.error||'Google token exchange failed');
    const profileResp=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`}});
    const profile=await profileResp.json();
    if(!profileResp.ok)throw new Error(profile.error_description||profile.error||'Cannot read Google profile');
    if(profile.email_verified===false)throw new Error('อีเมล Google ยังไม่ได้ยืนยัน');
    const u=upsertGoogleUser(profile);req.session.userId=u.id;save();
    res.redirect('/?google_login=success');
  }catch(e){console.error('Google OAuth failed:',e);res.redirect('/?google_error='+encodeURIComponent(e.message));}
});
app.put('/api/me/profile',need,(req,res)=>{let u=user(req.session.userId);['display_name','email','bio','avatar_url'].forEach(k=>{if(req.body[k]!=null)u[k]=String(req.body[k])});save();res.json({user:pub(u)})});app.post('/api/upload',need,up.single('file'),(req,res)=>res.json({url:'/uploads/'+req.file.filename}));
app.post('/api/wallet/buy-coin',need,(req,res)=>{bal(req.session.userId,'coin',Number(req.body.baht)*100,'ซื้อ Coin');save();res.json({user:pub(user(req.session.userId))})});
app.post('/api/payments/create-credit-topup',need,(req,res)=>{
  const baht=Math.floor(Number(req.body.baht||0));
  if(!Number.isFinite(baht)||baht<50)return res.status(400).json({error:'เติมเงินขั้นต่ำ 50 บาท'});
  const credit_amount=Math.floor(baht/5);
  const p={id:uuid(),user_id:req.session.userId,baht_amount:baht,credit_amount,status:'pending_slip',slip_url:'',admin_note:'',created_at:now(),updated_at:now()};
  db.payments=(db.payments||[]);db.payments.unshift(p);save();
  res.json({payment:p, payment_id:p.id, baht_amount:baht, credit_amount});
});
app.post('/api/payments/upload-slip',need,up.single('slip'),(req,res)=>{
  const p=(db.payments||[]).find(x=>x.id==req.body.payment_id&&x.user_id==req.session.userId);
  if(!p)return res.status(404).json({error:'ไม่พบรายการเติมเงิน'});
  if(p.status==='approved')return res.status(400).json({error:'รายการนี้อนุมัติแล้ว'});
  if(!req.file)return res.status(400).json({error:'กรุณาอัปโหลดสลิป'});
  p.slip_url='/uploads/'+req.file.filename;p.status='waiting_admin';p.updated_at=now();save();
  res.json({payment:p});
});
app.get('/api/payments/my',need,(req,res)=>res.json({payments:(db.payments||[]).filter(p=>p.user_id==req.session.userId)}));
app.get('/api/admin/payments',admin,(req,res)=>res.json({payments:(db.payments||[]).map(p=>({...p,user:pub(user(p.user_id))}))}));
app.post('/api/admin/payments/:id/approve',admin,(req,res)=>{
  const p=(db.payments||[]).find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ไม่พบรายการ'});
  if(p.status!=='approved'){p.status='approved';p.updated_at=now();p.admin_note=req.body.note||'';bal(p.user_id,'credit',p.credit_amount,'เติม Credit ผ่าน QR',`รายการ ${p.id} / ${p.baht_amount} บาท`);save();}
  res.json({payment:p,user:pub(user(p.user_id))});
});
app.post('/api/admin/payments/:id/reject',admin,(req,res)=>{const p=(db.payments||[]).find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ไม่พบรายการ'});p.status='rejected';p.admin_note=req.body.note||'';p.updated_at=now();save();res.json({payment:p})});
app.post('/api/payments/mock-confirm',need,(req,res)=>res.status(403).json({error:'ปิดระบบ Mock แล้ว กรุณาอัปโหลดสลิปให้ Admin ตรวจสอบ'}));
app.post('/api/vip/subscribe',need,(req,res)=>{let u=user(req.session.userId),days={monthly:30,halfyear:180,yearly:365}[req.body.plan]||30;u.vip_until=Math.max(u.vip_until||0,now())+days*86400e3;save();res.json({user:pub(u)})});
app.get('/api/auctions',(req,res)=>res.json({auctions:db.auctions.filter(a=>a.status=='active'&&a.level==(req.query.level||'general')).map(a=>au(a,req.session.userId))}));app.get('/api/auctions/:id',(req,res)=>{let a=db.auctions.find(x=>x.id==req.params.id);if(!a)return res.status(404).json({error:'ไม่พบ'});res.json({auction:au(a,req.session.userId)})});
app.post('/api/auctions',need,(req,res)=>{let u=user(req.session.userId),b=req.body,start=Number(b.start_price),st=b.start_at?new Date(b.start_at).getTime():now();if(st>now()+30*86400e3)return res.status(400).json({error:'ตั้งล่วงหน้าได้ไม่เกิน 30 วัน'});if(b.level=='vip'&&!vip(u))return res.status(403).json({error:'ต้องเป็น VIP'});let a={id:nid('auc'),seller_id:u.id,level:b.level,method:b.method,currency:b.currency,title:b.title,description:b.description||'',category:b.category||'',image_url:b.image_url||img,media_type:b.media_type||'image',start_price:start,current_bid:b.method=='sealed'?0:start,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:st,end_at:st+(Number(b.sealed_hours||24)*3600e3),status:'active',vip_entry_min_credit:Number(b.vip_entry_min_credit||0),vip_entry_fee_percent:(b.method=='forward'?Number(b.vip_entry_fee_percent||0):0)};db.auctions.push(a);save();res.json({auction:au(a,u.id)})});
app.post('/api/auctions/:id/join',need,(req,res)=>{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)return res.status(404).json({error:'ไม่พบ'});if(a.level=='vip'){let need=Math.max(a.vip_entry_min_credit,Math.ceil(a.start_price*.7)),amt=Number(req.body.credit_amount);if(amt<need)return res.status(400).json({error:'ต้องใส่ Credit อย่างน้อย '+need});if(u.credit<amt)return res.status(400).json({error:'Credit ไม่พอ'});let e=a.vip_entries.find(e=>e.user_id==u.id);e?e.credit_amount=amt:a.vip_entries.push({user_id:u.id,credit_amount:amt})}if(!a.participants.includes(u.id))a.participants.push(u.id);save();res.json({auction:au(a,u.id)})});

const ESCROW_TERMINAL=new Set(['COMPLETED','REFUNDED','CANCELLED']);
const ESCROW_ACTIVE=new Set(['WAIT_SHIPPING','SHIPPED','DELIVERED','DISPUTE']);
function activeEscrowStatus(o){return o && !ESCROW_TERMINAL.has(o.status)}
function assertOrderParticipant(o,uid){if(!o)throw Error('ไม่พบคำสั่งซื้อ');if(![o.buyer_id,o.seller_id].includes(uid))throw Error('ไม่มีสิทธิ์')}
function assertHeld(o){if(!o||o.escrow_status!=='HELD'||!ESCROW_ACTIVE.has(o.status))throw Error('รายการนี้ไม่ได้อยู่ในสถานะพักเงิน Escrow')}
function orderPublic(o){return {...o,buyer:pub(user(o.buyer_id)),seller:pub(user(o.seller_id)),auction:db.auctions.find(a=>a.id==o.auction_id)||null,dispute:db.disputes.find(d=>d.id==o.dispute_id)||null,events:(db.escrow_events||[]).filter(e=>e.order_id==o.id).slice(0,30)}}
function holdBidFunds(u,currency,amount,note){
  amount=Number(amount||0);
  if(amount<=0)return;
  bal(u.id,currency,-amount,'พักเงินเสนอราคา',note);
}
function refundBidFunds(uid,currency,amount,note){
  amount=Number(amount||0);
  if(amount<=0)return;
  bal(uid,currency,amount,'คืนเงินเสนอราคา',note);
}
function currentBidHoldAmount(a,uid){return Number((a.bidder_last_amounts||{})[uid]||0)}
app.post('/api/auctions/:id/bid',need,(req,res)=>{
  let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);
  try{
    if(!a)throw Error('ไม่พบสินค้า');
    if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');
    if(now()<a.start_at)throw Error('ยังไม่เริ่ม');
    if(a.seller_id==u.id)throw Error('ประมูลของตัวเองไม่ได้');
    if(a.level=='vip'&&!a.vip_entries.find(e=>e.user_id==u.id))throw Error('กรุณาเข้าร่วม VIP ก่อน');
    let amount=Number(req.body.amount);
    if(!Number.isFinite(amount)||amount<=0)throw Error('กรุณาใส่ราคาให้ถูกต้อง');
    if(a.method!='sealed'&&amount<=a.current_bid)throw Error('ต้องสูงกว่าปัจจุบัน');
    if(a.method==='sealed'){
      const prev=currentBidHoldAmount(a,u.id);
      if(amount<=prev)throw Error('ต้องสูงกว่าราคาเดิมของคุณ');
      holdBidFunds(u,a.currency,amount-prev,'เสนอราคาแบบซอง: '+a.title);
      a.sealed_bids=(a.sealed_bids||[]).filter(b=>b.user_id!==u.id);
      a.sealed_bids.push({user_id:u.id,amount});
      a.bidder_last_amounts[u.id]=amount;
      if(!a.participants.includes(u.id))a.participants.push(u.id);
      a.bids_count++;
      a.chats.push({system:true,text:`${u.username} ส่งราคาแบบซองแล้ว`});
    }else{
      const oldWinnerId=a.winner_id;
      const oldWinnerAmount=oldWinnerId?currentBidHoldAmount(a,oldWinnerId):0;
      if(oldWinnerId&&oldWinnerId!==u.id&&oldWinnerAmount>0){
        refundBidFunds(oldWinnerId,a.currency,oldWinnerAmount,'ถูกเสนอราคาสูงกว่า: '+a.title);
        a.bidder_last_amounts[oldWinnerId]=0;
      }
      const prevSelf=currentBidHoldAmount(a,u.id);
      holdBidFunds(u,a.currency,amount-prevSelf,'เสนอราคา: '+a.title);
      a.current_bid=amount;
      a.winner_id=u.id;
      a.last_bidder_id=u.id;
      a.bidder_last_amounts[u.id]=amount;
      if(!a.participants.includes(u.id))a.participants.push(u.id);
      a.bids_count++;
      a.chats.push({system:true,text:`${u.username} เสนอราคา ${amount} ${a.currency}`});
    }
    save();emitAuctionUpdate(a,'auction:bid');
    res.json({auction:au(a,u.id),user:pub(u)})
  }catch(e){res.status(400).json({error:e.message})}
});

function makeOrder(a,winner,price,fee,penaltyCompany,penaltySeller){
  let seller=user(a.seller_id);
  seller.trust_total_orders=(seller.trust_total_orders||0)+1;
  const created=now();
  let o={
    id:nid('order'),auction_id:a.id,item_title:a.title,buyer_id:winner.id,seller_id:a.seller_id,
    amount:Number(price),currency:a.currency,service_fee:Number(fee||0),locked_amount:Number(price),status:'WAIT_SHIPPING',escrow_status:'HELD',escrow_version:'v2',
    buyer_confirmed:false,seller_confirmed:false,shipping_company:'',tracking_number:'',delivery_note:'',
    delivery_deadline:created+3*86400e3,buyer_confirm_deadline:created+7*86400e3,auto_release_eligible_at:created+7*86400e3,
    created_at:created,updated_at:created,vip_penalty_company:penaltyCompany||0,seller_vip_penalty_income:penaltySeller||0,timeline:[],audit_refs:[]
  };
  db.orders.unshift(o);
  db.escrow.unshift({id:nid('escrow'),order_id:o.id,amount:price,currency:a.currency,status:'HELD',type:'HOLD',created_at:created,note:'Escrow V2: พักเงินผู้ชนะประมูล'});
  escrowEvent(o,'HOLD',winner.id,'พักเงินผู้ชนะประมูล',{auction_id:a.id,price,fee});
  audit(winner.id,'ESCROW_HOLD','order',o.id,{amount:price,currency:a.currency,auction_id:a.id});
  emitOrderUpdate(o);
  return o;
}
function refundNonWinningHolds(a,wid){
  Object.entries(a.bidder_last_amounts||{}).forEach(([uid,amt])=>{
    uid=Number(uid);amt=Number(amt||0);
    if(uid!==Number(wid)&&amt>0){refundBidFunds(uid,a.currency,amt,'คืนเงินผู้ไม่ชนะประมูล: '+a.title);a.bidder_last_amounts[uid]=0;}
  });
}
function closeAuction(a){
  if(a.status==='closed')return db.winners.find(w=>w.auction_id===a.id)||{auction_id:a.id,item_title:a.title,price:a.current_bid,currency:a.currency};
  let wid=a.winner_id,price=a.current_bid;
  if(a.method==='sealed'&&a.sealed_bids?.length){let b=a.sealed_bids.sort((x,y)=>y.amount-x.amount)[0];wid=b.user_id;price=b.amount;a.winner_id=wid;a.current_bid=price;}
  let w=user(wid),s=user(a.seller_id),fee=0,pc=0,ps=0;
  if(w&&price>0){
    refundNonWinningHolds(a,wid);
    a.bidder_last_amounts[wid]=price;
    fee=Math.round(price*(a.currency==='credit'?(vip(s)?.04:.07):(a.currency==='coin'?.25:0)));
    if(fee)db.company_revenue.unshift({amount:fee,currency:a.currency,type:'ค่าบริการ Escrow',created_at:now()});
    if(a.level==='vip'&&a.method==='forward'&&a.vip_entry_fee_percent){
      let total=0;
      Object.entries(a.bidder_last_amounts).forEach(([uid,amt])=>{if(Number(uid)!==Number(wid)){let p=Math.round(Number(amt||0)*a.vip_entry_fee_percent/100);if(p){bal(Number(uid),'credit',-p,'Credit ประมูล VIP',a.title);total+=p}}});
      pc=Math.round(total/2);ps=total-pc;if(pc)db.company_revenue.unshift({amount:pc,currency:'credit',type:'ส่วนแบ่ง VIP',created_at:now()});
    }
    makeOrder(a,w,price,fee,pc,ps);
  }else{
    refundNonWinningHolds(a,null);
  }
  a.status='closed';
  const winnerRow={id:nid('winner'),auction_id:a.id,item_title:a.title,level:a.level,winner_name:w?.username||'ไม่มีผู้ชนะ',price,currency:a.currency,service_fee:fee,vip_penalty_company:pc,closed_at:now()};
  db.winners.unshift(winnerRow);save();emitAuctionUpdate(a,'auction:closed');return winnerRow;
}

app.get('/api/orders',need,(req,res)=>{
  let uid=req.session.userId,t=req.query.type||'all',rows=db.orders.filter(o=>t==='buy'?o.buyer_id==uid:t==='sell'?o.seller_id==uid:(o.buyer_id==uid||o.seller_id==uid));
  res.json({orders:rows.map(orderPublic)})
});
app.post('/api/orders/:id/ship',need,(req,res)=>{
  let o=db.orders.find(x=>x.id==req.params.id);if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
  if(o.seller_id!=req.session.userId)return res.status(403).json({error:'เฉพาะผู้ขาย'});
  if(!['WAIT_SHIPPING','SHIPPED'].includes(o.status))return res.status(400).json({error:'สถานะนี้ไม่สามารถแจ้งจัดส่งได้'});
  o.shipping_company=String(req.body.shipping_company||'');o.tracking_number=String(req.body.tracking_number||'');o.delivery_note=String(req.body.delivery_note||'');
  o.status='SHIPPED';o.seller_confirmed=true;o.shipped_at=now();o.updated_at=now();escrowEvent(o,'SELLER_SHIPPED',req.session.userId,'ผู้ขายแจ้งจัดส่ง',{shipping_company:o.shipping_company,tracking_number:o.tracking_number});audit(req.session.userId,'ORDER_SHIPPED','order',o.id,{shipping_company:o.shipping_company,tracking_number:o.tracking_number});save();emitOrderUpdate(o);res.json({order:orderPublic(o)})
});
function release(o,by='system',actor_id=null,note=''){
  if(!o)throw Error('ไม่พบคำสั่งซื้อ');
  if(o.status==='COMPLETED')return o;
  if(o.status==='REFUNDED')throw Error('รายการนี้คืนเงินแล้ว');
  assertHeld(o);
  if(by!=='admin' && !(o.buyer_confirmed&&o.seller_confirmed))throw Error('ต้องให้ผู้ซื้อและผู้ขายยืนยันครบก่อนปล่อยเงิน');
  let s=user(o.seller_id);
  const payout=Number(o.amount||0)-Number(o.service_fee||0);
  if(payout<0)throw Error('ยอดจ่ายผู้ขายผิดปกติ');
  bal(s.id,o.currency,payout,'รับเงิน Escrow',o.item_title,{ref_type:'order',ref_id:o.id});
  if(o.seller_vip_penalty_income)bal(s.id,'credit',o.seller_vip_penalty_income,'รับ Credit ประมูล VIP',o.item_title,{ref_type:'order',ref_id:o.id});
  s.trust_completed_sales=(s.trust_completed_sales||0)+1;
  o.status='COMPLETED';o.escrow_status='RELEASED';o.released_at=now();o.resolved_by=by;o.resolved_by_user_id=actor_id;o.resolution_note=note||'';o.updated_at=now();
  const held=db.escrow.find(e=>e.order_id==o.id&&e.status==='HELD');if(held){held.status='RELEASED';held.updated_at=now()}
  db.escrow.push({id:nid('escrow'),order_id:o.id,amount:o.amount,currency:o.currency,status:'RELEASED',type:'RELEASE',created_at:now(),note:'Escrow V2: ปล่อยเงินให้ผู้ขาย'});
  escrowEvent(o,'RELEASE',actor_id,note||'ปล่อยเงินให้ผู้ขาย',{payout,service_fee:o.service_fee,by});audit(actor_id,'ESCROW_RELEASE','order',o.id,{payout,service_fee:o.service_fee,by,note});
  emitOrderUpdate(o);return o;
}
function refundOrder(o,by='admin',actor_id=null,note=''){
  if(!o)throw Error('ไม่พบคำสั่งซื้อ');
  if(o.status==='REFUNDED')return o;
  if(o.status==='COMPLETED')throw Error('รายการนี้ปล่อยเงินแล้ว');
  assertHeld(o);
  bal(o.buyer_id,o.currency,o.amount,'คืนเงิน Escrow',o.item_title,{ref_type:'order',ref_id:o.id});
  o.status='REFUNDED';o.escrow_status='REFUNDED';o.refunded_at=now();o.resolved_by=by;o.resolved_by_user_id=actor_id;o.resolution_note=note||'';o.updated_at=now();
  const held=db.escrow.find(e=>e.order_id==o.id&&e.status==='HELD');if(held){held.status='REFUNDED';held.updated_at=now()}
  db.escrow.push({id:nid('escrow'),order_id:o.id,amount:o.amount,currency:o.currency,status:'REFUNDED',type:'REFUND',created_at:now(),note:'Escrow V2: คืนเงินให้ผู้ซื้อ'});
  escrowEvent(o,'REFUND',actor_id,note||'คืนเงินให้ผู้ซื้อ',{amount:o.amount,by});audit(actor_id,'ESCROW_REFUND','order',o.id,{amount:o.amount,by,note});
  emitOrderUpdate(o);return o;
}
app.post('/api/orders/:id/confirm',need,(req,res)=>{
  try{
    let o=db.orders.find(x=>x.id==req.params.id);if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
    if(o.status==='DISPUTE')return res.status(400).json({error:'รายการอยู่ระหว่างข้อพิพาท ต้องให้ Admin ตัดสิน'});
    if(o.buyer_id==req.session.userId){o.buyer_confirmed=true;escrowEvent(o,'BUYER_CONFIRMED',req.session.userId,'ผู้ซื้อยืนยันรับสินค้า')}
    else if(o.seller_id==req.session.userId){o.seller_confirmed=true;escrowEvent(o,'SELLER_CONFIRMED',req.session.userId,'ผู้ขายยืนยันการส่งมอบ')}
    else return res.status(403).json({error:'ไม่มีสิทธิ์'});
    if(o.buyer_confirmed&&o.seller_confirmed)release(o,'both_confirmed',req.session.userId,'ทั้งสองฝ่ายยืนยันครบ');
    else if(o.status==='SHIPPED')o.status='DELIVERED';
    o.updated_at=now();save();emitOrderUpdate(o);res.json({order:o})
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/orders/:id/dispute',need,up.array('files',6),(req,res)=>{
  let o=db.orders.find(x=>x.id==req.params.id);if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
  if(![o.buyer_id,o.seller_id].includes(req.session.userId))return res.status(403).json({error:'ไม่มีสิทธิ์'});
  if(['COMPLETED','REFUNDED'].includes(o.status))return res.status(400).json({error:'รายการนี้จบแล้ว'});
  let d={id:nid('dispute'),order_id:o.id,opened_by:req.session.userId,reason:req.body.reason||'',evidence:(req.files||[]).map(f=>'/uploads/'+f.filename),status:'OPEN',admin_note:'',created_at:now(),updated_at:now()};
  db.disputes.unshift(d);o.status='DISPUTE';o.dispute_id=d.id;o.updated_at=now();escrowEvent(o,'DISPUTE_OPENED',req.session.userId,d.reason,{evidence:d.evidence});audit(req.session.userId,'DISPUTE_OPENED','order',o.id,{reason:d.reason,evidence_count:d.evidence.length});save();emitOrderUpdate(o);res.json({dispute:d})
});

function fdata(file){let ext=path.extname(file.path).toLowerCase(),mime=ext=='.png'?'image/png':ext=='.webp'?'image/webp':'image/jpeg';return `data:${mime};base64,${fs.readFileSync(file.path).toString('base64')}`}
function parseVisionJSON(txt){try{return JSON.parse(txt)}catch(e){}let m=String(txt||'').match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch(e){}}return null}
async function gptVisionEstimate(req,photos){if(!process.env.OPENAI_API_KEY)return null;let files=req.files||[];let prompt=`คุณคือ AI วิเคราะห์รูปสินค้าสำหรับเว็บประมูล BidMarket วิเคราะห์รูปสินค้าและประเมินราคากลาง ตอบกลับเป็น JSON เท่านั้น {"product_name":"","category":"","condition_summary":"","visible_details":[""],"risk_notes":[""],"estimated_min":0,"estimated_mid":0,"estimated_max":0,"confidence":"ต่ำ/ปานกลาง/สูง","recommended_start_price":0,"pricing_reason":""} ข้อมูลผู้ใช้: ชื่อสินค้า ${req.body.title||''}, หมวดหมู่ ${req.body.category||''}, สภาพ ${req.body.condition||''}, หมายเหตุ ${req.body.notes||''}`;let body={model:process.env.OPENAI_VISION_MODEL||'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...files.slice(0,6).map(f=>({type:'input_image',image_url:fdata(f)}))]}],max_output_tokens:1200};let r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.text()).slice(0,300));let j=await r.json();let txt=j.output_text||(j.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('\n');return parseVisionJSON(txt)}

app.post('/api/ai/price-estimate',need,up.array('photos',6),async(req,res)=>{try{let photos=(req.files||[]).map(f=>'/uploads/'+f.filename);if(photos.length<1||photos.length>6)return res.status(400).json({error:'ใส่รูป 1-6 รูป'});let v=null;try{v=await gptVisionEstimate(req,photos)}catch(err){console.warn('GPT Vision fallback:',err.message)}let e;if(v){e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title||v.product_name,category:req.body.category||v.category,photos,estimated_min:Number(v.estimated_min||0),estimated_max:Number(v.estimated_max||0),estimated_mid:Number(v.estimated_mid||0),confidence:v.confidence||'ปานกลาง',recommended_start_price:Number(v.recommended_start_price||v.estimated_min||0),source:'gpt_vision',analysis:[`ชื่อสินค้าที่ AI เห็น: ${v.product_name||'-'}`,`สภาพสินค้า: ${v.condition_summary||'-'}`,`เหตุผลราคา: ${v.pricing_reason||'-'}`,...(v.visible_details||[]).map(x=>'รายละเอียดที่เห็น: '+x),...(v.risk_notes||[]).map(x=>'จุดที่ควรตรวจสอบ: '+x)],raw_vision:v,created_at:now()}}else{let t=((req.body.title||'')+' '+(req.body.category||'')).toLowerCase(),base=t.includes('iphone')?20000:t.includes('rolex')?90000:t.includes('ps5')?12000:3000,min=Math.round(base*.75),max=Math.round(base*1.25);e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title,category:req.body.category,photos,estimated_min:min,estimated_max:max,estimated_mid:Math.round((min+max)/2),confidence:photos.length>=4?'สูง':photos.length>=2?'ปานกลาง':'เบื้องต้น',recommended_start_price:min,source:'mock',analysis:['ยังไม่ได้ตั้งค่า OPENAI_API_KEY จึงใช้ Mock Estimate','เมื่อตั้งค่า OPENAI_API_KEY ใน Render ระบบจะใช้ GPT Vision วิเคราะห์รูปสินค้าจริง'],created_at:now()}}db.estimates.unshift(e);save();res.json({estimate:e})}catch(e){res.status(500).json({error:e.message})}});app.get('/api/ai/price-estimates',need,(req,res)=>res.json({estimates:db.estimates.filter(e=>e.user_id==req.session.userId)}));
app.get('/api/favorites',need,(req,res)=>{let ids=db.favorites.filter(f=>f.user_id==req.session.userId).map(f=>f.auction_id);res.json({favorite_ids:ids,auctions:db.auctions.filter(a=>ids.includes(a.id)&&a.status=='active').map(a=>au(a,req.session.userId))})});app.post('/api/favorites/:id',need,(req,res)=>{let id=Number(req.params.id);if(!db.favorites.find(f=>f.user_id==req.session.userId&&f.auction_id==id))db.favorites.push({user_id:req.session.userId,auction_id:id});save();res.json({ok:true})});app.delete('/api/favorites/:id',need,(req,res)=>{db.favorites=db.favorites.filter(f=>!(f.user_id==req.session.userId&&f.auction_id==req.params.id));save();res.json({ok:true})});
app.get('/api/admin/escrow',admin,(req,res)=>res.json({
  held:db.orders.filter(o=>!['COMPLETED','REFUNDED'].includes(o.status)).reduce((s,o)=>s+Number(o.amount||0),0),
  waitShipping:db.orders.filter(o=>o.status==='WAIT_SHIPPING').length,
  shipped:db.orders.filter(o=>['SHIPPED','DELIVERED'].includes(o.status)).length,
  disputes:db.orders.filter(o=>o.status==='DISPUTE').length,
  completed:db.orders.filter(o=>o.status==='COMPLETED').length,
  refunded:db.orders.filter(o=>o.status==='REFUNDED').length,
  orders:db.orders.map(orderPublic),events:(db.escrow_events||[]).slice(0,100),audit_logs:(db.audit_logs||[]).slice(0,100)
}));
app.post('/api/admin/orders/:id/release',admin,(req,res)=>{try{let o=db.orders.find(x=>x.id==req.params.id);release(o,'admin',req.session.userId,req.body.note||'Admin อนุมัติปล่อยเงิน');const d=db.disputes.find(x=>x.id==o.dispute_id);if(d){d.status='RESOLVED_RELEASED';d.admin_note=req.body.note||'';d.updated_at=now()}save();res.json({order:orderPublic(o)})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/admin/orders/:id/refund',admin,(req,res)=>{try{let o=db.orders.find(x=>x.id==req.params.id);refundOrder(o,'admin',req.session.userId,req.body.note||'Admin อนุมัติคืนเงิน');const d=db.disputes.find(x=>x.id==o.dispute_id);if(d){d.status='RESOLVED_REFUNDED';d.admin_note=req.body.note||'';d.updated_at=now()}save();res.json({order:orderPublic(o)})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/orders/:id/audit',need,(req,res)=>{const o=db.orders.find(x=>x.id==req.params.id);try{assertOrderParticipant(o,req.session.userId);res.json({events:(db.escrow_events||[]).filter(e=>e.order_id==o.id),audit:(db.audit_logs||[]).filter(a=>a.target_type==='order'&&a.target_id==o.id)})}catch(e){res.status(403).json({error:e.message})}});
app.get('/api/admin/audit-logs',admin,(req,res)=>res.json({audit_logs:(db.audit_logs||[]).slice(0,300),escrow_events:(db.escrow_events||[]).slice(0,300)}));
app.get('/api/admin/escrow/health',admin,(req,res)=>{const heldOrders=db.orders.filter(o=>o.escrow_status==='HELD'&&ESCROW_ACTIVE.has(o.status));const ledgerHeld=(db.escrow||[]).filter(e=>e.status==='HELD').reduce((s,e)=>s+Number(e.amount||0),0);const orderHeld=heldOrders.reduce((s,o)=>s+Number(o.amount||0),0);res.json({ok:ledgerHeld===orderHeld,held_orders:heldOrders.length,ledger_held:ledgerHeld,order_held:orderHeld,terminal_orders:db.orders.filter(o=>ESCROW_TERMINAL.has(o.status)).length})});
app.get('/api/admin/summary',admin,(req,res)=>res.json({active:{general:db.auctions.filter(a=>a.status=='active'&&a.level=='general').length,vip:db.auctions.filter(a=>a.status=='active'&&a.level=='vip').length,total:db.auctions.filter(a=>a.status=='active').length},total_revenue:db.company_revenue.reduce((s,r)=>s+r.amount,0),monthly_revenue:{},closed_count:db.winners.length}));app.get('/api/admin/closed-auctions',admin,(req,res)=>res.json({rows:db.winners,total:db.winners.length}));app.get('/api/admin/users',admin,(req,res)=>res.json({users:db.users.map(pub)}));

function reviewAuctionDetails(order){
  const a=db.auctions.find(x=>x.id==order.auction_id)||{};
  const seller=user(order.seller_id), buyer=user(order.buyer_id);
  return {
    order_id:order.id,
    auction_id:order.auction_id,
    item_title:order.item_title||a.title||'-',
    description:a.description||order.description||'',
    category:a.category||'',
    level:a.level||'',
    method:a.method||'',
    seller_id:order.seller_id,
    seller_name:seller?.username||'-',
    buyer_id:order.buyer_id,
    winner_id:order.buyer_id,
    winner_name:buyer?.username||'-',
    close_price:order.amount,
    final_price:order.amount,
    currency:order.currency||a.currency||'credit',
    status:order.status,
    success:order.status==='COMPLETED',
    created_at:order.created_at,
    released_at:order.released_at||null,
    shipping_company:order.shipping_company||'',
    tracking_number:order.tracking_number||'',
    image_url:a.image_url||'',
    seller_success_rate:trust(seller),
    buyer_success_rate:trust(buyer)
  };
}
function reviewSummaryFor(uid){
  const rows=db.orders.filter(o=>o.buyer_id==uid||o.seller_id==uid);
  const completed=rows.filter(o=>o.status==='COMPLETED').length;
  return {bought_count:rows.filter(o=>o.buyer_id==uid).length,sold_count:rows.filter(o=>o.seller_id==uid).length,total_trades:rows.length,completed_trades:completed,success_rate:rows.length?Math.round(completed/rows.length*100):0};
}
app.get('/api/reviews/users',(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  const matchedOrderUserIds=new Set();
  if(q){
    db.orders.forEach(o=>{
      const a=db.auctions.find(x=>x.id==o.auction_id)||{};
      const hay=[o.item_title,a.title,a.description,a.category,String(o.id),String(o.auction_id)].join(' ').toLowerCase();
      if(hay.includes(q)){matchedOrderUserIds.add(o.buyer_id);matchedOrderUserIds.add(o.seller_id)}
    });
  }
  let rows=db.users.filter(u=>{
    const hasTrade=db.orders.some(o=>o.buyer_id==u.id||o.seller_id==u.id);
    if(!q)return hasTrade || u.trust_total_orders>0 || u.trust_completed_sales>0;
    const uh=[u.username,u.display_name,u.email,String(u.id),'#'+u.id,'ID '+u.id].join(' ').toLowerCase();
    return uh.includes(q)||matchedOrderUserIds.has(u.id);
  }).map(u=>({...pub(u),...reviewSummaryFor(u.id)}));
  rows.sort((a,b)=>(b.total_trades-a.total_trades)||(b.success_rate-a.success_rate)||a.id-b.id);
  res.json({users:rows});
});
app.get('/api/reviews/users/:id',(req,res)=>{
  const u=user(Number(req.params.id));
  if(!u)return res.status(404).json({error:'ไม่พบผู้ใช้'});
  const history=db.orders.filter(o=>o.buyer_id==u.id||o.seller_id==u.id).map(reviewAuctionDetails).sort((a,b)=>(b.created_at||0)-(a.created_at||0));
  res.json({user:pub(u),summary:reviewSummaryFor(u.id),history});
});


app.get('/api/messages/:userId',need,(req,res)=>{
  const meId=req.session.userId;
  const otherId=Number(req.params.userId);
  if(!user(otherId))return res.status(404).json({error:'ไม่พบผู้ใช้'});
  const messages=db.messages.filter(m=>(m.from_id==meId&&m.to_id==otherId)||(m.from_id==otherId&&m.to_id==meId)).sort((a,b)=>(a.created_at||0)-(b.created_at||0)).map(m=>({...m,from_name:user(m.from_id)?.display_name||user(m.from_id)?.username||'ผู้ใช้'}));
  res.json({messages});
});
app.post('/api/messages/:userId',need,(req,res)=>{
  const meId=req.session.userId;
  const otherId=Number(req.params.userId);
  if(!user(otherId))return res.status(404).json({error:'ไม่พบผู้ใช้'});
  const text=String(req.body.text||'').trim();
  if(!text)return res.status(400).json({error:'กรุณาพิมพ์ข้อความ'});
  const msg={id:nid('msg'),from_id:meId,to_id:otherId,text,created_at:now(),read:false};
  db.messages.push(msg);save();res.json({message:msg});
});

app.get('/api/transactions',need,(req,res)=>res.json({transactions:db.transactions.filter(t=>t.user_id==req.session.userId)}));app.get('*',(_,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
load().then(initialDb=>{db=initialDb;serverHttp.listen(PORT,()=>console.log('BidMarket Persistent DB '+(USE_POSTGRES?'PostgreSQL':'JSON local')+' http://localhost:'+PORT));}).catch(err=>{console.error('Cannot start server:',err);process.exit(1);});
