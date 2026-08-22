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

    const bannerEl = document.getElementById("direct-event-banner");
    const errorEl = document.getElementById("direct-event-error");
    const selectContainer = document.getElementById("reg-event-select-container") || document.getElementById("reg-event-select")?.parentNode;
    const select = document.getElementById("reg-event-select");

    // Hide banners initially
    if (bannerEl) bannerEl.classList.add("d-none");
    if (errorEl) errorEl.classList.add("d-none");

    // Auto-configure API URL if passed in link parameter
    if (backendUrl) {
      const currentSettings = ApiService.getSettings();
      if (currentSettings.webAppUrl !== backendUrl) {
        currentSettings.webAppUrl = backendUrl;
        ApiService.saveSettings(currentSettings);
        console.log("[EventLookup Trace] Auto-configured backend Web App URL:", backendUrl);
      }
    }

    if (!select) return;

    // No event parameter in URL: show default dropdown selection
    if (!targetEventId) {
      console.log("[EventLookup Trace] No event parameter in URL. Fallback to full dropdown selection.");
      let allEvents = eventsList || [];
      if (!allEvents.length) {
        try {
          allEvents = await ApiService.getEvents();
        } catch (_) {}
      }
      EventManagerModule.populateEventDropdowns(allEvents);
      if (selectContainer) selectContainer.classList.remove("d-none");
      select.disabled = false;
      select.classList.remove("bg-glass-disabled");
      return;
    }

    // Target event ID exists in URL: proceed with database lookup
    console.log("[EventLookup Trace] Direct URL parameter detected. Looking up Event ID:", targetEventId);

    // Show loading state in banner if available
    if (bannerEl) {
      bannerEl.classList.remove("d-none");
      const titleEl = document.getElementById("direct-event-title");
      const dateEl = document.getElementById("direct-event-date");
      const venueEl = document.getElementById("direct-event-venue");
      if (titleEl) titleEl.innerText = "Loading Event Details...";
      if (dateEl) dateEl.innerText = "Connecting to database...";
      if (venueEl) venueEl.innerText = "Please wait...";
    }

    let targetEv = null;

    // 1. Try local list check first
    let events = eventsList || [];
    targetEv = events.find(e => e.id.toUpperCase() === targetEventId.toUpperCase());

    // 2. Query production database directly via ApiService.getEventById
    if (!targetEv) {
      try {
        const result = await ApiService.getEventById(targetEventId);
        if (result && result.id) {
          targetEv = result;
        }
      } catch (err) {
        console.error("[EventLookup Trace] Direct getEventById API call failed:", err);
      }
    }

    // 3. Fallback: try fetching full events list from backend
    if (!targetEv) {
      try {
        const freshEvents = await ApiService.getEvents();
        targetEv = freshEvents.find(e => e.id.toUpperCase() === targetEventId.toUpperCase());
      } catch (err) {
        console.error("[EventLookup Trace] getEvents API fallback failed:", err);
      }
    }

    // RESULT 1: SUCCESS - Event found in database!
    if (targetEv) {
      console.log("[EventLookup Trace] SUCCESS! Event loaded automatically:", targetEv.title);

      // Populate & Display Direct Event Banner
      if (bannerEl) {
        bannerEl.classList.remove("d-none");
        const catEl = document.getElementById("direct-event-category");
        const statusEl = document.getElementById("direct-event-status");
        const titleEl = document.getElementById("direct-event-title");
        const dateEl = document.getElementById("direct-event-date");
        const venueEl = document.getElementById("direct-event-venue");

        if (catEl) catEl.innerText = targetEv.category || "Event";
        if (statusEl) statusEl.innerText = targetEv.status || "Open";
        if (titleEl) titleEl.innerText = targetEv.title;
        if (dateEl) dateEl.innerText = `${targetEv.date} at ${targetEv.time || 'TBD'}`;
        if (venueEl) venueEl.innerText = targetEv.venue;
      }

      // Hide manual dropdown selection & auto-assign hidden form input
      if (selectContainer) selectContainer.classList.add("d-none");

      // Ensure select option exists & is selected
      let existsInDropdown = Array.from(select.options).some(opt => opt.value === targetEv.id);
      if (!existsInDropdown) {
        const opt = document.createElement("option");
        opt.value = targetEv.id;
        opt.text = `${targetEv.title} (${targetEv.date})`;
        select.appendChild(opt);
      }
      select.value = targetEv.id;

      // Hidden input for form submission guarantee
      let hiddenInput = document.getElementById("reg-event-select-hidden");
      if (!hiddenInput) {
        hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.id = "reg-event-select-hidden";
        hiddenInput.name = "eventId";
        hiddenInput.value = targetEv.id;
        select.parentNode.appendChild(hiddenInput);
      } else {
        hiddenInput.value = targetEv.id;
      }

      this.showToast("Event Loaded", `Auto-loaded event: ${targetEv.title}`, "info");

    } else {
      // RESULT 2: ERROR - Event ID genuinely does not exist in DB (e.g. deleted or invalid)
      console.error("[EventLookup Trace] FAILURE: Event ID not found in database:", targetEventId);

      if (bannerEl) bannerEl.classList.add("d-none");

      if (errorEl) {
        errorEl.classList.remove("d-none");
        const msgEl = document.getElementById("direct-event-error-msg");
        if (msgEl) {
          msgEl.innerText = `The shared event (ID: ${targetEventId}) was not found in the database. It may have been deleted by the organizer or the link is invalid.`;
        }
      }

      // Show manual selection dropdown as fallback so user isn't stuck
      if (selectContainer) selectContainer.classList.remove("d-none");
      let allEvents = eventsList || [];
      if (!allEvents.length) {
        try { allEvents = await ApiService.getEvents(); } catch (_) {}
      }
      EventManagerModule.populateEventDropdowns(allEvents);
      select.disabled = false;
      select.classList.remove("bg-glass-disabled");

      this.showToast("Event Not Found", `Event (ID: ${targetEventId}) was not found in database.`, "danger");
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
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Start application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
