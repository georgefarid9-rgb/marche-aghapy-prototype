// Navigation (Milestone 6: the left navigation stays visible and the current section is
// highlighted). Routes look like #/inventory/PROD-002/edit: the first part picks the page,
// the rest is passed to it.

import { $, $$, api } from "./ui.js";
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

window.addEventListener("hashchange", show);
show();
