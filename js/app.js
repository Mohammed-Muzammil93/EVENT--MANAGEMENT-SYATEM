/**
 * ==========================================================================
 * MAIN APPLICATION CONTROLLER & CORE DASHBOARD
 * ==========================================================================
 */

const DashboardModule = {
  async refresh() {
    const selectedEventId = document.getElementById("dashboard-event-filter") ? document.getElementById("dashboard-event-filter").value : "";
    const events = await ApiService.getEvents();
    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const atts = ApiService.getLocal(STORAGE_KEYS.ATTENDANCE, []);

    let filteredRegs = regs;
    let filteredAtts = atts;

    if (selectedEventId) {
      filteredRegs = regs.filter(r => r.eventId === selectedEventId);
      filteredAtts = atts.filter(a => a.eventId === selectedEventId);
    }

    const totalEvents = events.length;
    const totalRegs = filteredRegs.length;
    const presentCount = filteredAtts.filter(a => a.status === "VALID").length;
    const absentCount = Math.max(0, totalRegs - presentCount);
    const attPct = totalRegs > 0 ? ((presentCount / totalRegs) * 100).toFixed(1) : "0.0";

    // Update Counter Elements
    this.updateCounter("stat-total-events", totalEvents);
    this.updateCounter("stat-total-regs", totalRegs);
    this.updateCounter("stat-today-att", presentCount);
    this.updateCounter("stat-present", presentCount);
    this.updateCounter("stat-absent", absentCount);
    this.updateCounter("stat-att-pct", `${attPct}%`);

    // Update Charts
    AnalyticsModule.initCharts();
  },

  updateCounter(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = value;
  }
};

