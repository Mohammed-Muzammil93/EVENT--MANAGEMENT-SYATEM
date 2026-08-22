/**
 * ==========================================================================
 * ANALYTICS & CHART.JS MODULE
 * ==========================================================================
 */

const AnalyticsModule = {
  charts: {},

  async initCharts() {
    this.renderBranchChart();
    this.renderYearChart();
    this.renderEventComparisonChart();
  },

  async renderBranchChart() {
    const canvas = document.getElementById("chart-branch-wise");
    if (!canvas) return;

    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const branches = ["CSE", "ECE", "EEE", "MECH", "CIVIL", "IT", "AIML", "DS"];
    
    const counts = branches.map(b => regs.filter(r => r.branch && r.branch.toUpperCase() === b).length);

    if (this.charts.branch) this.charts.branch.destroy();

    this.charts.branch = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: branches,
        datasets: [{
          label: 'Registrations by Branch',
          data: counts,
          backgroundColor: [
            'rgba(99, 102, 241, 0.7)',
            'rgba(6, 182, 212, 0.7)',
            'rgba(168, 85, 247, 0.7)',
            'rgba(236, 72, 153, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(239, 68, 68, 0.7)'
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  },

  async renderYearChart() {
    const canvas = document.getElementById("chart-year-wise");
    if (!canvas) return;

    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const years = ["I", "II", "III", "IV"];
    const counts = years.map(y => regs.filter(r => r.year === y).length);

    if (this.charts.year) this.charts.year.destroy();

    this.charts.year = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ["1st Year", "2nd Year", "3rd Year", "4th Year"],
        datasets: [{
          data: counts,
          backgroundColor: ['#6366f1', '#06b6d4', '#a855f7', '#10b981']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8' } }
        }
      }
    });
  },

  async renderEventComparisonChart() {
    const canvas = document.getElementById("chart-event-wise");
    if (!canvas) return;

    const events = await ApiService.getEvents();
    const regs = ApiService.getLocal(STORAGE_KEYS.REGISTRATIONS, []);
    const atts = ApiService.getLocal(STORAGE_KEYS.ATTENDANCE, []);

    const labels = events.map(e => e.title);
    const regCounts = events.map(e => regs.filter(r => r.eventId === e.id).length);
    const attCounts = events.map(e => atts.filter(a => a.eventId === e.id && a.status === "VALID").length);

    if (this.charts.eventComp) this.charts.eventComp.destroy();

    this.charts.eventComp = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Registrations',
            data: regCounts,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Attendance Present',
            data: attCounts,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8' } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
};
