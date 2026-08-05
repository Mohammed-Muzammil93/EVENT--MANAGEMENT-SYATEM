/**
 * ==========================================================================
 * EXCEL & CSV REPORTS EXPORT MODULE
 * ==========================================================================
 * SheetJS (.xlsx) & CSV report exporter for Registrations & Attendance.
 */

const ReportsModule = {
  async exportRegistrationsExcel() {
    App.showLoader(true);
    try {
      const eventFilter = document.getElementById("reports-event-filter") ? document.getElementById("reports-event-filter").value : "";
      let regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
      if (eventFilter) regs = regs.filter(r => r.eventId === eventFilter);

      if (regs.length === 0) {
        App.showToast("Warning", "No registration records to export!", "warning");
        return;
      }

      const events = await ApiService.getEvents();

      const exportData = regs.map((r, i) => {
        const ev = events.find(e => e.id === r.eventId);
        return {
          "S.No": i + 1,
          "Registration ID": r.registrationId,
          "Event Name": ev ? ev.title : r.eventName,
          "Student Name": r.fullName,
          "Hall Ticket": r.hallTicket,
          "Branch": r.branch,
          "Year": r.year,
          "Section": r.section,
          "Mobile": r.mobile,
          "Email": r.email,
          "Registration Date": new Date(r.registeredAt).toLocaleString()
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");

      XLSX.writeFile(workbook, `Registered_Students_${Date.now()}.xlsx`);
      App.showToast("Success", "Registrations exported to Excel (.xlsx)", "success");
    } catch (err) {
      console.error("Excel export error:", err);
      App.showToast("Error", "Export failed. Please check console.", "danger");
    } finally {
      App.showLoader(false);
    }
  },

  async exportAttendanceExcel(statusType) {
    App.showLoader(true);
    try {
      const eventFilter = document.getElementById("reports-event-filter") ? document.getElementById("reports-event-filter").value : "";
      const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
      const atts = ApiService.getLocal(STORAGE_KEYS.ATTENDANCE, []);
      const events = await ApiService.getEvents();

      let records = regs.map(r => {
        const att = atts.find(a => a.eventId === r.eventId && a.hallTicket.toUpperCase() === r.hallTicket.toUpperCase());
        const ev = events.find(e => e.id === r.eventId);
        return {
          ...r,
          eventName: ev ? ev.title : r.eventName,
          status: att ? "PRESENT" : "ABSENT",
          entryTime: att ? new Date(att.scanTimestamp).toLocaleString() : "N/A",
          scannedBy: att ? att.scannedBy : "N/A"
        };
      });

      if (eventFilter) records = records.filter(r => r.eventId === eventFilter);
      if (statusType) records = records.filter(r => r.status === statusType);

      if (records.length === 0) {
        App.showToast("Warning", "No matching attendance records to export!", "warning");
        return;
      }

      const exportData = records.map((r, i) => ({
        "S.No": i + 1,
        "Registration ID": r.registrationId,
        "Student Name": r.fullName,
        "Hall Ticket": r.hallTicket,
        "Branch": r.branch,
        "Year": r.year,
        "Section": r.section,
        "Event": r.eventName,
        "Status": r.status,
        "Entry Time": r.entryTime,
        "Scanned By": r.scannedBy
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, statusType ? `${statusType}_Students` : "Attendance_Report");

      XLSX.writeFile(workbook, `Attendance_Report_${statusType || 'ALL'}_${Date.now()}.xlsx`);
      App.showToast("Success", "Attendance report exported to Excel (.xlsx)", "success");
    } catch (err) {
      console.error("Attendance export error:", err);
      App.showToast("Error", "Export failed.", "danger");
    } finally {
      App.showLoader(false);
    }
  }
};
