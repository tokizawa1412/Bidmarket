require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), fs=require('fs'), path=require('path'), multer=require('multer'), {v4:uuid}=require('uuid');
const {Pool}=require('pg');
let S3Client, PutObjectCommand, cloudinary;
try{({S3Client,PutObjectCommand}=require('@aws-sdk/client-s3'))}catch(_){/* optional Cloudflare R2/S3 storage disabled until dependency is installed */}
try{cloudinary=require('cloudinary').v2}catch(_){/* optional Cloudinary storage disabled until dependency is installed */}
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

const STORAGE_DRIVER=(process.env.STORAGE_DRIVER||'auto').toLowerCase();
function cloudinaryEnabled(){return !!(cloudinary&&process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET)}
function mediaStorageEnabled(){return STORAGE_DRIVER==='r2'&&S3Client&&process.env.R2_ACCOUNT_ID&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY&&process.env.R2_BUCKET}
function mediaPublicBase(){return String(process.env.R2_PUBLIC_URL||'').replace(/\/+$/,'')}
function safeExt(name,mime){let ext=path.extname(name||'').toLowerCase();if(ext&&/^[.][a-z0-9]{1,8}$/.test(ext))return ext; if(String(mime||'').includes('png'))return '.png'; if(String(mime||'').includes('webp'))return '.webp'; if(String(mime||'').includes('gif'))return '.gif'; if(String(mime||'').includes('mp4'))return '.mp4'; if(String(mime||'').includes('webm'))return '.webm'; return '.jpg'}
function mediaKey(folder,file){folder=String(folder||'uploads').replace(/[^a-zA-Z0-9_/-]/g,'').replace(/^\/+|\/+$/g,'')||'uploads';return `${folder}/${new Date().toISOString().slice(0,10)}/${Date.now()}-${uuid()}${safeExt(file?.originalname,file?.mimetype)}`}
async function uploadToCloudinary(file,folder='uploads'){
  if(!cloudinaryEnabled())return '';
  cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
  const cleanFolder=String(folder||'bidmarket').replace(/[^a-zA-Z0-9_/-]/g,'').replace(/^\/+|\/+$/g,'')||'bidmarket';
  return await new Promise((resolve,reject)=>{
    const stream=cloudinary.uploader.upload_stream({folder:`bidmarket/${cleanFolder}`,resource_type:'auto',use_filename:true,unique_filename:true,overwrite:false},(err,result)=>{
      if(err)return reject(err);
      resolve(result.secure_url);
    });
    stream.end(file.buffer||fs.readFileSync(file.path));
  });
}
async function saveUploadedFile(file,folder='uploads'){
  if(!file)return '';
  const useCloudinary=(STORAGE_DRIVER==='auto'||STORAGE_DRIVER==='cloudinary')&&cloudinaryEnabled();
  if(useCloudinary)return await uploadToCloudinary(file,folder);
  const key=mediaKey(folder,file);
  const body=file.buffer||fs.readFileSync(file.path);
  if(mediaStorageEnabled()){
    const client=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
    await client.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:body,ContentType:file.mimetype||'application/octet-stream'}));
    const base=mediaPublicBase();
    if(base)return `${base}/${key}`;
    return `r2://${process.env.R2_BUCKET}/${key}`;
  }
  const out=path.join(uploadDir,path.basename(key));
  fs.writeFileSync(out,body);
  return '/uploads/'+path.basename(out);
}
async function saveUploadedFiles(files,folder='uploads'){return await Promise.all((files||[]).map(f=>saveUploadedFile(f,folder)))}
function storageStatus(){
  const driver=((STORAGE_DRIVER==='auto'||STORAGE_DRIVER==='cloudinary')&&cloudinaryEnabled())?'cloudinary':(mediaStorageEnabled()?'r2':'local');
  return {driver,configured_driver:STORAGE_DRIVER,cloudinary_ready:cloudinaryEnabled(),r2_ready:mediaStorageEnabled(),public_url:driver==='r2'?(mediaPublicBase()||null):null,warning:driver==='local'?'ยังไม่ได้ตั้งค่า Cloudinary/R2 ครบ ระบบจะเก็บไฟล์ใน /public/uploads ซึ่งไม่ถาวรบน Render Free':null}
}
const now=()=>Date.now(), img='https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1200&auto=format&fit=crop';
function fresh(){const h=bcrypt.hashSync('1234',10);return {next:{user:3,auc:3,tx:1,order:1,escrow:1,dispute:1,estimate:1,ad:1,msg:1,payment:1},users:[{id:1,username:'demo',email:'demo@x.local',password_hash:h,role:'admin',status:'active',display_name:'Demo Admin',avatar_url:'',bio:'',coin:5e6,credit:50000,token:20,vip_until:now()+31536e6,trust_completed_sales:0,trust_total_orders:0},{id:2,username:'seller',email:'seller@x.local',password_hash:h,role:'user',status:'active',display_name:'VIP Seller',avatar_url:'',bio:'',coin:2e6,credit:30000,token:5,vip_until:now()+15552e6,trust_completed_sales:0,trust_total_orders:0}],auctions:[{id:1,seller_id:2,level:'vip',method:'forward',currency:'credit',title:'Rolex Submariner Vintage',description:'ตัวอย่าง VIP + Escrow',category:'ของสะสม',image_url:'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:10000,current_bid:10000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+7200e3,status:'active',vip_entry_min_credit:7000,vip_entry_fee_percent:5},{id:2,seller_id:1,level:'general',method:'forward',currency:'credit',title:'iPhone 15 Pro Max',description:'ตัวอย่างประมูลทั่วไป + Escrow',category:'มือถือ',image_url:'https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=1200&auto=format&fit=crop',media_type:'image',start_price:20000,current_bid:20000,winner_id:null,last_bidder_id:null,bids_count:0,participants:[],bidder_last_amounts:{},vip_entries:[],chats:[],start_at:now()-1e5,end_at:now()+86400e3,status:'active',vip_entry_min_credit:0,vip_entry_fee_percent:0}],orders:[],escrow:[],disputes:[],transactions:[],favorites:[],messages:[],estimates:[],ads:[],company_revenue:[],winners:[]}}

function yyMmFromTs(ts){
  const d=new Date(Number(ts||now()));
  const yy=String(d.getFullYear()).slice(-2);
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return yy+mm;
}
function randomSecurityCode(len=4){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out='';
  for(let i=0;i<len;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function ensureBidMarketUserIds(d){
  const counters={};
  (d.users||[]).sort((a,b)=>Number(a.created_at||0)-Number(b.created_at||0)||Number(a.id||0)-Number(b.id||0)).forEach(u=>{
    u.created_at??=now();
    const ym=yyMmFromTs(u.created_at);
    counters[ym]=(counters[ym]||0)+1;
    if(!u.public_user_id||!/^[B][M][0-9]{4}[0-9]{6}[A-Z0-9]{4}$/.test(String(u.public_user_id))){
      let candidate;
      do{candidate='BM'+ym+String(counters[ym]).padStart(6,'0')+randomSecurityCode(4)}while((d.users||[]).some(x=>x!==u&&x.public_user_id===candidate));
      u.public_user_id=candidate;
    }
  });
}
function newBidMarketUserId(createdAt){
  const ym=yyMmFromTs(createdAt||now());
  const seq=(db?.users||[]).filter(u=>yyMmFromTs(u.created_at||now())===ym).length+1;
  let candidate;
  do{candidate='BM'+ym+String(seq).padStart(6,'0')+randomSecurityCode(4)}while((db?.users||[]).some(u=>u.public_user_id===candidate));
  return candidate;
}

function normalizeDb(d){
  ['orders','escrow','disputes','transactions','favorites','messages','estimates','ads','ad_views','ad_checks','company_revenue','winners','payments','audit_logs','escrow_events','activities','activity_reports','activity_participants','reward_codes','reward_claims','topup_reward_claims','review_queue','fee_logs','pin_logs','notifications','friends','profile_posts','profile_showcase','collection_items','collection_auctions','r_value_clicks','r_weekly_checks','r_coin_ledger','auto_bids','market_items'].forEach(k=>d[k]||(d[k]=[]));
  d.next||(d.next={});
  ['user','auc','tx','order','escrow','dispute','estimate','ad','ad_view','msg','payment','audit','escrow_event','activity','activity_report','activity_participant','reward_code','reward_claim','topup_reward_claim','review_queue','fee_log','pin_log','notification','friend','profile_post','profile_showcase','collection_item','collection_auction','r_value_click','r_weekly_check','r_coin_ledger','auto_bid','market_item'].forEach(k=>d.next[k]||(d.next[k]=1));
  (d.users||[]).forEach(u=>{u.trust_completed_sales??=0;u.trust_total_orders??=0;u.avatar_url??='';u.profile_image_url??=u.avatar_url||'';u.profile_banner_url??='';u.profile_image_changed_at??=0;u.profile_banner_changed_at??=0;u.display_name??=u.username;u.role??='user';u.status??='active';u.google_id??='';u.auth_provider??=(u.google_id?'google':'local');u.credit??=0;u.coin??=0;u.token??=0;u.vip_until??=0;u.vip_level??=(u.vip_until>now()?'Member':'Member');u.vip_points??=0;u.vip_coin_spent_for_silver??=0;u.vip_credit_spent_for_silver??=0;u.username_change_count??=0;u.elite_free_pin_month??='';u.lifetime_credit_topup??=0;u.r_coin??=0;u.collection_value??=0;u.value_boost_daily_used??=0;u.value_boost_daily_key??='';u.verified??=!!u.google_id;u.created_at??=now();if(u.vip_level==='Emerald')u.vip_level='Ruby'});
  ensureBidMarketUserIds(d);
  (d.orders||[]).forEach(o=>{o.escrow_version??='v1';o.timeline??=[];o.audit_refs??=[];o.locked_amount??=Number(o.amount||0);o.service_fee??=Number(o.service_fee||0);o.escrow_status??=(['COMPLETED','REFUNDED'].includes(o.status)?o.status:'HELD')});
  (d.ads||[]).forEach(a=>{a.status??='active';a.reward_currency??='coin';a.reward_amount=Number(a.reward_amount||0);a.type??='video';a.view_seconds=Math.min(120,Math.max(10,Number(a.view_seconds||10)));a.cover_url??='';a.media_url??='';a.description??='';a.question??='';a.answer??='';a.created_at??=now();a.deleted_reason??='';a.reward_code??='';a.reward_code_trigger??='none';a.activity_link??=''});
  (d.ad_views||[]).forEach(v=>{v.rewarded??=false;v.completed??=false;v.answer_correct??=false;v.view_count=Number(v.view_count||1);v.started_at??=now()});
  (d.auctions||[]).forEach(a=>{a.method=normalizeAuctionMethod(a.method);a.currency=['credit','coin'].includes(a.currency)?a.currency:'credit';a.participants??=[];a.bidder_last_amounts??={};a.highest_bid_by_user??={...a.bidder_last_amounts};a.bid_history??=[];a.bid_fee=Number(a.bid_fee||0);a.countdown_seconds=Number(a.countdown_seconds||30);a.last_bid_at=Number(a.last_bid_at||0);a.fee_pool=Number(a.fee_pool||0);if(a.method==='fee'){a.start_price=0;a.current_bid=Number(a.current_bid||0)}});
  (d.auto_bids||[]).forEach(ab=>{ab.auction_id=Number(ab.auction_id);ab.user_id=Number(ab.user_id);ab.budget_amount=Number(ab.budget_amount||0);ab.remaining_budget=Number(ab.remaining_budget||0);ab.is_active=ab.is_active!==false&&ab.status!=='disabled';ab.created_at=Number(ab.created_at||now());ab.updated_at=Number(ab.updated_at||ab.created_at);ab.last_triggered_at=Number(ab.last_triggered_at||0);});
  return d;
}
function loadLocal(){
  if(!fs.existsSync(dbFile))fs.writeFileSync(dbFile,JSON.stringify(fresh(),null,2));
  return normalizeDb(JSON.parse(fs.readFileSync(dbFile)));
}

async function ensureRealBackendSchema(){
  if(!USE_POSTGRES)return;
  const sql=fs.readFileSync(path.join(__dirname,'migrations','001_real_backend_schema.sql'),'utf8');
  await pgPool.query(sql);
  await pgPool.query("INSERT INTO backend_schema_meta(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()",['schema_version','001_real_backend_schema']);
}
function nval(v){const n=Number(v||0);return Number.isFinite(n)?n:0}
async function syncRealBackendTables(state){
  if(!USE_POSTGRES||!state)return;
  try{
    const client=await pgPool.connect();
    try{
      await client.query('BEGIN');
      for(const u of (state.users||[])){
        await client.query(`INSERT INTO backend_users(id,public_user_id,username,display_name,email,role,status,auth_provider,google_id,verified,avatar_url,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
          ON CONFLICT(id) DO UPDATE SET public_user_id=EXCLUDED.public_user_id,username=EXCLUDED.username,display_name=EXCLUDED.display_name,email=EXCLUDED.email,role=EXCLUDED.role,status=EXCLUDED.status,auth_provider=EXCLUDED.auth_provider,google_id=EXCLUDED.google_id,verified=EXCLUDED.verified,avatar_url=EXCLUDED.avatar_url,created_at=EXCLUDED.created_at,updated_at=now()`,
          [u.id,u.public_user_id||null,u.username||'',u.display_name||u.username||'',u.email||'',u.role||'user',u.status||'active',u.auth_provider||(u.google_id?'google':'local'),u.google_id||null,!!(u.verified||u.google_id),u.profile_image_url||u.avatar_url||'',nval(u.created_at)]);
        await client.query(`INSERT INTO backend_wallets(user_id,coin,credit,token,lifetime_credit_topup,updated_at)
          VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id) DO UPDATE SET coin=EXCLUDED.coin,credit=EXCLUDED.credit,token=EXCLUDED.token,lifetime_credit_topup=EXCLUDED.lifetime_credit_topup,updated_at=now()`,
          [u.id,nval(u.coin),nval(u.credit),nval(u.token),nval(u.lifetime_credit_topup)]);
        await client.query(`INSERT INTO backend_vip(user_id,vip_level,vip_points,vip_until,vip_coin_spent_for_silver,vip_credit_spent_for_silver,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(user_id) DO UPDATE SET vip_level=EXCLUDED.vip_level,vip_points=EXCLUDED.vip_points,vip_until=EXCLUDED.vip_until,vip_coin_spent_for_silver=EXCLUDED.vip_coin_spent_for_silver,vip_credit_spent_for_silver=EXCLUDED.vip_credit_spent_for_silver,updated_at=now()`,
          [u.id,u.vip_level||'Member',nval(u.vip_points),nval(u.vip_until),nval(u.vip_coin_spent_for_silver),nval(u.vip_credit_spent_for_silver)]);
      }
      for(const a of (state.auctions||[])){
        await client.query(`INSERT INTO backend_auctions(id,seller_id,title,description,category,level,method,currency,start_price,current_bid,winner_id,last_bidder_id,bids_count,status,image_url,media_type,start_at,end_at,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
          ON CONFLICT(id) DO UPDATE SET seller_id=EXCLUDED.seller_id,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,level=EXCLUDED.level,method=EXCLUDED.method,currency=EXCLUDED.currency,start_price=EXCLUDED.start_price,current_bid=EXCLUDED.current_bid,winner_id=EXCLUDED.winner_id,last_bidder_id=EXCLUDED.last_bidder_id,bids_count=EXCLUDED.bids_count,status=EXCLUDED.status,image_url=EXCLUDED.image_url,media_type=EXCLUDED.media_type,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,created_at=EXCLUDED.created_at,updated_at=now()`,
          [a.id,a.seller_id||null,a.title||'',a.description||'',a.category||'',a.level||'general',a.method||'forward',a.currency||'credit',nval(a.start_price),nval(a.current_bid),a.winner_id||null,a.last_bidder_id||null,Math.floor(nval(a.bids_count)),a.status||'active',a.image_url||'',a.media_type||'image',nval(a.start_at),nval(a.end_at),nval(a.created_at||a.start_at)]);
        for(const b of (a.bid_history||[])){
          await client.query(`INSERT INTO backend_bids(auction_id,user_id,amount,currency,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(auction_id,user_id,amount,created_at) DO NOTHING`,[a.id,b.user_id||b.bidder_id||null,nval(b.amount||b.bid),b.currency||a.currency||'credit',nval(b.created_at||b.time)]);
        }
      }
      for(const ab of (state.auto_bids||[])){
        await client.query(`INSERT INTO backend_auto_bids(id,auction_id,user_id,budget_amount,remaining_budget,currency,is_active,last_triggered_at,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
          ON CONFLICT(id) DO UPDATE SET auction_id=EXCLUDED.auction_id,user_id=EXCLUDED.user_id,budget_amount=EXCLUDED.budget_amount,remaining_budget=EXCLUDED.remaining_budget,currency=EXCLUDED.currency,is_active=EXCLUDED.is_active,last_triggered_at=EXCLUDED.last_triggered_at,created_at=EXCLUDED.created_at,updated_at=now()`,
          [ab.id,ab.auction_id||null,ab.user_id||null,nval(ab.budget_amount),nval(ab.remaining_budget),ab.currency||'credit',!!ab.is_active,nval(ab.last_triggered_at),nval(ab.created_at)]);
      }
      for(const mi of (state.market_items||[])){
        await client.query(`INSERT INTO backend_market_items(id,seller_id,buyer_id,title,description,category,image_url,price,currency,status,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT(id) DO UPDATE SET seller_id=EXCLUDED.seller_id,buyer_id=EXCLUDED.buyer_id,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,image_url=EXCLUDED.image_url,price=EXCLUDED.price,currency=EXCLUDED.currency,status=EXCLUDED.status,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
          [mi.id,mi.seller_id||null,mi.buyer_id||null,mi.title||'',mi.description||'',mi.category||'',mi.image_url||'',nval(mi.price),mi.currency||'credit',mi.status||'active',nval(mi.created_at),nval(mi.updated_at||mi.created_at)]);
      }
      for(const t of (state.transactions||[])){
        await client.query(`INSERT INTO backend_transactions(id,user_id,type,amount,currency,note,before_balance,after_balance,ref_type,ref_id,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,type=EXCLUDED.type,amount=EXCLUDED.amount,currency=EXCLUDED.currency,note=EXCLUDED.note,before_balance=EXCLUDED.before_balance,after_balance=EXCLUDED.after_balance,ref_type=EXCLUDED.ref_type,ref_id=EXCLUDED.ref_id,created_at=EXCLUDED.created_at,updated_at=now()`,
          [t.id,t.user_id||null,t.type||'unknown',nval(t.amount),t.currency||'',t.note||'',t.before_balance??null,t.after_balance??null,t.ref_type||'',String(t.ref_id||''),nval(t.created_at)]);
      }
      for(const o of (state.orders||[])){
        await client.query(`INSERT INTO backend_orders(id,auction_id,buyer_id,seller_id,amount,currency,status,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET auction_id=EXCLUDED.auction_id,buyer_id=EXCLUDED.buyer_id,seller_id=EXCLUDED.seller_id,amount=EXCLUDED.amount,currency=EXCLUDED.currency,status=EXCLUDED.status,created_at=EXCLUDED.created_at,updated_at=now()`,
          [o.id,o.auction_id||null,o.buyer_id||null,o.seller_id||null,nval(o.amount),o.currency||'credit',o.status||'pending',nval(o.created_at)]);
      }
      for(const n of (state.notifications||[])){
        await client.query(`INSERT INTO backend_notifications(id,user_id,title,body,type,data,read_at,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,title=EXCLUDED.title,body=EXCLUDED.body,type=EXCLUDED.type,data=EXCLUDED.data,read_at=EXCLUDED.read_at,created_at=EXCLUDED.created_at,updated_at=now()`,
          [n.id,n.user_id||null,n.title||'',n.body||n.message||'',n.type||n.data?.type||n.meta?.type||'',JSON.stringify(n.data||n.meta||{}),n.read?Number(n.read_at||n.updated_at||n.created_at||0):nval(n.read_at),nval(n.created_at)]);
      }
      for(const a of (state.audit_logs||[])){
        await client.query(`INSERT INTO backend_audit_logs(id,actor_id,action,target_type,target_id,details,ip,user_agent,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [a.id,a.actor_id||null,a.action||'',a.target_type||'',String(a.target_id||''),JSON.stringify(a.details||{}),a.ip||'',a.user_agent||'',nval(a.created_at)]);
      }
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }catch(e){console.error('Real backend sync failed:',e.message)}
}

async function initPostgres(){
  await ensureRealBackendSchema();
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
  await syncRealBackendTables(initial);
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
    saveQueue=saveQueue.then(async()=>{const stateObj=JSON.parse(snapshot);await pgPool.query('UPDATE app_state SET state=$1, updated_at=now() WHERE id=$2',[stateObj,'main']);await syncRealBackendTables(stateObj);}).catch(e=>console.error('PostgreSQL save failed:',e.message));
  }
}
const nid=k=>(db.next[k]=db.next[k]||1,db.next[k]++);const user=id=>db.users.find(u=>u.id==id);const uname=n=>db.users.find(u=>u.username==n);const trust=u=>u&&u.trust_total_orders?Math.round(u.trust_completed_sales/u.trust_total_orders*100):50;
function pub(u){if(!u)return null;const beforeLevel=currentVipLevel(u);const changed=runVipLevelUp(u);if(changed&&currentVipLevel(u)!==beforeLevel)save();const benefits=getVipBenefits(u);return {id:u.id,public_user_id:u.public_user_id,user_id16:u.public_user_id,username:u.display_name||u.username,email:u.email,role:u.role,status:u.status,display_name:u.display_name||u.username,avatar_url:u.profile_image_url||u.avatar_url,bio:u.bio||'',profile_image_url:u.profile_image_url||u.avatar_url||'',profile_banner_url:u.profile_banner_url||'',profile_image_changed_at:Number(u.profile_image_changed_at||0),profile_banner_changed_at:Number(u.profile_banner_changed_at||0),coin:u.coin,credit:u.credit,token:u.token,is_vip:vip(u),vip_until:u.vip_until,vip_level:currentVipLevel(u),vip_points:Number(u.vip_points||0),vip_coin_spent_for_silver:Number(u.vip_coin_spent_for_silver||0),vip_credit_spent_for_silver:Number(u.vip_credit_spent_for_silver||0),vip_benefits:benefits,username_change_count:Number(u.username_change_count||0),lifetime_credit_topup:Number(u.lifetime_credit_topup||0),trust_rate:trust(u),trust_completed_sales:u.trust_completed_sales,trust_total_orders:u.trust_total_orders,verified:!!u.verified||!!u.google_id,google_linked:!!u.google_id,collection_value:Number(u.collection_value||0),r_coin:Number(u.r_coin||0)}}
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
    u.public_user_id=newBidMarketUserId(u.created_at);u.verified=true;
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

function isAuctionExpired(a){return !!(a&&a.status==='active'&&Number(a.end_at||0)>0&&now()>=Number(a.end_at));}
function cleanupExpiredAuctions(){
  if(!db||!db.auctions)return;
  let changed=false;
  db.auctions.forEach(a=>{
    if(!isAuctionExpired(a))return;
    if(a.winner_id){
      try{closeAuction(a);changed=true;}catch(e){console.warn('auto close expired auction failed',a.id,e.message)}
    }else{
      a.status='expired';a.expired_at=now();changed=true;
      try{emitAuctionUpdate(a,'auction:closed')}catch(e){}
    }
  });
  if(changed)save();
}
function auctionVisibleInList(a,level){return a&&a.status==='active'&&a.level===level&&!isAuctionExpired(a)}
function need(req,res,next){if(!req.session.userId)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});let u=user(req.session.userId);if(!u||u.status!=='active')return res.status(403).json({error:'บัญชีถูกระงับ'});next()}function admin(req,res,next){let u=user(req.session.userId);if(!u||u.role!='admin')return res.status(403).json({error:'เฉพาะ Admin'});next()}
app.use('/api/admin',(req,res,next)=>{
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    res.on('finish',()=>{
      if(res.statusCode<400){
        audit(req.session?.userId||null,'admin:http_'+req.method.toLowerCase(),'admin_api',req.originalUrl,{method:req.method,path:req.originalUrl,statusCode:res.statusCode,body:Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>!String(k).toLowerCase().includes('password')))});
        try{save()}catch(e){}
      }
    });
  }
  next();
});
function tx(uid,type,amount,currency,note='',meta={}){let u=user(uid),before=meta.before_balance,after=meta.after_balance;db.transactions.unshift({id:nid('tx'),user_id:uid,type,amount,currency,note,before_balance:before,after_balance:after,ref_type:meta.ref_type||'',ref_id:meta.ref_id||'',created_at:now()})}
function audit(actor_id,action,target_type,target_id,details={}){
  db.audit_logs=db.audit_logs||[];
  const actor=actor_id?user(actor_id):null;
  const row={
    id:nid('audit'),
    actor_id:actor_id||null,
    actor_name:actor?(actor.display_name||actor.username||String(actor.id)):'system',
    action:String(action||'unknown'),
    target_type:String(target_type||'system'),
    target_id:target_id??'',
    details:details||{},
    ip:details?.ip||'',
    user_agent:details?.user_agent||'',
    created_at:now()
  };
  db.audit_logs.unshift(row);
  // Keep local JSON from growing without limit. PostgreSQL sync still keeps rows already inserted.
  if(db.audit_logs.length>5000)db.audit_logs=db.audit_logs.slice(0,5000);
  return row;
}
function auditValueChange(actor_id,action,target_type,target_id,field,before,after,extra={}){
  if(String(before)===String(after))return null;
  return audit(actor_id,action,target_type,target_id,{field,before,after,...extra});
}
function actorFromMeta(meta,defaultUserId){
  if(meta&&meta.actor_id)return meta.actor_id;
  if(meta&&meta.ref_type==='admin'&&meta.ref_id)return meta.ref_id;
  return defaultUserId||null;
}
function escrowEvent(order,type,actor_id,note='',details={}){const ev={id:nid('escrow_event'),order_id:order?.id||null,type,actor_id:actor_id||null,note,details,created_at:now()};db.escrow_events.unshift(ev);if(order){order.timeline=order.timeline||[];order.timeline.unshift(ev)}return ev}

const CREDIT_THB_RATE=6;
const CREDIT_TOPUP_MIN=10;
const COIN_PER_CREDIT=100;
const VIP_LEVEL_ORDER=['Member','Silver','Gold','Sapphire','Platinum','Diamond','Ruby','Elite'];
const VIP_LEVEL_THRESHOLDS={Member:0,Silver:100,Gold:2000,Sapphire:15000,Platinum:50000,Diamond:300000,Ruby:600000,Elite:1000000};
const VIP_NEXT_REQUIREMENT={Member:100,Silver:2000,Gold:15000,Sapphire:50000,Platinum:300000,Diamond:600000,Ruby:1000000,Elite:1000000};
const VIP_SALE_FEE_RATE={Member:0.06,Silver:0.059,Gold:0.058,Sapphire:0.056,Platinum:0.054,Diamond:0.05,Ruby:0.045,Elite:0.04};
const VIP_ESCROW_CASHBACK={Member:0.05,Silver:0.10,Gold:0.15,Sapphire:0.20,Platinum:0.25,Diamond:0.30,Ruby:0.35,Elite:0.40};
const VIP_ACTIVITY_DISCOUNT={Member:0,Silver:0,Gold:0.10,Sapphire:0.20,Platinum:0.25,Diamond:0.30,Ruby:0.35,Elite:0.40};
const VIP_COLLECTION_CAPACITY={Member:0,Silver:5,Gold:10,Sapphire:15,Platinum:20,Diamond:30,Ruby:35,Elite:50};
const VIP_VALUE_BOOST_DAILY_LIMIT={Member:0,Silver:0,Gold:0,Sapphire:2,Platinum:3,Diamond:5,Ruby:7,Elite:10};
const VIP_RENAME_FREE_MONTHLY={Member:0,Silver:0,Gold:0,Sapphire:1,Platinum:1,Diamond:2,Ruby:3,Elite:9999};
const VIP_PIN_FREE_MONTHLY={Member:0,Silver:0,Gold:0,Sapphire:1,Platinum:1,Diamond:2,Ruby:3,Elite:3};
const VIP_BENEFIT_TEXT={
  Member:['เข้า Vip Zone ได้','ใช้การประมูลแบบ ปิดซองได้','เงินคืน Escrow Fee 5%'],
  Silver:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 5.9%','เงินคืน Escrow Fee 10%','คลังสินค้าคอลเลคชั่น 5 รูป'],
  Gold:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 5.8%','เงินคืน Escrow Fee 15%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 10%','ส่วนลดการเปลี่ยนชื่อ 40% (1 ครั้งต่อเดือน)','คลังสินค้าคอลเลคชั่น 10 รูป'],
  Sapphire:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 5.6%','เงินคืน Escrow Fee 20%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 20%','เปลี่ยนชื่อฟรี 1 ครั้งต่อเดือน','ปักหมุดประมูลฟรี 1 ครั้งต่อเดือน','คลังสินค้าคอลเลคชั่น 15 รูป','กด เพิ่มมูลค่า สินค้าหน้าตู้โชว์ได้ 2 ครั้งต่อวัน'],
  Platinum:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 5.4%','เงินคืน Escrow Fee 25%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 25%','เปลี่ยนชื่อฟรี 1 ครั้งต่อเดือน','ปักหมุดประมูลฟรี 1 ครั้งต่อเดือน','คลังสินค้าคอลเลคชั่น 20 รูป','กด เพิ่มมูลค่า สินค้าหน้าตู้โชว์ได้ 3 ครั้งต่อวัน'],
  Diamond:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 5%','เงินคืน Escrow Fee 30%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 30%','เปลี่ยนชื่อฟรี 2 ครั้งต่อเดือน','ปักหมุดประมูลฟรี 2 ครั้งต่อเดือน','คลังสินค้าคอลเลคชั่น 30 รูป','กด เพิ่มมูลค่า สินค้าหน้าตู้โชว์ได้ 5 ครั้งต่อวัน'],
  Ruby:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 4.5%','เงินคืน Escrow Fee 35%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 35%','เปลี่ยนชื่อฟรี 3 ครั้งต่อเดือน','ปักหมุดประมูลฟรี 3 ครั้งต่อเดือน','คลังสินค้าคอลเลคชั่น 35 รูป','กด เพิ่มมูลค่า สินค้าหน้าตู้โชว์ได้ 7 ครั้งต่อวัน'],
  Elite:['คิดค่าธรรมเนียมสิ้นสุดการประมูลที่ 4%','เงินคืน Escrow Fee 40%','ส่วนลดค่าธรรมเนียมสร้างกิจกรรม 40%','เปลี่ยนชื่อฟรีไม่จำกัด','ปักหมุดประมูลฟรี 3 ครั้งต่อเดือน','คลังสินค้าคอลเลคชั่น 50 รูป','สิทธิ์การกด เพิ่มมูลค่า สินค้าหน้าตู้โชว์ได้ 10 ครั้งต่อวัน']
};
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

function roundFee(n){n=Math.max(0,Number(n)||0);const whole=Math.floor(n), frac=n-whole;return frac>=0.5?whole+1:whole}
function roundCoinHundred(n){n=Math.max(0,Number(n)||0);return Math.floor(n/100)*100}
function ceilFee(n){return roundFee(n);}
function currentVipLevel(u){const lv=(u?.vip_level==='Emerald'?'Ruby':u?.vip_level);return VIP_LEVEL_ORDER.includes(lv)?lv:'Member'}
function isVipActive(u){return !!u && (currentVipLevel(u)==='Elite' || Number(u.vip_until||0)>now())}
function vip(u){return isVipActive(u)}
function getVipBenefits(u){const level=currentVipLevel(u);return {level,is_vip:isVipActive(u),sale_fee_rate:VIP_SALE_FEE_RATE[level]??0.06,escrow_cashback_rate:VIP_ESCROW_CASHBACK[level]??0,activity_discount_rate:VIP_ACTIVITY_DISCOUNT[level]??0,collection_capacity:VIP_COLLECTION_CAPACITY[level]??0,value_boost_daily_limit:VIP_VALUE_BOOST_DAILY_LIMIT[level]??0,rename_free_monthly:VIP_RENAME_FREE_MONTHLY[level]??0,pin_free_monthly:VIP_PIN_FREE_MONTHLY[level]??0,benefit_text:VIP_BENEFIT_TEXT[level]||[],show_vip_card:VIP_LEVEL_ORDER.indexOf(level)>=1,elite_permanent:level==='Elite'}}
function calculateSaleFee(amount,u,currency='credit'){const rate=getVipBenefits(u).sale_fee_rate;let raw=Number(amount||0)*rate;return {amount:currency==='coin'?roundCoinHundred(raw):roundFee(raw),rate}}
function calculateEscrowFee(amount,currency='credit'){amount=Number(amount||0);let rate=0.01;if(amount>=500000)rate=0.07;else if(amount>=100000)rate=0.05;else if(amount>=50001)rate=0.04;else if(amount>=10001)rate=0.03;else if(amount>=1001)rate=0.02;return {amount:currency==='coin'?roundCoinHundred(amount*rate):roundFee(amount*rate),rate}}
function calculateEscrowCashback(fee,u,currency='credit'){const rate=getVipBenefits(u).escrow_cashback_rate;if(currency!=='credit')return {amount:0,rate};return {amount:roundFee(Number(fee||0)*rate),rate}}
function calculateActivityFee(days,currency,u){days=Math.max(1,Math.ceil(Number(days||1)));const base=currency==='coin'?5000:20;const discount=getVipBenefits(u).activity_discount_rate;let raw=base*days*(1-discount);return {base_per_day:base,days,currency,discount_rate:discount,amount:currency==='coin'?roundCoinHundred(raw):roundFee(raw)}}
function monthKeyBangkok(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'})).toISOString().slice(0,7)}
function levelByVipPoints(points){
  points=Number(points||0);
  let level='Member';
  for(const lv of VIP_LEVEL_ORDER){
    if(points>=Number(VIP_LEVEL_THRESHOLDS[lv]||0))level=lv;
  }
  return level;
}
function runVipLevelUp(u,actor_id=null,reason='vip_points'){
  if(!u)return false;
  const before=currentVipLevel(u);
  const target=levelByVipPoints(Number(u.vip_points||0));
  // ไม่หักคะแนน VIP เมื่อเลื่อนระดับ เพราะคะแนนนี้เป็นคะแนนสะสมถาวร
  if(VIP_LEVEL_ORDER.indexOf(target)>VIP_LEVEL_ORDER.indexOf(before)){
    u.vip_level=target;
    auditValueChange(actor_id||u.id,'vip:level_up','user',u.id,'vip_level',before,target,{reason,vip_points:Number(u.vip_points||0)});
    notifyUser(u.id,'VIP Level Up',`เลื่อนระดับเป็น ${target} แล้ว`,{type:'vip_levelup',level:target});
    return true;
  }
  return false;
}
function addVipPoints(u,points,actor_id,reason,extra={}){
  points=Math.floor(Number(points||0));
  if(!u||points<=0)return 0;
  const before=Number(u.vip_points||0);
  u.vip_points=before+points;
  auditValueChange(actor_id||u.id,'vip:points_change','user',u.id,'vip_points',before,u.vip_points,{delta:points,reason,...extra});
  runVipLevelUp(u,actor_id||u.id,reason);
  return points;
}
function spendCreditForVipPoints(u,amount,note='ใช้จ่าย Credit',actor_id=null){amount=Math.floor(Number(amount||0));if(!u||amount<=0||!isVipActive(u))return;const pts=Math.floor(amount/3);if(pts<=0)return;addVipPoints(u,pts,actor_id||u.id,'credit_spend',{credit_spent:amount,note})}
function addVipPointsByCreditPurchase(u,creditAmount){creditAmount=Math.floor(Number(creditAmount||0));if(!u||creditAmount<=0)throw Error('จำนวน Credit ไม่ถูกต้อง');bal(u.id,'credit',-creditAmount,'ซื้อ VIP Point','1 Credit = 1 VIP Point',{ref_type:'vip_point_purchase',actor_id:u.id});addVipPoints(u,creditAmount,u.id,'vip_point_purchase',{credit_spent:creditAmount});return creditAmount}
function spendCoinForVipSilver(u,amount,actor_id=null){amount=Math.floor(Number(amount||0));if(!u||amount<=0||!isVipActive(u))return;if(currentVipLevel(u)==='Member'){const before=Number(u.vip_coin_spent_for_silver||0);u.vip_coin_spent_for_silver=before+amount;auditValueChange(actor_id||u.id,'vip:silver_coin_progress','user',u.id,'vip_coin_spent_for_silver',before,u.vip_coin_spent_for_silver,{coin_spent:amount});runVipLevelUp(u,actor_id||u.id,'coin_spend')}}
function recordCompanyRevenue(amount,currency,type,ref={}){amount=ceilFee(amount);if(amount>0)db.company_revenue.unshift({amount,currency,type,ref_type:ref.ref_type||'',ref_id:ref.ref_id||'',created_at:now()})}
function bal(uid,c,delta,type,note='',meta={}){
  let u=user(uid);if(!u)throw Error('ไม่พบผู้ใช้');
  c=String(c||'').toLowerCase();if(!['coin','credit','token'].includes(c))throw Error('สกุลเงินไม่ถูกต้อง');
  delta=Number(delta||0);const before=Number(u[c]||0), after=before+delta;if(after<0)throw Error('ยอด '+c+' ไม่พอ');
  u[c]=after;
  tx(uid,type,delta,c,note,{...meta,before_balance:before,after_balance:after});
  audit(actorFromMeta(meta,uid),'wallet:'+c+'_change','user',uid,{currency:c,delta,before,after,type,note,ref_type:meta.ref_type||'',ref_id:meta.ref_id||''});
  if(delta<0&&c==='credit')spendCreditForVipPoints(u,Math.abs(delta),type,actorFromMeta(meta,uid));
  if(delta<0&&c==='coin')spendCoinForVipSilver(u,Math.abs(delta),actorFromMeta(meta,uid));
  emitWalletUpdate(uid,type);
}

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


function roomUser(uid){return `user:${Number(uid)}`}
function roomAuction(id){return `auction:${Number(id)}`}
function roomOrder(id){return `escrow:${Number(id)}`}
function notificationType(meta={}){return String(meta.type||meta.event||'system')}
function shouldStoreBellNotification(meta={}){
  const t=notificationType(meta);
  return !['outbid','escrow'].includes(t);
}
function normalizeNotification(n){
  if(!n)return n;
  n.meta=n.meta||n.data||{};
  n.data=n.data||n.meta||{};
  n.type=n.type||notificationType(n.meta);
  n.body=String(n.body||n.message||'');
  n.title=String(n.title||'แจ้งเตือน');
  n.created_at=Number(n.created_at||now());
  n.read=!!(n.read||Number(n.read_at||0)>0);
  n.read_at=n.read?Number(n.read_at||now()):0;
  return n;
}
function userNotifications(uid,limit=80){return (db.notifications||[]).filter(n=>Number(n.user_id)===Number(uid)&&shouldStoreBellNotification(n.meta||n.data||n)).map(normalizeNotification).sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0)).slice(0,limit)}
function unreadNotificationCount(uid){return userNotifications(uid,500).filter(n=>!n.read).length}
function emitNotificationUnread(uid){try{io.to(roomUser(uid)).emit('notification:unread',{count:unreadNotificationCount(uid),at:now()});}catch(e){}}
function emitWalletUpdate(uid, reason='wallet:update'){
  try{const u=user(uid); if(u) io.to(roomUser(uid)).emit('wallet:update',{user:pub(u),reason,at:now()});}catch(e){console.warn('emit wallet update failed',e.message)}
}
function notifyUser(uid,title,body='',meta={}){
  try{
    if(!uid)return null;
    if(!shouldStoreBellNotification(meta)){
      io.to(roomUser(uid)).emit('notification:silent',{title:String(title||'แจ้งเตือน'),body:String(body||''),type:notificationType(meta),meta:{...meta},created_at:now()});
      return null;
    }
    db.notifications=db.notifications||[];
    const n=normalizeNotification({id:nid('notification'),user_id:Number(uid),title:String(title||'แจ้งเตือน'),body:String(body||''),type:notificationType(meta),meta:{...meta},data:{...meta},read:false,read_at:0,created_at:now()});
    db.notifications.unshift(n);
    save();
    io.to(roomUser(uid)).emit('notification:new',n);
    emitNotificationUnread(uid);
    return n;
  }catch(e){console.warn('notify user failed',e.message);return null}
}
function notifyAdmin(title,body='',meta={}){
  try{
    const payload={title:String(title||'Admin notification'),body:String(body||''),meta:{...meta,admin:true},type:notificationType(meta),created_at:now()};
    (db.users||[]).filter(u=>u.role==='admin'&&u.status!=='suspended').forEach(u=>notifyUser(u.id,payload.title,payload.body,payload.meta));
    io.to('admin').emit('admin:notification',payload);
    return payload;
  }catch(e){console.warn('notify admin failed',e.message);return null}
}
function emitChatMessage(msg){
  try{
    const payload={...msg,from_name:user(msg.from_id)?.display_name||user(msg.from_id)?.username||'ผู้ใช้'};
    io.to(roomUser(msg.from_id)).emit('chat:message',payload);
    io.to(roomUser(msg.to_id)).emit('chat:message',payload);
  }catch(e){console.warn('emit chat failed',e.message)}
}
function emitEscrowUpdate(order,event='escrow:update'){
  try{
    if(!order)return;
    const payload=orderPublic(order);
    io.to(roomUser(order.buyer_id)).emit(event,payload);
    io.to(roomUser(order.seller_id)).emit(event,payload);
    io.to(roomOrder(order.id)).emit(event,payload);
    io.to('admin').emit(event,payload);
  }catch(e){console.warn('emit escrow update failed',e.message)}
}
function realtimeAuctionPayload(a) {
  return auctionApi(a);
}
function emitAuctionUpdate(a, event='auction:update') {
  try {
    const payload=realtimeAuctionPayload(a);
    io.to(roomAuction(a.id)).emit(event, payload);
    io.emit('auction:list:update',{id:a.id,level:a.level,status:a.status,current_bid:a.current_bid,currency:a.currency,method:a.method,at:now()});
  } catch (e) {
    console.warn('emit auction update failed', e.message);
  }
}
function emitOrderUpdate(order) {
  try {
    emitEscrowUpdate(order,'order:update');
  } catch (e) {
    console.warn('emit order update failed', e.message);
  }
}
function joinSocketUserRooms(socket){
  const sid=socket.request?.session?.userId;
  const u=sid?user(sid):null;
  if(!u||u.status!=='active')return null;
  socket.join(roomUser(u.id));
  if(u.role==='admin')socket.join('admin');
  socket.emit('notification:unread',{count:unreadNotificationCount(u.id),at:now()});
  return u;
}
io.on('connection', (socket) => {
  const authedUser=joinSocketUserRooms(socket);
  socket.emit('realtime:ready',{ok:true,user_id:authedUser?.id||null,at:now()});
  socket.on('user:join', () => {
    const u=joinSocketUserRooms(socket);
    socket.emit('realtime:ready',{ok:true,user_id:u?.id||null,at:now()});
  });
  socket.on('auction:join', (auctionId) => {
    socket.join(roomAuction(auctionId));
    const a = db.auctions.find(x => x.id === Number(auctionId));
    if (a) socket.emit('auction:update', realtimeAuctionPayload(a));
  });
  socket.on('auction:leave', (auctionId) => socket.leave(roomAuction(auctionId)));
  socket.on('auction:bid', (payload={}, ack) => {
    try{
      const sid=socket.request?.session?.userId;
      if(!sid)throw Error('กรุณาเข้าสู่ระบบ');
      const result=performAuctionBid(payload.auction_id||payload.id, sid, payload);
      if(typeof ack==='function')ack({ok:true,...result});
    }catch(e){
      if(typeof ack==='function')ack({ok:false,error:e.message});
      else socket.emit('auction:error',{error:e.message});
    }
  });
  socket.on('escrow:join', (orderId) => socket.join(roomOrder(orderId)));
  socket.on('chat:typing', ({toUserId}={}) => { const sid=socket.request?.session?.userId;if(sid&&toUserId) io.to(roomUser(toUserId)).emit('chat:typing',{from_id:sid,at:now()}); });
});
setInterval(()=>{
  if(!db||!db.auctions)return;
  db.auctions.filter(a=>a.status==='active'&&now()>=Number(a.start_at||0)).forEach(a=>{
    const remaining=a.end_at?Math.max(0,Number(a.end_at)-now()):null;
    if(remaining!==null && remaining>0 && remaining<=5000 && a.status==='active' && normalizeAuctionMethod(a.method)==='fee'){
      triggerAutoBidForAuction(a);
    }
    io.to(roomAuction(a.id)).emit('auction:timer',{auction_id:a.id,remaining:Math.max(0,(a.end_at||0)-now()),end_at:a.end_at||null,current_bid:a.current_bid,currency:a.currency,status:a.status});
    if(remaining!==null && remaining<=0 && a.status==='active'){
      if(a.winner_id){
        try{closeAuction(a);save();}catch(e){console.warn('auto close auction failed',a.id,e.message)}
      }else{
        a.status='expired';a.expired_at=now();notifyUser(a.seller_id,'ประมูลหมดเวลา','รายการ '+a.title+' หมดเวลาแล้ว ไม่มีผู้ชนะ',{type:'auction',auction_id:a.id});save();emitAuctionUpdate(a,'auction:closed');
      }
    }
  });
},1000);

app.set('trust proxy',1);
app.use(express.json({limit:'25mb'}));app.use(express.urlencoded({extended:true}));
const sessionOptions={secret:process.env.SESSION_SECRET||'dev-change-me',resave:false,saveUninitialized:false,cookie:{maxAge:6048e5,secure:process.env.NODE_ENV==='production',sameSite:'lax'}};
if(USE_POSTGRES){sessionOptions.store=new PgSession({pool:pgPool,tableName:'user_sessions',createTableIfMissing:true});}
const sessionMiddleware=session(sessionOptions);
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
app.use(express.static(path.join(__dirname,'public')));app.use('/uploads',express.static(uploadDir));const up=multer({storage:multer.memoryStorage(),limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||300)*1024*1024}});
app.post('/api/register',(req,res)=>{let {username,email,password}=req.body;if(!username||!email||!password)return res.status(400).json({error:'กรอกข้อมูลให้ครบ'});if(uname(username))return res.status(400).json({error:'ชื่อซ้ำ'});let u={id:nid('user'),username,email,password_hash:bcrypt.hashSync(password,10),role:'user',status:'active',display_name:username,avatar_url:'',bio:'',coin:0,credit:0,token:0,vip_until:0,vip_level:'Member',vip_points:0,vip_coin_spent_for_silver:0,vip_credit_spent_for_silver:0,username_change_count:0,lifetime_credit_topup:0,trust_completed_sales:0,trust_total_orders:0,created_at:now(),verified:false};u.public_user_id=newBidMarketUserId(u.created_at);db.users.push(u);req.session.userId=u.id;save();res.json({user:pub(u)})});
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
app.post('/api/me/change-username',need,(req,res)=>{try{let u=user(req.session.userId),username=String(req.body.username||'').trim();if(!username)return res.status(400).json({error:'กรุณากรอกชื่อผู้ใช้ใหม่'});if(!/^[a-zA-Z0-9_ก-๙.-]{3,32}$/.test(username))return res.status(400).json({error:'ชื่อผู้ใช้ต้องยาว 3-32 ตัวอักษร และใช้ตัวอักษร/ตัวเลข/_/./- เท่านั้น'});let existing=uname(username);if(existing&&existing.id!==u.id)return res.status(400).json({error:'ชื่อนี้ถูกใช้แล้ว'});const fee=Number(u.username_change_count||0)>0?50:0;if(fee>0){bal(u.id,'credit',-fee,'เปลี่ยนชื่อผู้ใช้',`เปลี่ยนเป็น ${username}`,{ref_type:'profile'});recordCompanyRevenue(fee,'credit','ค่าธรรมเนียมเปลี่ยนชื่อผู้ใช้',{ref_type:'user',ref_id:u.id})}u.username=username;u.display_name=req.body.display_name?String(req.body.display_name):u.display_name;u.username_change_count=Number(u.username_change_count||0)+1;save();res.json({fee,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});app.post('/api/upload',need,up.single('file'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'กรุณาเลือกไฟล์'});const url=await saveUploadedFile(req.file,'general');res.json({url,storage:storageStatus().driver})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/wallet/buy-coin',need,(req,res)=>{try{const credit=Math.floor(Number(req.body.credit||req.body.credit_amount||0));if(!Number.isFinite(credit)||credit<=0)return res.status(400).json({error:'กรุณากรอกจำนวน Credit ที่ต้องการแลก'});bal(req.session.userId,'credit',-credit,'แลก Coin',`แลก ${credit} Credit เป็น ${credit*COIN_PER_CREDIT} Coin`,{ref_type:'exchange'});bal(req.session.userId,'coin',credit*COIN_PER_CREDIT,'ได้รับ Coin จากการแลก',`1 Credit = ${COIN_PER_CREDIT} Coin`,{ref_type:'exchange'});save();res.json({credit_spent:credit,coin_received:credit*COIN_PER_CREDIT,user:pub(user(req.session.userId))})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/payments/create-credit-topup',need,(req,res)=>{
  const credit_amount=Math.floor(Number(req.body.credit||req.body.credit_amount||0));
  if(!Number.isFinite(credit_amount)||credit_amount<CREDIT_TOPUP_MIN)return res.status(400).json({error:`เติมขั้นต่ำ ${CREDIT_TOPUP_MIN} Credit`});
  const baht=credit_amount*CREDIT_THB_RATE;
  const p={id:uuid(),user_id:req.session.userId,baht_amount:baht,credit_amount,status:'pending_slip',slip_url:'',admin_note:'',created_at:now(),updated_at:now(),rate_baht_per_credit:CREDIT_THB_RATE};
  db.payments=(db.payments||[]);db.payments.unshift(p);save();
  res.json({payment:p, payment_id:p.id, baht_amount:baht, credit_amount, rate_baht_per_credit:CREDIT_THB_RATE});
});
app.post('/api/payments/upload-slip',need,up.single('slip'),async(req,res)=>{
  const p=(db.payments||[]).find(x=>x.id==req.body.payment_id&&x.user_id==req.session.userId);
  if(!p)return res.status(404).json({error:'ไม่พบรายการเติมเงิน'});
  if(p.status==='approved')return res.status(400).json({error:'รายการนี้อนุมัติแล้ว'});
  if(!req.file)return res.status(400).json({error:'กรุณาอัปโหลดสลิป'});
  p.slip_url=await saveUploadedFile(req.file,'payment-slips');p.status='waiting_admin';p.updated_at=now();notifyAdmin('มีสลิปเติมเงินใหม่',`ผู้ใช้ #${p.user_id} เติม ${p.credit_amount} Credit`,{type:'payment',payment_id:p.id});save();
  res.json({payment:p});
});
app.get('/api/payments/my',need,(req,res)=>res.json({payments:(db.payments||[]).filter(p=>p.user_id==req.session.userId)}));
app.get('/api/admin/payments',admin,(req,res)=>res.json({payments:(db.payments||[]).map(p=>({...p,user:pub(user(p.user_id))}))}));
app.post('/api/admin/payments/:id/approve',admin,(req,res)=>{
  const p=(db.payments||[]).find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ไม่พบรายการ'});
  if(p.status!=='approved'){p.status='approved';p.updated_at=now();p.admin_note=req.body.note||'';bal(p.user_id,'credit',p.credit_amount,'เติม Credit ผ่าน QR',`รายการ ${p.id} / ${p.baht_amount} บาท`);let tu=user(p.user_id);if(tu)tu.lifetime_credit_topup=Number(tu.lifetime_credit_topup||0)+Number(p.credit_amount||0);recordCompanyRevenue(p.credit_amount,'credit','Credit ที่เติมเข้าสู่ระบบ',{ref_type:'payment',ref_id:p.id});notifyUser(p.user_id,'เติม Credit สำเร็จ',`ได้รับ ${p.credit_amount} Credit`,{type:'payment',payment_id:p.id});save();}
  res.json({payment:p,user:pub(user(p.user_id))});
});
app.post('/api/admin/payments/:id/reject',admin,(req,res)=>{const p=(db.payments||[]).find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ไม่พบรายการ'});p.status='rejected';p.admin_note=req.body.note||'';p.updated_at=now();save();res.json({payment:p})});
app.post('/api/payments/mock-confirm',need,(req,res)=>res.status(403).json({error:'ปิดระบบ Mock แล้ว กรุณาอัปโหลดสลิปให้ Admin ตรวจสอบ'}));
app.get('/api/vip/config',(req,res)=>res.json({levels:VIP_LEVEL_ORDER,plans:VIP_PLANS,benefits:{sale_fee_rate:VIP_SALE_FEE_RATE,escrow_cashback:VIP_ESCROW_CASHBACK,activity_discount:VIP_ACTIVITY_DISCOUNT,collection_capacity:VIP_COLLECTION_CAPACITY,value_boost_daily_limit:VIP_VALUE_BOOST_DAILY_LIMIT,rename_free_monthly:VIP_RENAME_FREE_MONTHLY,pin_free_monthly:VIP_PIN_FREE_MONTHLY,benefit_text:VIP_BENEFIT_TEXT},rules:{vip_points_from_spending:'ใช้จ่าย 3 Credit = 1 VIP Point เฉพาะสถานะ VIP',buy_vip_points:'ซื้อ VIP Point ได้ 1 Credit = 1 คะแนน',free_pin_duration_hours:24,rounding:'เศษ >= 0.5 ปัดขึ้น, เศษ <= 0.4 ปัดลง',coin_fee_rounding:'ค่าธรรมเนียม Coin ปัดลงเป็นจำนวนเต็ม 100 และไม่มี Cashback'},credit_rate:{baht_per_credit:CREDIT_THB_RATE,min_credit:CREDIT_TOPUP_MIN},coin_rate:{coin_per_credit:COIN_PER_CREDIT}}));
app.post('/api/vip/subscribe',need,(req,res)=>{try{let u=user(req.session.userId),planKey=req.body.plan||'monthly',plan=VIP_PLANS[planKey];if(!plan)return res.status(400).json({error:'แพ็กเกจ VIP ไม่ถูกต้อง'});bal(u.id,'credit',-plan.price,'ซื้อ VIP',plan.label,{ref_type:'vip',ref_id:planKey});recordCompanyRevenue(plan.price,'credit','ขายสมาชิก VIP',{ref_type:'vip',ref_id:planKey});if(currentVipLevel(u)==='Member'&&Number(u.vip_until||0)<=now())u.vip_level='Member';let bonus=0;if(currentVipLevel(u)==='Diamond')bonus=30;else if(currentVipLevel(u)==='Ruby')bonus=0;const beforeVipUntil=Number(u.vip_until||0);if(currentVipLevel(u)==='Elite'){u.vip_until=4102444800000}else{u.vip_until=Math.max(Number(u.vip_until||0),now())+(plan.days+bonus)*86400e3}auditValueChange(u.id,'vip:subscription_until_change','user',u.id,'vip_until',beforeVipUntil,u.vip_until,{plan:planKey,price:plan.price,days_added:currentVipLevel(u)==='Elite'?'permanent':plan.days+bonus});save();res.json({plan:planKey,price:plan.price,days_added:currentVipLevel(u)==='Elite'?'permanent':plan.days+bonus,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/fees/config',(req,res)=>res.json({credit_topup:{baht_per_credit:CREDIT_THB_RATE,min_credit:CREDIT_TOPUP_MIN},coin_exchange:{coin_per_credit:COIN_PER_CREDIT,reverse_exchange:false},vip_plans:VIP_PLANS,sale_fee_rate:VIP_SALE_FEE_RATE,escrow_fee_tiers:[{min:1,max:1000,rate:0.01},{min:1001,max:10000,rate:0.02},{min:10001,max:50000,rate:0.03},{min:50001,max:99999,rate:0.04},{min:100000,max:499999,rate:0.05},{min:500000,max:null,rate:0.07}],escrow_cashback:VIP_ESCROW_CASHBACK,activity_fee:{credit_per_day:20,coin_per_day:5000,discount:VIP_ACTIVITY_DISCOUNT},pin_fee:{credit_per_hour:3,credit_per_day:50,max_days:7,cooldown_hours:72,elite_free_monthly:{max_days:3,limit:1}}}));
app.post('/api/vip/buy-points',need,(req,res)=>{try{const u=user(req.session.userId);const credit=Number(req.body.credit||req.body.amount||0);const points=addVipPointsByCreditPurchase(u,credit);save();res.json({points,user:pub(u)})}catch(e){res.status(400).json({error:e.message})}});
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

app.get('/api/auctions',(req,res)=>{cleanupExpiredAuctions();const level=req.query.level||'general';res.json({auctions:db.auctions.filter(a=>auctionVisibleInList(a,level)).map(a=>au(a,req.session.userId))})});app.get('/api/auctions/:id',(req,res)=>{cleanupExpiredAuctions();let a=db.auctions.find(x=>x.id==req.params.id);if(!a||isAuctionExpired(a)||a.status==='expired')return res.status(404).json({error:'ไม่พบ'});res.json({auction:au(a,req.session.userId)})});

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
app.post('/api/auctions/:id/join',need,(req,res)=>{try{let a=db.auctions.find(x=>x.id==req.params.id),u=user(req.session.userId);if(!a)throw Error('ไม่พบ');if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');if(a.seller_id==u.id)throw Error('เข้าร่วมสินค้าของตัวเองไม่ได้');if(a.level=='vip'){let need=Math.max(Number(a.vip_entry_min_credit||0),a.method==='english'?Math.ceil(Number(a.start_price||0)*.7):0),amt=Number(req.body.credit_amount||0);if(need>0){if(amt<need)throw Error('ต้องใส่ Credit อย่างน้อย '+need);if(u.credit<amt)throw Error('Credit ไม่พอ');let e=a.vip_entries.find(e=>e.user_id==u.id);e?e.credit_amount=amt:a.vip_entries.push({user_id:u.id,credit_amount:amt})}else if(!a.vip_entries.find(e=>e.user_id==u.id))a.vip_entries.push({user_id:u.id,credit_amount:0})}if(!a.participants.includes(u.id))a.participants.push(u.id);save();emitAuctionUpdate(a,'auction:joined');notifyUser(a.seller_id,'มีผู้เข้าร่วมประมูล',`${u.display_name||u.username} เข้าร่วม ${a.title}`,{type:'auction',auction_id:a.id});res.json({auction:au(a,u.id)})}catch(e){res.status(400).json({error:e.message})}});

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

function ensureAuctionBidAllowed(a,u){
  if(!a)throw Error('ไม่พบสินค้า');
  if(!u||u.status!=='active')throw Error('กรุณาเข้าสู่ระบบ');
  a.method=normalizeAuctionMethod(a.method);
  const t=now();
  if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');
  if(t<Number(a.start_at||0))throw Error('ยังไม่เริ่ม');
  if(a.end_at&&t>=Number(a.end_at))throw Error('หมดเวลาประมูลแล้ว');
  if(Number(a.seller_id)===Number(u.id))throw Error('ประมูลของตัวเองไม่ได้');
  if(a.level==='vip'&&!a.vip_entries.find(e=>Number(e.user_id)===Number(u.id)))throw Error('กรุณาเข้าร่วม VIP ก่อน');
}
function performAuctionBid(auctionId,userId,body={}){
  const a=db.auctions.find(x=>Number(x.id)===Number(auctionId));
  const u=user(userId);
  ensureAuctionBidAllowed(a,u);
  if(!a.participants.includes(u.id)){
    if(a.method==='english')throw Error('กรุณากดเข้าร่วมก่อนเสนอราคา');
    a.participants.push(u.id);
  }
  let oldWinnerId=a.winner_id||null;
  let bidAmount=0;
  if(a.method==='english'){
    if((a.participants||[]).length<3)throw Error('ต้องมีผู้เข้าร่วมอย่างน้อย 3 คนจึงจะเริ่มประมูลได้');
    const minIncrement=Number(a.min_bid_increment||a.bid_increment||1);
    const amount=Number(body.amount);
    validateAuctionCurrency(a.currency,a.method,amount,'ราคาเสนอ');
    if(amount<=Number(a.current_bid||0))throw Error('ต้องสูงกว่าปัจจุบัน');
    if(minIncrement>1 && amount<Number(a.current_bid||0)+minIncrement)throw Error('ต้องเสนอเพิ่มอย่างน้อย '+minIncrement+' '+a.currency);
    const oldWinnerAmount=oldWinnerId?currentBidHoldAmount(a,oldWinnerId):0;
    if(oldWinnerId&&oldWinnerId!==u.id&&oldWinnerAmount>0){refundBidFunds(oldWinnerId,a.currency,oldWinnerAmount,'ถูกเสนอราคาสูงกว่า: '+a.title);a.bidder_last_amounts[oldWinnerId]=0;}
    const prevSelf=currentBidHoldAmount(a,u.id);
    holdBidFunds(u,a.currency,amount-prevSelf,'เสนอราคา: '+a.title);
    bidAmount=amount;
    a.current_bid=amount;a.winner_id=u.id;a.last_bidder_id=u.id;a.bidder_last_amounts[u.id]=amount;a.highest_bid_by_user[u.id]=Math.max(Number(a.highest_bid_by_user[u.id]||0),amount);a.last_bid_at=now();a.bids_count++;a.bid_history.push({user_id:u.id,amount,created_at:now(),type:'english'});a.chats.push({system:true,text:`${u.display_name||u.username} เสนอราคา ${amount} ${a.currency}`});
  }else if(a.method==='fee'){
    const fee=Number(a.bid_fee||0);validateAuctionCurrency(a.currency,a.method,fee,'ราคาเคาะต่อครั้ง');
    bal(u.id,a.currency,-fee,'เคาะราคาประมูล',a.title,{ref_type:'auction',ref_id:a.id});
    bidAmount=fee;
    a.current_bid=Number(a.current_bid||0)+fee;a.fee_pool=Number(a.fee_pool||0)+fee;a.winner_id=u.id;a.last_bidder_id=u.id;a.bidder_last_amounts[u.id]=Number(a.bidder_last_amounts[u.id]||0)+fee;a.highest_bid_by_user[u.id]=Number(a.highest_bid_by_user[u.id]||0)+fee;a.last_bid_at=now();a.end_at=now()+Number(a.countdown_seconds||30)*1000;a.bids_count++;a.bid_history.push({user_id:u.id,amount:fee,current_bid:a.current_bid,created_at:now(),type:'fee'});a.chats.push({system:true,text:`${u.display_name||u.username} เคาะราคา +${fee} ${a.currency}`});
  }else{
    if(a.level!=='vip')throw Error('ประมูลปิดซองใช้ได้เฉพาะ VIP');
    if(a.currency!=='credit')throw Error('ประมูลปิดซองใช้ Credit เท่านั้น');
    const amount=Number(body.amount);validateAuctionCurrency(a.currency,a.method,amount,'ราคาเสนอ');
    const prev=currentBidHoldAmount(a,u.id);if(amount<=prev)throw Error('ต้องสูงกว่าราคาเดิมของคุณ');
    holdBidFunds(u,a.currency,amount-prev,'เสนอราคาแบบปิดซอง: '+a.title);
    bidAmount=amount;
    a.sealed_bids=(a.sealed_bids||[]).filter(b=>Number(b.user_id)!==Number(u.id));a.sealed_bids.push({user_id:u.id,amount,created_at:now()});a.bidder_last_amounts[u.id]=amount;a.highest_bid_by_user[u.id]=amount;a.bids_count++;a.chats.push({system:true,text:`${u.display_name||u.username} ส่งราคาแบบปิดซองแล้ว`});
  }
  notifyUser(a.seller_id,'มีการประมูลใหม่',`${u.display_name||u.username} อัปเดตราคา ${a.current_bid} ${a.currency}`,{type:'auction',auction_id:a.id,sound:'outbid'});
  if(oldWinnerId&&Number(oldWinnerId)!==Number(u.id)){io.to(roomUser(oldWinnerId)).emit('auction:outbidNotice',{auction_id:a.id,title:a.title,current_bid:a.current_bid,currency:a.currency,message:`${a.title} มีผู้เสนอราคา ${a.current_bid} ${a.currency}`});}
  save();emitAuctionUpdate(a,'auction:bid');emitWalletUpdate(u.id,'auction:bid');
  return {auction:au(a,u.id),user:pub(u),bid:{amount:bidAmount,currency:a.currency,auction_id:a.id,bidder_id:u.id,at:now()}};
}


function publicAutoBid(ab){
  if(!ab)return null;
  return {id:ab.id,auction_id:ab.auction_id,user_id:ab.user_id,budget_amount:Number(ab.budget_amount||0),remaining_budget:Number(ab.remaining_budget||0),currency:ab.currency||'credit',is_active:!!ab.is_active,last_triggered_at:Number(ab.last_triggered_at||0),created_at:Number(ab.created_at||0),updated_at:Number(ab.updated_at||0)};
}
function getAutoBid(auctionId,userId){return (db.auto_bids||[]).find(x=>Number(x.auction_id)===Number(auctionId)&&Number(x.user_id)===Number(userId));}
function validateAutoBidAuction(a){
  if(!a)throw Error('ไม่พบสินค้า');
  a.method=normalizeAuctionMethod(a.method);
  if(a.method!=='fee')throw Error('Auto Bid ใช้ได้เฉพาะการประมูลแบบเคาะราคาเท่านั้น');
  if(a.status!=='active')throw Error('การประมูลนี้ปิดแล้ว');
}
function saveAutoBidSetting(auctionId,userId,budgetAmount){
  const a=db.auctions.find(x=>Number(x.id)===Number(auctionId));
  const u=user(userId);
  if(!u||u.status!=='active')throw Error('กรุณาเข้าสู่ระบบ');
  validateAutoBidAuction(a);
  if(Number(a.seller_id)===Number(u.id))throw Error('ตั้ง Auto Bid กับประมูลของตัวเองไม่ได้');
  const fee=Number(a.bid_fee||0);
  validateAuctionCurrency(a.currency,a.method,fee,'ราคาเคาะต่อครั้ง');
  const budget=Math.floor(Number(budgetAmount||0));
  if(!Number.isFinite(budget)||budget<fee)throw Error('งบ Auto Bid ต้องไม่น้อยกว่าราคาเคาะต่อครั้ง');
  if(Number(u[a.currency]||0)<fee)throw Error('ยอด '+a.currency+' ไม่พอสำหรับเคาะครั้งแรก');
  let ab=getAutoBid(a.id,u.id);
  const before=ab?{...ab}:null;
  if(!ab){
    ab={id:nid('auto_bid'),auction_id:a.id,user_id:u.id,budget_amount:budget,remaining_budget:budget,currency:a.currency,is_active:true,created_at:now(),updated_at:now(),last_triggered_at:0};
    db.auto_bids.unshift(ab);
  }else{
    ab.budget_amount=budget;ab.remaining_budget=budget;ab.currency=a.currency;ab.is_active=true;ab.updated_at=now();
  }
  audit(u.id,'auto_bid:upsert','auction',a.id,{before,after:publicAutoBid(ab)});
  save();
  io.to(roomAuction(a.id)).emit('autoBid:enabled',{auction_id:a.id,user_id:u.id,auto_bid:publicAutoBid(ab)});
  notifyUser(u.id,'เปิด Auto Bid แล้ว',`ตั้งงบ ${budget} ${a.currency} สำหรับ ${a.title}`,{type:'auto_bid',auction_id:a.id});
  return ab;
}
function disableAutoBid(auctionId,userId,reason='user_disabled'){
  const ab=getAutoBid(auctionId,userId);
  if(!ab)return null;
  const before={...ab};
  ab.is_active=false;ab.disabled_reason=reason;ab.updated_at=now();
  audit(userId,'auto_bid:disable','auction',auctionId,{reason,before,after:publicAutoBid(ab)});
  save();
  io.to(roomAuction(auctionId)).emit('autoBid:disabled',{auction_id:Number(auctionId),user_id:Number(userId),reason,auto_bid:publicAutoBid(ab)});
  return ab;
}
function triggerAutoBidForAuction(a){
  if(!a||a.status!=='active'||normalizeAuctionMethod(a.method)!=='fee')return false;
  const remaining=Number(a.end_at||0)-now();
  if(!(remaining>0&&remaining<=5000))return false;
  const fee=Number(a.bid_fee||0);
  if(!fee||fee<=0)return false;
  db.auto_bids=db.auto_bids||[];
  const eligible=db.auto_bids
    .filter(ab=>ab&&ab.is_active&&Number(ab.auction_id)===Number(a.id))
    .filter(ab=>Number(ab.user_id)!==Number(a.last_bidder_id||0))
    .filter(ab=>Number(ab.remaining_budget||0)>=fee)
    .map(ab=>({ab,u:user(ab.user_id)}))
    .filter(x=>x.u&&x.u.status==='active'&&Number(x.u[a.currency]||0)>=fee)
    .sort((x,y)=>Number(x.ab.last_triggered_at||0)-Number(y.ab.last_triggered_at||0)||Number(x.ab.created_at||0)-Number(y.ab.created_at||0));
  if(!eligible.length)return false;
  const {ab,u}=eligible[0];
  try{
    const beforeRemaining=Number(ab.remaining_budget||0);
    performAuctionBid(a.id,u.id,{auto_bid:true,auto_bid_id:ab.id});
    ab.remaining_budget=Math.max(0,beforeRemaining-fee);
    ab.last_triggered_at=now();ab.updated_at=now();
    if(ab.remaining_budget<fee){ab.is_active=false;ab.disabled_reason='budget_depleted';notifyUser(u.id,'Auto Bid หยุดแล้ว','งบ Auto Bid ของ '+a.title+' เหลือไม่พอสำหรับเคาะครั้งถัดไป',{type:'auto_bid',auction_id:a.id});}
    audit(u.id,'auto_bid:trigger','auction',a.id,{auto_bid_id:ab.id,fee,currency:a.currency,before_remaining:beforeRemaining,after_remaining:ab.remaining_budget,disabled:!ab.is_active});
    save();
    io.to(roomAuction(a.id)).emit('autoBid:triggered',{auction_id:a.id,user_id:u.id,remaining_budget:ab.remaining_budget,currency:a.currency,auction:au(a,u.id)});
    io.to(roomUser(u.id)).emit('autoBid:update',{auto_bid:publicAutoBid(ab),auction:au(a,u.id)});
    return true;
  }catch(e){
    ab.is_active=false;ab.disabled_reason=e.message;ab.updated_at=now();
    audit(u.id,'auto_bid:error','auction',a.id,{auto_bid_id:ab.id,error:e.message});
    notifyUser(u.id,'Auto Bid ถูกปิด','ไม่สามารถเคาะอัตโนมัติได้: '+e.message,{type:'auto_bid',auction_id:a.id});
    save();
    io.to(roomUser(u.id)).emit('autoBid:update',{auto_bid:publicAutoBid(ab),error:e.message});
    return false;
  }
}

app.get('/api/auctions/:id/auto-bid/me',need,(req,res)=>{
  const a=db.auctions.find(x=>Number(x.id)===Number(req.params.id));
  if(!a)return res.status(404).json({error:'ไม่พบสินค้า'});
  res.json({auto_bid:publicAutoBid(getAutoBid(req.params.id,req.session.userId)),auction:au(a,req.session.userId)});
});
app.post('/api/auctions/:id/auto-bid',need,(req,res)=>{
  try{const ab=saveAutoBidSetting(req.params.id,req.session.userId,req.body.budget_amount||req.body.budget);res.json({auto_bid:publicAutoBid(ab)})}
  catch(e){res.status(400).json({error:e.message})}
});
app.patch('/api/auctions/:id/auto-bid',need,(req,res)=>{
  try{if(req.body.is_active===false)return res.json({auto_bid:publicAutoBid(disableAutoBid(req.params.id,req.session.userId,'user_disabled'))});const ab=saveAutoBidSetting(req.params.id,req.session.userId,req.body.budget_amount||req.body.budget);res.json({auto_bid:publicAutoBid(ab)})}
  catch(e){res.status(400).json({error:e.message})}
});
app.delete('/api/auctions/:id/auto-bid',need,(req,res)=>{
  try{res.json({auto_bid:publicAutoBid(disableAutoBid(req.params.id,req.session.userId,'user_disabled')),ok:true})}
  catch(e){res.status(400).json({error:e.message})}
});

app.post('/api/auctions/:id/bid',need,(req,res)=>{
  try{res.json(performAuctionBid(req.params.id,req.session.userId,req.body||{}))}
  catch(e){res.status(400).json({error:e.message})}
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
  emitOrderUpdate(o);io.to(roomUser(o.buyer_id)).emit('system:update',{order_id:o.id,auction_id:a.id,status:o.status});io.to(roomUser(o.seller_id)).emit('system:update',{order_id:o.id,auction_id:a.id,status:o.status});
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
    const escrowCalc=calculateEscrowFee(price,a.currency);fee=escrowCalc.amount;
    const saleCalc=calculateSaleFee(price,s,a.currency);saleFee=saleCalc.amount;
    cashback=calculateEscrowCashback(fee,s,a.currency).amount;
    recordCompanyRevenue(fee,a.currency,'ค่าธรรมเนียม Escrow',{ref_type:'auction',ref_id:a.id});
    recordCompanyRevenue(saleFee,a.currency,'ค่าธรรมเนียมประมูลสำเร็จ',{ref_type:'auction',ref_id:a.id});
    if(a.level==='vip'&&normalizeAuctionMethod(a.method)==='english'){
      const second=secondHighestBidder(a,wid);
      if(second){
        pc=a.currency==='coin'?roundCoinHundred(second.amount*0.07):roundFee(second.amount*0.07);ps=a.currency==='coin'?roundCoinHundred(second.amount*0.03):roundFee(second.amount*0.03);
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
  const winnerRow={id:nid('winner'),auction_id:a.id,item_title:a.title,level:a.level,winner_id:w?.id||null,winner_name:w?.username||'ไม่มีผู้ชนะ',price,currency:a.currency,service_fee:fee,sale_success_fee:saleFee||0,escrow_cashback:cashback||0,vip_penalty_company:pc,collection_added:false,closed_at:now()};
  db.winners.unshift(winnerRow);if(w){notifyUser(w.id,'คุณชนะการประมูล',a.title+' ราคา '+price+' '+a.currency,{type:'auction_win',auction_id:a.id,currency:a.currency,sound:'auction_win'});notifyUser(a.seller_id,'ประมูลสิ้นสุดแล้ว','ผู้ชนะ: '+(w.display_name||w.username)+' ราคา '+price+' '+a.currency,{type:'auction_closed',auction_id:a.id});}else{notifyUser(a.seller_id,'ประมูลสิ้นสุดแล้ว',a.title+' ไม่มีผู้ชนะ',{type:'auction_closed',auction_id:a.id});}save();emitAuctionUpdate(a,'auction:closed');return winnerRow;
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
  o.delivery_evidence=o.tracking_number?[o.tracking_number]:[];
  o.status='PENDING_ADMIN_CHECK';o.seller_confirmed=true;o.shipped_at=now();o.updated_at=now();escrowEvent(o,'SELLER_SHIPPED',req.session.userId,'ผู้ขายแจ้งจัดส่ง',{shipping_company:o.shipping_company,tracking_number:o.tracking_number});audit(req.session.userId,'ORDER_SHIPPED','order',o.id,{shipping_company:o.shipping_company,tracking_number:o.tracking_number});save();emitOrderUpdate(o);io.to(roomUser(o.buyer_id)).emit('system:update',{order_id:o.id,status:o.status});res.json({order:orderPublic(o)})
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
  emitOrderUpdate(o);io.to(roomUser(o.seller_id)).emit('system:update',{order_id:o.id,status:o.status});io.to(roomUser(o.buyer_id)).emit('system:update',{order_id:o.id,status:o.status});return o;
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
  emitOrderUpdate(o);io.to(roomUser(o.buyer_id)).emit('system:update',{order_id:o.id,status:o.status});io.to(roomUser(o.seller_id)).emit('system:update',{order_id:o.id,status:o.status});return o;
}
app.post('/api/orders/:id/confirm',need,(req,res)=>{
  try{
    let o=db.orders.find(x=>x.id==req.params.id);if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
    if(o.status==='DISPUTE')return res.status(400).json({error:'รายการอยู่ระหว่างข้อพิพาท ต้องให้ Admin ตัดสิน'});
    if(o.buyer_id==req.session.userId){ if(o.status!=='ADMIN_APPROVED') return res.status(400).json({error:'ต้องรอ Admin อนุมัติการส่งมอบก่อน'}); o.buyer_confirmed=true;escrowEvent(o,'BUYER_CONFIRMED',req.session.userId,'ผู้ซื้อยืนยันรับสินค้า')}
    else if(o.seller_id==req.session.userId){o.seller_confirmed=true;escrowEvent(o,'SELLER_CONFIRMED',req.session.userId,'ผู้ขายยืนยันการส่งมอบ')}
    else return res.status(403).json({error:'ไม่มีสิทธิ์'});
    if(o.buyer_confirmed&&o.seller_confirmed)release(o,'both_confirmed',req.session.userId,'ผู้ซื้อยืนยันรับสินค้าแล้ว');
    o.updated_at=now();save();emitOrderUpdate(o);res.json({order:o})
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/orders/:id/dispute',need,up.array('files',6),async(req,res)=>{
  let o=db.orders.find(x=>x.id==req.params.id);if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
  if(![o.buyer_id,o.seller_id].includes(req.session.userId))return res.status(403).json({error:'ไม่มีสิทธิ์'});
  if(['COMPLETED','REFUNDED'].includes(o.status))return res.status(400).json({error:'รายการนี้จบแล้ว'});
  let evidence=await saveUploadedFiles(req.files||[],'disputes');
  let d={id:nid('dispute'),order_id:o.id,opened_by:req.session.userId,reason:req.body.reason||'',evidence,status:'OPEN',admin_note:'',created_at:now(),updated_at:now()};
  db.disputes.unshift(d);o.status='DISPUTE';o.dispute_id=d.id;o.updated_at=now();escrowEvent(o,'DISPUTE_OPENED',req.session.userId,d.reason,{evidence:d.evidence});audit(req.session.userId,'DISPUTE_OPENED','order',o.id,{reason:d.reason,evidence_count:d.evidence.length});notifyAdmin('มีข้อพิพาทใหม่',o.item_title,{type:'dispute',order_id:o.id,dispute_id:d.id});notifyUser(o.buyer_id,'มีข้อพิพาทในคำสั่งซื้อ',o.item_title,{type:'dispute',order_id:o.id});notifyUser(o.seller_id,'มีข้อพิพาทในคำสั่งซื้อ',o.item_title,{type:'dispute',order_id:o.id});save();emitOrderUpdate(o);res.json({dispute:d})
});

function fdata(file){let ext=path.extname(file.originalname||file.path||'').toLowerCase(),mime=file.mimetype||(ext=='.png'?'image/png':ext=='.webp'?'image/webp':'image/jpeg');let buf=file.buffer||fs.readFileSync(file.path);return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`}
function parseVisionJSON(txt){try{return JSON.parse(txt)}catch(e){}let m=String(txt||'').match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch(e){}}return null}
async function gptVisionEstimate(req,photos){if(!process.env.OPENAI_API_KEY)return null;let files=req.files||[];let prompt=`คุณคือ AI วิเคราะห์รูปสินค้าสำหรับเว็บประมูล BidMarket วิเคราะห์รูปสินค้าและประเมินราคากลาง ตอบกลับเป็น JSON เท่านั้น {"product_name":"","category":"","condition_summary":"","visible_details":[""],"risk_notes":[""],"estimated_min":0,"estimated_mid":0,"estimated_max":0,"confidence":"ต่ำ/ปานกลาง/สูง","recommended_start_price":0,"pricing_reason":""} ข้อมูลผู้ใช้: ชื่อสินค้า ${req.body.title||''}, หมวดหมู่ ${req.body.category||''}, สภาพ ${req.body.condition||''}, หมายเหตุ ${req.body.notes||''}`;let body={model:process.env.OPENAI_VISION_MODEL||'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...files.slice(0,6).map(f=>({type:'input_image',image_url:fdata(f)}))]}],max_output_tokens:1200};let r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.text()).slice(0,300));let j=await r.json();let txt=j.output_text||(j.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('\n');return parseVisionJSON(txt)}

app.post('/api/ai/price-estimate',need,up.array('photos',6),async(req,res)=>{try{let photos=await saveUploadedFiles(req.files||[],'price-estimates');if(photos.length<1||photos.length>6)return res.status(400).json({error:'ใส่รูป 1-6 รูป'});let v=null;try{v=await gptVisionEstimate(req,photos)}catch(err){console.warn('GPT Vision fallback:',err.message)}let e;if(v){e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title||v.product_name,category:req.body.category||v.category,photos,estimated_min:Number(v.estimated_min||0),estimated_max:Number(v.estimated_max||0),estimated_mid:Number(v.estimated_mid||0),confidence:v.confidence||'ปานกลาง',recommended_start_price:Number(v.recommended_start_price||v.estimated_min||0),source:'gpt_vision',analysis:[`ชื่อสินค้าที่ AI เห็น: ${v.product_name||'-'}`,`สภาพสินค้า: ${v.condition_summary||'-'}`,`เหตุผลราคา: ${v.pricing_reason||'-'}`,...(v.visible_details||[]).map(x=>'รายละเอียดที่เห็น: '+x),...(v.risk_notes||[]).map(x=>'จุดที่ควรตรวจสอบ: '+x)],raw_vision:v,created_at:now()}}else{let t=((req.body.title||'')+' '+(req.body.category||'')).toLowerCase(),base=t.includes('iphone')?20000:t.includes('rolex')?90000:t.includes('ps5')?12000:3000,min=Math.round(base*.75),max=Math.round(base*1.25);e={id:nid('estimate'),user_id:req.session.userId,title:req.body.title,category:req.body.category,photos,estimated_min:min,estimated_max:max,estimated_mid:Math.round((min+max)/2),confidence:photos.length>=4?'สูง':photos.length>=2?'ปานกลาง':'เบื้องต้น',recommended_start_price:min,source:'mock',analysis:['ยังไม่ได้ตั้งค่า OPENAI_API_KEY จึงใช้ Mock Estimate','เมื่อตั้งค่า OPENAI_API_KEY ใน Render ระบบจะใช้ GPT Vision วิเคราะห์รูปสินค้าจริง'],created_at:now()}}db.estimates.unshift(e);save();res.json({estimate:e})}catch(e){res.status(500).json({error:e.message})}});app.get('/api/ai/price-estimates',need,(req,res)=>res.json({estimates:db.estimates.filter(e=>e.user_id==req.session.userId)}));

// ============================================================
// Buy/Sell Item Market with ระบบซื้อขายปลอดภัย (server-side escrow)
// ============================================================
function marketItemPublic(it){
  const seller=user(it.seller_id)||{};
  return {...it,seller:pub(seller),seller_name:seller.display_name||seller.username||'-'};
}
function activeMarketItems(){return (db.market_items||[]).filter(x=>x.status==='active').sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0));}

function itemEscrowFee(price){
  price=Number(price||0); let fee=0;
  if(price<=100) fee=price*0.07; else if(price<=500) fee=10; else fee=price*0.05;
  const frac=fee-Math.floor(fee); fee = frac>0.3 ? Math.ceil(fee) : Math.floor(fee);
  return Math.max(0,fee);
}

function createSafeTradeOrder(item,buyer){
  if(!item||item.status!=='active')throw Error('สินค้านี้ไม่พร้อมขายแล้ว');
  if(Number(item.seller_id)===Number(buyer.id))throw Error('ไม่สามารถซื้อสินค้าของตนเองได้');
  const price=Number(item.price||0), currency='credit';
  const buyerCharacter=String(arguments[2]||'').trim();
  if(!buyerCharacter)throw Error('กรุณากรอกชื่อตัวละครของผู้ซื้อ');
  if(price<=0)throw Error('ราคาสินค้าไม่ถูกต้อง');
  const fee=itemEscrowFee(price);
  const charge=item.seller_pays_fee?price:(price+fee);
  bal(buyer.id,currency,-charge,'กลางไอเทม: ล็อก Credit ผู้ซื้อ',item.title,{ref_type:'market_item',ref_id:item.id});
  item.status='sold';item.buyer_id=buyer.id;item.sold_at=now();item.updated_at=now();
  const created=now();
  const o={
    id:nid('order'),auction_id:null,market_item_id:item.id,source:'market_trade',item_title:item.title,
    buyer_id:buyer.id,seller_id:item.seller_id,amount:price,currency,service_fee:fee,sale_success_fee:0,escrow_cashback:0,locked_amount:charge,
    source:'item_escrow',seller_pays_fee:!!item.seller_pays_fee,buyer_character:buyerCharacter,seller_character:item.seller_character||'',
    status:'WAIT_SHIPPING',escrow_status:'HELD',escrow_version:'item_escrow_v1',buyer_confirmed:false,seller_confirmed:false,admin_approved:false,
    shipping_company:'',tracking_number:'',delivery_note:'',delivery_evidence:[],dispute_id:null,
    delivery_deadline:created+3*86400e3,buyer_confirm_deadline:created+7*86400e3,auto_release_eligible_at:created+7*86400e3,
    created_at:created,updated_at:created,timeline:[],audit_refs:[]
  };
  db.orders.unshift(o);
  db.escrow.unshift({id:nid('escrow'),order_id:o.id,amount:charge,currency,status:'HELD',type:'HOLD',created_at:created,note:'กลางไอเทม: ล็อก Credit ผู้ซื้อ'});
  escrowEvent(o,'ITEM_ESCROW_HOLD',buyer.id,'กลางไอเทมล็อก Credit ผู้ซื้อ',{market_item_id:item.id,price,currency,fee,charge,buyer_character:buyerCharacter});
  audit(buyer.id,'SAFE_TRADE_BUY','market_item',item.id,{order_id:o.id,price,currency,seller_id:item.seller_id});
  notifyUser(item.seller_id,'มีคำสั่งซื้อกลางไอเทมใหม่','ผู้ซื้อชำระเงินและล็อก Credit แล้ว',{type:'market_order',order_id:o.id,market_item_id:item.id});
  notifyUser(buyer.id,'เริ่มคำสั่งซื้อกลางไอเทมแล้ว','ระบบล็อก Credit ไว้แล้ว รอผู้ขายส่งมอบไอเทม',{type:'market_order',order_id:o.id,market_item_id:item.id});
  emitOrderUpdate(o);
  try{io.emit('market:item_update',marketItemPublic(item));io.to(roomUser(item.seller_id)).emit('system:update',{order_id:o.id,status:o.status});io.to(roomUser(buyer.id)).emit('system:update',{order_id:o.id,status:o.status});}catch(e){}
  return o;
}
app.get('/api/market/items',(req,res)=>{res.json({items:activeMarketItems().map(marketItemPublic)});});
app.get('/api/market/items/mine',need,(req,res)=>{const uid=req.session.userId;res.json({items:(db.market_items||[]).filter(x=>Number(x.seller_id)===Number(uid)||Number(x.buyer_id)===Number(uid)).sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0)).map(marketItemPublic)});});
app.post('/api/market/items',need,(req,res)=>{try{
  const u=user(req.session.userId), b=req.body||{};
  const title=String(b.title||'').trim(), description=String(b.description||'').trim(), image_url=String(b.image_url||'').trim();
  const price=Number(b.price||0), currency='credit'; const seller_character=String(b.seller_character||'').trim(); const seller_pays_fee=!!b.seller_pays_fee;
  if(!title)throw Error('กรุณากรอกชื่อไอเทม');
  if(!description)throw Error('กรุณากรอกรายละเอียด');
  if(!image_url)throw Error('กรุณาใส่ URL รูปสินค้า');
  if(!u.kyc_verified && u.role!=='admin')throw Error('ผู้ขายต้องผ่าน KYC ก่อนจึงจะลงสินค้ากลางไอเทมได้');
  if(price<=0)throw Error('กรุณากรอกราคา');
  if(!seller_character)throw Error('กรุณากรอกชื่อตัวละครผู้ขาย');
  const fee_amount=itemEscrowFee(price);
  const item={id:nid('market_item'),seller_id:u.id,title,description,category:String(b.category||'ไอเทมเกม'),image_url,price,currency,seller_character,seller_pays_fee,fee_amount,status:'active',buyer_id:null,created_at:now(),updated_at:now()};
  db.market_items.unshift(item);audit(u.id,'MARKET_ITEM_CREATE','market_item',item.id,{price,currency,title});save();
  res.json({item:marketItemPublic(item)});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/market/items/:id/buy',need,(req,res)=>{try{
  const item=(db.market_items||[]).find(x=>String(x.id)===String(req.params.id));if(!item)throw Error('ไม่พบสินค้า');
  const o=createSafeTradeOrder(item,user(req.session.userId),req.body.buyer_character);save();
  res.json({order:orderPublic(o),item:marketItemPublic(item)});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/market/items/:id/cancel',need,(req,res)=>{try{
  const item=(db.market_items||[]).find(x=>String(x.id)===String(req.params.id));if(!item)throw Error('ไม่พบสินค้า');
  const u=user(req.session.userId);if(Number(item.seller_id)!==Number(u.id)&&u.role!=='admin')throw Error('ไม่มีสิทธิ์');
  if(item.status!=='active')throw Error('ยกเลิกได้เฉพาะสินค้าที่ยังขายอยู่');
  item.status='cancelled';item.updated_at=now();audit(u.id,'MARKET_ITEM_CANCEL','market_item',item.id,{});save();res.json({item:marketItemPublic(item)});
}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/favorites',need,(req,res)=>{cleanupExpiredAuctions();let ids=db.favorites.filter(f=>f.user_id==req.session.userId).map(f=>f.auction_id);res.json({favorite_ids:ids,auctions:db.auctions.filter(a=>ids.includes(a.id)&&a.status==='active'&&!isAuctionExpired(a)).map(a=>au(a,req.session.userId))})});app.post('/api/favorites/:id',need,(req,res)=>{let id=Number(req.params.id);if(!db.favorites.find(f=>f.user_id==req.session.userId&&f.auction_id==id))db.favorites.push({user_id:req.session.userId,auction_id:id});save();res.json({ok:true})});app.delete('/api/favorites/:id',need,(req,res)=>{db.favorites=db.favorites.filter(f=>!(f.user_id==req.session.userId&&f.auction_id==req.params.id));save();res.json({ok:true})});
app.get('/api/admin/escrow',admin,(req,res)=>res.json({
  held:db.orders.filter(o=>!['COMPLETED','REFUNDED'].includes(o.status)).reduce((s,o)=>s+Number(o.amount||0),0),
  waitShipping:db.orders.filter(o=>o.status==='WAIT_SHIPPING').length,
  shipped:db.orders.filter(o=>['SHIPPED','DELIVERED'].includes(o.status)).length,
  disputes:db.orders.filter(o=>o.status==='DISPUTE').length,
  completed:db.orders.filter(o=>o.status==='COMPLETED').length,
  refunded:db.orders.filter(o=>o.status==='REFUNDED').length,
  orders:db.orders.map(orderPublic),events:(db.escrow_events||[]).slice(0,100),audit_logs:(db.audit_logs||[]).slice(0,100)
}));

app.get('/api/admin/orders/:id/detail',admin,(req,res)=>{
  const o=db.orders.find(x=>String(x.id)===String(req.params.id));
  if(!o)return res.status(404).json({error:'ไม่พบคำสั่งซื้อ'});
  res.json({order:orderPublic(o),events:(db.escrow_events||[]).filter(e=>String(e.order_id)===String(o.id)),audit:(db.audit_logs||[]).filter(a=>a.target_type==='order'&&String(a.target_id)===String(o.id))});
});
app.post('/api/admin/orders/:id/approve-item',admin,(req,res)=>{try{let o=db.orders.find(x=>x.id==req.params.id);if(!o)throw Error('ไม่พบคำสั่งซื้อ'); if(o.status!=='PENDING_ADMIN_CHECK') throw Error('รายการนี้ไม่ได้รอ Admin ตรวจสอบ'); o.admin_approved=true; o.status='ADMIN_APPROVED'; o.updated_at=now(); escrowEvent(o,'ADMIN_APPROVED',req.session.userId,'Admin อนุมัติการส่งมอบ'); notifyUser(o.buyer_id,'Admin อนุมัติการส่งมอบแล้ว','กรุณาตรวจสอบและกดยืนยันรับสินค้า',{type:'item_escrow_approved',order_id:o.id}); save(); res.json({order:orderPublic(o)})}catch(e){res.status(400).json({error:e.message})}});
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
app.post('/api/ads',need,up.fields([{name:'cover',maxCount:1},{name:'media',maxCount:1}]),async(req,res)=>{try{
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
  const cover_url=coverFile?await saveUploadedFile(coverFile,'ads/covers'):String(b.cover_url||'').trim();
  const media_url=mediaFile?await saveUploadedFile(mediaFile,'ads/media'):String(b.media_url||'').trim();
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
  db.messages.push(msg);notifyUser(otherId,'ข้อความใหม่',text.slice(0,80),{type:'chat',from_id:meId});save();emitChatMessage(msg);res.json({message:msg});
});


function findProfileUser(v){
  if(v==='me')return null;
  const raw=String(v||'').trim();
  return (db.users||[]).find(u=>String(u.id)===raw||String(u.public_user_id||'').toLowerCase()===raw.toLowerCase()||String(u.username||'').toLowerCase()===raw.toLowerCase());
}

function bangkokDateParts(ts=now()){
  const d=new Date(new Date(ts).toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
  return {y:d.getFullYear(),m:d.getMonth()+1,date:d.getDate(),day:d.getDay(),h:d.getHours(),min:d.getMinutes()};
}
function bangkokDayKey(ts=now()){
  const p=bangkokDateParts(ts);
  return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.date).padStart(2,'0')}`;
}
function bangkokWeekKey(ts=now()){
  const d=new Date(new Date(ts).toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
  const day=d.getDay();
  const sunday=new Date(d);sunday.setDate(d.getDate()-day);sunday.setHours(0,0,0,0);
  return `${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`;
}
function highestClosedPriceForTitle(title){
  title=String(title||'').trim().toLowerCase();
  let max=0;
  (db.winners||[]).forEach(w=>{if(String(w.item_title||'').trim().toLowerCase()===title)max=Math.max(max,Number(w.price||0))});
  return max;
}
function defaultRValue(title){return Math.max(100, roundCoinHundred(highestClosedPriceForTitle(title)||100))}
function normalizeShowcaseItem(x){
  x.r_value=roundCoinHundred(Number(x.r_value||0)||defaultRValue(x.title));
  if(x.r_value<100)x.r_value=100;
  x.last_boost_week_key??=bangkokWeekKey(Number(x.created_at||now()));
  x.boost_count_week=Number(x.boost_count_week||0);
  x.owner_id??=x.user_id;
  x.collection_item_id??=null;
  return x;
}
function userShowcase(uid){return (db.profile_showcase||[]).filter(x=>x.user_id==uid).map(normalizeShowcaseItem)}
function userCollectionItems(uid){return (db.collection_items||[]).filter(x=>x.user_id==uid)}
function collectionValueForUser(uid){
  const seen=new Set();let total=0;
  [...userShowcase(uid),...userCollectionItems(uid)].forEach(x=>{
    const key=x.collection_item_id?`ci:${x.collection_item_id}`:`img:${x.image_url}`;
    if(seen.has(key))return;seen.add(key);total+=Number(x.r_value||0);
  });
  return roundCoinHundred(total);
}
function updateCollectionValue(uid){const u=user(uid);if(u)u.collection_value=collectionValueForUser(uid);return u?.collection_value||0}
function collectionRankings(){
  (db.users||[]).forEach(u=>updateCollectionValue(u.id));
  return (db.users||[]).map(u=>({id:u.id,public_user_id:u.public_user_id,username:u.username,display_name:u.display_name||u.username,avatar_url:u.profile_image_url||u.avatar_url||'',collection_value:Number(u.collection_value||0)})).sort((a,b)=>Number(b.collection_value||0)-Number(a.collection_value||0)||Number(a.id)-Number(b.id)).map((u,i)=>({...u,rank:i+1}));
}
function collectionRankForUser(uid){const r=collectionRankings().find(x=>Number(x.id)===Number(uid));return r?Number(r.rank):0}
function canUseCollectionFeatures(u){return VIP_LEVEL_ORDER.indexOf(currentVipLevel(u))>=1 && isVipActive(u)}
function resetDailyValueBoostIfNeeded(u){const key=bangkokDayKey();if(u.value_boost_daily_key!==key){u.value_boost_daily_key=key;u.value_boost_daily_used=0}}
function assertCollectionCapacity(u){
  const cap=getVipBenefits(u).collection_capacity;
  if(cap<=0)throw Error('ต้องเป็น VIP ระดับ Silver ขึ้นไป');
  if(userCollectionItems(u.id).length>=cap)throw Error(`คลังคอลเลคชั่นเต็ม (${cap} รูป)`);
}
function weeklyRDecay(force=false){
  const p=bangkokDateParts();
  if(!force && !(p.day===6 && (p.h>23 || (p.h===23&&p.min>=30))))return {ran:false,reason:'not_time'};
  const week=bangkokWeekKey();
  if(!force && (db.r_weekly_checks||[]).some(x=>x.week_key===week))return {ran:false,reason:'already_ran'};
  const affected=[];
  db.profile_showcase=(db.profile_showcase||[]).filter(x=>{
    normalizeShowcaseItem(x);
    if(x.last_boost_week_key!==week && Number(x.boost_count_week||0)===0){
      x.r_value=Math.max(0,Number(x.r_value||0)-100);
      affected.push({showcase_id:x.id,user_id:x.user_id,r_value:x.r_value});
    }
    x.last_boost_week_key=week;x.boost_count_week=0;
    return x.r_value>0;
  });
  (db.users||[]).forEach(u=>updateCollectionValue(u.id));
  db.r_weekly_checks.unshift({id:nid('r_weekly_check'),week_key:week,created_at:now(),affected});
  save();return {ran:true,week_key:week,affected};
}
setInterval(()=>{try{weeklyRDecay(false)}catch(e){console.error('R weekly decay failed:',e.message)}},60*1000);

function profileRecentActivities(uid){
  const rows=[];
  (db.auctions||[]).forEach(a=>{
    if(a.seller_id==uid)rows.push({type:'ลงทะเบียนสินค้า',title:a.title,currency:a.currency,amount:a.current_bid||a.start_price,created_at:a.created_at||a.start_at||now(),auction_id:a.id});
    if(a.winner_id==uid)rows.push({type:'ชนะการประมูล',title:a.title,currency:a.currency,amount:a.current_bid,created_at:a.ended_at||a.end_at||now(),auction_id:a.id});
    (a.bid_history||[]).filter(b=>b.user_id==uid).slice(-3).forEach(b=>rows.push({type:'เข้าร่วมประมูล',title:a.title,currency:a.currency,amount:b.amount||b.current_bid,created_at:b.created_at||now(),auction_id:a.id}));
    (a.sealed_bids||[]).filter(b=>b.user_id==uid).forEach(b=>rows.push({type:'ยื่นซองประมูล',title:a.title,currency:a.currency,amount:b.amount,created_at:b.created_at||now(),auction_id:a.id}));
  });
  return rows.sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0)).slice(0,12);
}
function friendList(uid){
  return (db.friends||[]).filter(f=>f.user_id==uid).map(f=>user(f.friend_id)).filter(Boolean).map(pub);
}
function isFriend(userId,friendId){return (db.friends||[]).some(f=>f.user_id==userId&&f.friend_id==friendId)}
app.get('/api/profiles/:id',need,(req,res)=>{
  const meId=req.session.userId;
  const target=req.params.id==='me'?user(meId):findProfileUser(req.params.id);
  if(!target)return res.status(404).json({error:'ไม่พบโปรไฟล์'});
  const posts=(db.profile_posts||[]).filter(p=>p.user_id==target.id).sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0)).slice(0,30).map(p=>({...p,user_name:target.display_name||target.username,user_avatar:target.profile_image_url||target.avatar_url||''}));
  const showcase=userShowcase(target.id).sort((a,b)=>Number(a.rank||0)-Number(b.rank||0)).slice(0,3);
  const collection_items=userCollectionItems(target.id).slice(0,100);
  updateCollectionValue(target.id);
  res.json({user:pub(target),is_self:target.id==meId,is_friend:isFriend(meId,target.id),friends:friendList(target.id).slice(0,100),showcase,collection_items,collection_rank:collectionRankForUser(target.id),can_open_collection:canUseCollectionFeatures(target),posts,recent_activities:profileRecentActivities(target.id)});
});
app.post('/api/profiles/:id/friend',need,(req,res)=>{
  const meId=req.session.userId;
  const target=findProfileUser(req.params.id);
  if(!target)return res.status(404).json({error:'ไม่พบโปรไฟล์'});
  if(target.id==meId)return res.status(400).json({error:'ไม่สามารถเพิ่มบัญชีตนเองเป็นเพื่อนได้'});
  const count=(db.friends||[]).filter(f=>f.user_id==meId).length;
  if(count>=100&&!isFriend(meId,target.id))return res.status(400).json({error:'เพิ่มเพื่อนได้สูงสุด 100 คน'});
  if(!isFriend(meId,target.id))db.friends.push({id:nid('friend'),user_id:meId,friend_id:target.id,created_at:now()});
  save();res.json({ok:true,friends:friendList(meId).slice(0,100)});
});
app.post('/api/profiles/:id/posts',need,(req,res)=>{
  const meId=req.session.userId;
  const target=req.params.id==='me'?user(meId):findProfileUser(req.params.id);
  if(!target)return res.status(404).json({error:'ไม่พบโปรไฟล์'});
  if(target.id!=meId)return res.status(403).json({error:'โพสต์ได้เฉพาะโปรไฟล์ของตนเอง'});
  const content=String(req.body.content||'').trim();
  const media_url=String(req.body.media_url||'').trim();
  const media_type=['image','video'].includes(req.body.media_type)?req.body.media_type:'';
  if(!content&&!media_url)return res.status(400).json({error:'กรุณาพิมพ์ข้อความหรือเพิ่มรูป/วิดีโอ'});
  const post={id:nid('profile_post'),user_id:meId,content,media_url,media_type,created_at:now(),likes:0,comments:[]};
  db.profile_posts.unshift(post);save();res.json({post});
});
app.post('/api/profiles/me/showcase',need,(req,res)=>{
  const meId=req.session.userId;
  const rank=Number(req.body.rank||0);
  const title=String(req.body.title||'').trim().slice(0,80);
  const image_url=String(req.body.image_url||req.body.url||'').trim();
  if(![1,2,3].includes(rank))return res.status(400).json({error:'อันดับต้องเป็น 1, 2 หรือ 3 เท่านั้น'});
  if(!image_url)return res.status(400).json({error:'กรุณาอัปโหลดรูปสินค้าก่อน'});
  db.profile_showcase||(db.profile_showcase=[]);
  const dup=db.profile_showcase.find(x=>x.user_id==meId&&x.image_url===image_url&&Number(x.rank)!==rank);
  if(dup)return res.status(400).json({error:'ไม่สามารถลงรูปสินค้าซ้ำในตู้โชว์ได้'});
  let item=db.profile_showcase.find(x=>x.user_id==meId&&Number(x.rank)===rank);
  if(item){item.title=title;item.image_url=image_url;item.r_value=item.r_value||defaultRValue(title);item.owner_id=item.owner_id||meId;item.updated_at=now()}
  else{item={id:nid('profile_showcase'),user_id:meId,owner_id:meId,rank,title,image_url,r_value:defaultRValue(title),created_at:now(),updated_at:now(),last_boost_week_key:bangkokWeekKey(),boost_count_week:0};db.profile_showcase.push(item)}
  const collectionValue=updateCollectionValue(meId);save();
  try{io.to(roomUser(meId)).emit('showcase:rvalue',{showcase_id:item.id,r_value:item.r_value,collection_value:collectionValue});}catch(e){}
  res.json({showcase:userShowcase(meId).sort((a,b)=>Number(a.rank)-Number(b.rank)),collection_value:collectionValue});
});
app.delete('/api/profiles/me/showcase/:rank',need,(req,res)=>{
  const rank=Number(req.params.rank||0);
  db.profile_showcase=(db.profile_showcase||[]).filter(x=>!(x.user_id==req.session.userId&&Number(x.rank)===rank));
  const cv=updateCollectionValue(req.session.userId);save();try{io.to(roomUser(req.session.userId)).emit('showcase:rvalue',{collection_value:cv});}catch(e){}res.json({ok:true,collection_value:cv});
});

app.post('/api/profiles/showcase/:id/boost-value',need,(req,res)=>{
  try{
    const u=user(req.session.userId);
    const item=(db.profile_showcase||[]).find(x=>x.id==req.params.id);
    if(!item)throw Error('ไม่พบสินค้าในตู้โชว์');
    if(Number(item.user_id)===Number(u.id))throw Error('ไม่สามารถเพิ่มมูลค่าสินค้าของตนเองได้');
    resetDailyValueBoostIfNeeded(u);
    const limit=getVipBenefits(u).value_boost_daily_limit||1;
    if(Number(u.value_boost_daily_used||0)>=limit)throw Error('ใช้สิทธิ์เพิ่มมูลค่าครบแล้วสำหรับวันนี้');
    const key=bangkokDayKey();
    if((db.r_value_clicks||[]).some(c=>c.user_id==u.id&&c.showcase_id==item.id&&c.day_key===key))throw Error('วันนี้คุณเพิ่มมูลค่าสินค้านี้แล้ว');
    normalizeShowcaseItem(item);item.r_value=roundCoinHundred(Number(item.r_value||0)+100);item.boost_count_week=Number(item.boost_count_week||0)+1;item.last_boost_week_key=bangkokWeekKey();
    u.value_boost_daily_used=Number(u.value_boost_daily_used||0)+1;
    db.r_value_clicks.unshift({id:nid('r_value_click'),user_id:u.id,showcase_id:item.id,owner_id:item.user_id,day_key:key,amount:100,created_at:now()});
    updateCollectionValue(item.user_id);save();
    io.to(roomUser(item.user_id)).emit('showcase:rvalue',{showcase_id:item.id,r_value:item.r_value,collection_value:updateCollectionValue(item.user_id)});
    res.json({item,collection_value:updateCollectionValue(item.user_id),user:pub(u)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/me/rcoin/exchange',need,(req,res)=>{
  try{
    const u=user(req.session.userId);resetDailyValueBoostIfNeeded(u);
    const limit=getVipBenefits(u).value_boost_daily_limit||1;
    if(Number(u.value_boost_daily_used||0)>=limit)throw Error('ใช้สิทธิ์ประจำวันครบแล้ว');
    u.value_boost_daily_used=Number(u.value_boost_daily_used||0)+1;u.r_coin=Number(u.r_coin||0)+100;
    db.r_coin_ledger.unshift({id:nid('r_coin_ledger'),user_id:u.id,amount:100,type:'exchange_boost_right',day_key:bangkokDayKey(),created_at:now()});
    save();emitWalletUpdate(u.id,'rcoin:exchange');res.json({user:pub(u),r_coin:u.r_coin});
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/me/collection',need,(req,res)=>{
  const u=user(req.session.userId);
  if(!canUseCollectionFeatures(u))return res.status(403).json({error:'ต้องเป็น VIP ระดับ Silver ขึ้นไป'});
  res.json({items:userCollectionItems(u.id),capacity:getVipBenefits(u).collection_capacity,collection_value:updateCollectionValue(u.id),r_coin:Number(u.r_coin||0)});
});

app.delete('/api/me/collection/:id',need,(req,res)=>{
  try{
    const u=user(req.session.userId);
    if(!canUseCollectionFeatures(u))throw Error('ต้องเป็น VIP ระดับ Silver ขึ้นไป');
    const id=String(req.params.id);
    const ci=(db.collection_items||[]).find(x=>String(x.id)===id&&Number(x.user_id)===Number(u.id));
    if(!ci)throw Error('ไม่พบรูปในคลังคอลเลคชั่น');
    db.collection_items=(db.collection_items||[]).filter(x=>!(String(x.id)===id&&Number(x.user_id)===Number(u.id)));
    (db.profile_showcase||[]).forEach(x=>{if(String(x.collection_item_id||'')===id&&Number(x.user_id)===Number(u.id)){x.collection_item_id=null;}});
    const value=updateCollectionValue(u.id);
    audit(u.id,'COLLECTION_ITEM_DELETE','collection_item',id,{title:ci.title||'',image_url:ci.image_url||'',r_value:Number(ci.r_value||0)});
    save();
    try{io.to(roomUser(u.id)).emit('showcase:rvalue',{collection_value:value});}catch(e){}
    res.json({ok:true,collection_value:value});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/me/collection/:id/showcase',need,(req,res)=>{
  try{
    const u=user(req.session.userId);
    if(!canUseCollectionFeatures(u))throw Error('ต้องเป็น VIP ระดับ Silver ขึ้นไป');
    const ci=(db.collection_items||[]).find(x=>x.id==req.params.id&&x.user_id==u.id);
    if(!ci)throw Error('ไม่พบรูปในคลังคอลเลคชั่น');
    const rank=Number(req.body.rank||1);if(![1,2,3].includes(rank))throw Error('อันดับต้องเป็น 1-3');
    let item=(db.profile_showcase||[]).find(x=>x.user_id==u.id&&Number(x.rank)===rank);
    if(item){item.title=ci.title;item.image_url=ci.image_url;item.r_value=Number(ci.r_value||100);item.collection_item_id=ci.id;item.updated_at=now()}
    else db.profile_showcase.push({id:nid('profile_showcase'),user_id:u.id,owner_id:u.id,rank,title:ci.title,image_url:ci.image_url,r_value:Number(ci.r_value||100),collection_item_id:ci.id,created_at:now(),updated_at:now(),last_boost_week_key:bangkokWeekKey(),boost_count_week:0});
    updateCollectionValue(u.id);save();res.json({showcase:userShowcase(u.id),collection_value:updateCollectionValue(u.id)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/collection-rankings',need,(req,res)=>{
  const rankings=collectionRankings().slice(0,100);
  save();
  res.json({rankings});
});
app.get('/api/collection-auctions',need,(req,res)=>res.json({auctions:(db.collection_auctions||[]).filter(a=>a.status==='active').map(a=>({...a,seller_name:user(a.seller_id)?.display_name||user(a.seller_id)?.username||''}))}));
app.post('/api/collection-auctions',need,(req,res)=>{
  try{
    const u=user(req.session.userId);
    if(!canUseCollectionFeatures(u))throw Error('ต้องเป็น VIP ระดับ Silver ขึ้นไป');
    const showcase=(db.profile_showcase||[]).find(x=>x.id==req.body.showcase_id&&x.user_id==u.id);
    if(!showcase)throw Error('เลือกสินค้าจากตู้โชว์ของคุณ');
    normalizeShowcaseItem(showcase);
    if(Number(showcase.r_value||0)<=10000)throw Error('ต้องมีค่า R มากกว่า 10,000');
    if(Number(showcase.r_value||0)%100!==0)throw Error('ค่า R ต้องเป็นจำนวนเต็ม 100');
    const a={id:nid('collection_auction'),seller_id:u.id,showcase_id:showcase.id,title:showcase.title||'Collection Item',image_url:showcase.image_url,start_price:showcase.r_value,current_bid:showcase.r_value,winner_id:null,bids:[],status:'active',start_at:now(),end_at:now()+24*3600e3,created_at:now()};
    db.collection_auctions.unshift(a);save();res.json({auction:a});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/collection-auctions/:id/bid',need,(req,res)=>{
  try{
    const u=user(req.session.userId),a=(db.collection_auctions||[]).find(x=>x.id==req.params.id);
    if(!a||a.status!=='active')throw Error('ไม่พบประมูลคอลเลคชั่น');
    if(!canUseCollectionFeatures(u))throw Error('ต้องเป็น VIP ระดับ Silver ขึ้นไป');
    if(a.seller_id==u.id)throw Error('ประมูลของตัวเองไม่ได้');
    const amount=roundCoinHundred(Number(req.body.amount||0));
    if(amount<=Number(a.current_bid||0))throw Error('ต้องเสนอ R-Coin สูงกว่าราคาปัจจุบัน');
    if(Number(u.r_coin||0)<amount)throw Error('R-Coin ไม่พอ');
    const old=user(a.winner_id);if(old)old.r_coin=Number(old.r_coin||0)+Number(a.current_bid||0);
    u.r_coin=Number(u.r_coin||0)-amount;a.current_bid=amount;a.winner_id=u.id;a.bids.push({user_id:u.id,amount,created_at:now()});save();io.emit('collection-auction:update',a);res.json({auction:a,user:pub(u)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/collection-auctions/:id/close',need,(req,res)=>{
  try{
    const a=(db.collection_auctions||[]).find(x=>x.id==req.params.id);if(!a||a.status!=='active')throw Error('ไม่พบประมูลคอลเลคชั่น');
    const u=user(req.session.userId);if(a.seller_id!==u.id&&u.role!=='admin')throw Error('เฉพาะเจ้าของหรือ Admin');
    const seller=user(a.seller_id),winner=user(a.winner_id),showcase=(db.profile_showcase||[]).find(x=>x.id==a.showcase_id);
    if(!winner)throw Error('ยังไม่มีผู้ชนะ');
    assertCollectionCapacity(winner);
    const ci={id:nid('collection_item'),user_id:winner.id,source:'collection_auction_win',source_auction_id:a.id,title:a.title,image_url:a.image_url,r_value:roundCoinHundred(a.current_bid),created_at:now()};db.collection_items.unshift(ci);
    if(showcase){showcase.r_value=roundCoinHundred(Number(a.start_price||showcase.r_value||0)*1.10);showcase.collection_item_available=true}
    if(seller){assertCollectionCapacity(seller);if(showcase&&!db.collection_items.some(x=>x.user_id==seller.id&&x.image_url===showcase.image_url))db.collection_items.unshift({id:nid('collection_item'),user_id:seller.id,source:'collection_auction_seller_return',source_auction_id:a.id,title:showcase.title,image_url:showcase.image_url,r_value:Number(showcase.r_value||100),created_at:now()});}
    a.status='closed';a.closed_at=now();updateCollectionValue(winner.id);updateCollectionValue(seller?.id);save();res.json({auction:a,winner:pub(winner)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.put('/api/me/profile-media',need,(req,res)=>{
  const u=user(req.session.userId);
  const type=String(req.body.type||'');
  const url=String(req.body.url||'').trim();
  if(!['avatar','banner'].includes(type))return res.status(400).json({error:'ชนิดรูปไม่ถูกต้อง'});
  if(!url)return res.status(400).json({error:'กรุณาอัปโหลดรูปก่อน'});
  const field=type==='avatar'?'profile_image_changed_at':'profile_banner_changed_at';
  const wait=7*24*60*60*1000;
  if(Number(u[field]||0)&&now()-Number(u[field])<wait){
    const left=wait-(now()-Number(u[field]));
    const days=Math.ceil(left/(24*60*60*1000));
    return res.status(400).json({error:`ต้องรออีกประมาณ ${days} วัน จึงจะเปลี่ยนได้อีกครั้ง`});
  }
  if(type==='avatar'){u.profile_image_url=url;u.avatar_url=url}else u.profile_banner_url=url;
  u[field]=now();save();
  try{io.to(roomUser(u.id)).emit('profile:media',{user:pub(u),type,url});}catch(e){}
  res.json({user:pub(u)});
});


function orderForAuction(auctionId,userId){
  return (db.orders||[]).find(o=>Number(o.auction_id)===Number(auctionId)&&(Number(o.buyer_id)===Number(userId)||Number(o.seller_id)===Number(userId)||user(userId)?.role==='admin'));
}
function systemTimelineForOrder(o){
  if(!o)return [];
  const rows=[];
  rows.push({key:'auction_closed',title:'สิ้นสุดการประมูล',at:o.created_at,done:true});
  rows.push({key:'payment_held',title:'หักเงินเข้าระบบแล้ว',at:o.created_at,done:true});
  rows.push({key:'wait_shipping',title:'รอผู้ขายดำเนินการจัดส่งสินค้า',at:o.created_at,done:['WAIT_SHIPPING','SHIPPED','DELIVERED','COMPLETED'].includes(o.status)});
  rows.push({key:'seller_shipped',title:'ผู้ขายดำเนินการจัดส่งสินค้า',at:o.shipped_at,done:!!o.shipped_at});
  rows.push({key:'buyer_confirmed',title:'ผู้ซื้อยืนยันได้รับสินค้า',at:o.buyer_confirmed_at||o.updated_at,done:!!o.buyer_confirmed});
  rows.push({key:'system_paid',title:'ระบบจ่ายเงินให้ผู้ขาย',at:o.released_at,done:o.status==='COMPLETED'});
  return rows;
}
app.get('/api/auctions/:id/system-status',need,(req,res)=>{
  const o=orderForAuction(req.params.id,req.session.userId);
  if(!o)return res.status(404).json({error:'ยังไม่พบข้อมูลระบบของรายการนี้'});
  res.json({system:{auction_id:o.auction_id,order_id:o.id,item_title:o.item_title,status:o.status,timeline:systemTimelineForOrder(o)}});
});
app.post('/api/auction-wins/:auctionId/add-collection',need,(req,res)=>{
  try{
    const uid=req.session.userId;
    const a=(db.auctions||[]).find(x=>Number(x.id)===Number(req.params.auctionId));
    if(!a)throw Error('ไม่พบรายการประมูล');
    if(String(a.currency||'').toLowerCase()!=='credit')throw Error('สินค้าที่ประมูลด้วย Coin ไม่สามารถเพิ่มเข้าคอลเลคชั่นได้');
    const w=(db.winners||[]).find(x=>Number(x.auction_id)===Number(a.id));
    if(!w||Number(w.winner_id||a.winner_id)!==Number(uid))throw Error('เฉพาะผู้ชนะประมูลเท่านั้น');
    if(w.collection_added)throw Error('รายการนี้เพิ่มไปแล้ว');
    const u=user(uid);
    const image_url=a.image_url||'';
    const title=a.title||w.item_title||'สินค้า';
    const r_value=defaultRValue(title);
    if(canUseCollectionFeatures(u)){
      assertCollectionCapacity(u);
      if((db.collection_items||[]).some(x=>Number(x.user_id)===Number(uid)&&(Number(x.source_auction_id)===Number(a.id)||x.image_url===image_url)))throw Error('มีสินค้านี้อยู่ในคลังแล้ว');
      db.collection_items.unshift({id:nid('collection_item'),user_id:uid,source:'auction_win',source_auction_id:a.id,title,image_url,r_value,price:Number(w.price||a.current_bid||0),currency:a.currency,origin:'ชนะประมูล',created_at:now()});
      w.collection_added=true;w.collection_added_at=now();w.collection_add_target='collection';
      updateCollectionValue(uid);audit(uid,'AUCTION_WIN_ADD_COLLECTION','auction',a.id,{target:'collection',r_value});save();
      return res.json({ok:true,target:'collection',message:'เพิ่มเข้าคลังคอลเลคชั่นแล้ว'});
    }
    db.profile_showcase=db.profile_showcase||[];
    if(db.profile_showcase.some(x=>Number(x.user_id)===Number(uid)&&x.image_url===image_url))throw Error('มีสินค้านี้อยู่ในตู้โชว์แล้ว');
    const used=new Set(db.profile_showcase.filter(x=>Number(x.user_id)===Number(uid)).map(x=>Number(x.rank)));
    const rank=[1,2,3].find(r=>!used.has(r));
    if(!rank)throw Error('ตู้โชว์ครบ 3 อันดับแล้ว ไม่สามารถเพิ่มได้');
    db.profile_showcase.push({id:nid('profile_showcase'),user_id:uid,owner_id:uid,rank,title,image_url,r_value,price:Number(w.price||a.current_bid||0),currency:a.currency,source:'auction_win',source_auction_id:a.id,origin:'ชนะประมูล',created_at:now(),updated_at:now(),last_boost_week_key:bangkokWeekKey(),boost_count_week:0});
    w.collection_added=true;w.collection_added_at=now();w.collection_add_target='showcase';
    updateCollectionValue(uid);audit(uid,'AUCTION_WIN_ADD_COLLECTION','auction',a.id,{target:'showcase',rank,r_value});save();
    res.json({ok:true,target:'showcase',rank,message:'เพิ่มเข้าตู้โชว์แล้ว'});
  }catch(e){res.status(400).json({error:e.message})}
});

app.get('/api/notifications',need,(req,res)=>{
  const limit=Math.max(1,Math.min(100,Number(req.query.limit||80)));
  const notifications=userNotifications(req.session.userId,limit);
  res.json({notifications,unread:unreadNotificationCount(req.session.userId)});
});
app.get('/api/notifications/unread-count',need,(req,res)=>res.json({count:unreadNotificationCount(req.session.userId)}));
app.post('/api/notifications/read',need,(req,res)=>{
  const t=now();
  (db.notifications||[]).filter(n=>Number(n.user_id)===Number(req.session.userId)).forEach(n=>{n.read=true;n.read_at=n.read_at||t;normalizeNotification(n)});
  save();emitNotificationUnread(req.session.userId);res.json({ok:true,unread:0});
});
app.post('/api/notifications/:id/read',need,(req,res)=>{
  const n=(db.notifications||[]).find(x=>String(x.id)===String(req.params.id)&&Number(x.user_id)===Number(req.session.userId));
  if(!n)return res.status(404).json({error:'ไม่พบการแจ้งเตือน'});
  n.read=true;n.read_at=now();normalizeNotification(n);save();emitNotificationUnread(req.session.userId);res.json({ok:true,notification:n,unread:unreadNotificationCount(req.session.userId)});
});
app.post('/api/admin/notifications/send',admin,(req,res)=>{
  try{
    const target=Number(req.body.user_id||0);
    const title=String(req.body.title||'แจ้งเตือนจากระบบ').trim();
    const body=String(req.body.body||'').trim();
    const type=String(req.body.type||'admin').trim();
    if(target){if(!user(target))throw Error('ไม่พบผู้ใช้');const n=notifyUser(target,title,body,{type,from_admin:req.session.userId});audit(req.session.userId,'notification:send','user',target,{title,type});return res.json({ok:true,notification:n});}
    const sent=[];(db.users||[]).filter(u=>u.status==='active').forEach(u=>{const n=notifyUser(u.id,title,body,{type,broadcast:true,from_admin:req.session.userId});if(n)sent.push(n.id)});
    audit(req.session.userId,'notification:broadcast','system','all',{title,type,count:sent.length});res.json({ok:true,count:sent.length});
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/transactions',need,(req,res)=>res.json({transactions:db.transactions.filter(t=>t.user_id==req.session.userId)}));
app.get('/api/system/storage',admin,(req,res)=>res.json(storageStatus()));
app.get('/api/admin/db/health',admin,(req,res)=>res.json({
  storage:storageStatus(),postgres:USE_POSTGRES,updated_at:now(),counts:{
    users:(db.users||[]).length,auctions:(db.auctions||[]).length,orders:(db.orders||[]).length,escrow:(db.escrow||[]).length,transactions:(db.transactions||[]).length,messages:(db.messages||[]).length,ads:(db.ads||[]).length,activities:(db.activities||[]).length
  }
}));
app.get('/api/admin/backup/export',admin,(req,res)=>{const stamp=new Date().toISOString().replace(/[:.]/g,'-');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename=bidmarket-backup-${stamp}.json`);res.send(JSON.stringify({exported_at:now(),version:'production-storage-v1',state:db},null,2));});
app.post('/api/admin/backup/r2',admin,async(req,res)=>{try{const st=storageStatus();if(st.driver==='local')return res.status(400).json({error:'ยังไม่ได้ตั้งค่า Cloudinary หรือ Cloudflare R2 ครบ'});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const file={originalname:`bidmarket-backup-${stamp}.json`,mimetype:'application/json',buffer:Buffer.from(JSON.stringify({exported_at:now(),version:'production-storage-v1',state:db},null,2))};const url=await saveUploadedFile(file,'backups');audit(req.session.userId,'backup:create','system','app_state',{url,storage:st.driver});save();res.json({ok:true,url,storage:st.driver})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/backend/status',admin,async(req,res)=>{
  const status={postgres:USE_POSTGRES,normalized_tables:false,schema_version:null,counts:{}};
  if(USE_POSTGRES){
    try{
      const meta=(await pgPool.query("SELECT value FROM backend_schema_meta WHERE key='schema_version'")).rows[0];
      status.schema_version=meta?.value||null;status.normalized_tables=!!status.schema_version;
      for(const name of ['backend_users','backend_wallets','backend_vip','backend_auctions','backend_bids','backend_transactions','backend_orders','backend_notifications','backend_audit_logs']){
        const r=await pgPool.query(`SELECT COUNT(*)::int AS count FROM ${name}`);status.counts[name]=r.rows[0].count;
      }
    }catch(e){status.error=e.message}
  }
  res.json(status);
});
app.get('/api/admin/backend/users',admin,async(req,res)=>{
  if(!USE_POSTGRES)return res.status(400).json({error:'ยังไม่ได้ตั้งค่า DATABASE_URL'});
  const rows=(await pgPool.query(`SELECT u.*,w.coin,w.credit,w.token,v.vip_level,v.vip_points,v.vip_until FROM backend_users u LEFT JOIN backend_wallets w ON w.user_id=u.id LEFT JOIN backend_vip v ON v.user_id=u.id ORDER BY u.id ASC LIMIT 500`)).rows;
  res.json({users:rows});
});
app.get('/api/admin/backend/auctions',admin,async(req,res)=>{
  if(!USE_POSTGRES)return res.status(400).json({error:'ยังไม่ได้ตั้งค่า DATABASE_URL'});
  const rows=(await pgPool.query(`SELECT * FROM backend_auctions ORDER BY id DESC LIMIT 500`)).rows;
  res.json({auctions:rows});
});
app.get('/api/admin/backend/transactions',admin,async(req,res)=>{
  if(!USE_POSTGRES)return res.status(400).json({error:'ยังไม่ได้ตั้งค่า DATABASE_URL'});
  const rows=(await pgPool.query(`SELECT * FROM backend_transactions ORDER BY created_at DESC LIMIT 500`)).rows;
  res.json({transactions:rows});
});
app.get('/api/admin/backend/notifications',admin,async(req,res)=>{
  if(!USE_POSTGRES)return res.status(400).json({error:'ยังไม่ได้ตั้งค่า DATABASE_URL'});
  const rows=(await pgPool.query(`SELECT * FROM backend_notifications ORDER BY created_at DESC LIMIT 500`)).rows;
  res.json({notifications:rows});
});



// ============================================================
// BidMarket Admin Dashboard COMPLETE
// จัดการผู้ใช้ / ประมูล / ธุรกรรม / Log แบบปลอดภัยผ่าน middleware admin
// ============================================================
function adminAuctionPublic(a){
  const seller=user(a.seller_id)||{};
  const winner=user(a.winner_id)||{};
  return {...a,seller_name:seller.display_name||seller.username||'-',winner_name:winner.display_name||winner.username||'-',expired:isAuctionExpired(a)};
}
function adminUserPublic(u){
  const p=pub(u)||{};
  return {...p,password_hash:undefined,google_id:undefined};
}
function adminDashboardSummary(){
  cleanupExpiredAuctions();
  const users=db.users||[], auctions=db.auctions||[], orders=db.orders||[], txs=db.transactions||[], logs=db.audit_logs||[];
  const activeAuctions=auctions.filter(a=>a.status==='active'&&!isAuctionExpired(a));
  const endedAuctions=auctions.filter(a=>a.status!=='active'||isAuctionExpired(a));
  const revenue=(db.company_revenue||[]).reduce((s,r)=>s+Number(r.amount||0),0);
  return {
    counts:{
      users:users.length,
      active_users:users.filter(u=>u.status==='active').length,
      suspended_users:users.filter(u=>u.status==='suspended').length,
      auctions:auctions.length,
      active_auctions:activeAuctions.length,
      ended_auctions:endedAuctions.length,
      transactions:txs.length,
      orders:orders.length,
      disputes:orders.filter(o=>o.status==='DISPUTE').length,
      audit_logs:logs.length,
      revenue
    },
    recent:{
      users:users.slice(-8).reverse().map(adminUserPublic),
      auctions:auctions.slice(0,10).map(adminAuctionPublic),
      transactions:txs.slice(0,15),
      audit_logs:logs.slice(0,20)
    }
  };
}
app.get('/api/admin/dashboard',admin,(req,res)=>res.json(adminDashboardSummary()));
app.get('/api/admin/users/full',admin,(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  let rows=(db.users||[]).map(adminUserPublic);
  if(q)rows=rows.filter(u=>String(u.id).includes(q)||String(u.username||'').toLowerCase().includes(q)||String(u.display_name||'').toLowerCase().includes(q)||String(u.email||'').toLowerCase().includes(q));
  res.json({users:rows.slice(0,500)});
});
app.post('/api/admin/users/:id/status',admin,(req,res)=>{
  try{
    const target=user(req.params.id);if(!target)throw Error('ไม่พบผู้ใช้');
    const status=String(req.body.status||'active');if(!['active','suspended'].includes(status))throw Error('สถานะไม่ถูกต้อง');
    if(Number(target.id)===Number(req.session.userId)&&status==='suspended')throw Error('ห้ามระงับบัญชี Admin ที่กำลังใช้งาน');
    const beforeStatus=target.status;target.status=status;target.updated_at=now();audit(req.session.userId,'admin:user_status','user',target.id,{field:'status',before:beforeStatus,after:status});
    notifyUser(target.id,status==='suspended'?'บัญชีถูกระงับ':'บัญชีถูกเปิดใช้งาน',status==='suspended'?'Admin ระงับบัญชีของคุณ':'Admin เปิดใช้งานบัญชีของคุณ',{type:'admin_user_status'});
    save();res.json({user:adminUserPublic(target)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/admin/users/:id/role',admin,(req,res)=>{
  try{
    const target=user(req.params.id);if(!target)throw Error('ไม่พบผู้ใช้');
    const role=String(req.body.role||'user');if(!['user','admin'].includes(role))throw Error('Role ไม่ถูกต้อง');
    if(Number(target.id)===Number(req.session.userId)&&role!=='admin')throw Error('ห้ามลดสิทธิ์ Admin ที่กำลังใช้งาน');
    const beforeRole=target.role;target.role=role;target.updated_at=now();audit(req.session.userId,'admin:user_role','user',target.id,{field:'role',before:beforeRole,after:role});save();res.json({user:adminUserPublic(target)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/admin/users/:id/wallet',admin,(req,res)=>{
  try{
    const target=user(req.params.id);if(!target)throw Error('ไม่พบผู้ใช้');
    const currency=String(req.body.currency||'credit');if(!['coin','credit','token'].includes(currency))throw Error('สกุลเงินไม่ถูกต้อง');
    const amount=Number(req.body.amount||0);if(!Number.isFinite(amount)||amount===0)throw Error('จำนวนไม่ถูกต้อง');
    const note=String(req.body.note||'Admin ปรับยอด');
    bal(target.id,currency,amount,'Admin Wallet Adjust',note,{ref_type:'admin',ref_id:req.session.userId});
    audit(req.session.userId,'admin:wallet_adjust','user',target.id,{currency,amount,note});
    notifyUser(target.id,'Admin ปรับยอดกระเป๋า',`${amount>0?'+':''}${amount} ${currency}`,{type:'wallet_admin'});
    save();res.json({user:adminUserPublic(target)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/admin/users/:id/vip',admin,(req,res)=>{
  try{
    const target=user(req.params.id);if(!target)throw Error('ไม่พบผู้ใช้');
    const beforeVip={vip_points:Number(target.vip_points||0),vip_level:target.vip_level||'Member',vip_until:Number(target.vip_until||0)};
    const points=Number(req.body.vip_points);if(Number.isFinite(points)&&points>=0)target.vip_points=points;
    const level=String(req.body.vip_level||'').trim();if(level)target.vip_level=level;
    const days=Number(req.body.vip_days||0);if(Number.isFinite(days)&&days>0)target.vip_until=now()+days*86400e3;
    target.updated_at=now();runVipLevelUp(target,req.session.userId,'admin_vip_update');audit(req.session.userId,'admin:vip_update','user',target.id,{before:beforeVip,after:{vip_points:Number(target.vip_points||0),vip_level:target.vip_level||'Member',vip_until:Number(target.vip_until||0)}});
    notifyUser(target.id,'Admin ปรับข้อมูล VIP','ข้อมูล VIP ของคุณถูกอัปเดตแล้ว',{type:'vip_admin'});
    save();res.json({user:adminUserPublic(target)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/admin/auctions/full',admin,(req,res)=>{
  cleanupExpiredAuctions();
  const status=String(req.query.status||'all');
  let rows=(db.auctions||[]).map(adminAuctionPublic);
  if(status!=='all')rows=rows.filter(a=>a.status===status);
  res.json({auctions:rows.slice(0,500)});
});
app.post('/api/admin/auctions/:id/status',admin,(req,res)=>{
  try{
    const a=(db.auctions||[]).find(x=>String(x.id)===String(req.params.id));if(!a)throw Error('ไม่พบการประมูล');
    const action=String(req.body.action||req.body.status||'').trim();
    if(action==='close')closeAuction(a);
    else if(['active','expired','cancelled','deleted','closed'].includes(action)){a.status=action;a.updated_at=now();if(action==='cancelled'||action==='deleted'){a.closed_at=now();}}
    else throw Error('Action ไม่ถูกต้อง');
    audit(req.session.userId,'admin:auction_status','auction',a.id,{action});
    try{emitAuctionUpdate(a,'auction:admin_status')}catch(e){}
    save();res.json({auction:adminAuctionPublic(a)});
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/admin/transactions/full',admin,(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  let rows=(db.transactions||[]).map(t=>({...t,user:user(t.user_id)?adminUserPublic(user(t.user_id)):null}));
  if(q)rows=rows.filter(t=>String(t.user_id).includes(q)||String(t.type||'').toLowerCase().includes(q)||String(t.note||'').toLowerCase().includes(q));
  res.json({transactions:rows.slice(0,700)});
});
app.get('/api/admin/logs/full',admin,(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  const action=String(req.query.action||'').trim().toLowerCase();
  const target_type=String(req.query.target_type||'').trim().toLowerCase();
  const actor_id=String(req.query.actor_id||'').trim();
  let logs=(db.audit_logs||[]).slice(0,5000);
  if(q)logs=logs.filter(l=>String(l.action||'').toLowerCase().includes(q)||String(l.target_type||'').toLowerCase().includes(q)||String(l.actor_name||'').toLowerCase().includes(q)||String(l.target_id||'').includes(q));
  if(action)logs=logs.filter(l=>String(l.action||'').toLowerCase().includes(action));
  if(target_type)logs=logs.filter(l=>String(l.target_type||'').toLowerCase()===target_type);
  if(actor_id)logs=logs.filter(l=>String(l.actor_id||'')===actor_id);
  res.json({audit_logs:logs});
});
app.get('/api/admin/logs/export.csv',admin,(req,res)=>{
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=(db.audit_logs||[]).slice(0,5000);
  const csv=['id,created_at,actor_id,actor_name,action,target_type,target_id,details']
    .concat(rows.map(l=>[l.id,new Date(Number(l.created_at||0)).toISOString(),l.actor_id||'',l.actor_name||'',l.action||'',l.target_type||'',l.target_id||'',JSON.stringify(l.details||{})].map(esc).join(',')))
    .join('\n');
  audit(req.session.userId,'admin:audit_export','audit_log','csv',{count:rows.length});
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="bidmarket-audit-logs.csv"');
  res.send(csv);
});

app.get('*',(_,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
load().then(initialDb=>{db=initialDb;ensureSystemDefaults();save();serverHttp.listen(PORT,()=>console.log('BidMarket Persistent DB '+(USE_POSTGRES?'PostgreSQL':'JSON local')+' http://localhost:'+PORT));}).catch(err=>{console.error('Cannot start server:',err);process.exit(1);});
