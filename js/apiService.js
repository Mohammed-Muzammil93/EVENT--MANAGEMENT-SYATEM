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
   * Get Web App API URL from local settings
   */
  getApiUrl() {
    const settings = this.getSettings();
    return settings.webAppUrl || "";
  },

  getSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const defaults = { webAppUrl: "", siteUrl: "https://event-management-system-chi-seven.vercel.app", autoSync: true, theme: "dark" };
    if (!data) return defaults;
    const parsed = JSON.parse(data);
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
    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}?action=getEvents`);
        const json = await response.json();
        if (Array.isArray(json)) {
          this.saveLocal(STORAGE_KEYS.EVENTS, json);
          return json;
        }
      } catch (err) {
        console.warn("Cloud API fetch failed, loading local cache:", err);
      }
    }
    return this.getLocal(STORAGE_KEYS.EVENTS, this.getDefaultEvents());
  },

  /**
   * Register Student
   */
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
      fetch(apiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "registerStudent", data: newRecord })
      }).catch(err => console.log("Cloud sync error:", err));
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
      fetch(apiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAttendance", data: record })
      }).catch(err => console.log("Cloud sync error:", err));
    }

    return {
      status: "valid",
      message: "Entry Authorized!",
      record: record
    };
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
    return [
      {
        id: "EVT-TECHFEST-2026",
        title: "Annual TechFest 2026",
        date: "2026-08-15",
        time: "09:30 AM",
        venue: "Main Auditorium",
        category: "Technical",
        status: "Open",
        maxSeats: 800,
        createdAt: "2026-08-01T10:00:00Z"
      },
      {
        id: "EVT-HACKATHON-26",
        title: "24-Hour AI Hackathon",
        date: "2026-08-20",
        time: "10:00 AM",
        venue: "CS Innovation Lab",
        category: "Hackathon",
        status: "Open",
        maxSeats: 300,
        createdAt: "2026-08-02T12:00:00Z"
      },
      {
        id: "EVT-CULTURAL-26",
        title: "Grand Cultural Night",
        date: "2026-08-28",
        time: "05:00 PM",
        venue: "Open Air Theatre",
        category: "Cultural",
        status: "Open",
        maxSeats: 1500,
        createdAt: "2026-08-03T14:00:00Z"
      }
    ];
  }
};