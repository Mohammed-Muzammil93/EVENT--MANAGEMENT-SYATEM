/**
 * ==========================================================================
 * REGISTRATION MODULE
 * ==========================================================================
 */

const RegistrationModule = {
  selectedPhotoBase64: "",

  init() {
    this.bindPhotoUpload();
  },

  bindPhotoUpload() {
    const photoInput = document.getElementById("reg-photo-input");
    if (photoInput) {
      photoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            App.showToast("Warning", "Photo size should be less than 2MB", "warning");
            return;
          }
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.selectedPhotoBase64 = evt.target.result;
            const preview = document.getElementById("reg-photo-preview");
            if (preview) {
              preview.src = evt.target.result;
              preview.classList.remove("d-none");
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  },

  async handleFormSubmit(e) {
    e.preventDefault();

    const fullName = document.getElementById("reg-fullname").value.trim();
    const hallTicket = document.getElementById("reg-htno").value.trim().toUpperCase();
    const branch = document.getElementById("reg-branch").value;
    const year = document.getElementById("reg-year").value;
    const section = document.getElementById("reg-section").value;
    const mobile = document.getElementById("reg-mobile").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const eventId = document.getElementById("reg-event-select").value;

    // Validation
    if (!fullName || !hallTicket || !branch || !year || !section || !mobile || !email || !eventId) {
      App.showToast("Validation Error", "Please fill in all required fields!", "danger");
      return;
    }

    // Hall Ticket Regex check
    const htRegex = /^[0-9A-Z]{8,12}$/i;
    if (!htRegex.test(hallTicket)) {
      App.showToast("Invalid Input", "Please enter a valid Hall Ticket Number (e.g. 21011A0501)", "danger");
      return;
    }

    // Phone check
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(mobile)) {
      App.showToast("Invalid Mobile", "Please enter a valid 10-digit mobile number", "danger");
      return;
    }

    // Email check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      App.showToast("Invalid Email", "Please enter a valid email address", "danger");
      return;
    }

    // Get Event Name
    const events = await ApiService.getEvents();
    const targetEvent = events.find(ev => ev.id === eventId);
    const eventName = targetEvent ? targetEvent.title : "College Event";

    App.showLoader(true);

    const result = await ApiService.registerStudent({
      fullName,
      hallTicket,
      branch,
      year,
      section,
      mobile,
      email,
      eventId,
      eventName,
      photo: this.selectedPhotoBase64
    });

    App.showLoader(false);

    if (result.status === "duplicate") {
      App.showToast("Duplicate Registration", result.message, "warning");
      return;
    }

    if (result.status === "success") {
      App.showToast("Success", "Registration completed! Generating Event ID Card...", "success");
      
      // Reset form
      document.getElementById("student-reg-form").reset();
      this.selectedPhotoBase64 = "";
      const preview = document.getElementById("reg-photo-preview");
      if (preview) preview.classList.add("d-none");

      // Open ID Card Generator Modal with accurate data
      CardGenerator.showModal(result.record, targetEvent);
    }
  }
};
