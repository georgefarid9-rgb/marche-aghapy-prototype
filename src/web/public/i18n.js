// English / French for the web demo (EN | FR switch in the top bar).
//
// The pages are written in English. When French is chosen, every piece of screen text is
// looked up here and replaced as it appears (menus, headings, labels, buttons, table
// headers, placeholders, empty states and messages written in the browser), so the page
// code stays as it is. Text that is not in the list stays as written: product names,
// customer names, IDs, and the messages that come from the server's business rules
// (these stay in English, as agreed for this prototype).
//
// Numbers and money follow the language (ui.js money()), dates keep the wireframes'
// MM/DD/YYYY layout.

const STORAGE_KEY = "lang";

export function currentLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

export function setLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang === "fr" ? "fr" : "en");
  } catch {
    /* storage unavailable: the choice lasts until the page is reloaded */
  }
}

// ----- Fixed text -----
const FR = {
  // Top bar, navigation, status bar
  "Marché Aghapy — Back Office": "Marché Aghapy — Arrière-boutique",
  "Back Office": "Arrière-boutique",
  "Marché Aghapy, back office home": "Marché Aghapy, accueil de l'arrière-boutique",
  "Search the back office": "Rechercher dans l'arrière-boutique",
  Notifications: "Notifications",
  "Restock alerts and owner notifications": "Alertes de réapprovisionnement et avis au propriétaire",
  "Main navigation": "Navigation principale",
  Dashboard: "Tableau de bord",
  Reports: "Rapports",
  "Products & Inventory": "Produits et inventaire",
  "Supplier & Customer Profiles": "Profils fournisseurs et clients",
  Accounting: "Comptabilité",
  "Employee Schedule": "Horaire des employés",
  "Customer Support": "Service à la clientèle",
  "Team 1 · BTM 495": "Équipe 1 · BTM 495",
  "Store Owner": "Propriétaire",
  Employee: "Employé",
  "Signed in as": "Connecté en tant que",
  Language: "Langue",
  Ready: "Prêt",
  "Loading…": "Chargement…",
  "Unexpected error": "Erreur inattendue",
  "The server is not responding. Is `npm run demo` still running?":
    "Le serveur ne répond pas. `npm run demo` est-il toujours lancé?",
  "The request failed. Please try again.": "La demande a échoué. Veuillez réessayer.",

  // Common words, buttons, statuses
  Back: "Retour",
  Cancel: "Annuler",
  Edit: "Modifier",
  View: "Voir",
  Search: "Rechercher",
  Export: "Exporter",
  Next: "Suivant",
  Prev: "Précédent",
  Saved: "Enregistré",
  Status: "Statut",
  Date: "Date",
  Time: "Heure",
  Type: "Type",
  Total: "Total",
  Amount: "Montant",
  "Amount (CAD)": "Montant (CAD)",
  Category: "Catégorie",
  Description: "Description",
  "Description (optional)": "Description (facultatif)",
  Product: "Produit",
  Products: "Produits",
  Customer: "Client",
  Customers: "Clients",
  Supplier: "Fournisseur",
  Suppliers: "Fournisseurs",
  Employees: "Employés",
  Role: "Rôle",
  Email: "Courriel",
  Phone: "Téléphone",
  "Phone number": "Numéro de téléphone",
  Note: "Note",
  "Note (optional)": "Note (facultatif)",
  Reason: "Motif",
  Action: "Action",
  ID: "ID",
  All: "Tous",
  Start: "Début",
  End: "Fin",
  From: "Du",
  To: "Au",
  Period: "Période",
  Qty: "Qté",
  "Unit price": "Prix unitaire",
  Sale: "Vente",
  Request: "Demande",
  Case: "Dossier",
  Return: "Retour",
  Returns: "Retours",
  Open: "Ouvert",
  Resolved: "Résolu",
  "Pending Owner Review": "En attente du propriétaire",
  Pending: "En attente",
  Refunded: "Remboursé",
  Rejected: "Refusé",
  Active: "Actif",
  Inactive: "Inactif",
  Activate: "Activer",
  Deactivate: "Désactiver",
  Draft: "Brouillon",
  Published: "Publié",
  Cancelled: "Annulé",
  Completed: "Terminé",
  Unread: "Non lu",
  Read: "Lu",
  Good: "Bon",
  Acceptable: "Acceptable",
  Poor: "Mauvais",
  Revenue: "Revenu",
  Expense: "Dépense",
  Expenses: "Dépenses",
  Balance: "Solde",
  Profit: "Profit",
  Loss: "Perte",
  Unavailable: "Non disponible",
  "In stock": "En stock",
  "Low stock": "Stock faible",
  "Out of stock": "Rupture de stock",
  Low: "Faible",
  Out: "Rupture",
  OK: "OK",
  Expiring: "Bientôt périmé",
  Expired: "Périmé",
  "Near expiry": "Bientôt périmé",
  "Nothing to show yet.": "Rien à afficher pour le moment.",
  "— None —": "— Aucun —",
  Before: "Avant",
  After: "Après",

  // Fixed categories defined by the app
  "Daily sales": "Ventes quotidiennes",
  Catering: "Traiteur",
  "Other income": "Autre revenu",
  "Supplier payment": "Paiement fournisseur",
  Rent: "Loyer",
  Utilities: "Services publics",
  Wages: "Salaires",
  "Other expense": "Autre dépense",
  Refund: "Remboursement",
  "Product quality": "Qualité du produit",
  Service: "Service",
  Pricing: "Prix",
  Other: "Autre",
  "Damaged product": "Produit endommagé",

  // Feature 1 — Products and inventory
  "+ Add Product": "+ Ajouter un produit",
  "Add Product": "Ajouter un produit",
  "Search existing products and update their stock details.": "Recherchez des produits et mettez à jour leur stock.",
  "Search by product name, SKU or category": "Rechercher par nom, UGS ou catégorie",
  "Search products": "Rechercher des produits",
  "Filter by category": "Filtrer par catégorie",
  "All categories": "Toutes les catégories",
  "All products": "Tous les produits",
  "No product matches your search.": "Aucun produit ne correspond à votre recherche.",
  SKU: "UGS",
  "SKU (product ID)": "UGS (ID du produit)",
  Inventory: "Inventaire",
  "Inventory ID": "ID d'inventaire",
  "Product ID": "ID du produit",
  "Product name": "Nom du produit",
  "Qty on hand": "Qté en stock",
  "Quantity on hand": "Quantité en stock",
  "New quantity on hand": "Nouvelle quantité en stock",
  "Initial quantity": "Quantité initiale",
  "Reorder level": "Seuil de réapprovisionnement",
  "Reorder lvl": "Seuil",
  Expiry: "Péremption",
  "Expiry date": "Date de péremption",
  "Expiry warning": "Avertissement de péremption",
  "Last updated": "Dernière mise à jour",
  "Updated by": "Mis à jour par",
  "Inventory information": "Information d'inventaire",
  "Product information": "Information sur le produit",
  "Product and stock details": "Détails du produit et du stock",
  "Stock details": "Détails du stock",
  "Stock status": "État du stock",
  "Edit Inventory": "Modifier l'inventaire",
  "Save Changes": "Enregistrer les modifications",
  "Save changes": "Enregistrer les modifications",
  "Save Product": "Enregistrer le produit",
  "Create Product": "Créer le produit",
  "Done Reviewing": "Révision terminée",
  "Back to Inventory": "Retour à l'inventaire",
  "View Restock Alert": "Voir l'alerte de réapprovisionnement",
  "Restock Alerts": "Alertes de réapprovisionnement",
  "Restock alerts": "Alertes de réapprovisionnement",
  "Restock alert": "Alerte de réapprovisionnement",
  "Restock alert created": "Alerte de réapprovisionnement créée",
  "Pending restock alerts": "Alertes de réapprovisionnement en attente",
  "No pending restock alerts.": "Aucune alerte de réapprovisionnement en attente.",
  "No restock alerts for this product.": "Aucune alerte de réapprovisionnement pour ce produit.",
  "Products at or below their reorder level, waiting for the store owner.":
    "Produits au seuil de réapprovisionnement ou en dessous, en attente du propriétaire.",
  "A restock alert is created when quantity is at or below this":
    "Une alerte est créée quand la quantité atteint ce seuil ou moins",
  "Reason for change": "Raison du changement",
  "Stock count correction": "Correction du décompte",
  "Received delivery": "Livraison reçue",
  "Sold / used": "Vendu / utilisé",
  "Damaged / expired": "Endommagé / périmé",
  "Whole number, 0 or more": "Nombre entier, 0 ou plus",
  "Whole number, 0 or more.": "Nombre entier, 0 ou plus.",
  "MM/DD/YYYY – must be after today": "MM/JJ/AAAA – doit être après aujourd'hui",
  "Quantity must be a whole number of 0 or more.": "La quantité doit être un nombre entier de 0 ou plus.",
  "Reorder level must be a whole number of 0 or more.": "Le seuil doit être un nombre entier de 0 ou plus.",
  "Enter the expiry date.": "Entrez la date de péremption.",
  "Enter a whole number of zero or greater.": "Entrez un nombre entier de zéro ou plus.",
  "This field is required.": "Ce champ est obligatoire.",
  "Change the quantity, expiry date or reorder level first.":
    "Modifiez d'abord la quantité, la date de péremption ou le seuil.",
  "Changes not saved": "Modifications non enregistrées",
  "Changes saved": "Modifications enregistrées",
  "Changes saved successfully.": "Modifications enregistrées avec succès.",
  "Editing – unsaved changes": "Modification – changements non enregistrés",
  "Fix the highlighted fields, then select Save Product again.":
    "Corrigez les champs en surbrillance, puis choisissez Enregistrer le produit de nouveau.",
  "Inventory review complete.": "Révision de l'inventaire terminée.",
  "New product – not saved yet": "Nouveau produit – pas encore enregistré",
  "Nothing to save": "Rien à enregistrer",
  "Product not found": "Produit introuvable",
  "Product not saved": "Produit non enregistré",
  "Product recorded.": "Produit enregistré.",
  "Record a new product and its first inventory. Fields marked * are required.":
    "Enregistrez un nouveau produit et son premier inventaire. Les champs marqués * sont obligatoires.",
  "Update the stock details. Fields marked * are required.":
    "Mettez à jour le stock. Les champs marqués * sont obligatoires.",
  "The details are validated before anything is saved.": "Les détails sont validés avant tout enregistrement.",
  "Viewing product record": "Consultation de la fiche produit",
  "No category": "Sans catégorie",
  "Select a category": "Choisir une catégorie",
  "inventory information": "information d'inventaire",
  "e.g. Dairy": "ex. Produits laitiers",
  "e.g. INV-020": "ex. INV-020",
  "e.g. PROD-020": "ex. PROD-020",
  "e.g. Counted after weekend sales": "ex. Compté après les ventes de la fin de semaine",

  // Feature 2 — Dashboard and reports
  "Inventory items": "Articles en inventaire",
  "Today's sales": "Ventes du jour",
  "Recorded sales today": "Ventes enregistrées aujourd'hui",
  "Expiring in 7 days": "Périment dans 7 jours",
  "Open restock alerts": "Alertes de réapprovisionnement ouvertes",
  "needs action": "action requise",
  products: "produits",
  "Sales – last 7 days": "Ventes – 7 derniers jours",
  "Daily total of recorded sales (CAD).": "Total quotidien des ventes enregistrées (CAD).",
  "Daily total of recorded sales for the last 7 days": "Total quotidien des ventes enregistrées des 7 derniers jours",
  "Needs attention": "À surveiller",
  "Nothing needs attention.": "Rien à surveiller.",
  "View all alerts": "Voir toutes les alertes",
  "Some data is unavailable": "Certaines données ne sont pas disponibles",
  "Dashboard not refreshed": "Tableau de bord non actualisé",
  "Dashboard data unavailable": "Données du tableau de bord non disponibles",
  "Choose a report type, then generate it.": "Choisissez un type de rapport, puis générez-le.",
  "Available reports": "Rapports disponibles",
  "Inventory Report": "Rapport d'inventaire",
  "Sales Report": "Rapport des ventes",
  "Expiry & Restock Report": "Rapport de péremption et de réapprovisionnement",
  Report: "Rapport",
  "Current quantity of every product and which products are low on stock":
    "Quantité actuelle de chaque produit et produits en stock faible",
  "Sales totals by day, product and category": "Totaux des ventes par jour, produit et catégorie",
  "Products expiring soon and products that need restocking":
    "Produits bientôt périmés et produits à réapprovisionner",
  "Period start": "Début de la période",
  "Period end": "Fin de la période",
  "Back to Dashboard": "Retour au tableau de bord",
  "Generate Report": "Générer le rapport",
  "Report not generated": "Rapport non généré",
  "Apply Filter": "Appliquer le filtre",
  "Clear filter": "Effacer le filtre",
  "Filter not applied – still showing the unfiltered report":
    "Filtre non appliqué – le rapport non filtré est toujours affiché",
  "1 filter error – filter not applied": "1 erreur de filtre – filtre non appliqué",
  "No data available for this report": "Aucune donnée disponible pour ce rapport",
  "No data – export unavailable": "Aucune donnée – exportation non disponible",
  "Back to Reports": "Retour aux rapports",
  "current stock levels": "niveaux de stock actuels",
  "Choose a format, then Export": "Choisissez un format, puis Exporter",
  "Format *": "Format *",
  "Best for printing and sharing": "Idéal pour imprimer et partager",
  "Opens in Excel or Google Sheets": "S'ouvre dans Excel ou Google Sheets",
  "File name": "Nom du fichier",
  "There is no report data to filter. Go back to Reports and choose another report or period.":
    "Aucune donnée à filtrer. Retournez aux rapports et choisissez un autre rapport ou une autre période.",
  "No inventory data to show": "Aucune donnée d'inventaire à afficher",
  "No report data to show": "Aucune donnée de rapport à afficher",

  // Feature 3 — Supplier and customer profiles
  "Find, create and update profiles, record deliveries and review supplier performance.":
    "Trouvez, créez et mettez à jour des profils, enregistrez des livraisons et suivez le rendement des fournisseurs.",
  "Find a supplier by name.": "Trouver un fournisseur par son nom.",
  "Find a customer by phone number.": "Trouver un client par son numéro de téléphone.",
  "Find profile": "Trouver le profil",
  "Create this profile": "Créer ce profil",
  "Supplier name": "Nom du fournisseur",
  "Customer name": "Nom du client",
  "Contact information": "Coordonnées",
  "Lead time": "Délai",
  "Lead time (days)": "Délai (jours)",
  "Payment terms": "Conditions de paiement",
  Terms: "Conditions",
  Profile: "Profil",
  "Profile saved.": "Profil enregistré.",
  "Save profile": "Enregistrer le profil",
  "No suppliers yet.": "Aucun fournisseur pour le moment.",
  "No customers yet.": "Aucun client pour le moment.",
  "No purchases yet.": "Aucun achat pour le moment.",
  "Performance report": "Rapport de rendement",
  "Avg lead time": "Délai moyen",
  "Avg fill rate": "Taux de livraison moyen",
  "On-time rate": "Taux de ponctualité",
  Deliveries: "Livraisons",
  "Delivery date": "Date de livraison",
  "Expected date (PO)": "Date prévue (BC)",
  "Quantity ordered": "Quantité commandée",
  "Quantity received": "Quantité reçue",
  "Received by": "Reçu par",
  Condition: "État",
  Delay: "Retard",
  Fill: "Taux",
  "Ord / rec": "Cmd / reçu",
  Discrepancy: "Écart",
  Unplanned: "Imprévue",
  "Unplanned delivery (no purchase order)": "Livraison imprévue (sans bon de commande)",
  "Planned only": "Prévues seulement",
  "+ Record delivery": "+ Enregistrer une livraison",
  "Save delivery": "Enregistrer la livraison",
  "No deliveries recorded for this supplier.": "Aucune livraison enregistrée pour ce fournisseur.",
  "Owner notifications": "Avis au propriétaire",
  "Supplier delivery notifications": "Avis de livraison des fournisseurs",
  "Delivery discrepancies (6a) and unplanned deliveries (6b) waiting for the store owner.":
    "Écarts de livraison (6a) et livraisons imprévues (6b) en attente du propriétaire.",
  "Discrepancies and unplanned deliveries (Feature 3).": "Écarts et livraisons imprévues (fonction 3).",
  "Mark as read": "Marquer comme lu",
  "Notification marked as read.": "Avis marqué comme lu.",
  "No unread notifications.": "Aucun avis non lu.",
  "e.g. Net 30": "ex. Net 30",
  "email · phone": "courriel · téléphone",
  "phone number": "numéro de téléphone",

  // Feature 4 — Accounting
  "+ Record Transaction": "+ Enregistrer une transaction",
  "Record Transaction": "Enregistrer une transaction",
  "Record Another": "En enregistrer une autre",
  "Save Transaction": "Enregistrer la transaction",
  "Revenue (MTD)": "Revenus (mois en cours)",
  "Expenses (MTD)": "Dépenses (mois en cours)",
  "Net profit / loss": "Profit / perte net",
  "Ledger balance": "Solde du grand livre",
  "Recent transactions": "Transactions récentes",
  "View transaction history": "Voir l'historique des transactions",
  "View Transaction History": "Voir l'historique des transactions",
  "Transaction History": "Historique des transactions",
  "Ledger – all transactions, newest first": "Grand livre – toutes les transactions, les plus récentes d'abord",
  "Ledger preview": "Aperçu du grand livre",
  "Current balance": "Solde actuel",
  "This transaction": "Cette transaction",
  "Balance after saving": "Solde après l'enregistrement",
  "Transaction details": "Détails de la transaction",
  "Transaction type *": "Type de transaction *",
  "Money coming in, e.g. daily sales": "Argent qui entre, ex. ventes quotidiennes",
  "Money going out": "Argent qui sort",
  "Source / paid to (optional)": "Source / payé à (facultatif)",
  "Enter a revenue or expense. Fields marked * are required.":
    "Entrez un revenu ou une dépense. Les champs marqués * sont obligatoires.",
  "Nothing is posted to the ledger until you select Save Transaction.":
    "Rien n'est inscrit au grand livre avant que vous choisissiez Enregistrer la transaction.",
  "Totals update as soon as the transaction is saved.": "Les totaux sont mis à jour dès l'enregistrement.",
  "Transaction not saved": "Transaction non enregistrée",
  "Transaction saved": "Transaction enregistrée",
  "Saved · ledger updated": "Enregistré · grand livre mis à jour",
  "New transaction – not saved yet": "Nouvelle transaction – pas encore enregistrée",
  "Back to Accounting Dashboard": "Retour au tableau de bord comptable",
  "Accounting is unavailable": "La comptabilité n'est pas disponible",
  "Accounting unavailable": "Comptabilité non disponible",
  "All periods": "Toutes les périodes",
  "All types": "Tous les types",
  "Search transactions": "Rechercher des transactions",
  "Search description or transaction ID": "Rechercher une description ou un ID de transaction",
  "No transactions match.": "Aucune transaction ne correspond.",
  "No transactions yet": "Aucune transaction pour le moment",
  " · new transaction highlighted": " · nouvelle transaction en surbrillance",
  "e.g. Friday register total": "ex. Total de caisse du vendredi",
  "e.g. Register": "ex. Caisse",
  Source: "Source",

  // Feature 5 — Employee schedule
  "Review an employee's shifts, edit or cancel a shift, build and publish schedules.":
    "Consultez les quarts d'un employé, modifiez ou annulez un quart, créez et publiez des horaires.",
  Schedules: "Horaires",
  "+ New": "+ Nouveau",
  "Employee view": "Vue employé",
  "What an employee sees (published shifts only).": "Ce que voit un employé (quarts publiés seulement).",
  Scheduling: "Horaires",
  "Select an employee to see their shifts, or a schedule to assign and publish shifts.":
    "Choisissez un employé pour voir ses quarts, ou un horaire pour attribuer et publier des quarts.",
  "Start time": "Heure de début",
  "End time": "Heure de fin",
  "Role for this shift": "Rôle pour ce quart",
  "e.g. Cashier": "ex. Caissier",
  "Cancel shift": "Annuler le quart",
  "Save shift": "Enregistrer le quart",
  "No shifts assigned yet.": "Aucun quart attribué pour le moment.",
  "No shifts in this schedule yet.": "Aucun quart dans cet horaire pour le moment.",
  "No published shifts yet.": "Aucun quart publié pour le moment.",
  "Only published shifts are visible to employees.": "Seuls les quarts publiés sont visibles par les employés.",
  "Publish schedule": "Publier l'horaire",
  "Assign a shift": "Attribuer un quart",
  "Assign shift": "Attribuer le quart",
  "New schedule": "Nouvel horaire",
  "Start date": "Date de début",
  "End date": "Date de fin",
  "Create schedule": "Créer l'horaire",
  optional: "facultatif",

  // Feature 6 — Customer support
  "Look up a customer, then handle questions, complaints and returns.":
    "Trouvez un client, puis traitez ses questions, plaintes et retours.",
  "Look up a customer by ID or phone number": "Trouvez un client par ID ou numéro de téléphone",
  "Customer ID (CUST-002) or phone, digits only (5145550311)":
    "ID client (CUST-002) ou téléphone, chiffres seulement (5145550311)",
  "Customer ID or phone number": "ID client ou numéro de téléphone",
  "Look up customer": "Trouver le client",
  "Purchase history": "Historique d'achats",
  "No purchases on record.": "Aucun achat au dossier.",
  "Complaint cases": "Dossiers de plainte",
  "No complaint cases.": "Aucun dossier de plainte.",
  "Escalate to owner": "Transmettre au propriétaire",
  "Support requests": "Demandes d'assistance",
  "No support requests.": "Aucune demande d'assistance.",
  "Add note": "Ajouter une note",
  "No returns.": "Aucun retour.",
  "Assist customer": "Aider le client",
  "Choose what the customer needs. To process a return, use Return on a purchased item.":
    "Choisissez ce dont le client a besoin. Pour un retour, utilisez Retour sur un article acheté.",
  "Open a complaint case": "Ouvrir un dossier de plainte",
  "Open a support request": "Ouvrir une demande d'assistance",
  "New complaint case": "Nouveau dossier de plainte",
  "New support request": "Nouvelle demande d'assistance",
  "Open case": "Ouvrir le dossier",
  "Open request": "Ouvrir la demande",
  Subject: "Objet",
  "Process a return": "Traiter un retour",
  Bought: "Acheté",
  "Already returned": "Déjà retourné",
  "Quantity to return": "Quantité à retourner",
  "Check eligibility & refund": "Vérifier l'admissibilité et rembourser",
  "Save note": "Enregistrer la note",
  "Return not approved.": "Retour non approuvé.",
  "No customer record found": "Aucun dossier client trouvé",
  "Note for the owner": "Note pour le propriétaire",
  "Flag missing record": "Signaler un dossier manquant",
  "e.g. Customer says they signed up last month; no account found.":
    "ex. Le client dit s'être inscrit le mois dernier; aucun compte trouvé.",
  "Owner inbox": "Boîte de réception du propriétaire",
  "Escalated complaints, missing records, delivery notices and restock alerts waiting for the store owner.":
    "Plaintes transmises, dossiers manquants, avis de livraison et alertes de réapprovisionnement en attente du propriétaire.",
  "Escalated complaints": "Plaintes transmises",
  "Missing records": "Dossiers manquants",
  "Delivery notices": "Avis de livraison",
  "Total waiting": "Total en attente",
  Resolve: "Résoudre",
  "No escalated cases waiting for review.": "Aucun dossier transmis en attente.",
  "No missing-record flags.": "Aucun dossier manquant signalé.",
  "No delivery notices.": "Aucun avis de livraison.",
  "Signed in as the store owner": "Connecté en tant que propriétaire",
  "Customer look-ups, complaints, requests and returns are done by an employee. Switch \"Signed in as\" (top bar) to an employee to assist a customer.":
    "Les recherches de clients, plaintes, demandes et retours sont faits par un employé. Choisissez un employé dans « Connecté en tant que » (en haut) pour aider un client.",
  "The owner inbox is for the store owner. Switch \"Signed in as\" (top bar) to the store owner to see it.":
    "La boîte de réception est réservée au propriétaire. Choisissez le propriétaire dans « Connecté en tant que » (en haut) pour la voir.",
};

