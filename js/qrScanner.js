/**
 * ==========================================================================
 * QR CODE SCANNER MODULE (html5-qrcode integration)
 * ==========================================================================
 * Fixes previous issue where every scan was showing Invalid.
 * Robust fallback scanner supporting JSON, string payloads, and Hall Tickets.
 */

const QrScannerModule = {
  html5QrcodeScanner: null,
  isScanning: false,
  audioCtx: null,

  init() {
    this.bindControls();
  },

  bindControls() {
    const startBtn = document.getElementById("btn-start-scanner");
    const stopBtn = document.getElementById("btn-stop-scanner");
    const manualBtn = document.getElementById("btn-manual-scan-submit");
    const fileInput = document.getElementById("qr-file-input");

    if (startBtn) startBtn.addEventListener("click", () => this.startCamera());
    if (stopBtn) stopBtn.addEventListener("click", () => this.stopCamera());
    if (manualBtn) {
      manualBtn.addEventListener("click", () => {
        const inputVal = document.getElementById("manual-qr-input").value.trim();
        if (inputVal) {
          this.processScannedPayload(inputVal);
        } else {
          App.showToast("Warning", "Please enter a Hall Ticket or Reg ID", "warning");
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          this.scanImageFile(file);
        }
      });
    }
  },

  async startCamera() {
    const container = document.getElementById("qr-reader");
    if (!container) return;

    if (this.isScanning) return;

    try {
      this.html5QrcodeScanner = new Html5Qrcode("qr-reader");
      
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await this.html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
          this.processScannedPayload(decodedText);
        },
        (errorMessage) => {
          // ignore transient frame read errors
        }
      );

      this.isScanning = true;
      document.getElementById("btn-start-scanner").classList.add("d-none");
      document.getElementById("btn-stop-scanner").classList.remove("d-none");
      document.getElementById("scanner-status-text").innerText = "Camera Active - Point at Student QR";

    } catch (err) {
      console.error("Camera start error:", err);
      App.showToast("Camera Error", "Could not access camera. Try file upload or manual search.", "danger");
    }
  },

  async stopCamera() {
    if (this.html5QrcodeScanner && this.isScanning) {
      try {
        await this.html5QrcodeScanner.stop();
        this.html5QrcodeScanner.clear();
      } catch (e) {
        console.log("Stop camera error:", e);
      } finally {
        this.isScanning = false;
        document.getElementById("btn-start-scanner").classList.remove("d-none");
        document.getElementById("btn-stop-scanner").classList.add("d-none");
        document.getElementById("scanner-status-text").innerText = "Camera Stopped";
      }
    }
  },

  scanImageFile(file) {
    const html5Qr = new Html5Qrcode("qr-file-temp-reader");
    html5Qr.scanFile(file, true)
      .then(decodedText => {
        this.processScannedPayload(decodedText);
      })
      .catch(err => {
        App.showToast("Scan Error", "No clear QR code found in selected image file.", "danger");
      });
  },

  /**
   * Robust Payload Decoder & Validator
   */
  async processScannedPayload(payloadString) {
    let hallTicket = "";
    let regId = "";
    let eventId = document.getElementById("scanner-event-filter") ? document.getElementById("scanner-event-filter").value : "";

    // 1. Try parsing JSON payload
    try {
      const parsed = JSON.parse(payloadString);
      if (parsed.ht) hallTicket = parsed.ht;
      if (parsed.regId) regId = parsed.regId;
      if (parsed.eventId) eventId = parsed.eventId;
    } catch (e) {
      // 2. If not JSON, check comma/space separated string or raw HT
      if (payloadString.includes("REG-")) {
        const parts = payloadString.split(",");
        parts.forEach(p => {
          if (p.trim().startsWith("REG-")) regId = p.trim();
          else if (p.trim().length >= 8) hallTicket = p.trim();
        });
      } else {
        hallTicket = payloadString.trim();
      }
    }

    hallTicket = hallTicket.toUpperCase();

    // Fetch registered students
    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const selectedEventId = document.getElementById("scanner-event-filter") ? document.getElementById("scanner-event-filter").value : "";

    // Find student matching registration or hall ticket
    const match = regs.find(r => {
      const htMatch = r.hallTicket.toUpperCase() === hallTicket;
      const regMatch = r.registrationId === regId;
      const eventMatch = !selectedEventId || r.eventId === selectedEventId;
      return (htMatch || regMatch) && eventMatch;
    });

    // Handle Invalid Scan
    if (!match) {
      this.playAudioFeedback("invalid");
      this.displayScanResult("invalid", {
        message: "Invalid QR Code! Student registration not found for this event.",
        hallTicket: hallTicket || "UNKNOWN",
        name: "N/A",
        regId: regId || "N/A"
      });
      return;
    }

    // Check attendance status
    const result = await ApiService.markAttendance({
      eventId: match.eventId,
      registrationId: match.registrationId,
      hallTicket: match.hallTicket,
      fullName: match.fullName,
      branch: match.branch,
      scannedBy: AuthModule.getCurrentUser() ? AuthModule.getCurrentUser().fullName : "Volunteer"
    });

    if (result.status === "already_entered") {
      this.playAudioFeedback("warning");
      this.displayScanResult("already-entered", {
        message: "ALREADY ENTERED! Student has already been admitted.",
        hallTicket: match.hallTicket,
        name: match.fullName,
        regId: match.registrationId,
        entryTime: result.entryTime,
        scannedBy: result.scannedBy,
        branch: match.branch,
        year: match.year
      });
    } else {
      this.playAudioFeedback("valid");
      this.displayScanResult("valid", {
        message: "VALID ENTRY AUTHORIZED!",
        hallTicket: match.hallTicket,
        name: match.fullName,
        regId: match.registrationId,
        entryTime: result.record.scanTimestamp,
        scannedBy: result.record.scannedBy,
        branch: match.branch,
        year: match.year,
        section: match.section
      });

      // Refresh Dashboard & Attendance Table if visible
      if (typeof DashboardModule !== "undefined") DashboardModule.refresh();
      if (typeof AttendanceModule !== "undefined") AttendanceModule.renderTable();
    }
  },

  displayScanResult(statusClass, data) {
    const resultCard = document.getElementById("scan-result-card");
    if (!resultCard) return;

    resultCard.className = `glass-card p-4 scan-result-card ${statusClass} animate-fade-in`;
    resultCard.classList.remove("d-none");

    let statusTitle = "";
    let badgeClass = "";

    if (statusClass === "valid") {
      statusTitle = "SUCCESS: VALID ENTRY";
      badgeClass = "bg-success";
    } else if (statusClass === "already-entered") {
      statusTitle = "WARNING: ALREADY ENTERED";
      badgeClass = "bg-warning text-dark";
    } else {
      statusTitle = "ERROR: INVALID QR CODE";
      badgeClass = "bg-danger";
    }

    resultCard.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="m-0 font-weight-bold" style="letter-spacing: -0.5px;">${statusTitle}</h4>
        <span class="badge ${badgeClass} fs-6">${statusClass.toUpperCase()}</span>
      </div>
      <p class="mb-3 font-weight-semibold">${data.message}</p>

      <div class="row g-2 text-sm bg-glass p-3 rounded-3">
        <div class="col-6"><strong>Student Name:</strong> ${data.name}</div>
        <div class="col-6"><strong>Hall Ticket:</strong> ${data.hallTicket}</div>
        <div class="col-6"><strong>Reg ID:</strong> ${data.regId}</div>
        <div class="col-6"><strong>Branch:</strong> ${data.branch || 'N/A'}</div>
        <div class="col-6"><strong>Time:</strong> ${data.entryTime ? new Date(data.entryTime).toLocaleTimeString() : new Date().toLocaleTimeString()}</div>
        <div class="col-6"><strong>Scanned By:</strong> ${data.scannedBy || 'Admin'}</div>
      </div>
    `;
  },

  /**
   * Audio Feedback synthesizer (Web Audio API)
   */
  playAudioFeedback(type) {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === "valid") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, this.audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.50, this.audioCtx.currentTime + 0.15); // C6
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.2);
      } else if (type === "warning") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, this.audioCtx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      console.log("Audio feedback error:", e);
    }
  }
};
