// Navigation (Milestone 6: the left navigation stays visible and the current section is
// highlighted). Routes look like #/inventory/PROD-002/edit: the first part picks the page,
// the rest is passed to it.

import { $, $$, api, toast, signedInAs, setSignedInAs, OWNER_ID } from "./ui.js";
import { currentLang, setLang, startTranslation, t } from "./i18n.js";
import dashboard from "./pages/dashboard.js";
import inventory from "./pages/inventory.js";
import profiles from "./pages/profiles.js";
import accounting from "./pages/accounting.js";
import schedule from "./pages/schedule.js";
import support from "./pages/support.js";

const PAGES = { dashboard, inventory, profiles, accounting, schedule, support };

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const name = (parts[0] || "dashboard").toLowerCase();
  return { name: PAGES[name] ? name : "dashboard", rest: parts.slice(1) };
}

function highlightNav({ name, rest }) {
  const inReports = name === "dashboard" && rest[0] === "reports";
  $$(".sidenav a").forEach((link) => {
    const section = link.dataset.section;
    link.classList.remove("active", "open");
    link.removeAttribute("aria-current");
    if (section === "reports") {
      link.classList.toggle("hidden", name !== "dashboard");
      if (inReports) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    } else if (section === name) {
      if (name === "dashboard" && inReports) link.classList.add("open");
      else {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    }
  });
}

// Bell: pending restock alerts + unread owner notifications.
async function refreshBell() {
  const [alerts, notes] = await Promise.all([api("GET", "/inventory/alerts"), api("GET", "/profiles/notifications")]);
  const count = (alerts.alerts || []).length + (notes.notifications || []).length;
  const badge = $("#bell-count");
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

async function show() {
  const route = currentRoute();
  highlightNav(route);
  const main = $("#main");
  main.innerHTML = '<p class="loading">Loading…</p>';
  await PAGES[route.name](main, route.rest);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  refreshBell();
}

// Back-office search: looks for the text in products (Products & Inventory).
$("#top-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const q = event.target.elements.q.value.trim();
  location.hash = `#/inventory/search/${encodeURIComponent(q)}`;
});

// ----- Errors nothing else caught: show them with the file and line -----
// "(Error in src/web/public/pages/support.js, line 120)"
function whereFrom(url, line) {
  const match = String(url || "").match(/\/((?:pages\/)?[\w.-]+\.js)(?:\?.*)?$/);
  return match && line ? ` (Error in src/web/public/${match[1]}, line ${line})` : "";
}
function frameOf(stack) {
  const match = String(stack || "").match(/(https?:\/\/[^\s)]+\.js):(\d+):\d+/);
  return match ? whereFrom(match[1], match[2]) : "";
}
window.addEventListener("error", (event) => {
  if (!event.message) return;
  toast(`${t("Unexpected error")}: ${event.message}${whereFrom(event.filename, event.lineno)}`, "error");
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  toast(`${t("Unexpected error")}: ${reason.message || reason}${frameOf(reason.stack)}`, "error");
});

// ----- Language (EN | FR) -----
$$("[data-lang]").forEach((button) => {
  button.setAttribute("aria-pressed", String(button.dataset.lang === currentLang()));
  button.addEventListener("click", () => {
    if (button.dataset.lang === currentLang()) return;
    setLang(button.dataset.lang);
    location.reload();
  });
});

// ----- "Signed in as" (demo role switch, kept per browser tab) -----
async function setUpSignedIn() {
  const select = $("#signed-in-as");
  select.setAttribute("aria-label", t("Signed in as"));
  const result = await api("GET", "/support/employees");
  const owner = t("Store Owner");
  const employee = t("Employee");
  select.innerHTML = [
    `<option value="${OWNER_ID}">Bassem — ${owner}</option>`,
    ...(result.employees || []).map((e) => `<option value="${e.employeeId}">${e.employeeName} — ${employee}</option>`),
  ].join("");
  if (![...select.options].some((o) => o.value === signedInAs())) setSignedInAs(OWNER_ID);
  select.value = signedInAs();
  const updateAvatar = () => ($("#user-avatar").textContent = select.selectedOptions[0]?.textContent.trim()[0] || "?");
  updateAvatar();
  select.addEventListener("change", () => {
    setSignedInAs(select.value);
    updateAvatar();
    show(); // redraw the current screen for the new person
  });
}

startTranslation();
window.addEventListener("hashchange", show);
setUpSignedIn().finally(show);
