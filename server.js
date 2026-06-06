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
  ['orders','escrow','disputes','transactions','favorites','messages','estimates','ads','ad_views','ad_checks','company_revenue','winners','payments','audit_logs','escrow_events','activities','activity_reports','activity_participants','reward_codes','reward_claims','topup_reward_claims','review_queue','fee_logs','pin_logs'].forEach(k=>d[k]||(d[k]=[]));
  d.next||(d.next={});
  ['user','auc','tx','order','escrow','dispute','estimate','ad','ad_view','msg','payment','audit','escrow_event','activity','activity_report','activity_participant','reward_code','reward_claim','topup_reward_claim','review_queue','fee_log','pin_log'].forEach(k=>d.next[k]||(d.next[k]=1));
  (d.users||[]).forEach(u=>{u.trust_completed_sales??=0;u.trust_total_orders??=0;u.avatar_url??='';u.display_name??=u.username;u.role??='user';u.status??='active';u.google_id??='';u.auth_provider??=(u.google_id?'google':'local');u.credit??=0;u.coin??=0;u.token??=0;u.vip_until??=0;u.vip_level??=(u.vip_until>now()?'Member':'Member');u.vip_points??=0;u.vip_coin_spent_for_silver??=0;u.vip_credit_spent_for_silver??=0;u.username_change_count??=0;u.elite_free_pin_month??='';u.lifetime_credit_topup??=0});
  (d.orders||[]).forEach(o=>{o.escrow_version??='v1';o.timeline??=[];o.audit_refs??=[];o.locked_amount??=Number(o.amount||0);o.service_fee??=Number(o.service_fee||0);o.escrow_status??=(['COMPLETED','REFUNDED'].includes(o.status)?o.status:'HELD')});
  (d.ads||[]).forEach(a=>{a.status??='active';a.reward_currency??='coin';a.reward_amount=Number(a.reward_amount||0);a.type??='video';a.view_seconds=Math.min(120,Math.max(10,Number(a.view_seconds||10)));a.cover_url??='';a.media_url??='';a.description??='';a.question??='';a.answer??='';a.created_at??=now();a.deleted_reason??='';a.reward_code??='';a.reward_code_trigger??='none';a.activity_link??=''});
  (d.ad_views||[]).forEach(v=>{v.rewarded??=false;v.completed??=false;v.answer_correct??=false;v.view_count=Number(v.view_count||1);v.started_at??=now()});
  (d.auctions||[]).forEach(a=>{a.method=normalizeAuctionMethod(a.method);a.currency=['credit','coin'].includes(a.currency)?a.currency:'credit';a.participants??=[];a.bidder_last_amounts??={};a.highest_bid_by_user??={...a.bidder_last_amounts};a.bid_history??=[];a.bid_fee=Number(a.bid_fee||0);a.countdown_seconds=Number(a.countdown_seconds||30);a.last_bid_at=Number(a.last_bid_at||0);a.fee_pool=Number(a.fee_pool||0);if(a.method==='fee'){a.start_price=0;a.current_bid=Number(a.current_bid||0)}});
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
const nid=k=>(db.next[k]=db.next[k]||1,db.next[k]++);const user=id=>db.users.find(u=>u.id==id);const uname=n=>db.users.find(u=>u.username==n);const trust=u=>u&&u.trust_total_orders?Math.round(u.trust_completed_sales/u.trust_total_orders*100):0;
function pub(u){if(!u)return null;const benefits=getVipBenefits(u);return {id:u.id,username:u.username,email:u.email,role:u.role,status:u.status,display_name:u.display_name,avatar_url:u.avatar_url,bio:u.bio||'',coin:u.coin,credit:u.credit,token:u.token,is_vip:vip(u),vip_until:u.vip_until,vip_level:currentVipLevel(u),vip_points:Number(u.vip_points||0),vip_coin_spent_for_silver:Number(u.vip_coin_spent_for_silver||0),vip_credit_spent_for_silver:Number(u.vip_credit_spent_for_silver||0),vip_benefits:benefits,username_change_count:Number(u.username_change_count||0),lifetime_credit_topup:Number(u.lifetime_credit_topup||0),trust_rate:trust(u),trust_completed_sales:u.trust_completed_sales,trust_total_orders:u.trust_total_orders,google_linked:!!u.google_id}}
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
    u={id:nid('user'),username:uniqueUsername(base),email,password_hash:'',role:isAdminEmail(email)?'admin':'user',status:'active',display_name:profile.name||base,avatar_url:profile.picture||'',bio:'',coin:0,credit:0,token:0,vip_until:0,vip_level:'Member',vip_points:0,vip_coin_spent_for_silver:0,vip_credit_spent_for_silver:0,username_change_count:0,lifetime_credit_topup:0,trust_completed_sales:0,trust_total_orders:0,google_id:profile.sub,auth_provider:'google',created_at:now()};
    db.users.push(u);
  }else{
    u.google_id=profile.sub;u.auth_provider=u.auth_provider||'google';u.email=email;
    if(profile.name&&!u.display_name)u.display_name=profile.name;
    if(profile.picture)u.avatar_url=profile.picture;
    if(isAdminEmail(email))u.role='admin';
  }
  return u;
}
function au(a,viewer){return {...a,...methodPublicInfo(a),seller_name:(user(a.seller_id)?.display_name||user(a.seller_id)?.username),seller_trust_rate:trust(user(a.seller_id)),is_started:now()>=a.start_at,time_until_start:Math.max(0,a.start_at-now()),participant_count:(a.participants||[]).length,winner_name:a.winner_id?(user(a.winner_id)?.display_name||user(a.winner_id)?.username):null,viewer_vip_entry:(a.vip_entries||[]).find(e=>e.user_id==viewer)||null}}
function need(req,res,next){if(!req.session.userId)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});let u=user(req.session.userId);if(!u||u.status!=='active')return res.status(403).json({error:'บัญชีถูกระงับ'});next()}function admin(req,res,next){let u=user(req.session.userId);if(!u||u.role!='admin')return res.status(403).json({error:'เฉพาะ Admin'});next()}
function tx(uid,type,amount,currency,note='',meta={}){let u=user(uid),before=meta.before_balance,after=meta.after_balance;db.transactions.unshift({id:nid('tx'),user_id:uid,type,amount,currency,note,before_balance:before,after_balance:after,ref_type:meta.ref_type||'',ref_id:meta.ref_id||'',created_at:now()})}
function audit(actor_id,action,target_type,target_id,details={}){const row={id:nid('audit'),actor_id:actor_id||null,actor_name:actor_id?(user(actor_id)?.username||'system'):'system',action,target_type,target_id,details,ip:details.ip||'',user_agent:details.user_agent||'',created_at:now()};db.audit_logs.unshift(row);return row}
function escrowEvent(order,type,actor_id,note='',details={}){const ev={id:nid('escrow_event'),order_id:order?.id||null,type,actor_id:actor_id||null,note,details,created_at:now()};db.escrow_events.unshift(ev);if(order){order.timeline=order.timeline||[];order.timeline.unshift(ev)}return ev}

