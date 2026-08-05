/**
 * ==========================================================================
 * SMART EVENT ENTRY MANAGEMENT SYSTEM - GOOGLE APPS SCRIPT BACKEND
 * ==========================================================================
 * 
 * Instructions to Deploy:
 * 1. Open Google Sheets -> Extensions -> Apps Script.
 * 2. Paste this entire code into `Code.gs`.
 * 3. Click "Deploy" -> "New Deployment".
 * 4. Select type: "Web App".
 * 5. Description: "Smart Event Entry API v1.0".
 * 6. Execute as: "Me" (your Google account).
 * 7. Who has access: "Anyone" (allows frontend to call API without CORS block).
 * 8. Click "Deploy", authorize permissions, and copy the Web App URL.
 * 9. Paste the Web App URL into the App Settings in the Web Dashboard.
 * ==========================================================================
 */

const SHEET_NAMES = {
  EVENTS: "Events",
  REGISTRATIONS: "Registrations",
  ATTENDANCE: "Attendance",
  VOLUNTEERS: "Volunteers",
  LOGS: "System_Logs"
};

/**
 * HTTP GET Router
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getDashboardStats";
    const eventId = e.parameter.eventId || "";
    let data;

    switch (action) {
      case "getEvents":
        data = getEventsData();
        break;
      case "getRegistrations":
        data = getRegistrationsData(eventId);
        break;
      case "getAttendance":
        data = getAttendanceData(eventId);
        break;
      case "getVolunteers":
        data = getVolunteersData();
        break;
      case "getDashboardStats":
        data = calculateDashboardStats(eventId);
        break;
      case "ping":
        data = { status: "success", message: "API is online", timestamp: new Date() };
        break;
      default:
        data = { status: "error", message: "Invalid action parameter" };
    }

    return createJsonResponse(data);
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * HTTP POST Router
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    let result;

    setupSpreadsheet(); // Ensure headers exist

    switch (action) {
      case "registerStudent":
        result = handleStudentRegistration(postData.data);
        break;
      case "markAttendance":
        result = handleMarkAttendance(postData.data);
        break;
      case "createEvent":
        result = handleCreateEvent(postData.data);
        break;
      case "updateEvent":
        result = handleUpdateEvent(postData.data);
        break;
      case "deleteEvent":
        result = handleDeleteEvent(postData.eventId);
        break;
      case "addVolunteer":
        result = handleAddVolunteer(postData.data);
        break;
      case "removeVolunteer":
        result = handleRemoveVolunteer(postData.volunteerId);
        break;
      case "login":
        result = handleUserLogin(postData.credentials);
        break;
      default:
        result = { status: "error", message: "Unknown POST action: " + action };
    }

    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Helper to return JSON Response with CORS Headers
 */
function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Initialize Spreadsheet Sheets & Headers if missing
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = [
    {
      name: SHEET_NAMES.EVENTS,
      headers: ["Event ID", "Event Title", "Date", "Time", "Venue", "Category", "Status", "Max Seats", "Created At"]
    },
    {
      name: SHEET_NAMES.REGISTRATIONS,
      headers: ["Registration ID", "Event ID", "Full Name", "Hall Ticket", "Branch", "Year", "Section", "Mobile", "Email", "Photo Base64", "QR Payload", "Registered At"]
    },
    {
      name: SHEET_NAMES.ATTENDANCE,
      headers: ["Attendance ID", "Event ID", "Registration ID", "Hall Ticket", "Full Name", "Branch", "Entry Status", "Scanned By", "Scan Timestamp", "Remarks"]
    },
    {
      name: SHEET_NAMES.VOLUNTEERS,
      headers: ["Volunteer ID", "Username", "Password", "Full Name", "Assigned Event ID", "Mobile", "Status", "Created At"]
    },
    {
      name: SHEET_NAMES.LOGS,
      headers: ["Log ID", "Action", "Performed By", "Details", "Timestamp"]
    }
  ];

  schemas.forEach(schema => {
    let sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
      sheet.appendRow(schema.headers);
      sheet.getRange(1, 1, 1, schema.headers.length).setFontWeight("bold").setBackground("#4F46E5").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  });
}

/**
 * Handle Student Registration & Prevent Duplicates
 */
function handleStudentRegistration(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regSheet = ss.getSheetByName(SHEET_NAMES.REGISTRATIONS);
  const regValues = regSheet.getDataRange().getValues();

  // Check duplicate Hall Ticket for the SAME Event
  for (let i = 1; i < regValues.length; i++) {
    const existingEventId = regValues[i][1];
    const existingHT = regValues[i][3];
    if (existingEventId === data.eventId && existingHT.toUpperCase() === data.hallTicket.toUpperCase()) {
      return {
        status: "duplicate",
        message: "Student with Hall Ticket " + data.hallTicket + " is ALREADY registered for this event!"
      };
    }
  }

  const regId = "REG-" + data.eventId.replace("EVT-", "") + "-" + Math.random().toString(36).substr(2, 6).toUpperCase();
  const timestamp = new Date().toISOString();

  // Construct secure payload for QR
  const qrPayload = JSON.stringify({
    regId: regId,
    eventId: data.eventId,
    ht: data.hallTicket,
    name: data.fullName,
    branch: data.branch,
    year: data.year,
    sig: "SEC-" + Math.random().toString(36).substr(2, 8).toUpperCase()
  });

  const rowData = [
    regId,
    data.eventId,
    data.fullName,
    data.hallTicket.toUpperCase(),
    data.branch,
    data.year,
    data.section,
    data.mobile,
    data.email,
    data.photo || "",
    qrPayload,
    timestamp
  ];

  regSheet.appendRow(rowData);

  // Send Confirmation Email automatically via GmailApp / MailApp
  try {
    sendRegistrationEmail(data.email, data.fullName, data.eventName, regId, data.hallTicket, qrPayload);
  } catch (emailErr) {
    Logger.log("Email error: " + emailErr.toString());
  }

  return {
    status: "success",
    message: "Registration successful!",
    registrationId: regId,
    qrPayload: qrPayload,
    registeredAt: timestamp
  };
}

