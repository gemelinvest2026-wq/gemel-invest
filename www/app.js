const messageBox = document.getElementById('messageBox');
const continueBtn = document.getElementById('continueBtn');
const aboutBtn = document.getElementById('aboutBtn');

function showMessage(message) {
  messageBox.textContent = message;
  messageBox.classList.remove('hidden');
}

continueBtn?.addEventListener('click', () => {
  showMessage('השלב הבא הוא לחבר את מסכי המערכת שלך לתוך האפליקציה. ברגע שתחליף את קבצי ה־www בגרסת המערכת שלך, נתחיל לראות את ה־CRM שלך כמובייל.');
});

aboutBtn?.addEventListener('click', () => {
  showMessage('בגרסה הזו יש שלד אפליקציה ראשוני: מסך פתיחה פרימיום, הגדרות Capacitor, וקבצים מוכנים להמשך חיבור ל־Android ול־iPhone.');
});
