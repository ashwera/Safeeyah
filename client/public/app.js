const landing = document.querySelector("#landing");
const chatApp = document.querySelector("#chatApp");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const questionForm = document.querySelector("#questionForm");
const questionInput = document.querySelector("#questionInput");
const sendButton = document.querySelector("#sendButton");
const conversation = document.querySelector("#conversation");
const themeToggle = document.querySelector("#themeToggle");
const journeyButton = document.querySelector("[data-start-journey]");
const roadmapDialog = document.querySelector("#roadmapDialog");

const preferences = {
  responseStyle: "balanced",
  language: "English",
  arabicTerms: true,
  darkMode: localStorage.getItem("safeeyah-theme") === "dark",
};

applyTheme(preferences.darkMode);

journeyButton.addEventListener("click", () => {
  landing.classList.add("is-hidden");
  chatApp.classList.remove("is-hidden");
  questionInput.focus();
});

document.querySelector("[data-open-roadmap]").addEventListener("click", () => {
  roadmapDialog.showModal();
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelector("#settingsButton").addEventListener("click", () => {
  themeToggle.checked = preferences.darkMode;
  settingsDialog.showModal();
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  chatApp.classList.add("is-hidden");
  landing.classList.remove("is-hidden");
  conversation.innerHTML = initialWelcomeMarkup();
  bindSuggestionButtons();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(settingsForm);
  preferences.responseStyle = data.get("responseStyle");
  preferences.language = data.get("language");
  preferences.arabicTerms = data.get("arabicTerms") === "on";
  preferences.darkMode = data.get("darkMode") === "on";
  applyTheme(preferences.darkMode);
  settingsDialog.close();
});

themeToggle.addEventListener("change", () => {
  preferences.darkMode = themeToggle.checked;
  applyTheme(preferences.darkMode);
});

function applyTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  localStorage.setItem("safeeyah-theme", isDark ? "dark" : "light");
}

function initialWelcomeMarkup() {
  return `
    <div class="welcome-message">
      <div class="welcome-ornament">✦</div>
      <p class="eyebrow">Assalamu alaikum</p>
      <h2>What would you like<br />to understand today?</h2>
      <p>Ask a question, and we’ll explore it together with care.</p>
      <div class="suggestions">
        <button>How can I build consistency in prayer?</button>
        <button>What does tawakkul mean in daily life?</button>
        <button>Share a reflection on gratitude</button>
      </div>
    </div>`;
}

function bindSuggestionButtons() {
  document.querySelectorAll(".suggestions button").forEach((button) => {
    button.addEventListener("click", () => {
      questionInput.value = button.textContent;
      questionInput.focus();
    });
  });
}

function addMessage(text, role, extraClass = "") {
  const message = document.createElement("article");
  message.className = `message message-${role} ${extraClass}`.trim();
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  message.appendChild(paragraph);
  conversation.appendChild(message);
  message.scrollIntoView({ behavior: "smooth", block: "end" });
  return message;
}

function addTypingIndicator() {
  const message = document.createElement("article");
  message.className = "message message-assistant typing";
  message.setAttribute("aria-label", "Safeeyah is thinking");
  message.innerHTML = "<span>•</span><span>•</span><span>•</span>";
  conversation.appendChild(message);
  message.scrollIntoView({ behavior: "smooth", block: "end" });
  return message;
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || sendButton.disabled) return;

  const welcome = conversation.querySelector(".welcome-message");
  if (welcome) welcome.remove();

  addMessage(question, "user");
  questionInput.value = "";
  questionInput.style.height = "auto";
  sendButton.disabled = true;
  const typing = addTypingIndicator();

  const preferenceContext =
    `Please respond in ${preferences.language} with a ${preferences.responseStyle} level of detail.` +
    (preferences.arabicTerms
      ? " Include relevant Arabic Islamic terms where helpful."
      : " Avoid Arabic terminology unless essential.");

  try {
    const response = await fetch("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: `${question}\n\nResponse preferences: ${preferenceContext}`,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The response could not be generated.");
    }

    typing.remove();
    addMessage(data.answer, "assistant");
  } catch (error) {
    typing.remove();
    addMessage(
      "I’m sorry, I couldn’t reach the knowledge service just now. Please try again in a moment.",
      "assistant",
      "message-error",
    );
    console.error(error);
  } finally {
    sendButton.disabled = false;
    questionInput.focus();
  }
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 160)}px`;
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    questionForm.requestSubmit();
  }
});

[settingsDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

[roadmapDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

bindSuggestionButtons();