/**
 * Handle Mark Attendance
 */
function handleMarkAttendance(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attSheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  const attValues = attSheet.getDataRange().getValues();

  // Check if student already marked entered for this event
  for (let i = 1; i < attValues.length; i++) {
    const eventId = attValues[i][1];
    const ht = attValues[i][3];
    const status = attValues[i][6];
    if (eventId === data.eventId && ht.toUpperCase() === data.hallTicket.toUpperCase() && status === "VALID") {
      return {
        status: "already_entered",
        message: "Student already entered!",
        entryTime: attValues[i][8],
        scannedBy: attValues[i][7]
      };
    }
  }

  const attId = "ATT-" + Math.random().toString(36).substr(2, 8).toUpperCase();
  const scanTime = new Date().toISOString();

  attSheet.appendRow([
    attId,
    data.eventId,
    data.registrationId || "MANUAL",
    data.hallTicket.toUpperCase(),
    data.fullName,
    data.branch || "N/A",
    "VALID",
    data.scannedBy || "Admin",
    scanTime,
    data.remarks || "QR Camera Scan"
  ]);

  return {
    status: "valid",
    message: "Attendance marked successfully!",
    attendanceId: attId,
    entryTime: scanTime,
    studentName: data.fullName,
    hallTicket: data.hallTicket
  };
}

/**
 * Handle Event Creation
 */
function handleCreateEvent(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.EVENTS);
  const eventId = "EVT-" + Date.now().toString(36).toUpperCase();

  sheet.appendRow([
    eventId,
    data.title,
    data.date,
    data.time,
    data.venue,
    data.category || "General",
    "Open",
    data.maxSeats || 500,
    new Date().toISOString()
  ]);

  return { status: "success", message: "Event created successfully!", eventId: eventId };
}

/**
 * Get All Events Data
 */
function getEventsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.EVENTS);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headers = rows[0];
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    result.push({
      id: rows[i][0],
      title: rows[i][1],
      date: rows[i][2],
      time: rows[i][3],
      venue: rows[i][4],
      category: rows[i][5],
      status: rows[i][6],
      maxSeats: rows[i][7],
      createdAt: rows[i][8]
    });
  }
  return result;
}

/**
 * Get Registrations for an Event
 */
function getRegistrationsData(eventId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.REGISTRATIONS);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (!eventId || rows[i][1] === eventId) {
      result.push({
        registrationId: rows[i][0],
        eventId: rows[i][1],
        fullName: rows[i][2],
        hallTicket: rows[i][3],
        branch: rows[i][4],
        year: rows[i][5],
        section: rows[i][6],
        mobile: rows[i][7],
        email: rows[i][8],
        qrPayload: rows[i][10],
        registeredAt: rows[i][11]
      });
    }
  }
  return result;
}

/**
 * Get Attendance Records
 */
function getAttendanceData(eventId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (!eventId || rows[i][1] === eventId) {
      result.push({
        attendanceId: rows[i][0],
        eventId: rows[i][1],
        registrationId: rows[i][2],
        hallTicket: rows[i][3],
        fullName: rows[i][4],
        branch: rows[i][5],
        status: rows[i][6],
        scannedBy: rows[i][7],
        scanTimestamp: rows[i][8],
        remarks: rows[i][9]
      });
    }
  }
  return result;
}

/**
 * Dashboard Statistics Calculator
 */
function calculateDashboardStats(eventId) {
  const events = getEventsData();
  const regs = getRegistrationsData(eventId);
  const atts = getAttendanceData(eventId);

  const totalRegs = regs.length;
  const presentCount = atts.filter(a => a.status === "VALID").length;
  const absentCount = Math.max(0, totalRegs - presentCount);
  const attPercentage = totalRegs > 0 ? ((presentCount / totalRegs) * 100).toFixed(1) : "0.0";

  return {
    totalEvents: events.length,
    totalRegistrations: totalRegs,
    todayAttendance: presentCount,
    present: presentCount,
    absent: absentCount,
    attendancePercentage: attPercentage
  };
}

/**
 * Automated Confirmation Email Dispatcher
 */
function sendRegistrationEmail(email, name, eventName, regId, hallTicket, qrPayload) {
  if (!email) return;

  const subject = "Registration Confirmed: " + eventName + " [ID: " + regId + "]";
  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
      <h2 style="color: #4F46E5;">Registration Confirmation</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>You have successfully registered for <strong>${eventName}</strong>.</p>
      <div style="background: #ffffff; padding: 15px; border-radius: 8px; border-left: 4px solid #4F46E5; margin: 15px 0;">
        <p><strong>Registration ID:</strong> ${regId}</p>
        <p><strong>Hall Ticket Number:</strong> ${hallTicket}</p>
        <p><strong>Event:</strong> ${eventName}</p>
      </div>
      <p>Please log in to the student portal to download your digital Event Pass ID Card with QR Code before entering the venue.</p>
      <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b;">Smart Event Entry Management System &copy; ${new Date().getFullYear()}</p>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: bodyHtml
  });
}
