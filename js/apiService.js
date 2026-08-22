/**
 * ==========================================================================
 * API SERVICE MODULE - Smart Event Entry Management System
 * ==========================================================================
 * Bridges Google Apps Script Web App API with local Storage fallback.
 * Allows seamless offline/standalone testing on VERCEL and online cloud sync.
 */

const STORAGE_KEYS = {
  SETTINGS: "smart_event_settings",
  EVENTS: "smart_event_events",
  REGISTRATIONS: "smart_event_registrations",
  ATTENDANCE: "smart_event_attendance",
  VOLUNTEERS: "smart_event_volunteers",
  CURRENT_USER: "smart_event_current_user"
};

const ApiService = {
  /**
   * Get Web App API URL from Settings, Global APP_CONFIG, or Vercel Environment Variables
   */
  getApiUrl() {
    const settings = this.getSettings();
    if (settings.webAppUrl && settings.webAppUrl.trim() !== "") {
      return settings.webAppUrl.trim();
    }
    if (typeof window !== "undefined") {
      if (window.APP_CONFIG && window.APP_CONFIG.API_URL && window.APP_CONFIG.API_URL.trim() !== "") {
        return window.APP_CONFIG.API_URL.trim();
      }
      const envUrl = window.VITE_API_URL || 
                     window.NEXT_PUBLIC_API_URL || 
                     window.REACT_APP_API_URL || 
                     window.DATABASE_API_URL || 
                     window.VERCEL_API_URL || 
                     window.API_URL || "";
      if (envUrl && envUrl.trim() !== "") {
        return envUrl.trim();
      }
    }
    return "";
  },

  getSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const envApiUrl = (typeof window !== "undefined" && window.APP_CONFIG && window.APP_CONFIG.API_URL) ? window.APP_CONFIG.API_URL : "";
    const defaults = { webAppUrl: envApiUrl, siteUrl: "https://event-management-system-chi-seven.vercel.app", autoSync: true, theme: "dark" };
    if (!data) return defaults;
    const parsed = JSON.parse(data);
    if (!parsed.webAppUrl && envApiUrl) {
      parsed.webAppUrl = envApiUrl;
    }
    if (!parsed.siteUrl) parsed.siteUrl = defaults.siteUrl;
    // Auto-migrate: replace any old netlify domain cached in localStorage
    if (parsed.siteUrl && parsed.siteUrl.includes("netlify.app")) {
      parsed.siteUrl = defaults.siteUrl;
      this.saveSettings(parsed);
    }
    return parsed;
  },

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  /**
   * Fetch Events
   */
  async getEvents() {
    const apiUrl = this.getApiUrl();
    console.log("[EventSync] getEvents() called. API URL:", apiUrl || "(not configured)");
    if (apiUrl) {
      try {
        const fetchUrl = `${apiUrl}?action=getEvents`;
        console.log("[EventSync] Fetching events from:", fetchUrl);
        const response = await fetch(fetchUrl, { method: "GET", redirect: "follow" });
        console.log("[EventSync] API response status:", response.status, response.statusText);
        const text = await response.text();
        console.log("[EventSync] API raw response (first 500 chars):", text.substring(0, 500));
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            console.log("[EventSync] Successfully fetched", json.length, "events from API. IDs:", json.map(e => e.id));
            this.saveLocal(STORAGE_KEYS.EVENTS, json);
            return json;
          } else {
            console.warn("[EventSync] API returned non-array response:", json);
          }
        } catch (parseErr) {
          console.error("[EventSync] Failed to parse API response as JSON:", parseErr);
        }
      } catch (err) {
        console.error("[EventSync] Cloud API fetch FAILED:", err.message || err);
      }
    } else {
      console.warn("[EventSync] No API URL configured. Using localStorage fallback.");
    }
    const localEvents = this.getLocal(STORAGE_KEYS.EVENTS, this.getDefaultEvents());
    console.log("[EventSync] Returning localStorage events. Count:", localEvents.length, "IDs:", localEvents.map(e => e.id));
    return localEvents;
  },

  /**
   * Fetch Single Event Directly from Database by ID
   */
  async getEventById(eventId) {
    const apiUrl = this.getApiUrl();
    console.log("[EventSync] getEventById() called for Event ID:", eventId, "| API URL:", apiUrl || "(not configured)");
    if (apiUrl) {
      try {
        const fetchUrl = `${apiUrl}?action=getEvent&eventId=${encodeURIComponent(eventId)}`;
        console.log("[EventSync] Fetching event directly from:", fetchUrl);
        const response = await fetch(fetchUrl, { method: "GET", redirect: "follow" });
        console.log("[EventSync] API response status:", response.status, response.statusText);
        const text = await response.text();
        console.log("[EventSync] API raw response (first 500 chars):", text.substring(0, 500));
        try {
          const json = JSON.parse(text);
          if (json && json.status === "success" && json.event) {
            return json.event;
          } else if (json && json.id) {
            return json;
          } else if (Array.isArray(json)) {
            const found = json.find(e => e.id.toUpperCase() === eventId.toUpperCase());
            if (found) return found;
          }
          return json;
        } catch (parseErr) {
          console.error("[EventSync] Failed to parse API response JSON:", parseErr);
          return { status: "error", code: "PARSE_ERROR", message: "Failed to parse database response." };
        }
      } catch (err) {
        console.error("[EventSync] Direct event fetch FAILED:", err.message || err);
        return { status: "error", code: "DB_CONNECTION_FAIL", message: "Database connection failed." };
      }
    } else {
      console.warn("[EventSync] No API URL configured for direct event lookup.");
      return { status: "error", code: "NO_API_URL", message: "Database connection failed (API URL not configured)." };
    }
  },
  async registerStudent(studentData) {
    // 1. Check duplicate locally first
    const regs = this.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const isDuplicate = regs.some(r => r.eventId === studentData.eventId && r.hallTicket.toUpperCase() === studentData.hallTicket.toUpperCase());

    if (isDuplicate) {
      return {
        status: "duplicate",
        message: `Student with Hall Ticket ${studentData.hallTicket} is already registered for this event!`
      };
    }

    const regId = "REG-" + studentData.eventId.replace("EVT-", "") + "-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    const registeredAt = new Date().toISOString();

    const qrPayload = JSON.stringify({
      regId: regId,
      eventId: studentData.eventId,
      ht: studentData.hallTicket.toUpperCase(),
      name: studentData.fullName,
      branch: studentData.branch,
      year: studentData.year,
      sig: "SEC-" + Math.random().toString(36).substr(2, 8).toUpperCase()
    });

    const newRecord = {
      registrationId: regId,
      eventId: studentData.eventId,
      eventName: studentData.eventName,
      fullName: studentData.fullName,
      hallTicket: studentData.hallTicket.toUpperCase(),
      branch: studentData.branch,
      year: studentData.year,
      section: studentData.section,
      mobile: studentData.mobile,
      email: studentData.email,
      photo: studentData.photo || "",
      qrPayload: qrPayload,
      registeredAt: registeredAt
    };

    regs.push(newRecord);
    this.saveLocal(STORAGE_KEYS.REGISTRATIONS, regs);

    // Try cloud sync if API URL exists
    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      console.log("[EventSync] Syncing registration to cloud for:", newRecord.hallTicket);
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "registerStudent", data: newRecord })
      }).then(r => console.log("[EventSync] Registration sync response status:", r.status))
        .catch(err => console.error("[EventSync] Registration sync FAILED:", err));
    }

    return {
      status: "success",
      message: "Registration successful!",
      record: newRecord
    };
  },

  /**
   * Mark Attendance
   */
  async markAttendance(data) {
    const attendance = this.getLocal(STORAGE_KEYS.ATTENDANCE, []);

    // Check if already scanned
    const existing = attendance.find(a => a.eventId === data.eventId && a.hallTicket.toUpperCase() === data.hallTicket.toUpperCase() && a.status === "VALID");

    if (existing) {
      return {
        status: "already_entered",
        message: "Student has already entered the venue!",
        entryTime: existing.scanTimestamp,
        scannedBy: existing.scannedBy,
        studentName: existing.fullName,
        hallTicket: existing.hallTicket
      };
    }

    const attId = "ATT-" + Math.random().toString(36).substr(2, 8).toUpperCase();
    const timestamp = new Date().toISOString();

    const record = {
      attendanceId: attId,
      eventId: data.eventId,
      registrationId: data.registrationId || "MANUAL",
      hallTicket: data.hallTicket.toUpperCase(),
      fullName: data.fullName,
      branch: data.branch || "N/A",
      status: "VALID",
      scannedBy: data.scannedBy || "Admin",
      scanTimestamp: timestamp,
      remarks: data.remarks || "Camera Scan"
    };

    attendance.push(record);
    this.saveLocal(STORAGE_KEYS.ATTENDANCE, attendance);

    // Cloud sync
    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      console.log("[EventSync] Syncing attendance to cloud for:", record.hallTicket);
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "markAttendance", data: record })
      }).then(r => console.log("[EventSync] Attendance sync response status:", r.status))
        .catch(err => console.error("[EventSync] Attendance sync FAILED:", err));
    }

    return {
      status: "valid",
      message: "Entry Authorized!",
      record: record
    };
  },

  async syncCreateEvent(eventData) {
    const apiUrl = this.getApiUrl();
    console.log("[EventSync] syncCreateEvent called. API URL:", apiUrl || "(not configured)", "Event ID:", eventData.id);
    if (apiUrl) {
      try {
        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "createEvent", data: eventData })
        });
        console.log("[EventSync] syncCreateEvent response status:", resp.status);
        const text = await resp.text();
        console.log("[EventSync] syncCreateEvent response body:", text.substring(0, 300));
        try {
          const json = JSON.parse(text);
          if (json && (json.status === "success" || json.success)) {
            return { success: true, message: "Event saved to production cloud database." };
          }
        } catch (_) {}
        return { success: true, message: "Synced to cloud database." };
      } catch (err) {
        console.error("[EventSync] syncCreateEvent FAILED:", err.message || err);
        return { success: false, error: err.message || "Failed to reach production database." };
      }
    } else {
      console.warn("[EventSync] syncCreateEvent skipped: no API URL configured.");
      return { success: false, error: "No production Web App API URL configured in Settings or Environment Variables." };
    }
  },

  async syncUpdateEvent(eventData) {
    const apiUrl = this.getApiUrl();
    console.log("[EventSync] syncUpdateEvent called. API URL:", apiUrl || "(not configured)", "Event ID:", eventData.id);
    if (apiUrl) {
      try {
        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "updateEvent", data: eventData })
        });
        console.log("[EventSync] syncUpdateEvent response status:", resp.status);
        return resp;
      } catch (err) {
        console.error("[EventSync] syncUpdateEvent FAILED:", err.message || err);
      }
    }
    return Promise.resolve();
  },

  async syncDeleteEvent(eventId) {
    const apiUrl = this.getApiUrl();
    console.log("[EventSync] syncDeleteEvent called. API URL:", apiUrl || "(not configured)", "Event ID:", eventId);
    if (apiUrl) {
      try {
        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "deleteEvent", eventId: eventId })
        });
        console.log("[EventSync] syncDeleteEvent response status:", resp.status);
        return resp;
      } catch (err) {
        console.error("[EventSync] syncDeleteEvent FAILED:", err.message || err);
      }
    }
    return Promise.resolve();
  },

  /**
   * Storage Helpers
   */
  getLocal(key, defaultValue) {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  },

  saveLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  /**
   * Default Seed Data
   */
  getDefaultEvents() {
    return [];
  }
};