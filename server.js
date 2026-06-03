require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), fs=require('fs'), path=require('path'), multer=require('multer'), {v4:uuid}=require('uuid');
const app=express(), PORT=process.env.PORT||3000, dataDir=path.join(__dirname,'data'), dbFile=path.join(dataDir,'db.json'), uploadDir=path.join(__dirname,'public','uploads');
const http=require('http');
const serverHttp=http.createServer(app);
const {Server}=require('socket.io');
const io=new Server(serverHttp);
const auctionApi=(a)=>au(a);
fs.mkdirSync(dataDir,{recursive:true}); fs.mkdirSync(uploadDir,{recursive:true});
const now=()=>Date.now(), img='https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1200&auto=format&fit=crop';
function fresh(){const h=bcrypt.hashSync('1234',10);return {next:{user:3,auc:3,tx:1,order:1,escrow:1,dispute:1,estimate:1,ad:1},users:[{id:1,username:'demo',email:'demo@x.local',password_hash:h,role:'admin',status:'active',display_name:'Demo Admin',avatar_url:'',bio:'',coin:5e6,credit:50000,token:20,vip_until:now()+31536e6,trust_completed_sales:0,trust_total_orders:0},{id:2,username:'seller',email:'seller@x.local',password_hash:h,role:'user',status:'active',display_name:'VIP Seller',avatar_url:'',bio:'',coin:2e6,credit:30000,token:5,vip_until:now()+15552e6,trust_completed_sales:0,trust_total_orders:0}],auctions:[{id:1,seller_id:2,level:'vip',method:'forward',currency:'credit',title:'Rolex Submariner Vintage',description:'ตัวอย่าง VIP + Escrow',category:'ของสะสม',image_url:'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:10000,current_bid:10000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+7200e3,status:'active',vip_entry_min_credit:7000,vip_entry_fee_percent:5},{id:2,seller_id:1,level:'general',method:'forward',currency:'credit',title:'iPhone 15 Pro Max',description:'ตัวอย่างประมูลทั่วไป + Escrow',category:'มือถือ',image_url:'https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:20000,current_bid:20000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+86400e3,status:'active',vip_entry_min_credit:0,vip_entry_fee_percent:0}],orders:[],escrow:[],disputes:[],transactions:[],favorites:[],messages:[],estimates:[],ads:[],company_revenue:[],winners:[]}}
function load(){if(!fs.existsSync(dbFile))fs.writeFileSync(dbFile,JSON.stringify(fresh(),null,2));let d=JSON.parse(fs.readFileSync(dbFile));['orders','escrow','disputes','transactions','favorites','messages','estimates','ads','company_revenue','winners','payments'].forEach(k=>d[k]||(d[k]=[]));d.users.forEach(u=>{u.trust_completed_sales??=0;u.trust_total_orders??=0;u.avatar_url??='';u.display_name??=u.username;u.role??='user';u.status??='active'});return d}let db=load();const save=()=>fs.writeFileSync(dbFile,JSON.stringify(db,null,2));const nid=k=>(db.next[k]=db.next[k]||1,db.next[k]++);const user=id=>db.users.find(u=>u.id==id);const uname=n=>db.users.find(u=>u.username==n);const vip=u=>u&&u.vip_until>now();const trust=u=>u&&u.trust_total_orders?Math.round(u.trust_completed_sales/u.trust_total_orders*100):0;
function pub(u){return u&&{id:u.id,username:u.username,email:u.email,role:u.role,status:u.status,display_name:u.display_name,avatar_url:u.avatar_url,bio:u.bio||'',coin:u.coin,credit:u.credit,token:u.token,is_vip:vip(u),vip_until:u.vip_until,trust_rate:trust(u),trust_completed_sales:u.trust_completed_sales,trust_total_orders:u.trust_total_orders}}
function au(a,viewer){return {...a,seller_name:user(a.seller_id)?.username,seller_trust_rate:trust(user(a.seller_id)),is_started:now()>=a.start_at,time_until_start:Math.max(0,a.start_at-now()),participant_count:Object.keys(a.bidder_last_amounts||{}).length,winner_name:a.winner_id?user(a.winner_id)?.username:null,viewer_vip_entry:(a.vip_entries||[]).find(e=>e.user_id==viewer)||null}}
function need(req,res,next){if(!req.session.userId)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});let u=user(req.session.userId);if(!u||u.status!=='active')return res.status(403).json({error:'บัญชีถูกระงับ'});next()}function admin(req,res,next){let u=user(req.session.userId);if(!u||u.role!='admin')return res.status(403).json({error:'เฉพาะ Admin'});next()}
function tx(uid,type,amount,currency,note=''){db.transactions.unshift({id:nid('tx'),user_id:uid,type,amount,currency,note,created_at:now()})}function bal(uid,c,delta,type,note=''){let u=user(uid);if(!u)throw Error('ไม่พบผู้ใช้');if((u[c]||0)+delta<0)throw Error('ยอดเงินไม่พอ');u[c]=(u[c]||0)+delta;tx(uid,type,delta,c,note)}

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

