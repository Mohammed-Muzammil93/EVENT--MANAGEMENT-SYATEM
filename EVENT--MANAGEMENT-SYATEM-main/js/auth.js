/**
 * ==========================================================================
 * AUTHENTICATION & ROLE MANAGEMENT MODULE
 * ==========================================================================
 */

const AuthModule = {
  DEFAULT_ADMIN: {
    username: "ADMIN123",
    password: "ADMINSICET",
    fullName: "System Administrator",
    role: "admin"
  },

  getCurrentUser() {
    const session = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return session ? JSON.parse(session) : null;
  },

  setCurrentUser(user) {
    if (user) {
      sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  },

  /**
   * Login handler
   */
  login(username, password) {
    // 1. Check Admin
    const adminConfig = ApiService.getLocal("smart_event_admin_config", this.DEFAULT_ADMIN);
    const isAdminUser = username.trim().toUpperCase() === adminConfig.username.toUpperCase();
    const isAdminPass = password === adminConfig.password;

    if (isAdminUser && isAdminPass) {
      const user = {
        username: adminConfig.username,
        fullName: adminConfig.fullName,
        role: "admin"
      };
      this.setCurrentUser(user);
      return { success: true, user: user, message: "Welcome back, Admin!" };
    }

    // 2. Check Volunteers
    const volunteers = ApiService.getLocal(STORAGE_KEYS.VOLUNTEERS, this.getDefaultVolunteers());
    const volunteer = volunteers.find(v => v.username.trim().toUpperCase() === username.trim().toUpperCase() && v.password === password && v.status === "Active");

    if (volunteer) {
      const user = {
        username: volunteer.username,
        fullName: volunteer.fullName,
        role: "volunteer",
        assignedEventId: volunteer.assignedEventId,
        volunteerId: volunteer.id
      };
      this.setCurrentUser(user);
      return { success: true, user: user, message: `Welcome, Volunteer ${user.fullName}!` };
    }

    return { success: false, message: "Invalid username or password!" };
  },

  logout() {
    this.setCurrentUser(null);
  },

  /**
   * Volunteer CRUD for Admin
   */
  getVolunteers() {
    return ApiService.getLocal(STORAGE_KEYS.VOLUNTEERS, this.getDefaultVolunteers());
  },

  addVolunteer(volunteerData) {
    const volunteers = this.getVolunteers();
    if (volunteers.some(v => v.username.toLowerCase() === volunteerData.username.toLowerCase())) {
      return { success: false, message: "Username already exists!" };
    }

    const newVol = {
      id: "VOL-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      username: volunteerData.username.trim(),
      password: volunteerData.password || "VOL123456",
      fullName: volunteerData.fullName.trim(),
      assignedEventId: volunteerData.assignedEventId || "",
      mobile: volunteerData.mobile || "",
      status: "Active",
      createdAt: new Date().toISOString()
    };

    volunteers.push(newVol);
    ApiService.saveLocal(STORAGE_KEYS.VOLUNTEERS, volunteers);
    return { success: true, message: "Volunteer added successfully!", volunteer: newVol };
  },

  removeVolunteer(id) {
    let volunteers = this.getVolunteers();
    volunteers = volunteers.filter(v => v.id !== id);
    ApiService.saveLocal(STORAGE_KEYS.VOLUNTEERS, volunteers);
    return { success: true, message: "Volunteer removed." };
  },

  resetVolunteerPassword(id, newPassword) {
    const volunteers = this.getVolunteers();
    const vol = volunteers.find(v => v.id === id);
    if (vol) {
      vol.password = newPassword;
      ApiService.saveLocal(STORAGE_KEYS.VOLUNTEERS, volunteers);
      return { success: true, message: "Password reset successfully!" };
    }
    return { success: false, message: "Volunteer not found." };
  },

  getDefaultVolunteers() {
    return [
      {
        id: "VOL-001",
        username: "VOLUNTEER18",
        password: "VOL123456",
        fullName: "Event Volunteer Team",
        assignedEventId: "",
        mobile: "9876543210",
        status: "Active",
        createdAt: "2026-08-01T10:00:00Z"
      }
    ];
  }
};
