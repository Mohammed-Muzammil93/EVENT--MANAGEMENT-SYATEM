/**
 * ==========================================================================
 * ATTENDANCE MODULE
 * ==========================================================================
 * Real-time attendance logging, manual overrides, search, and filtering.
 */

const AttendanceModule = {
  currentPage: 1,
  pageSize: 10,

  async renderTable() {
    const tableBody = document.getElementById("attendance-table-body");
    if (!tableBody) return;

    const eventFilter = document.getElementById("attendance-event-filter") ? document.getElementById("attendance-event-filter").value : "";
    const statusFilter = document.getElementById("attendance-status-filter") ? document.getElementById("attendance-status-filter").value : "";
    const searchVal = document.getElementById("attendance-search-input") ? document.getElementById("attendance-search-input").value.trim().toLowerCase() : "";

    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const atts = ApiService.getLocal(STORAGE_KEYS.ATTENDANCE, []);
    const events = await ApiService.getEvents();

    // Join Registrations with Attendance
    let records = regs.map(r => {
      const att = atts.find(a => a.eventId === r.eventId && a.hallTicket.toUpperCase() === r.hallTicket.toUpperCase());
      const eventObj = events.find(e => e.id === r.eventId);
      return {
        ...r,
        eventName: eventObj ? eventObj.title : r.eventName,
        status: att ? "PRESENT" : "ABSENT",
        entryTime: att ? att.scanTimestamp : null,
        scannedBy: att ? att.scannedBy : "-",
        remarks: att ? att.remarks : "-"
      };
    });

    // Apply Filters
    if (eventFilter) records = records.filter(r => r.eventId === eventFilter);
    if (statusFilter) records = records.filter(r => r.status === statusFilter);
    if (searchVal) {
      records = records.filter(r => 
        r.fullName.toLowerCase().includes(searchVal) ||
        r.hallTicket.toLowerCase().includes(searchVal) ||
        r.branch.toLowerCase().includes(searchVal) ||
        r.registrationId.toLowerCase().includes(searchVal)
      );
    }

    // Pagination
    const totalRecords = records.length;
    const totalPages = Math.ceil(totalRecords / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pagedRecords = records.slice(startIdx, startIdx + this.pageSize);

    if (pagedRecords.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">No attendance records found matching filters.</td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = pagedRecords.map((r, idx) => {
        const isPresent = r.status === "PRESENT";
        return `
          <tr>
            <td>${startIdx + idx + 1}</td>
            <td>
              <div class="font-weight-bold">${this.escapeHtml(r.fullName)}</div>
              <small class="text-muted">${r.registrationId}</small>
            </td>
            <td><span class="badge bg-glass text-primary border">${r.hallTicket}</span></td>
            <td>${r.branch} (${r.year}-${r.section})</td>
            <td><small>${this.escapeHtml(r.eventName)}</small></td>
            <td>
              <span class="badge ${isPresent ? 'bg-success' : 'bg-danger'} badge-custom">
                ${r.status}
              </span>
            </td>
            <td><small>${r.entryTime ? new Date(r.entryTime).toLocaleTimeString() : '-'}</small></td>
            <td>
              ${isPresent ? `<small class="text-muted">${r.scannedBy}</small>` : `
                <button class="btn btn-xs btn-sm btn-outline-success py-0 px-2" onclick="AttendanceModule.openManualModal('${r.eventId}', '${r.hallTicket}', '${this.escapeHtml(r.fullName)}')">
                  Mark Present
                </button>
              `}
            </td>
          </tr>
        `;
      }).join("");
    }

    // Update Pagination UI
    const pageInfo = document.getElementById("attendance-page-info");
    if (pageInfo) pageInfo.innerText = `Page ${this.currentPage} of ${totalPages} (${totalRecords} records)`;

    const prevBtn = document.getElementById("btn-att-prev");
    const nextBtn = document.getElementById("btn-att-next");
    if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;
  },

  openManualModal(eventId, hallTicket, fullName) {
    document.getElementById("manual-att-eventid").value = eventId;
    document.getElementById("manual-att-ht").value = hallTicket;
    document.getElementById("manual-att-name").value = fullName;

    const modalEl = document.getElementById("manual-attendance-modal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  },

  async submitManualAttendance(e) {
    e.preventDefault();

    const eventId = document.getElementById("manual-att-eventid").value;
    const hallTicket = document.getElementById("manual-att-ht").value;
    const fullName = document.getElementById("manual-att-name").value;
    const reason = document.getElementById("manual-att-reason").value.trim() || "Manual Admin Override";

    const user = AuthModule.getCurrentUser();
    const scannedBy = user ? user.fullName + " (Manual)" : "Admin (Manual)";

    App.showLoader(true);

    const result = await ApiService.markAttendance({
      eventId,
      hallTicket,
      fullName,
      scannedBy,
      remarks: reason
    });

    App.showLoader(false);

    if (result.status === "valid") {
      App.showToast("Success", "Manual attendance recorded!", "success");
      const modalEl = document.getElementById("manual-attendance-modal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      this.renderTable();
      DashboardModule.refresh();
    } else {
      App.showToast("Info", result.message, "warning");
    }
  },

  changePage(delta) {
    this.currentPage += delta;
    this.renderTable();
  },

  escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