// ----- Text with numbers or names in it -----
const PATTERNS = [
  [/^Wireframe (.+)$/, "Maquette $1"],
  [/^Store overview for (.+), (.+)$/, "Aperçu du magasin pour le $1 $2"],
  [/^(\d+) low stock$/, "$1 en stock faible"],
  [/^(\d+) products · (\d+) low stock · (\d+) out of stock$/, "$1 produits · $2 en stock faible · $3 en rupture"],
  [/^(\d+) pending restock alerts?$/, "$1 alerte(s) de réapprovisionnement en attente"],
  [/^Data refreshed (.+)$/, "Données actualisées à $1"],
  [/^(.+) selected$/, (m, a) => `${tr(a)} choisi`],
  [/^Report generated · (\d+) (products|rows)$/, (m, n, w) => `Rapport généré · ${n} ${w === "products" ? "produits" : "lignes"}`],
  [/^Filter applied · (\d+) products$/, "Filtre appliqué · $1 produits"],
  [/^Showing (\d+) of (\d+) (products|rows)$/, (m, a, b, w) => `${a} sur ${b} ${w === "products" ? "produits" : "lignes"} affichés`],
  [/^Generated (.+) · current stock levels$/, "Généré le $1 · niveaux de stock actuels"],
  [/^Generated (.+) · (.+) to (.+)$/, "Généré le $1 · du $2 au $3"],
  [/^Generated (.+)$/, "Généré le $1"],
  [/^Exported as (PDF|CSV)$/, "Exporté en $1"],
  [/^Exported (.+)$/, "Exporté : $1"],
  [/^Export (.+)$/, (m, a) => `Exporter : ${tr(a)}`],
  [/^(.+) · as of (.+)$/, "$1 · au $2"],
  [/^(\d+) rows$/, "$1 lignes"],
  [/^(\d+) employees · (\d+) schedules$/, "$1 employés · $2 horaires"],
  [/^(\d+) shift\(s\), (\d+) draft$/, "$1 quart(s), $2 brouillon(s)"],
  [/^Edit shift (.+)$/, "Modifier le quart $1"],
  [/^Schedule (\S+)$/, "Horaire $1"],
  [/^(.+) to (\d\d\/\d\d\/\d{4})$/, "$1 au $2"],
  [/^My schedule — (.*)$/, "Mon horaire — $1"],
  [/^Edit Inventory – (.+)$/, "Modifier l'inventaire – $1"],
  [/^SKU (\S+) · (.+)$/, (m, a, b) => `UGS ${a} · ${tr(b)}`],
  [/^(\d+) left · reorder level (\d+)$/, "$1 en stock · seuil $2"],
  [/^Expires (.+)$/, "Expire le $1"],
  [/^(\d+) errors? – nothing saved$/, "$1 erreur(s) – rien n'a été enregistré"],
  [/^Saved · inventory record updated( · restock alert created)?$/, (m, a) => `Enregistré · fiche d'inventaire mise à jour${a ? " · alerte de réapprovisionnement créée" : ""}`],
  [/^Expiry date must be after today \((.+)\)\.$/, "La date de péremption doit être après aujourd'hui ($1)."],
  [/^Financial summary – (.+) \(month to date\)$/, "Sommaire financier – $1 (mois en cours)"],
  [/^(.+) yesterday$/, "$1 hier"],
  [/^as of (.+)$/, "au $1"],
  [/^Ledger up to date · last entry (.+)$/, "Grand livre à jour · dernière entrée le $1"],
  [/^(\S+) recorded (\d\d\/\d\d\/\d{4})$/, "$1 enregistrée le $2"],
  [/^(Revenue|Expense) categories: (.+)$/, (m, t, list) => `Catégories de ${t === "Revenue" ? "revenus" : "dépenses"} : ${list.split(", ").map(tr).join(", ")}`],
  [/^(\d+) deliveries$/, "$1 livraisons"],
  [/^Agreed (.+)$/, (m, a) => `Convenu : ${tr(a)}`],
  [/^(\d+) days?$/, "$1 jour(s)"],
  [/^(\d+) d$/, "$1 j"],
  [/^(\d+) unread notifications?$/, "$1 avis non lu(s)"],
  [/^Assisting (.+) \((.+)\)$/, "Aide à $1 ($2)"],
  [/^\((\d+) returned\)$/, "($1 retourné(s))"],
  [/^Add a note to (.+)$/, "Ajouter une note à $1"],
  [/^(.+) You can flag the missing record for the store owner\.$/, "$1 Vous pouvez signaler le dossier manquant au propriétaire."],
  [/^(\d+) waiting$/, "$1 en attente"],
  [/^customer since (.+)$/, "client depuis le $1"],
  [/^(\S+) · customer since (.+)$/, "$1 · client depuis le $2"],
  [/^Showing (\d+) of (\d+) products · click a row or Edit to open a product$/, "$1 sur $2 produits affichés · cliquez sur une ligne ou sur Modifier pour ouvrir un produit"],
  [/^Showing (\d+) of (\d+) transactions in (.+?)( · new transaction highlighted)?$/, (m, a, b, month, hl) => `${a} sur ${b} transactions affichées en ${month}${hl ? " · nouvelle transaction en surbrillance" : ""}`],
  [/^Showing (\d+) of (\d+) transactions( · new transaction highlighted)?$/, (m, a, b, hl) => `${a} sur ${b} transactions affichées${hl ? " · nouvelle transaction en surbrillance" : ""}`],
  [/^(\d+) products · ([\d\s,.\u202f\u00a0]+) units in stock · (\d+) low stock · (\d+) out of stock \(low-stock products listed first\)$/, "$1 produits · $2 unités en stock · $3 en stock faible · $4 en rupture (produits en stock faible en premier)"],
  [/^Current: (\d+) units on hand · expires (.+) · reorder level (\d+)$/, "Actuel : $1 unités en stock · expire le $2 · seuil $3"],
  [/^\+ New (supplier|customer)$/, (m, w) => (w === "supplier" ? "+ Nouveau fournisseur" : "+ Nouveau client")],
  [/^New (supplier|customer) profile$/, (m, w) => (w === "supplier" ? "Nouveau profil fournisseur" : "Nouveau profil client")],
  [/^Select a profile in the list, find one by (name|phone number), or create a new one\.$/, (m, w) => `Choisissez un profil dans la liste, trouvez-en un par ${w === "name" ? "nom" : "numéro de téléphone"} ou créez-en un.`],
  [/^([\d.]+) days?$/, (m, n) => `${n.replace(".", ",")} jour(s)`],
  [/^(\d+) (suppliers|customers)$/, (m, n, w) => `${n} ${w === "suppliers" ? "fournisseurs" : "clients"}`],
  [/^(.+) to (.+) · (\d+) shift\(s\), (\d+) draft$/, "du $1 au $2 · $3 quart(s), $4 brouillon(s)"],
  [/^(.+) Nothing was changed\.$/, "$1 Rien n'a été modifié."],
  [/^Fix the (\d+) highlighted fields?, then select Save Changes again\. Nothing was changed\.$/, "Corrigez le(s) $1 champ(s) en surbrillance, puis choisissez Enregistrer les modifications de nouveau. Rien n'a été modifié."],
  [/^Quantity updated (\d+) → (\d+) units$/, "Quantité modifiée de $1 à $2 unités"],
  [/^Reorder level (\d+) → (\d+)$/, "Seuil modifié de $1 à $2"],
  [/^Expiry updated (.+) → (.+)$/, "Péremption modifiée du $1 au $2"],
  [/^Quantity \((\d+)\) is at or below the reorder level \((\d+)\)\. (.+) was added to the restock list\.$/, "La quantité ($1) est au seuil de réapprovisionnement ($2) ou en dessous. $3 a été ajouté à la liste de réapprovisionnement."],
  [/^Product '(.+)' does not exist\. Choose a product from the list\.$/, "Le produit « $1 » n'existe pas. Choisissez un produit dans la liste."],
  [/^Filtered: (.+)$/, (m, rest) => `Filtré : ${rest.replace(/\bProduct = /, "Produit = ").replace(/\bCategory = /, "Catégorie = ").replace(/\bStatus = In stock/, "Statut = En stock").replace(/\bStatus = Low stock/, "Statut = Stock faible").replace(/\bStatus = Out of stock/, "Statut = Rupture de stock").replace(/\bDates = (\S+) to (\S+)/, "Dates = du $1 au $2").replace(/(\d+) of (\d+) products/, "$1 sur $2 produits").replace(/(\d+) of (\d+) rows/, "$1 sur $2 lignes").replace(/(\d+) low stock/, "$1 en stock faible").replace(/(\d+) out of stock/, "$1 en rupture")}`],
  [/^(Revenue|Expense) of (.+) · (.+) · (.+) was recorded as (\S+) and posted to the ledger\.$/, (m, t, amount, category, date, id) => `${t === "Revenue" ? "Revenu" : "Dépense"} de ${amount} · ${tr(category)} · ${date} enregistré sous ${id} et inscrit au grand livre.`],
];