const CREDIT_THB_RATE=6;
const CREDIT_TOPUP_MIN=10;
const COIN_PER_CREDIT=100;
const VIP_LEVEL_ORDER=['Member','Silver','Gold','Sapphire','Platinum','Diamond','Emerald','Elite'];
const VIP_NEXT_REQUIREMENT={Silver:2000,Gold:15000,Sapphire:50000,Platinum:200000,Diamond:500000,Emerald:1000000};
const VIP_SALE_FEE_RATE={Member:0.06,Silver:0.059,Gold:0.058,Sapphire:0.057,Platinum:0.055,Diamond:0.05,Emerald:0.045,Elite:0.04};
const VIP_ESCROW_CASHBACK={Member:0.05,Silver:0.07,Gold:0.10,Sapphire:0.15,Platinum:0.20,Diamond:0.25,Emerald:0.30,Elite:0.40};
const VIP_ACTIVITY_DISCOUNT={Member:0,Silver:0,Gold:0,Sapphire:0.10,Platinum:0.15,Diamond:0.15,Emerald:0.20,Elite:0.20};
const VIP_PLANS={monthly:{label:'30 วัน / 1 เดือน',days:30,price:75},quarterly:{label:'90 วัน / 3 เดือน',days:90,price:215},halfyear:{label:'180 วัน / 6 เดือน',days:180,price:420},yearly:{label:'365 วัน / 1 ปี',days:365,price:790}};
const REWARD_CODE_RE=/^[A-Za-z0-9]{1,64}$/;
function validRewardCode(code){return REWARD_CODE_RE.test(String(code||''));}
function randomRewardCode(len=16){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let out='';for(let i=0;i<len;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
function makeUniqueRewardCode(){let code;do{code=randomRewardCode(16)}while((db.reward_codes||[]).some(c=>c.code===code));return code;}
function normalizeActivityCategory(c){return ['auction','website','topup'].includes(c)?c:'auction'}
function publicActivity(a,uid){
  const creator=user(a.creator_id)||{};
  const claims=(db.reward_claims||[]).filter(c=>c.activity_id==a.id);
  const my=uid?claims.find(c=>c.user_id==uid):null;
  return {...a,category:normalizeActivityCategory(a.category),creator_name:a.creator_name||creator.display_name||creator.username||'ผู้จัดกิจกรรม',participants_count:(db.activity_participants||[]).filter(p=>p.activity_id==a.id).length,claims_count:claims.length,viewer:{claimed:!!my}};
}
function ensureSystemDefaults(){
  db.activities=db.activities||[];db.reward_codes=db.reward_codes||[];db.reward_claims=db.reward_claims||[];db.topup_reward_claims=db.topup_reward_claims||[];db.review_queue=db.review_queue||[];
  if(!db.activities.some(a=>a.system_key==='topup_credit_2026')){
    db.activities.unshift({id:nid('activity'),system_key:'topup_credit_2026',creator_id:1,creator_name:'Admin',title:'สะสม Credit 2026',description:'เมื่อเติม Credit สะสมถึงยอดที่กำหนด จะสามารถกดรับรางวัลได้ ยอดสะสมจะนับจาก Credit ที่เติมสำเร็จแล้ว แม้ใช้จ่ายไปแล้วก็ไม่หายจนกว่ากิจกรรมจะสิ้นสุดหรือลบ',condition:'เติม Credit สะสมตามขั้นที่กำหนด',category:'topup',days:365,starts_at:now(),ends_at:now()+365*86400e3,participants_limit:'unlimited',reward_enabled:true,fee:{amount:0,currency:'credit',days:0,discount_rate:1},status:'active',created_at:now(),topup_tiers:[{credit:3000,reward:'25,000 Coin',coin:25000},{credit:5000,reward:'40,000 Coin',coin:40000},{credit:10000,reward:'80,000 Coin',coin:80000},{credit:18000,reward:'150,000 Coin',coin:150000},{credit:30000,reward:'VIP ฟรี 1 เดือน',vip_days:30},{credit:50000,reward:'VIP ฟรี 2 เดือน',vip_days:60},{credit:100000,reward:'VIP ฟรี 3 เดือน',vip_days:90}]});
  }
}
function takeRewardCode(activity,user_id,source='activity'){
  const used=(db.reward_claims||[]).find(c=>c.activity_id==activity.id&&c.user_id==user_id&&c.source===source);
  if(used)return {already:true,code:used.code};
  let codeRow=(db.reward_codes||[]).find(c=>c.activity_id==activity.id && Number(c.used_count||0)<Number(c.use_limit||1));
  if(!codeRow && activity.reward_code){
    if(!validRewardCode(activity.reward_code))throw Error('โค้ดรางวัลต้องใช้ A-Z a-z 0-9 เท่านั้น');
    codeRow={id:nid('reward_code'),activity_id:activity.id,code:activity.reward_code,use_limit:Number(activity.reward_code_limit||1),used_count:0,created_by:activity.creator_id,created_at:now(),source:'manual'};db.reward_codes.push(codeRow);
  }
  if(!codeRow)throw Error('โค้ดรางวัลหมดแล้ว');
  codeRow.used_count=Number(codeRow.used_count||0)+1;
  const claim={id:nid('reward_claim'),activity_id:activity.id,user_id,code:codeRow.code,source,created_at:now()};db.reward_claims.push(claim);
  return {already:false,code:codeRow.code,activity_link:activity.activity_link||`/\#activity-${activity.id}`};
}
function claimTopupTier(u,activity,tier){
  const exists=(db.topup_reward_claims||[]).find(c=>c.user_id==u.id&&c.activity_id==activity.id&&c.tier_credit==tier.credit);
  if(exists)return {already:true};
  if(Number(u.lifetime_credit_topup||0)<tier.credit)throw Error('ยังไม่ได้รับสิทธิ์');
  if(tier.coin)bal(u.id,'coin',tier.coin,'รับรางวัลเติมเงินสะสม',activity.title,{ref_type:'activity',ref_id:activity.id});
  if(tier.vip_days){u.vip_until=Math.max(Number(u.vip_until||0),now())+Number(tier.vip_days)*86400e3;if(!u.vip_level)u.vip_level='Member'}
  db.topup_reward_claims.push({id:nid('topup_reward_claim'),user_id:u.id,activity_id:activity.id,tier_credit:tier.credit,reward:tier.reward,created_at:now()});
  return {already:false};
}

function ceilFee(n){return Math.ceil(Math.max(0,Number(n)||0));}
function currentVipLevel(u){return VIP_LEVEL_ORDER.includes(u?.vip_level)?u.vip_level:'Member'}
function isVipActive(u){return !!u && (currentVipLevel(u)==='Elite' || Number(u.vip_until||0)>now())}
function vip(u){return isVipActive(u)}
function getVipBenefits(u){const level=currentVipLevel(u);return {level,is_vip:isVipActive(u),sale_fee_rate:VIP_SALE_FEE_RATE[level]??0.06,escrow_cashback_rate:VIP_ESCROW_CASHBACK[level]??0,activity_discount_rate:VIP_ACTIVITY_DISCOUNT[level]??0,elite_permanent:level==='Elite'}}
function calculateSaleFee(amount,u){const rate=getVipBenefits(u).sale_fee_rate;return {amount:ceilFee(Number(amount||0)*rate),rate}}
function calculateEscrowFee(amount){amount=Number(amount||0);let rate=0.01;if(amount>=500000)rate=0.07;else if(amount>=100000)rate=0.05;else if(amount>=50001)rate=0.04;else if(amount>=10001)rate=0.03;else if(amount>=1001)rate=0.02;return {amount:ceilFee(amount*rate),rate}}
function calculateEscrowCashback(fee,u){const rate=getVipBenefits(u).escrow_cashback_rate;return {amount:ceilFee(Number(fee||0)*rate),rate}}
function calculateActivityFee(days,currency,u){days=Math.max(1,Math.ceil(Number(days||1)));const base=currency==='coin'?5000:20;const discount=getVipBenefits(u).activity_discount_rate;return {base_per_day:base,days,currency,discount_rate:discount,amount:ceilFee(base*days*(1-discount))}}
function monthKeyBangkok(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'})).toISOString().slice(0,7)}
function spendCreditForVipPoints(u,amount,note='ใช้จ่าย Credit'){amount=Math.floor(Number(amount||0));if(!u||amount<=0||!isVipActive(u))return;u.vip_points=Number(u.vip_points||0)+amount;if(currentVipLevel(u)==='Member'){u.vip_credit_spent_for_silver=Number(u.vip_credit_spent_for_silver||0)+amount}
  while(true){let lv=currentVipLevel(u);if(lv==='Member'){if(Number(u.vip_coin_spent_for_silver||0)>=100000&&Number(u.vip_credit_spent_for_silver||0)>=100){u.vip_level='Silver';u.vip_points=0;continue}break}
    if(lv==='Elite')break;let req=VIP_NEXT_REQUIREMENT[lv];if(!req||Number(u.vip_points||0)<req)break;u.vip_points=Number(u.vip_points||0)-req;u.vip_level=VIP_LEVEL_ORDER[VIP_LEVEL_ORDER.indexOf(lv)+1]||lv;
  }}
function spendCoinForVipSilver(u,amount){amount=Math.floor(Number(amount||0));if(!u||amount<=0||!isVipActive(u))return;if(currentVipLevel(u)==='Member'){u.vip_coin_spent_for_silver=Number(u.vip_coin_spent_for_silver||0)+amount;spendCreditForVipPoints(u,0)}}
function recordCompanyRevenue(amount,currency,type,ref={}){amount=ceilFee(amount);if(amount>0)db.company_revenue.unshift({amount,currency,type,ref_type:ref.ref_type||'',ref_id:ref.ref_id||'',created_at:now()})}
function bal(uid,c,delta,type,note='',meta={}){let u=user(uid);if(!u)throw Error('ไม่พบผู้ใช้');delta=Number(delta||0);const before=Number(u[c]||0), after=before+delta;if(after<0)throw Error('ยอด '+c+' ไม่พอ');u[c]=after;tx(uid,type,delta,c,note,{...meta,before_balance:before,after_balance:after});if(delta<0&&c==='credit')spendCreditForVipPoints(u,Math.abs(delta),type);if(delta<0&&c==='coin')spendCoinForVipSilver(u,Math.abs(delta));}

function normalizeAuctionMethod(m){
  m=String(m||'english').toLowerCase();
  if(['forward','english','offer'].includes(m))return 'english';
  if(['fee','bidding_fee','knock','tap'].includes(m))return 'fee';
  if(['sealed','sealed_bid'].includes(m))return 'sealed';
  return 'english';
}
function auctionMethodLabel(m){m=normalizeAuctionMethod(m);return m==='english'?'เสนอราคา':m==='fee'?'เคาะราคา':'ปิดซอง'}
function validateAuctionCurrency(currency,method,amount,label='จำนวนเงิน'){
  method=normalizeAuctionMethod(method);
  if(!['credit','coin'].includes(currency))throw Error('เลือกสกุลเงินได้เฉพาะ Credit หรือ Coin');
  if(method==='sealed'&&currency!=='credit')throw Error('ประมูลปิดซองใช้ Credit เท่านั้น');
  amount=Number(amount||0);
  if(currency==='coin'){
    if(amount<100)throw Error(label+'แบบ Coin ต้องขั้นต่ำ 100 Coin');
    if(amount%100!==0)throw Error(label+'แบบ Coin ต้องเป็นจำนวนเต็มร้อยเท่านั้น');
  }
  if(currency==='credit'&&amount<1)throw Error(label+'แบบ Credit ต้องขั้นต่ำ 1 Credit');
}
function auctionDurationMs(method,b){
  method=normalizeAuctionMethod(method);
  if(method==='english'){
    let mins=Number(b.duration_minutes||0);
    if(!mins)mins=Number(b.sealed_hours||b.hours||1)*60;
    if(mins<30||mins>360)throw Error('ประมูลแบบเสนอราคาต้องใช้เวลา 30 นาที - 6 ชั่วโมง');
    return Math.floor(mins*60000);
  }
  if(method==='sealed'){
    let days=Number(b.duration_days||0);
    if(!days)days=Number(b.sealed_hours||24)/24;
    if(days<1||days>30)throw Error('ประมูลปิดซองต้องกำหนดเวลา 1 - 30 วัน');
    return Math.floor(days*86400e3);
  }
  return 0;
}
function secondHighestBidder(a,winnerId){
  const rows=Object.entries(a.highest_bid_by_user||a.bidder_last_amounts||{})
    .map(([uid,amount])=>({user_id:Number(uid),amount:Number(amount||0)}))
    .filter(x=>x.user_id!==Number(winnerId)&&x.amount>0)
    .sort((x,y)=>y.amount-x.amount);
  return rows[0]||null;
}
function methodPublicInfo(a){
  const method=normalizeAuctionMethod(a.method);
  return {
    method,
    method_label:auctionMethodLabel(method),
    requires_min_participants:method==='english'?3:0,
    can_bid: method==='fee'? (a.status==='active' && now()>=Number(a.start_at||0) && (!a.end_at || now()<a.end_at)) : (a.status==='active' && now()>=Number(a.start_at||0) && now()<Number(a.end_at||Infinity)),
    countdown_seconds:Number(a.countdown_seconds||0),
    bid_fee:Number(a.bid_fee||0),
    last_bid_at:Number(a.last_bid_at||0),
    can_seller_end_after: method==='english'&&a.last_bid_at?Number(a.last_bid_at)+5*60000:0
  }
}

function publicAd(a,uid){
  const owner=user(a.owner_id)||{};
  const views=(db.ad_views||[]).filter(v=>v.ad_id==a.id);
  const my=(db.ad_views||[]).find(v=>v.ad_id==a.id&&v.user_id==uid&&v.rewarded);
  const unique=new Set(views.map(v=>v.user_id)).size;
  const rewarded=views.filter(v=>v.rewarded).length;
  const failed=views.filter(v=>a.type==='question'&&!v.answer_correct).length;
  return {id:a.id,owner_id:a.owner_id,owner_name:owner.display_name||owner.username||'ผู้ลงโฆษณา',title:a.title,description:a.description,cover_url:a.cover_url,media_url:a.media_url,type:a.type,reward_currency:a.reward_currency,reward_amount:a.reward_amount,view_seconds:a.view_seconds,question:a.type==='question'?a.question:'',status:a.status,created_at:a.created_at,deleted_reason:a.deleted_reason||'',reward_code_enabled:!!a.reward_code,reward_code_trigger:a.reward_code_trigger||'none',activity_link:a.activity_link||'',stats:{unique_viewers:unique,rewarded,failed,fail_rate:unique?Math.round(failed/unique*100):0},viewer:{rewarded:!!my}};
}
function adAnswerOk(expected,input){
  const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
  const e=norm(expected), i=norm(input);
  if(!e||!i)return false;
  return i===e || (e.length>=3 && i.includes(e));
}
function getOrCreateAdView(ad_id,user_id){
  let v=(db.ad_views||[]).find(x=>x.ad_id==ad_id&&x.user_id==user_id);
  if(!v){v={id:nid('ad_view'),ad_id,user_id,view_count:0,started_at:now(),last_started_at:now(),completed:false,rewarded:false,rewarded_at:null,answer_correct:false,answer_text:'',created_at:now(),updated_at:now()};db.ad_views.push(v)}
  v.view_count=Number(v.view_count||0)+1;v.last_started_at=now();v.updated_at=now();return v;
}
function rewardAdViewer(ad,view){
  if(view.rewarded)return {already:true};
  if(!['coin','credit'].includes(ad.reward_currency))throw Error('สกุลรางวัลไม่ถูกต้อง');
  const amt=Number(ad.reward_amount||0);if(amt<=0)throw Error('จำนวนรางวัลไม่ถูกต้อง');
  bal(view.user_id,ad.reward_currency,amt,'รับรางวัลโฆษณา',`รับรางวัลจากโฆษณา #${ad.id}: ${ad.title}`,{ref_type:'ad',ref_id:ad.id});
  view.rewarded=true;view.rewarded_at=now();view.completed=true;view.updated_at=now();
  return {already:false};
}
let lastAdAutoCheckDate='';
function runQuestionAdPolicyCheck(force=false){
  const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
  const dateKey=d.toISOString().slice(0,10);
  if(!force){
    if(d.getHours()<23 || (d.getHours()===23 && d.getMinutes()<30))return {ran:false,reason:'not_time'};
    if(lastAdAutoCheckDate===dateKey)return {ran:false,reason:'already_ran'};
  }
  lastAdAutoCheckDate=dateKey;
  const results=[];
  (db.ads||[]).filter(a=>a.type==='question'&&a.status==='active').forEach(a=>{
    const views=(db.ad_views||[]).filter(v=>v.ad_id==a.id);
    const byUser=new Map();views.forEach(v=>{const prev=byUser.get(v.user_id);if(!prev||Number(v.updated_at||0)>Number(prev.updated_at||0))byUser.set(v.user_id,v)});
    const total=byUser.size;
    const failed=[...byUser.values()].filter(v=>!v.answer_correct).length;
    const failRate=total?failed/total:0;
    if(total>0 && failRate>0.30){a.status='review';a.hidden=true;a.review_queued_at=now();a.review_reason=`ผู้ชมตอบไม่ได้ ${Math.round(failRate*100)}% (${failed}/${total}) เกิน 30%`;db.review_queue.unshift({id:nid('review_queue'),target_type:'ad',target_id:a.id,reason:a.review_reason,status:'pending',created_at:now()});results.push({ad_id:a.id,total,failed,fail_rate:Math.round(failRate*100),review:true});}
    else results.push({ad_id:a.id,total,failed,fail_rate:Math.round(failRate*100),deleted:false});
  });
  db.ad_checks.unshift({date:dateKey,force,created_at:now(),results});save();return {ran:true,date:dateKey,results};
}
setInterval(()=>{try{runQuestionAdPolicyCheck(false)}catch(e){console.error('Ad policy check failed:',e.message)}},60*1000);

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
app.post('/api/register',(req,res)=>{let {username,email,password}=req.body;if(!username||!email||!password)return res.status(400).json({error:'กรอกข้อมูลให้ครบ'});if(uname(username))return res.status(400).json({error:'ชื่อซ้ำ'});let u={id:nid('user'),username,email,password_hash:bcrypt.hashSync(password,10),role:'user',status:'active',display_name:username,avatar_url:'',bio:'',coin:0,credit:0,token:0,vip_until:0,vip_level:'Member',vip_points:0,vip_coin_spent_for_silver:0,vip_credit_spent_for_silver:0,username_change_count:0,lifetime_credit_topup:0,trust_completed_sales:0,trust_total_orders:0};db.users.push(u);req.session.userId=u.id;save();res.json({user:pub(u)})});
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
app.put('/api/me/profile',need,(req,res)=>{let u=user(req.session.userId);['display_name','email','bio','avatar_url'].forEach(k=>{if(req.body[k]!=null)u[k]=String(req.body[k])});save();res.json({user:pub(u)})});
app.post('/api/me/change-username',need,(req,res)=>{try{let u=user(req.session.userId),username=String(req.body.username||'').trim();if(!username)return res.status(400).json({error:'กรุณากรอกชื่อผู้ใช้ใหม่'});if(!/^[a-zA-Z0-9_ก-๙.-]{3,32}$/.test(username))return res.status(400).json({error:'ชื่อผู้ใช้ต้องยาว 3-32 ตัวอักษร และใช้ตัวอักษร/ตัวเลข/_/./- เท่านั้น'});let existing=uname(username);if(existing&&existing.id!==u.id)return res.status(400).json({error:'ชื่อนี้ถูกใช้แล้ว'});const fee=Number(u.username_change_count||0)>0?50:0;if(fee>0){bal(u.id,'credit',-fee,'เปลี่ยนชื่อผู้ใช้',`เปลี่ยนเป็น ${username}`,{ref_type:'profile'});recordCompanyRevenue(fee,'credit','ค่าธรรมเนียมเปลี่ยนชื่อผู้ใช้',{ref_type:'user',ref_id:u.id})}u.username=username;u.display_name=req.body.display_name?String(req.body.display_name):u.display_name;u.username_change_count=Number(u.username_change_count||0)+1;save();res.json({fee,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});app.post('/api/upload',need,up.single('file'),(req,res)=>res.json({url:'/uploads/'+req.file.filename}));
app.post('/api/wallet/buy-coin',need,(req,res)=>{try{const credit=Math.floor(Number(req.body.credit||req.body.credit_amount||0));if(!Number.isFinite(credit)||credit<=0)return res.status(400).json({error:'กรุณากรอกจำนวน Credit ที่ต้องการแลก'});bal(req.session.userId,'credit',-credit,'แลก Coin',`แลก ${credit} Credit เป็น ${credit*COIN_PER_CREDIT} Coin`,{ref_type:'exchange'});bal(req.session.userId,'coin',credit*COIN_PER_CREDIT,'ได้รับ Coin จากการแลก',`1 Credit = ${COIN_PER_CREDIT} Coin`,{ref_type:'exchange'});save();res.json({credit_spent:credit,coin_received:credit*COIN_PER_CREDIT,user:pub(user(req.session.userId))})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/payments/create-credit-topup',need,(req,res)=>{
  const credit_amount=Math.floor(Number(req.body.credit||req.body.credit_amount||0));
  if(!Number.isFinite(credit_amount)||credit_amount<CREDIT_TOPUP_MIN)return res.status(400).json({error:`เติมขั้นต่ำ ${CREDIT_TOPUP_MIN} Credit`});
  const baht=credit_amount*CREDIT_THB_RATE;
  const p={id:uuid(),user_id:req.session.userId,baht_amount:baht,credit_amount,status:'pending_slip',slip_url:'',admin_note:'',created_at:now(),updated_at:now(),rate_baht_per_credit:CREDIT_THB_RATE};
  db.payments=(db.payments||[]);db.payments.unshift(p);save();
  res.json({payment:p, payment_id:p.id, baht_amount:baht, credit_amount, rate_baht_per_credit:CREDIT_THB_RATE});
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
  if(p.status!=='approved'){p.status='approved';p.updated_at=now();p.admin_note=req.body.note||'';bal(p.user_id,'credit',p.credit_amount,'เติม Credit ผ่าน QR',`รายการ ${p.id} / ${p.baht_amount} บาท`);let tu=user(p.user_id);if(tu)tu.lifetime_credit_topup=Number(tu.lifetime_credit_topup||0)+Number(p.credit_amount||0);recordCompanyRevenue(p.credit_amount,'credit','Credit ที่เติมเข้าสู่ระบบ',{ref_type:'payment',ref_id:p.id});save();}
  res.json({payment:p,user:pub(user(p.user_id))});
});
app.post('/api/admin/payments/:id/reject',admin,(req,res)=>{const p=(db.payments||[]).find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ไม่พบรายการ'});p.status='rejected';p.admin_note=req.body.note||'';p.updated_at=now();save();res.json({payment:p})});
app.post('/api/payments/mock-confirm',need,(req,res)=>res.status(403).json({error:'ปิดระบบ Mock แล้ว กรุณาอัปโหลดสลิปให้ Admin ตรวจสอบ'}));
app.get('/api/vip/config',(req,res)=>res.json({levels:VIP_LEVEL_ORDER,plans:VIP_PLANS,benefits:{sale_fee_rate:VIP_SALE_FEE_RATE,escrow_cashback:VIP_ESCROW_CASHBACK,activity_discount:VIP_ACTIVITY_DISCOUNT},credit_rate:{baht_per_credit:CREDIT_THB_RATE,min_credit:CREDIT_TOPUP_MIN},coin_rate:{coin_per_credit:COIN_PER_CREDIT}}));
app.post('/api/vip/subscribe',need,(req,res)=>{try{let u=user(req.session.userId),planKey=req.body.plan||'monthly',plan=VIP_PLANS[planKey];if(!plan)return res.status(400).json({error:'แพ็กเกจ VIP ไม่ถูกต้อง'});bal(u.id,'credit',-plan.price,'ซื้อ VIP',plan.label,{ref_type:'vip',ref_id:planKey});recordCompanyRevenue(plan.price,'credit','ขายสมาชิก VIP',{ref_type:'vip',ref_id:planKey});if(currentVipLevel(u)==='Member'&&Number(u.vip_until||0)<=now())u.vip_level='Member';let bonus=0;if(currentVipLevel(u)==='Diamond')bonus=30;else if(currentVipLevel(u)==='Emerald')bonus=90;if(currentVipLevel(u)==='Elite'){u.vip_until=4102444800000}else{u.vip_until=Math.max(Number(u.vip_until||0),now())+(plan.days+bonus)*86400e3}save();res.json({plan:planKey,price:plan.price,days_added:currentVipLevel(u)==='Elite'?'permanent':plan.days+bonus,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/fees/config',(req,res)=>res.json({credit_topup:{baht_per_credit:CREDIT_THB_RATE,min_credit:CREDIT_TOPUP_MIN},coin_exchange:{coin_per_credit:COIN_PER_CREDIT,reverse_exchange:false},vip_plans:VIP_PLANS,sale_fee_rate:VIP_SALE_FEE_RATE,escrow_fee_tiers:[{min:1,max:1000,rate:0.01},{min:1001,max:10000,rate:0.02},{min:10001,max:50000,rate:0.03},{min:50001,max:99999,rate:0.04},{min:100000,max:499999,rate:0.05},{min:500000,max:null,rate:0.07}],escrow_cashback:VIP_ESCROW_CASHBACK,activity_fee:{credit_per_day:20,coin_per_day:5000,discount:VIP_ACTIVITY_DISCOUNT},pin_fee:{credit_per_hour:3,credit_per_day:50,max_days:7,cooldown_hours:72,elite_free_monthly:{max_days:3,limit:1}}}));
app.post('/api/fees/preview',need,(req,res)=>{const u=user(req.session.userId),amount=Number(req.body.amount||0),days=Number(req.body.days||1),currency=req.body.currency||'credit';res.json({user:pub(u),sale_fee:calculateSaleFee(amount,u),escrow_fee:calculateEscrowFee(amount),escrow_cashback:calculateEscrowCashback(calculateEscrowFee(amount).amount,u),activity_fee_credit:calculateActivityFee(days,'credit',u),activity_fee_coin:calculateActivityFee(days,'coin',u)})});
app.post('/api/auctions/:id/pin',need,(req,res)=>{try{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)return res.status(404).json({error:'ไม่พบสินค้า'});if(a.seller_id!==u.id&&u.role!=='admin')return res.status(403).json({error:'เฉพาะเจ้าของสินค้า'});let hours=Math.ceil(Number(req.body.hours||0));if(req.body.days)hours=Math.ceil(Number(req.body.days)*24);if(hours<=0)return res.status(400).json({error:'กรุณาระบุเวลาปักหมุด'});if(hours>24*7)return res.status(400).json({error:'ปักหมุดได้สูงสุด 7 วันต่อครั้ง'});const t=now();if(Number(a.last_pin_ended_at||0)&&t<Number(a.last_pin_ended_at)+72*3600e3)return res.status(400).json({error:'ต้องรอ 72 ชั่วโมงหลังหมุดเดิมสิ้นสุดก่อนปักซ้ำ'});let fee=hours>=24?Math.ceil(hours/24)*50:hours*3;let eliteFree=false;if(currentVipLevel(u)==='Elite'&&hours<=72&&u.elite_free_pin_month!==monthKeyBangkok()){fee=0;eliteFree=true;u.elite_free_pin_month=monthKeyBangkok()}if(fee>0){bal(u.id,'credit',-fee,'ปักหมุดประมูล',a.title,{ref_type:'auction',ref_id:a.id});recordCompanyRevenue(fee,'credit','ค่าปักหมุดประมูล',{ref_type:'auction',ref_id:a.id})}a.pinned_until=t+hours*3600e3;a.last_pin_ended_at=a.pinned_until;db.pin_logs.unshift({id:nid('pin_log'),auction_id:a.id,user_id:u.id,hours,fee,elite_free:eliteFree,created_at:t,ends_at:a.pinned_until});save();res.json({auction:au(a,u.id),fee,elite_free:eliteFree,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/activities',need,(req,res)=>{try{let u=user(req.session.userId),b=req.body;const title=String(b.title||'').trim(),description=String(b.description||'').trim();if(!title||!description)return res.status(400).json({error:'ต้องมีชื่อกิจกรรมและรายละเอียด'});let days=Math.ceil(Number(b.days||1));if(u.role!=='admin'){if(!vip(u)&&days>3)return res.status(400).json({error:'ผู้ใช้ทั่วไปจัดกิจกรรมได้ไม่เกิน 3 วัน'});if(vip(u)&&days>30)return res.status(400).json({error:'VIP จัดกิจกรรมได้สูงสุด 30 วัน'})}const currency=b.fee_currency==='coin'?'coin':'credit';const fee=u.role==='admin'?{amount:0,currency,days,discount_rate:1}:calculateActivityFee(days,currency,u);if(fee.amount>0){bal(u.id,currency,-fee.amount,'สร้างกิจกรรม',title,{ref_type:'activity'});recordCompanyRevenue(fee.amount,currency,'ค่าธรรมเนียมสร้างกิจกรรม',{ref_type:'activity'})}let reward_code=String(b.reward_code||'').trim();if(reward_code&&!validRewardCode(reward_code))return res.status(400).json({error:'โค้ดรางวัลต้องใช้ A-Z a-z 0-9 เท่านั้น'});const a={id:nid('activity'),creator_id:u.id,creator_name:u.display_name||u.username,title,description,condition:String(b.condition||''),category:normalizeActivityCategory(b.category),days,starts_at:now(),ends_at:now()+days*86400e3,participants_limit:b.participants_limit||'unlimited',reward_enabled:!!b.reward_enabled,reward_code,reward_code_limit:Math.max(1,Math.floor(Number(b.reward_code_limit||1))),activity_link:String(b.activity_link||''),reward_trigger:b.reward_trigger||'manual',auction_id:b.auction_id?Number(b.auction_id):null,fee,status:'active',created_at:now()};db.activities.unshift(a);const randomCount=Math.max(0,Math.min(1000,Math.floor(Number(b.random_code_count||0))));for(let i=0;i<randomCount;i++)db.reward_codes.push({id:nid('reward_code'),activity_id:a.id,code:makeUniqueRewardCode(),use_limit:1,used_count:0,created_by:u.id,created_at:now(),source:'random'});audit(u.id,'activity:create','activity',a.id,{fee,randomCount});save();res.json({activity:publicActivity(a,u.id),codes:(db.reward_codes||[]).filter(c=>c.activity_id==a.id).map(c=>c.code),user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/activities',(req,res)=>{ensureSystemDefaults();let q=String(req.query.category||'');let rows=(db.activities||[]).filter(a=>a.status==='active'&&Number(a.ends_at||0)>now());if(q)rows=rows.filter(a=>normalizeActivityCategory(a.category)===q);res.json({activities:rows.map(a=>publicActivity(a,req.session.userId))})});

app.get('/api/activities/:id',(req,res)=>{ensureSystemDefaults();const a=(db.activities||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบกิจกรรม'});const tiers=a.topup_tiers||[];const claimed=(db.topup_reward_claims||[]).filter(c=>c.user_id==req.session.userId&&c.activity_id==a.id);res.json({activity:publicActivity(a,req.session.userId),topup:{lifetime_credit_topup:req.session.userId?Number(user(req.session.userId)?.lifetime_credit_topup||0):0,tiers,claimed}})});
app.post('/api/activities/:id/generate-codes',need,(req,res)=>{try{const a=(db.activities||[]).find(x=>x.id==req.params.id);if(!a)return res.status(404).json({error:'ไม่พบกิจกรรม'});const u=user(req.session.userId);if(u.role!=='admin'&&a.creator_id!==u.id)return res.status(403).json({error:'เฉพาะผู้สร้างกิจกรรมหรือ Admin'});const count=Math.max(1,Math.min(1000,Math.floor(Number(req.body.count||1))));const codes=[];for(let i=0;i<count;i++){const code=makeUniqueRewardCode();codes.push(code);db.reward_codes.push({id:nid('reward_code'),activity_id:a.id,code,use_limit:1,used_count:0,created_by:u.id,created_at:now(),source:'random'});}audit(u.id,'activity:generate_codes','activity',a.id,{count});save();res.json({codes})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/activities/:id/redeem',need,(req,res)=>{try{const a=(db.activities||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบกิจกรรม'});const code=String(req.body.code||'').trim();if(!validRewardCode(code))return res.status(400).json({error:'โค้ดต้องใช้ A-Z a-z 0-9 เท่านั้น'});const row=(db.reward_codes||[]).find(c=>c.activity_id==a.id&&c.code===code);if(!row)return res.status(400).json({error:'โค้ดไม่ถูกต้อง'});if(Number(row.used_count||0)>=Number(row.use_limit||1))return res.status(400).json({error:'โค้ดนี้ถูกใช้ครบจำนวนแล้ว'});if((db.reward_claims||[]).some(c=>c.activity_id==a.id&&c.user_id==req.session.userId))return res.status(400).json({error:'บัญชีนี้รับรางวัลกิจกรรมนี้แล้ว'});row.used_count=Number(row.used_count||0)+1;db.reward_claims.push({id:nid('reward_claim'),activity_id:a.id,user_id:req.session.userId,code,source:'redeem',created_at:now()});save();res.json({ok:true,activity:publicActivity(a,req.session.userId)})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/activities/:id/claim-topup-tier',need,(req,res)=>{try{const a=(db.activities||[]).find(x=>x.id==req.params.id&&x.system_key==='topup_credit_2026');if(!a)return res.status(404).json({error:'ไม่พบกิจกรรมเติมเงินสะสม'});const credit=Number(req.body.credit||0);const tier=(a.topup_tiers||[]).find(t=>t.credit==credit);if(!tier)return res.status(400).json({error:'ขั้นรางวัลไม่ถูกต้อง'});const result=claimTopupTier(user(req.session.userId),a,tier);save();res.json({ok:true,result,user:pub(user(req.session.userId))})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/activities/:id/report',need,(req,res)=>{const a=(db.activities||[]).find(x=>x.id==req.params.id);if(!a)return res.status(404).json({error:'ไม่พบกิจกรรม'});const reason=String(req.body.reason||'').trim()||'รายงานกิจกรรม';const r={id:nid('activity_report'),activity_id:a.id,reporter_id:req.session.userId,reason,status:'pending',created_at:now()};db.activity_reports.unshift(r);db.review_queue.unshift({id:nid('review_queue'),target_type:'activity',target_id:a.id,reason,status:'pending',created_at:now()});save();res.json({report:r})});
app.post('/api/auctions/:id/share',need,(req,res)=>{try{const auct=db.auctions.find(x=>x.id==req.params.id);if(!auct)return res.status(404).json({error:'ไม่พบสินค้า'});const candidates=(db.activities||[]).filter(a=>a.status==='active'&&a.reward_enabled&&a.reward_trigger==='auction_share'&&(!a.auction_id||a.auction_id==auct.id));if(!candidates.length)return res.json({ok:true,message:'แชร์แล้ว แต่ยังไม่มีกิจกรรมโค้ดรางวัลสำหรับสินค้านี้'});const activity=candidates[0];const result=takeRewardCode(activity,req.session.userId,'auction_share');save();res.json({ok:true,...result,activity:publicActivity(activity,req.session.userId)})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/review-queue',admin,(req,res)=>res.json({queue:(db.review_queue||[]).filter(q=>q.status!=='closed').slice(0,200),activity_reports:db.activity_reports||[],ads:(db.ads||[]).filter(a=>a.status==='review'),activities:(db.activities||[]).filter(a=>a.status==='review'||a.hidden)}));
app.post('/api/admin/review-queue/:id/resolve',admin,(req,res)=>{const q=(db.review_queue||[]).find(x=>x.id==req.params.id);if(!q)return res.status(404).json({error:'ไม่พบรายการ'});q.status='closed';q.admin_id=req.session.userId;q.note=req.body.note||'';q.resolved_at=now();if(req.body.action==='approve'){if(q.target_type==='ad'){let a=(db.ads||[]).find(x=>x.id==q.target_id);if(a){a.status='active';a.hidden=false}}if(q.target_type==='activity'){let a=(db.activities||[]).find(x=>x.id==q.target_id);if(a){a.status='active';a.hidden=false}}}if(req.body.action==='reject'||req.body.action==='hide'){if(q.target_type==='ad'){let a=(db.ads||[]).find(x=>x.id==q.target_id);if(a){a.status='hidden';a.hidden=true}}if(q.target_type==='activity'){let a=(db.activities||[]).find(x=>x.id==q.target_id);if(a){a.status='hidden';a.hidden=true}}}save();res.json({queue:q})});

app.get('/api/auctions',(req,res)=>res.json({auctions:db.auctions.filter(a=>a.status=='active'&&a.level==(req.query.level||'general')).map(a=>au(a,req.session.userId))}));app.get('/api/auctions/:id',(req,res)=>{let a=db.auctions.find(x=>x.id==req.params.id);if(!a)return res.status(404).json({error:'ไม่พบ'});res.json({auction:au(a,req.session.userId)})});

app.post('/api/auctions',need,(req,res)=>{try{
  let u=user(req.session.userId),b=req.body;
  const method=normalizeAuctionMethod(b.method), level=b.level==='vip'?'vip':'general', currency=b.currency==='coin'?'coin':'credit';
  if(level==='vip'&&!vip(u))throw Error('ต้องเป็น VIP จึงจะลงประมูลแบบ VIP ได้');
  if(method==='sealed'&&level!=='vip')throw Error('ประมูลปิดซองใช้ได้เฉพาะการประมูล VIP เท่านั้น');
  const st=b.start_at?new Date(b.start_at).getTime():now();
  if(!Number.isFinite(st))throw Error('เวลาเริ่มประมูลไม่ถูกต้อง');
  if(st>now()+30*86400e3)throw Error('กำหนดเวลาเริ่มล่วงหน้าได้ไม่เกิน 30 วัน');
  let start=method==='fee'?0:Number(b.start_price||0);
  let bidFee=0,countdown=0,endAt=st+auctionDurationMs(method,b);
  if(method==='english')validateAuctionCurrency(currency,method,start,'ราคาเริ่มต้น');
  if(method==='fee'){
    bidFee=Number(b.bid_fee||b.start_price||0);validateAuctionCurrency(currency,method,bidFee,'ราคาเคาะต่อครั้ง');
    countdown=Math.max(15,Math.min(60,Math.floor(Number(b.countdown_seconds||30))));endAt=0;
  }
  if(method==='sealed')validateAuctionCurrency(currency,method,1,'ประมูลปิดซอง');
  let a={id:nid('auc'),seller_id:u.id,level,method,currency,title:String(b.title||'').trim(),description:b.description||'',category:b.category||'',image_url:b.image_url||img,media_type:b.media_type||'image',start_price:start,current_bid:method==='sealed'||method==='fee'?0:start,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},highest_bid_by_user:{},bid_history:[],sealed_bids:[],vip_entries:[],chats:[],start_at:st,end_at:endAt,status:'active',bid_fee:bidFee,countdown_seconds:countdown,last_bid_at:0,fee_pool:0,vip_entry_min_credit:Number(b.vip_entry_min_credit||0),vip_entry_fee_percent:0};
  if(!a.title)throw Error('กรุณากรอกชื่อสินค้า');
  db.auctions.push(a);save();res.json({auction:au(a,u.id)})
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/auctions/:id/join',need,(req,res)=>{try{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)throw Error('ไม่พบ');if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');if(a.seller_id==u.id)throw Error('เข้าร่วมสินค้าของตัวเองไม่ได้');if(a.level=='vip'){let need=Math.max(Number(a.vip_entry_min_credit||0),a.method==='english'?Math.ceil(Number(a.start_price||0)*.7):0),amt=Number(req.body.credit_amount||0);if(need>0){if(amt<need)throw Error('ต้องใส่ Credit อย่างน้อย '+need);if(u.credit<amt)throw Error('Credit ไม่พอ');let e=a.vip_entries.find(e=>e.user_id==u.id);e?e.credit_amount=amt:a.vip_entries.push({user_id:u.id,credit_amount:amt})}else if(!a.vip_entries.find(e=>e.user_id==u.id))a.vip_entries.push({user_id:u.id,credit_amount:0})}if(!a.participants.includes(u.id))a.participants.push(u.id);save();res.json({auction:au(a,u.id)})}catch(e){res.status(400).json({error:e.message})}});

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
    a.method=normalizeAuctionMethod(a.method);
    if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');
    if(now()<a.start_at)throw Error('ยังไม่เริ่ม');
    if(a.end_at&&now()>a.end_at)throw Error('หมดเวลาประมูลแล้ว');
    if(a.seller_id==u.id)throw Error('ประมูลของตัวเองไม่ได้');
    if(a.level=='vip'&&!a.vip_entries.find(e=>e.user_id==u.id))throw Error('กรุณาเข้าร่วม VIP ก่อน');
    if(!a.participants.includes(u.id)){
      if(a.method==='english')throw Error('กรุณากดเข้าร่วมก่อนเสนอราคา');
      a.participants.push(u.id);
    }
    if(a.method==='english'){
      if((a.participants||[]).length<3)throw Error('ต้องมีผู้เข้าร่วมอย่างน้อย 3 คนจึงจะเริ่มประมูลได้');
      let amount=Number(req.body.amount);
      validateAuctionCurrency(a.currency,a.method,amount,'ราคาเสนอ');
      if(amount<=a.current_bid)throw Error('ต้องสูงกว่าปัจจุบัน');
      const oldWinnerId=a.winner_id;
      const oldWinnerAmount=oldWinnerId?currentBidHoldAmount(a,oldWinnerId):0;
      if(oldWinnerId&&oldWinnerId!==u.id&&oldWinnerAmount>0){refundBidFunds(oldWinnerId,a.currency,oldWinnerAmount,'ถูกเสนอราคาสูงกว่า: '+a.title);a.bidder_last_amounts[oldWinnerId]=0;}
      const prevSelf=currentBidHoldAmount(a,u.id);
      holdBidFunds(u,a.currency,amount-prevSelf,'เสนอราคา: '+a.title);
      a.current_bid=amount;a.winner_id=u.id;a.last_bidder_id=u.id;a.bidder_last_amounts[u.id]=amount;a.highest_bid_by_user[u.id]=Math.max(Number(a.highest_bid_by_user[u.id]||0),amount);a.last_bid_at=now();a.bids_count++;a.bid_history.push({user_id:u.id,amount,created_at:now(),type:'english'});a.chats.push({system:true,text:`${u.display_name||u.username} เสนอราคา ${amount} ${a.currency}`});
    }else if(a.method==='fee'){
      const fee=Number(a.bid_fee||0);validateAuctionCurrency(a.currency,a.method,fee,'ราคาเคาะต่อครั้ง');
      bal(u.id,a.currency,-fee,'เคาะราคาประมูล',a.title,{ref_type:'auction',ref_id:a.id});
      a.current_bid=Number(a.current_bid||0)+fee;a.fee_pool=Number(a.fee_pool||0)+fee;a.winner_id=u.id;a.last_bidder_id=u.id;a.bidder_last_amounts[u.id]=Number(a.bidder_last_amounts[u.id]||0)+fee;a.highest_bid_by_user[u.id]=Number(a.highest_bid_by_user[u.id]||0)+fee;a.last_bid_at=now();a.end_at=now()+Number(a.countdown_seconds||30)*1000;a.bids_count++;a.bid_history.push({user_id:u.id,amount:fee,current_bid:a.current_bid,created_at:now(),type:'fee'});a.chats.push({system:true,text:`${u.display_name||u.username} เคาะราคา +${fee} ${a.currency}`});
    }else{
      if(a.level!=='vip')throw Error('ประมูลปิดซองใช้ได้เฉพาะ VIP');
      if(a.currency!=='credit')throw Error('ประมูลปิดซองใช้ Credit เท่านั้น');
      let amount=Number(req.body.amount);validateAuctionCurrency(a.currency,a.method,amount,'ราคาเสนอ');
      const prev=currentBidHoldAmount(a,u.id);if(amount<=prev)throw Error('ต้องสูงกว่าราคาเดิมของคุณ');
      holdBidFunds(u,a.currency,amount-prev,'เสนอราคาแบบปิดซอง: '+a.title);
      a.sealed_bids=(a.sealed_bids||[]).filter(b=>b.user_id!==u.id);a.sealed_bids.push({user_id:u.id,amount,created_at:now()});a.bidder_last_amounts[u.id]=amount;a.highest_bid_by_user[u.id]=amount;a.bids_count++;a.chats.push({system:true,text:`${u.display_name||u.username} ส่งราคาแบบปิดซองแล้ว`});
    }
    save();emitAuctionUpdate(a,'auction:bid');res.json({auction:au(a,u.id),user:pub(u)})
  }catch(e){res.status(400).json({error:e.message})}
});


function makeOrder(a,winner,price,escrowFee,saleFee,escrowCashback,penaltyCompany,penaltySeller){
  let seller=user(a.seller_id);
  seller.trust_total_orders=(seller.trust_total_orders||0)+1;
  const created=now();
  let o={
    id:nid('order'),auction_id:a.id,item_title:a.title,buyer_id:winner.id,seller_id:a.seller_id,
    amount:Number(price),currency:a.currency,service_fee:Number(escrowFee||0),sale_success_fee:Number(saleFee||0),escrow_cashback:Number(escrowCashback||0),locked_amount:Number(price),status:'WAIT_SHIPPING',escrow_status:'HELD',escrow_version:'v2',
    buyer_confirmed:false,seller_confirmed:false,shipping_company:'',tracking_number:'',delivery_note:'',
    delivery_deadline:created+3*86400e3,buyer_confirm_deadline:created+7*86400e3,auto_release_eligible_at:created+7*86400e3,
    created_at:created,updated_at:created,vip_penalty_company:penaltyCompany||0,seller_vip_penalty_income:penaltySeller||0,timeline:[],audit_refs:[]
  };
  db.orders.unshift(o);
  db.escrow.unshift({id:nid('escrow'),order_id:o.id,amount:price,currency:a.currency,status:'HELD',type:'HOLD',created_at:created,note:'Escrow V2: พักเงินผู้ชนะประมูล'});
  escrowEvent(o,'HOLD',winner.id,'พักเงินผู้ชนะประมูล',{auction_id:a.id,price,escrow_fee:escrowFee,sale_success_fee:saleFee,escrow_cashback:escrowCashback});
  audit(winner.id,'ESCROW_HOLD','order',o.id,{amount:price,currency:a.currency,auction_id:a.id});
  emitOrderUpdate(o);
  return o;
}
function refundNonWinningHolds(a,wid){
  if(normalizeAuctionMethod(a.method)==='fee')return;
  Object.entries(a.bidder_last_amounts||{}).forEach(([uid,amt])=>{
    uid=Number(uid);amt=Number(amt||0);
    if(uid!==Number(wid)&&amt>0){refundBidFunds(uid,a.currency,amt,'คืนเงินผู้ไม่ชนะประมูล: '+a.title);a.bidder_last_amounts[uid]=0;}
  });
}
function closeAuction(a){
  if(a.status==='closed')return db.winners.find(w=>w.auction_id===a.id)||{auction_id:a.id,item_title:a.title,price:a.current_bid,currency:a.currency};
  let wid=a.winner_id,price=a.current_bid;
  if(a.method==='sealed'&&a.sealed_bids?.length){let b=a.sealed_bids.sort((x,y)=>y.amount-x.amount)[0];wid=b.user_id;price=b.amount;a.winner_id=wid;a.current_bid=price;}
  let w=user(wid),s=user(a.seller_id),fee=0,saleFee=0,cashback=0,pc=0,ps=0;
  if(w&&price>0){
    refundNonWinningHolds(a,wid);
    a.bidder_last_amounts[wid]=price;
    const escrowCalc=calculateEscrowFee(price);fee=escrowCalc.amount;
    const saleCalc=calculateSaleFee(price,s);saleFee=saleCalc.amount;
    cashback=calculateEscrowCashback(fee,s).amount;
    recordCompanyRevenue(fee,a.currency,'ค่าธรรมเนียม Escrow',{ref_type:'auction',ref_id:a.id});
    recordCompanyRevenue(saleFee,a.currency,'ค่าธรรมเนียมประมูลสำเร็จ',{ref_type:'auction',ref_id:a.id});
    if(a.level==='vip'&&normalizeAuctionMethod(a.method)==='english'){
      const second=secondHighestBidder(a,wid);
      if(second){
        pc=ceilFee(second.amount*0.07);ps=ceilFee(second.amount*0.03);
        if(pc)bal(second.user_id,a.currency,-pc,'ค่าธรรมเนียมอันดับ 2 ประมูล VIP 7%',a.title,{ref_type:'auction',ref_id:a.id});
        if(ps)bal(second.user_id,a.currency,-ps,'ชำระให้ผู้ลงสินค้าอันดับ 2 ประมูล VIP 3%',a.title,{ref_type:'auction',ref_id:a.id});
        if(pc)recordCompanyRevenue(pc,a.currency,'ค่าธรรมเนียมอันดับ 2 ประมูล VIP',{ref_type:'auction',ref_id:a.id});
      }
    }
    makeOrder(a,w,price,fee,saleFee,cashback,pc,ps);
  }else{
    refundNonWinningHolds(a,null);
  }
  a.status='closed';
  const winnerRow={id:nid('winner'),auction_id:a.id,item_title:a.title,level:a.level,winner_name:w?.username||'ไม่มีผู้ชนะ',price,currency:a.currency,service_fee:fee,sale_success_fee:saleFee||0,escrow_cashback:cashback||0,vip_penalty_company:pc,closed_at:now()};
  db.winners.unshift(winnerRow);save();emitAuctionUpdate(a,'auction:closed');return winnerRow;
}


app.post('/api/auctions/:id/close',need,(req,res)=>{try{
  const a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)throw Error('ไม่พบสินค้า');
  if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');
  const isOwner=a.seller_id===u.id, isAdmin=u.role==='admin';if(!isOwner&&!isAdmin)throw Error('เฉพาะผู้ลงสินค้า หรือ Admin');
  const method=normalizeAuctionMethod(a.method);
  if(method==='english'){
    if((a.participants||[]).length<3&&!isAdmin)throw Error('ต้องมีผู้เข้าร่วมอย่างน้อย 3 คนจึงจะปิดประมูลได้');
    if(a.last_bid_at && now()<Number(a.last_bid_at)+5*60000 && now()<Number(a.end_at||0) && !isAdmin)throw Error('ต้องรอ 5 นาทีหลังผู้ประมูลคนล่าสุด หรือรอหมดเวลา');
  }else{
    if(now()<Number(a.end_at||0)&&!isAdmin)throw Error('ยังไม่หมดเวลาประมูล');
  }
  const row=closeAuction(a);res.json({winner:row,auction:au(a,u.id)})
}catch(e){res.status(400).json({error:e.message})}});

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
  const payout=Number(o.amount||0)-Number(o.service_fee||0)-Number(o.sale_success_fee||0)+Number(o.escrow_cashback||0);
  if(payout<0)throw Error('ยอดจ่ายผู้ขายผิดปกติ');
  bal(s.id,o.currency,payout,'รับเงิน Escrow',o.item_title,{ref_type:'order',ref_id:o.id});
  if(o.seller_vip_penalty_income)bal(s.id,'credit',o.seller_vip_penalty_income,'รับ Credit ประมูล VIP',o.item_title,{ref_type:'order',ref_id:o.id});
  s.trust_completed_sales=(s.trust_completed_sales||0)+1;
  o.status='COMPLETED';o.escrow_status='RELEASED';o.released_at=now();o.resolved_by=by;o.resolved_by_user_id=actor_id;o.resolution_note=note||'';o.updated_at=now();
  const held=db.escrow.find(e=>e.order_id==o.id&&e.status==='HELD');if(held){held.status='RELEASED';held.updated_at=now()}
  db.escrow.push({id:nid('escrow'),order_id:o.id,amount:o.amount,currency:o.currency,status:'RELEASED',type:'RELEASE',created_at:now(),note:'Escrow V2: ปล่อยเงินให้ผู้ขาย'});
  escrowEvent(o,'RELEASE',actor_id,note||'ปล่อยเงินให้ผู้ขาย',{payout,service_fee:o.service_fee,sale_success_fee:o.sale_success_fee,escrow_cashback:o.escrow_cashback,by});audit(actor_id,'ESCROW_RELEASE','order',o.id,{payout,service_fee:o.service_fee,sale_success_fee:o.sale_success_fee,escrow_cashback:o.escrow_cashback,by,note});
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
    seller_name:(seller?.display_name||seller?.username||'-'),
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



app.get('/api/ads',(req,res)=>{
  runQuestionAdPolicyCheck(false);
  const rows=(db.ads||[]).filter(a=>a.status==='active').sort((a,b)=>(b.created_at||0)-(a.created_at||0)).map(a=>publicAd(a,req.session.userId));
  res.json({ads:rows});
});
app.get('/api/ads/my',need,(req,res)=>res.json({ads:(db.ads||[]).filter(a=>a.owner_id==req.session.userId).sort((a,b)=>(b.created_at||0)-(a.created_at||0)).map(a=>publicAd(a,req.session.userId))}));
app.post('/api/ads',need,up.fields([{name:'cover',maxCount:1},{name:'media',maxCount:1}]),(req,res)=>{try{
  const b=req.body||{};
  const type=String(b.type||'video');
  if(!['video','question'].includes(type))return res.status(400).json({error:'ประเภทโฆษณาไม่ถูกต้อง'});
  const reward_currency=String(b.reward_currency||'coin').toLowerCase();
  if(!['coin','credit'].includes(reward_currency))return res.status(400).json({error:'รางวัลต้องเป็น Coin หรือ Credit'});
  const reward_amount=Number(b.reward_amount||0);if(!Number.isFinite(reward_amount)||reward_amount<=0)return res.status(400).json({error:'กำหนดรางวัลให้ถูกต้อง'});
  const title=String(b.title||'').trim(), description=String(b.description||'').trim();
  if(!title||!description)return res.status(400).json({error:'กรอกชื่อและรายละเอียดโฆษณา'});
  let view_seconds=Math.min(120,Math.max(10,Number(b.view_seconds||10)));
  let question=String(b.question||'').trim(), answer=String(b.answer||'').trim();
  if(type==='question'&&(!question||!answer))return res.status(400).json({error:'โฆษณาแบบตอบคำถามต้องมีคำถามและคำตอบ'});
  const reward_code=String(b.reward_code||'').trim(); if(reward_code&&!validRewardCode(reward_code))return res.status(400).json({error:'โค้ดของรางวัลต้องใช้ A-Z a-z 0-9 เท่านั้น'});
  const reward_code_trigger=String(b.reward_code_trigger||'none'); const activity_link=String(b.activity_link||'').trim();
  const coverFile=req.files?.cover?.[0], mediaFile=req.files?.media?.[0];
  const cover_url=coverFile?'/uploads/'+coverFile.filename:String(b.cover_url||'').trim();
  const media_url=mediaFile?'/uploads/'+mediaFile.filename:String(b.media_url||'').trim();
  if(type==='video'&&!media_url)return res.status(400).json({error:'โฆษณาวิดีโอต้องมีไฟล์หรือ URL วิดีโอ'});
  const a={id:nid('ad'),owner_id:req.session.userId,title,description,cover_url:cover_url||'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop',media_url,type,reward_currency,reward_amount,view_seconds,question:type==='question'?question:'',answer:type==='question'?answer:'',reward_code,reward_code_trigger,activity_link,status:'active',created_at:now(),updated_at:now(),deleted_reason:''};
  db.ads.unshift(a);audit(req.session.userId,'ad:create','ad',a.id,{type,reward_currency,reward_amount});save();res.json({ad:publicAd(a,req.session.userId)});
}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/ads/:id',(req,res)=>{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบโฆษณา'});res.json({ad:publicAd(a,req.session.userId)});});
app.post('/api/ads/:id/start',need,(req,res)=>{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบโฆษณา'});const v=getOrCreateAdView(a.id,req.session.userId);save();res.json({view:v,ad:publicAd(a,req.session.userId)});});
app.post('/api/ads/:id/claim-video',need,(req,res)=>{try{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบโฆษณา'});if(a.type!=='video')return res.status(400).json({error:'โฆษณานี้ไม่ใช่วิดีโอ'});const v=(db.ad_views||[]).find(x=>x.ad_id==a.id&&x.user_id==req.session.userId);if(!v)return res.status(400).json({error:'กรุณาเริ่มดูโฆษณาก่อน'});if(now()-Number(v.last_started_at||v.started_at)<Number(a.view_seconds||10)*1000)return res.status(400).json({error:'ยังดูไม่ครบเวลาที่กำหนด'});const rr=rewardAdViewer(a,v);audit(req.session.userId,'ad:reward','ad',a.id,{type:'video',already:rr.already});save();res.json({ok:true,already:rr.already,user:pub(user(req.session.userId)),ad:publicAd(a,req.session.userId)});}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/ads/:id/reward-code',need,(req,res)=>{try{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบโฆษณา'});if(!a.reward_code)return res.status(400).json({error:'โฆษณานี้ไม่มีโค้ดของรางวัล'});const claimKey='ad_code_'+a.id;if((db.reward_claims||[]).some(c=>c.activity_id===claimKey&&c.user_id==req.session.userId))return res.status(400).json({error:'บัญชีนี้รับโค้ดแล้ว'});db.reward_claims.push({id:nid('reward_claim'),activity_id:claimKey,user_id:req.session.userId,code:a.reward_code,source:'ad_code',activity_link:a.activity_link||'',created_at:now()});save();res.json({code:a.reward_code,activity_link:a.activity_link||''})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/ads/:id/answer',need,(req,res)=>{try{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')return res.status(404).json({error:'ไม่พบโฆษณา'});if(a.type!=='question')return res.status(400).json({error:'โฆษณานี้ไม่ใช่แบบตอบคำถาม'});const v=getOrCreateAdView(a.id,req.session.userId);const answer=String(req.body.answer||'').trim();v.answer_text=answer;v.updated_at=now();if(!adAnswerOk(a.answer,answer)){v.answer_correct=false;save();return res.status(400).json({error:'คำตอบไม่ถูกต้อง กรุณาอ่านเนื้อหาโฆษณาแล้วลองใหม่'});}v.answer_correct=true;const rr=rewardAdViewer(a,v);audit(req.session.userId,'ad:reward','ad',a.id,{type:'question',already:rr.already});save();res.json({ok:true,already:rr.already,user:pub(user(req.session.userId)),ad:publicAd(a,req.session.userId)});}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/ads',admin,(req,res)=>res.json({ads:(db.ads||[]).map(a=>publicAd(a,req.session.userId)),checks:(db.ad_checks||[]).slice(0,30)}));
app.post('/api/admin/ads/run-check',admin,(req,res)=>res.json(runQuestionAdPolicyCheck(true)));
app.post('/api/admin/ads/:id/delete',admin,(req,res)=>{const a=(db.ads||[]).find(x=>x.id==req.params.id);if(!a)return res.status(404).json({error:'ไม่พบโฆษณา'});a.status='deleted';a.deleted_at=now();a.deleted_reason=req.body.reason||'Admin ลบโฆษณา';audit(req.session.userId,'ad:delete','ad',a.id,{reason:a.deleted_reason});save();res.json({ad:publicAd(a,req.session.userId)});});

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
load().then(initialDb=>{db=initialDb;ensureSystemDefaults();save();serverHttp.listen(PORT,()=>console.log('BidMarket Persistent DB '+(USE_POSTGRES?'PostgreSQL':'JSON local')+' http://localhost:'+PORT));}).catch(err=>{console.error('Cannot start server:',err);process.exit(1);});
