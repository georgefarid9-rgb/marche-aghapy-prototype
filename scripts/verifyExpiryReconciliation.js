const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aghapy-expiry-'));
process.env.SQLITE_PATH = path.join(dir, 'test.sqlite');
const sequelize = require('../src/database');
const { RestockAlert } = require('../src/models');
const InventoryController = require('../src/controllers/InventoryController');
const RealDate = Date;
let clock = '2030-01-01T12:00:00Z';
class FakeDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return new RealDate(clock).getTime(); } }
async function run() {
 await sequelize.sync(); global.Date = FakeDate;
 const controller = new InventoryController();
 assert.equal(await controller.submitNewProduct(JSON.stringify({productId:'DATE-P',inventoryId:'DATE-I',productName:'Date test',category:'Test',quantityOnHand:10,reorderLevel:2,expiryDate:'2030-01-10'})),true);
 let {server} = require('../src/server');
 async function start() { await new Promise(r=>server.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${server.address().port}`; }
 async function read(base) { const response=await fetch(`${base}/api/inventory/DATE-P`); assert.equal(response.status,200); return response.json(); }
 let base=await start(); let result=await read(base); assert.equal(result.expiryStatus,'NOT_EXPIRING_SOON'); assert.equal(result.alert,null);
 clock='2030-01-03T12:00:00Z'; result=await read(base); assert.equal(result.expiryStatus,'NEAR_EXPIRY'); assert.ok(result.alert); const id=result.alert.alertId;
 await Promise.all([read(base),read(base)]); assert.equal(await RestockAlert.count({where:{inventoryId:'DATE-I',alertStatus:'PENDING'}}),1);
 clock='2030-01-11T12:00:00Z'; result=await read(base); assert.equal(result.expiryStatus,'EXPIRED'); assert.equal(result.alert.alertId,id); assert.match(result.alert.reorderInformation,/EXPIRED/);
 await new Promise(r=>server.close(r)); delete require.cache[require.resolve('../src/server')]; ({server}=require('../src/server')); base=await start(); result=await read(base); assert.equal(result.alert.alertId,id); assert.equal(await RestockAlert.count({where:{inventoryId:'DATE-I',alertStatus:'PENDING'}}),1);
 await new Promise(r=>server.close(r)); console.log('PASS: date transitions, daily reconciliation, no duplicates, and restart');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{global.Date=RealDate;await sequelize.close();fs.rmSync(dir,{recursive:true,force:true})});