const App = {
  async init() {
    this.applyTheme(ApiService.getSettings().theme || "dark");
    this.bindEvents();
    this.seedInitialData();

    // Parse backend URL from query parameter if present (to auto-configure guest/student devices)
    const params = new URLSearchParams(window.location.search);
    const backendUrl = params.get("backend") || params.get("backendUrl");
    if (backendUrl) {
      const currentSettings = ApiService.getSettings();
      if (currentSettings.webAppUrl !== backendUrl) {
        currentSettings.webAppUrl = backendUrl;
        ApiService.saveSettings(currentSettings);
        console.log("Auto-configured backend Web App URL from link parameter:", backendUrl);
      }
    }

    // Clean up old demo events from local storage cache
    const localEvents = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const demoIds = ["EVT-TECHFEST-2026", "EVT-HACKATHON-26", "EVT-CULTURAL-26"];
    if (Array.isArray(localEvents)) {
      const cleaned = localEvents.filter(e => !demoIds.includes(e.id));
      if (cleaned.length !== localEvents.length) {
        ApiService.saveLocal(STORAGE_KEYS.EVENTS, cleaned);
      }
    }

    // Init submodules
    RegistrationModule.init();
    QrScannerModule.init();

    // Default View
    this.switchView("student-portal");
    this.updateAuthUI();

    // Load events from backend/storage before rendering forms
    App.showLoader(true);
    let events = [];
    try {
      events = await ApiService.getEvents();
    } catch (err) {
      console.warn("Failed loading events on startup:", err);
    }
    App.showLoader(false);

    // Populate all dropdowns
    EventManagerModule.populateEventDropdowns(events);

    // Process direct URL event parameter
    await this.handleUrlQueryParams(events);
  },

  async handleUrlQueryParams(eventsList) {
    const searchString = window.location.search || "";
    const params = new URLSearchParams(searchString);
    const eventParamVal = params.get("event");
    const eventIdParamVal = params.get("eventId");
    const targetEventId = (eventParamVal || eventIdParamVal || "").trim();
    const backendUrl = (params.get("backend") || params.get("backendUrl") || "").trim();

    const currentApiUrl = ApiService.getApiUrl();

    console.log("[EventLookup Trace] ==========================================");
    console.log("[EventLookup Trace] window.location.search:", searchString);
    console.log("[EventLookup Trace] Raw 'event' parameter:", eventParamVal);
    console.log("[EventLookup Trace] Raw 'eventId' parameter:", eventIdParamVal);
    console.log("[EventLookup Trace] Parsed Target Event ID:", targetEventId || "(NONE)");
    console.log("[EventLookup Trace] Extracted Backend URL param:", backendUrl || "(NONE)");
    console.log("[EventLookup Trace] Active API URL before config:", currentApiUrl || "(UNCONFIGURED)");

    // Auto-configure API URL if passed in link parameter
    if (backendUrl) {
      const currentSettings = ApiService.getSettings();
      if (currentSettings.webAppUrl !== backendUrl) {
        currentSettings.webAppUrl = backendUrl;
        ApiService.saveSettings(currentSettings);
        console.log("[EventLookup Trace] Auto-configured backend Web App URL:", backendUrl);
      }
    }

    const select = document.getElementById("reg-event-select");
    if (!select) return;

    // Requirement 5: If no event parameter exists, show Select Target Event dropdown with all events
    if (!targetEventId) {
      console.log("[EventLookup Trace] No event parameter in URL. Fallback to full dropdown selection.");
      let allEvents = eventsList || [];
      if (!allEvents.length) {
        try {
          allEvents = await ApiService.getEvents();
        } catch (_) {}
      }
      EventManagerModule.populateEventDropdowns(allEvents);
      select.disabled = false;
      select.classList.remove("bg-glass-disabled");
      return;
    }

    // Target event ID exists in URL: proceed with lookup
    console.log("[EventLookup Trace] Attempting lookup for Event ID:", targetEventId);
    let events = eventsList || [];
    let targetEv = events.find(e => e.id.toUpperCase() === targetEventId.toUpperCase());

    // 1. Try direct single-event query from backend database if API URL exists
    const apiUrl = ApiService.getApiUrl();
    console.log("[EventLookup Trace] API URL to call:", apiUrl || "(NONE)");

    if (apiUrl) {
      try {
        const fetchUrl = `${apiUrl}?action=getEvent&eventId=${encodeURIComponent(targetEventId)}`;
        console.log("[EventLookup Trace] Fetching API URL:", fetchUrl);
        const resp = await fetch(fetchUrl);
        console.log("[EventLookup Trace] HTTP Status Code:", resp.status, resp.statusText);
        const text = await resp.text();
        console.log("[EventLookup Trace] Raw API Response Body:", text);
        try {
          const json = JSON.parse(text);
          if (json && json.status === "success" && json.event) {
            targetEv = json.event;
            console.log("[EventLookup Trace] SUCCESS: API returned event:", targetEv.title);
          } else if (json && Array.isArray(json)) {
            const found = json.find(e => e.id.toUpperCase() === targetEventId.toUpperCase());
            if (found) targetEv = found;
          }
        } catch (jsonErr) {
          console.error("[EventLookup Trace] Response body is not valid JSON:", jsonErr);
        }
      } catch (fetchErr) {
        console.error("[EventLookup Trace] Direct API fetch failed:", fetchErr);
      }
    } else {
      console.warn("[EventLookup Trace] API URL is not configured.");
    }

    // 2. Fallback: If not found via direct getEvent, try full getEvents list
    if (!targetEv && apiUrl) {
      console.log("[EventLookup Trace] Fallback: fetching full events list from backend...");
      try {
        const freshEvents = await ApiService.getEvents();
        targetEv = freshEvents.find(e => e.id.toUpperCase() === targetEventId.toUpperCase());
        if (targetEv) {
          events = freshEvents;
          EventManagerModule.populateEventDropdowns(events);
        }
      } catch (err) {
        console.error("[EventLookup Trace] Full events list fetch failed:", err);
      }
    }

    // 3. Render Result
    if (targetEv) {
      // Ensure targetEv is present in select dropdown
      let existsInDropdown = Array.from(select.options).some(opt => opt.value === targetEv.id);
      if (!existsInDropdown) {
        const opt = document.createElement("option");
        opt.value = targetEv.id;
        opt.text = `${targetEv.title} (${targetEv.date})`;
        select.appendChild(opt);
      }

      select.value = targetEv.id;
      select.disabled = true;
      select.classList.add("bg-glass-disabled");

      this.showToast("Direct Event Link Detected", `Auto-selected: ${targetEv.title}`, "info");

      // Hidden input for form state safety
      let hiddenInput = document.getElementById("reg-event-select-hidden");
      if (!hiddenInput) {
        hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.id = "reg-event-select-hidden";
        hiddenInput.value = targetEv.id;
        select.parentNode.appendChild(hiddenInput);
      } else {
        hiddenInput.value = targetEv.id;
      }
      console.log("[EventLookup Trace] FINAL RESULT: Auto-selected event in dropdown:", targetEv.title);
    } else {
      // Event ID was present in URL but API/storage lookups could not find it
      select.innerHTML = `<option value="">⚠️ Event Not Found (ID: ${targetEventId})</option>`;
      select.value = "";
      select.disabled = true;
      select.classList.add("bg-glass-disabled");

      this.showToast("Event Not Found", `The shared event (ID: ${targetEventId}) does not exist, was deleted, or database connection failed.`, "danger");
      console.error("[EventLookup Trace] FINAL RESULT: Event not found. ID:", targetEventId);
    }
  },

  seedInitialData() {
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, null);
    if (!events) {
      ApiService.saveLocal(STORAGE_KEYS.EVENTS, ApiService.getDefaultEvents());
    }

    const volunteers = ApiService.getLocal(STORAGE_KEYS.VOLUNTEERS, null);
    if (!volunteers) {
      ApiService.saveLocal(STORAGE_KEYS.VOLUNTEERS, AuthModule.getDefaultVolunteers());
    }
  },

  bindEvents() {
    // Theme Toggle
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        this.applyTheme(next);
      });
    }

    // Navigation Tabs
    document.querySelectorAll("[data-nav-target]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const target = btn.getAttribute("data-nav-target");
        this.switchView(target);
      });
    });

    // Login Form Submit
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const u = document.getElementById("login-username").value.trim();
        const p = document.getElementById("login-password").value.trim();
        const res = AuthModule.login(u, p);
        if (res.success) {
          this.showToast("Login Success", res.message, "success");
          const modalEl = document.getElementById("login-modal");
          if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
          }
          this.updateAuthUI();
          this.switchView("admin-dashboard");
        } else {
          this.showToast("Login Failed", res.message, "danger");
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        AuthModule.logout();
        this.updateAuthUI();
        this.switchView("student-portal");
        this.showToast("Logged Out", "You have been logged out safely.", "info");
      });
    }

    // Settings Form
    const settingsForm = document.getElementById("settings-form");
    if (settingsForm) {
      const currentSettings = ApiService.getSettings();
      const webAppInput = document.getElementById("settings-webapp-url");
      const siteUrlInput = document.getElementById("settings-site-url");

      if (webAppInput) webAppInput.value = currentSettings.webAppUrl || "";
      if (siteUrlInput) siteUrlInput.value = currentSettings.siteUrl || "";

      settingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const webAppUrl = webAppInput ? webAppInput.value.trim() : "";
        const siteUrl = siteUrlInput ? siteUrlInput.value.trim() : "";
        
        App.showLoader(true);
        ApiService.saveSettings({ webAppUrl, siteUrl, theme: document.documentElement.getAttribute("data-theme") });
        
        try {
          const events = await ApiService.getEvents();
          EventManagerModule.populateEventDropdowns(events);
          App.showToast("Settings Saved", "System settings & domain URL updated! Events synced from Google Sheets.", "success");
        } catch (err) {
          App.showToast("Sync Warning", "Settings saved, but failed to fetch events from Google Sheets Web App.", "warning");
        }
        App.showLoader(false);
      });
    }
  },

  switchView(viewId) {
    const user = AuthModule.getCurrentUser();

    // Role Guard
    if (viewId !== "student-portal" && !user) {
      this.showToast("Auth Required", "Please log in to access Admin/Scanner portals.", "warning");
      const modalEl = document.getElementById("login-modal");
      if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      }
      return;
    }

    // Volunteer Restrictions
    if (user && user.role === "volunteer") {
      if (viewId === "events-view" || viewId === "settings-view" || viewId === "volunteers-view") {
        this.showToast("Access Denied", "Volunteers only have permissions to scan QRs and view attendance.", "danger");
        return;
      }
    }

    // Toggle View Sections
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("d-none"));
    const targetSec = document.getElementById(viewId);
    if (targetSec) targetSec.classList.remove("d-none");

    // Update Nav Active State
    document.querySelectorAll("[data-nav-target]").forEach(btn => {
      if (btn.getAttribute("data-nav-target") === viewId) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    // View specific triggers
    if (viewId === "admin-dashboard") DashboardModule.refresh();
    if (viewId === "events-view") EventManagerModule.renderEventsList();
    if (viewId === "attendance-view") AttendanceModule.renderTable();
    if (viewId === "volunteers-view") this.renderVolunteersList();
    if (viewId === "analytics-view") AnalyticsModule.initCharts();
  },

  updateAuthUI() {
    const user = AuthModule.getCurrentUser();
    const loginNav = document.getElementById("nav-login-item");
    const userProfileNav = document.getElementById("nav-user-profile");
    const userNameLabel = document.getElementById("user-profile-name");
    const userRoleBadge = document.getElementById("user-profile-role");

    if (user) {
      if (loginNav) loginNav.classList.add("d-none");
      if (userProfileNav) userProfileNav.classList.remove("d-none");
      if (userNameLabel) userNameLabel.innerText = user.fullName;
      if (userRoleBadge) {
        userRoleBadge.innerText = user.role.toUpperCase();
        userRoleBadge.className = user.role === "admin" ? "badge bg-danger" : "badge bg-info text-dark";
      }

      // Hide restricted nav links for volunteer
      document.querySelectorAll(".admin-only-nav").forEach(el => {
        if (user.role === "volunteer") el.classList.add("d-none");
        else el.classList.remove("d-none");
      });
    } else {
      if (loginNav) loginNav.classList.remove("d-none");
      if (userProfileNav) userProfileNav.classList.add("d-none");
      document.querySelectorAll(".admin-only-nav").forEach(el => el.classList.remove("d-none"));
    }
  },

  renderVolunteersList() {
    const container = document.getElementById("volunteers-table-body");
    if (!container) return;

    const volunteers = AuthModule.getVolunteers();
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);

    if (volunteers.length === 0) {
      container.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No volunteers added yet.</td></tr>`;
      return;
    }

    container.innerHTML = volunteers.map((v, i) => {
      const assignedEv = events.find(e => e.id === v.assignedEventId);
      return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${v.fullName}</strong></td>
          <td><span class="badge bg-glass border text-light">${v.username}</span></td>
          <td>${assignedEv ? assignedEv.title : 'All Events'}</td>
          <td>${v.mobile || 'N/A'}</td>
          <td>
            <button class="btn btn-sm btn-outline-warning py-0 me-1" onclick="App.promptResetVolPassword('${v.id}')">Reset Pass</button>
            <button class="btn btn-sm btn-outline-danger py-0" onclick="App.removeVol('${v.id}')">Remove</button>
          </td>
        </tr>
      `;
    }).join("");
  },

  handleAddVolunteerSubmit(e) {
    e.preventDefault();
    const fullName = document.getElementById("vol-fullname").value.trim();
    const username = document.getElementById("vol-username").value.trim();
    const password = document.getElementById("vol-password").value.trim() || "vol123";
    const assignedEventId = document.getElementById("volunteer-event-assign").value;

    if (!fullName || !username) {
      this.showToast("Warning", "Full Name and Username are required!", "warning");
      return;
    }

    const res = AuthModule.addVolunteer({ fullName, username, password, assignedEventId });
    if (res.success) {
      this.showToast("Success", res.message, "success");
      document.getElementById("add-volunteer-form").reset();
      const modalEl = document.getElementById("add-volunteer-modal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      this.renderVolunteersList();
    } else {
      this.showToast("Error", res.message, "danger");
    }
  },

  removeVol(id) {
    if (confirm("Are you sure you want to remove this volunteer?")) {
      AuthModule.removeVolunteer(id);
      this.showToast("Removed", "Volunteer removed.", "info");
      this.renderVolunteersList();
    }
  },

  promptResetVolPassword(id) {
    const newPass = prompt("Enter new password for volunteer:", "vol123");
    if (newPass) {
      AuthModule.resetVolunteerPassword(id, newPass);
      this.showToast("Updated", "Password reset successfully!", "success");
    }
  },

  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const themeIcon = document.getElementById("theme-toggle-icon");
    if (themeIcon) {
      themeIcon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
    }
    const settings = ApiService.getSettings();
    settings.theme = theme;
    ApiService.saveSettings(settings);
  },

  showToast(title, message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toastId = "toast-" + Math.random().toString(36).substr(2, 6);
    const iconClass = type === "success" ? "bi-check-circle-fill text-success" : type === "warning" ? "bi-exclamation-triangle-fill text-warning" : type === "danger" ? "bi-x-circle-fill text-danger" : "bi-info-circle-fill text-info";

    const html = `
      <div id="${toastId}" class="toast custom-toast show fade" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header bg-transparent text-white border-0">
          <i class="bi ${iconClass} me-2 fs-5"></i>
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body text-sm pt-0">
          ${message}
        </div>
      </div>
    `;

    container.insertAdjacentHTML("beforeend", html);
    setTimeout(() => {
      const el = document.getElementById(toastId);
      if (el) el.remove();
    }, 4500);
  },

  showLoader(show) {
    const loader = document.getElementById("global-loader");
    if (loader) {
      if (show) loader.classList.remove("d-none");
      else loader.classList.add("d-none");
    }
  }
};

// Start application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
