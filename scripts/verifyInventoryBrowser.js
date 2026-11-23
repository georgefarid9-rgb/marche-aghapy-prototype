const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'aghapy-browser-'));
process.env.SQLITE_PATH = path.join(dir,'test.sqlite');
const sequelize = require('../src/database');
const { server } = require('../src/server');
const InventoryController = require('../src/controllers/InventoryController');
const { InventoryRecord, RestockAlert } = require('../src/models');
async function run() {
 await sequelize.sync();
 const controller = new InventoryController();
 for (const item of [
  {productId:'P1',inventoryId:'I1',productName:'Foul Medames',category:'Canned',quantityOnHand:20,reorderLevel:5,expiryDate:null},
  {productId:'P2',inventoryId:'I2',productName:'Tahini',category:'Pantry',quantityOnHand:12,reorderLevel:3,expiryDate:null}
 ]) assert.equal(await controller.submitNewProduct(JSON.stringify(item)),true,controller.lastError);
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try {
  for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
   const page=await browser.newPage({viewport}); const exceptions=[]; page.on('pageerror',e=>exceptions.push(e.message));
   await page.route('**/api/inventory', route => route.abort(), { times: 1 }); await page.goto(url); await page.getByRole('button',{name:'Retry loading inventory'}).waitFor(); await page.getByRole('button',{name:'Retry loading inventory'}).click(); await page.getByText('Foul Medames',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Page overflows viewport');
   assert.equal(await page.locator('nav').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'Navigation overflows');
   await page.getByLabel('Filter by category').selectOption({label:'Pantry'}); assert.equal(await page.getByText('Foul Medames',{exact:true}).count(),0); await page.getByLabel('Filter by category').selectOption('');
   await page.getByLabel('Search products').fill('Foul'); assert.equal(await page.getByText('Tahini',{exact:true}).count(),0);
   await page.getByRole('button',{name:'View'}).click(); await page.getByRole('heading',{name:'Inventory information'}).waitFor();
   await page.getByRole('button',{name:'Edit Inventory'}).click(); await page.getByLabel('Quantity on hand').fill('19'); await page.getByRole('button',{name:'Cancel'}).click(); assert.equal((await InventoryRecord.findByPk('I1')).quantityOnHand,20);
   await page.getByRole('button',{name:'Edit Inventory'}).click(); await page.getByLabel('Quantity on hand').fill('-1'); await page.getByRole('button',{name:'Save Changes'}).click(); await page.getByText('Enter a whole number of zero or greater.').waitFor(); assert.equal((await InventoryRecord.findByPk('I1')).quantityOnHand,20);
   await page.getByLabel('Quantity on hand').fill('1.5'); await page.getByRole('button',{name:'Save Changes'}).click(); await page.getByText('Enter a whole number of zero or greater.').waitFor();
   await page.getByLabel('Quantity on hand').fill('2'); await page.getByLabel('Reorder level').fill('6'); await page.getByLabel('Expiry date').fill('2099-12-31'); await page.getByRole('button',{name:'Save Changes'}).click(); await page.getByRole('heading',{name:'Restock alert'}).waitFor(); assert.equal((await InventoryRecord.findByPk('I1')).reorderLevel,6);
   await page.getByRole('button',{name:'Done Reviewing'}).click(); await page.getByText('Foul Medames',{exact:true}).waitFor(); await page.reload(); await page.getByText('Foul Medames',{exact:true}).waitFor(); assert.equal((await InventoryRecord.findByPk('I1')).quantityOnHand,2);
   await page.getByRole('button',{name:'View'}).first().click(); await page.getByRole('button',{name:'Edit Inventory'}).click(); await page.getByLabel('Quantity on hand').fill('20'); await page.getByRole('button',{name:'Save Changes'}).click(); await page.getByText('Changes saved successfully.').waitFor(); assert.equal(await RestockAlert.count({where:{inventoryId:'I1',alertStatus:'PENDING'}}),0);
   await page.getByRole('button',{name:'Back to Inventory'}).click(); await page.getByText('Foul Medames',{exact:true}).waitFor(); await page.getByRole('row').filter({hasText:'Foul Medames'}).getByRole('button',{name:'View'}).click(); await page.getByRole('button',{name:'Edit Inventory'}).click(); const near=new Date(); near.setUTCDate(near.getUTCDate()+3); await page.getByLabel('Expiry date').fill(near.toISOString().slice(0,10)); await page.getByRole('button',{name:'Save Changes'}).click(); await page.getByText('Near expiry',{exact:true}).waitFor(); await page.getByRole('heading',{name:'Restock alert'}).waitFor(); await page.getByRole('button',{name:'Back to Inventory'}).click(); await page.getByText('Foul Medames',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Add Product'}).click(); await page.getByRole('button',{name:'Create Product'}).click(); await page.getByText('This field is required.').first().waitFor();
   const suffix=String(viewport.width); await page.getByLabel('Product ID').fill('P'+suffix); await page.getByLabel('Inventory ID').fill('I'+suffix); await page.getByLabel('Product name').fill('New '+suffix); await page.locator('#form #category').fill('Test'); await page.getByLabel('Initial quantity').fill('0'); await page.getByLabel('Reorder level').fill('3'); await page.getByLabel('Expiry date').fill('2000-01-01'); await page.getByRole('button',{name:'Create Product'}).click(); await page.getByRole('heading',{name:'Restock alert'}).waitFor(); await page.getByText('Expired',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Back to Inventory'}).click(); await page.getByText('New '+suffix,{exact:true}).waitFor(); await page.getByRole('button',{name:'Add Product'}).click(); await page.getByLabel('Product ID').fill('P'+suffix); await page.getByLabel('Inventory ID').fill('UNIQUE'+suffix); await page.getByLabel('Product name').fill('Duplicate'); await page.locator('#form #category').fill('Test'); await page.getByLabel('Initial quantity').fill('1'); await page.getByLabel('Reorder level').fill('0'); await page.getByRole('button',{name:'Create Product'}).click(); await page.getByRole('alert').getByText('Product ID already exists.').waitFor();
   assert.deepEqual(exceptions,[]); await page.close(); console.log(`PASS: browser workflow ${viewport.width}x${viewport.height}`);
  }
 } finally { await browser.close(); }
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await new Promise(r=>server.close(r));await sequelize.close();fs.rmSync(dir,{recursive:true,force:true})});
