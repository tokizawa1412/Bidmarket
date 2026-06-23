
(function(){
  window.itemEscrowFeePreview=function(price){price=Number(price||0);let fee=0;if(price<=100)fee=price*0.07;else if(price<=500)fee=10;else fee=price*0.05;const frac=fee-Math.floor(fee);fee=frac>0.3?Math.ceil(fee):Math.floor(fee);return Math.max(0,fee)};
  const oldLoadMarket=window.loadMarket;
  window.loadMarket=async function(){
    if(oldLoadMarket)await oldLoadMarket();
    try{
      if(window.marketPrice&&!window.marketPrice.dataset.feeHook){
        window.marketPrice.dataset.feeHook='1';
        const box=document.createElement('div');box.id='marketFeePreview';box.className='itemEscrowFeeBox';box.innerHTML='กรอกราคาเพื่อดูค่าธรรมเนียม';
        window.marketPrice.closest('.card')?.insertBefore(box, window.marketSellerFee?.closest('label')||window.marketPrice.nextSibling);
        const update=()=>{const p=Number(window.marketPrice.value||0),fee=itemEscrowFeePreview(p),sellerPays=!!window.marketSellerFee?.checked;box.innerHTML=p>0?`<b>ค่าธรรมเนียมกลางไอเทม:</b> ${fee.toLocaleString('th-TH')} Credit<br>${sellerPays?`ผู้ซื้อจ่าย ${p.toLocaleString('th-TH')} Credit / ผู้ขายรับสุทธิ ${(p-fee).toLocaleString('th-TH')} Credit`:`ผู้ซื้อจ่าย ${(p+fee).toLocaleString('th-TH')} Credit / ผู้ขายรับ ${p.toLocaleString('th-TH')} Credit`}`:'กรอกราคาเพื่อดูค่าธรรมเนียม'};
        window.marketPrice.addEventListener('input',update); window.marketSellerFee?.addEventListener('change',update); update();
      }
    }catch(e){}
  };
  window.createMarketItem=async function(){
    if(!need())return;
    try{
      const fd=new FormData();
      fd.append('title',marketTitle.value); fd.append('description',marketDesc.value); fd.append('category',marketCategory.value||'ไอเทมเกม'); fd.append('image_url',marketImage?.value||''); fd.append('price',Number(marketPrice.value||0)); fd.append('seller_character',marketChar.value); fd.append('seller_pays_fee',marketSellerFee.checked?'true':'false');
      const files=marketImages?.files||[]; for(const f of files)fd.append('images',f);
      const r=await fetch('/api/market/items',{method:'POST',body:fd}); const j=await r.json(); if(!r.ok)throw Error(j.error||'ลงขายไม่สำเร็จ');
      marketTitle.value='';marketDesc.value='';if(marketImage)marketImage.value=''; if(marketImages)marketImages.value=''; marketPrice.value=''; marketChar.value=''; marketSellerFee.checked=false;
      showToast('ลงขายกลางไอเทมแล้ว');loadMarket();
    }catch(e){alert(e.message)}
  };
  window.marketCard=function(it){
    const mine=me&&Number(it.seller_id)===Number(me.id);const sold=it.status!=='active';const fee=Number(it.fee_amount||itemEscrowFeePreview(it.price));const buyerPay=it.seller_pays_fee?Number(it.price||0):Number(it.price||0)+fee;const sellerNet=it.seller_pays_fee?Number(it.price||0)-fee:Number(it.price||0);
    const imgs=(it.image_urls&&it.image_urls.length?it.image_urls:[it.image_url]).filter(Boolean);
    return `<div class="card marketItemCard">${imgs[0]?`<img src="${escapeHtml(imgs[0])}">`:''}<div class="content"><span class="tag">กลางไอเทมเกม</span><span class="tag ${sold?'danger':'success'}">${sold?'ปิดรายการ':'พร้อมขาย'}</span><h3>${escapeHtml(it.title||'-')}</h3><div class="price">${money(it.price||0,'Credit')}</div><div class="itemEscrowFeeBox"><b>ค่าธรรมเนียม:</b> ${fee.toLocaleString('th-TH')} Credit<br><span class="muted">${it.seller_pays_fee?'ผู้ขายรับค่าธรรมเนียมแทนผู้ซื้อ':'ผู้ซื้อเป็นผู้ชำระค่าธรรมเนียม'}</span><br><b>ผู้ซื้อจ่าย:</b> ${buyerPay.toLocaleString('th-TH')} Credit<br><b>ผู้ขายรับสุทธิ:</b> ${sellerNet.toLocaleString('th-TH')} Credit</div><div class="meta"><div>ผู้ขาย: ${escapeHtml(it.seller_name||it.seller?.username||'-')}</div><div>ตัวละครผู้ขาย: ${escapeHtml(it.seller_character||'-')}</div></div><p class="muted">${escapeHtml(it.description||'')}</p>${imgs.length>1?`<div class="marketEvidenceGrid">${imgs.slice(1).map(u=>`<a href="${escapeHtml(u)}" target="_blank"><img src="${escapeHtml(u)}"></a>`).join('')}</div>`:''}${sold?'<button disabled>จบรายการแล้ว</button>':mine?`<button class="danger" onclick="cancelMarketItem(${it.id})">ยกเลิกการขาย</button>`:`<button class="green" onclick="buyMarketItem(${it.id})">ซื้อผ่านกลางไอเทม</button>`}</div></div>`;
  };
  window.buyMarketItem=async function(id){
    if(!need())return;
    const buyerCharacter=prompt('กรอกชื่อตัวละครของผู้ซื้อสำหรับรับไอเทม'); if(!buyerCharacter)return;
    if(!confirm('ยืนยันซื้อผ่านระบบกลางไอเทม?\nระบบจะล็อก Credit ไว้ก่อน ผู้ขายต้องส่งมอบและ Admin ต้องอนุมัติหลักฐานก่อน คุณจึงจะกดยืนยันรับสินค้าได้'))return;
    try{await api('/api/market/items/'+id+'/buy',{method:'POST',body:JSON.stringify({buyer_character:buyerCharacter})});showToast('ซื้อสำเร็จ ระบบล็อก Credit ไว้แล้ว');show('orders')}catch(e){alert(e.message)}
  };
  window.orderCard=function(o){
    const isBuyer=o.buyer_id==me?.id, isSeller=o.seller_id==me?.id; const role=isBuyer?'คุณเป็นผู้ซื้อ':isSeller?'คุณเป็นผู้ขาย':'เกี่ยวข้อง';
    const ev=(o.delivery_evidence||[]).filter(Boolean);
    const evHtml=ev.length?`<div class="marketEvidenceGrid">${ev.map(u=>String(u).match(/\.(png|jpe?g|webp|gif)$/i)||String(u).startsWith('/uploads/')?`<a href="${escapeHtml(u)}" target="_blank"><img src="${escapeHtml(u)}"></a>`:`<a class="button light" href="${escapeHtml(u)}" target="_blank">ดูหลักฐาน</a>`).join('')}</div>`:'';
    return `<div class="card content"><h3>${escapeHtml(o.item_title)}</h3><div class="tag">${role}</div><div class="itemEscrowOrderMeta"><div>สถานะ: <b>${status(o.status)}</b></div><div>ราคาสินค้า: <b>${money(o.amount,o.currency)}</b></div><div>ค่าธรรมเนียม: <b>${money(o.service_fee||0,o.currency)}</b></div><div>Credit ที่ล็อกไว้: <b>${money(o.locked_amount||o.amount,o.currency)}</b></div><div>ตัวละครผู้ขาย: <b>${escapeHtml(o.seller_character||'-')}</b></div><div>ตัวละครผู้ซื้อ: <b>${escapeHtml(o.buyer_character||'-')}</b></div>${o.delivered_character?`<div>ตัวละครที่ผู้ขายส่งมอบจริง: <b>${escapeHtml(o.delivered_character)}</b></div>`:''}<div>ผู้ซื้อ: ${escapeHtml(o.buyer?.display_name||o.buyer?.username||'-')} (#${o.buyer_id})</div><div>ผู้ขาย: ${escapeHtml(o.seller?.display_name||o.seller?.username||'-')} (#${o.seller_id})</div>${o.admin_check_note?`<div class="notice">บันทึก Admin: ${escapeHtml(o.admin_check_note)}</div>`:''}${o.resolution_note?`<div class="notice">ผลตัดสิน: ${escapeHtml(o.resolution_note)}</div>`:''}${o.dispute?`<div class="notice error">ข้อพิพาท: ${escapeHtml(o.dispute.reason||'-')}</div>`:''}</div>${evHtml}${orderTimeline(o)}${actions(o)}</div>`;
  };
  window.actions=function(o){
    let h='';
    if(o.seller_id==me?.id&&o.status==='WAIT_SHIPPING')h+=`<input id="dc${o.id}" placeholder="ชื่อตัวละครผู้รับที่ส่งมอบจริง"><input id="dn${o.id}" placeholder="หมายเหตุการส่งมอบ"><input id="proof${o.id}" type="file" accept="image/*" multiple><div class="muted">แนบรูปหลักฐานอย่างน้อย 1 รูป เพื่อส่งให้ Admin ตรวจสอบ</div><button class="green" onclick="ship(${o.id})">ส่งมอบแล้ว / ส่งให้ Admin ตรวจสอบ</button>`;
    if(o.buyer_id==me?.id&&o.status==='ADMIN_APPROVED')h+=`<button class="green" onclick="confirmO(${o.id})">ยืนยันได้รับสินค้า</button>`;
    if([o.seller_id,o.buyer_id].includes(me?.id)&&!['COMPLETED','REFUNDED','DISPUTE'].includes(o.status))h+=`<input id="dp${o.id}" placeholder="เหตุผลหากต้องการแจ้งปัญหา"><input id="ev${o.id}" type="file" multiple accept="image/*,.pdf"><button class="danger" onclick="dispute(${o.id})">แจ้งปัญหา / เปิดข้อพิพาท</button>`;
    return h||'<span class="muted">ไม่มีรายการที่ต้องดำเนินการ</span>';
  };
  window.ship=async function(id){
    try{
      const fd=new FormData(); fd.append('delivered_character',document.getElementById('dc'+id)?.value||''); fd.append('delivery_note',document.getElementById('dn'+id)?.value||'');
      const files=document.getElementById('proof'+id)?.files||[]; for(const f of files)fd.append('evidence',f);
      const r=await fetch('/api/orders/'+id+'/ship',{method:'POST',body:fd}); const j=await r.json(); if(!r.ok)throw Error(j.error||'ส่งมอบไม่สำเร็จ');
      alert('ส่งหลักฐานให้ Admin ตรวจสอบแล้ว');loadOrders();
    }catch(e){alert(e.message)}
  };
  window.openAdminOrderDetail=async function(id){
    try{
      const j=await api('/api/admin/orders/'+id+'/detail'); const o=j.order||{}; const d=o.dispute||{};
      const delivery=(o.delivery_evidence||[]).filter(Boolean); const dispute=(d.evidence||[]).filter(Boolean);
      const grid=(arr)=>arr.length?`<div class="adminOrderEvidenceGrid">${arr.map(url=>String(url).match(/\.(png|jpe?g|webp|gif)$/i)||String(url).startsWith('/uploads/')?`<a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(url)}"></a>`:`<a class="button light" href="${escapeHtml(url)}" target="_blank">ดูไฟล์</a>`).join('')}</div>`:'<div class="notice">ไม่มีหลักฐานแนบ</div>';
      const eventRows=(j.events||o.events||[]).map(e=>`<div class="muted">${e.created_at?new Date(e.created_at).toLocaleString('th-TH'):'-'} - ${escapeHtml(e.note||e.type||'-')}</div>`).join('')||'<div class="muted">ยังไม่มีประวัติ</div>';
      const adminActions=o.status==='PENDING_ADMIN_CHECK'?`<div class="itemEscrowAdminActions"><input id="adminCheckNote${o.id}" placeholder="บันทึกผลตรวจ เช่น สินค้าตรง / ส่งถูกตัวละคร"><button class="green" onclick="adminApproveItem(${o.id})">อนุมัติหลักฐานส่งมอบ</button><button class="danger" onclick="adminRejectItem(${o.id})">ตีกลับให้ผู้ขายส่งหลักฐานใหม่</button></div>`:'';
      showHelp('รายละเอียดกลางไอเทม',`<div class="adminOrderDetailBlock"><h3>${escapeHtml(o.item_title||'-')}</h3><p><b>สถานะ:</b> ${status(o.status)}</p><p><b>ราคา:</b> ${money(o.amount,o.currency||'Credit')} | <b>ค่าธรรมเนียม:</b> ${money(o.service_fee||0,o.currency||'Credit')} | <b>ล็อกไว้:</b> ${money(o.locked_amount||o.amount,o.currency||'Credit')}</p><p><b>ผู้ซื้อ:</b> ${escapeHtml(o.buyer?.display_name||o.buyer?.username||'-')} (#${escapeHtml(o.buyer_id||'-')})</p><p><b>ผู้ขาย:</b> ${escapeHtml(o.seller?.display_name||o.seller?.username||'-')} (#${escapeHtml(o.seller_id||'-')})</p><p><b>ตัวละครผู้ขาย:</b> ${escapeHtml(o.seller_character||'-')}</p><p><b>ตัวละครผู้ซื้อ:</b> ${escapeHtml(o.buyer_character||'-')}</p><p><b>ตัวละครที่ส่งมอบจริง:</b> ${escapeHtml(o.delivered_character||'-')}</p></div><div class="adminOrderDetailBlock"><h3>หลักฐานการส่งมอบจากผู้ขาย</h3><p>${escapeHtml(o.delivery_note||'')}</p>${grid(delivery)}</div><div class="adminOrderDetailBlock"><h3>Admin Check</h3>${adminActions||'<div class="notice">รายการนี้ไม่ได้รอ Admin ตรวจสอบ</div>'}</div><div class="adminOrderDetailBlock"><h3>ข้อพิพาท</h3><p>${escapeHtml(d.reason||'-')}</p>${grid(dispute)}</div><div class="adminOrderDetailBlock"><h3>ประวัติระบบ</h3>${eventRows}</div>`);
    }catch(e){alert(e.message)}
  };
  window.adminApproveItem=async function(id){try{const note=document.getElementById('adminCheckNote'+id)?.value||'';await api('/api/admin/orders/'+id+'/approve-item',{method:'POST',body:JSON.stringify({note})});alert('อนุมัติแล้ว ระบบแจ้งผู้ซื้อให้ยืนยันรับสินค้า');loadAdmin()}catch(e){alert(e.message)}};
  window.adminRejectItem=async function(id){try{const note=document.getElementById('adminCheckNote'+id)?.value||'หลักฐานยังไม่ครบถ้วน';await api('/api/admin/orders/'+id+'/reject-item',{method:'POST',body:JSON.stringify({note})});alert('ตีกลับให้ผู้ขายส่งหลักฐานใหม่แล้ว');loadAdmin()}catch(e){alert(e.message)}};
  const oldLoadAdmin=window.loadAdmin;
  window.loadAdmin=async function(){
    if(oldLoadAdmin)await oldLoadAdmin();
    try{
      const e=await api('/api/admin/escrow');
      const pending=(e.orders||[]).filter(o=>o.status==='PENDING_ADMIN_CHECK');
      if(window.adminBox&&pending.length){
        const html=`<h3>Admin Check กลางไอเทม</h3><div class="notice">ตรวจว่าสินค้าที่ส่งมอบตรงกับรายการขาย และส่งถูกตัวละครผู้ซื้อ ก่อนกดอนุมัติ</div><table><tr><th>ID</th><th>สินค้า</th><th>ตัวละคร</th><th>หลักฐาน</th><th>ตรวจสอบ</th></tr>${pending.map(o=>`<tr><td>#${o.id}</td><td>${escapeHtml(o.item_title||'-')}</td><td>ผู้ซื้อ: ${escapeHtml(o.buyer_character||'-')}<br>ส่งจริง: ${escapeHtml(o.delivered_character||'-')}</td><td>${(o.delivery_evidence||[]).length} รูป/ไฟล์</td><td><button class="green" onclick="openAdminOrderDetail(${o.id})">Admin Check</button></td></tr>`).join('')}</table>`;
        window.adminBox.insertAdjacentHTML('afterbegin',html);
      }
    }catch(e){}
  };
})();