app.use(express.json({limit:'25mb'}));app.use(express.urlencoded({extended:true}));app.use(session({secret:process.env.SESSION_SECRET||'dev',resave:false,saveUninitialized:false,cookie:{maxAge:6048e5}}));app.use(express.static(path.join(__dirname,'public')));app.use('/uploads',express.static(uploadDir));const up=multer({storage:multer.diskStorage({destination:(_,__,cb)=>cb(null,uploadDir),filename:(_,f,cb)=>cb(null,Date.now()+'-'+uuid()+path.extname(f.originalname))}),limits:{fileSize:50*1024*1024}});
app.post('/api/register',(req,res)=>{let {username,email,password}=req.body;if(!username||!email||!password)return res.status(400).json({error:'กรอกข้อมูลให้ครบ'});if(uname(username))return res.status(400).json({error:'ชื่อซ้ำ'});let u={id:nid('user'),username,email,password_hash:bcrypt.hashSync(password,10),role:'user',status:'active',display_name:username,avatar_url:'',bio:'',coin:0,credit:0,token:0,vip_until:0,trust_completed_sales:0,trust_total_orders:0};db.users.push(u);req.session.userId=u.id;save();res.json({user:pub(u)})});
app.post('/api/login',(req,res)=>{let u=uname(req.body.username);if(!u||!bcrypt.compareSync(req.body.password||'',u.password_hash))return res.status(401).json({error:'ผิด'});req.session.userId=u.id;res.json({user:pub(u)})});app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));app.get('/api/me',(req,res)=>res.json({user:pub(user(req.session.userId))}));
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
app.post('/api/auctions/:id/bid',need,(req,res)=>{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);try{if(now()<a.start_at)throw Error('ยังไม่เริ่ม');if(a.seller_id==u.id)throw Error('ประมูลของตัวเองไม่ได้');if(a.level=='vip'&&!a.vip_entries.find(e=>e.user_id==u.id))throw Error('กรุณาเข้าร่วม VIP ก่อน');let amount=Number(req.body.amount);if(a.method!='sealed'&&amount<=a.current_bid)throw Error('ต้องสูงกว่าปัจจุบัน');bal(u.id,a.currency,-(a.method=='sealed'?amount:amount-a.current_bid),a.method=='sealed'?'ส่งซอง':'เสนอราคา',a.title);if(a.method=='sealed'){(a.sealed_bids||(a.sealed_bids=[])).push({user_id:u.id,amount})}else{a.current_bid=amount;a.winner_id=u.id;a.last_bidder_id=u.id}a.bidder_last_amounts[u.id]=amount;a.bids_count++;a.chats.push({system:true,text:`${u.username} เสนอราคา ${amount} ${a.currency}`});save();res.json({auction:au(a,u.id),user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});
function makeOrder(a,winner,price,fee,penaltyCompany,penaltySeller){let seller=user(a.seller_id);seller.trust_total_orders=(seller.trust_total_orders||0)+1;let o={id:nid('order'),auction_id:a.id,item_title:a.title,buyer_id:winner.id,seller_id:a.seller_id,amount:price,currency:a.currency,service_fee:fee,status:'WAIT_SHIPPING',buyer_confirmed:false,seller_confirmed:false,shipping_company:'',tracking_number:'',created_at:now(),vip_penalty_company:penaltyCompany||0,seller_vip_penalty_income:penaltySeller||0};db.orders.unshift(o);db.escrow.unshift({id:nid('escrow'),order_id:o.id,amount:price,currency:a.currency,status:'HELD',type:'HOLD',created_at:now()});return o}
function closeAuction(a){let wid=a.winner_id,price=a.current_bid;if(a.method=='sealed'&&a.sealed_bids?.length){let b=a.sealed_bids.sort((x,y)=>y.amount-x.amount)[0];wid=b.user_id;price=b.amount}let w=user(wid),s=user(a.seller_id),fee=0,pc=0,ps=0;if(w&&price>0){fee=Math.round(price*(a.currency=='credit'?(vip(s)?.04:.07):(a.currency=='coin'?.25:0)));if(fee)db.company_revenue.unshift({amount:fee,currency:a.currency,type:'ค่าบริการ',created_at:now()});if(a.level=='vip'&&a.method=='forward'&&a.vip_entry_fee_percent){let total=0;Object.entries(a.bidder_last_amounts).forEach(([uid,amt])=>{if(Number(uid)!=wid){let p=Math.round(Number(amt)*a.vip_entry_fee_percent/100);if(p){bal(Number(uid),'credit',-p,'Credit ประมูล VIP',a.title);total+=p}}});pc=Math.round(total/2);ps=total-pc;if(pc)db.company_revenue.unshift({amount:pc,currency:'credit',type:'ส่วนแบ่ง VIP',created_at:now()})}makeOrder(a,w,price,fee,pc,ps)}a.status='closed';db.winners.unshift({id:nid('winner'),auction_id:a.id,item_title:a.title,level:a.level,winner_name:w?.username||'ไม่มีผู้ชนะ',price,currency:a.currency,service_fee:fee,vip_penalty_company:pc,closed_at:now()});save();return db.winners[0]}
app.post('/api/auctions/:id/close',need,(req,res)=>{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)return res.status(404).json({error:'ไม่พบ'});if(a.seller_id!=u.id&&u.role!='admin')return res.status(403).json({error:'ไม่มีสิทธิ์'});res.json({result:closeAuction(a)})});
app.get('/api/orders',need,(req,res)=>{let uid=req.session.userId,t=req.query.type||'all',rows=db.orders.filter(o=>t=='buy'?o.buyer_id==uid:t=='sell'?o.seller_id==uid:(o.buyer_id==uid||o.seller_id==uid));res.json({orders:rows.map(o=>({...o,buyer:pub(user(o.buyer_id)),seller:pub(user(o.seller_id))}))})});
app.post('/api/orders/:id/ship',need,(req,res)=>{let o=db.orders.find(x=>x.id==req.params.id);if(o.seller_id!=req.session.userId)return res.status(403).json({error:'เฉพาะผู้ขาย'});o.shipping_company=req.body.shipping_company;o.tracking_number=req.body.tracking_number;o.status='SHIPPED';save();res.json({order:o})});function release(o){if(o.status=='COMPLETED')return;let s=user(o.seller_id);bal(s.id,o.currency,o.amount-o.service_fee,'รับเงิน Escrow',o.item_title);if(o.seller_vip_penalty_income)bal(s.id,'credit',o.seller_vip_penalty_income,'รับ Credit ประมูล VIP',o.item_title);s.trust_completed_sales=(s.trust_completed_sales||0)+1;o.status='COMPLETED';o.released_at=now();db.escrow.push({id:nid('escrow'),order_id:o.id,amount:o.amount,currency:o.currency,status:'RELEASED',type:'RELEASE',created_at:now()})}
app.post('/api/orders/:id/confirm',need,(req,res)=>{let o=db.orders.find(x=>x.id==req.params.id);if(o.buyer_id==req.session.userId)o.buyer_confirmed=true;else if(o.seller_id==req.session.userId)o.seller_confirmed=true;else return res.status(403).json({error:'ไม่มีสิทธิ์'});if(o.buyer_confirmed&&o.seller_confirmed)release(o);else if(o.status=='SHIPPED')o.status='DELIVERED';save();res.json({order:o})});app.post('/api/orders/:id/dispute',need,up.array('files',6),(req,res)=>{let o=db.orders.find(x=>x.id==req.params.id);let d={id:nid('dispute'),order_id:o.id,opened_by:req.session.userId,reason:req.body.reason,evidence:(req.files||[]).map(f=>'/uploads/'+f.filename),status:'OPEN',created_at:now()};db.disputes.unshift(d);o.status='DISPUTE';o.dispute_id=d.id;save();res.json({dispute:d})});

function fdata(file){let ext=path.extname(file.path).toLowerCase(),mime=ext=='.png'?'image/png':ext=='.webp'?'image/webp':'image/jpeg';return `data:${mime};base64,${fs.readFileSync(file.path).toString('base64')}`}
function parseVisionJSON(txt){try{return JSON.parse(txt)}catch(e){}let m=String(txt||'').match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch(e){}}return null}
async function gptVisionEstimate(req,photos){if(!process.env.OPENAI_API_KEY)return null;let files=req.files||[];let prompt=`คุณคือ AI วิเคราะห์รูปสินค้าสำหรับเว็บประมูล BidMarket วิเคราะห์รูปสินค้าและประเมินราคากลาง ตอบกลับเป็น JSON เท่านั้น {"product_name":"","category":"","condition_summary":"","visible_details":[""],"risk_notes":[""],"estimated_min":0,"estimated_mid":0,"estimated_max":0,"confidence":"ต่ำ/ปานกลาง/สูง","recommended_start_price":0,"pricing_reason":""} ข้อมูลผู้ใช้: ชื่อสินค้า ${req.body.title||''}, หมวดหมู่ ${req.body.category||''}, สภาพ ${req.body.condition||''}, หมายเหตุ ${req.body.notes||''}`;let body={model:process.env.OPENAI_VISION_MODEL||'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...files.slice(0,6).map(f=>({type:'input_image',image_url:fdata(f)}))]}],max_output_tokens:1200};let r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.text()).slice(0,300));let j=await r.json();let txt=j.output_text||(j.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('\n');return parseVisionJSON(txt)}

app.post('/api/ai/price-estimate',need,up.array('photos',6),async(req,res)=>{try{let photos=(req.files||[]).map(f=>'/uploads/'+f.filename);if(photos.length<1||photos.length>6)return res.status(400).json({error:'ใส่รูป 1-6 รูป'});let v=null;try{v=await gptVisionEstimate(req,photos)}catch(err){console.warn('GPT Vision fallback:',err.message)}let e;if(v){e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title||v.product_name,category:req.body.category||v.category,photos,estimated_min:Number(v.estimated_min||0),estimated_max:Number(v.estimated_max||0),estimated_mid:Number(v.estimated_mid||0),confidence:v.confidence||'ปานกลาง',recommended_start_price:Number(v.recommended_start_price||v.estimated_min||0),source:'gpt_vision',analysis:[`ชื่อสินค้าที่ AI เห็น: ${v.product_name||'-'}`,`สภาพสินค้า: ${v.condition_summary||'-'}`,`เหตุผลราคา: ${v.pricing_reason||'-'}`,...(v.visible_details||[]).map(x=>'รายละเอียดที่เห็น: '+x),...(v.risk_notes||[]).map(x=>'จุดที่ควรตรวจสอบ: '+x)],raw_vision:v,created_at:now()}}else{let t=((req.body.title||'')+' '+(req.body.category||'')).toLowerCase(),base=t.includes('iphone')?20000:t.includes('rolex')?90000:t.includes('ps5')?12000:3000,min=Math.round(base*.75),max=Math.round(base*1.25);e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title,category:req.body.category,photos,estimated_min:min,estimated_max:max,estimated_mid:Math.round((min+max)/2),confidence:photos.length>=4?'สูง':photos.length>=2?'ปานกลาง':'เบื้องต้น',recommended_start_price:min,source:'mock',analysis:['ยังไม่ได้ตั้งค่า OPENAI_API_KEY จึงใช้ Mock Estimate','เมื่อตั้งค่า OPENAI_API_KEY ใน Render ระบบจะใช้ GPT Vision วิเคราะห์รูปสินค้าจริง'],created_at:now()}}db.estimates.unshift(e);save();res.json({estimate:e})}catch(e){res.status(500).json({error:e.message})}});app.get('/api/ai/price-estimates',need,(req,res)=>res.json({estimates:db.estimates.filter(e=>e.user_id==req.session.userId)}));
app.get('/api/favorites',need,(req,res)=>{let ids=db.favorites.filter(f=>f.user_id==req.session.userId).map(f=>f.auction_id);res.json({favorite_ids:ids,auctions:db.auctions.filter(a=>ids.includes(a.id)&&a.status=='active').map(a=>au(a,req.session.userId))})});app.post('/api/favorites/:id',need,(req,res)=>{let id=Number(req.params.id);if(!db.favorites.find(f=>f.user_id==req.session.userId&&f.auction_id==id))db.favorites.push({user_id:req.session.userId,auction_id:id});save();res.json({ok:true})});app.delete('/api/favorites/:id',need,(req,res)=>{db.favorites=db.favorites.filter(f=>!(f.user_id==req.session.userId&&f.auction_id==req.params.id));save();res.json({ok:true})});
app.get('/api/admin/escrow',admin,(req,res)=>res.json({held:db.orders.filter(o=>!['COMPLETED','REFUNDED'].includes(o.status)).reduce((s,o)=>s+o.amount,0),waitShipping:db.orders.filter(o=>o.status=='WAIT_SHIPPING').length,shipped:db.orders.filter(o=>['SHIPPED','DELIVERED'].includes(o.status)).length,disputes:db.orders.filter(o=>o.status=='DISPUTE').length,orders:db.orders}));app.post('/api/admin/orders/:id/release',admin,(req,res)=>{let o=db.orders.find(x=>x.id==req.params.id);release(o);save();res.json({order:o})});app.post('/api/admin/orders/:id/refund',admin,(req,res)=>{let o=db.orders.find(x=>x.id==req.params.id);bal(o.buyer_id,o.currency,o.amount,'คืนเงิน Escrow',o.item_title);o.status='REFUNDED';save();res.json({order:o})});
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

app.get('/api/transactions',need,(req,res)=>res.json({transactions:db.transactions.filter(t=>t.user_id==req.session.userId)}));app.get('*',(_,res)=>res.sendFile(path.join(__dirname,'public','index.html')));serverHttp.listen(PORT,()=>console.log('BidMarket Escrow AI Trust http://localhost:'+PORT));