function tr(text) {
  // A required field's label ends with " *": translate the label, keep the star.
  if (text.endsWith(" *") && !Object.prototype.hasOwnProperty.call(FR, text)) return `${tr(text.slice(0, -2))} *`;
  if (Object.prototype.hasOwnProperty.call(FR, text)) return FR[text];
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

// Translate a string for the current language (used by code that builds text itself).
export function t(text) {
  return currentLang() === "fr" ? tr(text) : text;
}

const ATTRIBUTES = ["placeholder", "aria-label", "title"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

function translateTextNode(node) {
  const raw = node.nodeValue;
  const trimmed = raw.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return;
  const translated = tr(trimmed);
  if (translated !== trimmed) {
    node.nodeValue = raw.replace(trimmed, translated);
  }
}

function translateElement(element) {
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute?.(name);
    if (value && /[A-Za-z]/.test(value)) {
      const translated = tr(value.trim());
      if (translated !== value.trim()) element.setAttribute(name, translated);
    }
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest("[data-no-i18n]") && !SKIP.has(root.parentElement?.tagName)) translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest("[data-no-i18n]") || SKIP.has(root.tagName)) return;
  translateElement(root);
  root.querySelectorAll("*").forEach((element) => {
    if (!element.closest("[data-no-i18n]")) translateElement(element);
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      SKIP.has(node.parentElement?.tagName) || node.parentElement?.closest("[data-no-i18n]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) translateTextNode(node);
}

// Start translating the page (and everything added to it later) when French is chosen.
export function startTranslation() {
  document.documentElement.lang = currentLang() === "fr" ? "fr-CA" : "en-CA";
  if (currentLang() !== "fr") return;
  document.title = tr(document.title);
  translateTree(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateTree(mutation.target);
      else if (mutation.type === "attributes") translateElement(mutation.target);
      else mutation.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
}
