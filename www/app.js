const insuranceData = {
  health: {
    label: 'בריאות',
    subtitle: 'כיסויים רפואיים ומוצרי בריאות',
    companies: [
      { name: 'הראל', short: 'HR', note: 'בריאות פרט' },
      { name: 'כלל', short: 'CL', note: 'כיסוי רפואי' },
      { name: 'הפניקס', short: 'PH', note: 'בריאות חכם' },
      { name: 'מנורה', short: 'MN', note: 'מסלולי בריאות' }
    ]
  },
  risks: {
    label: 'סיכונים',
    subtitle: 'ריסק, חיים ואובדן כושר',
    companies: [
      { name: 'מגדל', short: 'MG', note: 'ביטוח חיים' },
      { name: 'הכשרה', short: 'HK', note: 'ריסק וחיים' },
      { name: 'הראל', short: 'HR', note: 'הגנות סיכון' },
      { name: 'איילון', short: 'AY', note: 'מסלולי סיכון' }
    ]
  },
  elementary: {
    label: 'אלמנטרי',
    subtitle: 'רכב, דירה, עסק ותכולה',
    companies: [
      { name: 'הפניקס', short: 'PH', note: 'רכב ודירה' },
      { name: 'מנורה', short: 'MN', note: 'פתרונות אלמנטרי' },
      { name: 'איי.אי.ג׳י', short: 'AIG', note: 'ביטוח ישיר' },
      { name: 'ביטוח ישיר', short: '9', note: 'רכב ודירה' },
      { name: 'כלל', short: 'CL', note: 'ביטוח כללי' },
      { name: 'הראל', short: 'HR', note: 'רכוש ועסק' }
    ]
  },
  pension: {
    label: 'פנסיה',
    subtitle: 'חיסכון, פנסיה וגמל',
    companies: [
      { name: 'מנורה', short: 'MN', note: 'פנסיה וגמל' },
      { name: 'מגדל', short: 'MG', note: 'חיסכון ארוך טווח' },
      { name: 'הראל', short: 'HR', note: 'פתרונות פנסיוניים' },
      { name: 'הפניקס', short: 'PH', note: 'קרנות וחיסכון' }
    ]
  }
};

const welcomeScreen = document.getElementById('welcomeScreen');
const quoteScreen = document.getElementById('quoteScreen');
const startBtn = document.getElementById('startBtn');
const backBtn = document.getElementById('backBtn');
const categoryGrid = document.getElementById('categoryGrid');
const companySection = document.getElementById('companySection');
const companyGrid = document.getElementById('companyGrid');
const selectedCategoryBadge = document.getElementById('selectedCategoryBadge');

let selectedCategory = null;
let selectedCompany = null;

function switchScreen(target) {
  [welcomeScreen, quoteScreen].forEach((screen) => screen.classList.remove('screen-active'));
  target.classList.add('screen-active');
}

function renderCategories() {
  categoryGrid.innerHTML = Object.entries(insuranceData)
    .map(([key, item]) => `
      <button class="choice-card ${selectedCategory === key ? 'selected' : ''}" data-category="${key}" type="button">
        <div class="choice-title">${item.label}</div>
        <div class="choice-subtitle">${item.subtitle}</div>
      </button>
    `)
    .join('');

  categoryGrid.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.category;
      selectedCompany = null;
      renderCategories();
      renderCompanies();
    });
  });
}

function renderCompanies() {
  if (!selectedCategory) {
    companySection.classList.add('hidden');
    companyGrid.innerHTML = '';
    selectedCategoryBadge.textContent = '';
    return;
  }

  const item = insuranceData[selectedCategory];
  selectedCategoryBadge.textContent = item.label;
  companySection.classList.remove('hidden');
  companyGrid.innerHTML = item.companies
    .map((company) => `
      <button class="company-card ${selectedCompany === company.name ? 'selected' : ''}" data-company="${company.name}" type="button">
        <div class="company-logo">${company.short}</div>
        <div class="company-name">${company.name}</div>
        <div class="company-note">${company.note}</div>
      </button>
    `)
    .join('');

  companyGrid.querySelectorAll('[data-company]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCompany = btn.dataset.company;
      renderCompanies();
    });
  });
}

startBtn.addEventListener('click', () => switchScreen(quoteScreen));
backBtn.addEventListener('click', () => switchScreen(welcomeScreen));

renderCategories();
renderCompanies();
