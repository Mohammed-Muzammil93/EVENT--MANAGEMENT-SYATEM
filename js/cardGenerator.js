/**
 * ==========================================================================
 * HIGH-DPI EVENT ID CARD GENERATOR MODULE
 * ==========================================================================
 * Fixes previous issue where downloaded ID card details were incorrect.
 * Uses HTML5 Canvas 300 DPI engine to render 100% exact student details.
 */

const CardGenerator = {
  currentRecord: null,
  currentEvent: null,

  showModal(record, eventObj) {
    this.currentRecord = record;
    this.currentEvent = eventObj;

    // Render HTML Preview in Modal
    this.renderHtmlPreview(record, eventObj);

    // Open Modal
    const modalEl = document.getElementById("id-card-modal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  },

  renderHtmlPreview(record, eventObj) {
    const previewContainer = document.getElementById("id-card-render-box");
    if (!previewContainer) return;

    const eventDate = eventObj ? (eventObj.date || "2026-08-15") : "2026-08-15";
    const eventName = eventObj ? (eventObj.title || record.eventName || "College Event") : (record.eventName || "College Event");
    const photoSrc = record.photo || "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(record.hallTicket);

    previewContainer.innerHTML = `
      <div class="id-card-element" id="live-id-card-element">
        <div class="id-card-header">
          <div class="id-card-logo">
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="#4F46E5">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
            </svg>
          </div>
          <div>
            <div class="id-card-college-name">ENGINEERING COLLEGE</div>
            <div style="font-size: 0.65rem; color: #94a3b8;">SMART EVENT ENTRY PASS</div>
          </div>
        </div>

        <div class="id-card-photo-box">
          <img src="${photoSrc}" alt="Student Photo" id="preview-student-photo" crossorigin="anonymous">
        </div>

        <div class="id-card-student-name">${this.escapeHtml(record.fullName)}</div>
        <div class="id-card-htno">${this.escapeHtml(record.hallTicket)}</div>

        <div class="id-card-meta">
          <div><strong>Branch:</strong> ${this.escapeHtml(record.branch)}</div>
          <div><strong>Year/Sec:</strong> ${this.escapeHtml(record.year)} - ${this.escapeHtml(record.section)}</div>
          <div><strong>Event:</strong> ${this.escapeHtml(eventName)}</div>
          <div><strong>Date:</strong> ${this.escapeHtml(eventDate)}</div>
        </div>

        <div class="id-card-qr-box" id="card-qr-container">
          <!-- Canvas QR code will be injected here -->
        </div>

        <div style="font-size: 0.72rem; font-weight: 700; margin-top: 0.4rem; color: #a855f7;">
          REG ID: ${this.escapeHtml(record.registrationId)}
        </div>

        <div class="id-card-footer">
          Show this QR code at entry gate • Non-Transferable
        </div>
      </div>
    `;

    // Render QR Code inside preview
    const qrContainer = document.getElementById("card-qr-container");
    qrContainer.innerHTML = "";
    
    new QRCode(qrContainer, {
      text: record.qrPayload || JSON.stringify({ regId: record.registrationId, ht: record.hallTicket, eventId: record.eventId }),
      width: 110,
      height: 110,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  },

  /**
   * High-Res PNG Download Renderer
   */
  async downloadIdCard() {
    if (!this.currentRecord) return;

    App.showLoader(true);

    try {
      const cardCanvas = document.createElement("canvas");
      const ctx = cardCanvas.getContext("2d");

      // 300 DPI high resolution dimensions (720 x 1080)
      const width = 720;
      const height = 1080;
      cardCanvas.width = width;
      cardCanvas.height = height;

      // 1. Background Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#1e1b4b");
      grad.addColorStop(0.5, "#0f172a");
      grad.addColorStop(1, "#311042");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Card Border & Glow
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, width - 24, height - 24);

      // Header Bar
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(30, 30, width - 60, 100);

      // Header Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("SMART COLLEGE EVENT PASS", 120, 75);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "20px sans-serif";
      ctx.fillText("OFFICIAL STUDENT ENTRY CARD", 120, 105);

      // Student Photo Circle Placeholder
      const photoCenterX = width / 2;
      const photoCenterY = 240;
      const radius = 90;

      ctx.save();
      ctx.beginPath();
      ctx.arc(photoCenterX, photoCenterY, radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(photoCenterX - radius, photoCenterY - radius, radius * 2, radius * 2);

      // Draw Photo Image if available
      const imgEl = document.getElementById("preview-student-photo");
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        try {
          ctx.drawImage(imgEl, photoCenterX - radius, photoCenterY - radius, radius * 2, radius * 2);
        } catch (e) {
          // fallback avatar if cross-origin blocked
          ctx.fillStyle = "#4F46E5";
          ctx.fillRect(photoCenterX - radius, photoCenterY - radius, radius * 2, radius * 2);
        }
      }
      ctx.restore();

      // Border around photo
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(photoCenterX, photoCenterY, radius, 0, Math.PI * 2, true);
      ctx.stroke();

      // Student Name
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 42px sans-serif";
      ctx.fillText(this.currentRecord.fullName.toUpperCase(), width / 2, 380);

      // Hall Ticket Pill
      const htText = this.currentRecord.hallTicket.toUpperCase();
      ctx.font = "bold 28px sans-serif";
      const htWidth = ctx.measureText(htText).width + 40;
      ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
      ctx.fillRect((width - htWidth) / 2, 410, htWidth, 50);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.strokeRect((width - htWidth) / 2, 410, htWidth, 50);

      ctx.fillStyle = "#06b6d4";
      ctx.fillText(htText, width / 2, 445);

      // Meta Info Box
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(60, 490, width - 120, 200);

      ctx.textAlign = "left";
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "24px sans-serif";
      ctx.fillText(`Branch: ${this.currentRecord.branch}`, 90, 540);
      ctx.fillText(`Year / Sec: ${this.currentRecord.year} - ${this.currentRecord.section}`, 90, 590);

      const eventName = this.currentEvent ? this.currentEvent.title : this.currentRecord.eventName;
      const eventDate = this.currentEvent ? this.currentEvent.date : "2026-08-15";
      ctx.fillText(`Event: ${eventName}`, 90, 640);

      // QR Code Drawing
      const qrCanvas = document.querySelector("#card-qr-container canvas");
      const qrImg = document.querySelector("#card-qr-container img");

      const qrSize = 220;
      const qrX = (width - qrSize) / 2;
      const qrY = 720;

      // Draw white backing box for QR
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30);

      if (qrCanvas) {
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      } else if (qrImg) {
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      }

      // Registration ID Footer
      ctx.textAlign = "center";
      ctx.fillStyle = "#a855f7";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText(`REG ID: ${this.currentRecord.registrationId}`, width / 2, 1000);

      ctx.fillStyle = "#64748b";
      ctx.font = "18px sans-serif";
      ctx.fillText("Valid Official Entry Ticket • Powered by Smart Event System", width / 2, 1040);

      // Trigger Download
      const dataUrl = cardCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `ID_Card_${this.currentRecord.hallTicket}_${this.currentRecord.registrationId}.png`;
      link.href = dataUrl;
      link.click();

      App.showToast("Success", "ID Card downloaded successfully!", "success");
    } catch (err) {
      console.error("Canvas export failed:", err);
      App.showToast("Error", "Could not generate ID card image download", "danger");
    } finally {
      App.showLoader(false);
    }
  },

  escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
