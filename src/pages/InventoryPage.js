
const InventoryController = require("../controllers/InventoryController");

class InventoryPage {
  constructor(controller = new InventoryController()) {
    this.controller = controller;

    // Information that would normally appear on the screen.
    this.currentInventory = [];
    this.existingProduct = null;
    this.updatedInformation = null;

    // The selected task and product.
    this.selectedTask = null;
    this.selectedProductId = null;

    // Data entered through the form.
    this.formData = {};
    this.requiredFields = [];

    // Feedback displayed to the user.
    this.errorMessage = null;
    this.warningMessage = null;
    this.lastResult = null;
    this.lastAlert = null;

    // Current page state.
    this.view = "IDLE";
    this.reviewComplete = false;
  }

  // 1. Begin the inventory review.
  async beginInventoryReview() {
    this.reviewComplete = false;
    this.lastResult = null;
    this.lastAlert = null;
    this.errorMessage = null;
    this.warningMessage = null;

    await this.displayCurrentInventory();
  }

  // 2. Retrieve and display current inventory.
  async displayCurrentInventory() {
    const records = await this.controller.retrieveInventory();

    this.currentInventory = records.map((record) => ({
      inventoryId: record.inventoryId,
      productId: record.productId,
      productName: record.product?.productName ?? null,
      quantityOnHand: record.quantityOnHand,
      reorderLevel: record.reorderLevel,
      expiryDate: record.expiryDate,
      inventoryStatus: record.evaluateInventoryStatus(),
      expiryStatus: record.evaluateExpiryConditions(),
    }));

    this.view = "INVENTORY_LIST";
  }

  // 3. Start the task selected by the user.
  async selectMaintenanceTask() {
    if (this.selectedTask === "NEW") {
      this.selectRecordNewProduct();
    } else if (this.selectedTask === "UPDATE") {
      await this.selectUpdateExistingProduct();
    } else {
      this.errorMessage = "Select NEW or UPDATE.";
      this.view = "ERROR";
    }
  }

  // 4. Display the information saved by the controller.
  displayUpdatedInformation() {
    if (!this.lastResult) {
      this.errorMessage = "No updated information is available.";
      this.view = "ERROR";
      return;
    }

    const { product, inventory } = this.lastResult;

    this.updatedInformation = {
      product: product.toJSON(),
      inventory: inventory.toJSON(),
      stockStatus: inventory.evaluateInventoryStatus(),
      expiryStatus: inventory.evaluateExpiryConditions(),
    };

    this.view = "UPDATED_DETAILS";
  }

  // 5. Let the user review the saved information.
  reviewUpdatedInformation() {
    if (!this.lastResult) {
      this.errorMessage = "Save inventory information first.";
      this.view = "ERROR";
      return;
    }

    this.view = "REVIEWING_UPDATED_INFORMATION";
  }

  // 6. Begin recording a new product.
  selectRecordNewProduct() {
    this.selectedTask = "NEW";
    this.selectedProductId = null;
    this.controller.selectedTask = "NEW";
    this.controller.selectedProductId = null;

    this.formData = {};
    this.lastResult = null;
    this.errorMessage = null;

    this.requestProductAndInventoryDetails();
  }

  // 7. Identify the fields needed for a new product.
  requestProductAndInventoryDetails() {
    this.requiredFields = [
      "productId",
      "productName",
      "inventoryId",
      "quantityOnHand",
      "reorderLevel",
      "expiryDate",
    ];

    this.view = "NEW_PRODUCT_FORM";
  }

  // 8. Collect the entered product and inventory details.
  provideProductQuantityExpiry() {
    this.controller.selectedTask = "NEW";
    this.controller.pendingData = JSON.stringify(this.formData);

    this.view = "READY_TO_SUBMIT";
  }

  // 9. Begin updating an existing product.
  async selectUpdateExistingProduct() {
    this.controller.selectedTask = "UPDATE";
    this.controller.selectedProductId = this.selectedProductId;

    this.lastResult = null;
    this.errorMessage = null;

    await this.displayExistingProduct();
  }

  // 10. Retrieve and display the selected product.
  async displayExistingProduct() {
    if (!this.selectedProductId) {
      this.errorMessage = "Select a product first.";
      this.view = "ERROR";
      return;
    }

    const product = await this.controller.retrieveSelectedProduct();

    if (!product || !product.inventoryRecord) {
      this.errorMessage = "Product or inventory record not found.";
      this.view = "ERROR";
      return;
    }

    this.existingProduct = product.toJSON();

    // Only changed fields will be submitted.
    this.formData = {};
    this.view = "EDIT_PRODUCT_FORM";
  }

  // 11. Collect proposed changes to an existing product.
  provideProductAndInventoryChanges() {
    this.controller.selectedTask = "UPDATE";
    this.controller.selectedProductId = this.selectedProductId;
    this.controller.pendingData = JSON.stringify(this.formData);

    this.view = "READY_TO_SUBMIT";
  }

  // 12. Refresh and display updated inventory.
  async displayUpdatedInventory() {
    await this.displayCurrentInventory();
    this.displayUpdatedInformation();

    this.view = "UPDATED_INVENTORY";
  }

  // 13. Validate and submit the product information.
  async submitProductInformation() {
    this.errorMessage = null;
    this.warningMessage = null;
    this.lastResult = null;
    this.lastAlert = null;

    this.controller.selectedTask = this.selectedTask;
    this.controller.selectedProductId = this.selectedProductId;
    this.controller.pendingData = JSON.stringify(this.formData);
    this.controller.lastResult = null;

    if (!this.controller.validateSubmittedData()) {
      this.requestCorrections();
      return;
    }

    // The controller executes the appropriate subflow.
    await this.controller.executeSelectedSubflow();

    if (this.controller.lastError || !this.controller.lastResult) {
      this.requestCorrections();
      return;
    }

    this.lastResult = this.controller.lastResult;
    this.lastAlert = this.controller.lastAlert;
    this.warningMessage = this.controller.lastWarning;

    await this.displayUpdatedInventory();
  }

  // 14. Inform the user that the input needs correction.
  requestCorrections() {
    this.errorMessage =
      this.controller.lastError ?? "Please correct the information.";

    this.view = "CORRECTION_REQUIRED";
  }

  // 15. Revalidate information after corrections.
  provideCorrectedInformation() {
    this.controller.pendingData = JSON.stringify(this.formData);

    if (this.controller.revalidateCorrectedData()) {
      this.errorMessage = null;
      this.view = "READY_TO_SUBMIT";
    } else {
      this.requestCorrections();
    }
  }

  // 16. Continue after the selected subflow has saved.
  continueSelectedSubflow() {
    if (!this.lastResult) {
      this.errorMessage = "No completed inventory update to continue.";
      this.view = "ERROR";
      return;
    }

    // Do not execute the save again.
    this.displayUpdatedInformation();
  }

  // 17. Complete the inventory review.
  inventoryReviewComplete() {
    if (!this.lastResult) {
      this.errorMessage = "Complete an inventory task first.";
      this.view = "ERROR";
      return;
    }

    this.reviewComplete = true;
    this.view = "COMPLETE";
  }
}

module.exports = InventoryPage;
