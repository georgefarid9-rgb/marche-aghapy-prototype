const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aghapy-web-'));
process.env.SQLITE_PATH=path.join(dir,'test.sqlite');
const sequelize=require('../src/database');
const {server}=require('../src/server');
async function run(){
 await sequelize.sync(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function req(url,method='GET',data){const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return [response.status,await response.json()]}
 const item={productId:'P1',inventoryId:'I1',productName:'Beans',category:'Canned',quantityOnHand:8,reorderLevel:3,expiryDate:null};
 assert.equal((await req('/api/inventory'))[1].length,0);
 assert.equal((await req('/api/inventory','POST',item))[0],201);
 assert.equal((await req('/api/inventory','POST',item))[0],409);
 assert.equal((await req('/api/inventory/P1','PUT',{quantityOnHand:-1}))[0],400);
 assert.equal((await req('/api/inventory/P1','PUT',{quantityOnHand:1.5}))[0],400);
 assert.equal((await req('/api/inventory/P1','PUT',{expiryDate:'2026-02-30'}))[0],400);
 assert.equal((await req('/api/inventory/P1'))[1].inventory.quantityOnHand,8);
 let [status,updated]=await req('/api/inventory/P1','PUT',{quantityOnHand:2,reorderLevel:3,expiryDate:null}); assert.equal(status,200); assert.equal(updated.stockStatus,'LOW_STOCK'); assert.ok(updated.alert);
 const alertId=updated.alert.alertId; updated=(await req('/api/inventory/P1','PUT',{quantityOnHand:1}))[1]; assert.equal(updated.alert.alertId,alertId);
 updated=(await req('/api/inventory/P1','PUT',{quantityOnHand:9}))[1]; assert.equal(updated.alert,null); assert.equal(updated.stockStatus,'IN_STOCK');
 assert.equal((await req('/api/inventory/missing'))[0],404);
 assert.equal((await req('/api/inventory'))[1][0].quantityOnHand,9);
 console.log('PASS: HTTP inventory creation, validation, persistence, alert refresh and resolution');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await new Promise(r=>server.close(r));await sequelize.close();fs.rmSync(dir,{recursive:true,force:true})});
