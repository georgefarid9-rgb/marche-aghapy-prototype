# Live demo script — Marché Aghapy

**Before the presentation:** run `npm run demo:reset`, then `npm run demo`, and open http://localhost:3001 (local only; there is no login).
The screens follow the Milestone 6 Figma wireframes. The bottom-right corner of each screen shows which wireframe it matches.
Start **Signed in as: Bassem — Store Owner** (top bar) and **EN**. All amounts are in Canadian dollars (CAD).

---

## 1. Update Existing Product Inventory — scenario 1 (wireframes 1.1 to 1.5)
1. Click **Products & Inventory** *(IP1)*. The inventory list opens *(1.1)*.
2. Type `feta` in the search box, then click **Feta Cheese 400g** *(IP2, IP3)*. The product details open *(1.2, IP4)*.
3. Click **Edit Inventory** *(1.3)*.
4. Enter quantity `-3` and an expiry date in the past, then click **Save Changes**. "Changes not saved" appears, and both fields are highlighted *(1.4, IP6)*.
5. Enter quantity `4` and the expiry `12/28/2026`, then save *(IP5, IP7)*. "Changes saved" and "Restock alert created" appear *(1.5, IP8, IP9)*.
6. Click **View Restock Alert** to show the restock list, then go back and click **Done Reviewing**.

## 2. Generate and Review an Inventory Report — scenario 2 (wireframes 2.1 to 2.7)
1. Click **Dashboard** *(2.1, IP1, IP2)*. Point out the four summary cards, the sales chart for the last 7 days (the daily total of recorded sales, which matches each day's register total in Accounting) and the **Needs attention** list.
2. Click **Reports** *(IP3)*. Three report types are offered (Inventory, Sales, Expiry & Restock). Keep **Inventory Report** selected and click **Generate Report** *(2.2, IP4 to IP6)*.
3. The report shows 14 products and 237 units, low-stock products first *(2.3, IP7)*.
4. Type `Fetta` in **Product** and click **Apply Filter**. An inline error appears, and the unfiltered report stays *(2.5, IP11)*.
5. Clear **Product**, choose **Category = Dairy**, and apply. The blue filter chip appears *(2.4, IP8 to IP10)*.
6. Choose **Category = Bakery** and **Stock status = Out of stock**, then apply. "No inventory data to show" appears and Export is disabled *(2.6, IP12)*. Click **Clear filter**.
7. Click **Export**, choose **PDF** or **CSV**, keep the file name, and click **Export**. The file downloads *(2.7, IP13)*.
8. Click **Back to Dashboard** *(IP14)*.

## 3. Record Daily Sales Revenue — scenario 3 (wireframes 3.1 to 3.5)
1. Click **Accounting** *(3.1, IP1, IP2)*. The month-to-date cards and recent transactions appear.
2. Click **+ Record Transaction** *(3.2, IP3, IP4)*. **Revenue** is already selected *(IP5)*.
3. Clear **Category** and click **Save Transaction** with the amount empty. "Transaction not saved" appears, and two fields are highlighted *(3.3, IP10)*.
4. Enter `2845.60` *(IP6)*. The **Ledger preview** updates. Choose **Daily sales** *(IP7)*, keep today's date *(IP8)*, and save *(IP9)*.
5. "Transaction saved" appears with the profit-and-loss table showing Before / This transaction / After *(3.4, IP11, IP12)*.
6. Click **View Transaction History**. The new transaction is highlighted, with its running balance *(3.5, IP13)*. Click **Back to Accounting Dashboard** *(IP14)*.
7. Optional: generate a **Sales Report** for this month. Its total matches the "Daily sales" revenue in Accounting (the transaction you just entered by hand is not a sale, so it is not in the report).

## 4. Supplier & Customer Profiles (Feature 3)
1. Search for supplier `Cairo Spice Traders`. It is not found *(2a)*, so click **Create this profile**.
2. Change the name to `Hellenic Foods Inc.` and the lead time to `-2`, then save. Both errors appear *(5a)*. Fix them (name `Cairo Spice Traders`, lead time `12`) and save.
3. Open **Hellenic Foods Inc.** and show the performance report: average lead time, on-time rate and fill rate.
4. Click **+ Record delivery**. Enter ordered `50` and received `42`, then save. **Discrepancy** is flagged and the owner is notified *(6a)*.
5. Open **Montréal Fresh Bakery**, record an **Unplanned delivery** *(6b)*, then open the **Owner notifications** tab.
6. On the **Customers** tab, open **Youssef Girgis** and enter the phone `514-555-0311` and the email `abc`. Both are rejected *(2S.3)*.

## 5. Employee Schedule (Feature 5)
1. Select **Mina Boutros** and click **Edit** on a shift. Enter an end time earlier than the start time, then save. An error appears. Fix it and save.
2. Open schedule **SCH-002**, assign a shift, and click **Publish schedule**. Then use **Employee view** to show the published shifts.
3. Optional: open the same screen in a second window and edit a different shift. Each window saves only its own shift.

## 6. Customer Support (Feature 6)
1. Open **Customer Support** as the owner: only the **Owner inbox** is shown, with a count for each section and the total.
2. In the top bar, switch **Signed in as** to **Cashier One — Employee**.
3. Look up `514-555-0311`: it is refused (digits only) and the box is marked. Look up `5145550311` (Mariam Hanna).
4. Click **Return** on a SALE-002 item and approve the refund ("Refund of $… CAD approved"). The purchase history now shows "1 returned".
5. Click **Return** on her oldest sale (more than 30 days ago): the return is refused (outside the 30-day window).
6. Open a complaint case and click **Escalate to owner**. Opening the same complaint again is refused (duplicate).
7. Switch **Signed in as** back to **Bassem — Store Owner**. The case is in the inbox; click **Resolve**.
8. Switch to the employee again and look up `CUST-002`: the case shows **Resolved**.
9. Look up `CUST-999`. No record is found, so flag the missing record *(3a)*.

## 7. Français (optional)
1. Click **FR** in the top bar. Every screen switches to French and money shows as `2 012,85 $ CA`. Click **EN** to switch back.
