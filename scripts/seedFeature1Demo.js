// Add only missing, uniquely named demo products; never alter existing records.
const sequelize = require('../src/database');
const { Product, InventoryRecord } = require('../src/models');
const InventoryController = require('../src/controllers/InventoryController');
async function run() {
  for (const item of [
    {productId:'DEMO-F1-001',inventoryId:'DEMO-F1-INV-001',productName:'Foul Medames',category:'Canned Foods',description:'Egyptian fava beans',quantityOnHand:24,reorderLevel:10,expiryDate:null},
    {productId:'DEMO-F1-002',inventoryId:'DEMO-F1-INV-002',productName:'Tahini',category:'Pantry',description:'Sesame paste',quantityOnHand:4,reorderLevel:8,expiryDate:null},
    {productId:'DEMO-F1-003',inventoryId:'DEMO-F1-INV-003',productName:'Molokhia',category:'Frozen Foods',description:'Chopped molokhia leaves',quantityOnHand:0,reorderLevel:5,expiryDate:null}
  ]) {
    if (await Product.findByPk(item.productId) || await InventoryRecord.findByPk(item.inventoryId)) { console.log(`Skipped ${item.productId}: identifier already in use.`); continue; }
    const controller=new InventoryController();
    if (!await controller.submitNewProduct(JSON.stringify(item))) throw new Error(controller.lastError);
    console.log(`Created ${item.productId}.`);
  }
}
run().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sequelize.close());
