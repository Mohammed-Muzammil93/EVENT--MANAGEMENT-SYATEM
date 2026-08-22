/**
 * ==========================================================================
 * EVENT MANAGEMENT MODULE
 * ==========================================================================
 * Event creation, editing, closing/reopening, safe deletion & archiving.
 * Guarantees event data separation so changing one event never overwrites others.
 */

const EventManagerModule = {
  pendingDeleteId: null,

  async renderEventsList() {
    const container = document.getElementById("events-list-grid");
    if (!container) return;

    const events = await ApiService.getEvents();
    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const atts = ApiService.getLocal(STORAGE_KEYS.ATTENDANCE, []);

    if (events.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <p class="text-muted">No events created yet. Click "Create Event" to get started.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = events.map(ev => {
      const eventRegs = regs.filter(r => r.eventId === ev.id).length;
      const eventAtts = atts.filter(a => a.eventId === ev.id && a.status === "VALID").length;
      const attPct = eventRegs > 0 ? ((eventAtts / eventRegs) * 100).toFixed(0) : 0;
      const isClosed = ev.status === "Closed";

      return `
        <div class="col-md-6 col-lg-4">
          <div class="glass-card p-4 h-100 d-flex flex-column justify-content-between position-relative">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="badge ${isClosed ? 'bg-secondary' : 'bg-success'} badge-custom">${ev.status}</span>
                <small class="text-muted"><i class="bi bi-tag-fill me-1"></i>${this.escapeHtml(ev.category)}</small>
              </div>

              <h4 class="font-weight-bold text-truncate mb-2">${this.escapeHtml(ev.title)}</h4>

              <div class="text-sm text-secondary mb-3">
                <div><i class="bi bi-calendar-event me-2"></i>${ev.date} at ${ev.time}</div>
                <div><i class="bi bi-geo-alt me-2"></i>${this.escapeHtml(ev.venue)}</div>
              </div>

              <div class="bg-glass p-3 rounded-3 mb-3">
                <div class="d-flex justify-content-between mb-1 text-sm">
                  <span>Registrations: <strong>${eventRegs} / ${ev.maxSeats || 500}</strong></span>
                  <span>Attendance: <strong>${attPct}%</strong></span>
                </div>
                <div class="progress" style="height: 6px;">
                  <div class="progress-bar bg-accent-gradient" style="width: ${Math.min(100, (eventRegs / (ev.maxSeats || 500)) * 100)}%"></div>
                </div>
              </div>
            </div>

            <div class="d-flex gap-2 mb-2">
              <button class="btn btn-sm btn-success flex-fill" onclick="EventManagerModule.shareOnWhatsApp('${ev.id}')">
                <i class="bi bi-whatsapp me-1"></i>WhatsApp
              </button>
              <button class="btn btn-sm btn-custom-outline flex-fill" onclick="EventManagerModule.showEventQrModal('${ev.id}')">
                <i class="bi bi-qr-code me-1"></i>Poster QR
              </button>
              <button class="btn btn-sm btn-outline-light" onclick="EventManagerModule.copyEventShareLink('${ev.id}')" title="Copy Link">
                <i class="bi bi-clipboard"></i>
              </button>
            </div>

            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-custom-outline flex-fill" onclick="EventManagerModule.toggleStatus('${ev.id}')">
                ${isClosed ? '<i class="bi bi-unlock me-1"></i>Reopen' : '<i class="bi bi-lock me-1"></i>Close'}
              </button>
              <button class="btn btn-sm btn-outline-info flex-fill" onclick="EventManagerModule.editEvent('${ev.id}')">
                <i class="bi bi-pencil me-1"></i>Edit
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="EventManagerModule.promptDelete('${ev.id}', '${this.escapeHtml(ev.title)}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Populate dropdown filters across app
    this.populateEventDropdowns(events);
  },

  getShareableUrl(eventId) {
    const settings = ApiService.getSettings();
    let base = settings.siteUrl ? settings.siteUrl.trim() : "";

    const hostname = window.location.hostname || "";
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || window.location.protocol === "file:";

    // If siteUrl is empty OR points to localhost/127.0.0.1 while running locally, ensure a public HTTPS domain is used for sharing
    if (!base || (isLocal && (base.includes("localhost") || base.includes("127.0.0.1")))) {
      if (!isLocal && window.location.origin && !window.location.origin.startsWith("file")) {
        base = window.location.origin + window.location.pathname;
      } else {
        base = "https://event-management-system-chi-seven.vercel.app/index.html";
      }
    }

    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = "https://" + base;
    }

    const apiUrl = ApiService.getApiUrl();

    try {
      const url = new URL(base, window.location.href);
      url.searchParams.set("event", eventId);
      if (apiUrl) {
        url.searchParams.set("backend", apiUrl);
      }
      return url.href;
    } catch (e) {
      const sep = base.includes("?") ? "&" : "?";
      let res = `${base}${sep}event=${encodeURIComponent(eventId)}`;
      if (apiUrl) {
        res += `&backend=${encodeURIComponent(apiUrl)}`;
      }
      return res;
    }
  },

  copyEventShareLink(eventId) {
    const shareUrl = this.getShareableUrl(eventId);

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        App.showToast("Link Copied!", "Shareable registration link copied to clipboard.", "success");
      }).catch(() => {
        this.fallbackCopyLink(shareUrl);
      });
    } else {
      this.fallbackCopyLink(shareUrl);
    }
  },

  shareOnWhatsApp(eventId) {
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const ev = events.find(x => x.id === eventId);
    let shareUrl = this.getShareableUrl(eventId);

    const eventTitle = ev ? ev.title : '24-Hour AI Hackathon';
    const eventDate = ev ? `${ev.date} at ${ev.time}` : '2026-08-20 at 10:00 AM';
    const eventVenue = ev ? ev.venue : 'CS Innovation Lab';

    // Format exactly as required for WhatsApp parsing
    const message = `🎓 *COLLEGE EVENT REGISTRATION OPEN!*\n\n📌 *Event:* ${eventTitle}\n📅 *Date:* ${eventDate}\n📍 *Venue:* ${eventVenue}\n\n👉 *Click the link below to register and get your Event Pass:*\n\n${shareUrl}`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  },

  showEventQrModal(eventId) {
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const ev = events.find(x => x.id === eventId);
    if (!ev) return;

    const shareUrl = this.getShareableUrl(eventId);

    document.getElementById("share-modal-title").innerText = ev.title;
    document.getElementById("share-modal-subtitle").innerText = `${ev.date} at ${ev.venue} • Scan to Register`;
    document.getElementById("share-modal-link-input").value = shareUrl;

    const waBtn = document.getElementById("btn-share-modal-whatsapp");
    if (waBtn) {
      waBtn.onclick = () => this.shareOnWhatsApp(eventId);
    }

    // Render Registration Link QR Code
    const container = document.getElementById("share-modal-qr-container");
    container.innerHTML = "";
    new QRCode(container, {
      text: shareUrl,
      width: 180,
      height: 180,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

    const modalEl = document.getElementById("event-share-modal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  },

  copyShareModalLink() {
    const input = document.getElementById("share-modal-link-input");
    if (input) {
      input.select();
      navigator.clipboard.writeText(input.value);
      App.showToast("Copied", "Registration link copied to clipboard!", "success");
    }
  },

  downloadPosterQr() {
    const qrCanvas = document.querySelector("#share-modal-qr-container canvas");
    const qrImg = document.querySelector("#share-modal-qr-container img");

    if (qrCanvas || qrImg) {
      const dataUrl = qrCanvas ? qrCanvas.toDataURL("image/png") : qrImg.src;
      const link = document.createElement("a");
      link.download = `Event_Poster_QR_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      App.showToast("Success", "Poster QR Code downloaded!", "success");
    }
  },

  fallbackCopyLink(shareUrl) {
    prompt("Copy this Shareable Event Registration Link for Students:", shareUrl);
  },

  populateEventDropdowns(events) {
    const dropdowns = [
      document.getElementById("reg-event-select"),
      document.getElementById("scanner-event-filter"),
      document.getElementById("attendance-event-filter"),
      document.getElementById("reports-event-filter"),
      document.getElementById("volunteer-event-assign")
    ];

    dropdowns.forEach(dropdown => {
      if (!dropdown) return;
      const currentVal = dropdown.value;
      const isFilter = dropdown.id.includes("filter");

      let html = isFilter ? `<option value="">-- All Events --</option>` : `<option value="">Select Event...</option>`;
      html += events.map(e => `<option value="${e.id}">${this.escapeHtml(e.title)} (${e.date})</option>`).join("");
      
      dropdown.innerHTML = html;
      if (currentVal) dropdown.value = currentVal;
    });
  },

  async handleCreateOrUpdate(e) {
    e.preventDefault();

    const id = document.getElementById("event-form-id").value;
    const title = document.getElementById("event-form-title").value.trim();
    const date = document.getElementById("event-form-date").value;
    const time = document.getElementById("event-form-time").value;
    const venue = document.getElementById("event-form-venue").value.trim();
    const category = document.getElementById("event-form-category").value;
    const maxSeats = parseInt(document.getElementById("event-form-maxseats").value) || 500;

    if (!title || !date || !venue) {
      App.showToast("Warning", "Please fill in title, date, and venue", "warning");
      return;
    }

    if (!ApiService.getApiUrl()) {
      App.showToast("Settings Required", "⚠️ Web App API URL is not set in Settings! Please configure it in Settings so events sync to cloud and shared links work for guests.", "warning");
    }

    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, ApiService.getDefaultEvents());

    App.showLoader(true);

    if (id) {
      // Edit existing
      const ev = events.find(x => x.id === id);
      if (ev) {
        ev.title = title;
        ev.date = date;
        ev.time = time;
        ev.venue = venue;
        ev.category = category;
        ev.maxSeats = maxSeats;
        
        // Sync to cloud and await it
        await ApiService.syncUpdateEvent(ev);
      }
      ApiService.saveLocal(STORAGE_KEYS.EVENTS, events);
      App.showLoader(false);
      App.showToast("Success", "Event updated and synced successfully!", "success");
    } else {
      const newEv = {
        id: "EVT-" + Date.now().toString(36).toUpperCase(),
        title,
        date,
        time,
        venue,
        category,
        status: "Open",
        maxSeats,
        createdAt: new Date().toISOString()
      };
      
      // Sync to cloud and await it
      await ApiService.syncCreateEvent(newEv);
      
      events.push(newEv);
      ApiService.saveLocal(STORAGE_KEYS.EVENTS, events);
      
      App.showLoader(false);
      App.showToast("Event Created!", "Event created and synced successfully! Opening share & poster options...", "success");
      
      // Open the share QR modal immediately
      this.showEventQrModal(newEv.id);
    }

    // Hide Modal & Refresh
    const modalEl = document.getElementById("create-event-modal");
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    document.getElementById("event-form").reset();
    document.getElementById("event-form-id").value = "";
    this.renderEventsList();
    DashboardModule.refresh();
  },

  toggleStatus(eventId) {
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const ev = events.find(x => x.id === eventId);
    if (ev) {
      ev.status = ev.status === "Open" ? "Closed" : "Open";
      ApiService.saveLocal(STORAGE_KEYS.EVENTS, events);
      
      // Sync to cloud
      ApiService.syncUpdateEvent(ev);
      
      App.showToast("Updated", `Event status set to ${ev.status}`, "info");
      this.renderEventsList();
    }
  },

  editEvent(eventId) {
    const events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const ev = events.find(x => x.id === eventId);
    if (!ev) return;

    document.getElementById("event-form-id").value = ev.id;
    document.getElementById("event-form-title").value = ev.title;
    document.getElementById("event-form-date").value = ev.date;
    document.getElementById("event-form-time").value = ev.time;
    document.getElementById("event-form-venue").value = ev.venue;
    document.getElementById("event-form-category").value = ev.category;
    document.getElementById("event-form-maxseats").value = ev.maxSeats;

    const modalEl = document.getElementById("create-event-modal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  },

  promptDelete(eventId, eventTitle) {
    this.pendingDeleteId = eventId;
    document.getElementById("delete-event-name-text").innerText = eventTitle;

    const modalEl = document.getElementById("delete-event-confirm-modal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  },

  confirmDelete() {
    if (!this.pendingDeleteId) return;

    let events = ApiService.getLocal(STORAGE_KEYS.EVENTS, []);
    const targetEvent = events.find(e => e.id === this.pendingDeleteId);

    // Archive data safely before deletion
    if (targetEvent) {
      const archive = ApiService.getLocal("smart_event_archived_events", []);
      archive.push({
        event: targetEvent,
        archivedAt: new Date().toISOString()
      });
      ApiService.saveLocal("smart_event_archived_events", archive);
    }

    // Remove event from list
    events = events.filter(e => e.id !== this.pendingDeleteId);
    ApiService.saveLocal(STORAGE_KEYS.EVENTS, events);

    // Sync to cloud
    ApiService.syncDeleteEvent(this.pendingDeleteId);

    App.showToast("Event Deleted", "Event and data safely archived & removed.", "warning");

    const modalEl = document.getElementById("delete-event-confirm-modal");
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    this.pendingDeleteId = null;
    this.renderEventsList();
    DashboardModule.refresh();
  },

  escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
